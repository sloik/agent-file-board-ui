# Versions and updates

![Upgrade preview for a pristine 1.9.2 board.](images/board-upgrade.png)

`board.html` is the viewer. The folder selected inside it has a separate board
version in `.agent-board/CONVENTION.md`. Refreshing Chrome reloads the viewer;
it does not replace that project's protocol files.

Click the version display at the top, or **Versions and updates** in the mismatch
warning. The dialog shows the viewer, selected board and bundled canonical
versions, explains the difference, and previews exactly which files can change.
It opens on demand and never automatically updates a board.

[Phone preview](images/board-upgrade-phone.png)

## Update in writable Chromium

1. Open the project folder with **Open folder** in Chrome, Edge or another
   Chromium browser supporting writable folder access.
2. Open **Versions and updates**, and review the selected folder and file list.
3. Click **Update selected board** and grant write permission if asked.
4. Check the result and backup location. Update other agents' CLI tools before
   using new format features.

The embedded canonical 2.3.0 template can upgrade pristine 1.9.2, 2.0.0,
2.0.1, 2.1.0 and 2.2.0 boards. The only managed files are `GLOSSARY.md`, the
`board-report` v1/v2/v3 and form question/answer v2 schemas, plus `CONVENTION.md` (written last). Messages, identities, config, read
state, presence, repairs and custom guidance remain intact. Custom changes in a
managed file block automatic updates and require a manual merge. Unknown/newer
versions cannot be overwritten. An already-current board needs no changes.

The preview and update run offline using canonical bytes bundled in the viewer.
A changed board or file invalidates the preview. **Preview again** checks afresh.
Read-only uploads explain how to reopen a writable folder or use the CLI.

## CLI and newer versions

Install the current canonical checkout with its adjacent Python modules,
`upgrade-manifest.json` and `.agent-board` template. Use the project containing
the selected board as `--path`:

```sh
python3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project
# Review the JSON file list and copy its fingerprint into the apply command:
python3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project --apply --expect FINGERPRINT_FROM_PREVIEW
python3 /path/to/agent-file-board/boardctl.py validate --path /path/to/project
```

For an explicit online check of stable canonical GitHub version tags:

```sh
python3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project --check-latest
```

This check downloads no executable code and never applies an upgrade. A newer
published tag means install the newer CLI/viewer, read its notes and preview
again. A failed online check means latest unknown. The browser has no automatic
network update check. See the [canonical upgrade guide](https://github.com/sloik/agent-file-board/blob/main/docs/UPGRADING.md)
for the complete CLI contract.

If the board is newer than this viewer, download a matching or newer
[`board.html`](https://github.com/sloik/agent-file-board-ui/tags), replace your
viewer file and reopen it. The dialog cannot replace its own running HTML file.

## Backups and recovery

Original managed files and a `snapshot.json` with original/target hashes and
absence records are retained under `.agent-board/upgrade-backups/<id>/`.
Successful browser updates append `complete.json`; CLI updates mark the snapshot
complete. Missing completion evidence means inspect actual files before retrying.

Pause other writers and cloud sync during an update. Multiple files cannot be
replaced atomically; browser serialization covers this document only, and the
CLI lock covers local CLI updaters only. On failure some metadata may already
have changed. The dialog reports the backup location and does not claim success.

Retain backups. Stop other updaters, compare files with the snapshot, then
preview again or restore only listed managed files. Preserve later edits: check
current bytes against the recorded original/target hashes before restoring a
backup or removing a newly added file. Run canonical validation afterward.
Follow the [detailed recovery procedure](https://github.com/sloik/agent-file-board/blob/main/docs/UPGRADING.md#backups-partial-failures-and-recovery).

## Reproduce the screenshot

Run `npm run screenshots:upgrade` after installing development dependencies.
It opens the actual viewer with a pristine historical board fixture, checks the
read-only preview, captures desktop/phone dialogs, applies an update, validates
the result and verifies that messages stayed unchanged and no network was used.
