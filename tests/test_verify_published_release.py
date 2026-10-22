"""Native Git/source identity and adversarial downloaded-asset verification."""
import hashlib
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from verify_published_release import verify, extract_viewer, zip_payload
from test_release_check import make_repo, git


class PublishedReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = make_repo(pkg='2.11.4', viewer='2.11.4', conv='2.11.1', sub_tag='v2.11.1')
        self.addCleanup(shutil.rmtree, self.source)
        git(self.source, 'init', '-q')
        git(self.source, 'add', '-A')
        git(self.source, 'commit', '-qm', 'source')
        git(self.source, 'tag', 'v2.11.4')
        self.downloads = self.root / 'downloads'
        self.build(self.source, 'v2.11.4', self.downloads)
        self.metadata = {'tag_name': 'v2.11.4', 'draft': False, 'prerelease': False,
                         'assets': [{'name': p.name} for p in self.downloads.iterdir()]}

    def checksums(self, folder):
        (folder / 'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n'
            for p in sorted(folder.iterdir()) if p.name != 'SHA256SUMS'))

    def build(self, source, tag, output):
        output.mkdir()
        (output / 'board.html').write_bytes((source / 'board.html').read_bytes())
        for name, entries in [('agent-file-board-demo.zip', {'demo/example.txt': b'demo'}),
                              ('agent-file-board-viewer.zip', {'agent-file-board-viewer/board.html': (source / 'board.html').read_bytes()})]:
            with zipfile.ZipFile(output / name, 'w') as z:
                for entry, raw in entries.items():
                    z.writestr(entry, raw)
        self.checksums(output)

    def verify(self, **kwargs):
        return verify(self.source, self.downloads, 'v2.11.4', self.metadata, build=self.build, **kwargs)

    def test_matching_source_and_complete_download_extract_only_verified_bytes(self):
        self.assertEqual(self.verify()['result'], 'passed')
        output = self.root / 'viewer'
        extract_viewer(self.downloads, output)
        self.assertEqual((output / 'board.html').read_bytes(), (self.source / 'board.html').read_bytes())
        with self.assertRaises(FileExistsError):
            extract_viewer(self.downloads, output)

    def test_wrong_tested_commit_and_dirty_source_refuse(self):
        with self.assertRaisesRegex(ValueError, 'commit mismatch'):
            self.verify(commit='f'*40)
        (self.source / 'board.html').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'modified'):
            self.verify()

    def test_source_change_during_rebuild_refuses(self):
        def moving_source(source, tag, output):
            self.build(source, tag, output)
            (source / 'board.html').write_text('changed during verification')
        with self.assertRaisesRegex(ValueError, 'changed during verification'):
            verify(self.source, self.downloads, 'v2.11.4', self.metadata, build=moving_source)

    def test_unpublished_wrong_tag_and_prerelease_metadata_refuse(self):
        for key, value in [('tag_name', 'v2.11.3'), ('draft', True), ('prerelease', True), ('draft', None)]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                verify(self.source, self.downloads, 'v2.11.4', dict(self.metadata, **{key: value}), build=self.build)

    def test_extra_missing_and_duplicate_published_inventory_refuse(self):
        for assets in [self.metadata['assets'][:-1], self.metadata['assets']+[{'name':'extra'}], self.metadata['assets']*2, None]:
            with self.subTest(assets=assets), self.assertRaises(ValueError):
                verify(self.source, self.downloads, 'v2.11.4', dict(self.metadata, assets=assets), build=self.build)
        (self.downloads / 'extra').write_text('extra')
        with self.assertRaisesRegex(ValueError, 'download inventory'):
            self.verify()
        (self.downloads / 'extra').unlink()
        (self.downloads / 'board.html').unlink()
        with self.assertRaisesRegex(ValueError, 'download inventory'):
            self.verify()

    def test_changed_payload_refuses_even_with_recomputed_release_checksums(self):
        for name in ['board.html', 'agent-file-board-viewer.zip', 'agent-file-board-demo.zip']:
            with self.subTest(name=name):
                original = (self.downloads / name).read_bytes()
                if name.endswith('.zip'):
                    with zipfile.ZipFile(self.downloads / name, 'w') as z:
                        z.writestr('changed.txt', b'tampered')
                else:
                    (self.downloads / name).write_bytes(b'tampered')
                self.checksums(self.downloads)
                with self.assertRaisesRegex(ValueError, 'differs from tagged source'):
                    self.verify()
                (self.downloads / name).write_bytes(original)
                self.checksums(self.downloads)

    def test_missing_duplicate_and_wrong_checksums_refuse(self):
        path = self.downloads / 'SHA256SUMS'
        original = path.read_text()
        for changed in ['', original+original, original.replace(original[:64], '0'*64, 1), original+'not a checksum\n']:
            path.write_text(changed)
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                self.verify()

    def test_unsafe_duplicate_directory_and_symlink_zip_entries_refuse(self):
        for name in ['../escape', '/absolute', 'a\\escape', 'empty/']:
            with zipfile.ZipFile(self.root / 'bad.zip', 'w') as z:
                z.writestr(name, b'bad')
            with self.subTest(name=name), self.assertRaises(ValueError):
                zip_payload(self.root / 'bad.zip')
        for kind in ['duplicate', 'symlink']:
            with zipfile.ZipFile(self.root / 'bad.zip', 'w') as z:
                if kind == 'duplicate':
                    z.writestr('same', b'a')
                    z.writestr('same', b'b')
                else:
                    info = zipfile.ZipInfo('link')
                    info.external_attr = 0o120777 << 16
                    z.writestr(info, b'../../escape')
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                zip_payload(self.root / 'bad.zip')

    def test_compression_can_differ_but_payload_and_download_checksum_must_match(self):
        path = self.downloads / 'agent-file-board-viewer.zip'
        payload = zip_payload(path)
        with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
            for name, raw in payload.items():
                z.writestr(name, raw)
        self.checksums(self.downloads)
        self.assertEqual(self.verify()['result'], 'passed')


if __name__ == '__main__':
    unittest.main()
