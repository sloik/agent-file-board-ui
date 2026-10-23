---
id: SPEC-002-065
title: Composer offers signing on optional destinations even without an unlockable key
status: done
parent: SPEC-002-061
type: fix
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner report (2026-10-23, after viewer 3.3.1): on a destination that does not require
signatures the composer shows "📝 Will post unsigned — This destination does not require
signatures." with no control at all whenever the persona's key cannot be unlocked here (no
registered key, revoked key, read-only folder or no persona). Clicking the row does nothing,
so there is no way to say "I want this message signed" and learn what is missing.

## Decision

The `unsigned` status always offers a step towards signing:

| Situation | Action |
|---|---|
| Persona key unlocked, signing off | 🔏 Turn signing on (unchanged) |
| Persona key registered and locked | 🔒 Unlock <name>'s key to sign (unchanged) |
| Anything else (no registered key, revoked, read-only, no persona) | **🔏 Sign this message** (new, kind `sign`) |

"Sign this message" turns signed mode on. The status function then returns the state that
names the missing step (`not-registered` → How to get a key, `key-revoked`, `read-only` →
Open the writable folder, `no-persona` → Choose persona), each with "Post unsigned instead"
to go back. Send follows the status as before: nothing is ever posted unsigned while signed
mode is on, and nothing new is signed without an unlocked persona key.

## Acceptance criteria

- [x] AC1: `signingComposerStatus` returns action `sign` ("Sign this message" /
  "Podpisz tę wiadomość") for `unsigned` when the persona key cannot be unlocked; unit tests
  cover no registered key, read-only, revoked and no persona, and that signed mode then shows
  `not-registered` / `read-only` / `key-revoked` / `no-persona` with the `unsigned` alt.
- [x] AC2: Browser tests: an unregistered persona and a read-only upload click
  "🔏 Sign this message", see the missing step, and return with "Post unsigned instead".
  Assertions that encoded "no action" are rewritten on purpose to the new rule.
- [x] AC3: The read-only note ("Unlocking a key is unavailable…") still shows next to the
  new action. No change to `ComposerSigning.tla`: `ChooseSigned` already allows signed mode
  from any unsigned state; the alignment pin is reviewed and repinned.
- [x] AC4: Guide table and CHANGELOG updated; released as viewer 3.3.2.
