---
id: SPEC-002-069
title: Key approval visibility - pending keys count, review list states, first-open notice, clearer sidebar toggle
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner (2026-10-23, viewer 3.3.4): "is there any UI indicating that there are keys that need to be
accepted?" then "add the missing ui to fill the gaps with signing; still I do not see any UI that
would allow me to toggle/show/hide rooms and threads sidebar visibility".

Today an unapproved key surfaces only when it blocks something: the composer status in a
signature-required room (`scripts/signing-help.js` `needs-approval`), a message's "Signing key not
approved by you" badge, or "Key changed - review needed". Gaps:

- G1. No global indicator. Nothing tells the user that N registered keys are not approved on this
  device.
- G2. The Signing dialog's "2. Review a participant key" select (`#signingParticipant`) lists all
  participants without their state; the user has to pick each one to find out.
- G3. A newly registered key (for example, the owner's own key or an agent's key) stays invisible
  until a signed message arrives or a required room blocks posting.
- G4. The sidebar toggle `#menu` (SPEC-002-068) uses the hamburger glyph, which reads as "menu",
  not "sidebar"; the owner did not recognise it.

The state already exists: `B.signingParticipants[id]` =
`{unregistered} | {fingerprint, trusted, changed, revoked} | {error}` (board.html ~7365), and
`signingParticipantSummary(id)` in `scripts/signing-ui.js` turns it into text.

## Design

Definitions: a participant **needs review** when it has a current `fingerprint`, is not `revoked`,
and is not `trusted` (this includes `changed`). Revoked, unregistered and error states never count.
The count is per board and per device, exactly as approvals are; nothing is written to the board.

1. **Count (G1).** One pure helper `signingPendingReview(model)` returns the ids that need review,
   changed keys first, then by display name. Its length drives:
   - a small badge "🔑 N" on `#signingTools` (the Tools entry) with the label
     "N keys to review" / "N kluczy do sprawdzenia" (Polish plural forms: 1 klucz, 2-4 klucze,
     5+ kluczy);
   - a dot on `#toolbarToolsToggle` when N > 0, with its title naming the count, so the closed
     Tools menu shows it. It must not change the header height or wrap it (SPEC-002-068 AC7).
   Both disappear at N = 0 and update after approve, remove, refresh and board switch.
2. **Review list states (G2).** Each `#signingParticipant` option shows its state after the name:
   "- needs review", "- key changed", "- approved", "- no key", "- revoked" (Polish equivalents),
   from the same data as `signingParticipantSummary`. Options that need review come first. When the
   dialog opens on the review task with no participant requested, the first participant needing
   review is preselected. A one-line summary above the select says "N keys need review" or
   "All registered keys are approved on this device".
3. **First-open notice (G3).** When a board loads with N > 0 and the set of pending
   (participant, fingerprint) pairs differs from the set last dismissed for this board, show one
   dismissible notice line in the existing notice area (not a modal): "2 participant keys are not
   approved on this device. Review keys" with a button opening the Signing review task, and a
   "Not now" dismiss. The dismissal is stored per board in `localStorage` (try/catch, as
   `afb.sidebar`), keyed by the board identity and the sorted pending pairs, so a new or changed
   key shows the notice again. With storage throwing, the notice shows and dismisses for the
   session without page errors. Approving does not need a dismissal: the notice disappears when
   N reaches 0.
