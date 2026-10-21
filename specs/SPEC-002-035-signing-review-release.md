---
id: SPEC-002-035
title: Review and release message signing with documentation consolidation
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner explicitly authorizes security review, fresh-key real-folder two-client
smoke testing, integration of the prior documentation cleanup and a coordinated
release if checks pass. Preserve old published tags/assets and unrelated work.

## Acceptance Criteria

- [x] AC1: Independent read-only review of canonical and browser signing covers
  exact bytes/context, policy/trust/lifecycle, private key/state boundaries and
  asynchronous publication. Findings have dispositions and regressions for fixes.
- [x] AC2: Fresh disposable keys and real browser filesystem handles exercise UI
  signing and CLI interoperability, rotation/revocation and lock/failure behavior.
  No real identity keys or owner boards are changed.
- [x] AC3: Documentation cleanup21f9a7c/bd2dd36 and signing feature branches are
  ancestors of released main. Current docs/changelogs describe final capabilities.
- [x] AC4: Canonical and UI compatible new versions have exact immutable tags;
  local full suites and exact-source CI pass. UI pins the released canonical tag,
  removes development marker and passes the unchanged strict release guard.
- [x] AC5: Both actual GitHub Releases are public non-prerelease Latest. Download
  UI assets and canonical source archives and verify exact tested bytes, notes,
  demo and embedded sources. Record receipt and leave clean working trees.

## Scope

Both repositories' signing code/tests if review finds defects; release metadata,
versions/changelogs/manifest, exact UI vendor pin, portable distribution builders,
CI, docs and this spec. Read-only security reviewer does not edit or publish.
Parent owns fixes, tests, merges, pushes, tags and publication. No live migration.

## Authorization

User: "do it, make sure that the work done by documentation clean up is also
merged and then if all is ok do a release". No additional permission is needed
for the release once all evidence passes. If evidence fails, fix it first.

## Pre-publication evidence

Independent review found four publication/private-state blockers; fixes and
regressions are recorded in docs/validation/signing-security-review.md. Reviewer
rechecked fixes and independently passed14canonical signing runtime and16UI
focused cases. Additional parent regressions cover reviewed source baselines,
provider reconciliation and immediate unlock feedback.

Real Chrome native filesystem handles and freshly generated disposable keys
completed UI→CLI and CLI→UI verification under required signing. A dual-key
rotation required new trust and cleared the old browser capability. A new-key
message was accepted, then excluded on compromise. Both clients retained the
private trusted floor and learned compromise after shared policy/event stripping.
Public synthetic receipt: docs/validation/signing-native-receipt.json. No real
owner keys or live boards.

Documentation cleanup21f9a7c/bd2dd36 and reviewed signing are merged into UI main;
canonical main is ba9c854 (local v2.11.0 exact pin). Canonical214tests and
OpenSSL/libsodium conformance pass. UI372Node/browser+37Python pass; final unlock
feedback regression8/8passes. Strict release check passes for both2.11.0 versions.
Publication and exact-source CI/download receipts remain pending below.

Canonical v2.11.0 was published after exact-source CI and all171 archive blobs
were verified. UI v2.11.0 tag CI found four compose tests observing newly created
files before writer completion; publication was skipped. The immutable tag is
retained. UI v2.11.1 waits for completion without changing byte assertions and
adds controlled delayed-close/newer-draft preservation coverage. Canonical pin
remains v2.11.0; same-major/minor compatibility is intentional.

## Published delivery

Canonical [v2.11.0](https://github.com/sloik/agent-file-board/releases/tag/v2.11.0)
is Latest at ba9c854; tag CI39569294986 and main CI39569295539 pass. All171
tracked source blobs/symlinks match the downloaded ZIP and tar archives.

UI [v2.11.1](https://github.com/sloik/agent-file-board-ui/releases/tag/v2.11.1)
is Latest at f5a2daa; main CI39571497416 and complete tag/release workflow
39572115081 pass. Full local suite:373Node/browser and37Python, zero skipped.
Canonical local suite:214tests. Strict release guard passes with canonical2.11.0.

All four downloaded UI assets match prepared/rebuilt bytes exactly. Both release
bodies match their prepared notes. Demo HTML, five portable board-loop files,
signing guides, viewer version and absence of private JWKs were checked. Exact
canonical vendor pin and both public non-prerelease Latest objects were checked.
Prior2.10.0 release IDs, notes and asset IDs/sizes/digests are unchanged.
Machine-readable receipt: docs/validation/signing-release-receipt.json.

Documentation cleanup21f9a7c/bd2dd36 are ancestors of released UI f5a2daa.
Failed UI2.11.0 source tag remains immutable and unpublished. The final receipt
is a documentation-only follow-up; released source tags/assets remain frozen.
