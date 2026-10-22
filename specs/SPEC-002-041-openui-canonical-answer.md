---
id: SPEC-002-041
title: Use first eligible accepted answer for every OpenUI viewer
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner clarified: display the first accepted answer everywhere; retain later
submissions only in history. Investigate existing canonical and UI contracts and
make viewer-independent answer selection explicit without deleting messages.

## Acceptance Criteria

- [x] AC1: Identify actual answer identity, validation, eligibility and ordering in
  canonical CLI and UI. Explain what first accepted means under append-only files,
  refreshes and concurrent/backdated submissions; do not assume reliable arrival
  order or an authoritative server absent from the implementation.
- [x] AC2: Every viewer renders the same accepted answer for a given question;
  later answers do not replace it. Invalid, wrong-source, unrelated or signing-
  excluded answers cannot become canonical. Historical messages remain inspectable.
- [x] AC3: Unit/browser regressions exercise different viewers, refresh/reload,
  duplicate/later submissions and malformed/ineligible replies, using real existing
  validators. Preserve all question versions and unrelated renderer behavior.
- [x] AC4: Update durable contract guidance and integrate checked changes. If
  strict first-writer acceptance needs a protocol change, report that boundary
  before inventing an incompatible local-only rule.


## Settled behavior (owner, 2026-10-22)

First accepted wins even when a later arrival carries an older timestamp.
Disconnected first acceptances produce a conflict requiring explicit resolution.
Canonical SPEC-002-041 owns the shared `ANSWER-STATE` protocol; no local arrival,
filename sort or IndexedDB pin is an acceptance authority. Old unrecorded answers
remain history until explicitly anchored by the question author. Missing or
signing-excluded accepted evidence must not promote later submissions.

- [x] AC5: Add a bounded TLA+ acceptance model, reachability and broken controls,
  real resolver trace conformance, implementation mutants and reviewed source /
  model / test mappings in the existing PR/main/weekly formal CI lane. Document
  what is modeled and the limits of disconnected file synchronization.

## Outcome

Implemented against the released canonical 2.12.1 contract. Shared fixtures and bounded production-resolver traces cover first acceptance, ordinary history, explicit legacy anchoring, offline forks, author-only resolution and exclusion without promotion. Browser regressions cover all question versions, two viewers, reload, backdated replies, failed/read-only publication, duplicate resolution controls and older signature verification. Depth limits are independent of graph enumeration. Formal CI enrolls the acceptance model with independent broken controls; published coverage states its bounded offline limits.
