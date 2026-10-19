"""Distribution contract: real CLI validation, exact inputs, deterministic archive."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build_demo import PREFIX, archive_demo, build_demo, cli


class DemoTests(unittest.TestCase):
    def test_archive_is_reproducible_complete_valid_and_contains_only_public_fixtures(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            first, second = directory / 'one.zip', directory / 'two.zip'
            archive_demo(ROOT, first)
            archive_demo(ROOT, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                names = archive.namelist()
                self.assertEqual(len(names), len(set(names)))
                self.assertTrue(all(name.startswith(PREFIX + '/') and '..' not in Path(name).parts for name in names))
                self.assertFalse(any(any(x in Path(name).parts for x in ('external-state', 'state', 'presence', '.agent-context', '__pycache__', '.git')) for name in names))
                self.assertEqual(archive.read(PREFIX + '/board.html'), (ROOT / 'board.html').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/README.md'), (ROOT / 'docs/DEMO.md').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/LICENSE'), (ROOT / 'LICENSE').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/licenses/dracula-MIT.txt'), (ROOT / 'licenses/dracula-MIT.txt').read_bytes())
                archive.extractall(directory / 'extracted')
            package = directory / 'extracted' / PREFIX
            board = package / 'demo-board'
            cli(ROOT, 'validate', '--path', board)
            manifest = json.loads((package / 'demo-manifest.json').read_text())
            expected = json.loads((ROOT / 'vendor/agent-file-board/openui-upstream.json').read_text())['boardLibrary']['implementedTypes']
            self.assertEqual(set(manifest['componentTypes']), set(expected))
            self.assertEqual(len(expected), 34)
            self.assertEqual(len(manifest['formFieldTypes']), 11)
            self.assertEqual(manifest['formTopics'], ['T011','T012'])
            self.assertEqual(manifest['workflowTopics'], ['T013','T014'])
            self.assertEqual(manifest['formVersions'], [2,3])
            self.assertEqual(len(manifest['offlineWorkflows']),5)
            self.assertEqual(manifest['offlineTools'], ['answer-review','authoring-preview','draft-manager','authoring-drafts','visual-form-builder'])
            self.assertEqual(manifest['agentRoundtripTopic'],'T015')
            self.assertEqual((package / manifest['draftExample']).read_bytes(), (ROOT / 'docs/examples/drafts/demo-workflow-draft.json').read_bytes())
            self.assertEqual((package / manifest['authoringExample']).read_bytes(), (ROOT / 'docs/examples/drafts/authoring-workflow.json').read_bytes())
            self.assertEqual((package / manifest['workflowTrial']).read_bytes(), (ROOT / 'docs/LOCAL-WORKFLOW.md').read_bytes())
            self.assertEqual(manifest['colorThemes'], ['system','light','dark','dracula'])
            self.assertEqual(manifest['locationHistory'], {'limit':20,'order':'last-open-wins','native':'handle-identity','uploads':'reselect'})
            self.assertTrue(manifest['synthetic'])
            self.assertEqual(manifest['viewerVersion'], json.loads((ROOT / 'package.json').read_text())['version'])
            self.assertEqual({r['version'] for r in manifest['reports']}, {1, 2, 3})
            historical = ROOT / 'vendor/agent-file-board/examples/full-conversation'
            for section in ['rooms', 'direct']:
                for source in (historical / section).glob('*/*.txt'):
                    self.assertEqual((board / '.agent-board' / source.relative_to(historical)).read_bytes(), source.read_bytes())
            messages = list((board / '.agent-board').glob('*/*/*.txt'))
            self.assertGreaterEqual(len(messages), 15)
            self.assertTrue(any('ANSWER:' in p.read_text() for p in messages))
            self.assertTrue(any('"id":"demo-next-step"' in p.read_text() for p in messages))
            with self.assertRaises(FileExistsError):
                archive_demo(ROOT, first)
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_existing_destination_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'existing'
            destination.mkdir()
            sentinel = destination / 'owner.txt'
            sentinel.write_bytes(b'Keep my data\r\n')
            with self.assertRaises(FileExistsError):
                build_demo(ROOT, destination)
            self.assertEqual(list(destination.iterdir()), [sentinel])
            self.assertEqual(sentinel.read_bytes(), b'Keep my data\r\n')
            target = Path(directory) / 'missing-target'
            link = Path(directory) / 'existing-link'
            link.symlink_to(target)
            for builder in (build_demo, archive_demo):
                with self.assertRaises(FileExistsError):
                    builder(ROOT, link)
            self.assertTrue(link.is_symlink())
            self.assertFalse(target.exists())
