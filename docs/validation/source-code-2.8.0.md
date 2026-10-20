# Shared source presentation — 2.8.0 / SDK1.3

SPEC-002-019 adds one locally bundled renderer/parser for rich Markdown and HTML,
existing report code/Markdown, and declarative or approved-worker extension nodes.
Canonical report schemas and existing message formats are unchanged. Language
hints are interpreted after sanitization; author classes and action attributes
are discarded before trusted controls and syntax spans are generated.

Code uses explicit-language highlighting with a pinned 15-grammar highlight.js
build. Ordinary unified patches validate counts, ranges, order and paired file
headers before showing old/new numbers. Short +/- fragments have no invented
line numbers. Split view pairs adjacent changes in order and pads uneven runs.
Unknown languages stay plaintext; malformed, oversized, binary and combined
patches show their complete source with an explanation. No Git/source commands,
patch application, file access or automatic network behavior is added.

## Evidence

- JavaScript/browser full suite: 340 tests pass. UI Python: 36 tests pass after
  the canonical pin was frozen at local v2.8.0. Canonical Python: 140 tests pass.
- 21 portable patch fixtures cover multi-file/hunk changes, new/deleted files,
  actual line numbers, uneven fragments, CRLF/Unicode, newline markers,
  header-looking source, orphan/missing headers, count/range/order boundaries,
  binary/combined input and complete source fallback. Lifecycle validators share
  26 vectors, retaining old SDK support and testing 1.3 refresh compatibility.
- Actual rich-body/report/declarative/worker browser flows use the same factory.
  Worker rendering requires exact-package approval. Source/path/HTML injection,
  inherited language names and spoofed controls cannot create viewer actions.
- Explicit clipboard calls are captured with a browser stub to compare exact
  supplied source, including CRLF/Unicode. A denied stub reveals selectable
  source. This proves application input/output, not operating-system permissions.
- View/copy controls preserve composer drafts/caret and immutable message bytes.
  Integration tests see no automatic HTTP requests or page errors. Polish phone
  tests check internal bounds and addition/removal colors in all three themes.
- Parent isolated-browser inspection checks the actual shared renderer's full
  code/unified/split presentation in Light, Dark and Dracula. Enter activates
  split view; at390px its table scrolls inside the component without page
  overflow. Nine screenshots and the runner are in `/tmp/afb-source-*`.
  The guide's two illustrations are isolated component views, not evidence that
  the board's existing fixed phone composer leaves an entire table visible.
- The extracted deterministic demo includes T016, the portable guide, source and
  patch files, both-mode SDK1.3 package and license. Its actual-browser source
  view switches without changing the demo files; normal answer posting still
  validates. Upgrade tests include the 2.7.0 baseline.

The first broad run caught a test helper that assumed every demo topic contained
an OpenUI report; T016 is ordinary Markdown. Its test now waits for source
presentation directly. The first full Python run correctly refused the untagged
canonical pin; the final exact tag/pin check passes without loosening the gate.
A layout inspection also corrected split table width to fill desktop containers.

## Delivery boundary

This is local implementation evidence. Canonical source tag/pin is v2.8.0 at
`9d523500a6fe811c768cd255de50c912c6200f63`. Nothing for2.8.0 has been pushed or
published. Public releases remain2.7.0. A future authorized release must verify
both repository Release objects, actual downloads and exact pin bytes; source
tags and successful tests alone are not publication evidence. Living specs stay
parked and no company integration or live owner-board migration is claimed.
