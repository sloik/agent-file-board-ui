---
id: SPEC-002-072
title: Copy the board's fingerprint in the key review
status: done
parent: SPEC-002
type: feature
created: 2026-10-24
nfrs: []
devkb_required: [frontend.md]
amends: SPEC-002-071
---

## Problem

Owner (2026-10-24, viewer 3.3.7): "I expected to copy the fingerprint so I can paste it". The owner's
original request (SPEC-002-071) asked for a "copy the fingerprint" action and a "paste the fingerprint"
action. SPEC-002-071 deliberately offered only **Copy what to send them** (a shortened request), so the
full value had to be selected by hand.

## Design

1. The key card gets **Copy fingerprint** / **Kopiuj odcisk** (`#signingCopyFingerprint`, action
   `copy-fingerprint`): it copies the full fingerprint this board lists and says what to do with it: send it
   to the owner through a trusted channel, ask them to compare it with the one on their device, paste it in
   step 2 when they confirm.
2. The copied value counts as an echo (SPEC-002-071 echo guard): pasting it back matches, shows the warning
   "This is the value copied from this board. Approve only after NAME confirmed, outside this board, that it
   matches the fingerprint on their own device.", and Approve stays disabled until **I confirmed it with
   NAME outside this board** is ticked. The trust action keeps checking this itself.
3. Step 1 becomes "Check the fingerprint with them." and names both ways: copy the board's value for the
   owner to compare, or ask them to send theirs. **Copy what to send them** is unchanged.
4. Docs: docs/guides/signing.md describes both ways; the signing captures are regenerated.

## Acceptance criteria

- [x] AC1: `#signingCopyFingerprint` puts the exact board fingerprint on the clipboard and shows the
  instruction text.
- [x] AC2: pasting it gives a match with the echo warning, Approve disabled and no pin; ticking the
  confirmation enables Approve and approval pins exactly that fingerprint.
- [x] AC3: the review task offers exactly the two copy actions `copy-fingerprint` and `copy-request`;
  step texts in English and Polish (tests/guided-key-review.test.js AC1, rewritten for the new wording).
- [x] AC4: docs updated; released as viewer 3.3.8.

Non-vacuity: without the copied value being registered as an echo, AC2's warning check fails.
No VoiceOver/screen-reader checks (owner policy).
