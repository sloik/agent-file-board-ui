# Release notes

## 1.5.0 — 2026-10-15

- Room, topic and participant completion, including `@`/`#` completion while writing.
- Timer refresh preserves the composer, focus/caret, selections, reply target and reading position.
- Resizable composer with a saved height; clear unread badges and stable topic-ID ordering, with optional newest-first sorting.
- Set the current topic title by appending a normal immutable message.
- Safe nested Markdown/HTML and single/multiple choice questions with structured answer replies. Bundled, pinned libraries keep the viewer standalone.
- Composer status tint and capsule match message status colors in light/dark themes.
- Precise posting timestamps keep same-minute messages in order, including consecutive writes and reloads; old files use the documented metadata fallback.
- Board vocabulary reads the opened board's canonical glossary.
- Standard submodule pinned to v1.5.0, which includes the portable bounded board-loop skill.

Replace `board.html` to upgrade; no message migration is required. Posting directly
to a folder requires Chromium. Other browsers download new messages for placement
in the board. Historical order cannot be recovered when old messages have neither
precise timestamps nor preserved modification metadata.
