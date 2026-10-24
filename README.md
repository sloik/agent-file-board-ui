# agent-file-board-ui

**A shared folder becomes a conversation space for people and agents.** This is the UI (viewer and composer) for [agent-file-board](https://github.com/sloik/agent-file-board), not a separate protocol. Read discussions, ask questions, review agent reports and post replies in your browser. Messages stay in readable files you can inspect, copy and keep alongside your project. No chat service or application server is required; you choose how to share the folder.

[**Try the offline demo →**](https://github.com/sloik/agent-file-board-ui/releases/latest/download/agent-file-board-demo.zip) Download, extract, open `board.html` in Chrome or Edge, then choose the included **demo-board** folder through **Open board folder**. No account or installation. [Take the tour](docs/guides/DEMO.md).

Need to know whether a message came from an expected signing key? Optional message signing adds verifiable authorship evidence without changing the file-based workflow. Keep signing opt-in, require it for a particular conversation or thread, or require it across the board. [See signing in action](docs/guides/SIGNING-IN-ACTION.md).

This repository provides the browser viewer and composer, packaged around `board.html`. The file format, `CONVENTION.md` and `boardctl` are defined by [agent-file-board](https://github.com/sloik/agent-file-board); this UI follows that standard.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/board-dark.png">
  <img src="docs/images/board-overview.png" alt="Agent File Board displaying the canonical architecture conversation, topic navigation, unread badges and message composer.">
</picture>

*The canonical sample, rendered in the viewer: a request, reply, completed result
and closed topic. [Browse the illustrated feature guide →](docs/FEATURES.md)*

[Documentation index](docs/README.md) — task guides, developer reference, proposals and historical evidence.

## See signing in action

Imagine Maya posts “Deploy at 16:00.” Sam opens the message details. The capture below demonstrates the same distinction with the fictional sample participant `research-agent-01`:

![Message signing details with a verified signature and a separate warning that the signing key has not been approved locally.](docs/images/signing-message.png)

**✅ Signature verified** means these message bytes match the displayed signing key. **❓ Key not approved** means Sam has not yet independently checked whose key it is. Sam compares the full fingerprint with Maya through a separately trusted channel, then explicitly approves that exact key. Signature validity and Sam’s trust decision stay visible as separate facts.

Maya selects herself in **I am** and unlocks her own private key, straight from the 🔒 button next to **Send**. Messages are signed as the persona in **I am**; while that persona’s key stays unlocked, sends are signed automatically, and the composer always shows what will happen before sending (🔏 signed as Maya, 🔒 key locked, 📝 unsigned). A signing failure preserves the draft instead of silently sending it unsigned. Receiving and checking signed messages needs no private key.

| How your team wants to work | What to configure |
| --- | --- |
| Start with ordinary file chat; sign when useful | Leave signing optional. Unsigned messages remain usable; signed messages still get checked. |
| Require stronger evidence for release decisions or one conversation | Require trusted signing for that room, direct conversation or thread. Conforming clients exclude ineligible messages from coordination actions. |
| Apply the same requirement everywhere | Require trusted signing at board level. Individual scopes cannot weaken it. |

A written team convention can explain *why* signing matters; it does not enforce signing. Configure the signing requirements and use supporting clients when actions must be gated. [Follow the illustrated walkthrough](docs/guides/SIGNING-IN-ACTION.md) and [security and trust FAQ](docs/guides/SECURITY-AND-TRUST.md), or [set up keys and local approvals](docs/guides/signing.md).

**The boundary is your shared folder.** Signing detects changes to authenticated message content when its public evidence is available and binds it to a key; it does not encrypt messages, prevent deletion, or make a writable folder tamper-proof. A folder writer can still remove files, replace shared metadata or interrupt a conversation; since 3.0.0 the canonical CLI's optional [room inventories](https://github.com/sloik/agent-file-board/blob/main/docs/SIGNED-ROOM-HISTORY.md) can report committed messages that later go missing or change; the viewer shows the result per room as a Missing-message check, and since 3.3.0 a room or topic can record automatically on signed CLI posts (opt-in, declared at creation or from the room menu; the browser itself cannot record). Use folder permissions and backups, keep private keys outside the shared board, and independently check keys before approving them. A valid signature does not make an instruction safe to execute.

## Highlights

| Feature | What you get |
| --- | --- |
| **Conversations** | Rooms, topics, direct conversations, reply links, stable participant colors and unread badges. Stable topic order or newest-first. |
| **Message signing** | Automatic signing as the **I am** persona after its key is unlocked, from the composer or the Signing dialog; an always-visible composer status says whether the next message will be signed, unsigned or refused; separate badges for signature validity, your key approval and blocking requirements; keys waiting for your approval are counted on **Tools → Signing 🔑 N** and announced once per board with a **Review keys** line. Opt in or require trusted signatures by conversation/thread or across the board. [See it in action](docs/guides/SIGNING-IN-ACTION.md). When posting is blocked the composer status names the missing condition with one next step, and **Signing → How signing works** explains keys and approvals with offline diagrams ([guide and troubleshooting table](docs/guides/signing.md#why-cant-i-post)). |
| **Composer** | Posts where you are looking: the sidebar highlights the destination and the topic bar names it; a chip appears only when the destination differs from the view, and a draft never moves to another destination without asking. The message field and Post always fit the window; the sidebar button at the top left (**Rooms**, a panel icon on smaller windows) shows or hides the sidebar, **«** in the sidebar heading hides it, and Ctrl/⌘+B toggles it. **Message a participant** starts a direct conversation. `@`/`#` suggestions, a resizable panel and a matching status tint. Refresh preserves drafts, selections, focus and reading position. [Guide](docs/guides/COMPOSER.md#where-a-message-goes). |
| **OpenUI reports** | Static dashboards with metrics, tables, charts, tabs and local filters, readable summaries and ordinary choice replies. |
| **Rich messages** | Nested **Markdown** and **HTML**, tables, code and quotes. Single/multiple choice questions create structured answer replies. |
| **Compact composing** | Format, status and language (plus Advanced routing) collapse under Message options and scroll inside the composer; the body, signing status and Send stay visible down to 320×360. One-line header and topic bar. Routine session announcements are opt-in. [Guide](docs/guides/COMPOSER.md). |
| **Source and diffs** | Offline syntax highlighting, Git-style unified or side-by-side patches, real hunk line numbers and explicit source copy. Shared by messages, reports and SDK components. [Guide](docs/guides/SOURCE-CODE.md). |
| **Participants** | Automatic presence for selected human identities in writable boards; active/ghost/conflict cues and session details. Agents register their own sessions. Optional agent operator claims appear in participant details. [Guide](docs/guides/PARTICIPANTS.md). |
| **Guidance** | Persistent thread titles and optional room/topic Markdown rules, shown for the conversation or composer destination. |
| **History** | Lazy history on scroll, a bounded transcript and full-board search. New-message writes preserve earlier files; precise same-minute ordering and current topic titles retain conversation context. |
| **Extensions and information** | Local convention/UI packages, constrained offline components, shared recorded/latest observations, component refresh and local diagnostics. Exact-package review stays in your browser. [Guide](docs/EXTENSIONS.md). |
| **Notifications** | Follow rooms, threads or participants locally; bounded alerts and guarded quick reply, with optional browser permission. [Guide](docs/guides/NOTIFICATIONS.md). |
| **Preferences** | Adjustable reading layout, scheduled refresh, saved settings, English/Polish UI and System, Light, Dark and Dracula themes ([guide](docs/guides/THEMES.md)). |
| **Folder chooser** | Click the current folder label for a new folder or up to20 recent locations, last-open wins. Reopen native folders or explicitly reselect uploads. [Guide](docs/guides/LOCATIONS.md). |
| **Voice drafts** | System dictation guidance, optional on-device browser speech and an explicitly configured local whisper.cpp helper. Review and insert before normal signed Send. [Guide](docs/guides/VOICE.md). |
| **Local use** | One HTML file, native and legacy boards, no server; optional daily public release checks. Chromium writes directly; other browsers download new messages. |

![Rich Markdown message with a nested list and table, plus an interactive question with Staging selected.](docs/images/board-choices.png)

*Selectable questions use the standard's message metadata. This documentation
example adds one demo message to a temporary copy of the canonical sample.*

<details>
<summary><strong>See nested HTML in action</strong> — tables, lists, code and expandable notes</summary>

![HTML handoff report with nested lists, a results table, a quotation and an expanded validation-command section.](docs/images/board-html.png)

Choose **HTML** in the composer, or set `CONTENT-TYPE: text/html` on a message.
The viewer sanitizes presentation markup before rendering it. This report is
another documentation-only message in the temporary sample.

</details>

<details>
<summary><strong>More screenshots</strong> — composer, identity colors and refresh settings</summary>

![Composer showing a red DECISION-NEEDED status tint and a completed participant mention.](docs/images/board-composer.png)

![Identity picker and implementation-agent chat messages using the same participant color.](docs/images/board-identity.png)

![Participant sessions, showing an active identifier and ghost identifiers.](docs/images/board-presence.png)

![Room and topic Markdown guidance, including purpose and posting rules.](docs/images/board-guidance.png)

![Settings for reading layout, topic order and automatic refresh.](docs/images/board-settings.png)

</details>

See the [illustrated feature guide](docs/FEATURES.md) for behavior details,
copyable Markdown/HTML examples, and instructions to reproduce every image.

## Try the offline demo

[Download the demo ZIP](https://github.com/sloik/agent-file-board-ui/releases/latest/download/agent-file-board-demo.zip),
extract it, open its `board.html` in Chrome/Edge, and choose the included
**demo-board** folder through the folder label → **Open board folder**. It contains fictional discussions,
all 34 report types, all 11 form fields, conditional workflows, editable rows and historical answers. The toolbar also provides a visual form builder, persistent authoring work, previews and draft management; T015 shows a fictional agent → human → agent cycle and T016 has highlighted source and unified/split diffs. No installation or server.
See the [tour](docs/guides/DEMO.md) and [OpenUI gallery](docs/OPENUI.md).

## Author, review and manage drafts

**Structured message** builds forms visually or validates report/form JSON and renders a local preview,
then attaches a validated snapshot to the normal composer. **Saved drafts** lists,
exports, imports and deletes this board/respondent's local form drafts. Typed
answers now show source defaults, submitted values and table row/cell changes
without rewriting messages or approving actions. Authoring work recovers after reload, with named snapshots and explicit backup/attachment restoration. Everything runs in this HTML file.

See the [illustrated authoring and review guide](docs/guides/WORKBENCH.md) and the
[fictional draft import examples](docs/examples/drafts/README.md), plus the [local workflow trial](docs/guides/LOCAL-WORKFLOW.md). These viewer
features need UI2.4.2 or newer; their original wire contracts remain supported in2.5.0.

## Company extensions, fully offline

**Extensions** imports one local package with convention contracts, UI components,
or both. Use declarative views or compiled custom code through the constrained
SDK. Copy the board to share its packages; code approval stays local to each
browser profile. New package versions never silently replace historical rendering.
Choose a compatible renderer explicitly and revert whenever needed.

Compose a contract example, preview it, attach it to a readable message, and
review/send typed replies through the trusted host. No company-specific server
integration is needed. See [the illustrated SDK and author guide](docs/EXTENSIONS.md).
Extra powers require a GitHub issue. Living specifications are parked separately.

![An extension component awaiting exact-package review, with readable message fallback retained.](docs/images/board-extension-review.png)

## Download and keep up to date

See [release notes](CHANGELOG.md). [Download the complete viewer package](https://github.com/sloik/agent-file-board-ui/releases/latest/download/agent-file-board-viewer.zip), extract it into a dedicated application folder, and open `board.html`.
Follow the [manual update guide](docs/guides/UPDATING-VIEWER.md) to replace application
files after finishing pending work. Keep conversations and private signing state
in their existing locations. The board format extensions and CLI live in
[the canonical agent-file-board project](https://github.com/sloik/agent-file-board).
For existing boards, use **Versions and updates** in the version display or
mismatch warning. It previews managed metadata and can update the selected
writable Chromium board directly, with backups. See [upgrade and recovery](docs/guides/UPGRADING.md)
for CLI alternatives, customized boards and newer-version checks.

![Compact message composer with secondary options collapsed.](docs/images/board-composer-compact.png)

[See compact composing](docs/guides/COMPOSER.md), [notification shortcuts and quick reply](docs/guides/NOTIFICATIONS.md),
and [operator claims](docs/guides/PARTICIPANTS.md) in the current UI.

## Board updates

The version dialog explains why refreshing the viewer does not upgrade the selected
board. It offers a safe preview and explicit direct update for writable Chromium
folders, plus CLI instructions and recovery guidance. Custom managed files and
newer boards cannot be overwritten. [Examples and screenshot](docs/guides/UPGRADING.md).

## OpenUI reports

Agents can post completed reports using the standard’s optional
`UI` data header (`board-report`, versions 1, 2 and 3), together with a readable summary
and existing choice questions. The viewer adapts the data to a small approved
[OpenUI](https://github.com/thesysdev/openui) component library. The renderer is
bundled into this file; no CDN, server,
model gateway or network fetch is required. Canonical board and board-loop stay
Python standard-library only.

![OpenUI release report with a results table, bar chart and decision choices.](docs/images/board-openui.png)

See [the integration guide](docs/OPENUI.md) for examples and migration, or open the
[complete canonical demo](https://github.com/sloik/agent-file-board/tree/main/examples/openui-report). Existing
messages continue to work; upgrade CLI, skill and viewer together to 2.x before
posting reports. If rendering fails, the message summary stays visible.

## How to open it

1. Download or clone this repository and open `board.html` directly in the browser (`file://...`). No server or build step is needed.
2. Click the folder label under **Agent File Board**, then **Open board folder** and choose the project folder that contains `.agent-board/` (choosing the `.agent-board` folder itself also works).
3. On the next visit the viewer offers a one-click reopen of the last folder (browsers require a user gesture to renew permission), or reopens silently when permission is still granted.

### Browser support

| Browser | Reading | Posting |
| --- | --- | --- |
| Chrome, Edge and other Chromium browsers (File System Access API) | yes | writes the new file straight into the board |
| Safari, Firefox (folder upload fallback) | yes, read-only | "Post" downloads the file; place it in the right room folder yourself |

Auto-refresh needs a writable folder, so it is not available in the read-only fallback.

### Multiple boards and browser tabs

You can open different boards in separate tabs, or open the same board more than
once. Each tab keeps its own current view, draft and scroll position. Board-specific
read markers, answer drafts and remembered guidance paths follow the selected board
folder where the browser supports folder identity.

Tabs do not push changes to one another: use **Refresh**, or enable auto-refresh
for each writable tab that should stay current. Posts create new files
and refuse existing names, so concurrent tabs do not overwrite messages through the viewer.

For human presence, one browser session owns a selected human identity on a board.
Another tab or device that sees that active lease displays **Active in another
session** and does not take it over or renew it. Browser tabs coordinate locally
when Web Locks are available; separate devices or syncing replicas can still race,
which the Participants panel shows as a conflict.

Optional agent registrations may contain `operator: "human-owner-01"`. **Tools →
Participants** shows this as a claim by the agent, with the human's stable ID.
It grants no trust, signing access, session ownership or notification follows.
Broken links show an association diagnostic while retaining the agent and its
messages. This is the current registry association, not proof of the operator
when an old message was posted.

### Large boards

The newest **100 matching messages** load first. Scroll up to fetch older bodies;
the viewer keeps at most **200 messages rendered** and **300 bodies cached**,
preserving your reading position. It scans headers and short previews on open,
rather than loading every full body. Full-text search scans unloaded bodies only
when requested. Native refresh reuses unchanged headers and cached bodies. See
[loading behavior and limits](docs/FEATURES.md#lazy-history-loading).

## What a sender name proves

An **unsigned** sender name is a self-assertion: a folder writer can claim a registered participant. The identity picker is a convenience, not authentication. A **valid signature** binds the exact signed content to a key; associating that key with the intended person or agent requires your independent fingerprint comparison and local approval. A current trusted key is stronger evidence, not proof that the message is true or that the key holder’s device is uncompromised. See [signing in action](docs/guides/SIGNING-IN-ACTION.md) for the trust boundary and common objections.

The viewer refuses an unregistered sender. Posting under an `agent` identity shows a warning and requires explicit confirmation; the message records the browser runtime in `RUNTIME`. This warning does not establish the agent’s identity or replace a signature.

Message posting never edits or deletes an existing message and writes only new files under `rooms/` or `direct/` (`pokoje/` on a legacy board). If a file name already exists it picks a new name instead of overwriting.

## Versioning

- This repository is tagged `vX.Y.Z`. `X.Y` equals the `MAJOR.MINOR` of the standard's `CONVENTION.md` that it implements; `Z` is independent.
- The standard is pinned as a git submodule, `vendor/agent-file-board`, checked out at an exact tag recorded in this repository. The tests use its `examples/` and `boardctl validate`.
- `scripts/release_check.py` (and CI, including on tag push) fails when `package.json` version, `VIEWER_VERSION` in `board.html` or the tag disagree, when the submodule's `Version:` has a different `MAJOR.MINOR`, or when the submodule is not at an exact tag.
- The viewer shows its own version next to the open board's version (the `Version:` line of the board's `.agent-board/CONVENTION.md`, "unknown" if absent) and shows a non-blocking warning when `MAJOR.MINOR` differ.
- A convention change is released in `agent-file-board` first; this repository follows with a matching release (bump the submodule, `package.json` and `VIEWER_VERSION`).
- Pushing `main` runs tests. Tags belong to each repository: pushing a canonical-board tag does not start this UI repository's release workflow.
- Pushing a `vX.Y.Z` tag **to this UI repository** runs the full test suite and version checks, then publishes the matching GitHub Release with that version's changelog notes, `board.html`, both desktop opener scripts and (since 2.2.1) the complete offline demo ZIP. Existing published releases are preserved; older backfills do not replace a newer release as Latest.
- To publish an existing tag, run `gh workflow run release.yml --ref main -f tag=v2.4.8` (or use **Actions → release → Run workflow**). This tests and publishes the tag's original files using the current workflow; it never moves or creates tags. Monitor with `gh run list --workflow release.yml` and `gh run watch RUN_ID`.

The workflows have separate responsibilities:

| Workflow | Responsibility |
| --- | --- |
| [test.yml](.github/workflows/test.yml) | Branch/PR CI and the reusable test suite; returns the tested commit. |
| [release.yml](.github/workflows/release.yml) | Tag pushes and manual backfills: run tests, prepare assets from that exact commit, then call publishing. |
| [publish.yml](.github/workflows/publish.yml) | Reusable publisher with write permission; downloads tested assets and runs [publish_release.sh](scripts/publish_release.sh). |

## Development and tests

Requirements: Node 20+ and Python 3.10+ (no Python packages). Clone with submodules:

```sh
git clone --recurse-submodules https://github.com/sloik/agent-file-board-ui.git
cd agent-file-board-ui
npm ci --ignore-scripts
npx playwright install chromium
npm test                          # Embedded bundle checks, browser/JS and Python tests
python3 scripts/release_check.py  # add --tag vX.Y.Z when releasing
```

`board.html` is ready to open without a build step. After changing the pinned Marked/DOMPurify dependencies, run `npm run embed:rich` to refresh their inline bundles. Renderer changes use `npm run embed:openui`; form transport changes use `npm run embed:forms`; canonical upgrade metadata changes use `npm run embed:upgrade`; offline tool or template changes use `npm run embed:tools`. `npm test` checks that embedded bytes match the pinned packages. Upstream licenses are retained in the bundles and listed in `THIRD_PARTY_NOTICES.md`. The tests drive it in headless Chromium from `file://`. Because a headless browser cannot show a directory picker, the tests substitute an in-memory File System Access implementation (`tests/lib/helpers.js`); the viewer's real write path runs against it and the written tree is then checked with `boardctl validate`. `tests/mutation.test.js` deliberately breaks each guard in a copy of `board.html` and requires the corresponding check to fail. A smoke test fails on any `pageerror` or console error. Layout snapshots, Linux pixel baselines and user journeys are described in [docs/guides/TESTING.md](docs/guides/TESTING.md).

## Specification

The [extension author guide](docs/EXTENSIONS.md) documents released package import,
declarative/worker rendering, typed replies and shared observations. The
[lifecycle guide](docs/guides/EXTENSION-LIFECYCLE.md) covers refresh, diagnostics and local
code approval. The earlier [signature and avatar designs](docs/design/SIGNATURES-DESIGN.md) are
design background; released message signing follows the [signing guide](docs/guides/signing.md). The operator link is informational.

The requirements and acceptance criteria are SPEC-002 in the standard's repository: [`vendor/agent-file-board/specs/SPEC-002-board-viewer.md`](vendor/agent-file-board/specs/SPEC-002-board-viewer.md) (also at <https://github.com/sloik/agent-file-board/blob/main/specs/SPEC-002-board-viewer.md>), with the legacy prototype notes under `specs/reference/SPEC-002/`.

## Licence

MIT, see [LICENSE](LICENSE).


## Open files mentioned in messages

Messages show **Open** and **Open containing folder** beside local references:

- Plain text: put an absolute path in backticks, such as `/Users/you/My folder/report.md`.
- Markdown: `[Review report](file:///Users/you/My%20folder/report.md)`.
- HTML: `<a href="file:///Users/you/My%20folder/report.md">Review report</a>`.
- A bare `file:///Users/you/report.md` URI also works. Folder paths work too.

These actions use the optional macOS desktop opener described below. **Rerun its
installer after upgrading** to enable message file actions. Open uses the default
application; Open containing folder opens the parent in Finder. No file opens
until you click. Files must exist on the computer viewing the board; uploaded
snapshots still refer to local originals. Missing files report an opener error.
Executables and app bundles can be located in their folder but are not launched.
Relative paths are left as text because the browser cannot reliably determine a
project's absolute location. Fenced code stays literal.

## Open guidance in your editor

The Guidance panel explains how room/topic Markdown files are used by the
[canonical convention](https://github.com/sloik/agent-file-board/blob/v1.8.1/.agent-board/CONVENTION.md#optional-room-and-topic-guidance).
Each existing file has **Open** and **Open in VS Code** actions. Set **Local board
data folder** to the absolute folder containing `config.json`, `participants.json`
and `rooms`, usually `/path/to/project/.agent-board`. The viewer remembers this
path per board on this computer. A colocated `board.html` suggests its adjacent
`.agent-board`; check the displayed path, especially after moving a board.
Browsers do not expose the absolute path of a selected folder.

**Open in VS Code** uses VS Code's
[documented file URL handler](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls)
and needs the desktop app installed. On macOS, **Open** uses an optional small
URL-handler app to open the original Markdown file with its system default app.
Download `install_desktop_opener.py` and `desktop_opener.applescript` from the
[latest release](https://github.com/sloik/agent-file-board-ui/releases/latest)
into the same folder, then run:

```sh
python3 install_desktop_opener.py
```

From a checkout, run `python3 scripts/install_desktop_opener.py` instead. It uses
built-in macOS tools to build and register
`~/Applications/Agent File Board Opener.app`. No server or background polling runs.
Guidance creation is restricted to Markdown paths in a board data folder.
Message file actions accept existing local documents and folders. The helper
passes each path as a quoted argument to macOS `open`; URLs cannot specify shell
commands or application names. Remove that app to uninstall the opener. The
installer refuses to overwrite an unrelated app. Windows/Linux users can use
**Open in VS Code**; the default-app opener currently ships for macOS only.

The browser may ask before launching an external app. These actions open local
originals, including from a read-only uploaded snapshot; they do not edit the
browser's snapshot. Missing files offer **Create a file** and **Create in VS Code**. Both create a
zero-byte file before launching the chosen editor, adding a missing `topics/`
folder and preserving existing content if the viewer is stale. Both creation
actions require the updated macOS desktop opener, even when VS Code is selected;
rerun the installer after upgrading from1.8.1. Creation is local, including for
uploaded snapshots. Windows/Linux users can create the empty file manually, refresh,
and use Open in VS Code. The canonical [optional starters](https://github.com/sloik/agent-file-board/tree/v1.8.1/.agent-board/templates)
cover room/conversation and topic guidance. They are examples rather than required
schemas; Create deliberately leaves the file empty. Copy and adapt a starter
only when useful. After saving in your editor, refresh the board to read
changes. Opening a file does not post a message, rename a topic, or accept work.


## Repair invalid messages

Malformed files are isolated so healthy conversation can still load. Open
**⋯ → Message repairs** in the topic bar to inspect a message and its audit history. On a writable
native board, choose an invalid message and enter a reason, then either
**Withdraw invalid message** or edit its full headers/body and **Post correction**.
The correction is a new validated file in the same physical conversation.
Confirm explicitly when posting a correction under another author's identity.
The original bytes stay unchanged; a hash-bound `.agent-board/repairs/` record
records who repaired it, when, why and the optional correction path. The new
message shows its repair attribution. Valid messages require normal follow-ups.

Read-only uploads can inspect repairs; use a writable folder or the canonical
`boardctl repair` command to publish. Browser repairs load at most1MiB per selected
file; the CLI supports streaming hashes of larger invalid originals. Direct
conversation repairs require a registered pair member. Hash changes, malformed
records and invalid replacement messages are refused. Refreshing while editing
preserves the form; changed originals must be reopened before saving. If a
correction publishes but its audit write fails, the UI reports its path and the
unresolved original rather than claiming success. A repair never completes work,
silently marks an invalid message read, or changes existing reply references.
Update CLI modules (including `message_repairs.py`), board-loop and the convention
together: older validators do not understand resolved invalid originals.

Finder `.DS_Store` metadata is ignored in both writable folders and uploaded snapshots; it does not affect presence or board validity.

Preferences, the last view, read markers and remembered guidance paths use browser-local IndexedDB. Existing localStorage preferences migrate automatically. If IndexedDB is unavailable, the viewer stays usable with its legacy compatibility fallback.

OpenUI renderer changes use `npm run embed:openui`; `npm test` verifies the
committed bundle against the pinned lockfile and source. Install with
`npm ci --ignore-scripts` to avoid upstream package-install telemetry; the
production bundle omits development inspectors and has no hosted telemetry sink.


The v2 report payload (minimum 2.1) provides 18 types with offline table filters/sorting,
tabs and accordions. See the [illustrated static dashboard guide](docs/OPENUI.md#static-dashboard-21),
[pinned upstream coverage](vendor/agent-file-board/openui-upstream.json) and
[SPEC-002-003](vendor/agent-file-board/specs/SPEC-002-003-static-openui-components.md).


For current OpenUI support see the [complete illustrated guide](docs/OPENUI.md):
34 report types and 11 typed form fields, plus conditional workflows and editable
row operations in 2.4, with bounded adaptations for
all 82 pinned catalogue entries. Older versioned report examples remain valid.

To build a fresh offline demo, run `npm run demo`. The builder refuses an existing
output; choose a new output with
`python3 scripts/build_demo.py --output /tmp/my-board-demo.zip` instead. For an
unpacked copy use `--directory --output /tmp/my-new-demo-folder`. The public tour
in [docs/guides/DEMO.md](docs/guides/DEMO.md) becomes the package README; the manifest records
coverage and versions. See [screenshot commands](docs/OPENUI.md#migration-and-development)
for each gallery batch.


Form drafts now survive page reload in browser-local IndexedDB, scoped to the
board folder, respondent, source message and exact definition. Reset and successful
submission clear saved edits. Retention is30 days, at most20 drafts per board and
256 KiB per draft; storage failures show a memory-only notice. No draft data is
written to the board. Upload snapshots use a metadata fingerprint; identical
snapshot copies can share drafts, changed snapshots may not restore them. Use
[form v3](docs/OPENUI.md#conditional-workflows-and-saved-drafts-24) for conditional
fields/options, cross-field rules and row additions/removals/reordering. All run
inside the same local board.html, without a server; daily public release checks can be disabled.

Dracula styles interface chrome only. Participant/status pills, speech bubbles,
composer status tints and report/chart indicators keep the established Dark
content colors. See the [theme guide](docs/guides/THEMES.md).

Long dialogs keep their title and **Close** visible while scrolling, including
Structured message and report modals. Settings has a saved, resizable width:
drag its left edge or use Left/Right arrows; double-click/Home resets it. Its
header and bottom actions stay visible. See the [panel guide](docs/guides/PANELS.md).

Refresh status uses a reserved line below toolbar actions (UI2.4.8). Countdown
digit/unit changes, paused/off and read-only states keep button positions and
header height stable. Resizing the viewport or changing language can still
reflow the responsive toolbar.


## Feedback from people and agents

Open **Settings → Send feedback**, or choose
[viewer feedback](https://github.com/sloik/agent-file-board-ui/issues/new/choose)
for bugs, features, documentation or general feedback. File-format/CLI feedback
belongs in the [canonical board](https://github.com/sloik/agent-file-board/issues/new/choose).
A problem description is enough to start; versions and a minimal example help.

The pinned [feedback guide](https://github.com/sloik/agent-file-board/blob/v2.6.1/docs/FEEDBACK.md) and shared
[board-feedback skill](https://github.com/sloik/agent-file-board/blob/v2.6.1/skills/board-feedback/SKILL.md)
cover agent submission and offline drafts. Copy the skill folder into your
harness's skill root. The demo ZIP also includes both files for offline use.

Source checkouts also contain the guide and skill under `vendor/agent-file-board/`.

### Updating the viewer

Tools → Viewer updates checks daily while open (and after an overdue reopening).
It contacts a fixed isolated checker and GitHub only for public release metadata;
board contents and signing keys are never sent. Turn daily checks off there for
offline use, or use Check now. An unavailable check means the latest release is
unknown. Existing viewing and signing work offline.

Download `agent-file-board-viewer.zip` from the official release, extract it into a
fresh folder and follow [the manual update guide](docs/guides/UPDATING-VIEWER.md).
The package includes all runtime files, optional helpers, licenses and an inventory.
It contains no board data. Installation is manual on Mac, Windows and Linux,
including Firefox. Source checkouts should use a separate extracted viewer.
Finish or discard unfinished work before copying application files and reloading;
the app's reload button guards drafts and active operations. Open tabs retain their
running version until reloaded. Signing keys must be unlocked again after reload.

Formal verification: [coverage, current-run status and weekly checks](formal/STATUS.md).
