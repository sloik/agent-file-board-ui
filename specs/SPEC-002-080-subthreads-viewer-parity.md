---
id: SPEC-002-080
title: Sub-threads in the viewer - audited rule parity, shared fixtures, breadcrumb, screenshots, guide
status: in_progress
parent: SPEC-002
type: feature
created: 2026-11-03
nfrs: []
devkb_required: [frontend.md, formal-verification.md]
depends_on: [SPEC-002-079]
---

## Problem

Owner (2026-11-03): "do the audit if actually rules do match, add tests, add screenshots,
update documentation". The viewer shipped sub-threads in 3.4.0 (SPEC-002-077/078). The rule
audit is `docs/design/subthreads/SUBTHREAD-RULE-AUDIT.md`, the same file as the canonical
`docs/SUBTHREAD-RULE-AUDIT.md`. Canonical SPEC-002-079 adds the TLA+ model, shared fixtures
`tests/fixtures/subthreads/cases.json`, and fixes canonical findings in v3.4.1. The pane
breadcrumb collapses to `#… › T…` when the pane is narrow.

## Acceptance criteria

- [ ] AC1 (pin): vendor pinned to canonical `v3.4.1`, with the version fixtures and
  `formal/check_alignment.py` pins updated after review.
- [ ] AC2 (shared fixtures): a new test runs every case in the vendored
  `tests/fixtures/subthreads/cases.json` through the viewer. It checks verdict, error text,
  membership, main-flow visibility (stub or hidden), resolved/open state and orphan
  status, and fails on any difference. No case may be skipped. It must cover the S4
  arrival-order and tie cases and the S5 concurrent-writer cases from SPEC-002-079.
- [ ] AC3 (audit fixes): every MISMATCH and GAP marked viewer in the audit is fixed, or
  dispositioned with a reason in the audit file, with a failing-then-passing test for each
  fix. Docs that contradict the code are corrected.
- [ ] AC4 (breadcrumb): the pane header keeps the root's author and preview readable at
  every pane width down to the compact layout. Room and topic shorten first, as a single
  "‹ Topic" back crumb. The full path stays available as the element's title and visible
  text when expanded. A layout snapshot at the minimum pane width and at 390px asserts the
  root label is not truncated to fewer than 12 characters.
- [ ] AC5 (screenshots): `scripts/screenshot_subthreads.js` produces, from the demo board,
  all of: wide pane, phone pane, the Sub-threads list, the root strip with "Question for
  you", a resolved sub-thread, Promote to topic (dialog and the new topic's "Continued from
  a sub-thread"), Flat view, and Dark and Dracula themes for the pane. Output goes to
  `docs/images/subthreads/`. The README gets a sub-thread screenshot near Highlights;
  `docs/guides/SUBTHREADS.md` and `docs/FEATURES.md` use the new images with descriptive
  alt text. Existing `board-subthread-*.png` references are updated or kept consistent.
- [ ] AC6 (guide): `docs/guides/SUBTHREADS.md` is updated to match the audited behaviour.
  It covers each action with its screenshot, keyboard use (Esc, Enter on the strip), what
  agents see (link to canonical `docs/SUBTHREADS.md`), and troubleshooting for orphans,
  validation refusals and signing in the pane.
- [ ] AC7 (formal): if the viewer computes resolved state or validity, the UI formal
  alignment anchors that code and maps it to the shared fixture test. Any new UI model or
  trace is optional; parity with the canonical model is proven through the shared fixtures
  (AC2). Alignment stays current, and the bounded-models CI job passes.
- [ ] AC8 (tests and release): full `npm test` green in CI, with no skips or weakened
  assertions. Linux pixel baselines for new or changed scenes come from the
  update_visual_baselines CI run. Viewer 3.4.1, CHANGELOG, protected PR, tag `v3.4.1`. The
  release workflow publishes, and the published assets are verified.
