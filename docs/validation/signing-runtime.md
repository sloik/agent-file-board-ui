# Signing runtime validation — 2026-10-21

Implementation verification before the coordinated2.11.0 release; no live-board/key migration. Canonical SPEC-002-034 is complete on feat/signing-core-conformance.
UI branch: feat/signing-runtime. The release pins the exact canonical2.11.0 tag; see SPEC-002-035 for delivery receipts.

- Canonical Python3.10.20:211tests pass; Python3.14.7:211tests pass.
- Independent OpenSSL/libsodium frozen message/profile conformance passes.
- UI integrated suite:366Node/browser checks and37Python checks pass.
- Post-review publication/form/extension suite:44pass; browser contract suite:9pass, including private-input diagnostic redaction.
- Actual file:// UI sends exact-byte signatures verified independently by the
  pinned Python CLI. Viewing identity differs from signing author in the trial.
- Tampered bytes are excluded; stripping a previously verified signature remains
  excluded after refresh. Original history is not repaired or rewritten.
- Lock refuses signed-mode send with draft retained; no unsigned fallback.
  Draft edits during asynchronous signing refuse publication and preserve edits.
- Fresh possession rejects private/public mismatches and lock-during-unlock;
 15-minute inactivity drops capability without background renewal.
- Python-signed corpus verifies same-key updates, dual-authorized rotation and
  compromise in browser Noble; learned compromise survives shared event stripping.
- Adopted required-signing floor survives shared policy removal. Inspection
  cannot enable replies, form/extension submission, unread marking or notifications.
- Excluded agent traffic does not cause repeated adaptive wakeups; accepted
  obligations stay visible as review-required.
- Duplicate JSON, lossy numbers, integer/float/boolean mirror substitutions,
  small/mixed-order public points, malformed/null policies, context replay and
  exact-byte tampering are rejected.
- Private history is0600, defaults outside the checkout and updates above64KiB
  within its8MiB aggregate budget. Browser stores public local trust/evidence only.
- All embedded signing/tools/form/upgrade sources match their generators.

`python3 scripts/release_check.py` passes with the exact canonical2.11.0 tag. The
prior untagged development marker is removed; the strict release gate is retained.

Reproduce: install the pinned optional Python requirements, `npm ci
--ignore-scripts`, `npx playwright install chromium`, then
`AFB_SIGNING_PYTHON=/path/to/python npm test`. Runtime assets remain fully offline.
Read-only upload verification is supported; signed publication needs a writable
native folder. Avatars/artifact signatures and an external browser vault are
outside this message implementation.
