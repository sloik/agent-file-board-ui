---
id: SPEC-002-068
title: Compact layout - message field and Post always visible, destination shown by the sidebar, sidebar toggle
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
amends: SPEC-002-064
---

## Problem

Owner (2026-10-23, viewer 3.3.3):
1. "still this toolbar takes too much space; when I change size to minimal I do not see the
   text field to type and post button; find a more optimal layout".
2. "'posting to' is redundant; it should be clear from the sidebar where we are posting;
   maybe some highlight should be done and we need some button to toggle visibility of sidebar".

Measured on main (topic view, draft typed): at 1280x560 #cBody is at 598-665 (below the fold);
at 1280x460 the document is 509px tall; at 390x640 it is 778px. Below ~650px of height the
message field and Post are off-screen.

## Root causes (UX design review, 2026-10-23)

- A. `.feed-wrap` (board.html ~126) is a flex column where nothing shrinks: `.feed{min-height:80px}`,
  `.composer{flex:none;min-height:160px;max-height:65vh;overflow:auto}` (~283) overflows and the
  document scrolls.
- B. Inside the composer (`.composer .inner`, ~338) the write row is the last child of one scroll
  box, so with options open #cBody sits below the composer's own bottom.
- C. Chrome is too tall: `.top` wraps (~55) and `.rstat{flex:0 0 100%}` (~77) forces a row
  (144px desktop, 249px phone); `.feed-head` wraps four buttons; persisted `--composerh` (~3727) is
  clamped only while dragging (~3803), never on window resize; the Room name input shows whenever
  Advanced is open (`scripts/composer-options.js` ~96, `advanced` term) - drift from SPEC-002-064
  ("New room input moves into the New room... flow").

## Design

### Layout
1. `.feed-wrap{display:grid;grid-template-rows:auto minmax(0,1fr) auto auto}`; `.feed{min-height:0}`
   (60px at max-height <=480). The page never scrolls (body overflow hidden only as a backstop).
2. Composer: `overflow:hidden;max-height:max(112px,45dvh)` (55dvh at max-height <=480), no fixed
   min-height. `.composer .inner` becomes a grid `auto minmax(0,1fr) auto` with three zones
   (move existing nodes, IDs unchanged):
   - pinned top: #replying (one line, ellipsis), #composerTargetRow, #composerPin;
   - scrolling middle (`overflow:auto;min-height:0`): #composerTargetNote, #composerTargetFields,
     #composerOptions (incl. #composerAdvanced), #structuredAttachment;
   - pinned bottom: #signingNotice, .write, #signingRequires, #cInfo.
   Priority: draft-pin banner and signing status are never hidden; textarea keeps >= 2 lines.
3. Signing status: on wide screens it may share a line with the chip row when that row is shown;
   at <=600 wide or max-height <=640 it uses the existing compact one-line form (SPEC-002-065).
   It always stays directly above Send.
4. Options: at max-height <=640 they load collapsed (the user's saved preference is kept, not
   overwritten). The chip popover's "Advanced..." still opens them.
