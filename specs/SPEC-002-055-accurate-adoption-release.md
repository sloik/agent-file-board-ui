---
id: SPEC-002-055
title: Release accurate signing adoption viewer package 2.12.2
status: in_progress
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
- [ ] Include the corrected canonical docs and both offline signing guides, check package links/content and prior-version upgrades, and pass protected normal/formal checks.
- [ ] Publish the exact tested tag through the release pipeline and verify actual downloaded payloads/checksums plus live update discovery in Chromium and Firefox.


## Preparation

Pinned published canonical v2.12.2 at4b398b6 after its tag matrix and downloaded
source comparison passed. Regenerated the embedded managed manifest; reviewed
version/future-update/upgrade fixture anchors without changing model semantics.
Local40version/posting/upgrade/package cases and fivePython package tests pass.
Prepared release assets locally; protected normal/formal CI gates integration.
