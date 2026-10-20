# Release notes

## 2.8.0 — 2026-10-20

- Fix participant color collisions: preserve viewer-local identity assignments,
  resolve shared palette slots and generate colors beyond eight participants.

- Share offline syntax-highlighted source presentation across rich messages,
  report code/Markdown and SDK1.3 extension components.
- Add Git-style unified and side-by-side diffs, real hunk line numbers,
  numberless short fragments, source view and explicit source copy.
- Bound highlighting/parsing and preserve readable raw fallback for unsupported
  patches; no code execution, file reads, patch application or network activity.

## 2.7.0 — 2026-10-20

- Support portable SDK1.2 refresh declarations for declarative and approved
  worker components, with bounded host scheduling and a local automatic-update
  preference. Component refresh uses loaded board data; collection stays external.
- Add bounded local extension diagnostics with host/extension origins and
  explicit filtered export. No automatic uploads or board writes.
- Make unavailable extension components recognizable with quiet host-owned
  status and direct inspection of the exact package requiring local approval.

## 2.6.1 — 2026-10-19

- Add Settings → Send feedback with English/Polish labels and explicit GitHub
  issue navigation that preserves board drafts.
- Ship bug and feature/general feedback forms with cross-repository routing.
- Reference the canonical portable board-feedback skill and feedback guide;
  include exact offline copies in the downloadable demo ZIP.
- Preserve2.6 shared state, plugin boundaries and existing board behavior.

## 2.6.0 — 2026-10-19

- Attach bounded per-information provenance to plain or extension messages.
- Follow shared local artifacts while preserving recorded snapshots; distinguish
  stale/unknown readings, disconnection, missing data and offline conflicts.
- Add declared SDK1.1 state context to declarative and approved worker renderers.
  Preserve SDK1.0 behavior and exact local approval.
- Re-read shared state before native typed replies; changed context requires
  renewed review and replies retain the reviewed revision heads.
- Ship convention/CLI2.6 support, scriptable state commands and creator guidance.
  No command execution, collector service or living specifications.

## 2.5.2 — 2026-10-19

- Keep initial reply drafts bounded even with deeply nested array minima;
  validate cardinality only on explicit submission.
- Import portable local extension packages in the stock viewer; inspect facets,
  exact bytes, version ranges/exclusions, enable/disable, and retain old snapshots.
- Render declarative and compiled custom components through a bounded offline
  worker SDK. Approve/revoke exact code bytes locally, with readable fallbacks.
- Compose/preview pinned contract examples, review typed replies and append native
  or downloaded source-hash-bound answers. Original messages remain unchanged.
- Explicit compatible renderer switching/revert preserves historical contracts;
  copied boards retain packages without transferring browser approval.
- Ship matching convention/CLI2.5.1, creator docs and examples. Living specs remain
  parked and are excluded from this release.


- Add sidebar room/thread **...** menus for exact-scope Follow/Unfollow and
  preselected notification settings. Preserve drafts/navigation, keyboard focus,
  polling context and localized narrow layouts.

- Add local room, thread and participant follows, a bounded notification center
  and optional explicit browser alerts. Keep baseline history quiet and isolate
  native folder/identity preferences, with honest session-only upload/storage fallback.
- Navigate alerts to exact messages and prepare guarded quick replies through the
  normal immutable composer. Preserve unsent work; retain download posting on uploads.
- Document offline refresh/permission limits and absent inline OS reply. Add EN/PL,
  phone, storage, isolation, validation and transport regressions.

## 2.5.1 — viewer source tag only

Viewer publication cancelled after a final resource review found nested answer
array minima could amplify draft initialization. The viewer2.5.2 bounds defaults;
canonical CLI/convention2.5.1 remains the matching2.5-series standard.

## 2.5.0 — source tag only

Publication cancelled before delivery after finding that CLI optional-package
unavailability could hide readable messages and permit repair. Preserved source
tag; the corrected complete feature is delivered as2.5.1.

## 2.4.8 — 2026-10-19

- Turn the current folder label into one chooser for a new folder and recent
  locations. Remove the separate Change folder and Recent locations toolbar
  buttons; keep the folder label available on phones with bounded long names.
- Keep the new-folder action and Close pinned in the chooser. Preserve native
  cancellation, permissions, upload reselection, history identity and startup
  behavior. Show uploaded board names in the read-only folder label.
- Update UI flows, regression helpers/tests, docs, examples, demo and captures.
  Retain the stable timer line, resizable Settings, semantic colors and
  canonical2.4.0 in one offline HTML page.

## 2.4.7 — 2026-10-19

- Stop toolbar actions jumping when refresh countdown text changes width. Place
  status in a reserved line below actions, preserving button positions and
  toolbar/feed boundaries through minute/second changes, refresh rollover and
  paused/off/read-only states.
- Add real-scheduler geometry regressions across six screen widths in English
  and Polish; retain full phone status text, click targets and composer drafts.
- Update docs, examples, demo and captures. Keep one offline HTML page and
  canonical2.4.0; preserve dialog exits, Settings resizing and semantic colors.

