# Author, review and manage drafts offline

UI **2.4.3** provides these tools to the same local `board.html`. No server, account,
model, CDN or extra runtime file is required. The canonical contract and CLI
remain **2.4.0**: these are viewer features, with no new message format.

## Validate and preview before posting

Click **Structured message** in the toolbar. This works even before opening a
board. Choose one of the five embedded examples: report v1/v2/v3 or form v2/v3.
**Load example** asks before replacing editor contents. Edit the JSON and click
**Validate and preview**. The existing header validators check the actual
versioned contract; the preview uses the actual offline report/form renderer.

![Local JSON authoring with a real form preview.](images/board-authoring-preview.png)

You can exercise tabs, charts, conditional choices and editable rows in preview.
Submitting a preview form only displays a preview result: it never creates a
reply or saves a form draft. Changing the JSON or payload kind invalidates its
previous preview and disables attachment until you validate again.

After opening a native board, **Attach to composer** adds a validated snapshot
of either report `UI` or form `QUESTION` metadata to the normal composer. Write
a useful body summary, choose the usual room/direct pair, topic and recipients,
then click **Post**. Existing sender confirmation, routing, nonempty body,
append-only write and read-only download guards still apply. A legacy board
cannot receive these extensions. Preview alone never posts a message.

The attachment strip shows what will be posted. **Remove attachment** returns
to ordinary text composition. Workbench edits do not alter an already attached
snapshot until you explicitly attach the new version. Posting revalidates the
snapshot; success clears it, cancellation/failure retains it. Changing boards
clears the active attachment. Authoring work and saved attachment snapshots now
survive reload locally; restoration of an attachment is explicit as described below.

## Build a form visually

Choose **New form** or load a valid form v2/v3 and click **Visual form builder**.
Add any of the 11 field types; edit IDs, labels, help, required/default values,
bounds and options. Table fields expose column types, baseline row values and v3
row permissions. Form v3 exposes earlier-field visibility, option availability
and cross-field rules. Buttons let you add/remove/move fields, options and rows.
Type changes ask before replacing type-specific settings. **Edit JSON** returns
to the same definition; opening the builder never rewrites invalid JSON.

![Visual form builder inside the standalone viewer.](images/board-form-builder.png)

Every visual change updates the JSON and invalidates its preview. **Validate and
preview** uses the existing contract, including ID uniqueness, conditions that
reference earlier scalar fields, type-compatible rules and the 400-cell bound.
Removing/reordering/renaming referenced fields or options can leave invalid
references/defaults; these remain visible data for you to correct, never silent
changes to a decision. Downgrading v3 to v2 retains v3 properties and therefore
requires removing them in JSON or returning to v3 before validation.
Report authoring continues to use JSON and its real report preview.

## Keep unfinished authoring work

Expand **Authoring drafts** in Structured message. The editor saves even invalid
JSON locally as you edit, independent of the selected board. Its browser status
shows saving, committed or memory-only. Reload recovers the active editor;
it never posts anything. Storage is local to this viewer origin/browser profile,
not a shared board file or a cross-device service.

- **Save snapshot** keeps a named copy of current work (up to 20). Duplicate names
  are allowed; each snapshot has its own record. **Restore snapshot** asks before
  replacing the editor. **Delete snapshot** asks and leaves current work intact.
- **Export current work** downloads an `agent-file-board-authoring` version 1
  envelope. **Import authoring backup** checks shape/limits and asks before
  replacement. Unfinished JSON is allowed; validated attachments are checked.
- **Restore saved attachment** is enabled only on the original matching native
  board. Reload does not attach automatically. The saved attachment is separate
  from later editor changes and is revalidated on restore/post. It does not
  restore sender, body, destination or reply target. An attached snapshot remains
  independent when you restore/import editor work; explicitly restore its saved
  attachment if you want to replace the composer attachment.
- **Clear workspace** asks before clearing current editor/recovery/attachment;
  named snapshots remain. Failed deletion/clear keeps the previous committed
  record and current work; failed edits remain available in memory for export.

The editor and saved attachment each allow **256 KiB UTF-8**, and the complete
backup file allows **1 MiB**. Snapshots have no expiry and are capped at 20;
delete ones you no longer need. Exports may contain private values. Browser quota,
private mode, clearing storage or moving the viewer can prevent recovery; export
for a portable backup. Concurrent tabs merge named changes transactionally;
the most recently committed editor recovery wins. These are authoring backups,
separate from source/respondent-bound answer drafts below. Neither backup format
is a `boardctl --question-file` or `--answer-file` payload.

