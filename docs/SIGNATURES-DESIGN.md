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
  queue bounded verification for visible messages. Do not replace focused edits.
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
private keys or automatic signer invocation belong in these tests.
