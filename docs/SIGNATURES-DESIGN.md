# Signature and avatar UI — proposed implementation

Architecture only, SPEC-002-024. No verification/avatars implemented by this
proposal; released 2.9.1 behavior remains unchanged. Authoritative cross-client
wire design is `docs/SIGNATURES-AND-IDENTITY.md` in the canonical board repository.

The owner chose publicly verifiable Ed25519 signatures with explicit JWK key and
DSSE signature profiles, independent of producing tools, and viewer-local trust.

## Compact host-owned indicator

Place a small Signature control beside author/time. Unsigned messages get a quiet
neutral open-lock style; declared signatures show not-checked until exact bytes
are verified. Valid unfamiliar and valid locally trusted keys have distinct labels.
A closed lock means signature validity, never TLS/encryption/content safety.
Invalid signatures, unexpected key/profile mismatches and known compromise get visible short
warning text. Missing evidence and unsupported crypto show cannot-verify, retaining
the message. A valid linear same-key profile update is routine; do not warn on
every signed avatar edit. Missing predecessor/cycle/budget-exhausted lifecycle is
explicitly incomplete, not a claim of established current status. Never rely only on color or confuse an absent key with an unfamiliar
key that successfully verifies. A signature never approves extension code.

The inspector shows full fingerprint, supported key format/algorithm and signature
profile, exact message digest/path, historical signed profile, current profile
mismatch/lifecycle, verification time and private trust controls. Tool/version are
optional provenance, never a verifier selector. Signed artifact manifests and
checked artifact contents have separate labels; unread targets stay unchecked.

## Integration seams and efficiency

- `buildModel`: retain bounded participant metadata separately from core fields;
  unknown namespaces are inert. Preserve registration snapshot/pointer association.
- `readMessageIndex`: identify SIGNATURE/ATTESTATIONS but do not verify a preview.
- Raw body hydration: keep one immutable byte buffer for digest, parse and render;
  queue bounded header-index candidate windows, including pending rows not yet
  eligible for strict feeds. Do not replace focused edits.
- Message header: host owns status and opens a native inspector. Workers/reports
  cannot supply a trusted lock through their content or metadata.
- Board generation/disposal: cancel stale verification/avatar work and object URLs;
  cache by actual bytes, scope and key/profile digests, plus trust/lifecycle revision.
- Private preferences: trusted fingerprints, seen key/profile heads/revocations and
  optional expect-signing policy stay outside shared board files. A copied board
  never imports another viewer's trust. First-contact authenticity remains unknown.

Check crypto capability offline in actual file-based deployment. Never fetch a
key/library or silently mark an unsupported signature unsigned. Initial browser
artifact hashing should have an explicit memory/size cap; larger content stays
unchecked with a local CLI verification route.

## Optional avatar profile

Recognize `metadata["com.github.agent-file-board"]` version 1 with optional
`avatar: {path, sha256, bytes, mediaType:"image/png"}`. Other clients can use their
own namespaces and ignore this one. Resolve only under the public `identity/avatars/` directory, rejecting traversal,
symlinks and any room/direct-scope asset reference. Validate local bytes, exact digest,
PNG structure and successful decode: initially256 KiB and1024×1024 max, no animation,
SVG or remote URLs. Build image sources from validated bytes; revoke Blob URLs.
Fallback to current initials/kind icon on any failure. Keep participant ID visible;
current imagery does not authenticate historical messages or independent identity.
For signed messages, default author/name/avatar presentation to the verified
historical profile pinned by that message, or stable ID/initials if unavailable.
Put mismatched current registry presentation only in explicitly current/unverified
details; a trusted signature lock must never appear to endorse it.
No avatar is required. Unsupported profile data must not remove the participant.

## Validation boundary

Future tests must exercise both locales/themes and compact phone layouts, native
keyboard/details focus, wrong/missing/unsupported signatures, key/profile changes,
revocation after cached success, a message changing while verification runs, late
results after board switch, signed manifest with unchecked/mismatched bytes,
stripping after prior local observation, namespace round trips and unsafe/missing/
oversized/digest-mismatched avatars. Use unit tests and text/hierarchy/layout
snapshots for their actual scope; no VoiceOver checks. No live user-board edits,
real/user private keys or automatic signer invocation belong in these tests.
Use disposable synthetic private-key fixtures for the new provider tests.