## 2.4.6 — 2026-10-19

- Keep titles and Close controls visible when long Structured message, saved
  drafts, locations, protocol, vocabulary, presence, repairs, guidance and report
  dialogs scroll. Use opaque themed headers and wrapping titles.
- Add left-edge pointer/keyboard resizing to Settings, with saved width, viewport
  bounds and double-click/Home/default reset. Keep top Close and bottom actions
  visible while settings content scrolls.
- Update docs, demo, desktop/phone captures and layout regressions. Preserve
  Dracula semantic colors, one offline HTML file and canonical2.4.0.

## 2.4.5 — 2026-10-19

- Correct Dracula to style interface chrome only. Restore the established Dark
  participant and status colors in pills, speech bubbles, sidebar indicators and
  composer tints; keep report/chart data colors unchanged.
- Preserve exact message surfaces, borders, avatar/mention colors and hover tints
  when switching between Dark and Dracula, without rebuilding content.
- Add computed-color equality regressions, update docs/examples/demo and refresh
  the Dracula desktop/phone captures. Keep one offline HTML and canonical2.4.0.

## 2.4.4 — 2026-10-19

- Add saved System, Light, Dark and Dracula choices in Settings, localized in
  English and Polish. System follows live OS changes; fixed choices override it.
- Apply palettes to the viewer, native controls, reports, forms and charts without
  rebuilding conversations or losing mounted inputs, filters or composer drafts.
- Adapt Dracula’s official palette with readable labels, dark accent-button text
  and seven distinct status colors; retain its MIT notice in the standalone page.
- Update the offline demo, docs, captures and theme regressions. Keep one local
  HTML page and canonical2.4.0, with no backend or automatic network access.

## 2.4.3 — 2026-10-19

- Add Recent locations: up to 20 browser-local entries with last-successful-open
  wins ordering, actual native identity and project/.agent-board deduplication.
- Reopen native folders with normal permission/presence checks; uploads retain
  metadata only and require explicit file reselection.
- Migrate the old saved folder, follow the latest entry at startup, and provide
  confirmed remove/clear with atomic persistence, cross-tab retries and visible
  session-only fallback. Failed/cancelled opens never promote history.
- Update docs, demo, desktop/phone captures and regression coverage. Keep
  one offline HTML file and canonical2.4.0; no backend or network calls.

## 2.4.2 — 2026-10-18

- Add visual form authoring for all11 field kinds, options/defaults, v3 conditions,
  cross-field rules and editable-table columns, baseline rows and row permissions.
- Recover unfinished report/form JSON across reload through committed local
  storage; add20 named snapshots, explicit backup import/export/delete and
  same-board saved attachment restoration. Keep failed writes visibly memory-only.
- Add a packaged authoring example, workflow rehearsal/checklist and refreshed
  illustrated documentation. Keep one offline HTML file and protocol2.4.0.
  Rehearsal evidence does not claim real human adoption.

## 2.4.1 — 2026-10-18

- Add read-only typed answer comparisons with labeled initial/submitted values,
  changed cells, added/removed rows and final order, bound to the actual source.
- Add offline JSON authoring with embedded report/form examples, real renderer
  previews, validation and snapshot attachment to the normal guarded composer.
- Add local draft export/import/delete with exact source/respondent binding,
  explicit confirmations and accurate storage-failure behavior.
- Keep the single local HTML page, protocol2.4.0 and existing immutable messages.
  Add the fictional T015 agent/human/agent cycle, a bundled draft import example,
  illustrated docs and executable end-to-end/browser regression coverage.

## 2.4.0 — 2026-10-18

- Persist incomplete v2/v3 drafts across reload in local IndexedDB, with scoped
  identities, reset/success cleanup, bounded retention and visible memory fallback.
- Add form v3 conditional fields/dependent options and typed cross-field rules.
- Add bounded table row additions/removals/reordering as immutable typed replies.
- Add backed-up2.3.0 upgrades, shared parity/refusal cases, runnable examples and
  live offline demo workflow topics T013/T014, retaining all existing coverage.


- Audit current documentation and example indexes for 2.3 reports/forms; correct
  installation, upgrade, renderer, demo and minimum-version guidance.
- Document and validate source-bound typed form replies in a temporary board.

## 2.3.0 — 2026-10-18

- Add offline typed forms, selectors and editable table replies across all three
  planned batches: 11 field types and all 23 remaining upstream helper/control entries.
  Pinned catalogue coverage is 82/82 bounded adaptations; 34 static report types remain.
- Version QUESTION/ANSWER form metadata, typed required/default validation, calendar
  dates, slider steps and stable row/column cell-change replies. Preserve legacy formats.
- Keep drafts, focus and edits through polling/localization/navigation; append new
  replies with existing sender guards or download them in read-only mode.
- Add schemas, shared CLI/browser cases, safe 2.2.0 metadata upgrades, illustrated
  examples and downloadable demo forms with a historical typed response.

