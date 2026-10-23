---
id: SPEC-002-060
title: Keep expanded message details open across refreshes and reloads
status: in_progress
parent: SPEC-002
type: bugfix
created: 2026-10-23
nfrs: []
devkb_required: [frontend.md]
---

## Problem

Owner bug report (2026-10-23): expanding signing details or hints on a message and
then letting the board refresh collapses them again, so the reader has to expand
them every time. Reader state for all chat messages must be preserved across
feed refreshes and survive a page reload.

Root cause: each refresh rebuilds the feed from HTML. Only a few elements
(answer review, information cards, "Show all") copied their open state across
the rebuild, in memory only; signing details and every other expandable part of a
message were rebuilt collapsed, and nothing survived a reload.

## Acceptance criteria

- [ ] AC1: Every expandable section (`details`) inside a chat message, and the
  message's "Show all" expansion, keeps the state the reader chose across
  background refreshes, re-renders and asynchronously mounted reports or
  extensions. Sections the reader never touched keep their default state.
- [ ] AC2: The chosen state survives a page reload for a writable native board,
  stored locally per board (never in the board folder), bounded so it cannot grow
  without limit. Read-only uploads keep it for the session only. Another board
  never sees this board's state.
- [ ] AC3: Browser tests reproduce the bug first (expanded signing details collapse
  after a refresh), then prove refresh, reload, collapse-after-expand, "Show all",
  session-only uploads and board isolation. Existing suites, embeds and formal
  alignment pass.
