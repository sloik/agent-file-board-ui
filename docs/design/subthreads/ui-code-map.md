> Research input (2026-11-03). Where it differs, the owner decisions in SPEC-002-076/077/078 win: headers are SUBTHREAD, SUBTHREAD-ALSO: main, SUBTHREAD-STATE, PROMOTED-FROM; no auto-surfacing; no VoiceOver checks.

# Code map for Slack-style sub-threads in agent-file-board-ui

Repo: /Users/ed/Dropbox/Developer/Repos/agent-file-board-ui. All `board.html:NNN` citations are line numbers in the CURRENT board.html (9536 lines).

## 0. Read this first: where code actually lives

- board.html is NOT all hand-written. Generated blocks are overwritten by `npm run embed:*`, and `npm test` runs every `--check`, so a hand edit inside a block fails CI:
  - `/* BEGIN BUNDLED OFFLINE TOOLS */` board.html:5250 to 9319 (about 4000 lines). Concatenation of these scripts, in this order (scripts/embed_tools.js:5): extension-contract, information-contract, information-host, information-ui, extension-runtime, extension-ui, answer-review, authoring, draft-manager, authoring-drafts, form-builder, locations, notifications, sidebar-menu, theme, composer-options, toolbar-tools, participant-colors, panel-layout, signing-help, signing-ui, voice-input, voice-ui, viewer-updates, viewer-updates-ui.
  - BUNDLED FORM TRANSPORT 4238-4415 (scripts/form-board.js and others, embed_forms.js).
  - BUNDLED SIGNING CONTRACT 4417-4420, BUNDLED ROOM HISTORY 4422-5208, BUNDLED BOARD UPGRADE 4120-4236.
  - Rich libraries 861-974, OpenUI 975-1538. Do not read.
- Hand-maintained core, board.html 1560 to 5250 (the middle) and the wiring section about 9320 to 9536:
  - STRINGS 1588-2217
  - parsing/model 2253-2430
  - composeMessage 2436
  - sidebar/feed `build`/`render` 3085/3404
  - send 3745
  - settings 3813
- RULE for an implementer: composer routing (`composerTarget` etc.) is in scripts/composer-options.js (line 15 onward, source of board.html:6387-6650). Notifications are in scripts/notifications.js. Signing composer/post logic is in scripts/signing-ui.js. Sidebar and drawer are in scripts/sidebar-menu.js. Settings pane is in scripts/panel-layout.js. Edit the script, then run `npm run embed:tools`. Do not edit the copy in board.html. Citations below give both locations where useful.
- `window.__boardTest` (board.html:9531) exports internals (`buildModel`, `composeMessage`, `STRINGS`, `getModel`, ...) for tests. New pure helpers a test needs must be added to this export.
- Global single-page state, no framework: `B` (model), `sel={scope,dir,thread}` (board.html:1574), `replyTo` (single message object, 1575), `S` (settings), `seen` (read map), `historyPage` (transcript window).

## 1. Message model

### Parsing
- `parseHeaders(text)` at board.html:2253. Two passes in one call:
  - legacy tolerant pass: keys upper-cased, `^[A-Za-z...][A-Za-z0-9-]*:` regex.
  - `native` pass: strict, split on `": "`, case-sensitive keys, tracks `duplicates`, `hasSeparator`.
  - Returns `{h, duplicates, native, hasSeparator, body}`.
  - Unknown headers are kept in `m.h` and are NOT rejected by the viewer. `nativeIssue` (2291) only requires the 8 core headers: FROM TO SCOPE THREAD DATE LANGUAGE REPLY-TO STATUS. A new optional `SUBTHREAD` header therefore parses today, but nothing reads it.
  - Only presence notices use a closed header whitelist (`PRESENCE_NOTICE_HEADERS`, 6687). A message with SUBTHREAD would never be mistaken for one.
- `readMessageIndex(file)` (2564) reads only the first 2 KiB or more, enough for headers plus a 256-char preview. EVERY message's headers are indexed eagerly. Bodies are lazy (`messageBody` 2594, `hydrateMessages` 2624, cache cap `MAX_CACHED_BODIES=300`, 1561). Consequence: sub-thread counts, participants and last activity can be computed from headers alone with no body I/O. This is a big plus.
- `buildModel(files,dirs,meta)` at board.html:2292-2430. Per message it creates:
  `{file,path,scope,dir,dkey,h,body,time,label,tid,tkey,author,to,status,replyTo,postedAt,modifiedAt,language,runtime,receipt,...}`
  - `tid` comes from the THREAD header `^T\d+`.
  - `tkey = dkey+"|"+(tid||label)` (the line at ~2350).
  - `replyTo = h["REPLY-TO"] || "-"` (2348).
  - Add `m.subthread = h["SUBTHREAD"]` (root filename, or null) here, and a derived `m.sroot` / `m.skey = dkey+"|"+rootFile`.
- Validation: `nativeIssue` (2291-2304):
  - REPLY-TO must be `-` or a filename that exists in the same `dkey` (`index.has(dkey|REPLY-TO)`), otherwise "Missing or unsafe reply target" and the message gets `metadataError`/`validationError`.
  - `messageMetadata(h, source)` (3269) validates QUESTION/ANSWER/UI/EXTENSION/TOPIC-TITLE/POSTED-AT/CONTENT-TYPE and `source` = the REPLY-TO target's headers.
  - This is where SUBTHREAD validation belongs:
    - the root must exist in the same dkey and same tid;
    - the root itself must not be a sub-thread member (decide: a single level);
    - whether REPLY-TO must lie inside the same sub-thread.
  - A bad SUBTHREAD would then flow into the existing `metadataError` path (greyed "invalid metadata", excluded from unread, notifications and replies). That path is already handled everywhere.
