// Room history detection (browser twin of vendor/agent-file-board/room_history.py).
// Pure verification and status rules: the host supplies every read, and nothing here
// writes to the board. Design: vendor/agent-file-board/docs/SIGNED-ROOM-HISTORY.md.
import { ed25519 } from "@noble/curves/ed25519.js";
import { b64, bytes, checkHash, checkIdentity, decode64, fields, hash, integer, pae, parse, publicKey, require } from "./signing-contract.js";

export const INVENTORY_TYPE = "application/vnd.agent-file-board.inventory.ed25519.v1+json";
export const MAX_ENTRIES = 1000, MAX_PAYLOAD = 512 * 1024, MAX_ENVELOPE = 768 * 1024, MAX_NODES = 16384, MAX_PREVIOUS = 16, MAX_MESSAGE = 4194304;
export const STATE_LIMIT = 32 * 1024 * 1024, SIGNER_QUOTA = 8 * 1024 * 1024, SCAN_CANDIDATES = 200, SCAN_BYTES = 16 * 1024 * 1024, NEGATIVE_CACHE = 4096, CLAIMS_SHOWN = 50, SIDECAR_LIMIT = 65536;
// Precedence of observed states (design section 4): first match wins.
export const OBSERVED = ["unverifiable", "conflicting-commitments", "changed", "message-unavailable", "signature-evidence-unavailable", "available"];
// Per-key source status, best first; revocation is checked before pins.
export const SOURCE = ["pinned-current", "previously-trusted", "unpinned", "revoked"];
export const ACTIVE = ["pinned-current", "previously-trusted"];
export const FOLDER_ONLY = "seen from this folder only; removals before this client's first check cannot be detected";
const HASH = /^[a-f0-9]{64}$/, RECORD = /^sig_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const ROOM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/, PAIR = /^[a-z][a-z0-9-]{2,63}--[a-z][a-z0-9-]{2,63}$/;
const MESSAGE_NAME = /^[A-Za-z0-9_.-]+\.txt$/, INVENTORY_NAME = /^([a-f0-9]{64})\.json$/;
const MESSAGE_PATH = /^[a-z][a-z0-9-]*\/[a-z0-9_-]+\/[A-Za-z0-9_.-]+\.txt$/;
const RESERVED_DIRECT = ["history", "identity", "rooms", "repairs", "presence"];

export class HistoryError extends Error {}
const refuse = (message) => { throw new HistoryError(message); };

export function directDirectory(config) {
  const board = config?.board, direct = board && typeof board === "object" && Object.hasOwn(board, "direct_directory") ? board.direct_directory : "direct";
  if (typeof direct !== "string" || RESERVED_DIRECT.includes(direct)) refuse("history-unavailable: direct directory name collides with board metadata");
  return direct;
}

export function checkScope(scope, config) {
  const direct = directDirectory(config), parts = typeof scope === "string" ? scope.split("/") : [];
  if (parts.length !== 2 || ![ "rooms", direct ].includes(parts[0]) || !(ROOM.test(parts[1]) || parts[0] === direct && PAIR.test(parts[1]))) refuse("scope not recognized: " + String(scope).slice(0, 120));
  return scope;
}

// Validates every rule on the parsed authenticated payload and never reserializes it.
export function checkStatement(statement, boardId, config, scope = null) {
  fields(statement, ["version", "boardId", "participant", "profile", "scope", "previous", "entries"]);
  if (!integer(statement, "version") || statement.version !== 1) refuse("unsupported inventory version");
  if (statement.boardId !== boardId) refuse("inventory board mismatch");
  checkScope(statement.scope, config);
  if (scope !== null && statement.scope !== scope) refuse("inventory stored under another scope");
  checkHash(statement.profile);
  const previous = statement.previous;
  if (!Array.isArray(previous) || previous.length > MAX_PREVIOUS || !previous.every((h) => typeof h === "string" && HASH.test(h)) || previous.some((h, i) => i && h <= previous[i - 1])) refuse("invalid previous observations");
  const entries = statement.entries;
  if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) refuse("invalid inventory entries");
  if (!entries.length && previous.length < 2) refuse("empty inventory is only valid as a merge observation");
  const paths = [], folded = new Set();
  for (const entry of entries) {
    fields(entry, ["path", "sha256", "bytes", "signature"]);
    const path = entry.path;
    // The same message path and participant rules as MessageContext.
    checkIdentity(boardId, statement.participant);
    require(typeof path === "string" && path.length <= 1024 && MESSAGE_PATH.test(path), "invalid physical board-relative message path");
    if (path.slice(0, path.lastIndexOf("/")) !== statement.scope) refuse("inventory entry outside its scope");
    checkHash(entry.sha256);
    if (!integer(entry, "bytes") || entry.bytes < 0 || entry.bytes > MAX_MESSAGE) refuse("invalid message byte count");
    const signature = entry.signature;
    if (signature !== null) {
      fields(signature, ["record", "sha256"]);
      if (typeof signature.record !== "string" || !RECORD.test(signature.record)) refuse("invalid signature locator");
      checkHash(signature.sha256);
    }
    if (folded.has(path.toLowerCase())) refuse("duplicate or case-aliased inventory path");
    folded.add(path.toLowerCase());
    paths.push(path);
  }
  if (paths.some((p, i) => i && p < paths[i - 1])) refuse("inventory entries must be sorted by path bytes");
  return statement;
}