## 2.2.1 — 2026-10-18

- Ship a downloadable offline demo ZIP with the exact viewer, a synthetic board,
  fictional discussions/replies and all 34 static report types from the gallery.
- Add a guided tour and download/open instructions to OPENUI.md. Explore local
  controls or try a normal choice answer, including read-only upload/download.
- Build and validate the demo reproducibly from pinned public fixtures; attach
  it automatically to new releases while preserving older release assets.

## 2.2.0 — 2026-10-18

- Complete pinned static OpenUI coverage with 16 additional board types (34 total):
  specialty charts, icons, comparisons, tags, static Markdown, bounded embedded
  PNGs, card grids, carousel and modal. Coverage: 59 adapted, 23 deferred.
- Add board-report v3 with a 256 KiB header limit; preserve v1/v2 contracts.
- Keep local controls through polling and language changes, with offline media,
  modal cleanup, full chart data and desktop/phone layouts.
- Add the v3 schema, shared validation cases, CLI example, illustrated guide and
  previewed, backed-up metadata upgrades from 2.1.0.

## 2.1.0 — 2026-10-18

- Add board-report v2: metric cards, callouts/tags, text/code/lists, cards/stacks, tabs/accordions/steps and multi-series line/area/grouped/stacked charts. Existing v1 reports remain supported.
- Add local table filtering/sorting, state-preserving refresh/localization and scrollable phone plots with complete numeric data tables. No backend, network resources or new write actions.
- Pin upstream reference to react-lang1.0.1/react-ui0.18.1 at eb20708; publish an enumerated coverage matrix, bounded schemas, CLI example and illustrated guide.
- Extend safe metadata upgrades to2.1.0, including pristine2.0.1 boards and the v2 schema.

## 2.0.1 — 2026-10-18

- Add **Versions and updates**, linked from the version display and mismatch warning. Explain viewer vs selected-board versions and why Chrome refresh does not upgrade board metadata.
- Preview and explicitly update supported pristine native boards in writable Chromium using embedded canonical files, exact hash checks, backups and failure/recovery reporting. Preserve messages, identities, settings and custom guidance; block customized/newer/unknown protocol files.
- Include CLI preview/apply/online-check instructions, English/Polish copy, examples and screenshots. Browser remains offline; no SDK added to canonical.

## 2.0.0 — 2026-10-18

- Render completed versioned board reports with embedded OpenUI, a custom table and signed bar-chart library, and theme-aware layouts. Single-file/offline operation is preserved.
- Keep ordinary readable summaries and existing choice/ANSWER interactions; reuse report roots during refresh and release them when no longer shown. Invalid metadata disables controls; renderer failures show a fallback diagnostic.
- Follow canonical 2.0.0 metadata and migration rules. Upgrade CLI, board-loop and viewer together; existing immutable messages need no rewrite.


## 1.9.6 — 2026-10-16

- Add Open and Open containing folder actions to local message file/folder references, including inline absolute paths and Markdown/HTML file links. Preserve literal fenced code and sanitize authored links.
- Extend the macOS desktop opener for existing documents/folders without permitting programs, commands or message-driven creation. Rerun the installer to update it.
- Pin canonical1.9.2 with portable reference syntax and explicit-click rendering rules.

## 1.9.5 — 2026-10-16

- Complete the durable reload fix from1.9.4, including the original composer restoration and rapid-post/file-preservation checks.
- Wait for presence presentation to finish after lease writes and lifecycle notices before asserting active/ghost UI. Preserve all lease, badge, notice-count and validation assertions.

## 1.9.4 — 2026-10-16

- Store preferences, view state, read markers and guidance paths in IndexedDB, avoiding reproduced file-page localStorage cache divergence. Migrate existing settings and await restoration before enabling controls.
- Keep compatibility fallback usable during storage failures; recover fallback edits only against the same committed revision. Atomic checks and unique revisions prevent old journals from overwriting newer settings or being replayed after values change back.
- Back the simulated test filesystem with committed IndexedDB transactions, independently of renderer localStorage caches. Preserve exact message-file, index, displayed-body and ordering assertions across reload.
- Retain strict reload readiness and negative controls from1.9.3; await asynchronous error results without changing their assertions or timeouts. Canonical board format remains1.9.1.

## 1.9.3 — 2026-10-16

- Fix browser-test reload synchronization: await resolved storage checks, verify replacement-page readiness before closing the observer, and check persistence again afterward. Keep the existing 5-second deadline and UI assertions.
- Treat an explicit null remembered-folder value as absent, and report IndexedDB failures as errors. Add deterministic negative controls that reject the former helper.
- Verify rapid posts survive reload as exact stored files and indexed messages, alongside the existing displayed-body and precise-order assertions. No message format or data migration changes.

## 1.9.2 — 2026-10-16

- Clear stale repair diagnostics and disable actions while the selected original loads. Decode and hash the same byte snapshot, ignore stale selection results, and expose loading readiness for browser checks.
- Include the Finder metadata fixes from1.9.1.

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
