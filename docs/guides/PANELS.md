# Dialogs and Settings

In UI2.4.8, long dialogs keep their title and **Close** in an opaque pinned
header. This applies to **Structured message**, saved drafts, recent locations,
protocol upgrades, board vocabulary, participants/presence, message repairs,
guidance and embedded report modals. Scroll to the end and close directly;
there is no need to scroll back to the beginning. Existing Escape behavior stays
available. Closing Structured message retains its unfinished JSON as before.

![Structured message scrolled to the end, Close still visible](../images/board-dialog-scroll.png)

Open **Settings** and drag the grip on its **left edge** to change its width.
Drag left to widen and right to narrow. Focus the edge with Tab and use
**Left/Right arrows** to adjust by20px. **Double-click** the edge or press **Home**
to restore340px. **Reset to defaults** also restores the default width.

The desktop range is280–900px, bounded by available viewport space. Width saves
using the existing [browser settings store](../reference/STORAGE.md). A smaller window or
phone clamps the displayed width; returning to a larger window restores the
saved desktop width. Older/missing/invalid width preferences display340px.

Settings has **Close** at the top and **Reset/Done** at the bottom. Both rows stay
visible while the controls in between scroll. The width handle stays reachable
along the entire left edge, including after scrolling.

![Wider Settings on desktop](../images/board-settings-wide.png)

![Polish phone Settings scrolled, with Close and bottom actions visible](../images/board-settings-phone.png)

These are local viewer layout changes. They require no backend or network,
change no board messages, and preserve theme color meanings and editor state.
Try the [fictional offline demo](DEMO.md). Reproduce captures with
`npm run screenshots:panels`. Layout tests use real preview/report rendering,
long-content fixtures for all dialog headers, hit-tested close clicks and
pointer/keyboard resize with committed reload/reset checks.

Refresh status no longer takes a toolbar line (SPEC-002-068): the refresh
button's tooltip and a small dot carry it, and Tools repeats it. Countdown
digit/unit changes, paused/off and read-only states keep button positions and
header height stable. From 601px wide the header is one line. The captures below
predate that change.

![Stable toolbar with a running countdown](../images/board-toolbar-stable.png)

![Polish phone toolbar and refresh status](../images/board-toolbar-phone.png)

Reproduce these captures with `npm run screenshots:toolbar`. Timer geometry
tests advance the real scheduler, including polling rollover, and compare every
header control plus the toolbar/feed boundaries at six widths in both locales.

## Showing and hiding the sidebar

The sidebar of rooms and threads has two controls (SPEC-002-069). The button at
the top left of the header shows a panel icon whose left column is filled while
the sidebar is shown and outlined while it is hidden; on wide windows it also
reads **Rooms**. It shows or hides the sidebar. **«** at the right end of the
**Rooms and threads** heading hides it from inside. **Ctrl+B** (**⌘B** on a Mac)
toggles it, and **Tools** has the same entry with the shortcut. The choice is
remembered in this browser; on phones the sidebar is a drawer that closes with
**«**, Escape, a tap outside or after picking a conversation.

With a mouse or trackpad, a hidden sidebar can be used without pinning it: rest
the pointer on the left edge of the window (below the header) or on the sidebar
button and it slides over the conversation. Pick as many rooms and topics as you
like; it closes when the pointer moves away, or with Escape. In the peek, **📌
Keep sidebar open** pins it. Peeking does not change the remembered choice and
does not move the conversation. It is off on touch screens and in the phone
drawer; keyboard users use the button or the shortcut.

## Folder selection

The [folder chooser guide](LOCATIONS.md) covers opening boards, recent locations,
keyboard controls and picker cancellation.
