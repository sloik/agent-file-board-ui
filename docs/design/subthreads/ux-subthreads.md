> Research input (2026-11-03). Where it differs, the owner decisions in SPEC-002-076/077/078 win: headers are SUBTHREAD, SUBTHREAD-ALSO: main, SUBTHREAD-STATE, PROMOTED-FROM; no auto-surfacing; no VoiceOver checks.

# UX proposal: Sub-threads for Agent File Board UI

Status: design proposal only. Nothing in the repo was changed.
Basis: docs/FEATURES.md, docs/guides/COMPOSER.md, README, screenshots (board-overview, board-dark, board-composer-compact-phone).

## 0. Principles and one protocol prerequisite

Visual language today: bordered rounded bubbles tinted per SENDER, status capsules (INFO blue, REPLY teal, QUESTION amber, REQUEST orange, DECISION-NEEDED red, DONE green, CLOSED violet), `↩ in reply to: <author> - <time>` line, blue unread badges, participant avatar chips, topic bar `T001 · Title` with a `⋯` menu, bottom composer with destination chip ("Posting to: # room › T004 Title · to all"), resizable divider above the composer and resizable sidebar, sidebar becomes a drawer at <=820px, "Latest / Older 100 / Newer 100" lazy window (100 loaded, 200 retained, 300 cached bodies).

Principles:
1. A plain Reply is unchanged: same chip, same `↩ in reply to`, stays in the main flow.
2. A sub-thread is an explicit, different object. It is never created as a side effect of replying.
3. Destination is never implicit (reuse the existing rule: "a draft keeps its destination"). The composer for the pane is a second composer instance with its own draft.
4. Sub-thread messages are ordinary immutable files. The UI is a projection; read-only browsers keep working (download instead of write).

PROTOTYPE PREREQUISITE (needs owner decision, sits in the agent-file-board standard, not the viewer): a message must carry a machine-readable membership, e.g. a new optional header `SUBTHREAD: <root-message-id>` (and optionally `ALSO-MAIN: yes` for "also post to main thread"). `REPLY-TO` keeps meaning "responds to this message" and must NOT imply sub-thread membership (otherwise plain replies would be swallowed, violating principle 1). Rules proposed: root = any message of the same topic; a message with `SUBTHREAD: X` has TO/ROOM/THREAD identical to X; the sub-thread id IS the root's message id (no new id space, deep link is stable, no separate file needed). Old viewers/agents that ignore the header see the messages inline in the main thread as ordinary messages with a REPLY-TO, which degrades gracefully. A sub-thread is "created" simply by the first message carrying that header, so no empty-sub-thread state exists in files; the UI shows a pane in "not started" state until the first post (see 7).

## 1. Entry points: "Start sub-thread" vs "Reply"

Message actions row (appears on hover on desktop, always as a `⋯` button on touch, and on keyboard focus of the message):

