---
id: SPEC-002-067
title: Viewer names the conventional private key folder
status: done
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner (2026-10-23): "does the board define convention or gives hint where to place it?
add that". Canonical SPEC-002-066 defines `~/private/afb/<project-id>/<participant-id>.json`
(override `AGENT_FILE_BOARD_KEY_DIR`) and makes `boardctl signing keygen` default to it.
The viewer only said "The key file must be on this device." and "Keep your private key
file safe, outside the board folder."

## Acceptance criteria

- [x] AC1: The composer unlock hint reads "The key file must be on this device, usually
  in ~/private/afb/<project-id>/" with the open board's `project.id` (placeholder when
  absent or unsafe), English and Polish.
- [x] AC2: Signing help "New here and have no key yet?" gives the keygen command, the file
  it writes, and the never-in-board/repository/synced-folder rule; each person and agent
  holds only its own key.
- [x] AC3: Browser tests assert both texts with the fixture's project id; the viewer
  signing guide documents the location and why it is visible (file pickers hide
  dot-folders).
- [x] AC4: Released as viewer 3.3.3 with the canonical 3.3.1 vendor pin.
