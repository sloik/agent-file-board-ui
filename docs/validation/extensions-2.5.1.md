# Extension delivery qualification — 2.5.1

Canonical source/tag: `e4a33e9bb7cb415470772b6ea5648e8e1f80ad99` / `v2.5.1`.
The viewer pins that exact tag. SDK API1.0.0, package/envelope format1.

Final local checks:126 canonical Python tests;281 viewer JavaScript/browser
checks and36 viewer Python tests. All embedded-source and exact-release checks
pass. The upgrade test also covers pristine2.5.0 →2.5.1, alongside all earlier
supported baselines. Earlier2.5.0 qualification is retained as source evidence,
not a published delivery; its viewer publication was cancelled after a CLI
integration finding. Existing tags were preserved.

The fix keeps unavailable optional semantic definitions distinct from invalid
wire/schema data in shared CLI readers and repair admission. An actual CLI test
posts a request, removes its package, verifies strict validation is nonzero,
retains the readable recent message and refuses repair/withdrawal with no file
changes. Malformed envelope syntax remains invalid even without its package.
New posts/corrections still require enabled compatible definitions.

The twelve browser/CLI extension controls from the initial qualification remain
passing: exact Python/JS fingerprints and bounded schemas, native/upload typed
replies and immutable source bytes, local import/disable/inspection, renderer
switch/revert, local approval/revocation and fresh-profile isolation, actual
CSP/opaque-worker egress/storage/DOM/RTC/nested-worker restrictions, hot-loop
termination, bounded drawings, authoring/preview/attachment, stale source refusal,
missing-package isolation, Polish Dracula phone reflow and raw-byte/BOM integrity.

Local logs: `/tmp/afb-extension-251-release-suite.log`,
`/tmp/afb-extension-251-python-final.log`,
`/tmp/afb-extension-251-all-baselines.log`.
Standalone HTML SHA-256:
`e7669b87e5230db3027f068fcdd06f66fcafb012a83ec2f760c87f200cbc4757`.

Company adoption is not claimed. Browser jobs are bounded, not an OS memory
quota. No live owner board migration or living-spec implementation is included.
The living-spec proposal remains parked on `park/living-specs-20261019`.
