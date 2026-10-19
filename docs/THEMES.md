# Color themes

Open **Settings → Color theme** and choose:

| Choice | Behavior |
| --- | --- |
| System | Default. Follows the operating system's light/dark preference, including live changes. |
| Light | Always uses the light palette. |
| Dark | Always uses the dark palette. |
| Dracula | Dracula interface chrome; established Dark content and indicator colors. |

The choice is saved in this browser using the existing committed settings store.
It applies to the standalone viewer and the packaged demo. Reset to defaults
restores System; older or unknown saved values also use System. If browser
storage is unavailable the current page still works, but persistence is limited
to the existing storage fallback. Moving the HTML or using another browser may
use a different settings store. See [storage](STORAGE.md).

Switching themes changes CSS and native control appearance immediately. It
preserves mounted report tabs, filters and form values, composer drafts and
selection. Messages, embedded images and their original data stay unchanged.
No server, fonts, remote stylesheets or network calls are needed.

![Dracula demo report](images/board-dracula.png)

![Theme selection in Polish on a phone](images/board-themes-phone.png)

Dracula is an application adaptation of the [official palette](https://spec.draculatheme.com/)
by [Dracula Theme](https://draculatheme.com/), using its background, foreground,
selection and purple accent on the interface chrome. Panel shades and muted
labels are adapted for reading; bright chrome buttons use dark text.
Participant colors, status pills/dots, unread badges, speech bubbles (including hover), composer
status tints and report/chart data retain the existing **Dark** palette exactly.
Dracula changes the surrounding panels, page, toolbars and settings controls;
it does not replace these color indicators. Seven status colors remain distinct
with pill text contrast of at least 4.5:1.
This is not a syntax-highlighting specification implementation or endorsement.
The [MIT notice](../licenses/dracula-MIT.txt) is retained in the standalone HTML
and demo archive.

Try the [fictional offline demo](DEMO.md). Reproduce these captures with
`npm run screenshots:themes`; `tests/themes.test.js` covers selection, committed
reload/reset, system overrides, retained editor/report state and phone bounds.

Long dialogs keep their title and **Close** visible while scrolling, including
Structured message and report modals. Settings has a saved, resizable width:
drag its left edge or use Left/Right arrows; double-click/Home resets it. Its
header and bottom actions stay visible. See the [panel guide](https://github.com/sloik/agent-file-board-ui/blob/v2.4.8/docs/PANELS.md).
