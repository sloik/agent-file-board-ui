---
id: SPEC-002-038
title: Release current work then close signing unit coverage gaps
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Release the existing documentation cleanup and signing journeys before changing
signing coverage further. Close the identified browser-unit gaps with explicit
positive controls and rejection assertions, preserving existing tests.

## Acceptance Criteria

- [x] AC1: Publish and download-verify UI2.11.2 from the current source plus release
  metadata before implementing the additional unit cases. Keep canonical2.11.0
  and prior releases immutable; no session reports in public documentation/assets.
- [x] AC2: Unit matrices reject wrong signature context/type/shape/multiplicity,
  malformed lifecycle chains, rollback, unauthorized/conflicting transitions and
  retired keys, while preserving valid controls.
- [x] AC3: Unit matrices cover board/room/direct/stable-thread policy inheritance
  and adopted-floor merges without weakening or broadening unrelated scopes.
- [x] AC4: Deterministic async tests cover crypto rejection and lock/expiry during
  import, possession or signing. Multiple identities, partial unlock failure and
  catalog/evidence/history budgets have explicit boundary assertions.
- [x] AC5: Run existing and new signing tests and full project checks; fix any
  demonstrated defect without weakening assertions. Commit/push integrated work,
  and publish a follow-up if runtime behavior changes.

## Scope

Release metadata and signing tests/helpers; runtime changes only for demonstrated
failures. No real owner keys/boards, history rewrite or public run receipts. OS
picker permission dialogs remain outside unit/headless coverage.