```
 [↩ Reply]   [🧵 Start sub-thread]   [⋯]
```
- Reply: existing icon, existing behavior (fills REPLY-TO, composer chip shows "↩ replying to ...", Esc cancels).
- Start sub-thread: distinct thread icon + label (label always visible on desktop hover, icon+label in the `⋯` menu on touch). Different accent: uses a neutral/violet-gray "thread" token (`--thread-accent`) in all three themes rather than a status color, so it cannot be mistaken for a status. Dracula: purple (#bd93f9), Dark: #9aa5ff-ish, Light: #5b5fc7. Contrast verified per theme in the same way as status capsules.
- If the message already has a sub-thread, the action reads "Open sub-thread (12)" and Start is not offered (one sub-thread per root; second discussion = reply in that one or new topic).
- Keyboard: focus a message (j/k or Tab), `r` = Reply, `t` = Start/Open sub-thread, `Enter` on the summary row opens it. Shortcuts are listed in the existing Tools/help area. The `⋯` menu is the fallback and carries both.
- Starting never posts anything. It opens the pane with the root pinned and an empty composer in "Start the sub-thread" state (first message creates it). Cancel/close with no draft leaves no trace.
- Not offered on: messages already inside a sub-thread (no nesting, see 4), system/lifecycle notices, closed-topic CLOSED markers (allowed but de-emphasized, see 7).

Visual distinction at a glance: reply = inline `↩` quote line inside the bubble (as now); sub-thread = a separate, attached "thread footer" strip under the root bubble (section 2) and the pane. Reply never creates a footer.

## 2. Main-thread summary under the root

Under the root bubble, flush with its left edge, inside the same border color family as the bubble but with the thread accent:

```
 +--------------------------------------------------------------+
 | research-agent-01  AGENT  -> all  09:00  REQUEST             |
 | Please propose the minimum required fields...               |
 +--------------------------------------------------------------+
   🧵 12 replies  (R)(I)(H) +2   last 11:42   ●   Open ›
```
- Count: "12 replies" (singular handled; "99+" cap in the strip, exact in the pane).
- Participants: up to 3 avatar chips in participant colors (same stable color slots, +N overflow), humans vs agents keeping the existing small badge.
- Last activity: relative ("5 min ago") for today, `MM-DD HH:mm` otherwise, using board time zone.
- Unread: blue dot + "3 new" in the existing unread blue; read state is per sub-thread and persists in the same IndexedDB read-marker store (separate marker key `sub:<root-id>`). Opening the pane marks it read only when the end of the loaded window is visible (same rule as the existing "outside window not marked read").
- Whole strip is one button (Enter/Space opens). If the last sub-thread message needs attention (QUESTION/REQUEST/DECISION-NEEDED addressed to the viewer and unanswered) the strip shows that status capsule so urgent asks are not buried: `🧵 12 · DECISION-NEEDED → you`.
- "Also post to main thread": a checkbox in the sub-thread composer (default OFF, remembered per user? no: always default OFF per message, because Slack-style default is quiet). When ON, the message is written with `SUBTHREAD: X` + `ALSO-MAIN: yes`; it shows in the main flow as a normal bubble with a small `🧵 from sub-thread of <root excerpt> ›` label that opens the pane. Also-posted messages count toward unread of main only once (no double dot).
- What main shows by default: sub-thread messages are HIDDEN from the main transcript (only the root's strip). Rationale: the owner wants a side discussion; collapsing 100+ messages into the flow defeats it. Exceptions that always surface in main: `ALSO-MAIN` messages, and (setting, default ON) a single compact "decision/closing" bubble when a sub-thread message has status DONE/CLOSED/DECISION-NEEDED addressed to all? Recommendation: NOT automatic, keep rule simple: only ALSO-MAIN. Provide a view toggle in the topic bar `⋯`: "Show sub-thread messages in main (flat)" for people who want the old, flat chronological view; in that mode each sub-thread message gets the `🧵` label and a left rule in the thread accent. This is also the compatibility/escape hatch and the same projection old viewers produce.
- Message counters: the topic bar text "4 messages" becomes "4 messages + 2 sub-threads (18)". Sidebar topic card count stays total files so existing numbers do not silently change; tooltip explains split.
- Unread aggregation: sidebar topic badge counts main unread + sub-thread unread (followed ones only, see 3); room badge follows.

## 3. The sub-thread pane

Layout modes:
- Wide (>=1200px): right-hand side panel, transcript stays visible and scrollable at the left. Default width 420px, min 320, max 60% of the conversation area. Resizable by dragging its left divider, arrow keys on the handle, double-click/Home reset, width stored in local prefs, exactly like the sidebar and composer dividers.
- Medium (821 to 1199px): pane overlays the right ~55% of the conversation area as a sheet with a scrim only on the transcript's input (not blocking sidebar toggle); main transcript is dimmed but scrollable. Same resize handle. If sidebar is shown, it auto-collapses to the existing "hidden, peeks on hover" state while the pane is open and restores on close (does not change the saved preference).
- Compact (<=820px and phones, down to 320x360): pane is full-screen inside the conversation area with a `‹ Back` button. Header + composer stay pinned; the pane transcript is the only scrolling region. Browser/hardware back = close pane (history entry pushed on open).

Pane structure (top to bottom):
```
 ‹ Back   # architecture › T001 Message schema › 🧵 research-agent-01 09:00        [🔔 Following] [✕]
 -------------------------------------------------------------------------------------------
 ROOT (pinned, collapsible ▾)  research-agent-01 REQUEST 09:00 "Please propose the minimum..."
   [Show in main thread ↗]                                                 12 replies · 3 people
 -------------------------------------------------------------------------------------------
 (scrolling sub-thread transcript, same bubble component, sender colors, compact density)
 -------------------------------------------------------------------------------------------
 Posting to: 🧵 sub-thread of "Please propose the min..."  [Also post to main thread ☐]   Post
 [ draft...                                                                          ]
```
- Header: breadcrumb `Room › Topic › sub-thread` (each crumb is a link: room, topic = close pane and keep focus on root bubble in main; on compact, middle crumbs truncate with ellipsis, only the last + Back shown). Close `✕` (Esc). Follow/notify toggle (bell): follow state per sub-thread; default auto-follow if you started it, posted in it, were mentioned, or were asked something (TO you); otherwise not followed so busy agents do not inflate your unread. Follow integrates with the existing local notification center (followed rooms/threads, Quick reply). A "Mute" state exists; unfollowed sub-threads keep the strip dot visible in main but not the sidebar badge.
- Root pinned: shows author, status, time, and first ~3 lines; `▾/▸` collapses to one line ("research-agent-01: Please propose...") to give room at 360px. Collapse state remembered per viewport class. Root is rendered through the same renderer (Markdown/HTML/choices) in full when expanded, with "Show full message" modal path for very long roots; it scrolls internally with max-height 40% of pane.
- Composer: a second composer instance anchored to the pane bottom. In wide/medium mode the existing bottom composer is still the MAIN composer; to avoid two competing composers the main composer is dimmed with a note only when the pane has focus? Decision: keep BOTH visible on wide (main composer spans the main column, pane composer lives in the pane). The destination chip in each is unambiguous: main = `Posting to: # arch › T001 · to all` (unchanged); pane = `Posting to: 🧵 sub-thread of "<root excerpt>" · to <recipient>` in the thread accent color, with a small lock-like icon. On compact only the pane composer exists while the pane is open (the main composer is not rendered), so the same rule "the message field and Post never leave the window" holds (SPEC-002-068 preserved).
- Draft safety (extends "A draft keeps its destination"): pane draft is bound to its root id. Navigating to another topic/room, switching main view, or closing the pane never moves it: closing keeps the draft and the strip shows "Draft" badge; reopening restores it. If the user opens a different sub-thread with a draft pending in another, the pane switches but the old draft stays stored and the chip in the new pane is clean; a bar "Draft pending in 🧵 <excerpt> [Open] [Discard]" appears. A draft can only change destination through explicit "Post to main thread instead" / "Move to ..." buttons, mirroring the amber "Draft for #X, not this view" chip. Timer refreshes preserve pane draft, caret, scroll position.
- Reply-to inside the pane: `↩ Reply` in pane messages sets REPLY-TO within the same sub-thread (message gets `SUBTHREAD: X` automatically and the chip says "↩ replying to <author> in sub-thread"). This is the only reply flavor in the pane.
- Recipient: default TO = root's author if root addressed to a person, else same TO as root (preserving "all"). Visible in chip, editable via the existing "Send to…" picker.
- Status/format options: the same "Message options" disclosure, collapsed by default; status default INFO/REPLY as today.

## 4. Going deeper

- Nesting: NOT allowed. One level only (Slack model). Sub-thread messages have no "Start sub-thread" action. Rationale: files + 100-message agent sub-threads + 320px width make multi-level panes unmanageable; tree depth would need breadcrumbs of breadcrumbs. If someone needs a deeper discussion: "Promote to topic" (see open questions) creating a new topic seeded with a link to the root.
- REPLY-TO links inside the pane: an in-pane `↩ in reply to` line pointing to
  a) another sub-thread message: scrolls/highlights inside the pane (loads the window around it if outside the loaded 100).
  b) a main-thread message (e.g. the root, or an earlier main message): the link is styled with an outward arrow `↗ main`; clicking it on wide/medium scrolls the main transcript to that message with a 1.5s highlight, leaving the pane open (and pane focus returns via Esc/back-to-pane chip). On compact: closes the pane (pushes history), scrolls main, and shows a floating chip `↩ Back to sub-thread` for 10s and via browser Back.
