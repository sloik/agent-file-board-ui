"""Exercise the actual AppleScript URL validator without launching an editor."""
import json
import os
import plistlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import quote

SOURCE = Path(__file__).resolve().parents[1] / "scripts/desktop_opener.applescript"


@unittest.skipUnless(sys.platform == "darwin", "macOS AppleScript runtime integration")
class DesktopOpenerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="board editor ' # % \\ 🦊 ")
        self.base = Path(self.tmp.name) / ".agent-board"
        self.base.mkdir()
        for name in ("config.json", "participants.json"):
            (self.base / name).write_text("{}")
        self.room = self.base / "rooms/general/GUIDANCE.md"
        self.room.parent.mkdir(parents=True)
        self.room.write_text("# Guidance")
        self.topic = self.base / "direct/alpha--bravo/topics/T001.md"
        self.topic.parent.mkdir(parents=True)
        self.topic.write_text("# Topic")

    def tearDown(self):
        self.tmp.cleanup()

    def check_url(self, url, handler="guidancePath"):
        # JSON quoting for these scalar URL strings is also AppleScript quoting.
        script = SOURCE.read_text() + "\nreturn my " + handler + "(" + json.dumps(url) + ")\n"
        return subprocess.run(["/usr/bin/osascript", "-"], input=script, text=True, capture_output=True, timeout=15)

    def test_real_validator_decodes_room_and_topic_paths(self):
        for path in (self.room, self.topic):
            with self.subTest(path=path):
                result = self.check_url("agent-file-board://open" + quote(str(path)))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), str(path))

    def test_rejects_commands_traversal_unrelated_missing_and_non_board_files(self):
        valid = "agent-file-board://open" + quote(str(self.room))
        unrelated = self.room.with_name("command.sh")
        unrelated.write_text("exit 0")
        (self.room.parent / "directory/GUIDANCE.md").mkdir(parents=True)
        urls = [valid + "?command=open", valid + "#fragment", valid.replace("://open", "://other"),
                valid.replace("agent-file-board:", "https:"), valid.replace("://open", "://user@open"),
                "agent-file-board://open" + quote(str(unrelated)),
                valid.replace("/general/", "/general/../general/"),
                valid.replace("GUIDANCE.md", "topics/T002.md"),
                valid.replace("/general/", "/general/directory/")]
        for url in urls:
            with self.subTest(url=url):
                self.assertNotEqual(self.check_url(url).returncode, 0)
        (self.base / "participants.json").unlink()
        self.assertNotEqual(self.check_url(valid).returncode, 0)

    def test_refuses_symlinks_inside_board_but_accepts_a_board_root_alias(self):
        alias = Path(self.tmp.name) / "board-alias"
        alias.symlink_to(self.base, target_is_directory=True)
        url = "agent-file-board://open" + quote(str(alias / "rooms/general/GUIDANCE.md"))
        self.assertEqual(self.check_url(url).returncode, 0)
        outside = Path(self.tmp.name) / "outside.command"
        outside.write_text("do not execute")
        self.room.unlink()
        self.room.symlink_to(outside)
        self.assertNotEqual(self.check_url(url).returncode, 0)

    def test_create_actions_make_empty_files_and_keep_existing_contents(self):
        for action, target in (("create", self.room), ("create-vscode", self.room.parent / "topics/T002.md")):
            if target.exists():
                target.unlink()
            url = "agent-file-board://" + action + quote(str(target))
            result = self.check_url(url, "createGuidance")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(target.read_bytes(), b"")
            target.write_text("User rules must survive a stale Create click. 🦊")
            result = self.check_url(url, "createGuidance")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(target.read_text(), "User rules must survive a stale Create click. 🦊")

    def test_create_rejects_symlinks_and_missing_rooms_without_writing(self):
        target = self.room.parent / "topics"
        outside = Path(self.tmp.name) / "outside"
        outside.mkdir()
        target.symlink_to(outside, target_is_directory=True)
        url = "agent-file-board://create-vscode" + quote(str(target / "T002.md"))
        self.assertNotEqual(self.check_url(url, "createGuidance").returncode, 0)
        self.assertEqual(list(outside.iterdir()), [])
        target.unlink()
        url = "agent-file-board://create" + quote(str(self.base / "rooms/missing/GUIDANCE.md"))
        self.assertNotEqual(self.check_url(url, "createGuidance").returncode, 0)
        self.assertFalse((self.base / "rooms/missing").exists())

    def test_room_named_topics_and_fifo_rejection(self):
        target = self.base / "rooms/topics/GUIDANCE.md"
        target.parent.mkdir()
        url = "agent-file-board://create" + quote(str(target))
        result = self.check_url(url, "createGuidance")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(target.read_bytes(), b"")
        target.unlink()
        os.mkfifo(target)
        for action in ("open", "create", "create-vscode"):
            result = self.check_url("agent-file-board://" + action + quote(str(target)), "createGuidance" if action != "open" else "guidancePath")
            self.assertNotEqual(result.returncode, 0)
        self.assertTrue(target.is_fifo())

    def test_message_paths_open_documents_and_folders_and_locate_parent(self):
        file = Path(self.tmp.name) / "report ' ; $(echo injected) # % 🦊.md"
        file.write_text("Document")
        for target in (file, file.parent):
            for action in ("file-open", "file-folder"):
                result = self.check_url("agent-file-board://" + action + quote(str(target)), "messagePath")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip(), str(target.parent if action == "file-folder" else target))

    def test_message_paths_refuse_invalid_targets_and_allow_locating_executables(self):
        target = Path(self.tmp.name) / "run.command"
        target.write_text("Do not execute")
        urls = ["agent-file-board://file-open" + quote(str(target)),
                "agent-file-board://file-open" + quote(str(target.with_name("missing"))),
                "agent-file-board://file-open" + quote(str(target)) + "?command=rm",
                "agent-file-board://file-open" + quote(str(target)) + "#fragment",
                "agent-file-board://user@file-open" + quote(str(self.room)),
                "agent-file-board://file-open" + quote(str(target.parent)) + "/../file",
                "agent-file-board://create" + quote(str(target))]
        fifo = target.with_name("pipe")
        os.mkfifo(fifo)
        urls.append("agent-file-board://file-open" + quote(str(fifo)))
        for url in urls:
            with self.subTest(url=url):
                self.assertNotEqual(self.check_url(url, "messagePath").returncode, 0)
        result = self.check_url("agent-file-board://file-folder" + quote(str(target)), "messagePath")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), str(target.parent))
        executable = target.with_name("program")
        executable.write_text("Do not execute")
        executable.chmod(0o755)
        self.assertNotEqual(self.check_url("agent-file-board://file-open" + quote(str(executable)), "messagePath").returncode, 0)
        link = target.with_name("ordinary.md")
        link.symlink_to(target)
        self.assertNotEqual(self.check_url("agent-file-board://file-open" + quote(str(link)), "messagePath").returncode, 0)

    def test_installer_preserves_an_unrelated_application(self):
        app = Path(self.tmp.name) / "Existing.app"
        info = app / "Contents/Info.plist"
        info.parent.mkdir(parents=True)
        original = plistlib.dumps({"CFBundleIdentifier": "example.unrelated"})
        info.write_bytes(original)
        result = subprocess.run([sys.executable, str(SOURCE.with_name("install_desktop_opener.py")),
                                 "--destination", str(app)], text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to replace", result.stderr)
        self.assertEqual(info.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
