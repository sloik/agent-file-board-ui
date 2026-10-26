---
id: SPEC-002-053
title: Publish viewer 2.12.1 signing usability release
status: done
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
- [x] Review changed formal anchors and obtain passing required checks before protected integration.
- [x] Publish an immutable version tag through the existing release workflow; verify downloaded assets against tagged source and live update discovery in Chromium and Firefox.


## Outcome

Viewer [v2.12.1](https://github.com/sloik/agent-file-board-ui/releases/tag/v2.12.1)
was published from the protected merge of PR7, retaining canonical core v2.12.1.
The exact candidate passed 532 JavaScript/browser tests, 59 Python tests and the
required bounded models. Main checks and exact-tag tests also passed.

[Release workflow](https://github.com/sloik/agent-file-board-ui/actions/runs/39824341419)
completed all stages: exact-tag tests, asset preparation, publication and
post-publication verification. All six downloaded assets matched checksums and
tagged source payloads. The downloaded viewer discovered the published version
through the live checker in Chromium and Firefox. No published assets or older
tags were replaced; raw verification output remains in Actions artifacts.
