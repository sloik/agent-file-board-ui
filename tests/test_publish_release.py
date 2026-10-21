"""Exercise the real publisher with a fake gh; never contact GitHub."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "publish_release.sh"


class PublishReleaseTests(unittest.TestCase):
    def run_publisher(self, tag, published="", api_failure=False, demo_present=True, package_present=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / 'release-assets'
            assets.mkdir()
            for name in ['board.html', 'desktop_opener.applescript', 'install_desktop_opener.py', 'notes.md']:
                (assets / name).write_text('fixture')
            if demo_present:
                (assets / 'agent-file-board-demo.zip').write_bytes(b'fixture zip')
            if package_present:
                (assets / "agent-file-board-viewer.zip").write_bytes(b"app zip")
                (assets / "SHA256SUMS").write_text("checksums")
            gh = root / "gh"
            gh.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
if sys.argv[1] == "api":
    if os.environ["API_FAILURE"] == "1":
        sys.exit(1)
    print(os.environ["PUBLISHED"])
elif sys.argv[1:3] == ["release", "create"]:
    Path("calls.json").write_text(json.dumps(sys.argv[1:]))
else:
    sys.exit("Unexpected gh command")
''', encoding="utf-8")
            gh.chmod(0o755)
            env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"],
                       GH_REPO="owner/repo", RELEASE_TAG=tag, PUBLISHED=published,
                       API_FAILURE="1" if api_failure else "0")
            result = subprocess.run(["bash", str(SCRIPT)], cwd=root, env=env,
                                    capture_output=True, text=True)
            calls = root / "calls.json"
            return result, json.loads(calls.read_text()) if calls.exists() else None

    def test_new_version_publishes_all_assets_and_matching_notes(self):
        result, args = self.run_publisher("v2.0.1", "v1.9.6")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(args, ["release", "create", "v2.0.1",
                               "release-assets/board.html", "release-assets/desktop_opener.applescript",
                               "release-assets/install_desktop_opener.py", "--verify-tag", "--title",
                               "v2.0.1", "--notes-file", "release-assets/notes.md", "--latest=true"])

    def test_demo_releases_require_and_publish_four_assets(self):
        result, args = self.run_publisher('v2.2.1', 'v2.2.0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(args[3:7], ['release-assets/board.html', 'release-assets/desktop_opener.applescript', 'release-assets/install_desktop_opener.py', 'release-assets/agent-file-board-demo.zip'])
        self.assertIn('--latest=true', args)
        result, args = self.run_publisher('v2.2.1', demo_present=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Missing release asset', result.stdout)
        self.assertIsNone(args)

    def test_older_backfill_does_not_replace_latest(self):
        result, args = self.run_publisher("v2.0.1", "v2.0.10\nv1.9.6")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--latest=false", args)

    def test_published_release_is_preserved(self):
        result, args = self.run_publisher("v2.0.1", "v2.0.1\nv1.9.6")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIsNone(args)
        self.assertIn("already published", result.stdout)

    def test_api_failure_cannot_publish(self):
        result, args = self.run_publisher("v2.0.1", api_failure=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(args)

    def test_invalid_tag_cannot_publish(self):
        result, args = self.run_publisher("main")
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(args)

    def test_package_release_requires_zip_and_checksums_and_preserves_published_versions(self):
        result, args = self.run_publisher('v2.11.4', 'v2.11.3')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('release-assets/agent-file-board-viewer.zip', args)
        self.assertIn('release-assets/SHA256SUMS', args)
        result, args = self.run_publisher('v2.11.4', package_present=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(args)
        result, args = self.run_publisher('v2.11.4', 'v2.11.4', package_present=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIsNone(args)
