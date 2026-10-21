import { ed25519 } from "@noble/curves/ed25519.js";
export const TYPES = { message: "application/vnd.agent-file-board.message.ed25519.v1+json", profile: "application/vnd.agent-file-board.profile.ed25519.v1+json", transition: "application/vnd.agent-file-board.key-transition.ed25519.v1+json", revocation: "application/vnd.agent-file-board.key-revocation.ed25519.v1+json", possession: "application/vnd.agent-file-board.possession.ed25519.v1+json" };
export const FP = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:";
const enc = new TextEncoder(), kinds = /* @__PURE__ */ new WeakMap();
export const bytes = (v) => typeof v === "string" ? enc.encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v);
export const text = (v) => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes(v));
export const require = (condition, message) => {
  if (!condition) throw Error(message);
};
export const hash = async (raw) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(raw))), (v) => v.toString(16).padStart(2, "0")).join("");
export const b64 = (raw) => btoa(Array.from(bytes(raw), (x) => String.fromCharCode(x)).join(""));
export const url64 = (raw) => b64(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export function decode64(value, key = false) {
  require(typeof value === "string" && (key ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9+/_-]*={0,2}$/).test(value), "malformed base64");
  const body = value.replace(/=+$/, ""), pad = value.length - body.length;
  require(!(/[+/]/.test(body) && /[-_]/.test(body)) && (!pad || value.length % 4 === 0 && pad === (4 - body.length % 4) % 4), "base64 alphabet/padding");
  let raw;
  try {
    raw = Uint8Array.from(atob(body.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - body.length % 4) % 4)), (c) => c.charCodeAt(0));
  } catch {
    throw Error("malformed base64");
  }
  require(url64(raw) === body.replaceAll("+", "-").replaceAll("/", "_"), "noncanonical base64 pad bits");
  return raw;
}
function decimal(s) {
  let [mantissa, exponent = "0"] = s.toLowerCase().split("e"), sign = mantissa[0] === "-" ? "-" : "";
  mantissa = mantissa.replace(/^-/, "");
  let [a, b = ""] = mantissa.split("."), digits = (a + b).replace(/^0+/, "");
  if (!digits) return "0";
  let scale = Number(exponent) - b.length;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    scale++;
  }
  return sign + digits + "e" + scale;
}
export function parse(raw, limit = 65536, nodeLimit = 4096) {
  raw = bytes(raw);
  require(raw.length <= limit, "JSON byte budget");
  const source = text(raw);
  let at = 0, nodes = 0;
  const ws = () => {
    while (/[ \r\n\t]/.test(source[at] || "!")) at++;
  };
  const str = () => {
    let start = at++;
    while (at < source.length) {
      const c = source[at++];
      if (c === "\\") {
        at++;
        continue;
      }
      if (c === '"') {
        const value = JSON.parse(source.slice(start, at));
        for (let i = 0; i < value.length; i++) {
          const code = value.charCodeAt(i);
          if (code >= 55296 && code <= 56319) {
            const next = value.charCodeAt(++i);
            require(next >= 56320 && next <= 57343, "unpaired Unicode surrogate");
          } else require(code < 56320 || code > 57343, "unpaired Unicode surrogate");
        }
        return value;
      }
    }
    throw Error("unterminated JSON string");
  };
  function read(depth) {
    require(depth <= 16 && ++nodes <= nodeLimit, "JSON structure budget");
    ws();
    const c = source[at];
    if (c === '"') return { value: str() };
    if (c === "{" || c === "[") {
      const map = c === "{", value2 = map ? /* @__PURE__ */ Object.create(null) : [], seen = /* @__PURE__ */ new Set(), types = /* @__PURE__ */ new Map();
      kinds.set(value2, types);
      at++;
      ws();
      if (source[at] === (map ? "}" : "]")) {
        at++;
        return { value: value2 };
      }
      for (; ; ) {
        ws();
        let key;
        if (map) {
          require(source[at] === '"', "JSON key");
          key = str();
          require(!seen.has(key), "duplicate JSON member");
          seen.add(key);
          require(++nodes <= nodeLimit, "JSON node budget");
          ws();
          require(source[at++] === ":", "JSON colon");
        } else key = String(value2.length);
        const item = read(depth + 1);
        value2[key] = item.value;
        if (item.kind) types.set(key, item.kind);
        ws();
        const next = source[at++];
        if (next === (map ? "}" : "]")) return { value: value2 };
        require(next === ",", "JSON delimiter");
      }
    }
    for (const [word, value2] of [["true", true], ["false", false], ["null", null]]) if (source.startsWith(word, at)) {
      at += word.length;
      return { value: value2 };
    }
    const match = source.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    require(match, "invalid JSON value");
    at += match[0].length;
    const value = Number(match[0]);
    require(Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER && decimal(match[0]) === decimal(String(value)), "lossy/nonfinite JSON number");
    return { value, kind: /[.eE]/.test(match[0]) ? "float" : "integer" };
  }
  const result = read(0);
  ws();
  require(at === source.length, "trailing JSON input");
  return result.value;
}
export const integer = (o, k) => typeof o[k] === "number" && Number.isSafeInteger(o[k]) && kinds.get(o)?.get(k) !== "float";
export function fields(value, names) {
  require(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("|") === [...names].sort().join("|"), "unsupported schema fields");
}
export function same(a, b, ak, bk) {
  if (typeof a !== typeof b || a === null || b === null) return a === b;
  if (typeof a === "number") return a === b && (ak || (Number.isInteger(a) ? "integer" : "float")) === (bk || (Number.isInteger(b) ? "integer" : "float"));
  if (typeof a !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k], kinds.get(a)?.get(k), kinds.get(b)?.get(k)));
}
export const canonical = (value) => bytes(JSON.stringify(value));
export function pae(type, payload) {
  const kind = bytes(type);
  payload = bytes(payload);
  const prefix = bytes("DSSEv1 " + kind.length + " " + type + " " + payload.length + " "), out = new Uint8Array(prefix.length + payload.length);
  out.set(prefix);
  out.set(payload, prefix.length);
  return out;
}
export async function publicKey(descriptor) {
  fields(descriptor, ["format", "algorithm", "key"]);
  require(descriptor.format === "jwk" && descriptor.algorithm === "Ed25519", "unsupported key format/algorithm");
  const key = descriptor.key;
  fields(key, ["kty", "crv", "x"]);
  require(key.kty === "OKP" && key.crv === "Ed25519", "unsupported key curve");
  const raw = decode64(key.x, true);
  require(raw.length === 32, "public key length");
  const p = ed25519.Point.fromBytes(raw, false);
  require(!p.isSmallOrder() && p.isTorsionFree(), "unsafe public point");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", canonical({ crv: key.crv, kty: key.kty, x: key.x })));
  return { raw, fingerprint: FP + url64(digest) };
}
export function envelope(raw, type, count = 1) {
  const e = parse(raw);
  fields(e, ["payloadType", "payload", "signatures"]);
  require(e.payloadType === type && Array.isArray(e.signatures) && e.signatures.length === count, "unsupported payload/signature count");
  const signatures = e.signatures.map((s) => {
    fields(s, ["keyid", "sig"]);
    require(typeof s.keyid === "string" && s.keyid.length <= 256, "key hint");
    const sig = decode64(s.sig);
    require(sig.length === 64, "signature length");
    return sig;
  });
  return { type, payload: decode64(e.payload), signatures };
}
export async function verifyEnvelope(raw, type, descriptors) {
  const e = envelope(raw, type, descriptors.length), unused = [...e.signatures], fingerprints = [];
  for (const descriptor of descriptors) {
    const key = await publicKey(descriptor), i = unused.findIndex((sig) => ed25519.verify(sig, pae(type, e.payload), key.raw, { zip215: false }));
    require(i >= 0, "invalid Ed25519 signature");
    unused.splice(i, 1);
    fingerprints.push(key.fingerprint);
  }
  return { ...e, fingerprints };
}
export function checkHash(value) {
  require(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "invalid SHA-256");
}
export function checkIdentity(boardId, participant) {
  require(typeof boardId === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(boardId), "invalid board UUID");
  require(typeof participant === "string" && /^[a-z][a-z0-9-]{2,63}$/.test(participant), "invalid participant ID");
}
export function snapshot(person) {
  require(person && typeof person === "object" && !Array.isArray(person) && !Object.hasOwn(person, "identity"), "invalid participant snapshot");
  checkIdentity("00000000-0000-0000-0000-000000000000", person.id);
  require(["human", "agent"].includes(person.kind), "invalid participant kind");
  if (person.language !== void 0) require(person.language && typeof person.language.preferred === "string" && /^[a-z][a-z0-9-]{1,63}$/.test(person.language.preferred), "invalid language");
  if (person.operator !== void 0) require(person.kind === "agent" && typeof person.operator === "string" && /^[a-z][a-z0-9-]{2,63}$/.test(person.operator), "invalid operator");
  require(canonical(person).length <= 32768, "snapshot budget");
  if (person.metadata !== void 0) {
    const m = person.metadata;
    require(m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length <= 32 && canonical(m).length <= 16384, "metadata budget");
    for (const key of Object.keys(m)) require(key.length <= 253 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(key), "metadata namespace");
    let nodes = 0;
    const walk = (v, d) => {
      require(d <= 8 && ++nodes <= 2048, "metadata structure budget");
      if (v && typeof v === "object") for (const [k, item] of Object.entries(v)) {
        if (!Array.isArray(v)) walk(k, d + 1);
        walk(item, d + 1);
      }
    };
    walk(m, 0);
  }
  return person;
}
export async function verifyProfile(raw, digest, boardId, participant) {
  checkHash(digest);
  require(bytes(raw).length <= 65536 && await hash(raw) === digest, "profile envelope hash mismatch");
  checkIdentity(boardId, participant);
  const candidate = envelope(raw, TYPES.profile), statement = parse(candidate.payload);
  fields(statement, ["version", "boardId", "previous", "participant", "publicKey"]);
  require(integer(statement, "version") && statement.version === 1 && statement.boardId === boardId && snapshot(statement.participant).id === participant, "profile binding mismatch");
  if (statement.previous !== null) checkHash(statement.previous);
  const verified = await verifyEnvelope(raw, TYPES.profile, [statement.publicKey]);
  return { payload: candidate.payload, digest, previous: statement.previous, snapshot: statement.participant, descriptor: statement.publicKey, fingerprint: verified.fingerprints[0] };
}
export function mirrorMatches(profile, person) {
  const mirror = /* @__PURE__ */ Object.create(null);
  const types = /* @__PURE__ */ new Map();
  for (const k of Object.keys(person)) if (k !== "identity") {
    mirror[k] = person[k];
    if (kinds.get(person)?.has(k)) types.set(k, kinds.get(person).get(k));
  }
  kinds.set(mirror, types);
  return same(profile.snapshot, snapshot(mirror));
}
export async function verifyMessage(raw, profileRaw, message, context) {
  checkIdentity(context.boardId, context.participant);
  checkHash(context.profile);
  require(typeof context.path === "string" && context.path.length <= 1024 && /^[a-z][a-z0-9-]*\/[a-z0-9_-]+\/[A-Za-z0-9_.-]+\.txt$/.test(context.path) && !context.path.split("/").some((p) => p === "." || p === ".."), "message path");
  const profile = await verifyProfile(profileRaw, context.profile, context.boardId, context.participant), e = await verifyEnvelope(raw, TYPES.message, [profile.descriptor]), s = parse(e.payload);
  fields(s, ["version", "boardId", "participant", "profile", "target"]);
  fields(s.target, ["kind", "path", "sha256", "bytes"]);
  require(integer(s, "version") && s.version === 1 && integer(s.target, "bytes") && s.boardId === context.boardId && s.participant === context.participant && s.profile === context.profile && s.target.kind === "message" && s.target.path === context.path && s.target.bytes === bytes(message).length && s.target.sha256 === await hash(message), "message bytes/context mismatch");
  return { ...profile, messagePayload: e.payload };
}
export function policy(value, config) {
  if (value === void 0) return { version: 1, minimum: "optional", scopes: {} };
  require(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((k) => ["version", "minimum", "scopes"].includes(k)) && integer(value, "version") && value.version === 1, "signing policy unavailable");
  const minimum = Object.hasOwn(value, "minimum") ? value.minimum : "optional", input = Object.hasOwn(value, "scopes") ? value.scopes : {};
  require(["optional", "trusted"].includes(minimum) && input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length <= 128, "signing policy minimum/scopes");
  const scopes = {}, direct = config.board?.direct_directory || "direct", digits = config.board?.thread_digits || 3;
  for (const [scope, rule] of Object.entries(input)) {
    const parts = scope.split("/");
    require(parts.length === 2 && ["rooms", direct].includes(parts[0]) && (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1]) || parts[0] === direct && /^[a-z][a-z0-9-]{2,63}--[a-z][a-z0-9-]{2,63}$/.test(parts[1])), "signing physical scope");
    require(rule && typeof rule === "object" && !Array.isArray(rule) && Object.keys(rule).every((k) => ["minimum", "threads"].includes(k)), "signing scope schema");
    const level = Object.hasOwn(rule, "minimum") ? rule.minimum : minimum, threads = Object.hasOwn(rule, "threads") ? rule.threads : {};
    require(["optional", "trusted"].includes(level) && !(minimum === "trusted" && level === "optional") && threads && typeof threads === "object" && !Array.isArray(threads) && Object.keys(threads).length <= 1024, "signing policy weakening");
    const cleaned = {};
    for (const [tid, r] of Object.entries(threads)) {
      fields(r, ["minimum"]);
      require(new RegExp("^T\\d{" + digits + "}$").test(tid) && ["optional", "trusted"].includes(r.minimum) && !(level === "trusted" && r.minimum === "optional"), "signing thread weakening/schema");
      cleaned[tid] = { minimum: r.minimum };
    }
    scopes[scope] = { minimum: level, threads: cleaned };
  }
  return { version: 1, minimum, scopes };
}
export function requirement(p, scope, thread) {
  const rule = p.scopes[scope] || {};
  return [p.minimum, rule.minimum, rule.threads?.[thread]?.minimum].includes("trusted") ? "trusted" : "optional";
}
export function mergeFloor(old, next, config) {
  const result = { version: 1, minimum: [old.minimum, next.minimum].includes("trusted") ? "trusted" : "optional", scopes: {} };
  for (const scope of /* @__PURE__ */ new Set([...Object.keys(old.scopes), ...Object.keys(next.scopes)])) {
    const threads = {};
    for (const tid of /* @__PURE__ */ new Set([...Object.keys(old.scopes[scope]?.threads || {}), ...Object.keys(next.scopes[scope]?.threads || {})])) threads[tid] = { minimum: [requirement(old, scope, tid), requirement(next, scope, tid)].includes("trusted") ? "trusted" : "optional" };
    result.scopes[scope] = { minimum: [requirement(old, scope, ""), requirement(next, scope, "")].includes("trusted") ? "trusted" : "optional", threads };
  }
  return policy(result, config);
}
export class Context {
  constructor(config, registry, read, state = null) {
    this.config = config;
    this.registry = registry;
    this.read = read;
    this.boardId = config.identity?.boardId ?? null;
    if (config.identity !== void 0) {
      require(config.identity && typeof config.identity === "object" && !Array.isArray(config.identity), "invalid identity configuration");
      if (Object.hasOwn(config.identity, "boardId")) checkIdentity(config.identity.boardId, "test-user");
    }
    this.state = state || { version: 1, boardId: this.boardId, floor: policy(void 0, config), pins: {}, heads: {}, revoked: {}, evidence: {}, messages: {} };
    fields(this.state, ["version", "boardId", "floor", "pins", "heads", "revoked", "evidence", "messages"]);
    require(integer(this.state, "version") && this.state.version === 1, "private signing state version");
    require(this.state.boardId === this.boardId, "board UUID changed; local signing trust/floor retained");
    for (const k of ["floor", "pins", "heads", "revoked", "evidence", "messages"]) require(this.state[k] && typeof this.state[k] === "object" && !Array.isArray(this.state[k]), "private signing state unavailable");
    this.shared = policy(config.message_signing, config);
    this.floor = policy(this.state.floor, config);
    const required = (p) => p.minimum === "trusted" || Object.values(p.scopes).some((r) => r.minimum === "trusted" || Object.values(r.threads).some((t) => t.minimum === "trusted"));
    require(this.boardId || !required(this.shared) && !required(this.floor), "signing policy requires a board UUID");
    this.memo = /* @__PURE__ */ new Map();
    this.raw = /* @__PURE__ */ new Map();
    this.used = 0;
  }
  person(id) {
    require(Array.isArray(this.registry.participants), "participant registry");
    const matches = this.registry.participants.filter((p) => p.id === id);
    require(matches.length === 1, "unknown/duplicate participant");
    return matches[0];
  }
  minimum(path, thread) {
    const scope = path.split("/").slice(0, 2).join("/");
    return [requirement(this.shared, scope, thread), requirement(this.floor, scope, thread)].includes("trusted") ? "trusted" : "optional";
  }
  async load(kind, digest) {
    checkHash(digest);
    const key = kind + "/" + digest;
    if (this.raw.has(key)) return this.raw.get(key);
    require(this.raw.size < 128, "lifecycle envelope budget");
    let raw = await this.read("identity/" + kind + "/" + digest + ".json");
    if (raw === null || raw === void 0) {
      require(this.state.evidence[key], "required lifecycle evidence missing");
      raw = decode64(this.state.evidence[key]);
    }
    raw = bytes(raw);
    require(raw.length <= 65536 && await hash(raw) === digest, "lifecycle evidence hash/size");
    this.used += raw.length;
    require(this.used <= 4194304, "lifecycle byte budget");
    this.raw.set(key, raw);
    return raw;
  }
  async resolve(id) {
    if (this.memo.has(id)) return this.memo.get(id);
    const person = this.person(id), locator = person.identity;
    require(locator && integer(locator, "version") && locator.version === 1 && Object.keys(locator).every((k) => ["version", "profile", "events"].includes(k)), "profile unavailable");
    checkHash(locator.profile);
    const refs = locator.events || [];
    require(Array.isArray(refs) && refs.length <= 64 && refs.every((r, i) => {
      checkHash(r);
      return !i || r > refs[i - 1];
    }), "event locator");
    let digest = locator.profile;
    const chain = [], seen = /* @__PURE__ */ new Set(), profiles = /* @__PURE__ */ new Map();
    while (digest !== null) {
      require(chain.length < 64 && !seen.has(digest), "lifecycle predecessor budget/cycle");
      seen.add(digest);
      const raw = await this.load("profiles", digest), p = await verifyProfile(raw, digest, this.boardId, id);
      profiles.set(digest, p);
      chain.push(p);
      digest = p.previous;
    }
    chain.reverse();
    require(!this.state.heads[id] || seen.has(this.state.heads[id]), "profile rollback or conflicting head");
    const eventRefs = /* @__PURE__ */ new Set([...refs, ...Object.keys(this.state.evidence).filter((k) => k.startsWith("events/")).map((k) => k.slice(7))]);
    require(eventRefs.size <= 64, "event budget");
    const transitions = /* @__PURE__ */ new Map(), revoked = { ...this.state.revoked }, events = [];
    for (const ref of [...eventRefs].sort()) {
      const raw = await this.load("events", ref), e = parse(raw), s = parse(decode64(e.payload));
      if (s.boardId !== this.boardId || s.participant !== id) {
        require(!refs.includes(ref), "lifecycle event context mismatch");
        continue;
      }
      require(integer(s, "version") && s.version === 1, "lifecycle version");
      if (e.payloadType === TYPES.transition) {
        fields(s, ["version", "boardId", "participant", "fromProfile", "toProfile"]);
        require(seen.has(s.fromProfile), "transition authorizer outside lineage");
        for (const d of [s.fromProfile, s.toProfile]) if (!profiles.has(d)) profiles.set(d, await verifyProfile(await this.load("profiles", d), d, this.boardId, id));
        const old = profiles.get(s.fromProfile), next = profiles.get(s.toProfile);
        require(next.previous === old.digest && next.fingerprint !== old.fingerprint, "transition endpoints");
        await verifyEnvelope(raw, TYPES.transition, [old.descriptor, next.descriptor]);
        require(!transitions.has(old.digest) || transitions.get(old.digest) === next.digest, "conflicting transitions");
        transitions.set(old.digest, next.digest);
      } else if (e.payloadType === TYPES.revocation) {
        require(["version", "boardId", "participant", "authorizingProfile", "keyId", "status"].every((k) => Object.hasOwn(s, k)) && Object.keys(s).every((k) => ["version", "boardId", "participant", "authorizingProfile", "keyId", "status", "reason"].includes(k)), "revocation schema");
        const p = profiles.get(s.authorizingProfile);
        require(p && seen.has(p.digest) && p.fingerprint === s.keyId && ["retired", "compromised"].includes(s.status), "revocation authority");
        require(s.reason === void 0 || typeof s.reason === "string" && [...s.reason].length <= 2e3, "revocation reason");
        await verifyEnvelope(raw, TYPES.revocation, [p.descriptor]);
        if (revoked[p.fingerprint] !== "compromised") revoked[p.fingerprint] = s.status;
      } else throw Error("unsupported lifecycle event");
      events.push(s);
      this.state.evidence["events/" + ref] = b64(raw);
    }
    for (let i = 1; i < chain.length; i++) require(chain[i - 1].fingerprint === chain[i].fingerprint || transitions.get(chain[i - 1].digest) === chain[i].digest, "key rotation authorization missing");
    const head = chain.at(-1);
    require(mirrorMatches(head, person), "current profile mirror mismatch");
    for (const [d] of profiles) this.state.evidence["profiles/" + d] = b64(await this.load("profiles", d));
    this.state.heads[id] = head.digest;
    this.state.revoked = revoked;
    const result = { head, chain, revoked, events };
    this.memo.set(id, result);
    return result;
  }
  async evaluate(path, headers, message) {
    const minimum = this.minimum(path, (headers.THREAD || "").split("-")[0]), result = { eligibility: "eligible", signature: "unsigned", trust: "unknown", lifecycle: "unknown", minimum, reason: "unsigned" };
    if (headers.SIGNATURE === void 0) {
      if (this.state.messages[path]) Object.assign(result, { eligibility: "excluded", signature: "stripped", reason: "previously verified signature was stripped" });
      else if (minimum === "trusted") Object.assign(result, { eligibility: "excluded", reason: "trusted signature required" });
      return result;
    }
    try {
      const ref = parse(bytes(headers.SIGNATURE));
      fields(ref, ["version", "record"]);
      require(integer(ref, "version") && ref.version === 1 && typeof ref.record === "string" && /^sig_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(ref.record), "signature locator");
      const raw = await this.read(path.split("/").slice(0, -1).join("/") + "/.signatures/" + ref.record + ".json");
      require(raw, "signature sidecar missing");
      const s = parse(envelope(raw, TYPES.message).payload), profileRaw = await this.load("profiles", s.profile);
      require(bytes(message).length <= 4194304, "message byte budget");
      const verified = await verifyMessage(raw, profileRaw, message, { boardId: this.boardId, participant: headers.FROM, profile: s.profile, path });
      Object.assign(result, { signature: "valid", fingerprint: verified.fingerprint, profile: s.profile });
      this.state.messages[path] = { sha256: await hash(message), profile: s.profile, keyId: verified.fingerprint };
      while (Object.keys(this.state.messages).length > 1024) delete this.state.messages[Object.keys(this.state.messages)[0]];
      const current = await this.resolve(headers.FROM);
      require(current.chain.some((p) => p.digest === s.profile), "message profile outside accepted lineage");
      const revoked = current.revoked[verified.fingerprint];
      result.lifecycle = revoked || (verified.fingerprint === current.head.fingerprint ? "current" : "superseded");
      result.trust = this.state.pins[headers.FROM] === verified.fingerprint ? "trusted" : "unfamiliar";
      if (revoked || minimum === "trusted" && (result.trust !== "trusted" || result.lifecycle !== "current")) Object.assign(result, { eligibility: "excluded", reason: revoked || "trusted current non-revoked key required" });
      else result.reason = "verified";
    } catch (e) {
      result.eligibility = /missing|unavailable|unsupported.*crypto/i.test(e.message) ? "pending-verification" : "excluded";
      result.reason = String(e.message).slice(0, 160);
      if (result.signature !== "valid") result.signature = result.eligibility === "pending-verification" ? "unavailable" : "invalid";
    }
    return result;
  }
}
export class Provider {
  #keys = /* @__PURE__ */ new Map();
  #epoch = 0;
  #activity = 0;
  #board = null;
  lock() {
    this.#keys.clear();
    this.#epoch++;
    this.#activity = 0;
    this.#board = null;
  }
  get generation() {
    this.expire();
    return this.#epoch;
  }
  expire() {
    if (this.#keys.size && performance.now() - this.#activity >= 9e5) this.lock();
  }
  catalog() {
    this.expire();
    return [...this.#keys.values()].map(({ participant, profile, fingerprint }) => ({ participant, profile, fingerprint }));
  }
  async unlock(raw, context) {
    this.expire();
    const epoch = this.#epoch, board = context.boardId;
    require(!this.#board || this.#board === board, "lock before changing board");
    require(this.#keys.size < 32, "signer catalog budget");
    let jwk;
    try { jwk = parse(raw, 16384); } catch { throw Error("Invalid private JWK"); }
    fields(jwk, ["kty", "crv", "x", "d"]);
    const seed = decode64(jwk.d, true);
    require(seed.length === 32, "private seed length");
    const descriptor = { format: "jwk", algorithm: "Ed25519", key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x } }, pub = await publicKey(descriptor);
    let key;
    try {
      key = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
    } catch {
      throw Error("Private key import unavailable or invalid");
    } finally {
      seed.fill(0);
      jwk.d = "";
    }
    require(epoch === this.#epoch, "signer locked");
    const matches = [];
    for (const p of context.registry.participants || []) {
      if (!p.identity) continue;
      try {
        const current = await context.resolve(p.id);
        if (current.head.fingerprint === pub.fingerprint && !current.revoked[pub.fingerprint]) matches.push({ participant: p.id, profile: current.head.digest, fingerprint: pub.fingerprint, descriptor: current.head.descriptor });
      } catch {
      }
    }
    require(matches.length, "key has no usable registered current profile");
    require((/* @__PURE__ */ new Set([...this.#keys.keys(), ...matches.map((m) => m.participant)])).size <= 32, "signer catalog budget");
    for (const binding of matches) {
      await this.#prove(key, binding, board, epoch);
      require(epoch === this.#epoch, "signer locked");
      this.#keys.set(binding.participant, { ...binding, key });
    }
    this.#board = board;
    this.#activity = performance.now();
    return this.catalog();
  }
  async #prove(key, binding, board, epoch) {
    const started = performance.now(), nonce = url64(crypto.getRandomValues(new Uint8Array(32))), payload = canonical({ version: 1, boardId: board, participant: binding.participant, profile: binding.profile, keyId: binding.fingerprint, purpose: "browser-signing-session", nonce }), signature = new Uint8Array(await crypto.subtle.sign("Ed25519", key, pae(TYPES.possession, payload)));
    require(epoch === this.#epoch && performance.now() - started < 12e4, "possession proof expired/locked");
    const pub = await publicKey(binding.descriptor);
    require(ed25519.verify(signature, pae(TYPES.possession, payload), pub.raw, { zip215: false }), "private/public possession mismatch");
  }
  async sign(participant, context, type, payload) {
    this.expire();
    const epoch = this.#epoch, binding = this.#keys.get(participant);
    require(binding && context.boardId === this.#board, "unlock a registered signing identity");
    const current = await context.resolve(participant);
    require(current.head.fingerprint === binding.fingerprint && !current.revoked[binding.fingerprint], "signing key changed or revoked");
    if (current.head.digest !== binding.profile) {
      await this.#prove(binding.key, { ...binding, profile: current.head.digest }, this.#board, epoch);
      binding.profile = current.head.digest;
    }
    const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", binding.key, pae(type, payload)));
    this.expire();
    require(epoch === this.#epoch && this.#keys.get(participant) === binding, "signer locked during operation");
    const result = canonical({ payloadType: type, payload: b64(payload), signatures: [{ keyid: binding.fingerprint, sig: b64(signature) }] });
    await verifyEnvelope(result, type, [current.head.descriptor]);
    this.#activity = performance.now();
    return result;
  }
}
