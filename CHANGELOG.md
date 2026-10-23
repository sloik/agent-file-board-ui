# Release notes

## Unreleased

- **Automatic room history (SPEC-002-063, with canonical 3.3.0):** the
  Missing-message check shows each room's declared setting ("Records automatically
  on signed posts", or the topics that do), who has recorded it with each
  recorder's key status ("Recorded by …"), and for recorders this device has not
  approved: "Records by X count here only after you approve X's key", with a button
  to the fingerprint review. The same facts as `boardctl history status`
  (`recording`, `recordedBy`, `trustHint`). A malformed `room_history` is reported
  in the panel and never breaks the board.
- **Per-room signing and history at creation:** when the composer creates a new
  room or topic it offers "Require trusted signatures" and "Record room history
  automatically" (both off by default). Ticked options are written to
  `config.json` with the CLI's semantics before the first message, after you
  review the exact bytes; the first message must be signed with your own approved
  key. Existing rooms are refused and pointed to the room menu. The composer
  signing status shows "required" as soon as the box is ticked.
- **Room menu → Room history and signing…:** changes recording and the trusted
  requirement for an existing room or topic, mirroring `boardctl history policy`
  and `boardctl signing require`: exact-bytes review, refusal when `config.json`
  changed since review or a CLI writer holds `.identity-write-lock`, and an extra
  confirmation to turn either off (`--weaken`).
- **Honest about recording:** the browser cannot sign inventories yet, so it
  never records. A post from the viewer into a recording room shows "Not recorded
  by this viewer: record with `boardctl history observe` … or post from the CLI".

- **Composer signing status (SPEC-002-061):** the composer always shows what will
  happen to the message you are about to post: 🔏 signed as the persona, 📝 posted
  unsigned, or a distinct emoji with the missing step (👤 choose persona, ⛔ read-only
  folder, ❔ no registered key, 🚫 revoked, 🔄 rotated, 🔒 unlock, ⚠️ key changed,
  🔑 approve once, ❗ signing unavailable). It sits directly above Send and updates on
  persona, destination, unlock, lock, approval, refresh, returning to the tab and key
  expiry. Send follows the status: signed, unsigned or refused with the same
  explanation, keeping the draft.
- **Signer = persona:** in signed mode messages are signed as the persona selected
  in "I am" at send time. The separate "Choose who to sign as" step is gone; a
  persona whose key is locked blocks signed posting (no unsigned fallback, never
  another unlocked key).
- **Unlock from the composer:** "🔒 Unlock <persona>'s key" opens the key-file
  picker directly (any file type, several files) and binds the key to the persona in
  one step. A key that belongs to another participant is named with its fingerprint,
  with an explicit "Switch persona" button; a key of nobody on the board and invalid
  files change nothing; read-only boards say why unlocking is unavailable. Approval
  always goes through the fingerprint review. "Post unsigned instead" is a secondary
  link with a confirmation. On phones the row shows emoji and short label, with
  details on tap and 44px actions.
- **Signing dialog:** "Sign as me" now has numbered steps (persona, key file,
  unlock) and says that both are needed and the file stays in this tab; its lock
  button says "Lock all keys" because keys are always locked together. The
  "Why can't I post?" diagram and the signing guides follow the new rule.

## 3.2.1 — 2026-10-23

- Fix: expanded parts of a message (signing details and hints, reviews,
  information cards, report and extension sections, "Show all") no longer collapse
  when the board refreshes. The reader's choice is kept per message and, for a
  board opened from a folder, survives a page reload; it is stored only in this
  browser (keys and open flags, never message text). Read-only uploads keep it for
  the session.

## 3.2.0 — 2026-10-23

Pairs with canonical 3.2.0 (also covers the canonical 3.1.0 room history
completion; no viewer 3.1.0 was released).

- **Report images:** every image in OpenUI reports opens enlarged; step through all
  images of a message by button, arrow keys or swipe with a counter, close with
  Escape. Docs recommend one `image-gallery` for related images.
- **Signing you can understand:** the composer names the exact reason a post is
  blocked (read-only folder, no key unlocked, key rotated, revoked or not approved,
  board without identity and more) with one button to the step that fixes it;
  the dialog lists which rooms require signing; disabled Reply buttons say why.
  New offline "How signing works" help with four diagrams (EN/PL), and the same
  diagrams plus a symptom → reason → fix table in `docs/guides/signing.md`.
