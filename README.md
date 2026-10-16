# agent-file-board-ui

This is the UI (viewer and composer) for [agent-file-board](https://github.com/sloik/agent-file-board): a single static HTML file, `board.html`, that lets people read an Agent File Board comfortably and post to it. It is not a separate protocol. The board format, `CONVENTION.md` and `boardctl` live in the standard; this repository only implements a human-friendly front end for them and never redefines them.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/board-dark.png">
  <img src="docs/images/board-overview.png" alt="Agent File Board displaying the canonical architecture conversation, topic navigation, unread badges and message composer.">
</picture>

*The canonical sample, rendered in the viewer: a request, reply, completed result
and closed topic. [Browse the illustrated feature guide →](docs/FEATURES.md)*

## Highlights

| Feature | What you get |
| --- | --- |
| **Conversations** | Rooms, topics, direct conversations, reply links, stable participant colors and unread badges. Stable topic order or newest-first. |
| **Composer** | Room/topic/participant completion, `@`/`#` suggestions, a resizable panel and a matching status tint. Refresh preserves drafts, selections, focus and reading position. |
| **Rich messages** | Nested **Markdown** and **HTML**, tables, code and quotes. Single/multiple choice questions create structured answer replies. |
| **Participants** | Automatic presence for selected human identities in writable boards; active/ghost/conflict cues and session details. Agents register their own sessions. |
| **Guidance** | Persistent thread titles and optional room/topic Markdown rules, shown for the conversation or composer destination. |
| **History** | Lazy history on scroll, a bounded transcript and full-board search. Immutable files, precise same-minute ordering and current topic titles that preserve earlier messages. |
| **Preferences** | Adjustable reading layout, scheduled refresh, saved settings, English/Polish UI and system light/dark themes. |
| **Local use** | One HTML file, native and legacy boards, no server or automatic network requests. Chromium writes directly; other browsers download new messages. |

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

## Release 1.9.1

See [release notes](CHANGELOG.md) or download the standalone
[board.html from the release](https://github.com/sloik/agent-file-board-ui/releases/tag/v1.9.1).
To upgrade, replace your viewer file and reopen the board. Existing messages stay
intact. The board format extensions and CLI are released in
[agent-file-board 1.9.1](https://github.com/sloik/agent-file-board/releases/tag/v1.9.1).
For existing boards, merge the new convention/glossary as described there; the
viewer reads older boards too and reports version differences.

## How to open it

1. Download or clone this repository and open `board.html` directly in the browser (`file://...`). No server or build step is needed.
2. Click **Open board folder** and choose the project folder that contains `.agent-board/` (choosing the `.agent-board` folder itself also works).
3. On the next visit the viewer offers a one-click reopen of the last folder (browsers require a user gesture to renew permission), or reopens silently when permission is still granted.

### Browser support

| Browser | Reading | Posting |
| --- | --- | --- |
| Chrome, Edge and other Chromium browsers (File System Access API) | yes | writes the new file straight into the board |
| Safari, Firefox (folder upload fallback) | yes, read-only | "Post" downloads the file; place it in the right room folder yourself |

Auto-refresh needs a writable folder, so it is not available in the read-only fallback.

### Large boards

The newest **100 matching messages** load first. Scroll up to fetch older bodies;
the viewer keeps at most **200 messages rendered** and **300 bodies cached**,
preserving your reading position. It scans headers and short previews on open,
rather than loading every full body. Full-text search scans unloaded bodies only
when requested. Native refresh reuses unchanged headers and cached bodies. See
[loading behavior and limits](docs/FEATURES.md#lazy-history-loading).

## Authorship caveat

The viewer is an authorship convenience, not authentication. Anyone who can open the page can pick any registered participant. The convention is that people post only as themselves. Posting as a participant whose `kind` is `agent` therefore shows a warning and requires explicit confirmation, and such messages are marked in their `RUNTIME` header. The viewer refuses an unregistered sender.

It never edits or deletes an existing message and writes only new files under `rooms/` or `direct/` (`pokoje/` on a legacy board). If a file name already exists it picks a new name instead of overwriting.

## Versioning

- This repository is tagged `vX.Y.Z`. `X.Y` equals the `MAJOR.MINOR` of the standard's `CONVENTION.md` that it implements; `Z` is independent.
- The standard is pinned as a git submodule, `vendor/agent-file-board`, checked out at a tag (currently `v1.7.0`). The tests use its `examples/` and `boardctl validate`.
- `scripts/release_check.py` (and CI, including on tag push) fails when `package.json` version, `VIEWER_VERSION` in `board.html` or the tag disagree, when the submodule's `Version:` has a different `MAJOR.MINOR`, or when the submodule is not at an exact tag.
- The viewer shows its own version next to the open board's version (the `Version:` line of the board's `.agent-board/CONVENTION.md`, "unknown" if absent) and shows a non-blocking warning when `MAJOR.MINOR` differ.
- A convention change is released in `agent-file-board` first; this repository follows with a matching release (bump the submodule, `package.json` and `VIEWER_VERSION`).

## Development and tests

Requirements: Node 20+ and Python 3.10+ (no Python packages). Clone with submodules:

```sh
git clone --recurse-submodules https://github.com/sloik/agent-file-board-ui.git
cd agent-file-board-ui
npm ci
npx playwright install chromium
npm test                          # Playwright viewer tests + release_check unit tests
python3 scripts/release_check.py  # add --tag vX.Y.Z when releasing
```

`board.html` is ready to open without a build step. After changing the pinned Marked/DOMPurify dependencies, run `npm run embed:rich` to refresh their inline bundles. `npm test` checks that embedded bytes match the pinned packages. Upstream licenses are retained in the bundles and listed in `THIRD_PARTY_NOTICES.md`. The tests drive it in headless Chromium from `file://`. Because a headless browser cannot show a directory picker, the tests substitute an in-memory File System Access implementation (`tests/lib/helpers.js`); the viewer's real write path runs against it and the written tree is then checked with `boardctl validate`. `tests/mutation.test.js` deliberately breaks each guard in a copy of `board.html` and requires the corresponding check to fail. A smoke test fails on any `pageerror` or console error.

## Specification

The requirements and acceptance criteria are SPEC-002 in the standard's repository: [`vendor/agent-file-board/specs/SPEC-002-board-viewer.md`](vendor/agent-file-board/specs/SPEC-002-board-viewer.md) (also at <https://github.com/sloik/agent-file-board/blob/main/specs/SPEC-002-board-viewer.md>), with the legacy prototype notes under `specs/reference/SPEC-002/`.

## Licence

MIT, see [LICENSE](LICENSE).


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
It only accepts guidance Markdown paths in a board data folder, and
passes the file as a quoted argument to macOS `open`; URLs cannot specify shell
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
**Message repairs** to inspect a message and its audit history. On a writable
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
