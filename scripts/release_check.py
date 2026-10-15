#!/usr/bin/env python3
"""Release consistency check for agent-file-board-ui (stdlib only).

Verifies, and exits non-zero on any mismatch:
  1. package.json "version" == VIEWER_VERSION in board.html (== the given --tag, minus the leading v);
  2. the pinned standard (git submodule vendor/agent-file-board) declares, in
     .agent-board/CONVENTION.md, a `Version:` with the same MAJOR.MINOR as this repo;
  3. the submodule HEAD is exactly at a tag (git describe --tags --exact-match) and that tag
     equals v<Version from its CONVENTION.md>.

Usage: python3 scripts/release_check.py [--tag vX.Y.Z] [--root DIR]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
SUBMODULE = Path("vendor") / "agent-file-board"


def major_minor(version: str) -> str:
    m = SEMVER.fullmatch(version)
    return f"{m.group(1)}.{m.group(2)}" if m else ""


def package_version(root: Path) -> str:
    return str(json.loads((root / "package.json").read_text(encoding="utf-8"))["version"])


def viewer_version(root: Path) -> str:
    text = (root / "board.html").read_text(encoding="utf-8")
    m = re.search(r'const\s+VIEWER_VERSION\s*=\s*"([^"]+)"', text)
    if not m:
        raise ValueError("board.html: VIEWER_VERSION constant not found")
    return m.group(1)


def convention_version(sub: Path) -> str:
    for candidate in (sub / ".agent-board" / "CONVENTION.md", sub / "CONVENTION.md"):
        if candidate.is_file():
            m = re.search(r"^Version:\s*(\S+)\s*$", candidate.read_text(encoding="utf-8"), re.MULTILINE)
            if not m:
                raise ValueError(f"{candidate}: no 'Version:' line")
            return m.group(1)
    raise ValueError(f"{sub}: CONVENTION.md not found (is the submodule checked out?)")


def submodule_tag(sub: Path) -> str:
    r = subprocess.run(["git", "-C", str(sub), "describe", "--tags", "--exact-match", "HEAD"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise ValueError(f"{sub}: HEAD is not at an exact tag ({r.stderr.strip() or 'git describe failed'})")
    return r.stdout.strip()


def check(root: Path, tag: str | None = None) -> list[str]:
    errors: list[str] = []
    try:
        pkg = package_version(root)
        viewer = viewer_version(root)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        return [str(exc)]
    for label, value in (("package.json version", pkg), ("VIEWER_VERSION", viewer)):
        if not SEMVER.fullmatch(value):
            errors.append(f"{label} '{value}' is not MAJOR.MINOR.PATCH")
    if pkg != viewer:
        errors.append(f"package.json version {pkg} != VIEWER_VERSION {viewer} in board.html")
    if tag is not None:
        if not re.fullmatch(r"v\d+\.\d+\.\d+", tag):
            errors.append(f"tag '{tag}' is not vMAJOR.MINOR.PATCH")
        elif tag != f"v{pkg}":
            errors.append(f"tag {tag} != v{pkg} (package.json version)")
    sub = root / SUBMODULE
    try:
        conv = convention_version(sub)
    except (OSError, ValueError) as exc:
        errors.append(str(exc))
        return errors
    if not SEMVER.fullmatch(conv):
        errors.append(f"submodule CONVENTION.md Version '{conv}' is not MAJOR.MINOR.PATCH")
    elif SEMVER.fullmatch(pkg) and major_minor(conv) != major_minor(pkg):
        errors.append(f"standard {conv} and UI {pkg} differ in MAJOR.MINOR ({major_minor(conv)} vs {major_minor(pkg)})")
    try:
        sub_tag = submodule_tag(sub)
        if sub_tag != f"v{conv}":
            errors.append(f"submodule tag {sub_tag} != v{conv} (CONVENTION.md Version)")
    except ValueError as exc:
        errors.append(str(exc))
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tag", help="release tag being built, e.g. v1.4.0")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent), help="repository root")
    args = ap.parse_args(argv)
    errors = check(Path(args.root), args.tag)
    if errors:
        for e in errors:
            print(f"release-check: FAIL: {e}", file=sys.stderr)
        return 1
    root = Path(args.root)
    print(f"release-check: ok (UI v{package_version(root)}, standard v{convention_version(root / SUBMODULE)}"
          + (f", tag {args.tag}" if args.tag else "") + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