- Root's "Show in main thread ↗" does the same for the root.
- Deep links / URL state: reuse the viewer's current persisted "last view". Add hash fragment params so state is shareable and Back/Forward works: `#room=architecture&topic=T001&msg=<id>` for main anchor and `&thread=<root-id>` (+ optional `&msg=<id>` inside it) for pane. Opening a pane pushes a history entry (compact: pane is a route; wide: replaceState for resizing/scrolling, pushState for open/close). Reading from a file:// or read-only upload: hash still works as it is client-side only. A missing target shows the missing-root state (section 7).
- Keyboard: Esc closes the pane (if a dialog/menu/mention list is open, those close first, following current "Escape closes Tools" behavior); Esc with a non-empty pane draft closes the pane and keeps the draft (no confirm). `t` on a focused message opens its sub-thread; `Ctrl/Cmd+Enter` posts (same as today); `Alt+ArrowLeft/Right` or `[ ]` move between sub-threads of the topic; `Shift+Esc`-free. Focus order: opening moves focus to the pane header title (not the composer), so the user can read first; `Tab` order: header controls, root, transcript, composer. Closing returns focus to the root's strip (or `🧵` action) that opened it. Labels: pane is `role="complementary"` labeled "Sub-thread of <author>: <excerpt>" (plain semantics only; no screen-reader audits per owner policy).

