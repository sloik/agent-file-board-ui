---
id: SPEC-002-040
title: Model browser signing capabilities and draft publication
status: in_progress
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Add a small maintained TLA+ model of browser signer generations, atomic key
unlock and draft/publication boundaries. Match actual async steps; do not assume
filesystem commit and guard are one atomic action.

## Acceptance Criteria

- [ ] AC1: A bounded executable model covers lock/unlock/import/prove/sign/verify,
  expiry, key/board changes, multiple bindings and newer drafts. State assumptions
  and the authorization boundary explicitly; never model crypto arithmetic.
- [ ] AC2: Run TLC safety checks with a pinned verified tool and measured finite
  bounds. Include known-bad variants that produce the expected counterexamples,
  demonstrating that the invariants are meaningful rather than vacuous.
- [ ] AC3: Separate formal CI runs on PRs and pushes to main. Keep tool versions,
  model/configuration and reproducible commands in source; generated traces and
  session reports remain outside public docs. Existing tests remain required.
- [ ] AC4: Map properties to source/test boundaries, preserve the pending-close
  distinction, run checks synchronously and merge verified model/tooling changes.
