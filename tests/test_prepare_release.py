"""Publication input checks: correct version, complete assets, exact bytes."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from prepare_release import ASSETS, prepare, release_notes


class PrepareReleaseTests(unittest.TestCase):
    def test_selects_only_exact_version(self):
        changelog = "# Notes\n## 2.0.10 — date\nnewer\n## 2.0.1 — date\nwanted\n### Detail\nkept\n## 2.0.0 — date\nolder\n"
        self.assertEqual(release_notes(changelog, "v2.0.1"), "wanted\n### Detail\nkept\n")

    def test_rejects_invalid_tag_missing_empty_or_duplicate_section(self):
        for changelog, tag in [
            ("## 2.0.1\nnotes\n", "main"),
            ("## 2.0.10\nnotes\n", "v2.0.1"),
            ("## 2.0.1\n  \n", "v2.0.1"),
            ("## 2.0.1\nfirst\n## 2.0.1\nsecond\n", "v2.0.1"),
        ]:
            with self.subTest(changelog=changelog, tag=tag), self.assertRaises(ValueError):
                release_notes(changelog, tag)

    def test_stages_exact_bytes_and_refuses_incomplete_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "CHANGELOG.md").write_text("## 2.0.1 — date\nnotes\n", encoding="utf-8")
            output = root / "release"
            with self.assertRaisesRegex(ValueError, "missing release asset"):
                prepare(root, "v2.0.1", output)
            self.assertFalse(output.exists())
            for index, name in enumerate(ASSETS):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(bytes([index, 0, 255, 13, 10]))
            prepare(root, "v2.0.1", output)
            self.assertEqual({p.name for p in output.iterdir()},
                             {Path(name).name for name in ASSETS} | {"notes.md"})
            for name in ASSETS:
                self.assertEqual((output / Path(name).name).read_bytes(), (root / name).read_bytes())
            self.assertEqual((output / "notes.md").read_text(), "notes\n")
            with self.assertRaises(FileExistsError):
                prepare(root, "v2.0.1", output)