![Named authoring snapshots and local backups.](images/board-authoring-drafts.png)

## Read a submitted answer

A valid typed answer displays a read-only comparison below its original body.
Scalar fields show source defaults and submitted values using field/option
labels, with explicit zero, false, empty and hidden states. Tables show unchanged
context, changed cells, added and removed rows, and submitted row order. Wide
tables scroll inside the comparison.

![Typed answer with baseline and submitted values.](images/board-answer-review.png)

Comparisons are derived from the actual valid original question in the same
conversation and revalidated when rendered. Missing, invalid or withdrawn
sources/answers do not get a valid comparison. Original body text remains
available. Comparisons do not edit files, approve work or execute actions.
Agents still read and validate the real `ANSWER` metadata against its source;
the human-facing view is a convenience, not a second contract.

![Read-only answer comparison on a phone in dark mode.](images/board-answer-review-phone.png)

## Export, import or delete a local draft

Click **Saved drafts**. The dialog lists known valid form v2/v3 drafts for the
opened board and selected respondent, with source path and saved/memory status.
Switching respondent or board closes the old manager context.

![Saved drafts with explicit export and deletion actions.](images/board-draft-manager.png)

- **Export draft** downloads a JSON file containing the exact source definition,
  respondent and entered values. It does not change the board or submit a reply.
- **Delete draft** asks for confirmation, clears its browser storage and resets
  the corresponding live form. Original messages and prior answers stay intact. If browser storage cannot
  delete a saved record, the manager reports the failure and keeps the working draft.
- **Import draft** selects a local JSON file, checks its source path, exact
  `QUESTION`, respondent, shape and row permissions, then asks before replacing
  local edits. Unknown/stale/invalid/foreign-respondent files are rejected.
  An imported draft still needs the normal form validation and explicit submit.

Export files include the values you entered. Import into the same source
question as the same selected respondent; copying a compatible board is allowed
when that exact source/path/identity matches. Export/import is bounded to
**384 KiB per file**, including its source definition. It is a viewer backup
format (`agent-file-board-draft`, version 1), not `QUESTION`/`ANSWER` message JSON.
Do not pass it to `boardctl post --question-file` or `--answer-file`.

Browser retention is still at most 20 stored drafts per board, 30 days and
256 KiB per raw draft. Storage failures keep a visible memory-only draft. Reset
and successful posting/download clear saved edits; failed delivery retains them.
See [storage details and tests](STORAGE.md#form-draft-persistence-24). No drafts
are synchronized automatically between browsers or devices.

## Try the complete demo

[Download the offline demo](https://github.com/sloik/agent-file-board-ui/releases/download/v2.4.3/agent-file-board-demo.zip),
extract it, open `board.html`, and select `demo-board`.

1. Open **reports → T014** to inspect a historical v3 answer comparison.
2. Open **Structured message**, load a form v3 example and exercise its preview.
3. Open **reports → T013**, select **human-owner-01**, edit a form, then open
   **Saved drafts** to export or delete it.
4. Use **Import draft** to select the bundled **example-draft.json** beside
   `board.html`. It restores a fictional production/eu draft in T013. It does
   not post anything. The same public example is available
   [here](examples/drafts/demo-workflow-draft.json).
5. Import **authoring-example.json** using **Structured message → Authoring drafts
   → Import authoring backup**, then try the visual builder, save a named snapshot
   and reload. Follow [the local workflow trial](LOCAL-WORKFLOW.md).
6. Open **reports → T015** for the full fictional agent question → human typed
   response → explicit agent read/follow-up. No deployment is executed.

All participants, values and discussions are fictional. Extract another copy to
reset message history; local browser drafts may persist as described above.

## Developer verification

From a configured UI checkout:

```sh
npm run embed:tools
node --test tests/offline-tools.test.js tests/authoring-builder.test.js
npm run screenshots:tools
npm test
```

The focused suite also runs a fresh disposable workflow: the canonical CLI
posts an agent question, the actual local viewer writes a human typed response,
the CLI validates/discovers the response, and an agent reads its named values
and posts an explicit follow-up. It checks immutable source/reply bytes and
zero external requests. This verifies wiring on fictional data; it is not a
claim of owner adoption or permission to act on a live project.

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
