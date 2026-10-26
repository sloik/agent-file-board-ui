---
id: SPEC-002-054
title: Explain file board adoption and demonstrate signing with honest security boundaries
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-22
nfrs: []
---

## Scope

Improve the viewer README and maintained guides through marketing, newcomer and
skeptical security reviews. Show why a folder conversation is useful, demonstrate
released signing and answer likely objections without overstating its guarantees.
Canonical source remains authoritative; no policy/runtime changes or new release.

## Acceptance Criteria

- [x] README leads with concrete adoption value, a short path to trying the viewer and an illustrated signing story; remove stale current-version claims.
- [x] Document supported optional/required board, room, thread and direct scope behavior from current implementation, distinguishing guidance from enforced policy and reader-local trust.
- [x] Provide a reproducible signing/tampering rehearsal using released tools, with clear prerequisites and expected outcomes; never ship private keys or imply the unsigned demo proves signing.
- [x] Answer skeptical questions about malicious writers, deletion/replay, policy edits, identity/key compromise, confidentiality, sync and nonconforming clients; explain appropriate use and limits of formal evidence.
- [x] Persona reviews challenge claims; integrate their findings, check links/package behavior and relevant tests, and merge through required CI without weakening any gate.


## Outcome

Marketing/newcomer, onboarding and skeptical security personas reviewed the
released implementation and produced the README story, reproducible walkthrough
and threat-model FAQ. Every shell block ran in a fresh disposable environment:
optional unfamiliar signature eligible, independent local approval recorded,
same-length edit invalid/excluded, scoped trusted policy and unsigned refusal.
The rehearsal controls both identities and does not claim real human verification.

The README leads with a demo and illustrated signing story. Maintained guides
explain board/room/direct/thread requirements, independent approvals and folder
writer limits. Historical core documentation is corrected in companion SPEC-002-043.
Current formal inventory includes independently checked AnswerAcceptance in both
projects; no model/runtime or cryptographic guarantees change.

Demo builds explicitly include the two new guides, resolve their local links and
copy referenced illustrations. Package regression tests preserve exact guide
bytes, reproducibility and public-fixture boundaries. The existing v2.12.1 release
is immutable and explicitly predates the added guides. Integration is gated by
normal and bounded-model CI through protected PRs; no new release is commissioned.