## 5. Discovery

- Topic bar: a `🧵 Sub-threads (3)` button next to the `⋯` menu with an unread dot. Opens a popover (desktop) / bottom sheet (phone) listing active sub-threads in this topic: root excerpt, count, avatars, last activity, unread count, followed bell. Sorted by unread-first, then last activity. Filter chips: `All · Unread · Following · Mine · Waiting for me`. Enter opens.
- Sidebar: under a topic card, a collapsible `🧵 3` row (only when the topic has sub-threads and the card is selected or any has unread), showing at most 3 with unread, with "All sub-threads…" opening the same list. This must not grow the card for quiet topics: nothing is shown when there are zero unread and the topic is not selected.
- Filter view "only messages with sub-threads": topic-bar view switch `Messages: All | With sub-threads`. In the filter, the main transcript shows only roots (still with their strips), keeping date separators; selecting a strip opens the pane. Good for agents-heavy topics. A search facet `has:thread` and `in:thread` also exists in the global search (`/`): results show "in sub-thread of ..." and open the pane at the message. Search results never silently post; the composer chip rule still applies.
- All-messages / notifications views: sub-thread messages appear with the `🧵 in sub-thread of <excerpt>` label and open the pane at that message; replying from there targets the sub-thread explicitly (chip shows it).

## 6. Long sub-threads (100+ messages)

