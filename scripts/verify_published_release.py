#!/usr/bin/env python3
"""Compare downloaded release assets with an immutable tagged source; extract only verified viewer bytes."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile
import zipfile

from prepare_release import prepare
from release_check import check

TAG = re.compile(r'v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)')
MAX_BYTES = 64 * 1024 * 1024


def zip_payload(path):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        if len(names) != len(set(names)) or len(names) > 1024 or sum(i.file_size for i in infos) > MAX_BYTES:
            raise ValueError('invalid ZIP inventory or size')
        data = {}
        for info in infos:
            parts = PurePosixPath(info.filename)
            if (parts.is_absolute() or '..' in parts.parts or '\\' in info.filename or
                    not info.filename or info.is_dir() or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1):
                raise ValueError('unsafe ZIP entry')
            if not info.is_dir():
                data[info.filename] = archive.read(info)
        return data


def verify(source, downloads, tag, metadata, commit=None, build=prepare):
    source, downloads = Path(source), Path(downloads)
    if not TAG.fullmatch(tag) or tuple(map(int, tag[1:].split('.'))) < (2, 11, 4):
        raise ValueError('application package verification requires stable v2.11.4 or newer')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(source), *args], text=True, timeout=10).strip()
    head = git('rev-parse', 'HEAD')
    if not re.fullmatch('[0-9a-f]{40}', head) or git('rev-parse', f'refs/tags/{tag}^{{}}') != head or (commit and commit != head):
        raise ValueError('source/tag/tested commit mismatch')
    if git('status', '--porcelain', '--untracked-files=no'):
        raise ValueError('tagged source is modified')
    if check(source, tag):
        raise ValueError('source release consistency failed')
    if metadata.get('tag_name') != tag or metadata.get('draft') is not False or metadata.get('prerelease') is not False:
        raise ValueError('release metadata is not the requested published stable tag')
    with tempfile.TemporaryDirectory(prefix='published-source-') as tmp:
        expected = Path(tmp) / 'expected'
        build(source, tag, expected)
        names = {p.name for p in expected.iterdir() if p.name != 'notes.md'}
        assets = metadata.get('assets')
        if not isinstance(assets, list) or not all(isinstance(a, dict) and isinstance(a.get('name'), str) for a in assets):
            raise ValueError('invalid release asset metadata')
        published = [a['name'] for a in assets]
        if set(published) != names or len(published) != len(names):
            raise ValueError('published asset inventory differs from tagged source')
        if {p.name for p in downloads.iterdir()} != names:
            raise ValueError('download inventory differs from tagged source')
        hashes = {}
        for name in sorted(names):
            downloaded = downloads / name
            if downloaded.is_symlink() or not downloaded.is_file() or downloaded.stat().st_size > MAX_BYTES:
                raise ValueError('invalid downloaded asset')
            hashes[name] = hashlib.sha256(downloaded.read_bytes()).hexdigest()
            if name.endswith('.zip'):
                # Compression is platform-dependent; every decompressed payload byte must match.
                if zip_payload(downloaded) != zip_payload(expected / name):
                    raise ValueError('ZIP payload differs from tagged source: ' + name)
            elif name != 'SHA256SUMS' and downloaded.read_bytes() != (expected / name).read_bytes():
                raise ValueError('asset differs from tagged source: ' + name)
        checksums = {}
        for line in (downloads / 'SHA256SUMS').read_text(encoding='ascii').splitlines():
            match = re.fullmatch(r'([0-9a-f]{64})  ([A-Za-z0-9_.-]+)', line)
            if not match or match[2] in checksums:
                raise ValueError('invalid or duplicate release checksum')
            checksums[match[2]] = match[1]
        if set(checksums) != names - {'SHA256SUMS'} or any(hashes[name] != digest for name, digest in checksums.items()):
            raise ValueError('release checksums do not match complete downloaded inventory')
        if git('rev-parse', 'HEAD') != head or git('rev-parse', f'refs/tags/{tag}^{{}}') != head or git('status', '--porcelain', '--untracked-files=no'):
            raise ValueError('tagged source changed during verification')
        return {'scope': 'published assets and tagged source; live browser result is separate',
                'result': 'passed', 'tag': tag, 'commit': head, 'assets': hashes}


def extract_viewer(downloads, destination):
    # Called only after verify succeeds, into a new owned directory.
    payload = zip_payload(Path(downloads) / 'agent-file-board-viewer.zip')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    for name, data in payload.items():
        path = PurePosixPath(name)
        if not path.parts or path.parts[0] != 'agent-file-board-viewer' or len(path.parts) < 2:
            raise ValueError('invalid viewer package prefix')
        target = destination.joinpath(*path.parts[1:])
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--downloads', type=Path, required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit')
    parser.add_argument('--viewer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = {'scope': 'published assets and tagged source; live browser result is separate', 'result': 'failed'}
    try:
        report = verify(args.source, args.downloads, args.tag, json.loads(args.metadata.read_text()), args.commit)
        extract_viewer(args.downloads, args.viewer)
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        report['error'] = str(error) if type(error) is ValueError else type(error).__name__
        report['result'] = 'failed'
        print('Published asset verification failed; inspect the job and tagged source. No pass established.')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'assets.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if report['result'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
