---
id: SPEC-002-037
title: Automate browser signing lifecycle and interoperability scenarios
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Turn the manually exercised browser/CLI signing journeys into repeatable tests.
Reuse existing coverage rather than duplicate it. No public run receipts or logs.

## Acceptance Criteria

- [ ] AC1: Playwright exercises explicit key unlock and independent viewing,
  signing and recipient identities. Browser-created exact bytes independently
  verify in the Python CLI; CLI-signed replies verify in the browser.
- [ ] AC2: Exercise actual dialog trust and floor adoption: an incorrect
  fingerprint refuses trust, required untrusted traffic is excluded, and explicit
  correct trust enables it. Rotation clears the old capability, excludes old-key
  traffic under required policy and requires explicit new-key trust.
- [ ] AC3: Compromise excludes previously accepted new-key traffic. Browser and
  CLI retain learned compromise and adopted requirements after shared policy and
  event removal. Reload retains private decisions but drops unlocked capability.
- [ ] AC4: Unit tests cover lifecycle reconciliation and retained-state decisions
  at relevant boundaries. New tests use disposable keys/state, deterministic
  synchronization and cleanup. Existing signing and full project suites pass.

## Scope and limits

Tests/helpers only unless a regression demonstrates a runtime defect. Exercise
native browser filesystem operations through OPFS when available in the pinned
Chromium; headless tests do not automate OS folder-picker permission dialogs.
CLI/browser exchange exact board snapshots through the test harness. Do not
change canonical vendor, frozen releases, keys or real owner boards.
