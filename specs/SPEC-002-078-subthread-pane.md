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

- [x] AC1 (render containers): the feed renderer and the mount/preserve helpers currently
  bound to `#feed` are parametrized by container. That covers reports, forms, extensions,
  answer review, disclosure observer, image viewer, delegated click handling and reading
  position. Main feed behaviour is byte-for-byte unchanged in existing text/layout
  snapshots. A message's interactive body renders in exactly one container. Ids, mount
  registries and disclosure keys stay unique.
- [x] AC2 (pane layout): ≥1200 px: a fourth grid column on the right, resizable with the
  same divider and persistence as existing panels (panel-layout.js), width remembered.
  Medium (compact-layout breakpoint up to 1199 px): an overlay sheet over the transcript.
  Compact (SPEC-002-068 phone layout): full screen with a Back button. Opening and closing
  never shifts the main feed's reading position.
- [x] AC3 (pane header): breadcrumb "Room › Topic › 🧵 <root preview>", follow bell toggle,
  overflow menu (Resolve/Reopen, Promote to topic, Copy link to root, Flat view), close
  (✕). The pinned root is collapsible (collapsed by default when it is a long report, form
  or question). A form, report or question root shows a folded, non-interactive preview with
  "Show in main thread ↗", which goes to its one interactive rendering in the main feed (compact:
  closes the pane and shows "Back to sub-thread"). Esc closes the pane and keeps its draft; focus
  returns to the strip. (Amended 2026-11-03, see Amendments.)
- [x] AC4 (pane transcript): members in canonical posting order. The newest 50 load first,
  with Older paging, a "New messages" divider at the reader's first unread, a "N new" pill
  and Latest when not at the bottom. Runs of more than 20 consecutive routine agent messages
  (INFO, not addressed to the reader, no question) collapse into an expandable stub;
  questions, statuses and messages to the reader stay visible. Signing badges, choices,
  forms, answer acceptance and the room-history missing-message check work inside the
  pane. A REPLY-TO link to a main-flow message scrolls/highlights it in the main feed
  (compact: closes the pane and shows a "Back to sub-thread" chip).
- [x] AC5 (pane composer): a second composer instance in the pane, labelled "Posting to 🧵
  sub-thread of <author>: <preview>". It has its own draft keyed by board + room + thread +
  root and survives refresh, reload and pane close. It has the same signing status line,
  options and Send rules as the main composer, and applies the thread's signing
  requirement banner. "Also send to the main thread" checkbox writes `SUBTHREAD-ALSO:
  main`. A reply to a specific member sets `REPLY-TO` to it. The main composer keeps its
  own destination, and neither composer's draft ever moves to the other. When both are
  visible the destinations are visually distinct.
- [x] AC6 (resolve/reopen): Resolve asks for a one-line outcome and posts a member with
  `SUBTHREAD-STATE: resolved` and a normal status (DONE). Reopen posts `open`. The strip and
  list update (077 AC4/AC8). A resolved pane shows a banner with the outcome, and posting
  stays allowed.
- [x] AC7 (promote): Promote to topic asks for a title. It writes the new topic's first
  message with `PROMOTED-FROM` and a body linking back, then the resolving member naming the
  new topic, the same bytes as `boardctl promote`. Then it navigates to the new topic. The
  new topic's first message shows "Continued from a sub-thread" with a jump link. A second
  write failure is reported, and nothing is deleted.
- [x] AC8 (follow): the per-sub-thread follow/mute state lives in the existing local
  notification rules (follow rooms/threads/participants gains sub-threads, keyed by board +
  room + thread + root). Starting or replying in a sub-thread auto-follows it. A muted
  sub-thread suppresses alerts for its members even when the topic is followed. Quick reply
  from an alert for a member posts into that sub-thread.
- [x] AC9 (tests): browser tests for wide, medium and compact pane layouts. They cover
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

## Implementation notes (2026-11-03)

- AC1: `render()` builds each message with `messageArticleHtml(m, ctx)` and replaces a container with
  `paintMessages(container, html)` (expanded messages, disclosures, review/information state, focused choice
  form, form caret, moved report/form/extension nodes). `mountReports`, `mountForms`, `bindAnswerChoices`,
  `mountExtensions`, `preserveReviewState` and `preserveInformationState` scan `messageContainers()` (`#feed`,
  `#subFeed`); the delegated handlers live in `wireMessageContainer(el)`. Proof of "unchanged": commit cf8f7de
  passed render/compose/subthreads and every visual layout snapshot with no snapshot update. One rendering per
  message: the pane owns the open sub-thread's members (the main flow shows them as stubs while the pane is open,
  whatever Flat view or search say), the main feed owns the root and everything else; pane articles use `sm-`
  ids, so ids, mount registries and disclosure keys stay unique (tested).
