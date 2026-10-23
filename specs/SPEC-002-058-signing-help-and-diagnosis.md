---
id: SPEC-002-058
title: Explain signing keys in the viewer and show why posting is blocked
status: done
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner report (2026-10-23): managing signing keys is still hard. Users cannot tell
why they sometimes cannot post, what is missing, how to add and trust keys, or
why any of this is needed. New users need explanations, with diagrams showing
what will happen and why, on the signing page as extra help and in repository
documentation.

## Acceptance criteria

- [x] AC1: When posting is blocked or would be refused for a signing reason, the
  composer says exactly which condition is missing (for example: this room
  requires trusted signatures; no key is unlocked; the selected signer's key is
  not approved on this device; the key is revoked or rotated; the board has no
  identity UUID; the folder is read-only) and offers the one next step that fixes
  it (a button or link into the right signing task). Never a generic failure.
- [x] AC2: The signing dialog has an always-available "How signing works" help
  with diagrams (inline SVG or equivalent, offline, theme-aware, EN and PL):
  what a key is versus approving someone's key; what happens when you sign and
  when others verify; why a required room refuses unsigned or unapproved posts;
  a decision flow "Why can't I post?" matching AC1's conditions.
- [x] AC3: Plain-language copy for new users throughout the signing tasks: why
  each step exists, what is stored where (private key never leaves the device's
  explicit import; approvals are local), and what is safe to share.
- [x] AC4: Repository docs: docs/guides/signing.md (or a new linked guide) gains
  the same diagrams (Mermaid or committed SVG) and a troubleshooting table
  "symptom → reason → fix" consistent with the in-app wording.
- [x] AC5: Browser tests prove each blocked reason shows its specific message and
  next step, the help opens with diagrams in EN and PL, at phone width and in dark
  theme; existing suites, embeds and formal alignment checks pass (report stale
  anchors to the parent; do not refresh them). No VoiceOver checks.