// Own envelope reader: signing-contract's envelope() is limited to 64 KiB and 4,096
// nodes, but inventories may use 768 KiB, 512 KiB payloads and 16,384 nodes.
export function parseInventory(raw) {
  const envelope = parse(bytes(raw), MAX_ENVELOPE);
  fields(envelope, ["payloadType", "payload", "signatures"]);
  require(envelope.payloadType === INVENTORY_TYPE, "not an inventory payload type");
  require(Array.isArray(envelope.signatures) && envelope.signatures.length === 1, "inventory requires exactly one signature");
  const hint = envelope.signatures[0];
  fields(hint, ["keyid", "sig"]);
  require(typeof hint.keyid === "string" && hint.keyid.length <= 256, "invalid key hint");
  const payload = decode64(envelope.payload);
  require(payload.length <= MAX_PAYLOAD, "inventory payload exceeds budget");
  const signature = decode64(hint.sig);
  require(signature.length === 64, "Ed25519 signature must be 64 bytes");
  return { payload, signature, statement: parse(payload, MAX_PAYLOAD, MAX_NODES) };
}

export async function verifySignature(parsed, descriptor) {
  const key = await publicKey(descriptor);
  require(ed25519.verify(parsed.signature, pae(INVENTORY_TYPE, parsed.payload), key.raw, { zip215: false }), "invalid Ed25519 signature");
  return key.fingerprint;
}

export function keyStatus(signing, source) {
  if (signing.revoked[source.fingerprint] === "compromised") return "revoked";
  if (!Object.hasOwn(signing.pins, source.participant)) return "unpinned";
  return signing.pins[source.participant] === source.fingerprint ? "pinned-current" : "previously-trusted";
}

// -- observed state and row (Checkpoint.observed / Checkpoint.entry) ------------------

const best = (values, order) => values.reduce((a, b) => order.indexOf(b) < order.indexOf(a) ? b : a);
const commitmentKey = (c) => JSON.stringify([c.sha256, c.bytes, c.signature ? [c.signature.record, c.signature.sha256] : null]);

export function observedState(commitment, current, sidecars) {
  if (current === "error") return "unverifiable";
  if (current === null) return "message-unavailable";
  if (current.sha256 !== commitment.sha256 || current.bytes !== commitment.bytes) return "changed";
  if (commitment.signature) {
    const sidecar = Object.hasOwn(sidecars, commitment.signature.record) ? sidecars[commitment.signature.record] : null;
    if (sidecar === "error") return "unverifiable";
    if (sidecar === null) return "signature-evidence-unavailable";
    if (sidecar !== commitment.signature.sha256) return "changed";
  }
  return "available";
}

// commitments / statuses are keyed by source inventory hash. ack is
// {superseded, reviewedMatches} or null. Abstract inputs only, so frozen vectors apply.
export function entryRow({ path = "", commitments, statuses, current, sidecars, ack = null, unavailable = null, now = "" }) {
  const hashes = Object.keys(commitments), lapsed = !!ack && !ack.reviewedMatches;
  const acknowledged = new Set(hashes.filter((h) => ack && !lapsed && ack.superseded.includes(h) && statuses[h] !== "revoked"));
  const remaining = hashes.filter((h) => !acknowledged.has(h)), active = remaining.filter((h) => ACTIVE.includes(statuses[h]));
  let observed;
  if (!remaining.length) observed = "acknowledged";
  else {
    const pool = active.length ? active : remaining, values = new Map();
    for (const h of pool) values.set(commitmentKey(commitments[h]), commitments[h]);
    const states = new Set([...values.values()].map((c) => observedState(c, current, sidecars)));
    if (states.has("unverifiable")) observed = "unverifiable";
    else if (active.length && values.size > 1) observed = "conflicting-commitments";
    else observed = best([...states], OBSERVED);
  }
  const all = hashes.map((h) => statuses[h]), revoked = remaining.some((h) => statuses[h] === "revoked");
  const settled = ["available", "acknowledged"].includes(observed);
  const row = {
    path, observed, source: best(all, SOURCE), sources: SOURCE.filter((s) => all.includes(s)),
    needsAttention: !settled && (revoked || active.length > 0 && ["changed", "conflicting-commitments"].includes(observed)),
    neutral: all.every((s) => s === "unpinned")
  };
  if (ack) row.acknowledgement = lapsed ? "lapsed" : "current";
  if (unavailable) {
    if (observed === "message-unavailable") {
      if (!Object.hasOwn(unavailable, path)) unavailable[path] = now;
      row.unavailableSince = unavailable[path];
    } else delete unavailable[path];
  }
  return row;
}

