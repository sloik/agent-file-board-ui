---
id: SPEC-002-044
title: Deliver manual package updates with daily notices and regression tests
status: done
parent: SPEC-002
type: feature
created: 2026-10-21
nfrs: []
---

Implement the approved SPEC-002-043 design. Installation is manual. Prepare a
reviewable release; do not publish a version tag/release as part of preparation.

## Acceptance Criteria

- [x] AC1: Deterministic app-only ZIP/inventory includes all declared runtime,
  helper, license and guide dependencies; rejects missing/symlink inputs and unsafe
  archives; contains no boards, private data or demo fixtures. Integrate exact-source
  release preparation/publication without changing historical assets/backfills.
- [x] AC2: Daily while-open notices use a fixed independently hosted checker and
  bounded origin/source/channel/schema validation. Keep parent and custom worker
  network access denied. Offline/rate-limit/storage failures stay nonblocking;
  fixed package/release links and manual guide never claim installation completed.
- [x] AC3: Explicit reload waits for unfinished work and active operations; source
  checkouts and all board data remain untouched. No helper/file-write updater.
- [x] AC4: Meaningful unit/Python and Chromium/Firefox Playwright tests cover package
  extraction/inventory, real checker transport, hostile/late messages, daily/reopen,
  failure states, worker isolation and reload guards. Existing suites/formal checks
  pass; deploy and exercise checker endpoint before declaring notice usable.
- [x] AC5: Prepare versioned release assets/notes/checksums from exact tested source,
  verify reproducibility and package smoke flows, preserving existing releases.
  Keep private validation receipts outside public repository/docs.

## Outcome

Implemented the app-only deterministic package/inventory and exact-source release
assets, guided manual installation, independently deployed public metadata checker,
private daily scheduling and guarded explicit reload. Parent and extension workers
retain network denial. Unit, package and Chromium/Firefox regression coverage is
in PR/main CI; explicit live qualification exercises the deployed HTTPS checker in
both browsers. Fixed an existing stale draft-list/import-status race with a
deterministic late-completion regression.

Prepared v2.11.4 assets and checksums from tested source `ac4a4d9`, with reproducible
application ZIP bytes and an extracted-package smoke test. No version tag or release
was published; v2.11.3 remains Latest. Installation remains manual.
