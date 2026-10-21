---
id: SPEC-002-039
title: Optional voice draft input with native and local providers
status: done
parent: SPEC-002
type: feature
created: 2026-10-21
nfrs: []
---

Voice is an optional way to fill the existing message draft. Publication and
signing continue through normal explicit Send. Preserve offline operation and
ordinary typing when speech is unavailable.

## Acceptance Criteria

- [x] AC1: Native dictation guidance is available without browser microphone
  permission. A provider interface supports optional on-device browser recognition
  and an explicitly configured local transcription fallback; no silent cloud path.
- [x] AC2: Explicit start/stop/cancel, language selection and visible status protect
  existing drafts. Interim results stay separate; final insertion happens once.
  Late results after cancellation, board/route change or newer edits cannot overwrite.
- [x] AC3: Capture stops on cancellation/disposal, errors preserve text, and no raw
  audio/credentials enter shared boards. Runtime network use is explicit only for
  the selected local provider or explicitly requested language-pack installation.
- [x] AC4: Final reviewed text uses existing signing/posting. Unit and Playwright
  tests cover capability absence, permission/error/cancel, duplicate/late results,
  editing races and signed publication; guides explain setup and actual limits.

## Scope

Composer controls, small provider/controller layer, tests and durable guidance.
No voice authentication, audio attachments, automatic sending or cloud credentials.

## Implementation

Voice input lives in `scripts/voice-input.js` and `scripts/voice-ui.js`, with the
optional authenticated loopback helper in `scripts/voice_helper.py`. The board
retains its restrictive CSP. See `docs/guides/VOICE.md` for setup and limits.
Session/provider, Playwright popup/capture, helper boundary tests and the native
signed-publication journey cover the acceptance criteria; recognition callbacks
and the local model are deterministic test substitutes, not accuracy checks.