- Sort order, buildModel line ~2358: `time` (the minute-granularity DATE header, or a time-corrections override), then `postedAt ?? modifiedAt` (POSTED-AT ISO ms), then filename, then path. `postingTime()` 2402 parses POSTED-AT. `nextPostingTime(sender, replyTo, at, dkey)` 2408 guarantees a monotonic `POSTED-AT`: it is greater than every prior message by the same sender AND greater than the REPLY-TO target. A sub-thread reply (REPLY-TO = root or sibling) inherits this ordering for free. Precise posting order inside a sub-thread uses the same sort, so no new ordering code is needed. Only filter.
- Thread index: `threadsOf()` board.html:3021. Memoised in `B.threadIndex`. Per `tkey` it aggregates `{n,last,lastOrder,status,who}` over ALL non-receipt messages. THIS MUST LEARN ABOUT SUB-THREADS: a sub-thread reply today would bump thread `n`, `last`, `status` (sidebar status dot and "last status" subtitle) and `who` faces, and sort the thread to the top under `threadOrder==="newest"`. Decide per field whether sub-thread messages count (probably: `n` and `last` no, or a separate `sn`).

### REPLY-TO rendering today
- `render()` board.html:3404-3470. Per message:
  - `reply = B.messageIndex.get(dkey|replyTo) || B.msgs.find(file===replyTo)` (3442).
  - Rendered as `<div class="reply-ref" data-jump="dkey|file">` showing "↩ in reply to: {who} - {when}" (string `in_reply_to`, 1867). CSS at 175.
  - There is NO quoted parent text. It is only a one-line pointer.
- Jump-to: the `[data-jump]` handler at board.html:9433-9447.
  - Looks up `document.getElementById("m-"+dkey|file)`.
  - If the target is off-page, it recomputes `matchingMessages()`, sets `historyPage.end` so the target is centred, and calls `build({preserveComposer:true})`.
  - Then `scrollIntoView` and a background-flash animation.
  - Otherwise it toasts `outside_filter`.
  - A reply-ref that points across the sub-thread boundary (a pane reply whose REPLY-TO is the root, or main-thread reply-refs to a message that lives in a sub-thread) needs an explicit rule: "open in pane" vs "scroll in main".
- Message DOM id is `m-<dkey>|<file>` (3444). It is used by jump, notification activation (6216), MessageDisclosure keys (`msg.id+"|more"` 5238-5249), and `.msg:has([data-more])` expand-preservation (3466). If the root message is rendered both in the main feed and as the pane header, the ids collide. Give the pane a different id prefix, or render the pane header without an id.

### Building the transcript for a thread
- `matchingMessages()` board.html:3038:
  `B.msgs.filter(signing-eligible && (!sel.scope || (scope,dir match)) && (!sel.thread || m.tkey===sel.thread) && (showReceipts||!receipt) && routinePresenceVisible && (!q||msgMatches))`.
  THIS is the single filter that defines "the main flow". Add `&& !m.subthread` (member messages hidden from the main flow, but kept in All messages/search? Decision needed). Add a sibling `subthreadMessages(skey)`.
- Bounded transcript: `messagePage(view, background)` 3042. `historyPage={key,end,last,count}`, `MESSAGE_PAGE_SIZE=100`, `MAX_RENDERED_MESSAGES=200` (1560). The key is the JSON of `[seenKey,sel,query,showReceipts,presenceNotices]`. `loadHistoryOnScroll` (3054) is wired on `#feed` wheel/touch/keys/scroll (9458-9477). It hydrates bodies only for the window (`prepareModel` 2631 hydrates the initial window on load).
  A pane needs its own `historyPage` equivalent. Simplest: no windowing (sub-threads are small), but still hydrate bodies via `hydrateMessages(rows,B)` before render. `render()` already does this with the `missing`/`token` pattern (3430-3431). Replicate.
  Note `prepareModel` (2631) predicts the visible view from `sel`. It needs the same `!m.subthread` filter or it will pre-hydrate the wrong rows.
- Reading position: `render` (3460-3485) keeps `feed.scrollTop`, auto-sticks to the bottom if within 80px, and preserves expanded `.msg`, focus in choice forms and in `.board-form`.
  A pane must have its own scroll container with the same logic, or share a factored-out `renderRows(container, rows)`.
  Today `render()` is monolithic and hardwired to `#feed`. Refactoring it into a container-parametrised renderer is the biggest piece of plumbing work (see section 6).

## 2. Per-message actions

- Row actions: `<div class="tools">` in `render()` board.html:3458:
  `<button data-reply="dkey|file">↩ Reply</button><button data-copy="file">⧉ Copy file name</button>`.
  - CSS 357-358 (hover/focus-within reveal, `opacity:0` until hover).
  - Strings `reply_btn`, `copy_name` (1868).
  - Disabled (with reason title) when `!signingEligible(m)`.
