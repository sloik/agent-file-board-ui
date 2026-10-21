# Agent File Board viewer

Open `board.html` in your browser, then choose the existing project/board folder.
This application package contains no conversations or demo boards. One viewer
can open many board folders. Chrome/Edge can write messages directly; other
browsers offer downloads where native folder writing is unavailable.

Read [UPDATE.md](UPDATE.md) before replacing an older installation. Updates are
manual. The daily update notice downloads no application code and installs nothing.
Use Tools → Viewer updates for the release link and update instructions.

`package-manifest.json` lists each application file's size and SHA-256. Licenses
are included. Optional tools in `scripts/` are not required for ordinary viewing:
local voice transcription needs Python, whisper.cpp and a model; the desktop
opener is macOS-specific and needs its explicit installer. Replacing helper source
does not restart an already-running helper or re-register an installed app.

The source and documentation are at
[agent-file-board-ui](https://github.com/sloik/agent-file-board-ui).
