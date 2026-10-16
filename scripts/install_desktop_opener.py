#!/usr/bin/env python3
"""Install the optional, user-local macOS board file URL handler. No server runs."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile

BUNDLE_ID = "com.sloik.agent-file-board.opener"
APP_NAME = "Agent File Board Opener.app"


def install(destination):
    if sys.platform != "darwin":
        raise ValueError("The desktop opener installer requires macOS; VS Code links work independently.")
    destination = destination.expanduser().absolute()
    if destination.exists():
        info = destination / "Contents/Info.plist"
        if not info.is_file() or plistlib.loads(info.read_bytes()).get("CFBundleIdentifier") != BUNDLE_ID:
            raise ValueError(f"Refusing to replace an unrelated application: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="board-opener-", dir=destination.parent) as tmp:
        bundle = Path(tmp) / APP_NAME
        subprocess.run(["/usr/bin/osacompile", "-o", str(bundle), str(Path(__file__).with_name("desktop_opener.applescript"))], check=True)
        info = bundle / "Contents/Info.plist"
        data = plistlib.loads(info.read_bytes())
        data.update(CFBundleIdentifier=BUNDLE_ID, CFBundleName="Agent File Board Opener", LSUIElement=True,
                    CFBundleURLTypes=[{"CFBundleURLName": "Board local files", "CFBundleURLSchemes": ["agent-file-board"], "CFBundleTypeRole": "Viewer"}])
        info.write_bytes(plistlib.dumps(data))
        # Re-sign after changing the generated plist.
        subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", str(bundle)], check=True)
        backup = Path(tmp) / "previous.app"
        if destination.exists():
            os.replace(destination, backup)
        try:
            os.replace(bundle, destination)
            subprocess.run(["/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", "-f", str(destination)], check=True)
        except Exception:
            if destination.exists():
                shutil.rmtree(destination)
            if backup.exists():
                os.replace(backup, destination)
            raise
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=Path.home() / "Applications" / APP_NAME)
    args = parser.parse_args()
    try:
        print(f"Installed: {install(args.destination)}")
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
