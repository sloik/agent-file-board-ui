---
id: SPEC-002-052
title: Make message signing states scannable with emoji and plain explanations
status: done
parent: SPEC-002
type: feature
created: 2026-10-22
nfrs: []
---

## Scope

Show compact emoji-and-text message signing badges. Hover explains each fact;
click/tap or keyboard expansion exposes the same information without hover.
Signature integrity, local approval, lifecycle and eligibility remain independent.
No policy, signature verification or trust decisions change.

## Acceptance Criteria

- [x] Each actual signing state has a readable label, emoji and plain explanation in English and Polish; verified bytes cannot imply approved, current or usable key.
- [x] Individual badges have native hover explanations. The disclosure remains keyboard/touch usable and contains the same explanations; emoji are decorative beside text.
- [x] Mobile badges wrap and warning states remain distinct. Unit/native browser tests cover independent states, real verification/approval and non-hover explanations without VoiceOver checks.
- [x] Update the illustrated guide, message screenshot and reviewed formal mappings; retain all required signing/model gates and integrate through a protected PR.

## Outcome

A single facts formatter supplies emoji/text badges, native per-badge hover
explanations and matching expanded descriptions in English and Polish. Keyboard
Enter/Space and mobile-sized click disclosure expose the same explanations.
Decorative emoji never replace labels. Valid signatures can visibly coexist with
unapproved, retired, compromised or blocked states without changing eligibility.

State-formatting units and native browser cases use actual signed messages,
local approval and real compromise evidence; the blocked message remains unable
to reply. Existing independent security assertions remain. Illustrated guide and
actual message capture were updated; offline demo illustration checks pass.
Bounded models remain unchanged, with reviewed display/test mappings and required
formal CI. Native tooltip rendering belongs to the browser; tests verify declared
title text and equivalent non-hover explanations, without OS tooltip pixel claims.