// -- private checkpoint -------------------------------------------------------------

export function newState(boardId, root) {
  return { version: 1, boardId, sequence: 0, sources: {}, commitments: {}, profiles: {}, acknowledgements: {}, accepted: {},
    forgotten: { scopes: {}, observations: {} }, unavailable: {}, attempts: {}, invalid: [], capacity: {}, root, imported: [], staged: {} };
}

// Refuses (never resets) when the stored record belongs to another board UUID.
export function loadState(stored, boardId, root) {
  if (stored === null || stored === undefined) return newState(boardId, root);
  const template = newState(boardId, root);
  fields(stored, Object.keys(template));
  if (!integer(stored, "version") || stored.version !== 1) refuse("private history state unavailable");
  if (stored.boardId !== boardId) refuse("board UUID changed; private history cannot be reset by shared files");
  for (const key of ["sources", "commitments", "profiles", "acknowledgements", "accepted", "forgotten", "unavailable", "attempts", "capacity", "staged"]) {
    if (!stored[key] || typeof stored[key] !== "object" || Array.isArray(stored[key])) refuse("private history state unavailable");
  }
  if (!Array.isArray(stored.invalid) || !Array.isArray(stored.imported)) refuse("private history state unavailable");
  return stored;
}

const invalid = (reason, detail = { cache: true }) => ({ kind: "invalid-inventory", reason: String(reason).slice(0, 160), detail });

// Classifies one inventory: only invalid results are context-free. `ctx` is the
// viewer's signing Context (pins, learned revocations, profile lineage).
export async function verifyInventory(ctx, state, raw, scope) {
  let parsed;
  try {
    parsed = parseInventory(raw);
    checkStatement(parsed.statement, ctx.boardId, ctx.config, scope);
  } catch (error) {
    return invalid(error.message);
  }
  const statement = parsed.statement, participant = statement.participant;
  if (!Object.hasOwn(ctx.state.pins, participant)) return { kind: "unpinned-signer", reason: "participant not pinned on this client", detail: { participant } };
  let resolved;
  try { resolved = await ctx.resolve(participant); } catch (error) { return { kind: "pending-verification", reason: String(error.message).slice(0, 160), detail: { participant } }; }
  const profile = resolved.chain.find((p) => p.digest === statement.profile);
  if (!profile) return { kind: "unfamiliar-signer", reason: "profile outside accepted lineage", detail: { participant } };
  let fingerprint;
  try { fingerprint = await verifySignature(parsed, profile.descriptor); } catch (error) { return invalid(error.message); }
  for (const earlier of statement.previous) {
    const known = Object.hasOwn(state.sources, earlier) ? state.sources[earlier] : null;
    if (known && (known.participant !== participant || known.scope !== statement.scope)) return invalid("previous names another signer or scope", {});
  }
  const detail = { participant, fingerprint, statement };
  if (ctx.state.revoked[fingerprint] === "compromised") return { kind: "unfamiliar-signer", reason: "signer key compromised", detail: { ...detail, compromised: true } };
  const current = ctx.state.pins[participant] === fingerprint && resolved.head.fingerprint === fingerprint && !resolved.revoked[fingerprint];
  return current ? { kind: "trusted", reason: "pinned current key", detail } : { kind: "unfamiliar-signer", reason: "key is not this client's current pin", detail };
}

