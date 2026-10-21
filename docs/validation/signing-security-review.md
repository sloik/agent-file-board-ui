# Signing release review — 2026-10-21

Independent read-only agent review plus parent verification of SPEC-002-034.
This is a source/security review, not an independent professional cryptographic
audit. Existing frozen Ed25519/DSSE vectors remain independently checked by
OpenSSL, libsodium and browser Noble.

## Findings and dispositions

1. **Late UI publication after lock/context change — fixed.** Guards now run
   after writer acquisition and after writing, before close/commit. Delayed-writer
   regressions lock in both windows and assert no final message and draft retained.
2. **Stale tabs overwriting private trust/floors — fixed.** IndexedDB writes use
   transactional expected-state CAS; stale writes fail closed. Publication also
   compares persisted context. Two real browser tabs prove adopted floors and
   removed pins survive a stale writer, and a prepared packet refuses publication.
3. **CLI stale private floor during external publication — fixed.** Both sidecar
   and final message publication recheck persisted private revision, current
   requirements, shared metadata and current key immediately before atomic link.
   A newly adopted floor invalidates the previously prepared publication.
4. **Portable replies bypassing fresh source eligibility — fixed.** Common CLI
   publication revalidates the source. UI binds to reviewed snapshot bytes and
   rechecks current bytes and receiver eligibility. Tampered/changed sources refuse.
5. **Unrelated participants exhausting a64-event budget — fixed.** Learned event
   discovery is filtered by board/participant before that participant's cap.
   Aggregate envelope/byte and private-history budgets remain separate and bounded.
6. **Upload/older verification allocating before limits — fixed.** File size is
   checked before reading public evidence or full older message bytes.

Refresh also clears browser capabilities after registered key rotation,
revocation or unavailable identity. Background reconciliation never renews the
actual-activity timer. Provider errors do not echo malformed private input.

The independent reviewer re-ran canonical signing-runtime14/14 and UI16/16 focused
checks after the initial fixes. Parent regressions additionally cover reviewed
source bytes, capability reconciliation and full source/version integration.
Final release evidence is recorded by SPEC-002-035.