- Click delegate: `$("#feed").addEventListener("click", ...)` board.html:9420-9447. Branches: `[data-more]`, `[data-reply]`→`startReply(m)`, `[data-copy]`, `[data-goto]` (thread chip → switch `sel`), `[data-jump]`. HOOK POINT for "Start sub-thread" / "Reply in sub-thread" / "Open discussion (N)": add `data-subthread="dkey|file"` button next to `data-reply` in the tools row, plus a new branch in this handler. If a pane is a separate scroll container, it needs the same delegate. Factor the handler into a function attached to both `#feed` and the pane.
- Summary line under the root message: insert next to the existing reply-ref/body area of `render()` (after `choiceHtml`/before `.tools`, 3456-3458). It must be rendered by the same html-building loop. Data: group `B.msgs` by `skey`, built once per model (cache on `B`, like `B.threadIndex`, invalidated on new model). The header index makes it cheap.
- Gating: `signingEligible(m)` (board.html:7184) is `!m?.signing || m.signing.eligibility==="eligible"`. The start action should be disabled for the same cases as reply (`signingMessageBlock(m).message` as title). Also not for receipts, `metadataError`, `quarantined`, or a message that is itself a sub-thread member, if one level only.
- Thread chip: `<span class="chip thread-link" data-goto=tkey>` (3448) is only shown with an id. Unchanged.
- "Menus": there is no per-message menu. Menus that exist: topic menu `#topicMenu` (feed-head), toolbar tools `#toolbarToolsPanel` (scripts/toolbar-tools.js), sidebar scope menu (scripts/sidebar-menu.js), composer destination popover (composer-options.js `composerMenu*`). So the message action stays a button in `.tools`. On touch screens `.tools` is hover-gated (opacity 0), and `:focus-within` is the only reveal. Check that the compact layout reveals it. Existing tests: compact-layout.test.js, message-ui-state.test.js.

## 3. Composer

### State model (SPEC-002-064 + 068), scripts/composer-options.js:15-130 == board.html:6387-6520
- The destination is NOT a standalone object. It is DERIVED from 5 hidden/backing form controls: `#cWhere` (room:x / direct:x / newdirect), `#cThread` (tkey or "" for new topic), `#cNewRoom`, `#cNewThread`, `#cTo`. `composerTarget()` (6400) reads them: `{scope,dir,thread,newRoom,newTopic,to}`.
- A destination's identity is `composerTargetKey` (6409): `scope:dir|(+newRoom | thread)`. Add the sub-thread to this key (e.g. `|^rootFile`). Everything that compares targets then handles it automatically, including the pin banner.
- `setComposerTarget(target)` (6421) is the only writer outside the Advanced fields. It sets `#cWhere`, runs `fillThreads()` (3694) for `#cThread`, then `#cTo`.
- What the view implies: `composerViewTarget()` (6411): thread selected → `{scope,dir,thread}`; room → new topic; direct → latest thread. `composerFollowView(preserve)` (6436) re-targets when `sel` changes.
- "A draft never moves silently" = `composerPin`:
  - In `composerFollowView`: `if(composerHasDraft()&&now.scope){composerPin=want;return composerTargetRender();}`.
  - `composerHasDraft = notificationHasDraft() || voiceWorkPending` (6425, 6191).
  - `notificationHasDraft()` = body, `#cNewThread`, `#cNewRoom`, `replyTo`, or `composerStructured` non-empty.
  - The pin renders a banner "Draft for X, not this view." with "Post here instead" / "Keep" (6486-6488).
  - Also guarded in `activateNotification` (6213): reply from a notification is refused if there is a draft.
- Chip row: `composerTargetRender()` (6471) shows or hides the chip row when destination == view (`same`, 6494). It writes "Posting to:" / "Replying in" (the lead text depends on `replyTo`, 6476) and the `.posting` mark in the sidebar (`composerMarkSidebar` 6503).
- IMPORTANT: there is no per-destination draft store for the composer. There is exactly ONE composer body (`#cBody`) and one `replyTo`. `scripts/draft-manager.js` (61 lines) is a different feature: it manages saved FORM-ANSWER drafts (`formDraftBucket`, keyed `[boardIdentity,user,m.path,QUESTION]`) in a dialog, import/export JSON. It is NOT a composer-draft manager. "Drafts keyed by destination" does not exist today. The Slack-like requirement "sub-thread composer is its own destination" is therefore either:
  - (a) a second, separate composer instance inside the pane (own textarea, own `replyTo`-like state, own send), or
  - (b) reuse the single composer and retarget it with the pin rule.
  Option (a) is the Slack model and avoids silent moves and pin churn, but duplicates the composer chrome (status, language, content type, signing notice, structured attachment, voice, completions, size/height persistence `S.composerH`, `wireComposerResize` 3966, `signingDraftStamp` 7776 etc.). Almost every composer function addresses ids (`#cBody`, `#send`, `#cStatus`...) by hard-coded selector. Option (b) keeps one composer and only adds a destination dimension. This is the cheaper path and matches existing SPEC-064 semantics: opening a sub-thread pane with a non-empty draft in the main composer sets `composerPin` rather than retargeting.
- `signingDraftStamp()` (7776) hashes ALL `#composer` inputs plus `.choice-form`, `.board-form` inputs anywhere in the document, plus `composerStructured`. Pane forms are covered if they use the same classes. The voice session context (board.html:9162) includes `replyTo`; extend with the sub-thread destination.