4. **Sidebar toggle (G4).** Owner, after reloading 3.3.4: still "I do not see any UI" for it. The
   control exists (`#menu`, 33x34 at the top-left, "≡" glyph) but is not recognisable. Fix:
   - a hide control inside the sidebar itself: a small "«" button (`#sideHide`, label "Hide
     sidebar" / "Ukryj panel boczny", tooltip with the shortcut) at the right end of the
     "ROOMS AND THREADS" heading row; it toggles exactly like `#menu`, persists the same way, and
     focus moves to `#menu` after hiding;
   - `#menu` gets a sidebar glyph (an inline SVG of a panel with a left
   column; the left column filled when the sidebar is shown, outlined when hidden) instead of
   the hamburger, keeping the ID, aria-controls, aria-expanded, label, tooltip with the shortcut,
   and the Tools entry `#sidebarToggleTool`. At widths >= 1100 the button also shows the visible
   text "Rooms" / "Pokoje" next to the glyph if the header stays one line (SPEC-002-068 AC7);
   otherwise glyph only.
   - the README/PANELS docs name both controls and the shortcut.
4b. **Hover peek** (owner, 2026-10-23: "when toggled can we make it appear on hover so I can switch
   between without needing to click on it?"). When the sidebar is hidden by the user at >820px wide,
   on devices with a fine pointer that can hover (`@media (hover:hover) and (pointer:fine)`):
   - a thin invisible hot zone (about 8px) along the left edge of the page below the header, and
     hovering #menu, open the sidebar as an overlay ("peek") over the feed after ~150ms of hover (no
     layout shift: the feed does not move or reflow; the overlay has a shadow, top at var(--top-h),
     full height below the header, current --sidew width);
   - the peek stays open while the pointer is over it or #menu, and closes ~300ms after the pointer
     leaves both; clicking a room/topic/DM navigates and the peek stays open until the pointer leaves
     (so the user can switch several times), Escape closes it;
   - peek never changes the saved state (localStorage['afb.sidebar'] stays "hidden"), never changes
     #menu aria-expanded, and is not keyboard-triggered (keyboard users use #menu / Ctrl/Cmd+B).
     Pinning is still a click on #menu or the shortcut; inside the peek, the « button becomes a pin
     button ("Keep sidebar open" / "Przypnij panel boczny") that shows the sidebar normally and
     saves "shown";
   - no peek on touch devices, at <=820px (drawer stays as is), or while a dialog/menu is open; the
     hot zone must not block clicks or text selection in the feed beyond its 8px strip and must not
     cause horizontal scroll;
   - the exactly-one `.posting` highlight is visible in the peek.
5. Help: `docs/guides/signing.md` gets a short "Keys waiting for approval" paragraph; the README
   feature list mentions the badge; CHANGELOG; release as viewer 3.3.5.

Out of scope: approving without the fingerprint comparison (approval stays a deliberate step with
the pasted fingerprint), any write to the board, showing the user's real key folder (a browser
file picker does not reveal paths).

## Acceptance criteria (Playwright)

- [ ] AC1: board with three registered participants, none approved: `#signingTools` badge reads 3,
  the Tools toggle has the dot and a title naming 3; after approving one key through the existing
  review flow it reads 2; after approving all, badge and dot are absent. English and Polish,
  including Polish plurals for 1, 2 and 5.
- [ ] AC2: revoked, unregistered and error participants are not counted; a changed key is counted
  and sorted first.
- [ ] AC3: `#signingParticipant` options carry the state text; needs-review options come first; the
  review task opened from the badge preselects the first needing review; the summary line matches.
- [ ] AC4: first-open notice appears with N > 0, "Review keys" opens the review task with the first
  pending participant selected, "Not now" hides it and it stays hidden after reload; registering a
  new key (or changing one) shows it again; with Storage get/set throwing the page loads without
  page errors and the notice still dismisses.
- [ ] AC5: with N = 0 there is no badge, dot or notice (non-vacuity: a test-only mutation that makes
  `signingPendingReview` return [] fails AC1, and one that skips the dismissal write fails AC4's
  reload step).
- [ ] AC6: `#menu` contains the sidebar SVG, not the hamburger character; aria-expanded and the
  glyph's filled/outlined state flip together; "Rooms" text visible at 1280x800 and the header
  stays one line (`.top` height <= 52, as SPEC-002-068 AC7); at 900x500 and 390x640 glyph only.
- [ ] AC6b: `#sideHide` is visible (bounding box inside the sidebar heading row) whenever the sidebar
  is shown at >820px and in the phone drawer; clicking it hides the sidebar, sets `#menu`
  aria-expanded=false, focuses `#menu`, and the hidden state survives reload; `#menu` shows it
  again.
- [ ] AC6c: at 1280x800 with the sidebar hidden: hovering the left-edge zone for 200ms shows .side as
  an overlay (bounding box width ≈ --sidew, feed left edge unchanged, page scrollWidth <= innerWidth);
  moving into it and clicking another topic navigates and it stays open; moving the pointer to the
  feed center closes it within 600ms; reload: still hidden, localStorage unchanged, #menu
  aria-expanded=false throughout; with a touch/no-hover context (Playwright hasTouch + isMobile or
  emulated media) hovering does nothing; the pin button shows it persistently and saves "shown".
  Non-vacuity: disabling the peek handler (in-test mutation) fails the first step. SPEC-002-068
  layout tests stay green.
- [ ] AC7: SPEC-002-068 layout tests (tests/compact-layout.test.js) still pass unchanged, with the
  badge and the notice present at 320x360.
- [ ] AC8: docs, CHANGELOG, released as viewer 3.3.5.

No VoiceOver/screen-reader checks (owner policy).
