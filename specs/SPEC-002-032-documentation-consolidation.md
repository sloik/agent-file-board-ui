---
id: SPEC-002-032
title: Consolidate and organize UI documentation
status: done
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner explicitly requested a subagent to consolidate the cluttered docs folder.
Target is this UI repository. Canonical signing implementation/docs remain intact.

## Acceptance Criteria

- [x] AC1: A docs/README.md provides a clear entry point separating user guides,
  developer/reference material, proposals and historical validation/research.
  Reduce top-level Markdown clutter through coherent grouping and consolidation;
  retain substantive user behavior, examples, security limits and design status.
- [x] AC2: Remove duplicated explanations where a maintained section/link suffices;
  keep widely linked FEATURES.md, OPENUI.md and EXTENSIONS.md entry points stable.
  Keep images/examples and historical research/validation evidence intact.
- [x] AC3: Update all affected in-repository links and source-path references,
  including README, capture/demo tooling, tests and specs where necessary. Relative
  links, images and local anchors resolve; demo packaging and affected tests pass.
- [x] AC4: No runtime behavior, public release assets, version, vendor pin, keys,
  board data or external publication change. Parent reviews and integrates the
  isolated worker result, records validation and marks this spec done.

## Scope

docs/** and documentation references in README.md, scripts/**, tests/**, specs/**,
plus project context. Tool/test edits only to follow moved docs, not change
behavior, weaken assertions or add unrelated verification. Do not edit board.html,
release archives, node dependencies or vendor contents. No new platform or tooling.

## State rationale

Done: isolated worker21f9a7c reviewed and merged into UI main. No publication.
No active NFR specs or installed lifecycle engine.

## Outcome and validation — 2026-10-21

- Root docs Markdown19→4: index plus stable FEATURES/OPENUI/EXTENSIONS entry
  points.13task guides,2references and1design document grouped into subfolders.
  Repeated release announcements consolidated; substantive controls/limits retained.
- Full Python37passed; focused README/extracted-demo browser5passed; final demo
  packaging2tests passed. Both directory and ZIP built outside tracked assets.
  Historical-layout release tests retained, grouped-layout case added.
- Worker and parent read-only scans:35Markdown files,332local references,
  85image references,18anchors,3package-local demo links,0failures. External URLs
  and literal code/examples are outside this scan's claims.
- Parent independently built extracted demo on integrated main, reran the full
  source/package link scan and release-check(UI/convention2.10.0), all passing.
- Preservation baseline100files:96byte-identical; only4link-bearing example/
  historical-validation Markdown files changed links. All screenshot, JSON
  payload, research, board.html, release ZIP and vendor gitlink bytes unchanged.
- No runtime JavaScript, dependency, version, owner-board or external changes.
