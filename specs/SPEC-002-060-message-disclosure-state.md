---
id: SPEC-002-060
title: Keep expanded message details open across refreshes and reloads
status: done
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

- [x] AC1: Every expandable section (`details`) inside a chat message, and the
  message's "Show all" expansion, keeps the state the reader chose across
  background refreshes, re-renders and asynchronously mounted reports or
  extensions. Sections the reader never touched keep their default state.
- [x] AC2: The chosen state survives a page reload for a writable native board,
  stored locally per board (never in the board folder), bounded so it cannot grow
  without limit. Read-only uploads keep it for the session only. Another board
  never sees this board's state.
- [x] AC3: Browser tests reproduce the bug first (expanded signing details collapse
  after a refresh), then prove refresh, reload, collapse-after-expand, "Show all",
  session-only uploads and board isolation. Existing suites, embeds and formal
  alignment pass.

## Fix and evidence

Root cause confirmed by tests/message-ui-state.test.js failing before the change
(expanded signing details closed after a refresh; nothing stored). One shared
mechanism in board.html (MessageDisclosure, disclosureKey, applyMessageDisclosure)
records explicit summary toggles and "Show all", applies saved state to each
rebuilt feed and, through a MutationObserver, to sections mounted later. Writing
the session-only test exposed a race (a refresh in the same instant as the click
could restore the old state); the toggle is now recorded synchronously and
confirmed after the click. Disabling persistence makes the reload test fail.
Released as viewer 3.2.1.
