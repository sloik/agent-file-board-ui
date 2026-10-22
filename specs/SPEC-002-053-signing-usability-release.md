---
id: SPEC-002-053
title: Publish viewer 2.12.1 signing usability release
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-22
nfrs: []
---

## Scope

Publish the merged signing journeys and emoji message states as viewer 2.12.1.
Keep the released canonical core pin and all existing test/formal obligations.

## Acceptance Criteria

- [x] Align viewer/package versions, changelog and current-version fixtures; retain future-update and mismatch coverage.
- [ ] Review changed formal anchors and obtain passing required checks before protected integration.
- [ ] Publish an immutable version tag through the existing release workflow; verify downloaded assets against tagged source and live update discovery in Chromium and Firefox.
