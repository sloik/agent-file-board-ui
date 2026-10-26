---
id: SPEC-002-051
title: Redesign human signing journeys with illustrated guidance and scenario coverage
status: done
parent: SPEC-002
type: feature
created: 2026-10-22
nfrs: []
---

## Problem

Readable labels did not fix the wall of controls, unexplained actions or lack of
visual examples. Humans need task-oriented guidance, visible state and consequences.

## Requirements

- Organize the signing UI around checking messages, reviewing participant keys and signing as yourself; explain when each action is useful and its outcome.
- Distinguish local key approval, cryptographic verification, key possession, policy and lifecycle. Preserve all signing contracts, explicit exact-fingerprint approval and failure/no-fallback behavior.
- Show an orderly responsive layout, labeled fields, contextual controls, clear progress/errors and advanced details separated from everyday tasks.
- Provide illustrated signing examples, linked from the UI and maintained documentation, using actual final UI screenshots and simple diagrams with explicitly fictional sample identities/keys.
- Test after integration: meaningful unit/browser journeys, mobile/desktop geometry, English/Polish, trust/rotation/compromise, unavailable/read-only contexts, and formal alignment/verification. No VoiceOver checks.

## Acceptance Criteria

- [x] AC1: A newcomer can identify message status and find an explanation/next action without decoding raw enums.
- [x] AC2: A newcomer can review a selected participant's name, current fingerprint and local approval, compare it independently, deliberately approve/remove approval, and understand key changes and revocation.
- [x] AC3: The own-signing journey explains prerequisites, private-key handling, explicit signer selection, unlock/lock/unsigned transitions and read-only limitations; controls communicate current availability and effects.
- [x] AC4: Desktop and phone layouts have coherent sections, readable wrapping and no horizontal overflow; action/error feedback remains associated with the intended task in both languages.
- [x] AC5: Illustrated guide and in-app examples explain real journeys including unfamiliar valid messages and blocked/revoked messages; screenshots correspond to the implemented UI and private fixture keys never enter assets/repository.
- [x] AC6: Existing authorization and formal obligations remain intact. Integrated unit/browser/formal checks pass through a protected PR; documented test claims distinguish actual browser coverage from model bounds.

## Team ownership

Parent: integration, final tests, screenshots review and delivery. Isolated workers:
UI workflow/layout; illustrated documentation/examples; independent UX/test review.

## Outcome

The signing dialog has pinned task shortcuts, ordered responsive cards, visible
labels, scoped feedback, explicit signer selection and separate advanced controls.
Offline Maya/Sam help, two source diagrams and five actual UI screenshots explain
message integrity, local exact-key approval and private-key possession. The demo
includes every illustrated guide reference without including private keys.

Native regression coverage verifies English/Polish desktop/phone geometry,
comparison draft/control identity through refresh, distinct-folder switching,
canceled private-key import, real profile rotation refresh, read-only eligibility
reverification and failed approval persistence. A fault-injection test reproduced
the false approval badge before its rollback fix. Existing exact-byte, lifecycle,
CAS, stale draft/publication and no-unsigned-fallback assertions remain intact.

Local combined signing tests28/28, Python/package tests59/59, bounded formal
models, production trace conformance and independent mutant controls pass.
Independent team review inspected final source, screenshots and regression
boundaries without material findings. Complete Linux CI including Firefox remains
the protected integration gate. The source change is documented as Unreleased;
the published2.12.0 tag and assets are preserved.
