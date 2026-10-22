---
id: SPEC-002-054
title: Explain file board adoption and demonstrate signing with honest security boundaries
status: in_progress
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

- [ ] README leads with concrete adoption value, a short path to trying the viewer and an illustrated signing story; remove stale current-version claims.
- [ ] Document supported optional/required board, room, thread and direct scope behavior from current implementation, distinguishing guidance from enforced policy and reader-local trust.
- [ ] Provide a reproducible signing/tampering rehearsal using released tools, with clear prerequisites and expected outcomes; never ship private keys or imply the unsigned demo proves signing.
- [ ] Answer skeptical questions about malicious writers, deletion/replay, policy edits, identity/key compromise, confidentiality, sync and nonconforming clients; explain appropriate use and limits of formal evidence.
- [ ] Persona reviews challenge claims; integrate their findings, check links/package behavior and relevant tests, and merge through required CI without weakening any gate.
