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


## AnswerAcceptance

`AnswerAcceptance.tla` models nine named messages: three disconnected first claims, an explicit legacy anchor,
one later ordinary history reply, two concurrent owner resolutions, a resolution
of those resolutions and an unauthorized record. Every arrival permutation and
one reversible trust-exclusion flag is explored (1024distinct faithful states).
The head projection must preserve recorded winners, expose multiple winners,
block missing/unauthorized/excluded evidence and converge independently of arrival
order. `NeverResolved` is a successful explicit-resolution reachability witness.
Four broken controls must fail: ignoring conflict, replacing first with later
history, ignoring excluded evidence and accepting an unauthorized resolution.

The trace collector invokes the production data-only resolver and records its
actual output for incremental snapshots, repeated reads and trust changes.
Matching implementation mutations must be rejected by the same model predicates.
Unit/CLI/browser tests separately exercise exact source identity/bytes, closed
metadata validation, question versions1/2/3, signing, publication, reconstruction
and explicit conflict controls. The model abstracts hashes as collision-free
identities and real validators/signing as eligibility. It does not prove crypto,
filesystem durability, UI rendering, global offline linearizability or all possible
implementation executions. Readers must receive the same complete evidence and
eligibility to claim convergence. See the answer-acceptance guide and reviewed
alignment registry; PR/main and weekly formal jobs use the existing status runner.

## ComposerSigning

`ComposerSigning.tla` models the composer signing status of SPEC-002-061, where the
signer is always the persona selected in "I am". Its `Status` mirrors the precedence of
`signingComposerStatus` in `scripts/signing-help.js` for the modelled inputs:
unavailable, then unsigned (signed mode off and the destination does not require
signatures), no-persona, read-only, not-registered, key-revoked, key-rotated,
needs-unlock, key-changed (an approval exists for an older fingerprint) and
needs-approval (no approval), both for required destinations only, and signed. This
evaluation order differs from the display order of `SIGNING_COMPOSER_ORDER` only in
where unsigned is decided. Personas A and B have registered keys, C has none and
"none" means no persona is selected. Actions are persona selection, destination
change, composer unlock of either key, lock, timer expiry, tick, an explicit review
approval of the persona's key (never implied by unlock), the composer "Turn signing
on" action (`TurnSigningOn`), the Signing dialog's signed/unsigned choice, revocation,
rotation, a signing context fault and reopening the folder read-only or writable.

A composer unlock binds signed mode only when the key belongs to the selected persona;
another participant's key joins the catalog and changes neither persona nor signer.
Expiry clears the catalog without updating the shown status; every other action,
including Send, recomputes it. Send recomputes the status and posts only when it is
`signed` (signed as the persona) or `unsigned`. Rotation and revocation remove that key
from the catalog, as provider key reconciliation does in `Signer`; rotation also drops
the approval, which becomes an approval of an older fingerprint (`oldPins`).

Invariants: `SignerIsPersona` (a signed post's signer is the persona at send time),
`NoUnsignedWhereRequired` (no unsigned post when the destination requires signatures
or signed mode is on), `ShownMatchesStatus` (the shown status equals `Status` except
after an expiry the composer has not observed yet), `SendRechecks` (send consults the
recomputed status, not the shown one) and `OtherKeyNeverBinds`. Four broken controls must
fail exactly these: a signer that sticks to the previous persona, an unsigned fallback,
a send that trusts the stale shown status after expiry, and another participant's key
binding silently. `NeverWitnessesAll` is a reachability control: one behavior shows
every status of `SIGNING_COMPOSER_ORDER` plus a signed and an unsigned post, in the
feasible order listed by `Witness` (revocation and approval are not undone).

`collect_composer.js` loads the production `signing-help.js` and `signing-ui.js` in a VM,
with stubs only for the provider catalog, folder access and the "I am" persona. It changes
host inputs (persona, catalog, mode, destination, approvals, fingerprints, revocation,
folder access, signing errors) as the composer events do. After every event it records
the status from the real `signingSendDecision`, the one decision that both the composer row
and `signingDelivery` use. On Send it records that decision's kind (signed, unsigned or
refused) and signs as `currentUser()`, which delivery requires to equal the message
author. TLC checks every record against `Initial`, `Step` and `Safe`, so `SignerIsPersona`,
`NoUnsignedWhereRequired` and `SendRechecks` are checked against the production decision.
Twelve fixed scenarios witness every status and both post kinds; eight seeded schedules
add random enabled events. Eight source mutations must be rejected: five in
`signingComposerStatus` (another unlocked key makes the persona ready, signed mode reports
unsigned, approval is skipped, a changed key reads as never approved, revocation is
ignored) and three in `signingSendDecision` (signing decided from signing mode instead of
the status, a refused send falls back to unsigned, the decision ignores the selected
persona). The cryptographic signing, the guards `signingDelivery` re-checks after each await,
key-file parsing and composer rendering are covered by `Signer` traces and by unit and
browser tests.