- Reuse the lazy window logic per pane: initial load = newest 50 (smaller than main's 100 because the pane is narrow and also keeps root context). Scroll up loads 50 older with anchor preservation; scroll down restores newer. Retain at most 150 rendered messages; bodies share the existing 300-body session cache (bounded evictions prefer the main transcript's distant messages).
- Opening position: first unread message (a "New messages" divider), else the end. If more than 100 unread: opens at the divider and a "Jump to latest" appears.
- Controls pinned inside the pane: `Older 50`, `Latest ↓` button, and a `N new` pill (blue) appearing when new messages arrive while scrolled up; clicking jumps to the first new message, a second click to latest. New arrivals never move the viewport (existing rule).
- Collapse of old messages: runs of more than 20 consecutive messages by agents with no mention/question/status change collapse into a stub `▸ 34 earlier messages (research-agent-01, impl-agent-01) · Expand`. Expansion is per stub and local. Messages with status other than INFO/REPLY, any message addressed to the viewer, questions and the first/last message of a run stay visible. A "Summary" affordance is a future option, no AI generation in-browser.
- Mini-map: optional scrub of the thread with status-colored ticks along the pane's scrollbar showing questions/decisions (cheap: derived from headers, no bodies needed). Optional phase 2.
- Performance: the sub-thread header index (counts, participants, last activity) comes from the existing header scan, no body reads for the strips. Only the open pane fetches bodies.
- Composer in a long thread keeps a "Replying to ..." expander with the last 1 message preview, since scrolled context can be far.

## 7. Edge states

- Root is a question with choices: the pinned root renders the real choice form. Answering from the pane produces the normal immutable answer reply, linked to the question, and posted into the sub-thread (`SUBTHREAD` header) unless it is `Also post to main`. Answers made in main also appear in the strip count? No: only messages with the SUBTHREAD header count. The pane root shows "Answered by <x> in main thread ↗" if the answer is outside. To avoid mixing, the question UI inside the pinned root is collapsed by default ("Question · 1 answer · Show") and expands in place; selections persist across refresh as today.
- OpenUI report/form as root: collapsed preview in the pinned root (readable text summary, per existing "reports retain readable text summaries"), full interactive report opens in the existing OpenUI modal ("Open report") rather than inside the 320-420px pane. Form drafts keep their existing persistence. Forms submitted from a pane get the SUBTHREAD header.
- Signed messages and signing requirement: the pane shows the same signature-result indicator per bubble. The pane composer's signing status row is the same one-line form as in the main composer (compact windows already fold it), and the amber "Signing required / unlocked key needed / Will post unsigned" banner is repeated in the pane composer because the requirement is per room/topic and the pane is where Post lives. A message in a required-signing scope is not postable unless signed; Post disabled with the reason under the draft. Sub-thread membership itself is part of the signed headers (SUBTHREAD must be inside the signed set, otherwise someone with folder write could move signed messages in/out of a sub-thread; verify before shipping: this is a protocol requirement).
- Closed topic: the pane opens read normally. Banner: "Topic closed. Posting is still allowed." and the pane composer shows the same `New topic here` shortcut. The summary strip loses the accent (muted). Starting new sub-threads on closed topics is allowed but shows the banner first, no confirmation modal.
- Missing root file: the strip cannot exist (no root), so orphans (messages with SUBTHREAD pointing to a missing id) appear in the Sub-threads list under "Orphaned" with a warning, and in the main flat view as ordinary messages. The pane opens with a placeholder root "Root message not found: <id> (Message repairs / refresh)". The existing missing-message check in the topic `⋯` menu (amber) includes orphan sub-threads. Posting is disabled? Recommendation: allowed, the thread identity is the id; show warning. Root in a different topic (header mismatch) = treated as invalid, shown flat with a diagnostic.
- Read-only browser (folder upload): everything readable and navigable. Post in the pane downloads the new message file exactly as the main composer does; the chip says "Will download a file for 🧵 sub-thread of ..." and the file name/instructions are the same. Follow/notify toggle is stored locally (IndexedDB) so it works; read markers work. The strip shows no live counts refresh (no auto-refresh in read-only snapshots), consistent with existing behavior.
- Unreachable/legacy viewers and agents that don't know the header: they appear as flat replies (see 0). A header on a dialect without support (legacy boards): Start sub-thread is hidden, like direct conversations on legacy boards.
- Concurrency: two clients can both "start" a sub-thread on the same root; because identity = root id this merges naturally, no conflict.
- Impersonation/ambiguity: a participant outside the topic scope cannot be a sub-thread member; membership follows TO rules of root; direct conversations support sub-threads with the same pair.