- AC2: `sel.sub` (keys only) now opens `#subPane` instead of filtering the transcript; the main window key and the
  main composer ignore it. CSS: a 4th grid column under `body.sub-open` at >=1200px (closed-state templates
  unchanged), a fixed sheet at 821-1199px, full screen under the top bar at <=820px with Back. Width `S.subW`
  (default 420, 320 to 60% of the conversation area) through `scripts/panel-layout.js` (`wireSubPaneLayout`, the
  Settings handle pattern). `holdFeedPosition` keeps the first visible main message at its offset on open and
  close, also against the composer's live-edge rule when its chip row appears: only a reader who scrolled to
  the end keeps following it (`composerFeedFollowing`); a reader who has not scrolled keeps the top even in a topic
  barely taller than the window.
- Decision (medium windows): the spec names both composers only for wide windows. From 821 to 1199px the sheet
  covers the transcript's right side including Post, so, as on compact windows, only the pane composer is
  reachable while the pane is open; the main composer keeps its draft (hidden and inert, never removed).
- AC3 (as amended below): no generic modal exists for forms (reports have their own in-report Open modal), and
  moving a mounted form between containers would break the one-rendering rule. The pinned root is a preview
  (folded for a long, form, report, question, extension or information root) with **Show in main thread ↗**,
  which scrolls the main feed to the one interactive rendering (compact: closes the pane and shows "Back to
  sub-thread"). "Copy link to root" copies the root's board path (the viewer has no URL routing).
- AC4: window of 50 by paths (`subPane.start/end`), Older by 50, at most 150 rendered, divider at the first unread
  computed when the pane opens, "N new" counted from the last time the reader was at the end, Latest. A routine
  message is INFO, from an agent, not addressed to the reader and without a question; runs of more than 20 fold
  into one stub, and the first unread row breaks a run.
- AC5: pane drafts (body, status, format, language, also-send, reply target) are stored in IndexedDB under
  `subthread-drafts-v1:<board id>` keyed `[board, dkey, topic key, root]`, at most 50; uploads keep them for the
  session; the textarea is disabled until hydration. `subSend`/`subPostMessage` sit outside the sliced `sendImpl`
  section and post through `deliverMessage` (signing, final-writer guard, read-only download).
  `signingDraftStamp` also covers `#subComposer`. `signingNoticePaint` paints each status row with its own status;
  `signingPostBlock({scope, dir, tid})` gives the pane's own destination. While the pane is open on a wide
  window the main composer's chip row is shown, so both destinations are named.
- AC6/AC7: Resolve posts DONE + `SUBTHREAD-STATE: resolved` replying to the root; Reopen posts INFO + `open`.
  Promote mirrors `command_promote` (slug and label rules, both bodies, INFO on both, `PROMOTED-FROM` last via
  `composeMessage`); compared byte for byte with `boardctl promote --at` apart from POSTED-AT and RUNTIME, then
  validated. The first message of a promoted topic shows "Continued from a sub-thread", which opens the source.
- AC8: follow kinds `subthread` and `subthread-mute` keyed `topic key|root`; a mute wins over room, topic and
  participant follows; Quick reply on a member opens the pane composer and checks that sub-thread's draft.
  Decision: auto-follow on posting never overrides an explicit mute.
- Unchanged from SPEC-002-077: a topic title is still refused while a sub-thread is open; `#cSub` remains the main
  composer's sub-thread dimension but nothing sets it any more (the pane composer is the sub-thread writer).
- AC9: `tests/subthreads-pane.test.js` (15 tests) and the updated `tests/subthreads.test.js` /
  `tests/subthreads-canonical.test.js`; visual scenes `subthread-view` (wide), `subthread-view-390x640` (phone),
  `subthread-pane-medium`, `subthread-pane-dark`, `subthread-pane-dracula` with layout snapshots. AC9 stays open
  until their Linux pixel baselines come from the `update_visual_baselines` workflow.
- AC10 (docs part done): docs/guides/SUBTHREADS.md, FEATURES section, README row, CHANGELOG 3.4.0 (077 + 078),
  two captures from `scripts/screenshot_subthreads.js`, demo topic architecture/T017. The PR, tag and release
  verification are left to the coordinator.

## Amendments

- **Amendment 2026-11-03 (AC3, accepted by the coordinator):** AC3 asked that forms and reports open "in
  their existing modal from the pane". No generic modal exists for forms (reports only have their in-report
  Open modal), and mounting the root's form or report in the pane as well would render one interactive body
  twice, which AC1 forbids. The one-rendering rule wins: the pinned root is a folded preview with "Show in main
  thread ↗" to the single interactive rendering in the main feed; on compact windows that closes the pane and
  offers "Back to sub-thread". Tested in `tests/subthreads-pane.test.js` (one rendering, preview without
  controls, compact Back chip).


AC9 evidence (2026-11-03): Linux pixel baselines for the pane scenes (new subthread-pane-medium/-dark/-dracula, regenerated subthread-view and subthread-view-390x640) rendered by CI run 41702625018 and committed in 360ab90.
