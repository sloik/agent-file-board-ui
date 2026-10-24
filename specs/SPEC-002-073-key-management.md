---
id: SPEC-002-073
title: Key management - a Keys list with statuses, detail, approve, remove approval, CLI commands
status: done
parent: SPEC-002
type: feature
created: 2026-10-24
nfrs: []
devkb_required: [frontend.md]
amends: SPEC-002-069, SPEC-002-071, SPEC-002-072
---

## Problem

Owner (2026-10-24, viewer 3.3.8): "we could use some better UI for key management (list of keys,
statuses, approve, unapprove etc); run agent teams with personas for best ui/ux; implement it; update
documentation".

Today **Tools → Signing → Review a key** is a `<select>` of participants, one key card and the guided
4-step approval, inside a long dialog whose first screen on a phone is the "Check messages" explainer.
There is no overview of whose keys are fine and whose need attention; actions ("Remove my approval",
"Refresh key details") sit away from the key they affect; revoked, changed and missing keys are not
explained next to the key; nothing says what to do on the command line; the per-browser scope of an
approval is easy to miss.

## Design review (2026-10-24)

Four persona reviews (read-only agents, not committed): a non-expert board owner, a security engineer,
an admin-UI product designer, an agent operator using `boardctl`. Consensus:
- a **Keys** list replaces the select; attention first; plain-language statuses with icon + label;
- one deliberate approval ceremony (the SPEC-002-071/072 guided steps), never a one-click or bulk approve;
- **Key changed** is the loudest non-revoked state and shows old vs new fingerprint;
- revoked keys get no Approve control; revocation, rotation and registration stay CLI-only, shown as
  copyable `boardctl` commands;
- "approved on this browser, for this board folder" is said on the list and on every row; the CLI keeps
  its own approvals;
- remove approval: inline confirm with its consequence, plus a session-only Undo.

## Design

### 1. Where it lives
- The Signing dialog tabs become: **Check messages / Keys / Sign as me / How signing works**. **Keys**
  replaces "Review a key" (same task id where tests/entry points use it; `signingOpenTask("review", …)`
  opens Keys). The Why / Stored / Safe-to-share block moves to **How signing works**; Keys keeps one line
  under its header: "Approvals live only in this browser, for this board folder. The command line
  (boardctl) keeps its own."
