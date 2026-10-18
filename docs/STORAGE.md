# Browser storage and reload verification

The viewer uses browser-local IndexedDB for preferences, last view, read markers
and guidance paths, plus form v2/v3 drafts since2.4. Settings migrate from the prior localStorage representation.
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
