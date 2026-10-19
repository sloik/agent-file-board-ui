# Dialogs and Settings

In UI2.4.8, long dialogs keep their title and **Close** in an opaque pinned
header. This applies to **Structured message**, saved drafts, recent locations,
protocol upgrades, board vocabulary, participants/presence, message repairs,
guidance and embedded report modals. Scroll to the end and close directly;
there is no need to scroll back to the beginning. Existing Escape behavior stays
available. Closing Structured message retains its unfinished JSON as before.

![Structured message scrolled to the end, Close still visible](images/board-dialog-scroll.png)

Open **Settings** and drag the grip on its **left edge** to change its width.
Drag left to widen and right to narrow. Focus the edge with Tab and use
**Left/Right arrows** to adjust by20px. **Double-click** the edge or press **Home**
to restore340px. **Reset to defaults** also restores the default width.

The desktop range is280–900px, bounded by available viewport space. Width saves
using the existing [browser settings store](STORAGE.md). A smaller window or
phone clamps the displayed width; returning to a larger window restores the
saved desktop width. Older/missing/invalid width preferences display340px.

Settings has **Close** at the top and **Reset/Done** at the bottom. Both rows stay
visible while the controls in between scroll. The width handle stays reachable
along the entire left edge, including after scrolling.

![Wider Settings on desktop](images/board-settings-wide.png)

![Polish phone Settings scrolled, with Close and bottom actions visible](images/board-settings-phone.png)

These are local viewer layout changes. They require no backend or network,
change no board messages, and preserve theme color meanings and editor state.
Try the [fictional offline demo](DEMO.md). Reproduce captures with
`npm run screenshots:panels`. Layout tests use real preview/report rendering,
long-content fixtures for all dialog headers, hit-tested close clicks and
pointer/keyboard resize with committed reload/reset checks.

Refresh status uses a reserved line below toolbar actions (UI2.4.8). Countdown
digit/unit changes, paused/off and read-only states keep button positions and
header height stable. Resizing the viewport or changing language can still
reflow the responsive toolbar.

![Stable toolbar with a running countdown](images/board-toolbar-stable.png)

![Polish phone toolbar and refresh status](images/board-toolbar-phone.png)

Reproduce these captures with `npm run screenshots:toolbar`. Timer geometry
tests advance the real scheduler, including polling rollover, and compare every
header control plus the toolbar/feed boundaries at six widths in both locales.

## Folder label chooser (UI2.4.8)

Click the folder label under **Agent File Board** to choose a new folder or
reopen one from **Recent locations**. This replaces the separate Change folder
and Recent locations toolbar buttons. The label works on phones and with
keyboard Enter/Space; native cancellation preserves the active board.