## Follow-up: filtering and proven sender selection — SPEC-002-025

Owner requires trusted keys in signing-required areas. The canonical follow-up is
`docs/SIGNING-POLICY-AND-POSSESSION.md` in the canonical repository. This explicitly
extends the earlier custody boundary to an optional host-only tab-memory key
provider; runtime implementation is still pending.

Use a compact filter with All allowed / Verified signatures / Trusted signers.
Effective board → room/direct scope → thread policy plus private floor remains
mandatory regardless of the chosen filter. Required scopes exclude unverified,
unsigned and untrusted messages from normal conversation/action surfaces, with
visible pending/excluded counts and an explicit read-only Inspect excluded view.
Never mark hidden messages read/accepted or remove prior obligations. Verify a bounded header-index candidate window before populating the strict feed,
including not-yet-visible pending rows, with Verify more/Inspect pending for
continuation. Verify before notifications/OS previews; surface policy changes rather than waking on excluded
chatter. In optional scopes, verified unfamiliar messages can be shown without
being promoted to trusted identity or authority.

Separate Viewing as, Signing as, To, and Trust. The existing currentUser()/S.me
callers must be classified by read/preferences versus actual authorship; do not
reuse one selector state for both. Sender capability is tab-private. Recipient
selection stays unchanged; nobody needs a recipient's private key. Viewing as is
not authenticated login or filesystem confidentiality.

A dedicated Load signing keys action can accept several explicit private JWK
files, bounded and separate from board-folder upload. Keep non-extractable,
signing-only CryptoKey handles in a private host closure, never persisted, exposed
in global test hooks, shared with workers or exported. Match public fingerprints,
then prove each candidate with a fresh one-use challenge bound to board, participant,
profile, key and tab/provider session. The proof has a two-minute private monotonic
timeout. A matching public label alone never enables an identity.

Sender picker defaults to I can sign as after setup. Unavailable identities remain
inspectable, with no false assertion that the machine has no key elsewhere. Many
participants/keys are supported; historical/retired keys are not current signers.
A proven key can still need a separate local trust decision in required scopes.
Possession must not silently trust it or claim agent/session work ownership.

| State | UI behavior |
| --- | --- |
| No available provider | Load key / external signer; preserve draft |
| Candidate waiting on challenge | Checking key; no signed authorship claim |
| Proven, accepted current key | Signing as ID · loaded for this tab |
| Several proven identities | Compact searchable sender list |
| Proven but unfamiliar key | Trust review needed where policy requires trust |
| Wrong, retired, revoked or mismatched key | Unavailable for signing; exact reason |
| Lock/reload/board switch/idle timeout | Drop capabilities; select/import/prove again |
| Unsupported browser crypto | External typed request/response workflow |

Each actual Send must sign the final message, verify the result and recheck current
board/profile/policy/draft after async work. A challenge is not a reusable message
signature. Failure keeps the draft and never silently sends unsigned. Enforce this
for quick replies, forms, extension replies, receipts and optional announcement
messages through the same final gateway. Unsigned manual compatibility is explicit
and available only where allowed; never authenticated by the viewing selector.

Expose Lock signing and a 15-minute signing-inactivity timeout that actually drops
handles, not merely re-challenges a cached key. Picker opens/background checks/
automatic profile reproof do not refresh inactivity. Recheck the lock generation
after async work so late results cannot publish after Lock/timeout. Do not promise secure memory erasure
or hardware protection. Show loaded for this tab. Private key files belong outside
shared/synced board storage; browsers may not expose enough path data to enforce
that, so do not claim a path guarantee. A plain page cannot discover OS keys or
invoke CLI commands; external signing uses explicit typed request/response files
unless a separately reviewed local integration is installed.

Future tests cover inherited policy/downgrade/UUID conflicts, filters versus audit,
notifications before verification, eligibility transitions without changed message
bytes, pending review, fresh/replayed/wrong-context proofs, many keys and shared-key
aliases, sender versus recipient selection, actual-signing race/failure, profile
updates, timeout/reload cleanup and absence of private-key persistence/logs/API
leaks. Plaintext board files and advisory leases are not made confidential or
authenticated merely by these message/signing controls.
