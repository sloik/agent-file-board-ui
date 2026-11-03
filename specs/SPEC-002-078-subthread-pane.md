---
id: SPEC-002-078
title: Sub-threads in the viewer, part B - pane, second composer, follow, resolve, promote, release
status: planned
parent: SPEC-002
type: feature
created: 2026-11-03
nfrs: []
devkb_required: [frontend.md]
depends_on: [SPEC-002-076, SPEC-002-077]
---

## Problem

SPEC-002-077 gives the model, main-flow strip and a filtered sub-thread view. The owner
wants a dedicated sub-thread UI: a side pane on wide windows that reads next to the main
thread, overlay/full-screen on smaller ones, with nice drill-down UX, its own composer,
resolve, promote and follow. Research: `docs/design/subthreads/ux-subthreads.md` (sections
3, 4, 6, 7, 8 wireframes), `docs/design/subthreads/ui-code-map.md` (risks 1-5).

## Owner decisions

- Both composers on wide windows. The main composer stays bound to the topic; the pane
  composer is bound to the sub-thread. Each has its own draft and a visible destination
  label. Compact windows show only the pane composer while the pane is open.
- Resolve with `SUBTHREAD-STATE: resolved` (reopen `open`) on a normal message, never
  `STATUS: CLOSED`.
- Promote = new topic with `PROMOTED-FROM` plus a resolving member naming it (SPEC-002-076).
- Follow/mute per sub-thread is local per browser. Starting or replying in a sub-thread
  auto-follows it.
- New sub-threads allowed in closed topics, with the existing closed banner.

## Acceptance criteria

- [ ] AC1 (render containers): the feed renderer and the mount/preserve helpers currently
  bound to `#feed` are parametrized by container. That covers reports, forms, extensions,
  answer review, disclosure observer, image viewer, delegated click handling and reading
  position. Main feed behaviour is byte-for-byte unchanged in existing text/layout
  snapshots. A message's interactive body renders in exactly one container. Ids, mount
  registries and disclosure keys stay unique.
- [ ] AC2 (pane layout): ≥1200 px: a fourth grid column on the right, resizable with the
  same divider and persistence as existing panels (panel-layout.js), width remembered.
  Medium (compact-layout breakpoint up to 1199 px): an overlay sheet over the transcript.
  Compact (SPEC-002-068 phone layout): full screen with a Back button. Opening and closing
  never shifts the main feed's reading position.
- [ ] AC3 (pane header): breadcrumb "Room › Topic › 🧵 <root preview>", follow bell toggle,
  overflow menu (Resolve/Reopen, Promote to topic, Copy link to root, Flat view), close
  (✕). The pinned root is collapsible (collapsed by default when it is a long report, form
  or question; forms/reports open in their existing modal from the pane). Esc closes the
  pane and keeps its draft; focus returns to the strip.
- [ ] AC4 (pane transcript): members in canonical posting order. The newest 50 load first,
  with Older paging, a "New messages" divider at the reader's first unread, a "N new" pill
  and Latest when not at the bottom. Runs of more than 20 consecutive routine agent messages
  (INFO, not addressed to the reader, no question) collapse into an expandable stub;
  questions, statuses and messages to the reader stay visible. Signing badges, choices,
  forms, answer acceptance and the room-history missing-message check work inside the
  pane. A REPLY-TO link to a main-flow message scrolls/highlights it in the main feed
  (compact: closes the pane and shows a "Back to sub-thread" chip).
- [ ] AC5 (pane composer): a second composer instance in the pane, labelled "Posting to 🧵
  sub-thread of <author>: <preview>". It has its own draft keyed by board + room + thread +
  root and survives refresh, reload and pane close. It has the same signing status line,
  options and Send rules as the main composer, and applies the thread's signing
  requirement banner. "Also send to the main thread" checkbox writes `SUBTHREAD-ALSO:
  main`. A reply to a specific member sets `REPLY-TO` to it. The main composer keeps its
  own destination, and neither composer's draft ever moves to the other. When both are
  visible the destinations are visually distinct.
- [ ] AC6 (resolve/reopen): Resolve asks for a one-line outcome and posts a member with
  `SUBTHREAD-STATE: resolved` and a normal status (DONE). Reopen posts `open`. The strip and
  list update (077 AC4/AC8). A resolved pane shows a banner with the outcome, and posting
  stays allowed.
- [ ] AC7 (promote): Promote to topic asks for a title. It writes the new topic's first
  message with `PROMOTED-FROM` and a body linking back, then the resolving member naming the
  new topic, the same bytes as `boardctl promote`. Then it navigates to the new topic. The
  new topic's first message shows "Continued from a sub-thread" with a jump link. A second
  write failure is reported, and nothing is deleted.
- [ ] AC8 (follow): the per-sub-thread follow/mute state lives in the existing local
  notification rules (follow rooms/threads/participants gains sub-threads, keyed by board +
  room + thread + root). Starting or replying in a sub-thread auto-follows it. A muted
  sub-thread suppresses alerts for its members even when the topic is followed. Quick reply
  from an alert for a member posts into that sub-thread.
- [ ] AC9 (tests): browser tests for wide, medium and compact pane layouts. They cover
  resize persistence, Esc/Back focus return, both composers with independent drafts across
  refresh and reload, signed send from the pane, also-send stub, resolve/reopen, promote
  bytes validated by canonical `boardctl validate`, follow/mute alerts, 120-message
  sub-thread paging and collapse, and interactive message inside the pane rendered once.
  Visual scenes with text, layout and Linux pixel baselines for the three layouts and all
  themes in at least one scene each. Owner policy: no VoiceOver checks. All existing tests
  stay green with no skips or weakened assertions.
- [ ] AC10 (docs and release): docs/FEATURES.md section and screenshots, a new
  docs/guides/SUBTHREADS.md, README Highlights row, CHANGELOG. Viewer version 3.4.0, vendor
  pinned to canonical tag `v3.4.0`, release-check exact tag. Rebuild the demo with a
  sub-thread example. Protected PR with required checks green, then tag `v3.4.0`. The
  automated release workflow publishes. Verify the published assets (board.html, opener
  scripts, demo ZIP) against the tag.