// Remembers a verified inventory's entries. Returns false (and flags the scope) when a
// quota is reached: coverage is never evicted silently.
export async function learn(ctx, state, digest, raw, detail, size) {
  const statement = detail.statement, participant = detail.participant;
  const used = Object.values(state.sources).filter((s) => s.participant === participant).reduce((n, s) => n + s.envelope.length, 0);
  const added = Math.floor(raw.length * 4 / 3) + 256 * statement.entries.length;
  if (used + added > SIGNER_QUOTA || size.total + added > STATE_LIMIT) { state.capacity[statement.scope] = "exhausted"; return false; }
  size.total += added;
  state.sequence++;
  state.sources[digest] = { participant, fingerprint: detail.fingerprint, profile: statement.profile, scope: statement.scope, previous: statement.previous,
    accepted: false, sequence: state.sequence, learned: new Date().toISOString().replace(/\.\d+Z$/, "Z"), envelope: b64(raw) };
  try { state.profiles[statement.profile] = b64(await ctx.load("profiles", statement.profile)); } catch { /* evidence stays in the shared folder */ }
  const paths = Object.hasOwn(state.commitments, statement.scope) ? state.commitments[statement.scope] : state.commitments[statement.scope] = {};
  for (const entry of statement.entries) {
    if (!Object.hasOwn(paths, entry.path)) paths[entry.path] = {};
    paths[entry.path][digest] = { sha256: entry.sha256, bytes: entry.bytes, signature: entry.signature };
  }
  delete state.attempts[digest];
  return true;
}

const cacheInvalid = (state, digest) => {
  if (!state.invalid.includes(digest)) {
    state.invalid.push(digest);
    state.invalid.splice(0, Math.max(0, state.invalid.length - NEGATIVE_CACHE));
  }
};

// Host contract (all async): listHistory(scope) -> names|null, readHistory(scope, name, limit) -> bytes|null,
// listMessages(scope) -> file names, readCurrent(path) -> {sha256,bytes}|null|"error",
// readSidecar(scope, record) -> sha256|null|"error", scopes() -> physical scopes.
export async function scan(ctx, state, host, scopes) {
  const diagnostics = {}, names = {};
  for (const scope of scopes) diagnostics[scope] = { "unpinned-signer": [], "unfamiliar-signer": [], "invalid-inventory": 0, "pending-verification": [], windowComplete: true };
  const invalidSet = new Set(state.invalid), candidates = [];
  for (const scope of scopes) {
    const listing = await host.listHistory(scope);
    names[scope] = new Set(listing || []);
    for (const name of [...(listing || [])].sort()) {
      if (name === ".DS_Store" || name.startsWith(".tmp-")) continue;
      const match = INVENTORY_NAME.exec(name);
      if (!match) { diagnostics[scope]["invalid-inventory"]++; continue; }
      const digest = match[1];
      if (Object.hasOwn(state.sources, digest) || Object.hasOwn(state.forgotten.observations, digest)) continue;
      if (invalidSet.has(digest)) { diagnostics[scope]["invalid-inventory"]++; continue; }
      candidates.push([scope, digest, name]);
    }
  }
  const referenced = new Set(Object.values(state.sources).flatMap((s) => s.previous)), attempts = state.attempts;
  const rank = (c) => [referenced.has(c[1]) ? 0 : 1, Object.hasOwn(attempts, c[1]) ? attempts[c[1]] : -1, c[1]];
  // Referenced first, then least recently attempted, then hash: file names chosen by
  // an attacker cannot move a candidate ahead of the others.
  candidates.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); });
  const size = { total: JSON.stringify(state).length };
  let checked = 0, read = 0;
  for (const [scope, digest, name] of candidates) {
    if (checked >= SCAN_CANDIDATES || read >= SCAN_BYTES) {
      diagnostics[scope]["pending-verification"].push({ observation: digest, reason: "verification budget reached" });
      diagnostics[scope].windowComplete = false;
      continue;
    }
    state.sequence++;
    attempts[digest] = state.sequence;
    const raw = await host.readHistory(scope, name, MAX_ENVELOPE);
    read += raw ? raw.length : 0;
    if (!raw || await hash(raw) !== digest) { cacheInvalid(state, digest); diagnostics[scope]["invalid-inventory"]++; continue; }
    checked++;
    const { kind, reason, detail } = await verifyInventory(ctx, state, raw, scope);
    if (kind === "trusted") {
      if (!await learn(ctx, state, digest, raw, detail, size)) diagnostics[scope]["pending-verification"].push({ observation: digest, reason: "checkpoint capacity" });
    } else if (kind === "invalid-inventory") {
      if (detail.cache) cacheInvalid(state, digest);
      diagnostics[scope]["invalid-inventory"]++;
    } else diagnostics[scope][kind].push({ observation: digest, reason, participant: detail.participant ?? null });
  }
  // Re-resolving every recorded signer, pinned or not, learns shared compromise
  // events; an unpin must not hide a revocation.
  for (const participant of [...new Set(Object.values(state.sources).map((s) => s.participant))].sort()) {
    try { await ctx.resolve(participant); } catch {
      for (const scope of scopes) if (Object.values(state.sources).some((s) => s.participant === participant && s.scope === scope)) diagnostics[scope].profileEvidenceUnavailable = true;
    }
  }
  return { diagnostics, names };
}