### REPLY-TO when replying
- `startReply(m)` board.html:3723: sets global `replyTo=m`, shows `#replying` bar, calls `setComposerTarget({scope,dir,thread:m.tkey,to:author})`, prefills `@Name ` (`startReply.auto`).
- `clearReply()` 3734 resets `#cTo` to `all`, clears auto text.
- `sendImpl()` 3745-3787 reads the hidden selects, resolves tid/label from `threadsOf()[tkey]`, builds `composeMessage({..., replyTo: replyTo ? replyTo.file : null, ...})`. Afterwards it clears body/new-thread/new-room/reply and calls `syncLang(true)`, `historyCreationReset()`.
- `composeMessage(o)` 2436-2512 builds the header array (2487-2490: FROM TO SCOPE/ROOM|DIRECT-PARTICIPANTS THREAD DATE LANGUAGE REPLY-TO RUNTIME STATUS, then POSTED-AT, TOPIC-TITLE, CONTENT-TYPE, EXTENSION...). The new header goes in here: `if(o.subthread) headers.push(["SUBTHREAD", o.subthread])`. Also validate it with `messageMetadata`, which receives `Object.fromEntries(headers)`. The legacy dialect (`pokoje`) must reject it (like `choice_legacy` at 2511).
- ALL 6 `composeMessage` callers must pass `subthread` when the source message is a member of one, otherwise answers to a question inside a sub-thread would land in the main flow:
  - board.html:3352 `sendChoice` (choices)
  - board.html:3776 `sendImpl` (normal send)
  - board.html:4007 `setTopicTitle` via `deliverMessage(options)` (topic rename; stays main-thread)
  - scripts/form-board.js:53 `sendFormAnswer` (board.html:4351)
  - scripts/form-board.js:105 `withFirstAnswerClaim`/acceptance (board.html:4403)
  - scripts/extension-ui.js:98 `sendExtensionAnswer` (board.html:5742)
  A helper `subthreadOf(sourceMsg)` called at all six sites is the minimal change. Answer validation also requires the same tid: messageMetadata 3287 "Answer routing differs" and answer-state.js:20. Consider extending those routing checks to also require the same `SUBTHREAD`.
- Write path: `deliverMessage` 3983 → `writeNewFile` 2549, `guardWritePath` 2535 (path shape `rooms|direct/<dir>/<file>.txt`). Sub-thread messages are ordinary files in the same directory with the same `<date>_<time>_<sender>_<T###>_<slug>.txt` filename, so no path changes. `nativeIssue` filename regex requires `THREAD` to start with the filename tid.

### Signing status per destination
- Policy is resolved by PATH + tid: `context.minimum(path, tid)` (scripts/signing-contract.js:301; message eval at :390; viewer calls at board.html:7222, 7385, 7746, 7790).
- Composer side: `signingDestinationPath()` (board.html:7191, scripts/signing-ui.js) derives `{path, thread}` from `#cWhere/#cNewRoom/#cThread`. `signingPostBlock()` (7218) computes required→`signingSendDecision`→status for the notice (`updateSigningNotice` 7264, `signingRequirementNote` 7381).
- A sub-thread inherits its thread's requirement automatically as long as tid + room are the same. Nothing breaks, nothing needs learning, unless canonical adds sub-thread-level signing policy. The pane's composer must call the same `updateSigningNotice` and show the same note, since only one `#signingNotice` exists. Option (a) above needs a second notice element.
- Delivery check `signingDelivery` (7779-7818) uses `signingDraftStamp()` to refuse when the draft changed during signing; the pane composer must be included in that stamp.
- Room-history recording is by scope and tid (scripts/room-history.js:386 `records(config, scope, thread)`), unaffected by SUBTHREAD.
- `composerBlock(target)` (6464) is the natural place for "this sub-thread's root is missing/invalid" refusals (returns `{text,actions}` and disables Send at 6491).

## 4. Layout

- DOM (board.html:749-835): fixed `.top` header, `#settings` popover, then `<div class="app">` grid:
  `aside.side#side | .resizer#resizer | section.feed-wrap` (`.feed-head`, `#feed`, `#composerResizer`, `#composer`).
- CSS: `.app{display:grid;grid-template-columns:var(--sidew,270px) 6px minmax(0,1fr)}` (board.html:71). `.feed-wrap` is a 4-row grid (130). A right-side pane fits as a 4th column: `... minmax(0,1fr) var(--subw,360px)` and a new `.sub-pane` (or as a second `.feed-wrap` column holding header, scroll area and its composer). Remember `body.side-hidden .app{grid-template-columns:0 0 minmax(0,1fr)}` (488) and `body.side-peek` rules (502) pin explicit column templates. A 4th column must be added to those three templates, not just the default.
- Sidebar and breakpoints (SPEC-002-068, scripts/sidebar-menu.js):
  - drawer iff `innerWidth<=820` (`sidebarDrawer` sidebar-menu.js:72). Above 820px: shown by default at >=1000x560, hidden otherwise, saved choice in localStorage `SIDEBAR_KEY`; hover-peek on left edge.
  - Other breakpoints in play: 600px (phone: two-row header, full-screen dialogs), 480/640px heights (compact composer, collapsed options), 1100px (`#verbar`, toolbar), 1200px (menu label), 900px (signing keys two-column).
  - SPEC-068 AC1 matrix: viewports {1280x800, 1280x560, 1280x460, 900x500, 700x420, 640x800, 390x640, 390x560, 320x360...}. Layout violations are checked by `layoutViolations` in tests/lib/helpers.js:261 (no overflow). A pane that opens at 1280 wide needs an explicit rule for 821-1099px (feed would be squeezed, so overlay or auto-hide the sidebar).
  - Proposed responsive behaviour mirroring the sidebar: >=1100px inline 4th column (resizable like `#settingsResize`); 601-1099px overlay sliding in from the right over the feed (like `.side.open` + `.side-scrim`, 489); <=600px or <=480 tall full-screen (like `dialog.afb-dialog` rule at 635-643: `width:100dvw;height:100dvh`).