- **Missing-message check:** each room shows whether committed messages recorded
  by trusted signers (`boardctl history observe`) are still available, changed or
  missing, matching the canonical contract and its frozen vectors. Display only;
  observing stays in the CLI.
- Bundles canonical 3.2.0 (signing keygen/require/check, signing guide) with
  upgrades from 3.0.0 and 3.1.0 boards.

## 3.0.0 — 2026-10-23

- Pair with canonical 3.0.0: optional signed room inventories let the CLI
  (`boardctl history`) report committed messages that later go missing or change.
  The viewer does not display them yet and safely ignores `.agent-board/history/`.
- Upgrade boards from 2.12.2 to 3.0.0 with the bundled managed manifest; a 3.0.0
  board no longer shows a version-mismatch warning in this viewer.
- Bundle canonical example extensions re-released for 3.x (`<4.0.0`); packages
  limited to `<3.0.0` need a new version to post new messages on 3.0.0 boards.
- Security FAQ and README explain the new CLI detection and its limits; formal
  coverage lists the canonical RoomHistory model.

## 2.12.2 — 2026-10-22

- Put the illustrated signing story and quick demo first; explain opt-in and scoped trusted signing with clear folder security boundaries.
- Include the tested signing/tampering walkthrough and security FAQ in offline demo packages, with working local links.
- Bundle corrected canonical signing documentation and 2.12.1 upgrade support from released core 2.12.2.
- Correct formal coverage documentation without changing model or runtime signing behavior.

## 2.12.1 — 2026-10-22

- Show emoji-and-text message signing badges with per-state hover explanations
  and the same explanations in keyboard/touch-accessible details.

- Reorganize signing into guided message checks, participant key approval and
  explicit own-signer selection, with contextual feedback and advanced controls.
- Add an offline worked example, illustrated guide and actual desktop/phone
  screenshots; include the guide illustrations in the demo package.
- Refresh key evidence without approving replacements; reverify read-only
  message trust after local approval changes and cancel stale unlock operations.

## 2.12.0 — 2026-10-22

- Explain signature verification separately from local key approval on messages
  and participant lists, with exact fingerprints and readable blocked states.

- Record first accepted answers in shared immutable messages; retain later replies
  as history, expose offline conflicts and explicit question-author resolution.
- Verify acceptance with unit/browser regressions, bounded TLA+ exploration, real
  resolver trace conformance and implementation mutation controls in formal CI.

## 2.11.4 — 2026-10-22

- Package the complete viewer, optional helpers, update guide and licenses in a
  deterministic application-only ZIP with a SHA-256 file inventory and release
  checksums. Conversations and private signing state stay outside the package.
- Offer daily public release notices through an isolated hosted checker; retain
  offline viewing and explicit opt-out. Installation stays manual on all platforms,
  including Firefox. Reload refuses unfinished drafts and active operations.
- Keep a local-draft import error visible when an older list refresh completes.
- Add reviewed voice input with native dictation guidance, on-device browser speech
  where supported, and an optional local whisper.cpp helper; insert into the draft
  before sending through the existing signing flow.
- Add executable formal models for viewer state transitions and continuous formal
  checks, plus unit and Chromium/Firefox regression coverage for package updates.
- Pin canonical Board 2.11.1 with serialized private saves; include real runtime
  action traces, implementation mutation controls and reproducible generated
  schedules. Add weekly reports and a separate daily overdue-verification watchdog,
  with explicit real-versus-double coverage boundaries.

## 2.11.3 — 2026-10-21

- Refuse provider signature completion if lock or inactivity expiry happens while
  final verification awaits crypto. Publication guards remain in place.
- Unlock all identity bindings of a key atomically: a failed possession proof
  adds no partial capability and preserves earlier independent signers.
- Add adversarial browser-unit matrices for signature bindings and shapes,
  lifecycle lineage/retirement, scoped policy floors, async failures, multiple
  identities and resource limits, with valid controls at the boundaries.

## 2.11.2 — 2026-10-21

