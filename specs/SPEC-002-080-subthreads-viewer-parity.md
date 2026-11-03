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
- [x] AC4 (breadcrumb): the pane header keeps the root's author and preview readable at
  every pane width down to the compact layout. Room and topic shorten first, as a single
  "‹ Topic" back crumb. The full path stays available as the element's title and visible
  text when expanded. A layout snapshot at the minimum pane width and at 390px asserts the
  root label is not truncated to fewer than 12 characters.
- [x] AC5 (screenshots): `scripts/screenshot_subthreads.js` produces, from the demo board,
  all of: wide pane, phone pane, the Sub-threads list, the root strip with "Question for
  you", a resolved sub-thread, Promote to topic (dialog and the new topic's "Continued from
  a sub-thread"), Flat view, and Dark and Dracula themes for the pane. Output goes to
  `docs/images/subthreads/`. The README gets a sub-thread screenshot near Highlights;
  `docs/guides/SUBTHREADS.md` and `docs/FEATURES.md` use the new images with descriptive
  alt text. Existing `board-subthread-*.png` references are updated or kept consistent.
- [x] AC6 (guide): `docs/guides/SUBTHREADS.md` is updated to match the audited behaviour.
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

## Implementation notes (2026-11-03)

- AC3 (audit fixes): dispositions for every viewer row are in
  `docs/design/subthreads/SUBTHREAD-RULE-AUDIT.md`, section "Viewer dispositions". New tests:
  `tests/subthreads-parity.test.js` (rows 9, 11, 13-16, 19, 21-23, 25-29, 36, 37, 39) and additions to
  `tests/subthreads-canonical.test.js` (10, 30, 35) and the shared fixture `tests/lib/subthread-fixture.js`.
  #37 follows the parent ruling (see Amendments). AC3 stays open until the shared-fixture run (AC2) confirms
  the viewer against canonical v3.4.1.
- AC4: the header shortens room and topic to one "‹ T…" back crumb through container queries; below a
  360px header the crumbs take their own line. The full path is the title and expands on a click of the
  root label. `tests/subthreads-pane.test.js` "AC4 (SPEC-002-080)" measures drawn characters per character
  at a 320px pane (wide, medium) and at 390px; layout scene `subthread-pane-min`.
- AC5: `node scripts/screenshot_subthreads.js` (10 captures in `docs/images/subthreads/`).
- AC6: `docs/guides/SUBTHREADS.md` rewritten; FEATURES and README updated.
- Linux pixel baselines: subthread-view, subthread-view-390x640, subthread-pane-medium/-dark/-dracula change
  and subthread-pane-min is new; they must come from the update_visual_baselines CI run.


## Amendments

- **Amendment 2026-11-03 (AC2 parity contract, parent ruling):** every case in the vendored
  `tests/fixtures/subthreads/cases.json` carries a stable `rule` id from canonical. The viewer must match
  the `rule` id and the verdict exactly for every case, and the message text exactly for every sub-thread
  rule (`SUBTHREAD…`, `PROMOTED-FROM…`, reply-target, orphan and repair-header texts, and the warnings).
  For generic file-format errors (header separator, DATE, UTF-8 decoding) the test compares the `rule` id
  and the verdict, not Python's text. The viewer still adopts the two easy canonical wordings: the
  `parse_message` texts ("missing header separator", "duplicate header K", "missing header(s): …") and
  canonical 3.4.1's DATE text (and the short sender/status/language, recipient, filename and routing texts).
  For post and promote refusals that only the CLI words (#11 "use a later --at", #39's multi-line signing
  help) the test compares the rule id only (parent ruling 2026-11-03); everything `validate` reports is
  compared word for word. The viewer supports canonical fa5a9a8's rule ids `promote.root-invalid`,
  `promote.root-quarantined`, `subthread.root-invalid`, `orphan.root-unreadable` and
  `file.sender-status-language`. No case may be skipped; membership, main flow, state and orphans are compared
  as AC2 says.
- **Amendment 2026-11-03 (AC3, audit #37, parent ruling):** for all four sub-thread headers a repair
  replacement (a) keeps a header whose original value is valid byte for byte, (b) may correct or drop a
  header whose original value is invalid, (c) never adds a sub-thread header the original lacked, and
  (d) changes SUBTHREAD only under (b). Enforced in `saveRepair` and for existing records in `applyRepairs`,
  as canonical `message_repairs`. A correction (#38) copies only SUBTHREAD (optionally SUBTHREAD-ALSO); the
  viewer has no correction writer.
