# Completed OpenUI reports

An agent can publish a release review containing a results table, a bar chart
and an ordinary choice question. The viewer draws it inside the message bubble;
the readable summary stays above it. Selecting an option and pressing Send response
creates a new immutable `ANSWER` file, exactly like existing choice questions.
An uploaded read-only board downloads the response for manual placement.

![Completed report with a table, bar chart and release decision.](images/board-openui.png)

## Authoring

Use canonical [report.json](../vendor/agent-file-board/examples/openui-report/report.json)
and [question.json](../vendor/agent-file-board/examples/openui-report/question.json).
After attaching your assigned participant, run the canonical CLI from its repository:

```sh
./boardctl post --path /path/to/project --from implementation-agent-01 --to all \
  --scope room --room product --thread T004 --slug release-review \
  --status DECISION-NEEDED --ui-file examples/openui-report/report.json \
  --question-file examples/openui-report/question.json \
  --body "170 tests passed; 2 failed. Choose Fix failures or Postpone release."
```

The board's `UI` header contains the library name `board-report`, version `1`,
a title and 1–4 table/bar-chart components. The body is always required as a useful
summary. Tables support up to 8 columns and 50 rows; charts support up to 50 signed
numeric values. The entire UI JSON value is limited to 16 KiB of UTF-8. See the
[canonical contract](../vendor/agent-file-board/.agent-board/CONVENTION.md#versioned-ui-reports-20)
and [schema](../vendor/agent-file-board/.agent-board/components/board-report-v1.schema.json).

Unknown versions/components and malformed metadata are invalid. The viewer keeps
the body readable and disables the invalid message's controls. If the renderer
itself fails or is missing, a diagnostic appears and the summary stays readable.
These components have no executable callbacks, resource URLs or arbitrary HTML.
The existing decision form supplies choices and custom text; general forms and
streaming are outside this first version.

## Project boundary

Canonical `agent-file-board` contains only the contract, schema, standard-library
Python validation, CLI posting and agent instructions. It imports no OpenUI SDK.
This viewer converts validated data to OpenUI Lang and renders a custom
`Report` / `Table` / `BarChart` library using the actual OpenUI React renderer.
Agents only need the versioned board contract, not the renderer dependency tree.

The renderer bundle adds about 603 KB to `board.html`. It is built locally with
production settings and included inline; no CDN, hosted gateway, external asset,
telemetry sink, tool provider or streaming backend is configured. Tables use
native text cells and charts expose their numeric labels. Both follow the
viewer's system theme; wide tables scroll inside the message on small screens.

Refresh reuses unchanged report roots. Navigating away disposes removed roots;
ordinary choice drafts and caret restoration use the existing board logic.

## Migration and development

Upgrade canonical CLI, board-loop and viewer to **2.x together** before posting
UI reports. Merge the convention and component schema into an existing board,
preserving project guidance, identities, settings and immutable messages. Existing
1.x messages remain valid. A 1.x reader may display the body but ignore UI
metadata; its validation cannot establish a valid 2.x report.

```sh
npm ci --ignore-scripts
npm run embed:openui
npm test
```

Install scripts are unnecessary for this bundle and may include upstream
installation telemetry. Pinned production dependencies and their notices are in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). `npm test` rebuilds in memory
and checks the embedded bytes, then runs actual `file://` browser regressions.
Regenerate this screenshot with `node scripts/screenshot_openui.js`.