- Right-side precedent:
  - `#settings` (749) is a `position:fixed` right popover (185, 644) with a resize handle `#settingsResize` (scripts/panel-layout.js:8-26, `S.settingsW`, `settingsWidthBounds`, pointer capture, ArrowLeft/Right keys, dblclick reset, `addEventListener('resize', applySettingsWidth)`). Copy this pattern for pane width (`S.subW`). It is not a dialog (SPEC-075 amendment: "Settings is a popover; why #sClose was kept").
- Dialog shell (SPEC-002-075): `dialog.afb-dialog` with `.afb-dialog-head` (sticky title + `.afb-dialog-close`) and `.afb-dialog-foot` (board.html:614-643), compact variant `afb-dialog-compact`, full-screen at `(max-width:600px),(max-height:480px)`. A phone full-screen sub-thread can reuse these tokens (`--dialog-pad`, head/close classes) for the pane header but must not be a modal `<dialog>`: it has to coexist with the composer and board refresh. `sidebarPeekAllowed` (sidebar-menu.js:92) checks `document.querySelector("dialog[open]")`; a pane that is a dialog would suppress peek. Do not make it one. Test `tests/dialog-shell.test.js` enforces dialog conventions; a non-dialog pane is outside it but should reuse the head classes.
- Z-order: `.side.open` z6, `.side-scrim` z5, settings z30, peek zone z6.
- Only one modal sidebar scrim exists. For a drawer-mode (<=820) sub-thread pane that is full-screen, `#menu` and the sidebar drawer must be disabled/closed while open (`closeSidebarDrawer`, scripts/sidebar-menu.js:117).

## 5. Unread, notifications, search, refresh, persistence

- Read cursors: no cursors; a per-path map. `seen[m.path]=true` stored in localStorage key `agent-file-board-ui.read.[boardStorageId|name,dialect]` (`loadBoard` board.html:2768-2769, `markViewRead` 3081, `lsSet(seenKey,...)`). `unread(m)` 3037. `markViewRead(page.rows)` marks everything in the current rendered window as seen (only when `document.visibilityState==="visible"` and, for background refresh, only when the reader is following the bottom, 3092).
  - LEARN: main `build()` marks only `messagePage(matchingMessages())` rows, so once sub-thread messages are filtered out of `matchingMessages`, they are never marked read by viewing the main thread. Good. The pane must call `markViewRead(subRows)` itself when visible and following.
  - Unread aggregation in `build()` (3098-3101): `unreadTopics` by `tkey`, `unreadDirs` by `dkey`, shown as sidebar badges (`badge()` 3036 `unread_count`). Decision: do sub-thread unreads count in the thread/room badge? Slack: they are shown on the root's summary line plus a "threads" view. Suggest a separate count on the root summary and also folded into the sidebar `unreadTopics` so nothing becomes invisible (otherwise a sub-thread reply produces NO signal anywhere, which is risky).
  - `seen` is keyed by path, so existing history is unaffected (old messages have no SUBTHREAD).
- Notifications: scripts/notifications.js (== board.html:6127-6232). Follow kinds `room|thread|participant` (`cleanNotificationFollows` 6130; stored in IndexedDB `notification-follows-v1:<binding>`). `notificationMatches(state,m)` (6144): room by `scope+dir`, thread by `m.tkey`, participant by author. Because sub-thread messages share `tkey`, a thread follow already matches them. So default behaviour = "follow thread includes its sub-threads" with zero changes. Changes needed:
  - `activateNotification` (6209-6218): sets `sel={scope,dir,thread}`, jumps via element id `m-dkey|file`, then optional `startReply(m)`. For a sub-thread member it must open the pane on that root and scroll there instead, and the reply path must target the pane destination.
  - Notification entry: `title: dir+" · "+label` (6162): add a "(sub-thread)" marker plus root summary.
  - Candidate: a new follow kind `subthread` (key = skey) as Slack "follow this thread". `NOTIFICATION_WORDS` and the dialog selects (renderNotifications 6192-6207), `NOTIFY_FOLLOW_LIMIT=100` and the persisted schema (`cleanNotificationFollows` rejects unknown kinds, so an old viewer drops them; forward-compat is fine).
  - `notificationHasDraft()` (6191) is used in two places (pin logic and reply gating): include the sub-thread composer state if option (a).
  - Test: tests/notifications.test.js.
- Search: `#q` input; `msgMatches(m,q)` (2992) tests body+file+all header VALUES joined, so `SUBTHREAD: <root>` already matches searching by filename. `matchingMessages` applies search over the selected scope; `startBodySearch` (2998) scans all `model.msgs` for body hits lazily. Search results come from `matchingMessages()` too: a hit inside a sub-thread would be hidden if members are filtered out of the main view. DECISION: when `q` is non-empty (or sel is All messages), include sub-thread members and label them (chip "in sub-thread of ..."), with click → open pane. `suggest()` (3791) builds the search dropdown from threads and messages; check it.
  - Existing `matchedTopics` in `build()` (3103) selects sidebar topics by hit; unchanged.
