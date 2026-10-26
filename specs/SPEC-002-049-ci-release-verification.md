---
id: SPEC-002-049
title: Require CI, bound setup and verify published releases
status: done
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

- [x] AC1: Require GitHub Actions test and bounded-models successes on main, preserving existing rules and without bypass actors; demonstrate pending checks block and successful exact-head checks admit integration.
- [x] AC2: Bound setup and job execution, retry network setup only, use signed HTTPS Ubuntu mirrors, and retain all browser/unit/formal assertions. Test failure, timeout, process cleanup and retry exhaustion.
- [x] AC3: Automatically verify releases after pipeline publication, external release publication, and manual backfill. Bind download inventory, checksums and ZIP payload bytes to the immutable tagged source; refuse tampered, missing, extra or unsafe assets before extraction.
- [x] AC4: Run live Chromium and Firefox update discovery from the downloaded application, compare the independently obtained latest stable version, and retain useful success/failure summaries. Verify existing release without replacing it.
- [x] AC5: Document configuration/limits; integrate through green required checks in both repositories. Remind owner about OpenUI041 after completion; do not implement it.

## Outcome

Both repositories enforce their required app-bound checks without bypass actors,
retain the previous protections and require an up-to-date branch. Actual pending
checks blocked integration; green matrix/unit/browser/formal checks admitted the
protected PR merges. Setup alone retries within finite request/process/job bounds;
all tests and formal obligations remain mandatory. Native timeout/cancellation
controls and tampered/missing/unsafe/source-race release controls pass.

The existing v2.11.4 release was exercised through the updated historical-tag
pipeline: exact-tag tests, preparation, preserve-existing publication and the
explicit post-publication verifier all passed. The downloaded inventory/checksums
and ZIP payloads matched the immutable tag, and the downloaded viewer discovered
the independent latest stable version in Chromium and Firefox. Existing published
assets were preserved. CI-RELEASE.md owns operation and evidence limits; generated
reports remain Actions artifacts. Owner was pinged for separate OpenUI041 work.
