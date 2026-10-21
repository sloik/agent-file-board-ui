#!/usr/bin/env python3
"""Deterministic application-only distribution; no recursive project copies."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ARCHIVE = 'agent-file-board-viewer.zip'
PREFIX = 'agent-file-board-viewer'
FILES = {
    'board.html': 'board.html',
    'docs/package/README.md': 'README.md',
    'docs/guides/UPDATING-VIEWER.md': 'UPDATE.md',
    'LICENSE': 'LICENSE',
    'THIRD_PARTY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
    'scripts/voice_helper.py': 'scripts/voice_helper.py',
    'scripts/voice-helper.html': 'scripts/voice-helper.html',
    'scripts/desktop_opener.applescript': 'scripts/desktop_opener.applescript',
    'scripts/install_desktop_opener.py': 'scripts/install_desktop_opener.py',
}


def archive_viewer(root, output):
    root, output = Path(root).resolve(), Path(output)
    def read_input(source):
        path = root / source
        if any(part.is_symlink() for part in [path, *path.parents]):
            raise ValueError('symlink package input: ' + source)
        if not path.is_file():
            raise ValueError('missing/invalid package input: ' + source)
        return path.read_bytes()

    version = json.loads(read_input('package.json'))['version']
    html = read_input('board.html').decode('utf-8')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or f'const VIEWER_VERSION = "{version}";' not in html:
        raise ValueError('package/viewer version mismatch')
    canonical = re.search(r'^Version:\s*(\d+\.\d+\.\d+)', read_input('vendor/agent-file-board/.agent-board/CONVENTION.md').decode('utf-8'), re.M)
    if not canonical:
        raise ValueError('canonical version unavailable')
    entries = dict(FILES)
    licenses = root / 'licenses'
    if licenses.is_symlink() or not licenses.is_dir():
        raise ValueError('licenses unavailable')
    for path in sorted(licenses.iterdir()):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+\.txt', path.name):
            raise ValueError('invalid license filename')
        entries['licenses/' + path.name] = 'licenses/' + path.name
    data = {}
    for source, target in entries.items():
        data[target] = read_input(source)
    manifest = {'formatVersion': 1, 'viewerVersion': version, 'canonicalVersion': canonical[1],
                'files': [{'path': p, 'size': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                          for p, raw in sorted(data.items())]}
    data['package-manifest.json'] = (json.dumps(manifest, indent=2, ensure_ascii=False) + '\n').encode()
    with output.open('xb') as stream, zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(data.items()):
            info = zipfile.ZipInfo(PREFIX + '/' + name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, raw)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    archive_viewer(args.root, args.output)
