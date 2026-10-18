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