- Entry points open Keys: Tools **Review keys (N)** and the key notice's **Review keys** (filter "Needs
  attention", first such row selected); a message's signing badge "key not approved / key changed"
  (that sender's row selected, detail open); the composer status "Approve the key" (own row). The
  Participants dialog gets a small key-status chip per person that opens Keys on that row.

### 2. The list (`#signingKeys`, role listbox, one `[data-key-row="<id>"]` per registered or known participant)
- Row: avatar/colour as in Participants, name, id (always shown next to the name), role chip
  (human/agent, from participants.json), a status badge (icon + text, never colour alone), the short
  fingerprint (first 6 + last 6 after the prefix, monospace; full value in `title`), "This browser"
  state (Approved / A different key approved / Not approved / —), one primary action.
- Groups in this order, alphabetical within: Key changed, Needs review, Can't load key, Revoked, No key,
  Approved, You (own row may appear in any group but carries a "You" chip; put it where its state
  belongs). Light group headers like the sidebar's. The list is not re-sorted while the dialog is open
  after an action (no jumping rows); it re-sorts on refresh/reopen.
- Filter chips with counts: All, Needs attention (changed + needs review + can't load), Approved,
  No key, Revoked; zero-count chips dimmed. Search field only when there are 8 or more participants
  (matches name and id).
- Summary line above the list, counting the same set and total as the "Needs attention" and "All" chips:
  "3 of 8 need your attention · 2 approved on this browser" or "All keys reviewed · 3 approved on this browser"
  (no green all-good while any key is changed or revoked). (Amended 2026-10-24 after review: it first counted
  only keys needing review out of registered keys, which disagreed with the chip.) The badge and notice count
  (SPEC-002-069, keys needing review) is unchanged.

### 3. Statuses (labels EN/PL, tokens from existing theme variables, all three themes)
| State | Badge | Primary action |
|---|---|---|
| changed (pin ≠ current) | ⚠ **Key changed** (danger, filled) | **Review again** |
| needs review | ● **Needs review** (warn) | **Review** |
| error | ⚠ **Can't load key** (neutral) | **Retry** (Refresh key details) |
| revoked retired | ⛔ **Revoked (retired)** (danger, outlined) | none: "Do not use" |
| revoked compromised | ⛔ **Revoked (compromised)** (danger, filled, stronger than retired) | none |
| unregistered | ○ **No key** (muted) | none: "Their messages show as unsigned" |
| approved | ✓ **Approved on this browser** (success) | quiet **Details** |
| own | additional **You** chip | per state; own approved row offers **Show my fingerprint** (→ Sign as me) |

Invariants: a changed key never shows success styling; a revoked key never shows an Approve control;
there is no bulk approve anywhere.

### 4. Detail (`#signingKeyDetail`; wide ≥ 900px: master/detail side by side; narrower: the selected row
expands as an accordion, one open at a time; at 390/320 the list is full width, rows stack, action buttons
≥ 40px, chips scroll horizontally, no page horizontal scroll)
- Header: name (id), role, status badge, "This browser" state, profile "as of" time of the last read and
  **Refresh key details** (label notes "No approval changed").
- Full fingerprint in groups of 4 with **Copy fingerprint** (SPEC-002-072, copied value stays an echo).
- **Key changed**: old (approved) and new fingerprint side by side with the first differing group marked
  (reuse signingFingerprintNode), plus "Ask NAME, outside this board, whether they replaced their key. A
  replacement and a swapped key look the same until they confirm." The approve button reads **Approve
  replacement key**.
- **Lineage** when the board has more than one profile for the participant: "Replaced …old short… →
  current" (from the resolver chain); revocation card with status and reason if present.
- The guided approval (SPEC-002-071 steps 1-4, SPEC-002-072 copy, echo guard, own-key check) lives here,
  unchanged in behaviour; for an approved key the steps collapse to "Approved on this browser" with
  **Remove my approval**.
- **Remove my approval**: inline confirm "Remove? Messages from NAME will show as not approved here
  [and rooms that require approved signatures will refuse them]. Removing approval does not revoke their
  key." [Remove] [Keep]. Own key: additionally warns that your own posts in required rooms will be
  blocked. After removal: a status line "Approval removed — NAME now needs review" with **Undo**, valid
  only in this dialog session and only for that exact fingerprint (re-pins without the paste ceremony);
  otherwise a full review.
- **Required in**: the rooms/threads (and board-wide) where approved signatures are required, from the
  existing policy (`context.minimum` and `config.message_signing`); omit when none. Warn when the board
  has no UUID (requirements cannot apply).
- **Command line** disclosure per state, with the participant id, board path placeholder `<board>`, and
  known profile hash filled in; commands must exist in the pinned canonical CLI (verify against
  vendor/agent-file-board/signing_commands.py; test parses it):
  - no key: `boardctl signing keygen --path <board> --participant ID`, then `boardctl signing profile ...`
    and `boardctl identity import ...` (as the canonical guide documents; confirm exact flags);
  - approve in the CLI: `boardctl identity inspect ID --path <board>` then `boardctl signing trust --path
    <board> --participant ID --fingerprint FP --profile HASH`; remove: `boardctl signing untrust ...`;
  - rotate and revoke: point to the canonical guide section with `signing transition/update/revoke`
    (with `--expect-profile HASH` filled in) and say they need the private key file;
  - check: `boardctl signing check --path <board> --from ID --scope rooms/<room>`.
  No buttons that write to the board.

### 5. Data
Keep from `context.resolve(id)`: `chain` (fingerprints in order), `head.digest`, `revoked` status and
reason, alongside the existing `{fingerprint, trusted, changed, revoked, error}`; derive "Required in"
from the existing policy API. No new board data, no pin schema change (no "approved at" dates).

### 6. Keyboard
Filter chips (arrow keys), search, list (roving tabindex; Up/Down, Home/End; Enter opens/expands), detail.
Esc closes an open detail/accordion before the dialog. After Approve, focus moves to the next row needing
attention; after Remove, focus stays on the row. Existing focus ring. No new global shortcuts.

### 7. Docs
`docs/guides/signing.md` gets a "Managing keys" section with screenshots (list wide, detail with guided
steps, key changed with old/new, revoked, phone), a status table, and the CLI parity table; README and
docs/FEATURES.md mention the Keys list. Screenshots from `scripts/screenshot_signing.js` (seeded).

## Acceptance criteria

- [x] AC1: Keys tab replaces Review a key; the select is gone; every registered/known participant has one
  row with name, id, role, status badge (icon + text), short fingerprint, This-browser state and the
  per-state primary action from the table; English and Polish.
- [x] AC2: grouping/order and filter chips with counts are correct for a fixture with one participant in
  each state (changed, needs review, error, revoked retired, revoked compromised, no key, approved, own);
  search appears only with 8+ participants and filters by name/id; rows do not move after an action
  until reopen.
- [x] AC3: invariants as tests: changed never has success styling; revoked has no Approve control in row
  or detail; no control approves more than one key; Approve still requires the SPEC-002-071 comparison
  (and echo confirmation when applicable).
- [x] AC4: detail per state: changed shows old and new with the first differing group marked and "Approve
  replacement key"; revoked shows status/reason and no approval; lineage line when the chain has 2+
  profiles; Required in lists the policy scopes (and the no-UUID warning when applicable).
- [x] AC5: Remove my approval: inline confirm text with the consequence (own-key variant warns about own
  posts); after removal the row shows Needs review; Undo within the same dialog session restores the
  exact pin; after reopening the dialog no Undo is offered.
- [x] AC6: entry points: Tools Review keys and the key notice open Keys filtered to Needs attention with
  the first row selected; a message badge opens that sender's row; composer "Approve the key" opens the
  own row; Participants chip opens that person's row.
- [x] AC7: Command line disclosure shows commands that exist in the pinned canonical CLI with the right
  flags (test parses signing_commands.py / identity commands), filled with the participant and known hash.
- [x] AC8: layouts: zero layoutViolations at 1280x800, 900x500, 390x640, 320x360 with the 8-state
  fixture; master/detail at ≥ 900, accordion below; no horizontal scroll; tests/visual scenes updated
  (signing-review → keys-list, keys-detail, keys-changed, keys-phone; Linux pixels regenerated by the
  parent on CI).
- [x] AC9: keyboard flow per Design 6.
- [x] AC10: existing signing behaviour unchanged (pins, counts, composer status, notices, SPEC-002-069/071/
  072 tests pass; tests that used the select are rewritten through a helper that selects a row — spec
  change, not loosened).
- [x] AC11: non-vacuity: in-test mutations (an Approve button rendered on a revoked row; success styling on
  a changed row; Undo allowed after reopen) make AC3/AC5 fail.
- [x] AC12: docs per Design 7 with screenshots; CHANGELOG; released as viewer 3.3.9.

No VoiceOver/screen-reader checks (owner policy).

## Implementation notes (2026-10-24, viewer 3.3.9)

- `scripts/signing-ui.js`: DOM-free status helpers (`signingKeyState`, `signingKeyBadge`, `signingKeyAction`,
  `signingKeyBrowser`, `signingKeyOrder`, `signingPendingSummary`, `signingParticipantFacts`, `signingKeyCommands`,
  `signingUndoFor`) and the Keys section of the Signing dialog: one `#signingKeyDetail` node holds the unchanged
  guided approval and moves beside the list (`min-width: 900px`) or under the selected row. The section keeps the id
  `signing-review` and the task id `review`. Choosing a row resets the review exactly as the participant select did.
- Approve and remove-trust writes are unchanged; remove-trust (`[data-action="remove-trust"]`) is the confirmation's
  Remove, revealed by `[data-action="remove-trust-ask"]`. Undo (`undo-remove`) re-pins only the exact removed
  fingerprint with Approve's resolve/unrevoked/`signingFresh` guards, keyed by a per-open dialog session.
- Row actions carry `data-key-action` (review, retry, details, mine), never `data-action`, so no row control
  approves. The Participants dialog shows `signingKeyChipHtml`; a verified message from a key not approved here has
  `Review NAME's key` in its signing details.
- Fixture: `tests/lib/signing-fixture.js` `keys()` adds five participants with canonical join, profile, import and
  revoke, and removes one profile file for the can't-load state; `rotate(participant)` rotates any participant.
- Tests: `tests/key-management.test.js` (AC1-AC9, AC11); select-based tests rewritten through
  `selectKey`/`selectedKey`/`keyRows` in `tests/lib/signing-browser.js`; the chip row is excluded from per-element
  overflow checks because it scrolls by design (the row itself must fit).
- Visual: scene `signing-review` became `keys-list`; new `keys-detail`, `keys-changed`, `keys-phone`; landmarks
  swap `#signingParticipant` for `#signingKeys` and `#signingKeyDetail`. Linux pixel baselines for the four keys
  scenes and `signing-review-match`/`-mismatch` are generated on CI.
- The dialog is 1040px wide (was 880px) for the side-by-side layout; the task buttons are labelled when the dialog
  opens, like the other dialog text.

