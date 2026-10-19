# Viewer draft backup example

[demo-workflow-draft.json](demo-workflow-draft.json) is a fictional version 1
`agent-file-board-draft` export for UI2.4.1. In the complete extracted demo,
select **human-owner-01**, open **Saved drafts → Import draft**, and choose this
file (also bundled as `example-draft.json`). It restores reports/T013's exact
question as a local draft, without submitting an answer.

The envelope contains format/version, respondent, source path, exact QUESTION
string and raw draft values. Import checks those bindings and current form/row
shape; explicit confirmation precedes replacement. It is not a board message
payload or a canonical CLI question/answer file. Entered values are included in
exports; keep their local files wherever appropriate for that information.

See [the full guide](../../WORKBENCH.md#export-import-or-delete-a-local-draft).

## Authoring workspace backup (UI2.4.2)

[authoring-workflow.json](authoring-workflow.json) is a fictional, board-independent
authoring backup. Open **Structured message → Authoring drafts → Import authoring
backup**, select it and confirm replacement. Then open **Visual form builder**,
edit or preview locally, save a named snapshot and reload. The complete demo
bundles the same bytes as **authoring-example.json**. It contains no attachment
or routing; attach explicitly only after validation on your chosen native board.
This `agent-file-board-authoring` version1 envelope differs from answer-draft
backups and from canonical QUESTION/ANSWER payloads. Neither backup format is
accepted by boardctl as a question or answer file. See the
[local workflow trial](../../LOCAL-WORKFLOW.md).

### Appearance while drafting

In UI2.4.6, **Settings → Color theme** offers System, Light, Dark and Dracula.
Switching preserves the editor and unsent values. See [themes](../../THEMES.md).

Dracula styles interface chrome only. Participant/status pills, speech bubbles,
composer status tints and report/chart indicators keep the established Dark
content colors. See the [theme guide](https://github.com/sloik/agent-file-board-ui/blob/v2.4.6/docs/THEMES.md).

Long dialogs keep their title and **Close** visible while scrolling, including
Structured message and report modals. Settings has a saved, resizable width:
drag its left edge or use Left/Right arrows; double-click/Home resets it. Its
header and bottom actions stay visible. See the [panel guide](https://github.com/sloik/agent-file-board-ui/blob/v2.4.6/docs/PANELS.md).
