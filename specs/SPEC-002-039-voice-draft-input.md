---
id: SPEC-002-039
title: Optional voice draft input with native and local providers
status: in_progress
parent: SPEC-002
type: feature
created: 2026-10-21
nfrs: []
---

Voice is an optional way to fill the existing message draft. Publication and
signing continue through normal explicit Send. Preserve offline operation and
ordinary typing when speech is unavailable.

## Acceptance Criteria

- [ ] AC1: Native dictation guidance is available without browser microphone
  permission. A provider interface supports optional on-device browser recognition
  and an explicitly configured local transcription fallback; no silent cloud path.
- [ ] AC2: Explicit start/stop/cancel, language selection and visible status protect
  existing drafts. Interim results stay separate; final insertion happens once.
  Late results after cancellation, board/route change or newer edits cannot overwrite.
- [ ] AC3: Capture stops on cancellation/disposal, errors preserve text, and no raw
  audio/credentials enter shared boards. Runtime network use is explicit only for
  the selected local provider or explicitly requested language-pack installation.
- [ ] AC4: Final reviewed text uses existing signing/posting. Unit and Playwright
  tests cover capability absence, permission/error/cancel, duplicate/late results,
  editing races and signed publication; guides explain setup and actual limits.

## Scope

Composer controls, small provider/controller layer, tests and durable guidance.
No voice authentication, audio attachments, automatic sending or cloud credentials.
