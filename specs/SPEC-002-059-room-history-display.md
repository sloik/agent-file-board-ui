---
id: SPEC-002-059
title: Show room history detection in the viewer (3.1)
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Canonical 3.0/3.1 detect committed messages that later go missing or change
(`boardctl history`), but only CLI users see it. The owner chose to finish this
layer in 3.1 before encryption. The viewer must show the same results to humans,
following the canonical contract in vendor/agent-file-board/docs/SIGNED-ROOM-HISTORY.md
(sections 1, 2, 4, 5 "Viewer", 8) and agreeing with the frozen vectors in
vendor/agent-file-board/tests/fixtures/room-history/vectors.json.

## Acceptance criteria

- [ ] AC1: Browser implementation of inventory parsing and verification identical to
  the canonical rules (payload type, single signature, statement grammar, sorting,
  case aliases, scope with the configured direct directory, limits), using the
  viewer's existing Ed25519 verification, profile lineage and local key approvals.
  Only inventories whose key the viewer's local approvals trust create expectations.
- [ ] AC2: Status evaluation identical to the canonical precedence: observed states,
  per-key source status (revoked first), acknowledgement overlay where applicable,
  needsAttention and neutral. A JS test runs every vector in vectors.json and must
  match all of them.
- [ ] AC3: Private viewer checkpoint stored like local approvals (writable native
  boards: persisted against stable folder identity and board UUID; read-only
  uploads: session only). Shared deletion never removes expectations; a board UUID
  change refuses rather than resets; no silent eviction; bounded verification
  window reported as incomplete.
- [ ] AC4: Per-room "Missing-message check" indicator and details panel as the
  design's Viewer section describes: "Not set up", counts, "seen from this folder
  only", "N observations not yet checked", neutral tier for unavailable or
  unverifiable, short warning tier for changed or conflicting, "recorded by a signer
  you no longer trust", never the word "deleted", no lock icon, no notification or
  unread effect, and an offline "what this does not protect" explanation. EN and PL,
  all themes, phone width.
- [ ] AC5: Display only: the viewer never writes inventories, never changes messages
  or eligibility, and makes no network requests. Tests cover detection after a
  message and the shared inventory are removed, untrusted inventories, revocation,
  read-only upload, and the vectors; existing suites, embeds and formal alignment
  checks pass (report stale anchors to the parent; do not refresh them).