async function inBatches(items, size, work) {
  const results = [];
  for (let i = 0; i < items.length; i += size) results.push(...await Promise.all(items.slice(i, i + size).map(work)));
  return results;
}

// Scan then report every scope (Checkpoint.status). Display only: entries describe what
// a trusted, locally approved signer once observed; nothing here changes the board.
export async function evaluate(ctx, state, host, requested = null, now = new Date().toISOString().replace(/\.\d+Z$/, "Z")) {
  const scopes = [...new Set([...(requested || await host.scopes()), ...Object.keys(state.commitments)])].filter((scope) => {
    try { checkScope(scope, ctx.config); return true; } catch { return false; }
  }).sort();
  const { diagnostics, names } = await scan(ctx, state, host, scopes), report = {};
  for (const scope of scopes) {
    const paths = Object.hasOwn(state.commitments, scope) ? state.commitments[scope] : {}, rows = [];
    const covered = Object.keys(paths).filter((p) => Object.keys(paths[p]).length).sort();
    const view = await inBatches(covered, 8, async (path) => {
      const records = [...new Set(Object.values(paths[path]).filter((c) => c.signature).map((c) => c.signature.record))], sidecars = {};
      for (const record of records) sidecars[record] = await host.readSidecar(scope, record);
      return [path, await host.readCurrent(path), sidecars];
    });
    for (const [path, current, sidecars] of view) {
      const commitments = paths[path], statuses = {};
      for (const h of Object.keys(commitments)) statuses[h] = keyStatus(ctx.state, state.sources[h]);
      rows.push(entryRow({ path, commitments, statuses, current, sidecars, ack: null, unavailable: state.unavailable, now }));
    }
    const present = (await host.listMessages(scope)).map((name) => scope + "/" + name).sort();
    const uncovered = present.filter((p) => !Object.hasOwn(paths, p) || !Object.keys(paths[p]).length);
    const summary = {};
    for (const row of rows) { summary[row.observed] = (summary[row.observed] || 0) + 1; summary[row.source] = (summary[row.source] || 0) + 1; }
    const d = diagnostics[scope], notes = new Set(), setUp = rows.length > 0;
    if (!setUp) notes.add("not-set-up");
    if (uncovered.length) notes.add("uncovered");
    if (d.profileEvidenceUnavailable) notes.add("profile-evidence-unavailable");
    if (Object.hasOwn(state.capacity, scope)) notes.add("checkpoint-capacity-exhausted");
    for (const source of Object.values(state.sources)) {
      if (source.scope === scope) for (const earlier of source.previous) {
        if (!Object.hasOwn(state.sources, earlier) && !Object.hasOwn(state.forgotten.observations, earlier) && !names[scope].has(earlier + ".json")) notes.add("referenced-observation-unavailable");
      }
    }
    const claims = ["unpinned-signer", "unfamiliar-signer", "pending-verification"], inventories = {};
    for (const claim of claims) inventories[claim] = d[claim].slice(0, CLAIMS_SHOWN);
    inventories["invalid-inventory"] = d["invalid-inventory"];
    inventories.total = claims.reduce((n, claim) => n + d[claim].length, 0) + d["invalid-inventory"];
    const learned = Object.values(state.sources).filter((s) => s.scope === scope).map((s) => s.learned);
    report[scope] = {
      setUp, bootstrap: state.imported.includes(scope) ? "imported" : "folder-only", diagnostics: [...notes].sort(),
      needsAttention: rows.filter((r) => r.needsAttention).length, summary,
      coverage: { expected: rows.length, available: summary.available || 0, uncovered: uncovered.length },
      uncoveredPaths: uncovered.slice(0, CLAIMS_SHOWN), lastObservedLocal: learned.length ? learned.sort().at(-1) : null,
      windowComplete: d.windowComplete, pending: d["pending-verification"].length, inventories, entries: rows
    };
  }
  return { boardId: ctx.boardId, bootstrap: "folder-only", bootstrapNote: FOLDER_ONLY, scopes: report };
}
