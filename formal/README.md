# Browser signing capability model

Run `python3 formal/check.py` from a fresh clone with Python 3 and Java 17.
The runner downloads official stable TLC 1.7.4 into the user cache and verifies
its pinned SHA256 on every use. `JAVA` selects a Java executable; `--jar PATH`
selects an existing checksum-verified jar. CI runs a separate bounded-model job
for every PR and push to main. Generated state/trace files stay in automatically
removed temporary storage; only maintained models/configs/tool pins live here.
Unexpected checker errors and timeouts fail rather than count as counterexamples.

## What Signer models

One tab has an earlier independent capability and one unlock attempt for two
participant bindings, followed by one signed delivery. Each binding is an opaque
already validated public/private-key association; crypto arithmetic, secret
non-extractability, parsing and identity matching remain implementation tests.

`Provider.unlock` in `scripts/signing-contract.js` imports a key, resolves its
bindings and proves possession for every binding before installing any. The model
separates import, resolution, each proof and installation; failures may stop the
operation. `AtomicUnlock` requires that no partial new binding set is installed.
Its mutation installs the first binding early and must fail this property.

Message signing separately resolves, awaits crypto, awaits verification and
returns. Lock, inactivity expiry, host board change and host key reconciliation
can invalidate the capability between steps. Each happens at most once, so the
generation is bounded by four. These actions mean the invalidation has been
observed by the provider; they do not assume a disconnected tab magically knows
a remote revocation. `NoStaleReturn` records whether a completed sign operation
was authorized by its generation and catalog at the return boundary. It does
not invalidate cryptographic bytes that were validly returned before a later
lock. Removing the generation check must produce a counterexample.

`signingDelivery` in `scripts/signing-ui.js` and `writeNewFile` / `deliverMessage`
in `board.html` separate filesystem acquisition, write, final guard, pending
close, committed bytes, and composer completion. The final guard checks the
reviewed draft, board, profile and provider generation. `ValidAuthorization`
records this at authorization, and requires authorization for publication.
Removing that guard must fail. Earlier repeated checks can reject sooner; this
model retains the last decisive guard with every environment action permitted
between writer steps. Sidecar/message pairing and shared policy/private-state
persistence belong to the canonical protocol model and executable browser tests.

The last guard authorizes handing bytes to `close()`. A later lock or draft edit
can occur while close is pending; it cannot necessarily cancel the authorized
commit. The model keeps this boundary separate. `KeepNewDraft` requires that
completion of the older delivery preserves a newer draft. Its mutation clears
the composer unconditionally and must fail. The `NeverCompletes` reachability
control must find a real successful delivery, so safety cannot pass solely
because every operation is refused.

## Scope and bounds

There are two new bindings plus one independent existing binding, two board/key
symbols, one original draft plus one edit, one unlock/sign/delivery attempt,
four one-shot invalidations and Boolean failure choices. The finite search has
no depth/state filter that hides unfinished exploration. Normal quiescence and
refusal are deliberate, so deadlock reporting is disabled. This slice asserts
safety, not liveness: permanently failing crypto/filesystem operations and
revocation can legitimately prevent sending. Timing is abstracted to an expiry
event; boundary milliseconds remain unit-tested in `tests/signing-provider.test.js`.

The model checks all interleavings of these abstract actions within the stated
bounds. It does not prove JavaScript implements the model, prove Ed25519 or
WebCrypto, guarantee OS permissions/durability, or exclude uncooperative writers.
Unit tests cover provider failures and locks, `tests/signing-ui.test.js` covers
writer guards and cross-tab private state, `tests/compose.test.js` covers delayed
close/newer drafts, and `tests/signing-scenarios.test.js` covers native streams and
CLI interoperability. Keep these tests when evolving the model. Convert useful
counterexamples into deterministic scheduled regressions, never into public
session receipts or temporary-path reports.

The canonical board owns publication/private-state models in its `formal/`
directory. This UI model owns client capability semantics; it intentionally does
not import an unreleased canonical checkout or change the vendored board pin.
Both runners use the same official tool/version/checksum and explicit
cross-file authorization boundary. A future shared model should be consumed
through a released canonical pin, rather than copying hidden implementation
assumptions across repositories.

References: [official TLA+ tools](https://github.com/tlaplus/tlaplus),
[TLC CLI](https://docs.tlapl.us/using:tlc:start),
[modeling above code](https://lamport.azurewebsites.net/tla/high-level-view.html).

## ViewerUpdate and maintained alignment

[Alignment maintenance and CI gates](ALIGNMENT.md) describe the source mappings,
review trigger and executable trace bridge. Both the normal test command and
formal lane refuse stale mappings. The lane also runs mapped signing regression
tests, observed update/reload traces, implementation-only mutants and TLC.

`ViewerUpdate` models two consecutive daily-check windows, one explicit manual
check, an opt-out toggle, aggregate unfinished-work and active-write flags, and an
explicit guarded reload. The claim is atomic at the private IndexedDB transaction
boundary: its synchronous callback uses `ViewerUpdates.claim`, the same production
function called by the runtime trace collector. Two callers in one browser storage
context share the persisted attempt; cooperating-tab serialization is additionally
covered by the actual-browser update test. Manual checks bypass daily/opt-out
cadence; they still advance the persisted attempt. A failed metadata request also
consumes that attempt, without claiming an installation or a successful check.

`OneAutomaticClaim` forbids two automatic claims in one window. `SafeReload` records
whether unfinished work or a pending operation existed when reload was invoked;
work created after an authorized reload does not retroactively invalidate it.
The two model mutants remove daily/reload guards and must fail those invariants.
A reachability control finds a successful reload. Runtime trace controls separately
mutate the actual claim and reload implementation and must be rejected by TLC.

The finite model does not include HTTP, origin/source/channel validation, download
installation, filesystem replacement, browser crash/draft recovery, arbitrary
clock jumps, tab storage partition rules or all individual draft representations.
Those retain explicit unit/browser tests and mapped source anchors. No automatic
application-file installer exists. Aggregate draft/pending predicates correspond
to the real reload guard; its individual categories have independent unit checks.

## Verification status and weekly checks

See [status, coverage and remaining gaps](STATUS.md) for the live Actions summary,
commit/input freshness inspection, local full-lane command and weekly schedule.

## Signer runtime action traces

`collect_signer.js` loads production Provider/signingDelivery code in a disposable
Node VM, with real Node WebCrypto and explicit observation hooks at import,
profile resolution, each completed possession proof, signature verification and
return. It executes the production host writer and composer completion functions
against DOM/writable-stream doubles. TLA+ checks every projected variable and
transition against the unchanged Signer Init/Next and all four safety invariants.
The collector does not reimplement the transition relation.

Ten positive scenarios witness successful publication/completion, atomic failed
multi-binding unlock, lock during import/second proof, lock/expiry during signing, board/key invalidation before
final close, newer-draft preservation and crypto failure. Four source mutations
in that disposable VM introduce partial installation, stale signature return,
skipped delivery checks and erased newer drafts; each must produce the named TLC
conformance counterexample. Production files and behavior are unchanged. These
observed boundaries do not prove all browser scheduling, native filesystem or
cryptographic behavior; real-browser unit/Playwright obligations remain separate.
