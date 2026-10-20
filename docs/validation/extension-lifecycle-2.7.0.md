# Extension lifecycle implementation — 2.7.0 / SDK1.2

The canonical contract is
[`docs/EXTENSION-LIFECYCLE.md`](../EXTENSION-LIFECYCLE.md). The installed package
is an extension; its rendered instance is an extension component. Canonical
specification: SPEC-002-018. This is implementation evidence, not a publication
receipt. Existing public releases and tags were not changed.

## Architecture and review

The architecture reviewer, UX researcher/UI designer and security auditor
personas planned and reviewed the contract before isolated implementation.
The parent resolved the worker-only versus both-modes scope disagreement in
favor of both declarative time rebinding and bounded worker events. A canonical
capability defines portable behavior; third-party hosts may explicitly decline
runtime refresh while preserving baseline rendering and reporting unsupported
status. The stock viewer supplies scheduling, controls and local diagnostics.

The stock host uses a shared bounded dispatcher, one coalesced refresh per
component, monotonic best-effort intervals, hidden-page pause and one resume.
Manual refresh uses loaded declared context. Board refresh re-reads files;
external producers collect observations. Rendering never renews observation time,
availability or producer liveness. No source commands are executed.

Independent cross-review identified and resolved preview host-context omission,
source-change identity limited to shared information, initial unsolicited answer
proposals, and automatic redraw deleting focused drafts. Focus is checked before
dispatch and at result delivery. Automatic failures preserve focused edits while
still recording the failure and stopping retries. A final independent source
review approved that failure guard.

## Validation

- Full JavaScript/browser suite: 331 tests. UI Python: 36 tests. Canonical Python:
  139 tests. Portable validators share 23 lifecycle vectors, including both modes,
  interval bounds, required declarations and legacy SDK compatibility.
- Actual worker checks exercise timer/manual/source-change/resume, hidden-page
  coalescing, more than eight components, disposal, failure/retry, preview context,
  reply proposal restrictions, diagnostic bounds and spoofed metadata, local
  preview/export, and focused edits before/during automatic jobs and failures.
- Parent actual-browser check used two approved components sharing one artifact.
  An external publication changed both latest readings while message bytes stayed
  immutable. Manual and periodic refresh, automatic pause, exact-package inspection,
  filtered exact export and revocation passed. No page errors or network requests.
- Actual keyboard inspection opens/focuses the exact package with Enter; Escape
  returns focus to the originating review control. EN/PL, narrow Dracula layout,
  host-owned reason states and exact-artifact routing have browser coverage.
  Parent inspected the rendered approval placeholder screenshot.
- Upgrade checks include pristine2.6.1 to2.7.0 with unmanaged bytes and exact
  backups preserved. Embeds, generated manifest and release consistency pass
  against the local canonical2.7.0 source tag; no publication was performed.
- A real demo ZIP contains exact current HTML, canonical offline guides and all
  three lifecycle/contract example packages. Archive determinism remains covered
  by the existing demo suite. No example is installed or approved automatically.

Initial integration runs retained failures from old version expectations and a
standalone test harness missing the newly extracted runtime. Exact version
expectations and real module loading were updated without removing assertions.
The first full run after those corrections passed all JavaScript tests; its
Python release check correctly refused the then-untagged canonical source.
Preparing the new local source tag resolved that gate without moving old tags.
The parent clock-driven scenario first timed out after a31-second virtual advance
waiting for the periodic display. Advancing to the30-second dispatch boundary
and allowing the real worker to finish passed; the failed run did not retain
enough diagnostics to claim a separate runtime defect was identified or fixed.

Local logs/receipts are `/tmp/afb-lifecycle-npm-verified.log`,
`/tmp/afb-lifecycle-canonical-test.log`, `/tmp/afb-lifecycle-parent-e2e.json` and
`/tmp/afb-lifecycle-demo-final.zip`. These are synthetic local validation artifacts.
The full reference documents timer limitations, ephemeral worker state, logs lost
on a hard timeout and the need to inspect extension-authored logs before export.
No VoiceOver checks were added or run. Living specifications remain parked.


## Publication follow-up — 2026-10-20

After owner clarified the expectation of automatic delivery, the UI-specific
v2.7.0 tag was pushed atfbd9780. Its gated release workflow39381316046 passed
test, prepare and publish on the first attempt. UIv2.7.0 is published as Latest:
https://github.com/sloik/agent-file-board-ui/releases/tag/v2.7.0 . All four
downloaded assets and complete notes match staged tested source bytes. Existing
canonical/UI2.6.1 release notes and asset IDs/sizes/digests are unchanged.
Receipt: /tmp/afb-270-release-receipt.json. Canonical v2.7.0 tag/pin remains3f5b512;
no published tag was moved. The canonical repository automatically runs tests on
main/tags; UI artifact publication requires the separate UI version tag.

The same-commit main run39381315440 first failed the previously recorded
unrelated offline-tools unsupported draft-import timeout. Its log is retained
at /tmp/afb-270-main-ci-failure.log; one unchanged failed-job retry was requested.
The exact tagged release gate independently passed the whole required suite.
No test was skipped, weakened or increased in timeout, and the intermittent
failure is not claimed fixed.
