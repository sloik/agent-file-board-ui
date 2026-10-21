#!/usr/bin/env python3
"""Stage exact checked-out release bytes and the matching changelog section."""
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path
from build_demo import ARCHIVE

ASSETS = ("board.html", "scripts/desktop_opener.applescript", "scripts/install_desktop_opener.py")
DEMO_SINCE = (2, 2, 1)


def build_demo_asset(root: Path, output: Path) -> None:
    # Backfills must execute the tested tag's builder, not today's demo code.
    subprocess.run([sys.executable, '-I', '-B', str(root / 'scripts/build_demo.py'),
                    '--root', str(root), '--output', str(output)], check=True,
                   capture_output=True, text=True)


def release_notes(changelog: str, tag: str) -> str:
    if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
        raise ValueError("tag must be vMAJOR.MINOR.PATCH")
    sections = re.findall(r"^## ([^\n]+)\n(.*?)(?=^## |\Z)", changelog, re.M | re.S)
    matches = [body.strip() for heading, body in sections
               if re.match(re.escape(tag[1:]) + r"(?:\s|$)", heading)]
    if len(matches) != 1 or not matches[0]:
        raise ValueError(f"expected one nonempty changelog section for {tag}")
    return matches[0] + "\n"


def prepare(root: Path, tag: str, output: Path) -> None:
    notes = release_notes((root / "CHANGELOG.md").read_text(encoding="utf-8"), tag)
    for name in ASSETS:
        if not (root / name).is_file():
            raise ValueError(f"missing release asset: {name}")
    output.mkdir(parents=True, exist_ok=False)
    for name in ASSETS:
        shutil.copyfile(root / name, output / Path(name).name)
    if tuple(map(int, tag[1:].split('.'))) >= DEMO_SINCE:
        if not (root / 'scripts/build_demo.py').is_file():
            raise ValueError("missing demo source: scripts/build_demo.py")
        # Historical checkouts use the old layout; always inspect that checkout.
        if not any((root / name).is_file() for name in
                   ('docs/guides/DEMO.md', 'docs/DEMO.md')):
            raise ValueError("missing demo source: docs/guides/DEMO.md or docs/DEMO.md")
        build_demo_asset(root, output / ARCHIVE)
    (output / "notes.md").write_text(notes, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--tag", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.root, args.tag, args.output)
