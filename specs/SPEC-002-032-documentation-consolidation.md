---
id: SPEC-002-032
title: Consolidate and organize UI documentation
status: in_progress
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner explicitly requested a subagent to consolidate the cluttered docs folder.
Target is this UI repository. Canonical signing implementation/docs remain intact.

## Acceptance Criteria

- [ ] AC1: A docs/README.md provides a clear entry point separating user guides,
  developer/reference material, proposals and historical validation/research.
  Reduce top-level Markdown clutter through coherent grouping and consolidation;
  retain substantive user behavior, examples, security limits and design status.
- [ ] AC2: Remove duplicated explanations where a maintained section/link suffices;
  keep widely linked FEATURES.md, OPENUI.md and EXTENSIONS.md entry points stable.
  Keep images/examples and historical research/validation evidence intact.
- [ ] AC3: Update all affected in-repository links and source-path references,
  including README, capture/demo tooling, tests and specs where necessary. Relative
  links, images and local anchors resolve; demo packaging and affected tests pass.
- [ ] AC4: No runtime behavior, public release assets, version, vendor pin, keys,
  board data or external publication change. Parent reviews and integrates the
  isolated worker result, records validation and marks this spec done.

## Scope

docs/** and documentation references in README.md, scripts/**, tests/**, specs/**,
plus project context. Tool/test edits only to follow moved docs, not change
behavior, weaken assertions or add unrelated verification. Do not edit board.html,
release archives, node dependencies or vendor contents. No new platform or tooling.

## State rationale

In progress: authorized doc cleanup, delegated through an isolated worktree.
Use existing project conventions; no active NFR specs or installed lifecycle engine.