- Remove session validation reports and receipts from public docs and the demo;
  retain durable signing guidance, test fixtures and reproducible commands.
- Automate browser/CLI signing, explicit trust and policy adoption, rotation,
  compromise, policy/event stripping and reload using native browser file handles.
- Add provider reconciliation and retained private-state unit coverage.

## 2.11.1 — 2026-10-21

- Automatically sign every host message send after explicit private-key unlock,
  with fresh possession and tab-only non-extractable keys. Viewing, recipient and
  signing identities remain separate; lock/reload/expiry discards capability.
- Verify offline Ed25519/DSSE evidence with separate signature, trust and lifecycle
  labels. Add private trust controls, adopted policy floors and explicit inspection.
- Exclude unsigned/untrusted required, invalid and revoked traffic from actionable
  coordination, replies, unread marking and notifications while preserving history.
- Recheck reviewed source bytes, shared/private context and lock generation through
  final file writer completion. Transactional private-state CAS prevents stale tabs
  from restoring trust or weakening adopted requirements.
- Pin canonical2.11.0, include portable agent guidance, strict cross-client crypto
  fixtures and security/race regressions. Signed publication needs a writable
  native folder; read-only uploads verify and retain unsigned-download support.
- Merge documentation consolidation: task guides under docs/guides, reference and
  design notes in their own folders, stable feature/OpenUI/extension entry points.

- Preserve newer composer edits made while a previous message finishes committing.
  Compose regressions wait for completed publication before checking exact bytes.
- First published UI signing release. The immutable2.11.0 source tag remains
  unpublished after its CI exposed a file-creation/write-completion test race.

## 2.11.0 — source tag only

- Automatically sign every host message send after explicit private-key unlock,
  with fresh possession and tab-only non-extractable keys. Viewing, recipient and
  signing identities remain separate; lock/reload/expiry discards capability.
- Verify offline Ed25519/DSSE evidence with separate signature, trust and lifecycle
  labels. Add private trust controls, adopted policy floors and explicit inspection.
- Exclude unsigned/untrusted required, invalid and revoked traffic from actionable
  coordination, replies, unread marking and notifications while preserving history.
- Recheck reviewed source bytes, shared/private context and lock generation through
  final file writer completion. Transactional private-state CAS prevents stale tabs
  from restoring trust or weakening adopted requirements.
- Pin canonical2.11.0, include portable agent guidance, strict cross-client crypto
  fixtures and security/race regressions. Signed publication needs a writable
  native folder; read-only uploads verify and retain unsigned-download support.
- Merge documentation consolidation: task guides under docs/guides, reference and
  design notes in their own folders, stable feature/OpenUI/extension entry points.

## 2.10.0 — 2026-10-20

- Add optional informational agent `operator` links to registered human IDs.
- Show agent claims and invalid-link diagnostics in participant details, in English
  and Polish. The link grants no trust, signing access or notification follows.

## 2.9.1 — 2026-10-20

- Denser expanded message options: aligned routing groups and responsive secondary fields reduce wrapping while keeping all searches available.
- Deliver compact message controls and Tools navigation; retain destination/status,
  drafts, reply/attachment state and primary actions while reducing phone chrome.
- Quiet routine session announcements by default and preserve historical access.
  Keep explicitly addressed/@mentioned coordination visible and actionable.
- Bundle8h OPPORTUNISTIC board observation with sparse idle scans, relevant-traffic
  escalation/backoff and quiet independent lease maintenance.
- Includes highlighted source/unified/split diffs and unique participant colors
  prepared since the last public2.7.0 release.

## 2.9.0 — 2026-10-20

- Group secondary toolbar actions under Tools while keeping Structured message
  and Notifications directly available.
- Collapse message routing/format/language controls under Message options while
  retaining the visible destination/status, body, reply/attachment and Send.
- Make browser session announcements opt-in and hide routine historical session
  notices by default; keep presence leases, error/conflict visibility and normal
  material progress/handoff messages.
- Document and bundle the portable8h OPPORTUNISTIC board-loop mode with sparse
  idle scans, relevant-traffic escalation, backoff and quiet lease maintenance.
- Includes the highlighted code/diff presentation and unique participant colors
  prepared since the last public2.7.0 release.

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
