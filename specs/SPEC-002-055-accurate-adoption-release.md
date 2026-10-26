---
id: SPEC-002-055
title: Release accurate signing adoption viewer package 2.12.2
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-22
nfrs: []
---

## Scope

Publish the merged signing adoption guides in accurate downloadable packages.
Pin released canonical 2.12.2, keep 2.12.1 assets immutable and preserve runtime behavior.

## Acceptance Criteria

- [x] Align viewer versions, release notes, current/future update fixtures and released core pin; regenerate the embedded managed upgrade manifest.
- [x] Include the corrected canonical docs and both offline signing guides, check package links/content and prior-version upgrades, and pass protected normal/formal checks.
- [x] Publish the exact tested tag through the release pipeline and verify actual downloaded payloads/checksums plus live update discovery in Chromium and Firefox.


## Preparation

Pinned published canonical v2.12.2 at4b398b6 after its tag matrix and downloaded
source comparison passed. Regenerated the embedded managed manifest; reviewed
version/future-update/upgrade fixture anchors without changing model semantics.
Local40version/posting/upgrade/package cases and fivePython package tests pass.
Prepared release assets locally; protected normal/formal CI gates integration.


## Publication

Published [viewer v2.12.2](https://github.com/sloik/agent-file-board-ui/releases/tag/v2.12.2)
from protected merge58c73d8 with released core2.12.2/4b398b6 pinned.
[Release workflow39845570226](https://github.com/sloik/agent-file-board-ui/actions/runs/39845570226)
passed exact-tag tests, preparation, publication and downloaded-package verification.
All six downloaded assets match checksums and tagged payloads; the downloaded
viewer discovers2.12.2 through the live checker in Chromium and Firefox.

The published ZIPs contain the walkthrough, security FAQ, corrected canonical
reference, accurate tour and matching viewer/core2.12.2 metadata. Older releases
remain immutable. No signing runtime or model semantics changed.
