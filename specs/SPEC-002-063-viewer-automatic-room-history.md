---
id: SPEC-002-063
title: Viewer support for automatic room history and per-room signing at creation
status: done
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Canonical 3.3.0 (SPEC-002-062) lets a room or thread record its signed history
automatically from each signed CLI post, declared at creation together with an
optional trusted-signature requirement (new top-level `room_history` key in
config.json; `boardctl post --new-room/--new-thread --record-history
--require-signing trusted`; `boardctl history policy`). Owner request: control
signing and history at room/thread level when the room or thread is created. The
viewer must understand, display and offer this.

## Constraints

- Every security layer stays opt-in (defaults off). Advisory only.
- The browser has no inventory signer yet: the viewer cannot record history. It
  must say so honestly rather than pretend.
- Private keys never leave the tab; nothing new is stored in the board except
  shared policy written by an explicit, confirmed user action.
- Writes to `config.json` use the same rules as the CLI (exact bytes reviewed,
  refuse on concurrent change, never weaken without an explicit confirmation).

## Acceptance criteria

- [x] AC1: A board whose config.json has `room_history` opens and verifies exactly
  as before (signing policy unaffected); malformed `room_history` is reported in
  the history panel, never breaks the board.
- [x] AC2: History panel per room shows the declared setting ("Records
  automatically on signed posts" for the room / named threads), who has recorded
  ("Recorded by Maya, Sam") with each recorder's key status, and for recorders
  whose key this device has not approved: "Records by X count here only after
  you approve X's key", with a button to the fingerprint review.
- [x] AC3: Composer, when creating a new room or new topic: options "Require
  trusted signatures" and "Record room history automatically" (off by default).
  They are written to config.json with the CLI's semantics before the first
  message, only for a room/thread with no messages; existing rooms are refused
  and pointed to the explicit setting action. The composer signing status
  (SPEC-002-061) reflects "required" immediately.
- [x] AC4: A signed post from the viewer into a recording scope shows a clear
  "Not recorded by this viewer: record with `boardctl history observe` or post
  from the CLI" note (the browser cannot sign inventories yet), never a silent gap.
- [x] AC5: An explicit per-room/thread settings action (room menu) changes
  recording on/off and trusted requirement for existing rooms, with confirmation
  and an extra confirmation for weakening (turning off), mirroring
  `history policy --weaken` / `signing require`.
- [x] AC6: Tests: unit tests for parsing/writing `room_history` (shared fixtures
  with canonical where possible), browser tests for AC1–AC5 incl. Polish and
  phone width, a CLI-recorded room showing "Recorded by" in the viewer, and a
  concurrent config change refused. Existing formal alignment stays current.
- [x] AC7: Docs (guides, CHANGELOG) and release as viewer 3.3.0 with canonical 3.3.0.
