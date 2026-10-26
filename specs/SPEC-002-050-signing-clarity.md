---
id: SPEC-002-050
title: Explain participant key trust and message signature verification in the UI
status: done
parent: SPEC-002
type: feature
created: 2026-10-22
nfrs: []
---

## Scope

Make local key approval and message verification independently understandable.
Preserve signing policy, explicit fingerprint approval and all exclusion rules.

## Acceptance Criteria

- [x] Every message displays a readable signature result and explains trust separately, including unsigned, pending, invalid, stripped and revoked states.
- [x] Participants and the Signing dialog show whether their current key is locally trusted, unfamiliar, changed, revoked or unavailable, with the exact fingerprint available for review.
- [x] Explain what verification proves, its limits, local trust scope and how to verify older messages. Keep technical evidence available behind details.
- [x] Unit and real-browser regressions cover the labels and trust transition without changing authorization decisions. English and Polish explanations are supported. No VoiceOver checks.

## Outcome

Readable integrity, local approval, lifecycle and policy-blocking facts are visible on messages, including receipts. Participant current-key approval and exact fingerprints are available in Signing; Participants shows current-key status. Three display unit cases and six actual native-browser signing journeys cover approval, rotation, compromise, unsigned messages and English/Polish phone layouts. Existing authorization rules and exact-fingerprint actions remain intact. Formal alignment and all bounded-model/trace/mutation obligations pass; required full Linux CI remains the integration gate.
