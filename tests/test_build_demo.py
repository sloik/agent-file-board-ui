"""Distribution contract: real CLI validation, exact inputs, deterministic archive."""
import json
import re
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
                self.assertEqual(archive.read(PREFIX + '/README.md'), (ROOT / 'docs/guides/DEMO.md').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/skills/board-feedback/SKILL.md'), (ROOT / 'vendor/agent-file-board/skills/board-feedback/SKILL.md').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/docs/FEEDBACK.md'), (ROOT / 'vendor/agent-file-board/docs/FEEDBACK.md').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/LICENSE'), (ROOT / 'LICENSE').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/licenses/dracula-MIT.txt'), (ROOT / 'licenses/dracula-MIT.txt').read_bytes())
                self.assertEqual(archive.read(PREFIX + '/licenses/highlightjs-BSD-3-Clause.txt'), (ROOT / 'licenses/highlightjs-BSD-3-Clause.txt').read_bytes())
                self.assertFalse(any('validation' in Path(name).parts or Path(name).name == 'SIGNING-REVIEW.md' for name in names))
                for guide in ['SIGNING-CORE.md', 'SIGNATURES-AND-IDENTITY.md', 'SIGNING-POLICY-AND-POSSESSION.md']:
                    self.assertEqual(archive.read(PREFIX + '/docs/' + guide), (ROOT / 'vendor/agent-file-board/docs' / guide).read_bytes())
                signing = archive.read(PREFIX + '/docs/SIGNING.md').decode('utf-8')
                expected_signing = (ROOT / 'docs/guides/signing.md').read_text().replace('../../vendor/agent-file-board/docs/SIGNING-CORE.md', 'SIGNING-CORE.md')
                self.assertEqual(signing, expected_signing)
                illustrated = re.findall(r'\[[^\]]*\]\(\.\./images/([A-Za-z0-9_.-]+)\)', signing)
                self.assertEqual(set(illustrated), {'signing-three-tasks.svg', 'signing-key-comparison.svg', 'signing-message.png', 'signing-review.png', 'signing-review-approved.png', 'signing-own.png', 'signing-phone.png'})
                for image in illustrated:
                    self.assertEqual(archive.read(PREFIX + '/images/' + image), (ROOT / 'docs/images' / image).read_bytes())

                self.assertNotIn('SIGNING-REVIEW', signing)
                self.assertNotIn('../validation/', signing)
                for rel in ['docs/SOURCE-CODE.md', 'examples/source-code/review.md', 'examples/source-code/device.patch', 'examples/extensions/source-review.afb-plugin.json']:
                    self.assertEqual(archive.read(PREFIX + '/' + rel), (ROOT / 'vendor/agent-file-board' / rel).read_bytes())
                archive.extractall(directory / 'extracted')
            package = directory / 'extracted' / PREFIX
            board = package / 'demo-board'
            cli(ROOT, 'validate', '--path', board)
            manifest = json.loads((package / 'demo-manifest.json').read_text())
            self.assertEqual(manifest['feedback'], {'guide':'docs/FEEDBACK.md','skill':'skills/board-feedback/SKILL.md'})
            self.assertEqual(manifest['signing']['privateKeysIncluded'], False)
            self.assertTrue(manifest['signing']['automaticAfterExplicitUnlock'])
            self.assertTrue(manifest['signing']['explicitSignerSelection'])
            self.assertTrue((package / manifest['signing']['guide']).is_file())
            self.assertTrue((package / manifest['signing']['runtime']).is_file())
            self.assertIn('SIGNING-CORE.md', (package / manifest['signing']['guide']).read_text())
            self.assertNotIn('vendor/agent-file-board', (package / manifest['signing']['guide']).read_text().split('Development installation:')[0])
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
            self.assertEqual(manifest['extensions']['api'], '1.3.0')
            self.assertEqual(manifest['sourcePresentation'], {'guide':'docs/SOURCE-CODE.md','room':'reports','thread':'T016','views':['unified','split','source']})
            self.assertEqual(manifest['opportunisticObservation'], {'skill':'skills/board-loop/SKILL.md','guide':'docs/BOARD-LOOP.md','defaultDurationSeconds':28800,'idleSeconds':900,'activeSeconds':15})
            for rel in ['SKILL.md','agents/openai.yaml','scripts/board_loop.py','references/harnesses.md','references/opportunistic.md']:
                self.assertEqual((package / 'skills/board-loop' / rel).read_bytes(), (ROOT / 'vendor/agent-file-board/skills/board-loop' / rel).read_bytes())
            for rel in ['BOARD-LOOP.md','COMPOSER.md','VOICE.md']:
                self.assertEqual((package / 'docs' / rel).read_bytes(), (ROOT / 'docs/guides' / rel).read_bytes())
            for name in ['voice_helper.py', 'voice-helper.html']:
                self.assertEqual((package / 'scripts' / name).read_bytes(), (ROOT / 'scripts' / name).read_bytes())
            helper_help = subprocess.run([sys.executable, str(package / manifest['voiceDrafts']['helper']), '--help'], capture_output=True, text=True)
            self.assertEqual(helper_help.returncode, 0, helper_help.stderr)
            self.assertIn('--whisper-cli', helper_help.stdout)
            original_board = {p.relative_to(board):p.read_bytes() for p in board.rglob('*') if p.is_file()}
            poll = [sys.executable, str(package / 'skills/board-loop/scripts/board_loop.py'), 'poll', '--path', str(board), '--participant', 'implementation-agent-01', '--state-dir', str(directory / 'private-loop-state'), '--ctl', str(ROOT / 'vendor/agent-file-board/boardctl.py'), '--mode', 'OPPORTUNISTIC']
            first_poll = subprocess.run(poll, capture_output=True, text=True)
            self.assertEqual(first_poll.returncode,0,first_poll.stderr)
            observed = json.loads(first_poll.stdout)
            self.assertTrue(observed['observation']['startup_baseline'])
            self.assertEqual(observed['interval_seconds'],900)
            self.assertIsNone(observed['attachment'])
            second_poll = subprocess.run(poll, capture_output=True, text=True)
            self.assertEqual(second_poll.returncode,0,second_poll.stderr)
            self.assertFalse(json.loads(second_poll.stdout)['observation']['emit'])
            self.assertEqual({p.relative_to(board):p.read_bytes() for p in board.rglob('*') if p.is_file()}, original_board)
            self.assertEqual((package / manifest['draftExample']).read_bytes(), (ROOT / 'docs/examples/drafts/demo-workflow-draft.json').read_bytes())
            self.assertEqual((package / manifest['authoringExample']).read_bytes(), (ROOT / 'docs/examples/drafts/authoring-workflow.json').read_bytes())
            self.assertEqual((package / manifest['workflowTrial']).read_bytes(), (ROOT / 'docs/guides/LOCAL-WORKFLOW.md').read_bytes())
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
