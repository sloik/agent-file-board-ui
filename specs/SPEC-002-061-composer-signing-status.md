---
id: SPEC-002-061
title: Composer signing status and unlocking keys from the composer
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner report (2026-10-23): unlocking a signing key "is still tripping me and is
cumbersome to use". Specifically:

1. When a key must be unlocked to post, the composer says nothing until a send is
   refused. The composer must show it before sending.
2. The composer does not show what will happen to the message about to be posted
   (signed as whom, unsigned, or refused).
3. In the Signing dialog it is not clear that unlocking needs two things: a private
   key file and the persona to sign as.
4. Unlocking is only possible inside the Signing dialog. The owner wants to unlock
   from the composer, for the persona already selected, with a padlock emoji that
   shows the state at a glance.

## Decision: the signer is the selected persona (owner, 2026-10-23)

Until now the signer (`signingAs`) was chosen separately from the "I am" persona
(`#me`), and changing persona never changed the signer. The owner chose
"Signer = persona": in signed mode a message is always signed as the persona selected
in "I am". This removes the separate "Choose who to sign as" step and the copy
"Your viewing identity is separate". Safety properties that stay:

- never sign as anyone other than the persona selected at the moment of sending;
- never fall back to unsigned where signing is required or signed mode is on;
- switching to a persona whose key is not unlocked shows a locked padlock and
  blocks signed posting until that persona's key is unlocked;
- a key file that belongs to a different participant unlocks nothing silently for
  the current persona: the composer names whose key it is and offers to switch persona.

## Composer signing status (contract)

One pure function, `signingComposerStatus(s)` in `scripts/signing-help.js`, decides
the composer state. It takes the same inputs as `signingDiagnose` plus `persona`
(the `#me` value) and returns `{id, emoji, label, detail, action, tone}`, where
`action` is `null` or `{kind, label}` with `kind` in `unlock` (open the key-file
picker for the persona), `approve` (review this persona's key), `open-folder`, or
`howto`. States, in precedence order, with the padlock emoji shown in the composer:

| id | emoji | meaning |
|----|-------|---------|
| `unavailable` | ❗ | signing evidence or private state unavailable (board UUID, another tab, error) |
| `no-persona` | 👤 | no persona is chosen in "I am"; choose one first |
| `read-only` | ⛔ | signing needed but the folder is read-only |
| `not-registered` | ❔ | the persona has no registered signing key; ask the owner to register it |
| `key-revoked` | 🚫 | the persona's key was revoked or retired |
| `key-rotated` | 🔄 | the persona's key was replaced since it was unlocked; unlock the new key |
| `needs-unlock` | 🔒 | signing needed (required here or signed mode on) and the persona's key is locked |
| `key-changed` | ⚠️ | required destination; you approved an earlier key and the board now lists another; verify before approving |
| `needs-approval` | 🔑 | key unlocked, required destination, and you have not approved your own key on this device yet |
| `signed` | 🔏 | the message will be signed as the persona |
| `unsigned` | 📝 | the message will be posted unsigned and this destination allows it (if the key is unlocked, "Turn signing on") |

Action kinds: `unlock`, `approve` (always opens the fingerprint review, never approves in one click),
`open-folder`, `howto`, `open` (a Signing task), `persona` (focus "I am"), `sign` (turn signing on),
`lock`; `alt` offers `unsigned` ("Post unsigned instead", only where not required) or `persona`
("Not yours? Choose another persona"). Each state has its own emoji (persona review, 2026-10-23).

The composer renders the state next to Send, always visible (not only after a
refused send), with text and emoji together. Its action button performs the step.

## Acceptance criteria

- [ ] AC1 (status before sending): the composer shows the signing status of the
  message about to be posted at all times on native boards with signing context,
  computed by `signingComposerStatus`, and recomputed when the persona, destination
  (room, topic, new room, recipient), unlock, lock, key expiry, board refresh or
  approval changes. It re-renders only when its content changes (focus is kept).
  Expiry after 15 minutes is reflected within the existing 30-second tick and is
  always rechecked at send time.
- [ ] AC2 (unlock from the composer): when the state is `needs-unlock`, the action
  "🔒 Unlock <persona>'s key" opens a key-file picker directly. A key that matches
  the persona unlocks and binds the signer to the persona in one step (no second
  "choose who to sign as" step). A key for another participant reports whose key it
  is and offers "Switch persona to <name>"; it never changes the persona or signer
  silently. Invalid files report a clear error and change nothing. Read-only boards
  explain why the action is unavailable.
- [ ] AC3 (signer = persona): in signed mode the message author and signer are the
  persona selected at send time. Switching persona re-derives the status; posting is
  refused (draft kept, no unsigned fallback) when the new persona's key is locked.
  Existing guards (draft stamp, epoch, board change, writer guard) stay.
- [ ] AC4 (clear dialog): the Signing dialog's "Sign as me" task presents numbered
  steps: 1. choose the persona (defaults to the selected "I am" persona; changing it
  changes "I am"), 2. choose that persona's private key file, 3. unlock. It states
  the key file stays in this tab and that unlocking needs both. The old
  "Choose who to sign as" select and the "viewing identity is separate" copy are
  replaced.
- [ ] AC5 (tests): unit tests cover every `signingComposerStatus` state and its
  precedence; browser tests cover composer unlock for the persona, wrong-persona key,
  invalid key, persona switch to a locked persona, expiry, lock, approval needed,
  read-only, both languages and phone width without horizontal overflow. Tests that
  encoded "viewing identity never chooses the signer" are rewritten on purpose to the
  new rule; no assertion is loosened.
- [ ] AC6 (formal): a new TLA+ model `formal/ComposerSigning.tla` covers persona
  selection, destination change, composer unlock (matching or other key), lock,
  expiry, approval and send, with invariants: a post is signed only as the persona
  selected at send time; no unsigned post where signing is required or signed mode
  is on; the shown status equals the status function after every action (send
  rechecks after expiry). Bad variants (signer sticks to old persona, unsigned
  fallback, stale ready status after expiry, other-participant key binds) fail TLC,
  a reachability config shows every status is reachable, and a production trace
  collector checks the real status function and send guard against the model with
  mutants that turn it red. Registered in suite, trace contracts, alignment,
  verification, STATUS and README; `Signer.tla` and the provider are unchanged.
- [ ] AC7 (docs and release): user guides and the canonical signing guide describe
  the composer status and unlock flow; changelog; released as viewer 3.2.2 with the
  usual release pipeline verification.
