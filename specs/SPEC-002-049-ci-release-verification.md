---
id: SPEC-002-049
title: Require CI, bound setup and verify published releases
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-22
nfrs: []
---

## Scope

Owner authorized follow-ups1–3: enforce passing CI, bound network setup and
automate post-publication download/live-check verification. Existing release
assets and runtime behavior stay unchanged. No VoiceOver checks. No OpenUI work.

## Acceptance Criteria

- [ ] AC1: Require GitHub Actions test and bounded-models successes on main, preserving existing rules and without bypass actors; demonstrate pending checks block and successful exact-head checks admit integration.
- [ ] AC2: Bound setup and job execution, retry network setup only, use signed HTTPS Ubuntu mirrors, and retain all browser/unit/formal assertions. Test failure, timeout, process cleanup and retry exhaustion.
- [ ] AC3: Automatically verify releases after pipeline publication, external release publication, and manual backfill. Bind download inventory, checksums and ZIP payload bytes to the immutable tagged source; refuse tampered, missing, extra or unsafe assets before extraction.
- [ ] AC4: Run live Chromium and Firefox update discovery from the downloaded application, compare the independently obtained latest stable version, and retain useful success/failure summaries. Verify existing release without replacing it.
- [ ] AC5: Document configuration/limits; integrate through green required checks in both repositories. Remind owner about OpenUI041 after completion; do not implement it.
