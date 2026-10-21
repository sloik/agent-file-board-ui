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

See [the full guide](../../guides/WORKBENCH.md#export-import-or-delete-a-local-draft).

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
[local workflow trial](../../guides/LOCAL-WORKFLOW.md).

## Related viewer controls

See [themes](../../guides/THEMES.md), [dialogs and Settings](../../guides/PANELS.md)
and [folder selection](../../guides/LOCATIONS.md) for appearance and navigation.
These controls preserve unfinished work and do not change board messages.
