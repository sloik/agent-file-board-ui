---
id: SPEC-002-036
title: Remove session validation artifacts from public documentation
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Public documentation must help readers use, understand or reproduce the project.
Session reports and receipts referencing private temporary files do not meet that
purpose and must not be treated as shipped product documentation.

## Acceptance Criteria

- [x] AC1: Remove tracked docs/validation session reports and receipts; retain
  reusable product guidance and reproducible test commands in appropriate guides.
- [x] AC2: Update first-party docs/spec links and demo packaging so no removed
  report is required or shipped. Preserve signing guidance, tests and fixtures.
- [x] AC3: Add a concise contributor boundary for session-local artifacts and
  prevent the removed validation directory from being re-added accidentally.
- [x] AC4: Existing demo/release Python tests and a real demo build pass; inspect
  the resulting archive for intact signing guides and absence of session reports.
  Merge the isolated worker changes into main without changing frozen releases.

## Scope

First-party documentation, related spec references, demo builder and affected
packaging assertions. Existing tags/assets and pinned vendor remain unchanged.
No history rewrite or new release is requested. Do not create a public validation
report for this cleanup; report verification in the task response.
