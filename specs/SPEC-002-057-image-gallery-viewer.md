---
id: SPEC-002-057
title: Enlarge report images and browse them as a gallery
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

OpenUI report components already carry images (`image`, `image-gallery`,
`image-text`, image card grids and `carousel`; validated inline PNG data). Readers
cannot see them larger or step through them. The owner asked for every supported
component that shows images to offer an enlarged view with gallery behavior, and for
agents composing messages to be nudged towards it.

## Requirements and acceptance criteria

- [ ] AC1: Every image rendered by a supported component opens an enlarged
  viewer on click, tap, Enter or Space. The image fits the viewport (never
  upscaled blurrily beyond a sensible limit) and shows its title/caption/alt text.
  Components that already have their own interaction keep it working; describe
  any conflict and how it was resolved.
- [ ] AC2: Gallery navigation covers every image of the same report message in
  document order: previous/next buttons, arrow keys, horizontal swipe on touch,
  a position counter ("3 / 7"), close button, Escape and backdrop click. Focus
  stays inside while open and returns to the originating image on close. A
  single image shows no navigation controls. Optional: fit/actual-size toggle.
- [ ] AC3: Safety and scope: only images that already passed existing validation
  are shown; no new network requests, downloads, persistence, board writes or
  message changes. Works for native folders and read-only uploads, in all themes,
  at phone width, in English and Polish. Extension worker sandboxes are not
  given access to it unless an existing host API already covers images.
- [ ] AC4: Authoring guidance: docs/OPENUI.md (and any authoring/builder UI that
  composes reports, if one exists) tell authors that images can be enlarged and
  recommend `image-gallery` for two or more related images, each with a
  meaningful title or alt text. If a builder exists, it suggests `image-gallery`
  when several separate image components are added; never auto-rewrites content.
- [ ] AC5: Tests: browser tests for opening by mouse and keyboard, navigation in
  both directions with wrap-around or clear ends (state which), counter, Escape,
  focus return, single-image case, phone width, Polish labels, and an
  `image-text`/card-grid/carousel case. All existing node, Python and formal
  checks still pass; embedded bundles and screenshots regenerated where the
  project's `--check` scripts require it.

## Out of scope

Canonical convention and board-loop skill guidance (parent handles in
agent-file-board), new image formats or remote images, editing images, release.
No VoiceOver checks (owner policy).
