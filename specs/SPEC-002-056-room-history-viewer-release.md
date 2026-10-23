---
id: SPEC-002-056
title: Release viewer 3.0.0 with canonical 3.0.0 room history detection
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-23
nfrs: []
---

## Scope

Canonical 3.0.0 adds opt-in signed room inventories (`boardctl history`). The
viewer shares the standard's MAJOR.MINOR, so publish viewer 3.0.0 pinned to the
released canonical tag. The viewer does not display inventories yet; it must keep
ignoring `.agent-board/history/` and must not warn about a matching 3.0.0 board.
Keep 2.12.2 assets immutable and preserve runtime behavior.

## Acceptance Criteria

- [x] Pin released canonical v3.0.0; align viewer version, release notes, update
  fixtures and the embedded managed upgrade manifest (2.12.2 boards upgrade).
- [x] Bundle re-released canonical example packages (ranges `<4.0.0`); document
  CLI-only room history in the README, security FAQ and formal coverage table.
- [x] Protected normal and formal checks pass; publish the exact tested tag and
  verify downloaded payloads, checksums and live update discovery in Chromium and
  Firefox.

## Preparation

Pinned published canonical v3.0.0 at e7a8154 after its exact-tag Python 3.10–3.13
matrix and a downloaded source ZIP comparison (252 files match). Regenerated the
embedded managed manifest (3.0.0, supports 2.12.2). Version, future-update (3.0.1),
newer-board (4.0.0) and re-released example-package fixtures updated without
changing assertions; alignment reviewed. Locally: 528 of 532 node/browser tests and
59 Python tests pass; the 4 failing Firefox viewer-update tests fail identically on
unchanged main on this machine (headless Firefox graphics), so CI is the authority.

## Publication

Merged protected [PR #12](https://github.com/sloik/agent-file-board-ui/pull/12) at
24784a4 after required `test` and `bounded-models` passed (including the Firefox
viewer-update tests). Published [viewer v3.0.0](https://github.com/sloik/agent-file-board-ui/releases/tag/v3.0.0)
with canonical v3.0.0/e7a8154 pinned.
[Release workflow 39921152796](https://github.com/sloik/agent-file-board-ui/actions/runs/39921152796)
passed exact-tag tests, preparation, publication and downloaded-package verification:
all six assets matched checksums and tagged payloads, and the downloaded viewer
discovered stable 3.0.0 through the live checker in Chromium and Firefox. Earlier
releases remain immutable.
