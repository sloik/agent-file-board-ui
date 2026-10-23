---
id: SPEC-002-064
title: Composer routing follows the visible view; message a participant directly
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner report (2026-10-23): the posting toolbar is redundant. "Where" should follow
the view that is visible: on a thread, that thread is where I post (rooms alike).
The "To" field is also redundant: I should pick a participant and send a DM, which
then appears under "Rooms and threads" in the side panel.

The design below came from a persona UX design pass. It is kept here so the
reasoning can be reviewed. The acceptance criteria are its section 6.

# Composer routing: the view picks the destination (design)

Owner ask: drop the redundant Where/Thread/To toolbar. You post where you are looking, and "To" becomes "pick a person, get a DM".

## 0. What happens today
- Tree navigation runs `fillComposer(false)` and **retargets even with a draft**.
- A room view **silently picks the newest thread** (the `all[0]` fallback in `fillThreads`).
- All messages keeps the previous Where value.
- Five consumers read the selects directly: summary, `signingDestinationPath`, `historyCreationMode`/`Scope`, `sendImpl`, `notificationHasDraft`. Each also has a copy in board.html.
- `signingDraftStamp()` includes the selects, so voice sessions and send races already notice a destination change.

## 1. Destination model
**Keep `#cWhere/#cThread/#cNewThread/#cTo/#cNewRoom` as hidden backing state** inside `#composer`. That keeps the draft stamp, voice invalidation and the signing/history consumers working. Add one accessor, `composerTarget()`, which returns `{scope, dir, thread, newRoom, newTopic, to}`. All consumers read through it, and only `setComposerTarget()` writes the selects.

| Visible view | Target |
|---|---|
| Thread (`.tcard[data-tk]`) | that thread |
| Room (no thread) | **new topic in #room**, with an inline required "Topic name" field. Behaviour change: never the newest thread by accident |
| Direct conversation (no thread) | its most recent topic, or a new topic if it has none. A DM pair is one conversation, so continuing is the expectation |
| DM thread | that thread |
| All messages / search / notifications / no selection | **no implicit target**. The chip says "Choose where to post" and Send is disabled until the user picks one. A reply supplies one (below) |

**Chip.** Replaces `#composerRouteSummary` and always shows above the body:
`Posting to: # architecture › T004 API v2 · to all  [Change]`

