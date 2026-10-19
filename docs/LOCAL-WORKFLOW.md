# One local workflow: author, answer and review

Use UI2.4.2's one standalone `board.html`. No server, model or network service is
needed. The downloadable demo includes these instructions as WORKFLOW-TRIAL.md
and a public fictional authoring backup as authoring-example.json. Everything in
the packaged demo is fictional; completing this rehearsal proves wiring, not
real human adoption or permission to execute work.

## Rehearse on the disposable demo

1. Extract a fresh demo, open board.html and select demo-board. Select
   human-owner-01. Choose the reports room and a new topic in the usual composer.
2. Open Structured message → Authoring drafts → Import authoring backup and
   choose authoring-example.json. Confirm replacement, open Visual form builder
   and change the prompt/labels for a fictional review. Add a field, option or
   baseline row. Validate and preview; fix any reported contract errors.
3. Save a named snapshot, change an editor value and reload. Confirm the current
   editor work recovered. Restore the named snapshot explicitly and check that
   the earlier definition returns. Export current work as a portable backup.
4. Validate, attach and close. Write a useful body, choose your intended
   destination/topic/recipient and Post. Native Chromium appends a new QUESTION
   file; read-only browsers download it for manual placement. Original demo
   messages remain unchanged. Do not impersonate an agent to avoid a confirmation.
5. In this fictional sandbox, complete the new form as human-owner-01 and send
   its separate answer. Exercise production → approver/region, valid dates and
   budgets, and table row edits. Read the answer comparison. It describes values;
   it does not accept work or execute a deployment.
6. With a separately installed canonical2.4.0 CLI, an agent can validate/discover
   the actual files below. Substitute the exact demo path and new topic. Read the
   selected ANSWER against its original QUESTION; only then append a normal
   explicit follow-up using the agent's own registered identity. A viewer backup
   envelope must never be passed as --question-file or --answer-file.

```sh
boardctl validate --path /absolute/path/to/demo-board
boardctl recent --path /absolute/path/to/demo-board \
  --participant implementation-agent-01 --room reports --topic T016 --limit 5
```

The topic is an example: use the ID you actually created. In a standard checkout,
`python3 boardctl.py` or `./boardctl` can replace an installed `boardctl` command.
CLI installation is optional for the browser rehearsal; it is not a browser backend.
An automated disposable CLI → viewer → CLI roundtrip is retained in the test suite.

## Use it on one real project

Choose an actual decision whose owner and agent can both participate. The useful
question is: can the owner author/recover a form and answer it, and can the agent
read its typed values without manually repairing files?

- Confirm the exact project board, registered participants and intended topic.
  Start with one low-impact question; do not copy fictional answers into it.
- Have the actual author create/preview/post the question, and the actual owner
  answer it. Verify recovery by reloading an unfinished draft first.
- Have the actual agent read the answer, summarize the requested decision in an
  explicit follow-up, and wait for any separately required execution authority.
- Record a short result locally: completed or stopped, which step caused trouble,
  whether repair was needed, and the relevant message paths. Keep private values
  in that project; nothing is uploaded or collected by this page.

Until those actual people/agents complete the workflow, adoption is **unverified**.
No automatic acceptance, synthetic owner participation or telemetry is implied.

## Optional appearance trial

Before editing, open **Settings → Color theme** and try System, Light, Dark and
Dracula (UI2.4.7). Try another palette with unsent form values or a report filter:
those local values remain in place. This preference belongs to the browser; it
is not shared with the agent or saved into a message.

Dracula styles interface chrome only. Participant/status pills, speech bubbles,
composer status tints and report/chart indicators keep the established Dark
content colors. See the [theme guide](https://github.com/sloik/agent-file-board-ui/blob/v2.4.7/docs/THEMES.md).

Long dialogs keep their title and **Close** visible while scrolling, including
Structured message and report modals. Settings has a saved, resizable width:
drag its left edge or use Left/Right arrows; double-click/Home resets it. Its
header and bottom actions stay visible. See the [panel guide](https://github.com/sloik/agent-file-board-ui/blob/v2.4.7/docs/PANELS.md).

Refresh status uses a reserved line below toolbar actions (UI2.4.7). Countdown
digit/unit changes, paused/off and read-only states keep button positions and
header height stable. Resizing the viewport or changing language can still
reflow the responsive toolbar.
