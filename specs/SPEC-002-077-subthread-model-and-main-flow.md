---
id: SPEC-002-077
title: Sub-threads in the viewer, part A - model, main-flow summary, list, unread
status: done
parent: SPEC-002
type: feature
created: 2026-11-03
nfrs: []
devkb_required: [frontend.md]
depends_on: [SPEC-002-076]
---

## Problem

Owner (2026-11-03): Slack-style sub-threads with their own UI, all existing features
still working. The canonical format is SPEC-002-076 (agent-file-board 3.4.0): headers
`SUBTHREAD: <root filename>`, `SUBTHREAD-ALSO: main`, `SUBTHREAD-STATE: resolved|open`,
`PROMOTED-FROM: <root filename>`. A plain `REPLY-TO` reply stays in the main flow.
Starting a sub-thread is explicit.

This spec teaches the viewer the model and the main-flow presentation. SPEC-002-078 adds
the sub-thread pane and its composer. This spec must ship as a usable state on its own:
until 078 lands, the strip's action opens the existing transcript filtered to the
sub-thread (see AC5).

Research: `docs/design/subthreads/ui-code-map.md` (integration points with line numbers)
and `docs/design/subthreads/ux-subthreads.md` (UX, wireframes). Owner decisions win where
they differ.

## Owner decisions

- Main view: members are hidden from the main flow. The root shows a summary strip. A
  member with `SUBTHREAD-ALSO: main` also appears in the main flow as a **non-interactive
  stub** with a jump link. An interactive body (form, choices, OpenUI report) renders
  exactly once per document. A "Flat view" toggle restores today's flat display.
- Urgent items do not auto-surface. The strip shows a capsule for an open question
  addressed to the reader or a `DECISION-NEEDED` member.
- Resolved sub-threads collapse: the strip shows "Resolved" with the outcome line and no
  longer counts as active.
- One level of nesting.

## Acceptance criteria

- [x] AC1 (vendor): `vendor/agent-file-board` is pinned to the canonical commit that ships
  SPEC-002-076 (tag `v3.4.0` for the release; the merged main commit is fine during
  development). `formal/check_alignment.py` and expected-board-version fixtures are
  updated, with no anchors weakened.
- [x] AC2 (model): `buildModel` parses the four headers into message fields. One index maps
  root filename to its member list (ordered by the canonical posting order), participants,
  last activity, latest state, and its `SUBTHREAD-ALSO` members. The viewer applies the same
  validation as canonical `check_message` (SPEC-002-076 AC2) through `nativeIssue` /
  `messageMetadata`. Invalid sub-thread headers isolate the message like other invalid
  files. An orphaned member (root missing) is listed under "Orphaned" and never dropped. A
  shared fixture set is checked against both the viewer and canonical `boardctl validate`.
- [x] AC3 (main flow): `matchingMessages()` excludes members unless they carry
  `SUBTHREAD-ALSO: main` (shown as a stub) or Flat view is on. Flat view is a saved
  preference, default off. Reply links, history windows, Older/Newer/Latest, precise order
  and jump-to-message keep working. A jump to a hidden member opens its sub-thread (AC5).
- [x] AC4 (summary strip): under each root with at least one member, show the reply count,
  up to 3 participant colour dots from the stable palette (+N), relative last activity, an
  unread dot, and a capsule (question for you / decision needed) or "Resolved". It is
  computed from headers only, with no extra body reads. It is a button labelled e.g.
  "5 replies, last 3 min ago". It works in all themes (System/Light/Dark/Dracula) and at
  320 px.
- [x] AC5 (opening): the strip, keyboard (Enter on the strip) and the per-message action
  "Start sub-thread" (🧵, separate from Reply, in the message `.tools` row) select a
  sub-thread view. Before SPEC-002-078 this view is the main transcript filtered to root +
  members, under a "Room › Topic › 🧵 sub-thread" bar with Back. The composer then targets
  the sub-thread (writes `SUBTHREAD`, default `REPLY-TO` = root) through the existing
  composer-destination and draft-pin rules: a draft never moves silently.
  "Start sub-thread" on a member is not offered (one level).
- [x] AC6 (stamping): every writer that composes a message in the sub-thread destination
  stamps the canonical headers. That means `sendImpl`, `sendChoice`, form answer, form
  acceptance, extension answer, and topic-title (refused in a sub-thread). Answers to a
  member question carry the marker. Bytes are validated by canonical `boardctl validate` in
  tests. Read-only browsers download the same file.
- [x] AC7 (unread and counts): `threadsOf()` and the sidebar keep counting members toward
  the topic's unread badge, status and activity. A hidden member still raises the topic
  badge and the root strip's unread dot. Marking read follows what is displayed: opening a
  sub-thread marks its displayed members read. The main flow does not mark hidden members
  read. Thread follow notifications still fire for members.
- [x] AC8 (discovery): the topic bar shows "Sub-threads (n)" when n > 0. It opens a list:
  active first, then resolved, then orphaned. Each row shows the root preview, count, unread
  and last activity. Full-board search finds members and opens them in their sub-thread.
