---
id: SPEC-002-075
title: Unified dialog shell - wider panels, one size system, Close always top-right
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-24
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner (2026-10-24, viewer 3.3.9): "Message signing panel/modal (and general modals visible from tools)
should be displayed in a wider panel for better layout. Also it should be consistent for all tools. Same
for button placement (e.g. close sometimes is on bottom, sometimes on top). Unify this. The issue with not
enough space is most visible in key management (which has a nice UX and should not be altered now, it
just needs more space)."

Today there are 17 dialogs: in board.html (draftsDialog, guidanceDialog, locationsDialog,
notificationsDialog, presenceDialog, repairDialog, structuredDialog, upgradeDialog, vocabulary, settings)
and created by scripts (signingDialog, extensionsDialog, extensionDiagnosticsDialog, viewerUpdatesDialog,
voiceDialog, historyDialog, historyReviewDialog, historySettingsDialog). Two competing base rules set
`width:min(800px,…)` and `min(800px,92vw)`; signingDialog is 1040px; Close sits at the bottom in most
(#vocabularyClose, #presenceClose, …) and at the top in signingDialog.

## Design

1. **One dialog shell** (CSS classes, e.g. `.afb-dialog` with `.afb-dialog-head`, `.afb-dialog-body`,
   `.afb-dialog-foot`), applied to every dialog above. Remove the duplicated base `dialog{…}` width rules.
2. **Size tiers** (CSS custom properties, one place):
   - `wide` (default for every dialog opened from Tools, the header or the composer that shows a panel,
     list or form): `width:min(1200px, 100vw - 48px)`, `height:min(88dvh, 960px)` max, body scrolls.
   - `compact` (confirmations and small single-question dialogs only; the worker lists which, if any):
     `width:min(560px, 100vw - 32px)`.
   - Phone (≤ 600 px wide or ≤ 480 px tall): every dialog is a full-screen sheet (100dvw × 100dvh, no
     rounded outer corners), safe-area padding.
3. **Header** (sticky at the top of the dialog, never scrolls away): title on the left (the dialog's
   existing heading element, same text and id), optional short subtitle, and **Close** on the right as the
   last header item. Every dialog's existing Close button keeps its id and moves into the header; label
   stays "Close"/"Zamknij" (the i18n key it uses today). Settings' "Done" (#sClose) becomes the header Close
   (keep id; label "Close" consistent) unless Done saves something distinct; if it does, it stays a
   primary footer action and a header Close is added. Tabs/segmented controls (e.g. signing's four tasks)
   sit directly under the header, also sticky.
4. **Footer** (optional, sticky at the bottom): only dialog-specific actions (e.g. Save, Approve, Insert),
   right-aligned, primary action last. Never a Close button.
5. **Behaviour unchanged**: Esc closes (existing per-dialog Esc handling such as Keys' "fold detail first"
   stays), focus returns to the opener, inert background, scroll position handling. No dialog's content
   or flow changes; Keys (SPEC-002-073) keeps its UX and just gets the wider panel (its master/detail list
   column may grow; detail gets the rest).
6. Docs: docs/guides/PANELS.md notes the shared dialog layout (Close top-right, actions bottom-right,
   full screen on phones); refresh affected screenshots via the existing screenshot scripts.

## Acceptance criteria

- [ ] AC1: a test opens every dialog listed above from its real entry point (Tools item, header button,
  composer/other control) at 1280x800 and asserts: the dialog has the shell classes; its width equals the
  tier width (wide: min(1200, innerWidth-48) ±2; compact as listed); the header is at the dialog's top and
  stays there after scrolling the body; the Close button (existing id) is inside the header and is the
  right-most header control; no footer contains a Close; clicking Close closes the dialog and focus returns
  to the opener.
- [ ] AC2: same at 390x640: each dialog fills the viewport (full-screen sheet), header and Close visible,
  no horizontal scroll, layoutViolations zero.
- [ ] AC3: a single source of truth: no other CSS rule sets width/max-width on these dialogs (test scans the
  bundled CSS for `dialog`/`#…Dialog` width rules outside the shell); signingDialog's 1040px rule removed.
- [ ] AC4: Keys at 1280x800 has more room: the list column and detail together are wider than in 3.3.9
  (≥ 1100px of content width) with no other change to Keys' DOM or behaviour (existing key-management,
  guided-key-review, key-approval-visibility tests pass unchanged except geometry expectations that
  reflect the new width — rewritten, not loosened).
- [ ] AC5: Esc, focus return, and existing dialog-specific tests pass (tests that clicked a bottom Close
  still work via the same id).
- [ ] AC6: non-vacuity: an in-test mutation moving one dialog's Close back into its body/footer fails AC1;
  one restoring an 800px width rule fails AC1/AC3.
- [ ] AC7: visual: layout snapshots updated only where dialogs are open (justify each); Linux pixel
  baselines regenerated by the parent on CI; screenshots in docs refreshed where dialogs appear.
- [ ] AC8: docs and CHANGELOG; released as viewer 3.3.10.

No VoiceOver/screen-reader checks (owner policy).
