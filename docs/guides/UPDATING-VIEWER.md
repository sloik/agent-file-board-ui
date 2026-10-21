# Update the viewer package

The application and your board data are separate. A viewer can open many boards;
updating it must not replace conversations or `.agent-board` content.

1. Open the [official releases](https://github.com/sloik/agent-file-board-ui/releases/latest),
   read the notes and download **agent-file-board-viewer.zip**. The demo ZIP contains
   fictional data and is not an update package.
2. Finish or explicitly discard unsent messages, form/component edits, voice
   transcripts and authoring work. Wait for pending sends and writes. The app's
   Reload control waits for unfinished work; browser/OS close controls cannot
   guarantee recovery. Imported signing keys are intentionally not saved.
3. Extract the ZIP into a fresh folder using Finder on macOS, Extract All in
   Windows Explorer, or your Linux archive manager. Do not extract over a project
   folder containing conversations. Keep the previous application package/backup.
4. For an existing standalone installation, copy only the application files listed
   in the new package manifest into that application's location, preserving user
   files and board data. Keeping the same viewer path avoids unnecessary location
   changes. For a Git checkout/source ZIP, leave source files untouched and use
   the extracted standalone viewer instead. A new path does not guarantee that
   browser settings/private trust follow automatically.
5. Reload/reopen `board.html` when ready and check its displayed version. Native
   folders may need permission again; uploaded snapshots need reselection. Unlock
   signing explicitly. Restart optional helpers or rerun their setup if release
   notes require it; copying source files does not update an already-running process.
6. If it fails, restore the previous application files at the original location.
   Check rollback/storage compatibility in release notes. Restoring HTML does not
   undo private browser database migrations; never delete trust/floors as a shortcut.

In Dropbox/shared storage, normal sync may propagate the application files. Other
open tabs keep their loaded code until reloaded; the viewer cannot confirm remote
sync completion or coordinate simultaneous replacements on different computers.
Pause other application-file writers while copying. No board metadata migration
runs automatically; use its separate preview/consent flow if needed.

The daily check runs only while the viewer is open. Offline/rate-limited checks
mean latest unknown, not up to date. The isolated publisher-hosted checker receives
no conversations, local paths, participant identity, file handles or keys. GitHub
receives the connection/IP. Tools → Viewer updates can disable automatic checks.
Download links open GitHub; the app neither installs files nor verifies a ZIP saved
by the browser. Public package inventory/checksums are available for manual checks;
they are not independent publisher authentication.
