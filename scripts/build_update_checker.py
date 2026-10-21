#!/usr/bin/env python3
"""Generate the isolated static checker with a hash-authorized script."""
import base64
import hashlib
from pathlib import Path
import sys
root = Path(__file__).resolve().parent.parent
script = (root / 'site/update-check.js').read_text()
digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
csp = "default-src 'none'; script-src 'sha256-" + digest + "'; connect-src https://api.github.com/repos/sloik/agent-file-board-ui/releases/latest; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
html = '<!doctype html>\n<meta charset="utf-8">\n<meta name="referrer" content="no-referrer">\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<title>Viewer release check</title>\n<script>' + script + '</script>\n'
target = root / 'site/update-check.html'
if '--check' in sys.argv:
    if not target.exists() or target.read_text() != html:
        raise SystemExit('Run python3 scripts/build_update_checker.py')
else:
    target.write_text(html)
