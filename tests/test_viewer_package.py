"""Real deterministic application package and exact-source release staging."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build_viewer_package import FILES, PREFIX, archive_viewer
from prepare_release import prepare


class ViewerPackageTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory) / 'source'
        for name in [*FILES, 'package.json', 'vendor/agent-file-board/.agent-board/CONVENTION.md',
                     'scripts/build_demo.py', 'scripts/build_viewer_package.py', 'docs/guides/DEMO.md',
                     'CHANGELOG.md']:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        shutil.copytree(ROOT / 'licenses', root / 'licenses')
        # Poison outside the fixed application inventory must never be included.
        for name in ['.agent-board/private/keys.json', 'demo-board/rooms/private.txt', '.git/config', 'secret.txt']:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('PRIVATE SENTINEL')
        return root

    def test_real_archive_is_reproducible_closed_and_data_free(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.fixture(directory)
            first, second = Path(directory) / 'first.zip', Path(directory) / 'second.zip'
            manifest = archive_viewer(root, first)
            archive_viewer(root, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                expected = {PREFIX + '/' + row['path'] for row in manifest['files']} | {PREFIX + '/package-manifest.json'}
                self.assertEqual(set(archive.namelist()), expected)
                self.assertEqual(len(archive.namelist()), len(expected))
                for row in manifest['files']:
                    raw = archive.read(PREFIX + '/' + row['path'])
                    self.assertEqual(len(raw), row['size'])
                    self.assertEqual(hashlib.sha256(raw).hexdigest(), row['sha256'])
                    self.assertNotIn(b'PRIVATE SENTINEL', raw)
                self.assertEqual(json.loads(archive.read(PREFIX + '/package-manifest.json')), manifest)
                archive.extractall(Path(directory) / 'extracted')
            self.assertEqual((Path(directory) / 'extracted' / PREFIX / 'board.html').read_bytes(), (ROOT / 'board.html').read_bytes())
            self.assertEqual(manifest['viewerVersion'], json.loads((root / 'package.json').read_text())['version'])
            self.assertIn('scripts/voice_helper.py', {r['path'] for r in manifest['files']})
            self.assertIn('UPDATE.md', {r['path'] for r in manifest['files']})
            with self.assertRaises(FileExistsError):
                archive_viewer(root, first)
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_missing_symlink_unsafe_license_and_version_mismatch_fail_before_output(self):
        for case in ['missing', 'symlink', 'directory_symlink', 'license', 'version']:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as directory:
                root = self.fixture(directory)
                if case == 'missing':
                    (root / 'scripts/voice-helper.html').unlink()
                elif case == 'symlink':
                    (root / 'LICENSE').unlink()
                    (root / 'LICENSE').symlink_to(ROOT / 'LICENSE')
                elif case == 'directory_symlink':
                    shutil.rmtree(root / 'licenses')
                    (root / 'licenses').symlink_to(ROOT / 'licenses', target_is_directory=True)
                elif case == 'license':
                    (root / 'licenses/private.json').write_text('PRIVATE SENTINEL')
                else:
                    (root / 'package.json').write_text('{"version":"99.0.0"}')
                output = Path(directory) / 'rejected.zip'
                with self.assertRaises((ValueError, OSError)):
                    archive_viewer(root, output)
                self.assertFalse(output.exists())

    def test_package_release_uses_tested_source_builder_and_hashes_every_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self.fixture(directory)
            (root / 'CHANGELOG.md').write_text('## 2.11.4\nPackage release notes\n')
            (root / 'scripts/build_demo.py').write_text("import sys\nfrom pathlib import Path\nPath(sys.argv[sys.argv.index('--output')+1]).write_bytes(b'exact demo')\n")
            (root / 'scripts/build_viewer_package.py').write_text("import sys\nfrom pathlib import Path\nPath(sys.argv[sys.argv.index('--output')+1]).write_bytes(b'exact tested package builder')\n")
            output = Path(directory) / 'release'
            prepare(root, 'v2.11.4', output)
            self.assertEqual((output / 'agent-file-board-viewer.zip').read_bytes(), b'exact tested package builder')
            rows = [line.split('  ') for line in (output / 'SHA256SUMS').read_text().splitlines()]
            self.assertEqual({name for _, name in rows}, {p.name for p in output.iterdir()} - {'SHA256SUMS', 'notes.md'})
            for digest, name in rows:
                self.assertEqual(digest, hashlib.sha256((output / name).read_bytes()).hexdigest())
            (root / 'scripts/build_viewer_package.py').write_text('raise SystemExit(1)')
            import subprocess
            with self.assertRaises(subprocess.CalledProcessError):
                prepare(root, 'v2.11.4', Path(directory) / 'failed')
