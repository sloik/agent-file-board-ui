---
id: SPEC-002-041
title: Use first eligible accepted answer for every OpenUI viewer
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner clarified: display the first accepted answer everywhere; retain later
submissions only in history. Investigate existing canonical and UI contracts and
make viewer-independent answer selection explicit without deleting messages.

## Acceptance Criteria

- [ ] AC1: Identify actual answer identity, validation, eligibility and ordering in
  canonical CLI and UI. Explain what first accepted means under append-only files,
  refreshes and concurrent/backdated submissions; do not assume reliable arrival
  order or an authoritative server absent from the implementation.
- [ ] AC2: Every viewer renders the same accepted answer for a given question;
  later answers do not replace it. Invalid, wrong-source, unrelated or signing-
  excluded answers cannot become canonical. Historical messages remain inspectable.
- [ ] AC3: Unit/browser regressions exercise different viewers, refresh/reload,
  duplicate/later submissions and malformed/ineligible replies, using real existing
  validators. Preserve all question versions and unrelated renderer behavior.
- [ ] AC4: Update durable contract guidance and integrate checked changes. If
  strict first-writer acceptance needs a protocol change, report that boundary
  before inventing an incompatible local-only rule.
