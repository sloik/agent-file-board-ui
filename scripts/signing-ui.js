const signingProvider = new SigningContract.Provider();
let signingLocation = null, signingMode = "unsigned", signingAs = "", signingInspect = false;
const signingEligible = (m) => !m?.signing || m.signing.eligibility === "eligible";
// Signature integrity, local key approval and policy eligibility are independent facts.
function signingMessageSummary(m) {
  const f=m.signing || {}, text=(en,pl)=>exText(en,pl);
  const labels={valid:text("Signature verified","Podpis zweryfikowany"),unsigned:text("Unsigned message","Wiadomość bez podpisu"),invalid:text("Invalid signature","Nieprawidłowy podpis"),stripped:text("Signature removed","Usunięto podpis"),unavailable:text("Signature not verified yet","Podpis jeszcze niezweryfikowany")};
  const parts=[labels[f.signature] || text("Signature not checked","Podpis niesprawdzony")];
  if(f.signature==="valid") parts.push(f.trust==="trusted"?text("Signing key trusted by you","Ufasz kluczowi podpisu"):text("Signing key not approved by you","Nie zatwierdzono klucza podpisu"));
  const lifecycle={superseded:text("Older signing key","Starszy klucz podpisu"),retired:text("Signing key retired","Klucz podpisu wycofany"),compromised:text("Signing key compromised","Klucz podpisu przejęty")};
  if(lifecycle[f.lifecycle]) parts.push(lifecycle[f.lifecycle]);
  if(f.eligibility==="excluded") parts.push(text("Blocked by signing rules","Zablokowana przez reguły podpisów"));
  if(f.eligibility==="pending-verification") parts.push(text("Waiting for verification — inspection only","Oczekuje na weryfikację — tylko podgląd"));
  return parts.join(" · ");
}
function signingParticipantSummary(id,model=B) {
  const f=model?.signingParticipants?.[id];
  if(f?.unregistered) return exText("No signing key registered","Brak zarejestrowanego klucza podpisu");
  if(!f?.fingerprint) return exText("Current key unavailable","Bieżący klucz niedostępny");
  if(f.revoked) return exText("Current key revoked — do not use","Bieżący klucz unieważniony — nie używaj");
  if(f.trusted) return exText("Current key trusted by you","Ufasz bieżącemu kluczowi");
  return f.changed?exText("Key changed — review needed","Klucz zmieniony — wymaga sprawdzenia"):exText("Current key not approved by you","Nie zatwierdzono bieżącego klucza");
}
function signingMessageHtml(m) {
  const f=m.signing || {}, reason=f.reason && f.reason!=="verified" && f.reason!=="unsigned"?f.reason:"";
  return `<details class="signing-facts"><summary>${esc(signingMessageSummary(m))}</summary><p>${esc(exText("A verified signature proves these message bytes match the signing key. Your local key approval is separate; neither proves the claims in the message are true.","Zweryfikowany podpis potwierdza zgodność bajtów wiadomości z kluczem podpisu. Twoje lokalne zatwierdzenie klucza jest osobne; żadne nie potwierdza prawdziwości treści."))}</p>${f.fingerprint?`<p>${esc(exText("Signing key fingerprint","Odcisk klucza podpisu"))}: <code>${esc(f.fingerprint)}</code></p>`:""}${reason?`<p>${esc(reason)}</p>`:""}<p>${esc(exText("Open Signing in Tools to review keys or verify older messages.","Otwórz Podpisy w Narzędziach, aby sprawdzić klucze lub zweryfikować starsze wiadomości."))}</p></details>`;
}
function signingSender(fallback) {
  return signingMode === "signed" ? (SigningContract.require(signingAs, "Select an unlocked signing identity"), signingAs) : fallback;
}
async function signingRead(base, path, limit = 65536) {
  try {
    let dir = base;
    const parts = path.split("/");
    SigningContract.require(parts.every((p) => p && ![".", ".."].includes(p)), "unsafe signing path");
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    const file = await (await dir.getFileHandle(parts.at(-1))).getFile();
    SigningContract.require(file.size <= limit, "signing evidence byte budget");
    return await rawBytes(file);
  } catch (e) {
    if (e.name === "NotFoundError") return null;
    throw e;
  }
}
async function signingGet(key) {
  const db = await idb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv"), q = tx.objectStore("kv").get(key);
      tx.oncomplete = () => resolve(q.result);
      tx.onerror = () => reject(tx.error || Error("Private signing state unavailable"));
      tx.onabort = () => reject(tx.error || Error("Private signing state unavailable"));
    });
  } finally {
    db.close();
  }
}
let signingSavePending=0;
async function signingSave(model){signingSavePending++;try{return await signingSaveImpl(model);}finally{signingSavePending--;}}
async function signingSaveImpl(model) {
  if (!model.signingKey || !model.signingContext?.boardId) return;
  const raw = JSON.stringify(model.signingContext.state);
  SigningContract.require(new TextEncoder().encode(raw).length <= 8388608, "private signing history budget");
  const db = await idb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite"), store = tx.objectStore("kv"), q = store.get(model.signingKey);
      let conflict = false;
      q.onsuccess = () => {
        if (JSON.stringify(q.result ?? null) !== model.signingExpected) { conflict = true; tx.abort(); return; }
        store.put(JSON.parse(raw), model.signingKey);
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error("Private signing state unavailable"));
      tx.onabort = () => reject(Error(conflict ? "Private signing context changed in another tab; refresh and review" : "Private signing state unavailable"));
    });
    model.signingExpected = raw;
    model.signingContext.floor = model.signingContext.state.floor;
  } catch (error) {
    model.signingError = error.message;
    for (const m of model.msgs) m.signing = { eligibility: "pending-verification", signature: "unavailable", trust: "unknown", lifecycle: "unknown", reason: error.message };
    signingProvider.lock();
    throw error;
  } finally { db.close(); }
}
async function signingFresh(model, base, context, expected, source, sourceDigest) {
  const C = SigningContract;
  if (model.signingKey) C.require(JSON.stringify(await signingGet(model.signingKey) ?? null) === expected, "Private signing context changed; refresh and review");
  if (base) C.require(C.same(C.parse(await signingRead(base, "config.json")), context.config) && C.same(C.parse(await signingRead(base, "participants.json")), context.registry), "Board policy/profile changed; refresh and retry");
  if (source && base) {
    const raw = await signingRead(base, source.path, 4194304);
    C.require(raw && await C.hash(raw) === sourceDigest, "Reply source changed; refresh and review");
    const fresh = new C.Context(context.config, context.registry, context.read, structuredClone(context.state));
    C.require((await fresh.evaluate(source.path, parseHeaders(C.text(raw)).native.h, raw)).eligibility === "eligible", "Reply source excluded by signing requirements");
  }
}
async function prepareSigning(model, files, base = null) {
  if (model.layout.dialect !== "native") return;
  const C = SigningContract, location = base ? boardStorageId : "upload-session";
  if (signingLocation !== location) {
    signingProvider.lock();
    signingMode = "unsigned";
    signingAs = "";
    signingLocation = location;
  }
  const source = Object.fromEntries(files.map((f) => [f.path, f]));
  try {
    const metadata = async (path) => base ? await signingRead(base, path) : source[path]?.metadataFile ? await rawBytes(source[path].metadataFile) : C.bytes(source[path]?.text || "{}");
    const config = C.parse(await metadata("config.json")), registry = C.parse(await metadata("participants.json"));
    const key = base && !location.startsWith("session-") ? "signing-state:" + location : null, state = key ? await signingGet(key) : null;
    const read = async (path) => {
      if (base) return signingRead(base, path);
      const file = source[path]?.signingFile;
      if (!file) return null;
      C.require(file.size <= 65536, "signing evidence byte budget");
      return rawBytes(file);
    };
    const context = new C.Context(config, registry, read, state || null);
    model.signingExpected = JSON.stringify(state ?? null);
    model.signingContext = context;
    model.signingKey = key;
    model.signingRead = read;
    const candidates = model.msgs.slice(-200), set = new Set(candidates);
    for (const m of model.msgs) {
      if (!m.h.SIGNATURE && context.minimum(m.path, (m.h.THREAD || "").split("-")[0]) === "optional" && !context.state.messages[m.path]) {
        m.signing = { eligibility: "eligible", signature: "unsigned", trust: "unknown", lifecycle: "unknown", reason: "unsigned" };
        continue;
      }
      if (!set.has(m)) {
        m.signing = { eligibility: "pending-verification", signature: "unavailable", trust: "unknown", lifecycle: "unknown", reason: "Outside verification window; use Verify older messages" };
        continue;
      }
      C.require(!m.source?.file || m.source.file.size <= 4194304, "message byte budget");
      const raw = m.source?.file ? await rawBytes(m.source.file) : C.bytes(source[m.path]?.text || "");
      m.signing = await context.evaluate(m.path, m.h, raw);
    }
    model.signingParticipants = {};
    for(const p of registry.participants || []) {
      if(!p.identity){model.signingParticipants[p.id]={unregistered:true};continue;}
      try {
        const r=await context.resolve(p.id), fingerprint=r.head.fingerprint, pin=context.state.pins[p.id];
        model.signingParticipants[p.id]={fingerprint,trusted:pin===fingerprint,changed:!!pin && pin!==fingerprint,revoked:r.revoked[fingerprint] || null};
      } catch(e) { model.signingParticipants[p.id]={error:e.message}; }
    }
    await signingProvider.reconcile(context);
    await signingSave(model);
  } catch (e) {
    model.signingError = e.message;
    for (const m of model.msgs) m.signing = { eligibility: "pending-verification", signature: "unavailable", trust: "unknown", lifecycle: "unknown", reason: e.message };
    signingProvider.lock();
  }
}
function signingDraftStamp() {
  return JSON.stringify([composerStructured, [...document.querySelectorAll("#composer input,#composer textarea,#composer select,.choice-form input,.choice-form textarea,.choice-form select,.board-form input,.board-form textarea,.board-form select")].map((el) => [el.id, el.name, el.value, el.checked])]);
}
async function signingDelivery(msg, options = {}) {
  const model = options.model || B, base = options.base || baseHandle, C = SigningContract, origin = dirHandle, epoch = signingProvider.generation, stamp = signingDraftStamp(), expected = model?.signingExpected;
  C.require(model && !model.signingError, model?.signingError || "Open a board");
  const context = model.signingContext;
  if (!context) return { msg };
  const parsed = parseHeaders(msg.text).native, h = parsed.h;
  const source = model.msgs.find((m) => m.file === h["REPLY-TO"] && m.path.split("/").slice(0, -1).join("/") === msg.relPath.split("/").slice(0, -1).join("/"));
  C.require(!source || signingEligible(source), "Reply source excluded by signing requirements");
  if (source && base) C.require(source.source?.file && source.source.file.size <= 4194304, "Reviewed reply source unavailable or too large");
  const sourceDigest = source && base ? await C.hash(await rawBytes(source.source.file)) : null;
  if(h['ANSWER-STATE']&&sourceDigest)C.require(AnswerState.metadata(h,source?.h,jsonObject).questionDigest===sourceDigest,"ANSWER-STATE question bytes changed");
  const minimum = context.minimum(msg.relPath, (h.THREAD || "").split("-")[0]);
  if (signingMode !== "signed") {
    C.require(minimum === "optional", "Trusted signing required; unlock and trust a signing identity");
    return { msg, guard: async () => {
      C.require(origin === dirHandle && model === (options.model || B) && stamp === signingDraftStamp() && signingMode === "unsigned", "Posting context changed; review draft");
      await signingFresh(model, base, context, expected, source, sourceDigest);
      C.require(origin === dirHandle && model === (options.model || B) && stamp === signingDraftStamp() && signingMode === "unsigned", "Posting context changed; review draft");
    } };
  }
  C.require(h.FROM === signingAs, "Message author differs from selected signing identity");
  const current = await context.resolve(h.FROM), fp = current.head.fingerprint;
  C.require(!current.revoked[fp], "Signing key revoked");
  C.require(minimum !== "trusted" || context.state.pins[h.FROM] === fp, "Trust the verified current fingerprint before posting");
  const record = "sig_" + crypto.randomUUID(), message = msg.text.replace("\n---\n", "\nSIGNATURE: " + JSON.stringify({ version: 1, record }) + "\n---\n"), raw = C.bytes(message);
  const payload = C.canonical({ version: 1, boardId: context.boardId, participant: h.FROM, profile: current.head.digest, target: { kind: "message", path: msg.relPath, sha256: await C.hash(raw), bytes: raw.length } });
  const envelope = await signingProvider.sign(h.FROM, context, C.TYPES.message, payload);
  C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && stamp === signingDraftStamp() && signingMode === "signed" && signingAs === h.FROM, "Board, draft or signer changed; review and retry");
  if (base) {
    const cfg = await signingRead(base, "config.json"), reg = await signingRead(base, "participants.json");
    C.require(C.same(C.parse(cfg), context.config) && C.same(C.parse(reg), context.registry), "Board policy/profile changed; refresh and retry");
  }
  await C.verifyMessage(envelope, await context.load("profiles", current.head.digest), raw, { boardId: context.boardId, participant: h.FROM, profile: current.head.digest, path: msg.relPath });
  return { guard: async () => {
    C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && signingMode === "signed" && signingAs === h.FROM && stamp === signingDraftStamp(), "Posting context changed; draft preserved");
    await signingFresh(model, base, context, expected, source, sourceDigest);
    C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && signingMode === "signed" && signingAs === h.FROM && stamp === signingDraftStamp() && (minimum !== "trusted" || context.state.pins[h.FROM] === fp), "Posting context changed; draft preserved");
  }, msg: { ...msg, text: message }, sidecar: { path: msg.relPath.split("/").slice(0, -1).join("/") + "/.signatures/" + record + ".json", text: C.text(envelope) } };
}
async function signingDialog() {
  if (!B) {
    toast(t("e_open_first"));
    return;
  }
  document.querySelector("#signingDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "signingDialog";
  dialog.style = "max-width:760px;width:90vw";
  const title = document.createElement("h2");
  title.textContent = exText("Message signing", "Podpisywanie wiadomości");
  dialog.append(title);
  const status = document.createElement("p");
  status.role = "status";
  dialog.append(status);
  const explanation=document.createElement("p");
  explanation.textContent=exText("Trust is your approval of an exact participant key, stored only in this browser for this board location. Compare its fingerprint through a separate trusted channel before approving. A new key needs a new review. Signature verification checks message integrity; it does not prove a person's identity or the truth of their message.","Zaufanie oznacza Twoje zatwierdzenie konkretnego klucza uczestnika, zapisane tylko w tej przeglądarce dla tej lokalizacji tablicy. Przed zatwierdzeniem porównaj odcisk przez osobny zaufany kanał. Nowy klucz wymaga ponownego sprawdzenia. Weryfikacja podpisu sprawdza integralność wiadomości; nie dowodzi tożsamości osoby ani prawdziwości treści.");
  dialog.append(explanation);
  const people=document.createElement("div");people.className="signing-participants";dialog.append(people);
  const refresh = () => {
    people.replaceChildren();
    for(const p of Object.values(B.people)) {
      const row=document.createElement("p"), name=document.createElement("strong"), key=document.createElement("code");
      row.dataset.signingParticipant=p.id;name.textContent=`${p.name} (${p.id}): `;key.textContent=B.signingParticipants?.[p.id]?.fingerprint || "";
      row.append(name,signingParticipantSummary(p.id),document.createElement("br"),key);people.append(row);
    }
    status.textContent = B.signingError || `${signingMode === "signed" ? "Automatic signing after unlock" : "Unsigned mode"} · Signing as: ${signingAs || "none"} · Unlocked identities: ${signingProvider.catalog().map((p) => p.participant).join(", ") || "none"} · Excluded/pending: ${B.msgs.filter((m) => !signingEligible(m)).length}`;
    const facts = dialog.querySelector("pre");
    if (facts) facts.textContent = B.msgs.filter((m) => !signingEligible(m) || m.h.SIGNATURE).map((m) => m.path + "\n" + JSON.stringify(m.signing)).join("\n");
  };
  const add = (label, fn) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = label;
    b.onclick = async () => {
      b.disabled = true;
      try {
        refresh();
        const result = await fn();
        refresh();
        if (typeof result === "string") status.textContent = result;
      } catch (e) {
        status.textContent = e.message;
      } finally {
        b.disabled = false;
      }
    };
    dialog.append(b);
    return b;
  };
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = true;
  input.setAttribute("aria-label", "Private signing keys (kept only in this tab)");
  dialog.append(input);
  add("Unlock selected keys", async () => {
    SigningContract.require(B.signingContext, "Signing context unavailable");
    SigningContract.require(input.files.length > 0 && input.files.length <= 32, "Select 1–32 explicit private JWK files");
    for (const f of input.files) {
      SigningContract.require(f.size <= 16384, "Private key file too large");
      await signingProvider.unlock(new Uint8Array(await f.arrayBuffer()), B.signingContext);
    }
    input.value = "";
    signingMode = "signed";
    signingAs = signingProvider.catalog()[0]?.participant || "";
  });
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Signing identity");
  select.onfocus = () => {
    select.replaceChildren();
    for (const p of signingProvider.catalog()) {
      const o = document.createElement("option");
      o.value = p.participant;
      o.textContent = p.participant;
      select.append(o);
    }
    select.value = signingAs;
  };
  select.onchange = () => {
    signingAs = select.value;
    refresh();
  };
  dialog.append(select);
  add("Lock", () => {
    signingProvider.lock();
    signingAs = "";
  });
  add("Use unsigned mode", () => {
    signingProvider.lock();
    signingMode = "unsigned";
    signingAs = "";
  });
  const participant = document.createElement("select");
  participant.setAttribute("aria-label", "Trust participant");
  for (const p of B.signingContext?.registry.participants || []) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.id;
    participant.append(o);
  }
  dialog.append(participant);
  const fingerprint = document.createElement("input");
  fingerprint.placeholder = "Independently verified fingerprint";
  fingerprint.setAttribute("aria-label", fingerprint.placeholder);
  dialog.append(fingerprint);
  add("Inspect current profile", async () => {
    const r = await B.signingContext.resolve(participant.value);
    return JSON.stringify({ participant: participant.value, profile: r.head.digest, fingerprint: r.head.fingerprint, lifecycle: r.revoked[r.head.fingerprint] || "current" });
  });
  add("Trust exact fingerprint", async () => {
    const r = await B.signingContext.resolve(participant.value);
    SigningContract.require(fingerprint.value === r.head.fingerprint, "Fingerprint does not match verified current profile");
    B.signingContext.state.pins[participant.value] = fingerprint.value;
    await signingSave(B);
    if (baseHandle) await readFromHandle(true);
  });
  add("Remove trust", async () => {
    delete B.signingContext.state.pins[participant.value];
    await signingSave(B);
    if (baseHandle) await readFromHandle(true);
  });
  add("Adopt current policy floor", async () => {
    const c = B.signingContext;
    c.state.floor = SigningContract.mergeFloor(c.floor, c.shared, c.config);
    await signingSave(B);
  });
  add("Inspect excluded messages", () => {
    signingInspect = !signingInspect;
    build({ background: true, preserveComposer: true });
  });
  add("Verify older messages", async () => {
    const model = B, c = model.signingContext;
    for (const m of model.msgs.filter((m2) => m2.signing?.reason?.startsWith("Outside verification")).slice(-200)) {
      SigningContract.require(!m.source?.file || m.source.file.size <= 4194304, "message byte budget");
      const raw = m.source?.file ? await rawBytes(m.source.file) : SigningContract.bytes(m.source?.text || "");
      m.signing = await c.evaluate(m.path, m.h, raw);
    }
    await signingSave(model);
    if(B===model){
      await prepareAnswerStates(model);
      if(B===model)build({ background: true, preserveComposer: true });
    }
  });
  const list = document.createElement("pre");
  list.style = "white-space:pre-wrap;max-height:30vh;overflow:auto";
  list.textContent = B.msgs.filter((m) => !signingEligible(m) || m.h.SIGNATURE).map((m) => m.path + "\n" + JSON.stringify(m.signing)).join("\n");
  const technical=document.createElement("details"), technicalTitle=document.createElement("summary");
  technicalTitle.textContent=exText("Technical message evidence","Techniczne dane wiadomości");
  technical.append(technicalTitle,list);dialog.append(technical);
  add("Close", () => dialog.close());
  document.body.append(dialog);
  refresh();
  dialog.showModal();
}
function wireSigning() {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = exText("Signing", "Podpisy");
  b.id = "signingTools";
  b.onclick = signingDialog;
  $("#toolbarToolsPanel").append(b);
  setInterval(() => signingProvider.expire(), 3e4);
}