5. Room name (#cNewRoom) only in the New room flow or when it has a value (drop the `advanced` term).
6. Header `.top` is one line at >=601 wide: #rstat leaves the flow (title/tooltip of #reload plus a
   small dot; hidden at <=600 or max-height <=640); #verbar hidden at width <1100 or max-height <=640
   and mirrored as the last line of the Tools panel (#verwarn still shows when stale);
   #structuredOpen/#notificationsOpen become icon buttons with visually hidden text below 1100 wide
   or 640 tall (same IDs, still visible); at <=600 the search collapses to a search button that
   expands over the bar. Sidebar drawer and settings positions derive from a `--top-h` variable kept
   by a ResizeObserver instead of fixed 56px/60px.
7. `.feed-head` is one line: #title/#subtitle ellipsis plus a "..." disclosure (#topicMenu) holding
   the title editor (#titleEditor/#setTitle as "Rename..."), #repairsOpen, #guidanceOpen and the
   injected missing-message button. At max-height <=480 the head is a ~28px strip.
8. On window resize, re-clamp the persisted composer height with the drag formula; the CSS
   max-height also caps it.

### Destination without "Posting to" (amends SPEC-002-064 "chip always shows")
9. When the destination equals the view, #composerTargetRow is hidden; #composerTarget stays in the
   DOM (ID, aria-controls and popover keep working; its textContent stays current).
10. The view shows the destination:
    - sidebar: the destination card gets `.posting` (strong accent border/inset and a "posting here"
      marker), and its room/DM group header a matching tint; in a room view (new topic) the room row
      is highlighted and labelled "new topic in #room"; exactly one element carries `.posting`;
    - topic bar #title shows the full destination (`# product › T003 Language policy`, or the DM
      peer), one line with ellipsis and the full text in `title` - the source of truth when the
      sidebar is hidden.
11. The chip row reappears automatically when the destination differs from the view: draft pin,
    reply from All messages or search, New room, New topic, Message a participant / new DM,
    Advanced routing changed Where/Thread/To, or no destination (warning tone, Post disabled with
    the reason in #cInfo).
12. "Change" stays reachable via a small #composerTargetChange icon button (visible text hidden,
    label "Change destination" / "Zmień cel") left of #send in the pinned bottom row; it opens the
    same #composerTargetMenu anchored to itself. Fits at 320px wide.

### Sidebar toggle
13. #menu (same ID) shows at every width as the first header item, with aria-controls="side",
    aria-expanded reflecting state, label "Hide sidebar"/"Show sidebar" ("Ukryj panel boczny" /
    "Pokaż panel boczny"), shortcut Ctrl/Cmd+B listed in the Tools menu.
14. Above 820px: hidden collapses the sidebar column to 0 and makes `.side` non-focusable
    (visibility hidden); the chosen width (--sidew) is kept for reopening.
15. Persistence: `localStorage['afb.sidebar']` = shown/hidden, written only on an explicit toggle,
    all access in try/catch. Defaults when nothing is saved: shown at >=1000x560, hidden when
    narrower than 1000 or shorter than 560. Resizing never overrides an explicit choice.
16. <=820px: remains a drawer, closed by default (not persisted), top at var(--top-h), with a scrim;
    closes on Escape, scrim tap and after picking a room/topic/DM; focus returns to #menu.

## Acceptance criteria (Playwright bounding boxes, not isVisible)

- [x] AC1: For viewports {1280x800, 1280x560, 1280x460, 900x500, 700x420, 640x800, 390x640, 390x560,
  320x360} x {en, pl} x {light, dark, dracula} x {options collapsed, options+Advanced expanded}:
  #cBody top >= 0 and bottom <= innerHeight, #send bottom <= innerHeight, #cBody height >= 2 line
  heights, document scrollHeight <= innerHeight, scrollWidth <= innerWidth.
- [x] AC2: #signingNotice and (when shown) #composerTargetRow and #composerPin are inside the viewport
  in every AC1 case.
- [x] AC3: #feed clientHeight >= 60 at 320x360 and the feed scrolls internally.
- [x] AC4: with persisted composer height 600, reload at 1280x800 then resize to 1280x460: AC1 holds.
- [x] AC5: worst case at 320x360 Polish: reply + draft pin + structured attachment + target note +
  signing + options expanded: AC1/AC2 hold.
- [x] AC6: in a topic view #cNewRoom is hidden with Advanced open; visible after New room... or with a
  typed value.
- [x] AC7: header is one row at >=601 wide (.top height <= 52); feed head <= 36.
- [x] AC8: keyboard: Tab from #cBody reaches #send; topic "..." and Tools menus open with Enter and
  their items are focusable.
- [x] AC9 (non-vacuity): a test-only mutation restoring `.composer{flex:none;min-height:160px}` /
  removing the inner grid makes AC1 fail at 1280x460 and at 390x640 expanded.
- [x] AC10: topic view at 1280x800: #composerTargetRow hidden, #composerTarget present;
  #composerTargetChange opens #composerTargetMenu; picking another topic shows the chip row and the
  post lands there.
- [x] AC11: the chip row is visible in each case: draft pin, reply from All messages, New room,
  New topic, Message a participant, no destination (Post disabled with reason).
- [x] AC12: exactly one sidebar element has `.posting` and it matches the destination; #title contains
  room and topic (or DM peer); both update after switching views.
- [x] AC13: at 1280x800 #menu hides the sidebar (.side width 0, feed left edge <= 8), aria-expanded
  flips, Tab from #menu never lands inside .side; reload keeps it hidden; with Storage get/set
  throwing the page loads without page errors and the toggle still works.
- [x] AC14: with empty storage the sidebar starts hidden at 900x500 and 1280x460 and shown at 1280x800.
- [x] AC15: at 390x640 the drawer starts closed; #menu opens it with its top at the header bottom
  (+-1); Escape closes it and focuses #menu; picking a topic closes it and shows that topic.
- [x] AC16: with the sidebar hidden, AC1/AC2 hold and #title shows the destination.
- [x] AC17 (non-vacuity): forcing #composerTargetRow visible fails AC10; removing `.posting` fails
  AC12; removing the persistence write fails AC13's reload step.
- [x] AC18: existing tests that clicked the visible chip use a helper that clicks #composerTargetChange
  (spec change, not a loosened test); no assertion is weakened. SPEC-002-064 gets an amendment note
  pointing here. English and Polish strings for every new label.
- [ ] AC19: docs (docs/guides/COMPOSER.md and README where relevant) and CHANGELOG updated; released
  as viewer 3.3.4 (the viewer shares canonical MAJOR.MINOR).

No VoiceOver/screen-reader checks (owner policy).

## Implementation notes (2026-10-23)

Tests: `tests/compact-layout.test.js` (AC1-AC17) with `h.layoutViolations`, plus the rewritten tests
listed in the feature commit. Decisions and deviations:

- **AC9 sizes.** With the compact header and topic bar, the old composer rules alone no longer
  overflow 1280x460 or 390x640 (measured). The test shows the composer-only mutation failing at
  320x360 and the old composer plus the old chrome (wrapping header, reserved status line, wrapping
  topic bar) failing at 700x420 and 390x640.
- **Composer cap at <=480 tall is 60dvh, not 55dvh.** The AC5 worst case at 320x360 needs ~206px for
  the pinned zones; 55dvh is 198px. The feed still keeps >= 60px (AC3).
- **#rstat** is visually hidden (kept in the DOM): its text is #reload's title, a dot on #reload shows
  on/paused above 600x640, and Tools repeats it as a status line.
- **Phones:** two header rows at <=600 wide; at <=600 wide and <=480 tall the header is one sideways
  scrolling strip (nine controls do not fit 320px in one row).
- **Recipients:** the popover gains "Send to..." for rooms, since #composerTo is hidden with the row.
  Recipients other than `all` count as "differs from the view" and show the row.
- **Resize re-clamp** (item 8) changes only the displayed `--composerh`; the saved height is kept.
- **#title** reads `# room › T003 Title` (no "·"), `# room`, or `✉ Peer › T002 Title`.
- **Topic "..." menu** stays open while a dialog opened from it runs, so focus returns to the item;
  Escape or an outside click closes it.
- Documentation screenshots in docs/images were not regenerated.

