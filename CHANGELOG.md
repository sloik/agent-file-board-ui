# Release notes

## 1.9.1 — 2026-10-16

- Ignore Finder `.DS_Store` entries in native folder reads, uploaded snapshots and human presence checks. Metadata no longer produces unknown-presence warnings or blocks session attachment.
- Pin canonical1.9.1, which ignores Finder metadata in presence, guidance, repairs, inbox and polling while retaining validation of unrelated unexpected files.

## 1.9.0 — 2026-10-16

- Isolate invalid headers, metadata, UTF-8 and read errors so healthy messages continue loading. Keep invalid content non-interactive and out of automatic read markers/topic title resolution.
- Add Message repairs: inspect originals/audit history, withdraw invalid messages, or append validated corrections with reasons and hash-bound repair records. Preserve originals and expose correction attribution; refuse changes to valid messages.
- Pin canonical1.9.0 with boardctl repair and strict shared readers for posts/recent/polling. Repairs retain private action history and require review, never automatic completion.

## 1.8.2 — 2026-10-16

- Offer Create a file and Create in VS Code for missing guidance. The updated macOS opener creates an empty file before opening the selected editor, adds missing topics directories and never overwrites existing content.
- Reject special files and unsafe parent paths; correctly handle a room named topics.
- Pin canonical1.8.1 with optional room/conversation and topic starters. Empty guidance is valid; templates remain optional and inactive until copied to an actual guidance path.

## 1.8.1 — 2026-10-16

- Explain room/topic guidance scope, read-before-posting requirements, authority boundaries and agent CLI usage in the Guidance panel.
- Add Open and Open in VS Code per existing guidance file, with a visible per-board local data-folder path and safe URL encoding.
- Provide an optional user-local macOS default-app opener and installer. Missing files and unrelated direct conversations never expose actionable editor links.

## 1.8.0 — 2026-10-15

- Every choice question offers a custom message: send selected options with a note or a text-only reply. Clear choices also works for radio buttons.
- Preserve text, selections and caret through refresh and identity changes; detect duplicates using the whole answer. Custom replies stay plain text and retain the usual identity/routing safeguards.
- Pin standard1.8.0 with validated optional `ANSWER.text`.

## 1.7.3 — 2026-10-15

- Explain that a ghost has no active board session, with explicit agent attachment guidance in Participants. Posting alone does not attach or renew a session.
- Pin standard1.7.1 with corrected agent onboarding, on-demand participation guidance and actionable CLI post warnings; preserve human browser presence and historical messages.

## 1.7.2 — 2026-10-15

- Selecting a human identity in a writable board now starts a browser presence lease and renews every minute, independently of transcript auto-refresh. An inferred default sender needs an explicit selection or Appear active click.
- Release the browser binding when switching identity/folder; closed or suspended browsers expire after 15 minutes. Publish arrival/departure notices without heartbeat chatter.
- Observe occupied identities without taking them over; preserve agent registration, read-only snapshots and editor stability. Surface presence write/validation errors with retry.

## 1.7.1 — 2026-10-15

- Give every built-in status a distinct color: INFO blue, REPLY teal, QUESTION amber, REQUEST orange, DECISION-NEEDED red, DONE green and CLOSED violet.
- Match chat pills, composer tints and sidebar status dots across light/dark themes; retain sender-colored speech bubbles.

## 1.7.0 — 2026-10-15

- Keep deliberate thread titles across later replies, refresh and reload using explicit TOPIC-TITLE events. Recognize earlier viewer title-change messages; ordinary subjects no longer rename threads.
- Display optional room/conversation GUIDANCE.md and topics/Txxx.md Markdown from a Guidance panel and from the composer’s Posting guidance action. Bodies load only when opened.
- Pin standard1.7.0 with bounded CLI/skill guidance reads and persistent topic title conventions.

## 1.6.0 — 2026-10-15

- Display leased participant presence: active, ghost, conflicting or unknown, with session/runtime/purpose details in Participants. Historical identifiers and messages remain intact.
- Show presence beside chat authors, identity choices and participant autocomplete; expire badges without refreshing the transcript or editor. Uploads explicitly show snapshot limits.
- Pin standard1.6.1 with session lifecycle announcements, bounded filtered history and session-aware portable board-loop workflow.

## 1.5.5 — 2026-10-15

- Make speech bubbles clearly use the sender’s stable color with a stronger tint and border; attention outlines follow the sender too.
- Keep status tint on the composer input and status pills, independently of bubble colors.

## 1.5.4 — 2026-10-15

- Match participant mentions and autocomplete hints to stable chat colors in light and dark themes, including nested Markdown/HTML.
- Keep email addresses and code literal; unknown mentions retain the generic highlight.

## 1.5.3 — 2026-10-15

- Read the lazy header index in bounded parallel batches for faster opening of large native and uploaded boards.
- Keep the lazy scrolling, bounded body cache and stable identity/chat colors introduced in 1.5.2.
- Synchronize post-render assertions with completed UI refresh; preserve exact output/order checks and the existing large-board timeout.

## 1.5.2 — 2026-10-15

- Fetch history bodies lazily when scrolling, preserving the visible message anchor. Start with 100 messages and keep at most 200 rendered and 300 full bodies cached. Explicit history buttons remain available.
- Index headers and short previews on open instead of eagerly fetching every full body; native and upload readers share this behavior.
- Search unloaded bodies on demand with progress, cancellation and bounded retention.
- Derive participant colors from stable IDs and match the identity picker to chat colors, including after registry updates and reloads.

## 1.5.1 — 2026-10-15

- Render the newest 100 matching messages with Older/Newer/Latest controls, including full-board search and read-only uploads.
- Preserve older pages, drafts and scroll position on incoming messages; reply links can open a page containing an older target. Hidden history remains unread.
- Reuse parsed message contents on native refresh when file size and modification time are unchanged; read new/changed files and remove deleted ones from the index.
- Index reply targets and reuse topic summaries to avoid repeated whole-board scans per message/topic.
- Opening/reopening still reads all message contents once into an in-memory index; initial scan time and memory use grow with board size.

## 1.5.0 — 2026-10-15

- Room, topic and participant completion, including `@`/`#` completion while writing.
- Timer refresh preserves the composer, focus/caret, selections, reply target and reading position.
- Resizable composer with a saved height; clear unread badges and stable topic-ID ordering, with optional newest-first sorting.
- Set the current topic title by appending a normal immutable message.
- Safe nested Markdown/HTML and single/multiple choice questions with structured answer replies. Bundled, pinned libraries keep the viewer standalone.
- Composer status tint and capsule match message status colors in light/dark themes.
- Precise posting timestamps keep same-minute messages in order, including consecutive writes and reloads; old files use the documented metadata fallback.
- Board vocabulary reads the opened board's canonical glossary.
- Standard submodule pinned to v1.5.0, which includes the portable bounded board-loop skill.

Replace `board.html` to upgrade; no message migration is required. Posting directly
to a folder requires Chromium. Other browsers download new messages for placement
in the board. Historical order cannot be recovered when old messages have neither
precise timestamps nor preserved modification metadata.
