---
id: SPEC-002-052
title: Make message signing states scannable with emoji and plain explanations
status: in_progress
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

- [ ] Each actual signing state has a readable label, emoji and plain explanation in English and Polish; verified bytes cannot imply approved, current or usable key.
- [ ] Individual badges have native hover explanations. The disclosure remains keyboard/touch usable and contains the same explanations; emoji are decorative beside text.
- [ ] Mobile badges wrap and warning states remain distinct. Unit/native browser tests cover independent states, real verification/approval and non-hover explanations without VoiceOver checks.
- [ ] Update the illustrated guide, message screenshot and reviewed formal mappings; retain all required signing/model gates and integrate through a protected PR.
