---
id: SPEC-002-040
title: Model browser signing capabilities and draft publication
status: done
parent: SPEC-002
type: maintenance
created: 2026-10-21
nfrs: []
---

Add a small maintained TLA+ model of browser signer generations, atomic key
unlock and draft/publication boundaries. Match actual async steps; do not assume
filesystem commit and guard are one atomic action.

## Acceptance Criteria

- [x] AC1: A bounded executable model covers lock/unlock/import/prove/sign/verify,
  expiry, key/board changes, multiple bindings and newer drafts. State assumptions
  and the authorization boundary explicitly; never model crypto arithmetic.
- [x] AC2: Run TLC safety checks with a pinned verified tool and measured finite
  bounds. Include known-bad variants that produce the expected counterexamples,
  demonstrating that the invariants are meaningful rather than vacuous.
- [x] AC3: Separate formal CI runs on PRs and pushes to main. Keep tool versions,
  model/configuration and reproducible commands in source; generated traces and
  session reports remain outside public docs. Existing tests remain required.
- [x] AC4: Map properties to source/test boundaries, preserve the pending-close
  distinction, run checks synchronously and merge verified model/tooling changes.

## Implementation

Maintained models, finite bounds, source/test mapping and tool pin are in
`formal/README.md` and `formal/suite.json`. Named bad variants and successful
publication reachability controls run alongside passing safety checks. Separate
`.github/workflows/formal.yml` checks every PR and main push. Generated checker
state and failure traces stay outside source.