- Refresh: `tick()` 4082 → `readFromHandle()` 2642 (auto refresh loop 4092-4094, skipped when hidden unless background notifications on) → `buildModel` → `loadBoard(model, background=true)` 2764 → `build({background,preserveComposer})` → `fillComposer(preserve)` → `render(background)`. A refresh replaces `B` wholesale (new model object), so anything holding message OBJECTS across refresh is stale. `replyTo` is a stale model object after refresh too (it is re-read by `.file` at send time, so OK). The pane state must be stored as KEYS (dkey + root file), never as message objects, and re-resolved from `B` each render.
  - Selection preservation: `sel` is a plain module variable that survives refresh. `loadBoard` clears it only if the room vanished (2777). If the thread vanished, `sel.thread` stays and `threadsOf()[sel.thread]` returns undefined. The existing code tolerates that in `composerViewTarget` (checks existence). Same defensiveness is needed for a pane whose root vanished or became invalid: close with a notice.
  - Focus/reading preservation: see 1 (render keeps scroll, bottom-follow, expanded messages, focused choice forms and `.board-form` caret, report/info/extension nodes via `reuseReportNodes/reuseFormNodes/reuseExtensionNodes/preserveInformationState/preserveReviewState`). Every one of those helpers queries `$('#feed')` (list in section 6). A second container would not be preserved unless parametrised.
  - Composer preservation across refresh: `preserveComposer:true` → `fillComposer(true)` → `composerFollowView(preserve)` returns early (6441).
- State persistence (no URL routing at all: no hash, no pushState, no query; only the voice helper uses a hash): `rememberView()` 3813 saves `S.lastScope,S.lastDir,S.lastThread` in settings (IndexedDB `kv/settings` with localStorage mirror, `saveSettings` 3881, `loadSettings` 3839); restored in `loadBoard` (2773-2776) only if the thread still has messages. Add `S.lastSub` (root file) and validate that it still exists, or intentionally do not restore (a pane reopening on startup may surprise). Also there is `S.collapsed`, `S.closedGroups` per dkey. A DEF defaults object must get any new key; look at `DEF` near `S` initialisation. No browser back/forward integration, so Esc/close button handling is all manual.

## 6. Features rendered inside messages; must work inside the pane

The message body template is one big string inside `render()` (3446-3458) mixing: header chips, reply-ref, `signingMessageHtml(m)` (7632 badge), repair note, `formatBody`, `informationPlaceholder/reportPlaceholder/extensionPlaceholder`, `answerReview(m)`, `choiceHtml(m)`, `.tools`. To reuse them in the pane, extract this to `messageHtml(m, ctx)` and call from both. All "mount" steps then run on placeholder nodes after insertion:

| Feature | Placeholder / mount | Container hard-wired to `#feed` | Citation |
|---|---|---|---|
| OpenUI reports | `reportPlaceholder` 3374, `mountReports` 3387 | `$("#feed").querySelectorAll("[data-report-path]")` | board.html:3389; `reuseReportNodes` 3379 |
| Choices (single/multi + ANSWER) | `choiceHtml` 3328, `rememberChoice` 3323, `sendChoice` 3337 | delegated input/change/submit listeners | board.html:9403-9404 |
| Forms v2/v3 | `formPlaceholder` 4320, `mountForms` 4323, `reuseFormNodes` 4321 | `$('#feed').querySelectorAll('[data-form-path]')` | scripts/form-board.js:28 |
| Accepted answers / acceptance buttons | `acceptedAnswerHtml` 4377, `bindAnswerChoices` 4393 | `$('#feed').querySelectorAll('[data-accept-question]')` | scripts/form-board.js:95,100 |
| Extensions | `extensionPlaceholder` 5674, `mountExtensions` 5691 | `$('#feed')...[data-extension-path]` | scripts/extension-ui.js:49 |
| Information blocks | `informationPlaceholder` 5482 | `$('#feed')...[data-information-path] details` | scripts/information-ui.js:42 |
| Answer review | `answerReview(m)` 5772 | `$('#feed')...[data-review-path]` | scripts/answer-review.js:34 |
| Message disclosure (open/closed `details`, "show all") | `MessageDisclosure` 5214, `disclosureKey` 5233 uses `msg.id` | MutationObserver and capture-click on `#feed` | board.html:9403-9419 |
| Signing badge | `signingMessageHtml(m)` 7632 | none (pure html) | OK as-is |
| Room-history missing-message check | path/scope based | n/a | see below |