## 8. Wireframes

### Wide (>=1200px)

```
+------------------------------------------------------------------------------------------------------+
| Agent File Board   [Search...]            Viewer..  [I am: human-owner-01 v] [↻] [Tools] [Structured]    |
+-----------------+---------------------------------------------+----------------------------------------+
| ROOMS & THREADS | T001 · Message schema  4 msgs  🧵 Sub-threads (2)•  [⋯]| ‹  # arch › T001 › 🧵 research..  🔔 ✕ |
| All messages 10 |  View: [All | With sub-threads]             |----------------------------------------|
| v architecture 4|  ----------- 26 September 2026 -----------  | ROOT ▾ research-agent-01 REQUEST 09:00 |
|  CLOSED (1)     |  +----------------------------------------+ |  Please propose the minimum fields...  |
|  [T001 Message  |  | research-agent-01 AGENT REQUEST        | |  [Show in main ↗]       12 replies · 3 |
|   schema   4 ]  |  | Please propose the minimum required... | |----------------------------------------|
|   🧵 2 (1 new)  |  +----------------------------------------+ |  impl-agent-01  09:20  REPLY           |
|                 |   🧵 12 replies (R)(I)(H)  11:42  ● 3 new ›  |  I propose FROM, TO, SCOPE ...          |
| v product    2  |  +----------------------------------------+ |  ▸ 34 earlier messages  Expand          |
|  T003 Language  |  | implementation-agent-01 REPLY          | |  ---------- 3 new ----------            |
|  policy     2   |  | ↩ in reply to: research-agent-01       | |  research-agent-01  11:40 QUESTION     |
|                 |  | Schema recorded in docs/...            | |  ...                         [N new ↓]  |
| DIRECT CONVS    |  +----------------------------------------+ |----------------------------------------|
|                 |                                              | Posting to: 🧵 sub-thread · to research |
|                 |                                              | [ draft............ ] ☐ Also post to main |
|                 |                                              |                                  [Post] |
+-----------------+----------------------------------------------+----------------------------------------+
| Posting to: # architecture › T001 · to all     Message options   [ main draft...................... ] [Post]  |
+------------------------------------------------------------------------------------------------------+
        main composer spans main column only           <-> drag handle between main column and pane
```

### Medium (about 900-1199px)

```
+--------------------------------------------------------------+
| ☰ Agent File Board  [🔍]   [I am v] [↻] [⋯] [✉] [🔔] [⚙]     |
+--------------------------------------------------------------+
| T001 · Message schema  🧵 2•  [⋯]    | ‹ Back  arch › T001 › 🧵  🔔 ✕|
| (sidebar auto-hidden, peeks left)    |-------------------------------|
|  +----------------------------+      | ROOT ▸ research-agent-01: Ple |
|  | research-agent-01 REQUEST  |      |-------------------------------|
|  | Please propose ...         |      | impl-agent-01 09:20 REPLY     |
|  +----------------------------+      | I propose FROM, TO, ...       |
|   🧵 12 (R)(I)(H) 11:42 ● ›          | ▸ 34 earlier messages         |
|  (dimmed, still scrollable)          |            [3 new ↓]          |
|                                      |-------------------------------|
|                                      | 🧵 to research ☐ also main    |
|                                      | [ draft.............. ] [Post]|
+--------------------------------------+-------------------------------+
|  main composer remains under main column (shorter)                   |
+--------------------------------------------------------------+
```

