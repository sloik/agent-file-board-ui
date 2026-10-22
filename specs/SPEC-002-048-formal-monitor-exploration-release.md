---
id: SPEC-002-048
title: Monitor formal freshness, explore bounded schedules and release viewer
status: done
parent: SPEC-002
type: feature
created: 2026-10-22
nfrs: []
---

## Scope

Add an independently scheduled daily GitHub watchdog for missing/stale main
verification, bounded deterministic generated runtime schedules alongside all
fixed controls, and an explicit real-versus-double coverage matrix. Preserve
model semantics and existing tests. Publish canonical Board first, update the
UI to that immutable released pin, and publish verified UI application assets.
GitHub job failures use normal notifications; no unsolicited issues/messages.
The same-provider watchdog does not claim to detect a GitHub-wide outage or
simultaneous disabling of both schedules. No universal refinement claim.

## Acceptance Criteria

- [x] AC1: Daily/manual watchdog checks formal workflow state, trusted main-run
  success age and current-head attempts; disabled/missing/stale/failed/invalid
  API evidence fails with a useful summary. Unit tests prevent false green.
- [x] AC2: Required reproducible generated schedules exercise real implementation
  transitions in both projects within documented bounds. Existing fixed positive
  witnesses, implementation mutants and original TLC controls remain mandatory.
- [x] AC3: Coverage docs identify real crypto/filesystem/browser evidence, doubles,
  generated bounds, alert limitations and future exclusions without overstating proof.
- [x] AC4: Validate normal/formal/watchdog checks, reviewed source alignment,
  canonical release/tag/manifest, UI released pin and packaged exact-source assets.
  Prepare exact-source notes/assets and release validation. Authorized publication
  and downloaded-byte verification follow as delivery steps recorded privately.

## Outcome

Added a separate daily/manual read-only freshness watchdog with strict API/clock
and failed/incomplete evidence handling, summaries/artifacts and normal GitHub
notifications. Eight deterministic update/reload schedules retain every existing
fixed witness and mutant. Coverage docs distinguish real APIs from controlled
doubles and shared-provider monitoring limits. Across both projects48positive
traces,12implementation controls and20TLCconfigs pass; current51harness checks
per project pass. Canonical2.11.1 is published and verified; this viewer pins its
immutable tag and embeds matching upgrade data. Fresh2.11.4 package preparation
verifies complete inventory, source HTML and release checksums. Publication uses
the existing exact-tested-tag release workflow and private post-download evidence.
