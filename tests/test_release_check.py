"""Unit tests for scripts/release_check.py, including the mismatch cases that must fail (AC10, AC11)."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "release_check.py"
sys.path.insert(0, str(ROOT / "scripts"))
import release_check  # noqa: E402


def git(cwd, *args):
    subprocess.run(["git", "-C", str(cwd), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                    "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", *args],
                   check=True, capture_output=True)


def make_repo(pkg="1.4.0", viewer="1.4.0", conv="1.4.0", sub_tag="v1.4.0", html=True):
    """A throwaway UI repo: package.json, board.html, and a git 'submodule' dir with CONVENTION.md."""
    root = Path(tempfile.mkdtemp(prefix="rc-"))
    (root / "package.json").write_text(json.dumps({"name": "agent-file-board-ui", "version": pkg}))
    if html:
        (root / "board.html").write_text(f'<script>const VIEWER_VERSION = "{viewer}";</script>')
    sub = root / "vendor" / "agent-file-board"
    (sub / ".agent-board").mkdir(parents=True)
    (sub / ".agent-board" / "CONVENTION.md").write_text(f"# Convention\n\nVersion: {conv}\n")
    git(sub, "init", "-q")
    git(sub, "add", "-A")
    git(sub, "commit", "-q", "-m", "init")
    if sub_tag:
        git(sub, "tag", sub_tag)
    return root


def run(root, *extra):
    return subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), *extra], capture_output=True, text=True)


class ReleaseCheck(unittest.TestCase):
    def test_all_consistent_passes(self):
        r = run(make_repo())
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_matching_tag_passes(self):
        r = run(make_repo(), "--tag", "v1.4.0")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_mismatched_tag_fails(self):
        r = run(make_repo(), "--tag", "v1.5.0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("v1.5.0", r.stderr)

    def test_malformed_tag_fails(self):
        self.assertEqual(run(make_repo(), "--tag", "1.4.0").returncode, 1)

    def test_package_vs_viewer_mismatch_fails(self):
        r = run(make_repo(viewer="1.4.1"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("VIEWER_VERSION", r.stderr)

    def test_patch_may_differ_from_standard(self):
        r = run(make_repo(pkg="1.4.3", viewer="1.4.3"), "--tag", "v1.4.3")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_submodule_minor_mismatch_fails(self):
        # AC11 negative: UI at 1.4.x pinned to a standard at 1.3.0
        r = run(make_repo(conv="1.3.0", sub_tag="v1.3.0"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("MAJOR.MINOR", r.stderr)

    def test_submodule_major_mismatch_fails(self):
        self.assertEqual(run(make_repo(conv="2.4.0", sub_tag="v2.4.0")).returncode, 1)

    def test_submodule_not_at_tag_fails(self):
        r = run(make_repo(sub_tag=None))
        self.assertEqual(r.returncode, 1)
        self.assertIn("exact tag", r.stderr)

    def test_submodule_tag_must_match_its_convention_version(self):
        r = run(make_repo(conv="1.4.0", sub_tag="v1.4.1"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("CONVENTION.md Version", r.stderr)

    def test_missing_viewer_constant_fails(self):
        root = make_repo()
        (root / "board.html").write_text("<html></html>")
        self.assertEqual(run(root).returncode, 1)

    def test_missing_submodule_checkout_fails(self):
        root = make_repo()
        import shutil
        shutil.rmtree(root / "vendor")
        self.assertEqual(run(root).returncode, 1)

    def test_check_function_collects_errors(self):
        errs = release_check.check(make_repo(pkg="1.4.0", viewer="1.5.0", conv="1.3.0", sub_tag="v1.3.0"), "v9.9.9")
        self.assertGreaterEqual(len(errs), 3)

    def test_this_repository_is_consistent(self):
        # Release integration must pass the unchanged exact-tag gate.
        r = run(ROOT)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
