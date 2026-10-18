# OpenUI reports and examples

[OpenUI](https://github.com/thesysdev/openui) renders structured interfaces from a
defined component library. Agent File Board UI 2.4.3 uses its embedded renderer
for report cards, charts, offline forms and local navigation controls. Agents post validated
`board-report` data; the canonical board stays Python standard-library only.

Reports live inside ordinary messages, with a readable summary and optional
choice question. **Send answer** creates a new immutable reply linked to the
original report. An uploaded read-only board downloads that reply for manual
placement.

## Try the examples live, offline

**[Download the demo ZIP](https://github.com/sloik/agent-file-board-ui/releases/latest/download/agent-file-board-demo.zip)**
([v2.4.2](https://github.com/sloik/agent-file-board-ui/releases/download/v2.4.3/agent-file-board-demo.zip)).
It includes `board.html`, a visible `demo-board` folder and a short README tour.
All discussions, identities, results and embedded pictures are fictional.

1. Extract the complete ZIP.
2. Open its **board.html** in Chrome or Edge.
3. Click **Open board folder** and choose **demo-board** beside the viewer. The hidden
   `.agent-board` inside it is included automatically.
4. Start in **general → T000 · Start here**, then explore **reports**.

No server, account, model, npm or Python is needed to view it. In browsers with
read-only folder upload, choose/upload `demo-board`; replies download instead of
being written directly. See the [complete demo tour](DEMO.md).

| Topic | What you can try |
| --- | --- |
| reports / T004 | V1 report, choice question and a separate historical owner answer. |
| reports / T007 | All 18 v2 types: tabs, table filter/sort, notes, signed charts and full data. |
| reports / T008 | Pie/donut, radial, radar, scatter and single stacked bars. |
| reports / T009 | Icons, comparison, tags, Markdown, embedded images, card grids, carousel and modal. |
| reports / T010 | An unanswered choice: select human-owner-01, choose an option and Send answer. |
| reports / T011 | Complete a typed form, select dates/options and edit table cells; submit a new reply. |
| reports / T012 | Read the original form/table and its separate historical typed response. |
| architecture, product and Direct | Fake proposals, replies, a closed topic and agent handoff. |

Tabs, filters, carousel and modal only change your local view. **Post** and
**Send answer** create a new message in the demo folder (or download it in
read-only mode). Extract a new copy to reset its history.

![The real offline demo viewer with synthetic report topics.](images/board-openui-demo.png)

The screenshot scripts already create temporary synthetic boards. This demo
packages the same pinned conversation fixtures and report JSON into something
a user or agent can download. To rebuild it from a repository checkout:

```sh
python3 scripts/build_demo.py --output /tmp/agent-file-board-demo.zip
# Or create an unpacked demo in a new directory:
python3 scripts/build_demo.py --directory --output /tmp/agent-file-board-demo
```

The builder refuses existing outputs and validates the generated board with
the pinned CLI. New releases (starting with 2.2.1) attach the reproducible ZIP
automatically. No live user board or private agent state is bundled.

## Authoring and answer review (UI2.4.2)

Use **Structured message** to build a form visually or load/edit an embedded report/form example,
validate it and try the actual renderer offline. **Attach to composer** snapshots
that JSON for normal posting with a useful body and existing sender/routing
checks; preview itself never posts anything. Typed answer messages now show
read-only before/after comparisons with row additions/removals and final order.
**Saved drafts** provides local export/import/delete with exact source/respondent
binding and explicit confirmation before replacement or deletion. Authoring work
now recovers locally after reload, with named snapshots, export/import and
explicit same-board attachment restoration. The visual builder covers all 11
field types, v3 conditions/rules and table baseline/row settings.

See [the illustrated guide](WORKBENCH.md) and
[draft backup example](examples/drafts/README.md). The demo adds reports/T015's
fictional agent → human → agent cycle, a bundled example-draft.json for T013,
an authoring-example.json backup and [local workflow trial](LOCAL-WORKFLOW.md).
No protocol change is needed: canonical2.4.0 remains pinned; UI2.4.2 provides
these tools inside the same local HTML page, without a backend.

## Conditional workflows and saved drafts (2.4)

The viewer is still one local **board.html**. No backend, server, model, remote
lookup or additional runtime file is needed. New QUESTION/ANSWER **version3**
adds three offline capabilities while preserving version2 forms and all reports.

![Conditional release workflow with dependent region and approver fields.](images/board-openui-workflow.png)

- **Conditions and dependent choices:** fields use visibleWhen and options use
  when, each comparing an earlier scalar field with a typed value. Switching
  Environment to Production reveals an approver and replaces sandbox regions.
  Hidden fields submit null; unavailable selections clear locally.
- **Cross-field rules:** bounded eq/ne/lt/lte/gt/gte comparisons validate compatible
  scalar values. Ordered rules compare numbers or dates. The example requires
  start ≤ end and requested budget ≤ approved budget. Failed rules show readable
  errors and prevent submission; no scripts or expressions are evaluated.
- **Row operations:** tables may enable add/remove/reorder with explicit minimum
  and maximum rows. Added rows have stable IDs and full typed values; replies
  include changes,added,removed,order relative to the original baseline. Columns
  remain fixed. The total capacity is400 cells per form, using each mutable
  table's maxRows. Original messages and baseline rows stay unchanged.

![Editable row controls in the offline workflow.](images/board-openui-workflow-rows.png)

![Conditional controls at phone width in dark mode.](images/board-openui-workflow-phone.png)

Use [workflow-question.json](examples/openui/workflow-question.json) with
--question-file and [workflow-answer.json](examples/openui/workflow-answer.json)
with --answer-file plus the original --reply-to filename and routing. Follow the
[runnable CLI walkthrough](https://github.com/sloik/agent-file-board/blob/v2.4.0/examples/openui-report/README.md#conditional-workflow-and-row-operations-24),
[v3 contract](https://github.com/sloik/agent-file-board/blob/v2.4.0/.agent-board/CONVENTION.md#conditional-forms-and-editable-rows-24)
and [question](https://github.com/sloik/agent-file-board/blob/v2.4.0/.agent-board/components/form-question-v3.schema.json)/[answer](https://github.com/sloik/agent-file-board/blob/v2.4.0/.agent-board/components/form-answer-v3.schema.json)
schemas. Both headers remain64 KiB; at most24 fields and24 comparison rules.
Upgrade CLI/viewer/metadata to2.4 together; the previewed updater supports2.3.0.

**Saved drafts apply to both v2 and v3 forms.** IndexedDB stores incomplete raw
edits by verified native folder identity, respondent, message path and exact
question digest. Reload restores them. Reset and successful posting/download
clear saved edits; write failures retain them. Drafts remain in this browser,
with at most20 saved per board, 30-day retention and256 KiB per draft. Quota or
unsupported storage visibly falls back to memory. Browser storage clearing or
private sessions can remove drafts. No draft files are written into the board.

Uploaded folders cannot establish native folder identity: a fingerprint of folder
name, metadata and file paths/sizes/timestamps identifies the snapshot. Identical
copies can share drafts and changed snapshots may not restore them. A changed
question definition never restores its previous draft. Drafts are not synced
across devices and are not evidence that an answer was submitted.

The [downloadable demo](DEMO.md) exposes this workflow in reports/T013 and its
separate historical structural answer in T014. Reload after editing T013, then
use Reset to clear it. `npm run screenshots:workflows` regenerates these views.

## Forms, selectors and editable tables (2.3)

Forms are version2 `QUESTION` metadata, submitted as version2 typed `ANSWER`
replies. Existing choice questions and report v1/v2/v3 remain supported. These
controls run entirely offline; **Send form answer** creates a normal immutable
reply (or downloads it from a read-only upload). The original question and table
are never edited. Labels are authored text; interface hints follow English/Polish.

![Offline form with typed inputs and selection controls.](images/board-openui-forms.png)

| Field type | Behavior |
| --- | --- |
| input | Bounded text or finite number, including zero. |
| textarea | Bounded multiline text. |
| select, radio-group | One stable option ID. |
| checkbox-group, switch-group | Selected option IDs; unselected options remain off. |
| chips, option-cards | Single or multiple choice, declared explicitly. |
| date-picker | A real YYYY-MM-DD calendar date with optional bounds. |
| slider | A bounded number on the declared step grid; keyboard arrows work. |
| editable-table | Typed text/number/select/boolean cells in fixed rows and columns. |

A form contains 1–24 named fields with required flags, optional valid defaults,
help and explicit submit/reset buttons. Reset only restores the local defaults.
Fields, selections and cell edits survive polling, navigation and language changes;
drafts are separated by board, respondent, message and definition. Validation
errors preserve edits. Source changes require a reload/review before submission.
Buttons may use one of the twelve fixed icons while retaining visible labels.
No authored action URLs, command execution or arbitrary event handlers.

<details>
<summary><strong>Editable cells, date, slider and switches</strong></summary>

![Offline form with date, slider, switches and typed editable table cells.](images/board-openui-form-cells.png)

Tables have stable row/column IDs and at most 8 columns,50 rows and400 editable
cells per form. V2 forms keep fixed rows and columns; v3 rowOperations above
adds row addition/removal/reordering while retaining fixed columns. Submission contains **cell changes**, with duplicate/unknown/no-op
coordinates and invalid values rejected. The original baseline remains intact:

```json
{"version":2,"question":"release-configuration","values":{"tasks":{"changes":[{"row":"schema","column":"hours","value":3}]}}}
```

This abbreviated illustration shows the table field only; an actual answer must
include every field defined in its source question. Optional empty scalars use
`null`; optional multiselects use `[]`; an unchanged optional table uses `{"changes":[]}`.
Required tables require at least one change. Boolean false and numeric zero are
valid values and are not treated as missing.

</details>

<details>
<summary><strong>Form on a phone in dark mode</strong></summary>

![Offline form at 375px in dark mode.](images/board-openui-forms-phone.png)

Wide editable tables scroll inside the form. Local controls and typed answer
downloads also work in uploaded read-only boards.

</details>

Use the complete [form question](examples/openui/form-question.json)
and [typed answer](examples/openui/form-answer.json).
The [question schema](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/components/form-question-v2.schema.json),
[answer schema](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/components/form-answer-v2.schema.json)
and [canonical contract](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/CONVENTION.md#offline-forms-and-typed-replies-23)
define exact properties and semantic validation. Both headers are limited to
**64 KiB UTF-8**; text fields allow at most 4000 Unicode scalars, options at most 32.
Numbers stay within ±1e9 and declared bounds; sliders have 1–10000 integral steps.

Post with `boardctl post --question-file form-question.json --body "Readable summary"`
and normal identity/routing arguments. Submit via the viewer, or use
`--answer-file form-answer.json --reply-to ORIGINAL-QUESTION.txt` in the same
topic. Form questions require a nonblank readable body even without a UI report.
Upgrade CLI, viewer and board metadata to **2.3** together; the backed-up updater
supports pristine 2.2.0 boards and preserves custom files and history.

`npm run screenshots:forms` rebuilds the demo ZIP, opens its actual extracted
viewer and generates these three captures while checking unchanged files and
zero external requests.

## Complete static catalogue (2.2)

Version 3 adds **16 board types**, giving **34 types** in total. All 28 static
candidates from the pinned upstream catalogue now have board adaptations.

![Offline chart examples with pie, radial, radar, scatter and stacked bars.](images/board-openui-specialty.png)

| Family | New board types |
| --- | --- |
| Charts | `pie-chart` (pie/donut), `radial-chart`, `radar-chart`, `scatter-chart`, `single-stacked-bar-chart` |
| Summaries | `icon`, `icon-text`, `metric-comparison`, `tag-block` |
| Content | `markdown`, `image`, `image-gallery`, `image-text` |
| Composition | `card-grid` (snippet/context/composite/visual), `carousel`, `modal` |

<details>
<summary><strong>Embedded images, cards and local navigation</strong></summary>

![Embedded PNGs, visual cards and a local carousel.](images/board-openui-media.png)

Carousel buttons and arrow/Home/End keys select an embedded panel. Modal opens
on a click and closes with its button or Escape. Filters, carousel selection,
modal state and input selection survive polling; language changes keep local
state. These controls work on read-only uploads and do not change message files.

![Native report modal with a local searchable table.](images/board-openui-modal.png)

</details>

<details>
<summary><strong>Phone layout in dark mode</strong></summary>

![Static report media and cards at 375 pixels in dark mode.](images/board-openui-media-phone.png)

</details>

Copy the complete [v3 example](examples/openui/static-candidates.json) and follow
its exact [v3 schema](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/components/board-report-v3.schema.json).
These reports require CLI, viewer and board metadata **2.2 or newer**. V1/v2 reports retain
their existing contracts. V3 allows **256 KiB** of UI JSON; all versions retain
their component/depth bounds. V1/v2 keep the **16 KiB** header limit.

Images use embedded `data:image/png;base64,` only: **64 KiB decoded bytes per
image**, at most **1024 × 1024 pixels**, and **4,194,304 image pixels per report**.
External/file URLs, SVG, animated PNG and malformed PNG structure/CRC are
rejected. A browser decode failure shows a per-image fallback. Markdown permits
static headings, paragraphs, lists, quotes, tables and code; active links,
resources, styles, forms and scripts are removed. Icons use twelve fixed names
listed in the schema. This remains an offline page with no backend or image fetches.

`npm run screenshots:candidates` reproduces these four captures from CLI-validated
temporary boards and verifies immutable files and zero network requests.

## Static dashboard (2.1)

![Static dashboard with metric cards, status, callout, tabs and trend charts.](images/board-openui-static.png)

The first static batch supports **18 board component types**. Everything is embedded
in the immutable message and works from `file://` without a backend.

| Family | Supported components |
| --- | --- |
| Data | `table`, `bar-chart`, `line-chart`, `area-chart`, `grouped-bar-chart`, `stacked-bar-chart` |
| Summaries | `metric`, `callout`, `tag` |
| Content | `text`, `code-block`, `list`, `separator` |
| Composition | `card`, `stack`, `tabs`, `accordion`, `steps` |

V2 tables filter their embedded rows and sort columns locally. Tabs and
accordions change the visible section. These controls retain their local state
and input selection across polling refresh; changing the interface language
updates control labels without clearing the filter or selected tab.

<details>
<summary><strong>See table filtering and comparison charts</strong></summary>

![Results tab filtered to Browser, with grouped bars and expandable details.](images/board-openui-static-details.png)

</details>

<details>
<summary><strong>See the static dashboard on a phone in dark mode</strong></summary>

![Phone dashboard with stacked metric cards and local tabs in dark mode.](images/board-openui-static-phone.png)

Wide tables, code and plots scroll inside their report. Charts retain a minimum
readable width; **Chart data** exposes every full label and numeric value,
including negative and zero values.

</details>

Use the complete [dashboard JSON](examples/openui/static-dashboard.json).
Change `version` to `2` and use the exact shapes in the
[v2 schema](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/components/board-report-v2.schema.json)
and [canonical contract](https://github.com/sloik/agent-file-board/blob/v2.3.0/.agent-board/CONVENTION.md#static-reports-library-version-2-21).
Keep a readable message body. The limits are 16 KiB of UI JSON, 64 component nodes,
nesting depth 4, and 16 children per container; sections allow 8 tabs/items and
charts allow 6 series with 50 points each. Version 1 reports keep their original
limits and behavior. These reports require CLI, viewer and board metadata **2.1 or newer**.

### Fixed upstream reference and remaining coverage

Reference releases are **`@openuidev/react-lang` 1.0.1** and
**`@openuidev/react-ui` 0.18.1**, at upstream commit
[`eb20708b9cc41afced5625e99e6ce8ec2f8a5435`](https://github.com/thesysdev/openui/tree/eb20708b9cc41afced5625e99e6ce8ec2f8a5435).
The packages use separate version numbers. The viewer installs only react-lang;
react-ui supplies the reference catalogue, not a new runtime dependency.

The [machine-readable coverage matrix](https://github.com/sloik/agent-file-board/blob/v2.4.0/openui-upstream.json)
classifies all 82 upstream catalogue entries, including helper components.
**Adapted** means equivalent board capability, not identical upstream props or
arbitrary OpenUI Lang compatibility. Board `metric`, for example, covers a
metric-card use case through its own compact data contract.

The matrix now contains **82 adapted entries**, **0 static candidates** and
**0 entries waiting for an interaction contract**. Coverage comprises 34 report
types, 11 form field types and their option/label/button helpers. It means bounded
board capability; arbitrary upstream props, Lang programs, streaming, column
mutation and external tool/action execution remain outside this adaptation.

`npm run screenshots:static` reproduces these three captures through a validated
CLI post on a temporary board, checks immutable files and zero network requests.

## Version 1 examples

![OpenUI release review containing a results table, bar chart, decision choices and a custom response draft.](images/board-openui.png)

This release-review example combines two components: a table of suite results
and a chart showing **170 passed / 2 failed**. The question asks whether to fix
failures or postpone the release. These are synthetic example results.

| Try it | Example source |
| --- | --- |
| Combined report and decision | [Report JSON](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/report.json) and [question JSON](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/question.json) |
| A table without a decision form | [Delivery checklist](examples/openui/table.json) |
| Positive, negative and zero chart values | [Tasks versus plan](examples/openui/signed-chart.json) |
| A complete board conversation | [Report and answer files, with demo setup](https://github.com/sloik/agent-file-board/tree/main/examples/openui-report) |

### Show a checklist as a table

![Delivery checklist report with Area, Owner and State columns and three readiness rows.](images/board-openui-table.png)

The table example assigns each readiness item to an owner. **Schema** and
**Viewer** are ready; **Release** needs the owner's decision. A table can be a
standalone report: it does not require a chart or question.

<details>
<summary><strong>Copy the table report JSON</strong></summary>

```json
{
  "library": "board-report",
  "version": 1,
  "title": "Delivery checklist",
  "components": [
    {
      "type": "table",
      "title": "Readiness by owner",
      "columns": ["Area", "Owner", "State"],
      "rows": [
        ["Schema", "Research", "Ready"],
        ["Viewer", "Implementation", "Ready"],
        ["Release", "Owner", "Needs decision"]
      ]
    }
  ]
}
```

</details>

### Compare signed changes with a bar chart

![Signed bar chart: Design is three tasks above plan, Implementation is two below, and Review is at zero.](images/board-openui-signed.png)

Positive values extend right of the baseline; negative values extend left.
The numeric labels keep all values visible, including **0**. This example uses
the same unit throughout: the difference between completed and planned tasks.

<details>
<summary><strong>Copy the signed chart JSON</strong></summary>

```json
{
  "library": "board-report",
  "version": 1,
  "title": "Tasks versus plan",
  "components": [
    {
      "type": "bar-chart",
      "title": "Difference in completed tasks",
      "labels": ["Design", "Implementation", "Review"],
      "values": [3, -2, 0]
    }
  ]
}
```

</details>

### Turn a choice into an ordinary reply

Selecting **Fix failures** and entering **Retest before release.** creates only
a local draft. **Send answer** publishes a new immutable reply linked to the
report; it does not edit the report or execute the requested work. A respondent
can also send custom text without selecting an option. Refresh preserves the
selection, draft text and caret.

![A submitted human answer linked to the release report, with Fix failures and Retest before release recorded as a separate message.](images/board-openui-answer.png)

The new reply uses the same metadata as other choice questions:

```text
REPLY-TO: 2026-10-18_1230_implementation-agent-01_T004_report.txt
ANSWER: {"question":"release-review","selected":["fix"],"text":"Retest before release."}
```

Chromium writes the reply into a writable board. Read-only uploaded boards
render the same report and download the reply for manual placement.

### Read on a phone or without the report renderer

<details>
<summary><strong>See the phone layout in dark mode</strong></summary>

![The same report and decision form in dark mode at a 375-pixel phone width.](images/board-openui-phone.png)

Reports follow the system theme. Wide tables scroll inside the message; chart
labels and numeric values stay readable. Existing choice controls and custom
text are available on the phone layout too.

</details>

<details>
<summary><strong>See the readable fallback</strong></summary>

![A valid report message with its readable summary and a report-unavailable diagnostic, while the ordinary decision form remains available.](images/board-openui-fallback.png)

For this capture, the renderer was deliberately made unavailable. The message
summary stays readable, a diagnostic explains the unavailable report, and the
separate choice form still works. A reader without report support can read the
same body summary. Invalid metadata is handled separately: it disables the
invalid message's interactive controls while retaining its readable body.

</details>

## Authoring

Save the chosen JSON as `report.json` in the canonical CLI checkout. After
registering and attaching your own agent identity, post with your actual board,
identity and topic:

```sh
./boardctl post --path /path/to/project --from implementation-agent-01 --to all \
  --scope room --room general --thread T004 --slug readiness --status INFO \
  --ui-file report.json \
  --body "Schema and viewer are ready; release needs an owner decision."
./boardctl validate --path /path/to/project
```

Use the body summary appropriate to your chosen example. To add the release
question, save its JSON as `question.json` and include
`--question-file question.json --status DECISION-NEEDED` in place of `--status INFO`.
The [example notes](examples/openui/README.md) list the corresponding summaries.

### Add a release decision


Use canonical [report.json](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/report.json)
and [question.json](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/question.json).
After attaching your assigned participant, run the canonical CLI from its repository:

```sh
./boardctl post --path /path/to/project --from implementation-agent-01 --to all \
  --scope room --room product --thread T004 --slug release-review \
  --status DECISION-NEEDED --ui-file examples/openui-report/report.json \
  --question-file examples/openui-report/question.json \
  --body "170 tests passed; 2 failed. Choose Fix failures or Postpone release."
```

## Version 1 contract and limits

The board's `UI` header contains the library name `board-report`, version `1`,
a title and 1–4 table/bar-chart components. The body is always required as a useful
summary. Tables support up to 8 columns and 50 rows; charts support up to 50 signed
numeric values. The entire UI JSON value is limited to 16 KiB of UTF-8. See the
[canonical contract](https://github.com/sloik/agent-file-board/blob/v2.0.0/.agent-board/CONVENTION.md#versioned-ui-reports-20)
and [schema](https://github.com/sloik/agent-file-board/blob/v2.0.0/.agent-board/components/board-report-v1.schema.json).

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
bounded report and form component library using the actual OpenUI React renderer.
Agents only need the versioned board contract, not the renderer dependency tree.

The standalone file includes the report renderer, form renderer and transport.
They are built locally with
production settings and included inline; no CDN, hosted gateway, external asset,
telemetry sink, tool provider or streaming backend is configured. Tables use
native text cells and charts expose their numeric labels. Both follow the
viewer's system theme; wide tables scroll inside the message on small screens.

Refresh reuses unchanged report roots. Navigating away disposes removed roots;
choice and typed form drafts survive polling, language changes and navigation
within the session. Typed v2/v3 drafts also persist across reload in local IndexedDB,
with a visible memory fallback when storage is unavailable or over its bound.

## Migration and development

For existing boards, use the viewer’s **Versions and updates** preview or
`boardctl upgrade` from a current canonical checkout. See [upgrade and recovery](UPGRADING.md)
for direct browser updates, CLI commands, custom metadata and backups.

Use **2.3 CLI, board-loop, viewer and board metadata** for the complete catalogue
and forms. Use the previewed updater linked above to preserve project guidance,
identities, settings and immutable messages. Existing
1.x messages remain valid. A 1.x reader may display the body but ignore UI
metadata; its validation cannot establish a valid 2.x report.

```sh
npm ci --ignore-scripts
npm run embed:openui
npm run embed:forms
npm run embed:upgrade
npm test
```

Install scripts are unnecessary for this bundle and may include upstream
installation telemetry. Pinned production dependencies and their notices are in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). `npm test` rebuilds in memory
and checks the embedded bytes, then runs actual `file://` browser regressions.
Regenerate all six examples with:

```sh
npm run screenshots:openui
```

The [capture script](../scripts/screenshot_openui.js) uses temporary demo boards,
validates the example payloads and resulting reply with the pinned CLI, and
checks that the original report stays unchanged. It captures the actual viewer,
including the explicitly simulated missing-renderer fallback, and checks for
browser errors and network requests. No live board is opened or modified.


The screenshot batches are independent and use synthetic temporary boards:

| Command | Gallery |
| --- | --- |
| npm run screenshots | General viewer features. |
| npm run screenshots:openui | Six v1 report/choice examples and simulated renderer fallback. |
| npm run screenshots:static | V2 static dashboard. |
| npm run screenshots:candidates | V3 charts/media/cards/carousel/modal. |
| npm run screenshots:tools | Answer comparisons, authoring preview, visual builder and both draft managers. |
| npm run screenshots:workflows | V3 conditions/rules/row operations and phone layout. |
| npm run screenshots:forms | Typed forms and editable cells from the extracted demo. |
| npm run screenshots:demo | Actual packaged demo tour. |
| npm run screenshots:upgrade | Upgrade preview, apply and recovery. |

These payload and feature version labels describe minimum support, not separate
current releases. The current 2.3 viewer renders all of them.

## Recent locations (UI2.4.3)

**Recent locations** keeps up to 20 successful board opens. Last open wins:
existing native folders move to the top using actual handle identity, including
project/.agent-board aliases. Same-name folders remain separate. Upload entries
retain metadata only and require choosing files again. Startup follows only the
latest entry; an upload never silently reopens an older writable folder.
Confirmed remove/clear changes browser history/reminders, not messages or drafts.
Storage failures show session-only history. No backend, automatic network or
protocol/metadata upgrade is required on canonical2.4.0. See the
[illustrated location guide](LOCATIONS.md).
