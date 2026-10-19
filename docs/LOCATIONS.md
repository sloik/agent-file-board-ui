# Folder chooser and recent locations

In UI **2.4.8**, click the **Folder: name ▾** label under **Agent File Board**.
One chooser provides **Choose another folder…** and **Recent locations**.
Before opening a board the label says **Choose board folder…**; uploaded boards
show their read-only name. The label stays visible on phones and is keyboard
accessible with Tab, Enter or Space. Long names truncate visually while their
full text remains available to accessibility APIs.

The separate Change folder and Recent locations toolbar buttons are removed.
This remains one local HTML page, with no backend or automatic network requests.
The chooser title, new-folder action and Close remain pinned during scrolling.
Cancelling a native picker leaves the chooser and current board intact.

![Recent locations, newest first.](images/board-locations.png)

The list keeps up to **20** successful opens. **Last open wins**: reopening an
existing location replaces its entry and moves it to the top. Recency follows
successful opens and commit order, not timestamp sorting. Refresh, polling,
cancelled pickers, denied permissions and failed opens do not promote an entry.
Invalid folders are checked before leaving the current board.

## Native folders

**Open location** uses normal read/write permission and board/presence switching.
Inaccessible or deleted folders report an error and can be removed explicitly.
History does not grant permission or bypass sender checks.

Native identity uses `FileSystemHandle.isSameEntry`, never the folder name.
Same-name folders stay separate. A project folder and its actual `.agent-board`
base share one entry; the latest selected handle/name wins. Browsers expose
folder names, not absolute filesystem paths; the viewer does not invent paths.

## Uploaded folders

Uploads appear as **Uploaded snapshot — choose again**. **Choose folder again**
opens the picker; select the files explicitly. Cancelling keeps history intact.
Only name, snapshot fingerprint, ID and last-open time are retained. No File
objects or message bodies are stored. Identical snapshots deduplicate using the
existing path/metadata fingerprint; changed snapshots may get another entry.
Physical upload identity cannot be proved, so names alone never merge entries.

When the latest entry is an upload, startup offers reselection instead of
silently opening an older writable folder. No persistent upload access is claimed.

## Startup, removal and storage

The existing startup preference applies to the latest entry. A granted native
folder can reopen automatically; otherwise the reminder offers explicit reopen
or reselection. The old saved folder migrates into history. **Forget** removes
the reminder's latest entry; the next remaining entry becomes eligible on reload.

**Remove from history** and **Clear location history** ask for confirmation.
They affect history and its saved reminder only. Current board/view, messages,
drafts and browser permissions stay intact. Removing a row does not delete a
folder or revoke permission. Clear prevents the old reminder from returning
until you open another location.

History lives in this viewer/browser profile's IndexedDB. The history record and
legacy `lastDir` pointer commit atomically. Local writes serialize and retry
cross-tab conflicts; opening the dialog reads committed history. Failed saves
retain session history and show **session only**. Failed removal keeps records
and reports failure. Browser clearing, private profiles or moving the HTML may
remove/separate history. No synchronization or upload is performed.

![Phone view in Polish and dark mode.](images/board-locations-phone.png)

## Try it and reproduce the checks

Extract two copies of the fictional demo, open each, then click the folder label and use **Recent locations**
to reopen the first: it moves to the top without a duplicate. Select a read-only
upload to try reselection. The release ZIP contains no personal history.

```sh
node --test tests/locations.test.js tests/settings.test.js tests/i18n.test.js
npm run screenshots:locations
npm test
```

Tests use disposable fictional folders and actual viewer controls for reload,
ordering, identity/aliases, permissions, failed saves/deletions, uploads, migration,
limits, cross-tab updates, keyboard and phone layouts. This is integration evidence,
not a claim of real owner adoption.
