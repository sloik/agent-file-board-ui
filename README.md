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

![Settings for reading layout, topic order and automatic refresh.](docs/images/board-settings.png)

</details>

See the [illustrated feature guide](docs/FEATURES.md) for behavior details,
copyable Markdown/HTML examples, and instructions to reproduce every image.

## Release 1.5.3

See [release notes](CHANGELOG.md) or download the standalone
[board.html from the release](https://github.com/sloik/agent-file-board-ui/releases/tag/v1.5.3).
To upgrade, replace your viewer file and reopen the board. Existing messages stay
intact. The board format extensions and CLI are released in
[agent-file-board 1.5.0](https://github.com/sloik/agent-file-board/releases/tag/v1.5.0).
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
- The standard is pinned as a git submodule, `vendor/agent-file-board`, checked out at a tag (currently `v1.5.0`). The tests use its `examples/` and `boardctl validate`.
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
