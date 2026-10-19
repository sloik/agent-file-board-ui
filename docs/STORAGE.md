# Browser storage and reload verification

The viewer uses browser-local IndexedDB for preferences, last view, read markers
and guidance paths, plus form v2/v3 drafts since2.4 and authoring work since UI2.4.2. Settings migrate from the prior localStorage representation.
Startup restores preferences before enabling controls. Writes use ordered,
committed transactions. No shared board messages are migrated or rewritten.

If IndexedDB is unavailable, the UI remains usable through the legacy fallback.
A fallback settings journal may recover only against the exact committed UUID
revision it started from. Recovery checks and writes share one transaction; old
journals cannot replace another tab's newer revision or replay after values
change away and back. No wall-clock ordering is involved.

During diagnosis, concurrent file-page contexts reproduced missing/stale
localStorage values even while a second page retained the latest token. Both
headless shell and full Chromium reproduced it. An empty HTML page reproduced
it without board code, a fake filesystem or a mocked clock. In a paired test,
localStorage diverged on 3 of 160 reloads while IndexedDB agreed on all 640
observations. This is an observed browser-cache failure, not evidence of lost
real board files.

Run the standalone diagnostic with:

```sh
node scripts/diagnose_file_storage.cjs
```

It prints observed mismatches from eight isolated contexts and 160 reloads. The
failure is intermittent; zero observed mismatches does not disprove it. The
normal regression suite deterministically injects missing/stale localStorage,
checks migration and fallback recovery, pauses startup reads, and retains the
actual composer, read-marker and message-file/index/body/order assertions.

The fake filesystem uses its own IndexedDB database to model persistent files
independently of renderer localStorage. Mutations publish their new in-memory
snapshot only after transaction commit; failures do not publish a successful
simulated disk write. Reload checks await resolved predicates with the original
5-second deadline and never seed or restore application state.


## Form draft persistence (2.4)

Form drafts use the same local IndexedDB database with separate per-board
`form-drafts-v1:` buckets. Native folders use verified handle identities; upload
snapshots use folder name, metadata and file paths/sizes/timestamps. Identical
upload snapshots can share drafts. Respondent, source path and exact QUESTION
are included in the hashed record key. A changed definition gets a new draft.
Native folder display names alone never establish persistence identity.

Controls remain disabled during hydration. Restored raw values may be incomplete,
but their shape, IDs, row/cell membership and size are checked before rendering.
The normal typed validator still governs every submission. Writes run through an
ordered queue and a committed read/modify/write transaction; failure retains the
in-memory draft and shows a visible memory-only notice. Draft storage does not
write board files or make network requests.

Each board retains at most20 drafts for at most30 days, with256 KiB per draft.
Saving evicts older records beyond that count. Reset and successful posting or
reply download clear saved edits; failed delivery retains them. Browser storage
clearing, private sessions and quota limits can remove or prevent persistence;
drafts are not synchronized to other browsers/devices. Current viewer memory
can retain a working draft while that page remains open.

`tests/forms.test.js` covers actual reload/reset/respondent/definition/upload
restore, storage failure fallback, malformed records, expiry/eviction and typed
immutable replies. The existing preference migration/revision tests remain
separate because form drafts do not use the legacy settings journal.


## Explicit draft backups and deletion (UI2.4.1)

**Saved drafts** lists known form records for the opened board and respondent.
Export/import uses a data-only `agent-file-board-draft` version1 JSON envelope,
with exact QUESTION string, source path, respondent and raw values. It is bounded
to384 KiB including the definition; raw drafts retain the256 KiB bound. Imports
validate identity, source and row permissions before asking to replace edits.
They never post a message or write a draft file into the board.

Deletion asks for confirmation and clears storage and live controls together.
If a stored record cannot be deleted, the manager shows an error and keeps the
working draft. A failed replacement remains visibly memory-only rather than
claiming the older stored record contains the new edits. Cancel/board/respondent
changes cannot apply an asynchronous operation to another context. Exports are
local files containing entered values, with no automatic sync or upload.

See [the tool guide](WORKBENCH.md#export-import-or-delete-a-local-draft), the
[public fictional backup](examples/drafts/README.md), and tests/offline-tools.test.js.
Authoring previews do not create answer drafts.

## Authoring workspace (UI2.4.2)

The separate `authoring-workspace-v1` IndexedDB record holds active editor recovery,
a saved attachment snapshot and up to20 named snapshots. This is the current
viewer/browser profile's workspace, independent of the chosen board/respondent.
It intentionally accepts unfinished JSON. Each editor/attachment is bounded to
256 KiB UTF-8; the versioned export/import envelope is bounded to1 MiB. Named
snapshots have no automatic expiry. Clear/delete requires explicit confirmation;
failed transactions retain working data and never claim committed success.

Writes serialize through a committed read/modify/write transaction. Concurrent
tabs merge named snapshots; active recovery uses the last committed writer.
Storage status shows pending writes, saved or memory-only; unavailable storage
leaves editing, preview and export usable. A close/reload warning is requested
when work is pending or memory-only (browser handling can vary). No localStorage
fallback is claimed for authoring. Native attachment restoration requires an
explicit click and matching board identity plus validation; no routing or message
body is restored and nothing is automatically posted. Native identity fallback
may be session-only, preventing restoration; export the definition and explicitly
validate/attach on the intended board instead.

Browser clearing, quotas, private profiles and moving the HTML file may remove or
separate recovery. Backups contain entered values; nothing is synchronized or
uploaded. Answer-draft retention/scoping above is unchanged. See
[authoring tools](WORKBENCH.md#keep-unfinished-authoring-work) and
`tests/authoring-builder.test.js` for reload/failure/import/attachment controls.

## Recent locations (UI2.4.3)

`location-history-v1` stores up to 20 opens in most-recent-first commit order.
Native records retain the latest picker handle, actual board-base handle, UUID,
name and opened time; isSameEntry establishes identity. Upload records retain
only UUID/name/time and the existing snapshot fingerprint, never File objects
or message bodies. Identical uploads deduplicate; files must be reselected.

History and the legacy lastDir pointer commit atomically. A latest upload sets
lastDir to null and offers reselection. Existing lastDir migrates once. Writes
serialize and UUID revision checks retry cross-tab conflicts. Opening the dialog
reads committed history. Recency never sorts by wall-clock time.

Failed saves retain session history with a visible notice; failed removal keeps
records and reports failure. Confirmed removal/clear preserves current view,
board files, drafts and permissions. The separate native identity registry for
read markers/drafts remains intact. See [the guide](LOCATIONS.md) and
`tests/locations.test.js`. Nothing is synchronized or uploaded.

## Color theme preference (UI2.4.8)

System (default), Light, Dark and Dracula use the existing committed settings
store. Older/missing/unknown values resolve to System; Reset restores System.
Explicit choices override OS changes. The canonical board remains2.4.0; no
message migration is needed. See [themes](THEMES.md).

## Settings panel width (UI2.4.8)

Width uses the existing committed browser preferences. The default is340px;
left-edge drag or arrow keys resize it, double-click/Home/default reset restores
it. Viewport changes only clamp display width, preserving the saved desktop
width. No board migration. See [panels](PANELS.md).

UI2.4.8 opens the existing location history from the current folder label.
The unified new/recent chooser changes no storage format, permissions or
last-open startup rules; no canonical migration is required.
