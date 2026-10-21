---
id: SPEC-002-042
title: Design viewer self-update architecture and user contract
status: done
parent: SPEC-002
type: research
created: 2026-10-21
nfrs: []
---

## Problem

A local running board.html remains on its installed viewer version when a newer
UI release is published. Board refresh and bundled board-metadata upgrades do not
update the viewer executable. Define the expected user experience and architecture
before implementation.

## Acceptance Criteria

- [x] AC1: Compare standalone HTML, granted-file access, optional local helper,
  launcher and hosted delivery against actual browser/CSP/storage constraints;
  identify supported platforms and the first-install/legacy-viewer bootstrap path.
- [x] AC2: Record user choices for checking, consent to installation/reload,
  setup burden, offline behavior, multiple viewer copies/tabs and draft handling.
  Unanswered choices remain explicit; recommendations are not recorded as consent.
- [x] AC3: Define version/release selection, download identity/integrity,
  installation scope, backup/rollback, concurrent updates, failure recovery and
  signing-key/session implications. Distinguish viewer update from board migration.
- [x] AC4: Produce one source-backed architecture decision with a user-facing
  state/transition table, bounded initial implementation scope and meaningful
  verification scenarios. Separate confirmed decisions from unresolved questions.

## Scope

Read-only architecture team and parent-owned design/specification. No runtime
implementation, release publication, dependency installation or changes to owner
files. Maintain standalone offline use. Do not add public session validation
reports, private paths or generated traces.

## Architecture outcome

See `docs/design/VIEWER-UPDATES.md` for the source-backed decision, user-visible
states, setup/recovery boundaries, implementation sequence and verification gates.

Owner chose daily update notices while open; explicit install and reload; finish
or explicitly discard unfinished work before reload; browser replacement in
supported Chrome/Edge with Firefox/manual fallback; no required installed helper;
viewer installation independent of board folders; preserve Git checkouts and offer
a standalone download; replace a selected shared viewer through normal file sync.

Three research threads and two final reviews informed the design. A read-only
Chromium GitHub API transport probe retrieved exact released bytes. A separate
bounded Chromium HTTP/CSP prototype confirmed that a stricter opaque broker frame
can block child/worker/nested-worker fetching even when the parent may fetch.
Neither experiment proves native viewer-file replacement or full production
extension isolation. These remain explicit implementation gates, alongside
permissions, backup/recovery, concurrency and platform behavior. No runtime
implementation, release publication or updater installation belongs to this spec.
