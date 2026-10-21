---
id: SPEC-002-035
title: Review and release message signing with documentation consolidation
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Owner explicitly authorizes security review, fresh-key real-folder two-client
smoke testing, integration of the prior documentation cleanup and a coordinated
release if checks pass. Preserve old published tags/assets and unrelated work.

## Acceptance Criteria

- [ ] AC1: Independent read-only review of canonical and browser signing covers
  exact bytes/context, policy/trust/lifecycle, private key/state boundaries and
  asynchronous publication. Findings have dispositions and regressions for fixes.
- [ ] AC2: Fresh disposable keys and real browser filesystem handles exercise UI
  signing and CLI interoperability, rotation/revocation and lock/failure behavior.
  No real identity keys or owner boards are changed.
- [ ] AC3: Documentation cleanup21f9a7c/bd2dd36 and signing feature branches are
  ancestors of released main. Current docs/changelogs describe final capabilities.
- [ ] AC4: Canonical and UI compatible new versions have exact immutable tags;
  local full suites and exact-source CI pass. UI pins the released canonical tag,
  removes development marker and passes the unchanged strict release guard.
- [ ] AC5: Both actual GitHub Releases are public non-prerelease Latest. Download
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