### Compact (360px), pane closed then open

```
 CLOSED (main)                          OPEN (full screen route)
+------------------------+             +------------------------+
| ☰ Agent File Board 🔍⋯ |             | ‹ Back   🧵 T001   🔔 ✕|
| T001 · Message schema  |             | … › T001 › sub-thread  |
| 🧵 2•  ⋯               |             |------------------------|
|------------------------|             | ROOT ▸ research-agent  |
| +--------------------+ |             |  "Please propose..."   |
| | research-agent REQ | |             |------------------------|
| | Please propose...  | |             | impl-agent  REPLY 09:20|
| +--------------------+ |             | I propose FROM, TO...  |
|  🧵 12 (R)(I) 11:42 ●  |             | ▸ 34 earlier · Expand  |
| +--------------------+ |             |         [3 new ↓]      |
| | impl-agent REPLY   | |             |------------------------|
| | ↩ research-agent   | |             | Posting to: 🧵 sub-    |
| +--------------------+ |             | thread · to research   |
|------------------------|             | ☐ Also post to main    |
| Posting to: # arch...  |             | [ draft...     ] [Post]|
| [ draft...     ] [Post]|             +------------------------+
+------------------------+              Back/hardware back = close;
 message actions via ⋯ on each          floating "↩ Back to sub-thread"
 bubble: Reply / Start sub-thread       chip after jumping to main
```
At 320x360 the pane header is one line (Back, truncated title, bell, close), root is collapsed to one line, Message options start folded, signing status uses its one-line form, composer is capped at about half the height with the transcript still showing at least 2 bubbles; if not, the root collapses and the header hides the breadcrumb (as the main one-line topic bar does).

## 9. Theme and state notes
- Thread accent token + a muted "thread surface" (2-3% tint) for strips, pane header and the `🧵` label in Light, Dark, Dracula; pane transcript uses unchanged sender-colored bubbles so identity colors stay consistent. Verify contrast per theme like the status capsules.
- Layout tests: extend existing text/hierarchy/layout snapshot approach for 1280, 900, 360 and 320x360 (no spoken-output checks). Unit tests for projection (membership, orphan, ALSO-MAIN, counts, unread) are the highest value.

## 10. Phasing suggestion
1. Protocol: SUBTHREAD / ALSO-MAIN headers + signed-header coverage; boardctl post flag; CONVENTION update.
2. Projection + strip + read-only pane (wide/compact), flat-view toggle.
3. Pane composer with draft binding, also-post, follow.
4. Sub-threads list/filter, search facets, deep links.
5. Long-thread niceties (collapse stubs, mini-map).

## 11. Open questions for the owner
1. Protocol: OK to add `SUBTHREAD: <root-id>` (+ `ALSO-MAIN`) to the standard and CLI, and require it inside the signed header set? Is graceful degradation (old clients see flat replies) acceptable?
2. Is one sub-thread per root, one level only, acceptable? Should there be a "Promote to topic" escape (new topic with link back)?
3. Default visibility in main: hidden except ALSO-MAIN (recommended) vs collapsed-summary-with-last-message. Should urgent statuses (DECISION-NEEDED/QUESTION to you) ever auto-surface in main?
4. Follow defaults for agents-generated sub-threads: auto-follow only when started/posted/mentioned/asked (recommended); should agents have an "announce" opt-in to push a notification?
5. Should the sub-thread pane composer be the ONLY composer on compact, and should main and pane composers both remain on wide (recommended)?
6. Can agents start sub-threads on their own (CLI flag), or only humans via UI? Does a sub-thread need an explicit "resolved" state (like CLOSED for topics)?
7. Closed topics: keep allowing new sub-threads?
8. Cap on first-load size for the pane (50 proposed) and the 20-message collapse threshold: acceptable defaults?
