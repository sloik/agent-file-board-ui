---
id: SPEC-002-043
title: Plan manual viewer package releases and update guidance
status: done
parent: SPEC-002
type: research
created: 2026-10-21
nfrs: []
---

## Context

Follow-up to completed SPEC-002-042. Owner changed direction from programmatic
HTML replacement to a GitHub release ZIP and guided manual package installation,
while explicitly retaining the daily in-app update notice. Update source/runtime
packages; never silently overwrite conversations, private state or custom content.

## Acceptance Criteria

- [x] AC1: Record the new owner contract and explain which earlier automatic
  installation machinery is outside scope. Preserve explicit reload and unfinished
  work protections, source-checkout preservation and shared-file sync expectations.
- [x] AC2: Define an app-only release ZIP, exact tested-source publication,
  package inventory/integrity metadata, optional helper boundaries and safe manual
  update/recovery instructions. Distinguish it from the demo ZIP and board data.
- [x] AC3: Define daily in-app notice transport that preserves custom-worker
  network isolation. Investigate a fixed sandboxed cross-origin hosted checker;
  state deployment dependencies, trust/message boundaries and offline behavior.
- [x] AC4: Update the durable architecture with a bounded implementation plan and
  meaningful package/transport/UI verification scenarios. Identify actual evidence
  versus remaining implementation gates; do not claim deployment or runtime work.

## Scope

Architecture/design only. No source-runtime implementation, dependency install,
GitHub Pages enablement, release/tag mutation or automatic viewer-file writes.

## Outcome

Owner confirmed manual package installation with daily in-app update notice.
`docs/design/VIEWER-UPDATES.md` now defines the app-only ZIP, exact tested-release
pipeline, safe guide, source/data separation, reload gates and isolated hosted
checker. A bounded Chromium HTTP prototype supports independent-frame CSP behavior;
actual GitHub Pages deployment and HTTPS/Firefox tests remain implementation gates.
No runtime, release assets or hosted service were changed.
