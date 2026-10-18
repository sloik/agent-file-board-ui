---
id: SPEC-001
title: Downloadable offline OpenUI demo board
type: feature
status: done
created: 2026-10-18
---

## Authorization and scope

Owner requested an updated OPENUI.md and a downloadable live demo that users
and agents can open in the standalone viewer, reusing screenshot fixtures.
Direct implementation; no autonomous loop installation or delegation.

## Requirements

- Publish agent-file-board-demo.zip alongside the viewer starting with UI 2.2.1.
  Preserve older release assets/tags and old-tag preparation/backfill behavior.
- ZIP contains the exact tagged board.html, a visible demo-board folder holding
  its .agent-board, and a plain README with offline setup and a guided tour.
- Generate only from allowlisted synthetic canonical conversation fixtures,
  pinned template and the same canonical/example JSON used by screenshots.
  Include v1/v2/v3 reports, all 34 supported types across them, fake rooms/direct
  discussions, historical question/answer and an unanswered choice to try.
- No local user boards, external state, identities, private context, cache,
  credentials or live presence are copied. No service or npm install to view.
- Python stdlib builder validates with the pinned canonical CLI. Stable ZIP
  paths/timestamps and fixed example posting dates produce reproducible bytes.
  New destination only, reject existing outputs. Explicit root/output arguments.
- OPENUI.md leads with download/open steps and tour table. Explain Chrome/Edge
  folder picker vs read-only upload, selecting the visible demo-board parent,
  local view controls vs explicit answer/file writes, and fresh extraction reset.
- Release preparation fetches the exact source submodule, includes the demo only
  where supported, and fails if a required new demo cannot be built. Publisher
  uploads it without weakening existing notes/assets/Latest/idempotence gates.

## Acceptance criteria

- Archive content, exact viewer bytes, reproducibility, fake-message validation,
  all 34 types and refusal of existing outputs have automated coverage.
- Actual extracted file-page demo opens in native mock folder access and real
  read-only upload; all report topics render, modal/carousel work, a choice reply
  is valid and original history remains unchanged. Zero external requests.
- Release tests cover old 3-asset and new 4-asset publication/preparation, including
  failures. Full existing suite, embeds and release checks pass; new release
  download equals locally built archive. No VoiceOver checks.
- Update agent context/Cortex with concrete build, test and release evidence.

## State rationale

Explicit owner request. Existing screenshot scripts create disposable fixtures;
a reproducible distribution builder makes the same examples usable without dev tools.

## Validation

Full npm test passes179 JavaScript/browser and35 Python tests; embeds and
UI2.2.1/canonical2.2.0 exact-pin release consistency pass. actionlint and
shellcheck pass. Real extracted ZIP tests render all report topics, exercise
modal/carousel, post a CLI-valid answer in mock writable folder access, and
upload the real extracted directory read-only to download a CLI-valid reply.
Original histories remain identical; zero external requests/browser errors.
Archive tests verify reproducible bytes, public fixture allowlist, all34 types,
exact viewer/README/license and refusal of existing/dangling-symlink outputs.
The generated actual demo screenshot is inspected. Release preparation produces
four assets and a demo identical to a standalone local build. Publication and
external download verification follow as release operations.
