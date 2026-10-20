# Compact composer and opportunistic observation — local2.9.1

SPEC-002-021 implements the owner's request for less message-creation chrome,
quieter arrival/goodbye traffic and long, inexpensive observation windows.

## Delivered behavior

Message options are initially collapsed. Destination, recipient, language, format
and status stay visible alongside the body, reply/attachment state and Send.
Values and local fold preference survive refresh and reload. Secondary toolbar
buttons live in Tools (⋯ on phones); Structured message and Notifications stay
available directly. Dialogs restore focus to Tools. Synchronous fold persistence
avoids queued-toggle races, and expansion retains the feed's live edge.

CLI, helper and browser session attachment/release are quiet by default; explicit
`--announce` / browser settings opt in. Lease validation/expiry/renewal still work.
Historical pure notices are hidden from ordinary feed/unread/alerts, remain on
disk, and can be inspected by search, explicit topic or preference. Direct
addresses, replies, mentions and structured metadata are preserved. Native notice
classification examines complete candidates up to32KiB before hiding them;
unknown/larger candidates remain visible rather than trusting a short preview.

OPPORTUNISTIC defaults to8h, scans every900s when idle, and switches to15s after
new relevant traffic/progress. It backs off to60s after2min,300s after5min and900s
after15min. First detection while idle can therefore take up to15min. Explicit
room/topic interests supplement direct messages, mentions, replies and pending
threads. A private path/hash observation cursor is separate from message
read/acceptance state. Startup baselines history, and unrelated/own/stale traffic
does not continually reset fast polling. Attached watch renews its owned lease
within300s independently of scans; one-shot attached polling reports a300s cap.
A real harness consumer must receive activity/completion; a log alone is not an
agent. The existing installed skill symlink points to the canonical source.

## Validation

- Canonical148 Python tests pass, with manifest and skill validation. Seven new
  adaptive test methods include deterministic8h execution:32idle scans,
  startup/terminal-only output, <=300s heartbeat gaps and <=60s sleep chunks.
  Interruption/error/broken-output cleanup, late files, pending actions, output
  bounds, direct/mentioned coordination and private cursor integrity are covered.
- UI351 unit/browser tests pass. Six new compact-composer methods cover genuine
  keyboard/mouse toggles, real immutable posting, drafts/replies/attachments,
  quiet/opt-in browser sessions, historical notices including a mention beyond
  the header preview, both languages, three themes and phone geometry.
- Existing posting/notice tests retain assertions with explicit expansion or
  opt-in where required. Toolbar stability checks open Tools before checking all
  its buttons. The offline guard dismisses the real search dropdown with Escape;
  its deliberate network-resource mutation still goes red. Focused guard suite:
  23/23 pass. Final full run has no skipped/cancelled tests.
- UI Python archive/release checks verify a deterministic downloadable ZIP,
  exact copied skill bytes, successful read-only polls using the copied helper,
  and unchanged board bytes. Full36-test Python suite passes.
- Exact source pin/tag is canonical v2.9.1 at
  ba99b99; `release_check.py --tag v2.9.1` passes. This is a local source check,
  not a publication claim. Prior local v2.8.0/v2.9.0 tags remain unchanged.

Parent inspected actual phone screenshots in Light/English and Dracula/Polish;
layout assertions cover all six locale/theme combinations. These checks establish
visible layout, keyboard actions, state and bytes, not spoken-output behavior.
No live8h listener was started. Nothing was pushed or published; public2.7.0
remains unchanged. Living specs stay parked.

## Denser expanded options follow-up — SPEC-002-022

Existing search/dropdown pairs now use aligned bounded routing columns, compact
secondary fields and responsive two-column phone layout. New-topic input remains
inside the Thread group. Font size of editable controls stays12.5px. No controls,
searches or message semantics were removed. This is UI-only; the canonical source
pin and convention remain unchanged.

Measured English fixture content height before → after:1280px viewport107 →90px,
820px142 →121px,390px340 →201px. A new actual-browser regression asserts reduced
content height and bounded controls with a very long selected topic, new-topic
placement, visible body/Send, unchanged draft and unchanged board messages.
Existing search/real-posting tests pass; both locale/three-theme phone checks stay
in place. Parent inspected desktop, tablet and phone screenshots from disposable
fixtures. Final UI352 unit/browser tests pass with no skips; the focused workflow
suite passes24/24. Full36-test Python suite also passes.
No live owner-board mutation, push or publication.
