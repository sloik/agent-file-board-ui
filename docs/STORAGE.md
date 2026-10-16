# Browser storage and reload verification

The viewer uses browser-local IndexedDB for preferences, last view, read markers
and guidance paths. Settings migrate from the prior localStorage representation.
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