- Sub-thread-specific bug risk: IDs and data attributes are keyed by `m.path` (unique) so the same message in two places (root in feed and root as pane header) would be mounted twice. `formRoots` (a `Map` keyed by `m.path`), `extensionRoots`, `reportNodes` are keyed by path and assume a single DOM instance. Do NOT render the same question/form message in both containers. Pane header should show the root as a plain, non-interactive quote (body text only, no form or choice).
- ANSWER flow in a sub-thread: question (QUESTION header) in sub-thread, answers are REPLY-TO the question with `tid` equal and (new) same SUBTHREAD. `prepareAnswerStates` (4357): `records` are `m.dkey===q.dkey && m.replyTo===q.file && m.tid===q.tid`. It has no sub-thread concept, and with consistent SUBTHREAD it works unchanged. Make sure `composeMessage` callers pass it (section 3), or the answer lands in the main flow though it still resolves.
- Room-history missing-message check: `prepareHistory` 4562, `historyNativeHost` 4463 lists scope directories (`rooms/<dir>`, `history/rooms/<dir>`), so it is by-file, not by-thread. Sub-thread messages are included automatically. The indicator UI is `historyIndicatorUpdate` 4631 and `historyDialog` 4668, called from `render()` (3414). Unaffected. Only the thread-level recording setting (`records(config,scope,thread)`) uses tid, and sub-thread messages share the tid.
- Signing badge/eligibility excludes: `signingExclusionHtml` (7388); unaffected, but note `signingEligible(m)` false messages in a sub-thread must still count toward neither unread nor summary counts (reuse `unread()`/`notificationEligible()` logic for counting).

## 7. Test infrastructure (owner policy: NO VoiceOver; unit tests and text/hierarchy/layout snapshots only)

- Runner: `node --test tests/*.test.js` plus python unittest (`npm test` also runs all embed `--check`, `formal/check_alignment.py`, `build_update_checker.py --check`, `build_signing_diagrams.js --check`). Playwright (chromium) drives board.html directly: `tests/lib/helpers.js`:
  - `launch`, `openPage(browser,{html,tree,dialog,viewport,fixedTime,init,context})` (165), a fake File System Access API over an in-memory tree (`fakeFsScript` 78), `readTree/writeTree/layoutExample/layoutShuffled/tmpDir`, `openBoardViaUi` (215), `openView(page, 'room|T003' | 'room:x|T00N' | 'direct:a--b|T002')` (231), `openDestination` (237), `expandComposer` (223), `openTopicMenu` (246), `layoutViolations` (261), `feedOrder` (298), `reloadSettled` (304), `boardctl(args)` (285, runs the canonical Python CLI in vendor/agent-file-board to produce messages).
  - Fixtures: vendor/agent-file-board/examples/full-conversation (a canonical example board; reached via `h.EXAMPLE`), tests/fixtures/legacy-board, rich-metadata.json, room-history-setting.json. tests/lib/signing-fixture.js builds signed boards (`fixture`), tests/lib/signing-browser.js (`importBoard`, `openSigning`...). tests/lib/checks.js (`openExample`, `checkKeyDiff`). Note the vendor submodule shows as `-ec55bed...` in `git submodule status` but the files are present in the working tree.
  - Pure-unit style tests: tests/ordering.test.js, tests/composer-routing.test.js, tests/compact-layout.test.js, tests/notifications.test.js, tests/message-ui-state.test.js use `window.__boardTest.buildModel/composeMessage/getModel`, so sub-thread grouping/validation can be tested by adding `.txt` files to a tree with `SUBTHREAD:` headers and calling `buildModel`. A synthetic message fixture is easy: see the `head(slug,posted,body)` helper at tests/ordering.test.js:4.
- Visual (SPEC-002-070), tests/visual.test.js + tests/visual/scenes.js (272 lines) + tests/visual/generate.js:
  - A scene = `{name, setup(page), viewport?, signing?, pointer?, shots:[S(name,w,h)|COMPOSER_SIZES(name)]}` in the `GROUPS` array (scenes.js:146-181). `SCENES` is derived (181). Each shot gets (1) a LAYOUT SNAPSHOT: `tests/visual/layout/<name>.json`, geometry/visibility/style/labels of the fixed `LANDMARKS` selector list (scenes.js:20-34, `box`/`flow`/`intrinsic` flags) compared by `compareLayout`, all platforms; written only with `AFB_UPDATE_SNAPSHOTS=1 node --test tests/visual.test.js`; and (2) a PIXEL BASELINE `tests/visual/pixels/linux/<name>.png` compared only on Linux CI (or `AFB_VISUAL_PIXELS=1`), written by the CI workflow `update_visual_baselines` (not locally; macOS fonts differ).
  - A meta test asserts every scene has a layout JSON and every json/png belongs to a scene (visual.test.js:67-72). Adding a scene means: add to GROUPS, add LANDMARKS entries for the pane (`.sub-pane`, `#subClose`, `#subComposer`...), generate layout JSON locally, get PNGs from CI. A non-vacuity mutation test pattern exists (visual.test.js:75+): follow it for the pane.
  - `exampleBoard()` (scenes.js:137) writes extra message files into a copy of the example project: add SUBTHREAD messages here, but note it changes ALL existing scenes' `all-messages`/`topic` baselines if the new files appear in the shown thread. Prefer a separate board/thread (e.g. `T005`) to avoid re-baselining everything.
  - Existing sizes: `COMPOSER_SIZES` runs 1280x460, 390x640, 320x360 (see layout dir names `*-1280x460.json`...). Suggested new scenes: `subthread-pane` (1280x800), `subthread-overlay` (900x600), `subthread-phone` (390x640), `topic-with-summary` (summary row in main flow), `subthread-pl`.
- Existing text/hierarchy checks: `tests/lib/checks.js`; SPEC-070 policy.
- Screenshot scripts: scripts/screenshot*.js generate docs/images (not tests): screenshots_all.js, screenshot_features.js, screenshot_panels.js (panels/settings), screenshot_workflows.js. Add one for docs only if the docs need images.
- i18n guard tests (tests/i18n.test.js:21-37) FAIL when: EN/PL key sets differ, a `t("key")`/`data-i18n*="key"` is used but missing, a table key is never referenced (dead key), a PL value equals EN (unless in `SAME_OK`), placeholders `{x}` differ. So every new string must exist in both tables and be referenced literally as `t("key")` or `data-i18n="key"`. Dynamic key construction such as `t("x_"+kind)` will trip the dead-key check unless the full literal appears somewhere.