- [x] AC9 (refresh): background refresh preserves the selected sub-thread view, scroll
  position, focus and drafts. Selection is stored as keys (room, thread, root filename) and
  re-resolved each render. Reload restores it through the existing remembered view.
- [x] AC10 (i18n): all new strings exist in English and Polish (no Polish copy equal to
  English, placeholders matched). Counts use a plural-safe helper (add Polish
  one/few/many forms if missing).
- [x] AC11 (tests): unit tests for the index, validation parity fixture and stamping.
  Browser tests for hidden members, stubs, the strip, the unread badge on a hidden reply,
  filtered sub-thread view, composer destination pin, refresh and reload preservation,
  Flat view, search. New visual scenes (strip, list, sub-thread view) with text, layout and
  Linux pixel baselines. Owner policy: no VoiceOver checks. Edit `scripts/*.js` sources and
  regenerate embeds. Never hand-edit generated blocks. All existing tests stay green with
  no skips or weakened assertions.

## Out of scope

The side pane and its second composer, follow/mute per sub-thread, promote action
(SPEC-002-078). Release (SPEC-002-078 AC10).

## Implementation notes (2026-11-03)

- Validation: `subthreadIssue()` (board.html, next to `nativeIssue`) mirrors canonical
  `subthread_check` (agent-file-board SPEC-002-076): same rule order and messages, reading only the
  headers of siblings in the same directory. `nativeIssue` calls it for every file (existing files:
  a missing, unreadable or quarantined root is an orphan, not an error); `composeMessage` calls it with
  `post:true` (a missing root is refused before writing). `messageMetadata` is unchanged.
- Model: `m.subthread`, `m.subthreadAlso`, `m.subthreadState`, `m.promotedFrom` are set only on valid
  native messages. `subthreadsOf()` is the memoised header-only index (root key `dkey|root` -> members
  in posting order, participants, last activity, latest state, ALSO members); orphan state and the
  counted members are read live because repairs and signing are applied after the model is built.
- Main flow: `subthreadShown()` is the one filter used by `matchingMessages()` and `prepareModel()`.
  `sel.sub` (root filename) selects the filtered sub-thread view; every `sel = {...}` navigation drops
  it. `S.lastSub` restores it on reload; `loadBoard` closes a view whose root and members vanished.
- Composer: the destination gains the backing input `#cSub` inside `#composer` (so the signing draft
  stamp covers it) and `composerTargetKey` gains `^root`; the SPEC-002-064 draft pin applies unchanged.
  An explicit Advanced Where/Thread change leaves the sub-thread.
- Stamping: `sendImpl` (destination), `sendChoice`, form answer and acceptance (`scripts/form-board.js`),
  extension answer (`scripts/extension-ui.js`) pass `subthread: subthreadOf(source)`; topic titles are
  refused from a sub-thread view and by `composeMessage`. Stamped headers follow the other optional
  headers, as in `boardctl post`.
- For SPEC-002-078: `render()` is still bound to `#feed`; the strip (`subthreadStripHtml`), the stub
  (`subthreadStubHtml`), the list (`subthreadListRender`) and `openSubthread`/`closeSubthread` are
  separate functions the pane can reuse. The pane should key its state the same way (`sel.sub` or an
  equivalent key triple) and must not render a root's interactive body twice.
- Visual: scenes `subthread-strip` (+320x640, dark, dracula), `subthread-list`, `subthread-view`
  (+390x640) with layout snapshots; their Linux pixel baselines come from the `update_visual_baselines`
  workflow (pixels are compared on Linux only).
- AC1: vendor pinned to the released canonical tag v3.4.0 (bd52fb5, merge of sloik/agent-file-board#27;
  same tree as 73f4f18). `scripts/release_check.py` derives the expected tag from CONVENTION.md and reports
  "ok (UI v3.4.0, standard v3.4.0)". Owner/coordinator decision (2026-11-03): 077 and 078 ship together as viewer 3.4.0 from
  this branch, so VIEWER_VERSION, package.json/lock and the version-string tests move to 3.4.0 now
  (a 3.3 viewer would show the version-mismatch banner on a 3.4 board); the CHANGELOG 3.4.0 section is
  a draft that SPEC-002-078 completes. Repinned alignment anchors are version strings only.
- AC2/AC6 parity: `tests/subthreads-canonical.test.js` runs canonical `boardctl validate --json` on the
  shared fixtures (every rule compared word for word, orphan warnings) and on the bytes from send,
  reply, choice answer and typed form answer, then reads them back with `boardctl recent --subthread`.
- AC11 stays open until the Linux pixel baselines of the seven new scenes are rendered by the
  `update_visual_baselines` workflow and committed.



AC11 evidence (2026-11-03): Linux pixel baselines for the 7 sub-thread scenes rendered by CI run 41693847405 (determinism checked) and committed in 754acef; draft PR #39 CI green (test + bounded-models).
