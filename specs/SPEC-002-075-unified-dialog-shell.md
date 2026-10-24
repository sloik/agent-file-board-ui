---
id: SPEC-002-075
title: Unified dialog shell - wider panels, one size system, Close always top-right
status: done
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

- [x] AC1: a test opens every dialog listed above from its real entry point (Tools item, header button,
  composer/other control) at 1280x800 and asserts: the dialog has the shell classes; its width equals the
  tier width (wide: min(1200, innerWidth-48) ±2; compact as listed); the header is at the dialog's top and
  stays there after scrolling the body; the Close button (existing id) is inside the header and is the
  right-most header control; no footer contains a Close; clicking Close closes the dialog and focus returns
  to the opener.
- [x] AC2: same at 390x640: each dialog fills the viewport (full-screen sheet), header and Close visible,
  no horizontal scroll, layoutViolations zero.
- [x] AC3: a single source of truth: no other CSS rule sets width/max-width on these dialogs (test scans the
  bundled CSS for `dialog`/`#…Dialog` width rules outside the shell); signingDialog's 1040px rule removed.
- [x] AC4: Keys at 1280x800 has more room: the list column and detail together are wider than in 3.3.9
  (≥ 1100px of content width) with no other change to Keys' DOM or behaviour (existing key-management,
  guided-key-review, key-approval-visibility tests pass unchanged except geometry expectations that
  reflect the new width — rewritten, not loosened).
- [x] AC5: Esc, focus return, and existing dialog-specific tests pass (tests that clicked a bottom Close
  still work via the same id).
- [x] AC6: non-vacuity: an in-test mutation moving one dialog's Close back into its body/footer fails AC1;
  one restoring an 800px width rule fails AC1/AC3.
- [x] AC7: visual: layout snapshots updated only where dialogs are open (justify each); Linux pixel
  baselines regenerated by the parent on CI; screenshots in docs refreshed where dialogs appear.
- [x] AC8: docs and CHANGELOG; released as viewer 3.3.10.

No VoiceOver/screen-reader checks (owner policy).

## Amendment (2026-10-24): Settings is a popover, not a dialog

Design item 3 assumed Settings is a dialog whose Done (`#sClose`) could become the header Close. Settings is a
non-modal, user-resizable popover beside the board (no backdrop; theme and text-size changes preview live; saved
width and resize handle). It stays a popover: no wide tier, no modal. It applies the shell's head/foot classes and
rule instead: one header Close top-right, footer with only Send feedback and Reset to defaults.

It already had a header Close (`#settingsClose`), and one button cannot carry both ids. `#sClose` is kept because
the spec names it and it has the most references (38). Done saved nothing, so it becomes the single header Close:
label Close/Zamknij (`vocabulary_close`), focus returns to `#gear`. `#settingsClose` is removed and its 12
references are retargeted. The retargets change selectors only; no assertion is loosened. Approved by the lead on
2026-10-24.

## Implementation notes (2026-10-24, viewer 3.3.10)

Dialog inventory (17 `<dialog>`s plus Settings), with tier and the entry point the tests use:

| Dialog | Tier | Entry point | Close (id) | Footer |
| --- | --- | --- | --- | --- |
| `vocabulary` | wide | Tools → Vocabulary | `vocabularyClose` | - |
| `presenceDialog` | wide | Tools → Participants | `presenceClose` | - |
| `draftsDialog` | wide | Tools → Saved drafts | `draftsClose` | - |
| `extensionsDialog` | wide | Tools → Extensions | `extensionsClose` (new id; moved into the header) | - |
| `extensionDiagnosticsDialog` | wide | Extensions → Diagnostics (also a component's Diagnostics) | `extensionDiagnosticsClose` (new id; moved from the control row) | - |
| `voiceDialog` | wide | Tools → Voice input | `voiceClose` (moved from the action row) | Start, Stop, Cancel capture, Insert into draft, Install language pack |
| `viewerUpdatesDialog` | wide | Tools → Viewer updates (or the update notice) | `viewerUpdatesClose` (moved from the bottom) | Reload installed viewer |
| `signingDialog` | wide | Tools → Signing (Review keys, key notice, composer, messages) | `signingClose` (new id) | - |
| `upgradeDialog` | wide | header version line (`#verbar`; Tools → version line below 1100px) or the warning banner | `upgradeClose` | - |
| `structuredDialog` | wide | header Structured message (Tools below 1100px) | `structuredClose` | - |
| `notificationsDialog` | wide | header Notifications (Tools below 1100px), room menu | `notificationsClose` | - |
| `locationsDialog` | wide | folder name in the header | `locationsClose` | - |
| `repairDialog` | wide | topic menu → Message repairs | `repairClose` | - |
| `guidanceDialog` | wide | topic menu → Guidance | `guidanceClose` | - |
| `historyDialog` | wide | topic menu → Missing-message check | `historyClose` (new id) | - |
| `historySettingsDialog` | wide | sidebar room menu → Room history and signing | `historySettingsClose` (new id) | Review change… |
| `historyReviewDialog` | compact | Room history and signing → Review change… | `historyReviewClose` (new; answers "no") | Cancel, Write config.json |
| Settings (`#settings`, popover) | own resizable width | gear | `sClose` (was Done; now the header Close) | Send feedback, Reset to defaults |

- CSS: one shell block in board.html (`dialog.afb-dialog`, `.afb-dialog-head`, `.afb-dialog-foot`, tokens
  `--dialog-wide-w`, `--dialog-wide-h`, `--dialog-compact-w` on `:root`, phone sheet media query). The base
  `dialog{}` rule keeps colours only; every per-dialog width/max-height rule and the two inline widths are gone.
  The dialog element stays the scroll container (header and footer are sticky inside it), so existing code that
  saves and restores `dialog.scrollTop` (Room history, Signing task jumps, Keys' sticky detail) is unchanged.
  Keys' sticky detail height follows `--dialog-max-h` instead of the old fixed 80vh.
- Footers are used only where a dialog's own actions already sat at its end; dialogs whose actions sit between
  content (structured message, repairs, upgrade, notifications, diagnostics' preview controls) keep them in place,
  since item 5 forbids content and flow changes.
- Settings (decision 2026-10-24, communicated to the lead with alternatives): not a `<dialog>` but a non-modal,
  resizable popover beside the board (live preview of theme and text size, saved width). It keeps that behaviour
  and width system; Done saved nothing, so `#sClose` became the single header Close (label Close/Zamknij via
  `vocabulary_close`, returns focus to the gear) and the former header Close `#settingsClose` was removed
  (12 test selectors retargeted). The dead `s_done` strings were removed.
- Focus fixes needed for AC1: the sidebar room menu now restores focus to the room's menu button before opening
  Room history and signing; after the config.json review closes, focus returns to Review change… (it was disabled
  while the review was open, so focus had fallen to the page).
- Tests: `tests/dialog-shell.test.js` (AC1-AC6, Settings). Layout snapshots changed only for the six scenes with
  the signing dialog open; their Linux pixel baselines are regenerated on CI. Doc captures with a dialog open
  were refreshed; `scripts/screenshot_signing.js` lifts the 960px height cap for its tall capture viewports.

