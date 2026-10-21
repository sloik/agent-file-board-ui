# Illustrated documentation refresh — UI 2.10.0

SPEC-002-029 updates the current public guides and real screenshots. Existing
release tags/assets stay frozen; documentation and capture tooling move forward
on main. Signature/avatars/scoped trust/possession features remain proposed.

## Coverage and checks

- Current README/download/pin references, extension support, collision-resolved
  participant colors and opt-in session announcements corrected.
- Existing full-board report/form/workflow/authoring/theme/navigation/update
  galleries regenerated using actual released UI and disposable fictional boards.
- New desktop/phone captures show compact composing, sidebar follows, in-page
  alerts, guarded quick reply, operator claims, declarative/worker components,
  exact-package approval, refresh controls and local diagnostics.
- Shared information captures show recorded100%, latest90% and disconnection
  retaining the last reading. Viewer and producer fixture clocks agree.
- [Screenshot inventory](../reference/SCREENSHOTS.md) links all feature groups and scripts.
  Seventy PNGs are available. Isolated source/diff images remain applicable.
- `npm run screenshots:all` passes all14 capture scripts. After refining the
  producer clock, the affected `screenshots:features` batch passes again.
- Local documentation/package link audit checks305 references with zero missing
  targets. The demo tour is checked as its actual extracted-root README; file-URL
  examples are inert documentation, not expected files on the test machine.
- Fresh demo builds successfully; its HTML matches the current released viewer
  and its convention declares2.10.0. Embedded bundle checks, release consistency,
  JavaScript syntax and Git whitespace checks pass. Runtime HTML is unchanged.

## Reproducibility and limits

Use `npm run screenshots:all` or `npm run screenshots:features` after installing
locked dependencies/Chromium. Captures use the existing folder-picker adapter,
actual host DOM and the pinned canonical CLI. Only fictional temporary fixture
files are written. Browser logs/network assertions are retained; no external
collection command, user file opener, real OS notification, private key or live
user board is exercised. OS fonts/emoji can differ. Phone screenshots show real
scroll positions and compact controls rather than a generated mockup.

Manual image review checked current overview, operators, extension inspection,
approval fallback, refresh, diagnostics, shared values/disconnection and phone
composer/notifications. No VoiceOver checks were added or performed.
