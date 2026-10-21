---
id: SPEC-002-042
title: Design viewer self-update architecture and user contract
status: in_progress
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

- [ ] AC1: Compare standalone HTML, granted-file access, optional local helper,
  launcher and hosted delivery against actual browser/CSP/storage constraints;
  identify supported platforms and the first-install/legacy-viewer bootstrap path.
- [ ] AC2: Record user choices for checking, consent to installation/reload,
  setup burden, offline behavior, multiple viewer copies/tabs and draft handling.
  Unanswered choices remain explicit; recommendations are not recorded as consent.
- [ ] AC3: Define version/release selection, download identity/integrity,
  installation scope, backup/rollback, concurrent updates, failure recovery and
  signing-key/session implications. Distinguish viewer update from board migration.
- [ ] AC4: Produce one source-backed architecture decision with a user-facing
  state/transition table, bounded initial implementation scope and meaningful
  verification scenarios. Separate confirmed decisions from unresolved questions.

## Scope

Read-only architecture team and parent-owned design/specification. No runtime
implementation, release publication, dependency installation or changes to owner
files. Maintain standalone offline use. Do not add public session validation
reports, private paths or generated traces.

## Initial questions

Checking cadence; install/reload behavior; optional helper versus HTML-only or
managed launcher. Further questions follow the user's answers and team findings.