## 8. i18n

- `const STRINGS = { en:{...}, pl:{...} }`: en at board.html:1589-1900, pl at 1901-2212; the `SAME_OK` list follows (about 2213). `t(key, vars)` at 2218 (`{name}` placeholders; falls back to EN then the key itself). `esc()` 2226.
- Inline bilingual strings in the SCRIPTS use `exText(en, pl)` (defined scripts/extension-ui.js:6: `S.lang==='pl'?pl:en`). Used throughout composer-options/signing-ui/notifications for newer features, with no table entry, so those are exempt from the key tests. For new pane strings either style works. The string table is checked, while `exText` is not.
- Static HTML labels use `data-i18n`, `data-i18n-ph`, `data-i18n-title`, `data-i18n-aria` attributes applied by `applyI18n()` (3908). Reply-related existing keys: `reply_btn` 1868, `in_reply_to` 1867, `replying_to` 1871, `cancel_reply`, `n_messages`, `last_status`, `unread_count`, `outside_filter`.
- Language lives in `S.lang` (`en`|`pl`), settings select `#sLang`. Locale for dates `locale()` 2251 (`pl-PL`/`en-GB`). Counts need pluralisation: Polish plural forms (1 odpowiedź / 2 odpowiedzi / 5 odpowiedzi) are not supported by `t()` placeholders (there is no plural helper), e.g. `closed_group`/`n_messages` use "{n}" with a neutral phrasing. Expect to write a small `plural(n, forms)` helper or use neutral phrasing like "Odpowiedzi: 5".

## 9. Docs/specs to update (non-code)

- docs/FEATURES.md, docs/guides/COMPOSER.md (destination model and draft-pin section lines 62-90 and 135), docs/guides/NOTIFICATIONS.md, docs/guides/PANELS.md, README.md, CHANGELOG.md.
- Specs follow the pattern specs/SPEC-002-0NN-*.md (Problem, Design, Acceptance criteria with test plan, Implementation notes, Amendments). A sub-thread spec likely amends SPEC-002-064 (destination model: adds a sub-thread dimension and keeps the draft-pin rule) and SPEC-002-068 (layout matrix: add the pane to AC1 viewports and the drawer rules).
- Canonical standard lives in the vendor submodule (vendor/agent-file-board: boardctl.py, answer_state.py, message_extensions.py, docs/). `composeMessage` mirrors `boardctl post`, and `formal/` has an alignment check (`python3 formal/check_alignment.py`). The `SUBTHREAD` header (and its validation) must first exist in canonical `boardctl.py`, and the viewer must be kept in sync, or the alignment check and cross-tool tests will diverge.

## 10. Riskiest areas (ranked)

1. render() is monolithic and bound to `#feed`: about 12 helper functions (`mountReports`, `mountForms`, `mountExtensions`, `bindAnswerChoices`, `preserveReviewState`, `preserveInformationState`, `reuse*Nodes`, MessageDisclosure observer, click/submit/input delegates, bottom-follow, history paging) query `$('#feed')` directly, spread across board.html AND 4 generated scripts. A second message container needs these parametrised by container, or a deliberate decision to render the pane through the same code with a container argument. Highest cost and regression surface; the most visually-tested code (many scenes/baselines).
2. Single composer + single global `replyTo` + hidden-select destination model. Adding a sub-thread destination to `composerTarget/Key/ViewTarget/setComposerTarget`, the draft pin, `notificationHasDraft`, `signingDestinationPath`, `signingDraftStamp`, voice context and `startReply` must not break the "draft never moves silently" rule (SPEC-064 AC5). A second composer instance avoids it but duplicates a lot of id-addressed chrome.
3. Header source of truth: all six `composeMessage` callers (sendChoice, send, form answers x2, extension answer, topic title) must stamp SUBTHREAD consistently; otherwise answers/acceptances silently post to the main flow. Validation must live in `messageMetadata`/`nativeIssue` and mirror canonical `boardctl.py`, otherwise `formal/check_alignment` or the vendor tests fail.
4. Thread aggregates and unread: `threadsOf()` (n, last, status, who, lastOrder), `build()` unread maps, sidebar order by "newest", subtitle `lastSt`, and `matchingMessages()` all treat every message as main flow. Missing any one gives wrong sidebar activity or invisible unread (a sub-thread reply creating no signal anywhere).
5. Refresh churn: `B` is replaced on every refresh; pane state must be key-based and re-resolved, and must survive the root vanishing, becoming invalid or becoming signing-excluded.
6. Responsive layout: 4th grid column interacts with three separate `.app` grid templates (default, `side-hidden`, `side-peek`), the 820px drawer, the hover-peek, the compact-composer breakpoints and the SPEC-068 viewport matrix; the Linux pixel baselines need CI to regenerate.
7. Duplicate DOM identity: `m-<dkey>|<file>` ids, `data-*-path` keyed mount registries and disclosure keys assume one instance of a message per document. Never render the same interactive message twice.
8. i18n guards (dead key / PL==EN / placeholders) and Polish plurals.
