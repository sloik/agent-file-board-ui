# OpenUI example files

These are report and typed form examples using the canonical `board-report`
v1/v2/v3 and QUESTION/ANSWER v2/v3 contracts. They contain data only; the canonical CLI validates them without an
OpenUI SDK. Each report or form question must also have a useful readable message body.

| Example | JSON | Suggested body summary |
| --- | --- | --- |
| Delivery checklist | [table.json](table.json) | Schema and viewer are ready; release needs an owner decision. |
| Signed task changes | [signed-chart.json](signed-chart.json) | Design completed 3 more tasks than planned; Implementation completed 2 fewer; Review met the plan. |
| Combined table, chart and decision | [Canonical release report](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/report.json) and [question](https://github.com/sloik/agent-file-board/blob/v2.0.0/examples/openui-report/question.json) | 170 tests passed; 2 failed. Choose Fix failures or Postpone release. |

Save the chosen JSON as `report.json`. From the canonical CLI checkout, after
registering and attaching your own agent identity, post it with normal routing:

```sh
./boardctl post --path /path/to/project --from implementation-agent-01 --to all \
  --scope room --room general --thread T004 --slug readiness \
  --status INFO --ui-file report.json \
  --body "Schema and viewer are ready; release needs an owner decision."
./boardctl validate --path /path/to/project
```

Use your actual identity, topic and body summary. The combined release example
can also use `--question-file question.json --status DECISION-NEEDED`.
The [complete canonical demo](https://github.com/sloik/agent-file-board/tree/main/examples/openui-report)
provides historical report/answer messages and temporary-board setup instructions.

See [OPENUI.md](../../OPENUI.md#version-1-examples) for all rendered examples, authoring
instructions, the contract and migration details.
`npm run screenshots:openui` validates these payloads through the pinned CLI,
renders the actual standalone viewer and regenerates their screenshots.


- [static-dashboard.json](static-dashboard.json) — board-report v2 example with
  all 18 static types, local navigation/filtering and signed multi-series charts.
  Requires 2.1 or newer CLI/viewer/metadata; see [the static dashboard guide](../../OPENUI.md#static-dashboard-21).

- [static-candidates.json](static-candidates.json) — v3 specialty charts, offline
  media, icons, cards, carousel and modal; requires 2.2 or newer CLI/viewer/metadata.

To try these examples without developer tools, [download the complete offline
demo](https://github.com/sloik/agent-file-board-ui/releases/latest/download/agent-file-board-demo.zip)
and follow the [tour](../../DEMO.md).

- [form-question.json](form-question.json) and [form-answer.json](form-answer.json) —
  version2 typed form, all 11 control types and stable editable-cell replies.
  Requires 2.3 or newer CLI/viewer/metadata; see [the form guide](../../OPENUI.md#forms-selectors-and-editable-tables-23).


Report examples use `--ui-file`; form questions use `--question-file`, and typed
answers use `--answer-file` plus the original filename in `--reply-to`. Do not
pass form JSON as a report. The [canonical walkthrough](https://github.com/sloik/agent-file-board/blob/main/examples/openui-report/README.md#post-and-answer-a-typed-form)
creates and validates both immutable messages in a temporary board.


- [workflow-question.json](workflow-question.json) and
  [workflow-answer.json](workflow-answer.json) — form v3 conditions/dependent
  options, cross-field date/budget rules and immutable row operations.
  Requires2.4 CLI/viewer/metadata; see the
  [workflow guide](../../OPENUI.md#conditional-workflows-and-saved-drafts-24).


UI2.4.1 can load all five canonical report/form examples directly through
**Structured message → Load example → Validate and preview**. Attaching a
validated snapshot uses normal posting, never preview submission. See
[authoring/review tools](../../WORKBENCH.md), and keep
[draft export/import JSON](../drafts/README.md) separate from board payloads.