Change opens a popover with a search box (rooms, topics, DMs), "New topic here…", "New room…", "Message a participant…", and "Advanced" (today's selects, format, status, language).

**New room / new topic.** The chip turns into `# new-room-name › Topic name` with two inline inputs. SPEC-002-063's "Require trusted signatures" and "Record room history automatically" checkboxes (`#historyCreate`) sit right below them, unchanged, off by default.

**Reply.** `startReply(m)` sets the target to `m`'s scope/dir/thread and TO to the author, as it does now. The chip shows "Replying in …". Cancelling the reply resets TO to `all` but keeps the target.

**TO in rooms.** The default is `all`. A small "to" segment in the chip opens a participant picker that allows **several picks** (the convention allows `all`, one ID, or a comma set). TO is never inferred from @mentions in the body: mentions use display names, and mapping them to IDs is ambiguous. A reply pre-fills the author. In DMs, TO is not shown; it is always the other party in the pair.

## 2. Direct messages
"Message a participant…" can be started from three places:
- the chip popover
- a "+" on the sidebar "Direct conversations" heading
- a "Message" button per row in Tools → Participants

Flow:
1. The user picks a participant, excluding the current `#me` persona.
2. The pair is `sort([me, other]).join("--")`.
3. If the pair already exists, navigate to that DM view, so the composer targets it.
4. Otherwise the target becomes `newdirect` with TO = that participant. The chip reads `✉ Research Agent › New topic: [name]`.
5. A topic name is required. Every message needs a THREAD. Pre-fill it from the first line of the body, slugged, and keep it editable.
6. The sidebar lists the DM **only after the first file is written** (`B.directs` comes from disk). Until then the chip is the only place it appears. No phantom sidebar entry.

Native dialect only. Legacy boards hide every DM entry point, as `whereOptions` already does.

## 3. Fate of the fields
- **Where / Thread / To**: removed from the default UI. They stay under Popover → Advanced as power-user and keyboard fallbacks, with the same IDs.
- **New room input**: moves into the "New room…" flow.
- **Format / status / language**: stay in a collapsible "Options" row, with the status chip preview kept.

**Keyboard.** The chip is a button: Enter/Space opens it, focus lands in search, arrows and Enter pick, Escape returns focus to the chip.

**Phone (390px).** The chip is one line with a middle ellipsis. The popover is a bottom sheet (at most 70vh, 44px rows).

## 4. Edge cases
- **Draft pin rule (the core one).** A draft exists when `notificationHasDraft()` is true (it uses `.length`, so whitespace counts) or a voice session is active. While a draft exists, navigating does **not** retarget. The chip turns amber: "Draft for # product › T003, not this view" with **[Post here instead]** and **[Keep]**. Only an explicit choice changes the target. With no draft, navigation retargets silently. After a send the composer re-follows the view.
- **Closed thread** (last status CLOSED). The convention says nothing about reopening. Show a warning in the chip, "Topic closed", plus a "New topic here" shortcut. Posting stays allowed, with no reopen semantics.
- **Read-only board** (`!canWrite()`). The chip still works, Send downloads the file (existing `c_info_readonly`), and the history-creation options stay hidden as today.
- **Persona not in the DM pair** (multi-persona). Viewing `direct:a--b` while `#me` is neither: the chip shows "You (X) are not in this conversation", Send is disabled, and the chip offers "Switch to A / B" for the personas you hold. Changing `#me` while targeting `newdirect` recomputes the pair, and the chip shows the new pair.
- **Signing status (SPEC-002-061).** `setComposerTarget()` always calls `updateComposerSummary` → `updateSigningNotice` → `historyComposerUpdate`. Signing status is recomputed for the new `signingDestinationPath()` on every target change, including draft-pin "Post here instead".
- **Voice and structured attachments.** A target change still invalidates an in-flight voice session, because the selects are part of the draft stamp. A structured attachment survives a target change, and the chip warns if the new scope's signing minimum blocks it.

## 5. Personas
- **New human user.** Clicks `# general`, names a topic, types, sends. No routing fields.
- **Multi-persona user.** Room targets survive a `#me` switch. A DM they aren't in blocks, with a one-click persona switch. The draft pin stops cross-posting.
- **Agent operator in the viewer.** Browses with no draft, so the composer follows. A reply from All messages targets its thread.
- **Polish phone user.** Polish chip strings ("Wysyłasz do", "Zmień", "Napisz do uczestnika"). Bottom sheet. The pin banner explains why the target stayed.

## 6. Acceptance criteria
1. Thread view → the target is that thread, shown in `#composerTarget` (the chip).
2. Room view → the target is a new topic in that room. Send without a topic name is refused with `e_thread_name`. The newest thread is never auto-picked.
3. DM view → its most recent topic, or a new topic if it has none. TO = the other pair member and is not editable.
4. All messages / search / notification views → no target. Send is disabled, and the chip prompts for a choice. A reply supplies the target.
5. With a draft (`notificationHasDraft()` or voice active), navigation leaves the target unchanged. A mismatch banner offers Post here instead / Keep. Without a draft, navigation retargets.
6. "Message a participant" with an existing pair navigates to it. With a new pair it targets `newdirect`, requires a topic, writes `direct/<sorted pair>/`, and the DM appears in the sidebar after the file exists.
7. DM entry points are absent in the legacy dialect.
8. Room TO defaults to `all` and accepts several IDs (comma header). A reply pre-fills the author, and cancel restores `all`.
9. Where/Thread/To selects are not visible by default and are reachable under Change → Advanced with unchanged IDs.
10. A new room/new topic shows the SPEC-002-063 options, off by default, with unchanged config-write behaviour.
11. Every target change recomputes the signing notice and history note for the new destination.
12. A persona not in the DM pair cannot send. A persona switch is offered.
13. A closed topic shows a warning and a "New topic here" shortcut.
14. At 390px: one-line chip, bottom-sheet popover, no horizontal scroll.
15. Keyboard: chip open/close/select with Enter, arrows and Escape; focus returns to the chip.
16. Non-vacuity: removing the draft-pin guard makes AC5's test fail.

## 7. Test plan
Grep `cWhere|cThread|cNewThread|cTo\b|cToSearch|cNewRoom|composerRouteSummary|newdirect` gives **78 refs in 17 test files**. Because the selects remain as backing state, most of these become a `h.expandAdvanced(page)` helper call plus the existing `selectOption`. Real rewrites:

| File | Refs | Change |
|---|---|---|
| improvements.test.js | 21 | Search-completion tests move to the chip popover search; draft-preservation test unchanged |
| compose.test.js | 11 | Rewrite the newdirect test as "Message a participant"; route via chip; reply TO asserts kept |
| room-history-recording.test.js | 10 | New-room flow via "New room…"; history options unchanged |
| compact-composer.test.js | 7 | Rewrite: the summary becomes the chip; collapsed/visible assertions; long-title ellipsis at 390px |
| composer-signing.test.js | 5 | `room()`/`otherRoom()` helpers via `setComposerTarget`/chip; new-room signing |
| signing-scenarios.test.js | 4 | Helper swap |
| signing-help.test.js | 3 | Helper swap |
| voice-ui.test.js | 2 | Keep; add "navigation with active voice does not retarget" |
| signing-ui, sidebar-menus, ordering, guidance | 2 each | Helper swap. Check ordering/guidance for reliance on the newest-thread default (AC2 changes it) |
| signing-journeys, rich, notifications, navigation, mention-colors | 1 each | Helper swap. mention-colors moves `#cToSearch` to the chip TO picker |

Consumers to rewire to `composerTarget()`: `scripts/composer-options.js`, `scripts/signing-ui.js:11-18`, `scripts/room-history-ui.js:514-531`, `scripts/notifications.js:69`, `sendImpl`/`startReply`/`fillComposer`/`fillThreads` in board.html, plus the board.html copies.

New tests: view→target matrix (AC1-4); draft pin with whitespace and voice; DM pair incl. persona outside it and legacy; multi-ID TO; 390px; AC16 mutation.

## Implementation notes

Implemented 2026-10-23 on `feat/composer-routing` (viewer 3.3.1 candidate).

- **Where the code lives.** `composerTarget()`, `setComposerTarget()`, the view-follow
  rule with the draft pin, the chip, the popover and "Message a participant" are in
  `scripts/composer-options.js` (bundled by `embed_tools.js`). `fillComposer` now only
  rebuilds options in place; `fillThreads` no longer falls back to the newest thread.
  `startReply` goes through `setComposerTarget`.
- **Consumers.** `room-history-ui.js` (`historyCreationMode`, `historyComposerScope`) read
  through `composerTarget()`. Deviation: `signingDestinationPath()` in `signing-ui.js` and
  the voice draft stamp in `voice-ui.js` still read the hidden selects directly. Both files
  are whole-file formal anchors loaded by the signing collectors, and because only
  `setComposerTarget()` and the Advanced fields write the selects, their readings are
  unchanged. `notificationHasDraft()` reads draft fields, not the destination, and is unchanged.
- **Send guard and re-follow** live in `composerSend()` (the Send button and Ctrl/⌘+Enter),
  not in `sendImpl`, so the formally anchored `host-composer` section is unchanged.
- **Deviation: All messages after a send.** The composer re-follows the view after a
  successful send, except when the view has no implicit destination (All messages, search).
  There it keeps the destination just used instead of resetting to "Choose where to post".
  The same applies to the post-send history note from SPEC-002-063, which stays anchored.
- **Deviation: first direct message.** After the first message to a new pair the board opens
  that conversation (as "Message a participant" does for an existing pair), so the composer
  follows its new topic.
- **Deviation: no destination and a draft.** If the composer has no destination yet (All
  messages) a draft does not pin "nowhere": navigating adopts the view's destination.
- **Advanced routing.** Where/Thread/To sit in `#composerAdvanced` inside Message options and
  remember their fold (`S.composerAdvancedOpen`), like Message options. An explicit Advanced
  "Where" change keeps the old newest-topic default; AC2 applies to the room *view*.
  `#cNewThread` and `#cNewRoom` moved out of the options panel to the inline name row under the
  chip (same IDs); `#historyCreate` is appended to that row.
- **Notification jumps** keep `preserveComposer: true`: they never retarget, with or without a
  draft (unchanged from before).
- **No destination and signing.** The signing status row stays visible without a destination
  and reflects the board-level minimum, so unlocking from the composer still works there.
- **TO comma sets** are written with the existing `composeMessage` separator (`a, b`).
