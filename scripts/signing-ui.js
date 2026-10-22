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
  const previous = document.querySelector("#signingDialog");
  if (previous) {
    previous.cancelSigningUnlock?.();
    previous.close();
    previous.remove();
  }
  let model = B, busy = false, unlocking = false;
  const origin = dirHandle, base = baseHandle, location = signingLocation, boardId = B.signingContext?.boardId, C = SigningContract, text = exText;
  const dialog = document.createElement("dialog");
  dialog.id = "signingDialog";
  const node = (tag, content, parent, cls) => {
    const n = document.createElement(tag);
    if (content) n.textContent = content;
    if (cls) n.className = cls;
    if (parent) parent.append(n);
    return n;
  };
  const head = node("div", "", dialog, "vocabulary-head signing-head");
  node("h2", text("Message signing", "Podpisywanie wiadomości"), head);
  const close = node("button", text("Close", "Zamknij"), head, "btn");
  close.dataset.action = "close";
  const taskNav = node("nav", "", head, "signing-nav");
  taskNav.setAttribute("aria-label", text("Signing tasks", "Zadania podpisów"));
  for (const [task, label] of [["check", text("Check messages", "Sprawdź wiadomości")], ["review", text("Review a key", "Sprawdź klucz")], ["own", text("Sign as me", "Podpisuj jako ja")]]) {
    const jump = node("button", label, taskNav, "btn");
    jump.dataset.signingTask = task;
    jump.onclick = () => {
      const target = dialog.querySelector("#signing-" + task);
      target.scrollIntoView({ block: "start" });
      dialog.scrollTop = Math.max(0, dialog.scrollTop - head.getBoundingClientRect().height - 12);
      target.querySelector("h3").focus({ preventScroll: true });
    };
  }
  const cancelUnlock = () => {
    if (unlocking) {
      signingProvider.lock();
      unlocking = false;
    }
  };
  dialog.cancelSigningUnlock = cancelUnlock;
  close.onclick = () => {
    cancelUnlock();
    dialog.close();
  };
  dialog.addEventListener("cancel", cancelUnlock);
  dialog.addEventListener("close", cancelUnlock);
  node("p", text("Check received messages, review someone's key, or sign as yourself. Each task answers a different question.", "Sprawdź otrzymane wiadomości, klucz innej osoby lub podpisuj jako Ty. Każde zadanie odpowiada na inne pytanie."), dialog, "signing-intro");
  const guide = node("a", text("Illustrated signing guide ↗", "Ilustrowany przewodnik po podpisach ↗"), dialog);
  guide.href = "https://github.com/sloik/agent-file-board-ui/blob/main/docs/guides/signing.md";
  guide.target = "_blank";
  guide.rel = "noopener noreferrer";
  const status = node("p", "", dialog, "signing-context");
  status.role = "status";
  const example = node("details", "", dialog, "signing-example");
  node("summary", text("Example: Maya sends a signed message to Sam", "Przykład: Maya wysyła podpisaną wiadomość do Sama"), example);
  node("p", text("Fictional people; no real keys. Signing and approval are independent.", "Fikcyjne osoby; bez prawdziwych kluczy. Podpis i zatwierdzenie są niezależne."), example, "signing-help");
  const steps = node("ol", "", example, "signing-example-steps");
  for (const [title, body] of [
    [text("Maya signs → Sam verifies", "Maya podpisuje → Sam weryfikuje"), text("Signature verified · Key not approved. Sam knows the bytes match a key, but has not confirmed whose key it is.", "Podpis zweryfikowany · Klucz niezatwierdzony. Sam wie, że bajty pasują do klucza, ale nie potwierdził, czyj to klucz.")],
    [text("Sam compares → approves the exact key", "Sam porównuje → zatwierdza konkretny klucz"), text("Sam calls Maya using a known number and compares the full fingerprint. Only then does he approve it in task 2. His approval stays local.", "Sam dzwoni do Mai pod znany numer i porównuje cały odcisk. Dopiero wtedy zatwierdza go w zadaniu 2. Zatwierdzenie pozostaje lokalne.")],
    [text("Sam replies → unlocks his own key", "Sam odpowiada → odblokowuje własny klucz"), text("To sign a reply, Sam needs his own registered private key in task 3. Approving Maya's key does not let him sign as Maya. Neither signature proves a claim is true.", "Aby podpisać odpowiedź, Sam potrzebuje własnego zarejestrowanego klucza prywatnego w zadaniu 3. Zatwierdzenie klucza Mai nie pozwala mu podpisywać jako Maya. Żaden podpis nie dowodzi prawdziwości treści.")]
  ]) {
    const li = node("li", "", steps);
    node("strong", title, li);
    node("p", body, li);
  }
  const section = (id, title, help) => {
    const s = node("section", "", dialog, "signing-card");
    s.id = id;
    const h = node("h3", title, s);
    h.id = id + "-title";
    h.tabIndex = -1;
    s.setAttribute("aria-labelledby", h.id);
    node("p", help, s, "signing-help");
    return s;
  };
  const feedback = (s) => {
    const p = node("p", "", s, "signing-feedback");
    p.setAttribute("aria-live", "polite");
    return p;
  };
  const field = (s, title, tag, id, aria) => {
    const l = node("label", title, s, "signing-field");
    l.htmlFor = id;
    const n = node(tag, "", l);
    n.id = id;
    if (aria) n.setAttribute("aria-label", text(aria, title));
    return n;
  };
  const sameBoard = () => dirHandle === origin && signingLocation === location && B?.signingContext?.boardId === boardId && (base || B === model);
  const rebind = () => {
    C.require(sameBoard(), text("Board changed. Reopen Signing for the current board.", "Tablica zmieniła się. Otwórz ponownie Podpisy dla bieżącej tablicy."));
    if (model !== B) {
      model = B;
      reviewed = null;
    }
  };
  const active = () => {
    C.require(sameBoard() && dialog.isConnected && dialog.open, text("Board changed or window closed. Reopen Signing for the current board.", "Tablica zmieniła się lub okno jest zamknięte. Otwórz ponownie Podpisy dla bieżącej tablicy."));
    C.require(B === model, text("Board refreshed while working. Review the current key and retry.", "Tablica odświeżyła się podczas operacji. Sprawdź bieżący klucz i spróbuj ponownie."));
  };
  const actions = [];
  const add = (s, label, action, out, fn, available = () => true) => {
    const b = node("button", label, s, "btn");
    b.dataset.action = action;
    actions.push({ b, available });
    b.onclick = async () => {
      if (busy) return;
      busy = true;
      refresh();
      out.textContent = text("Working…", "Pracuję…");
      out.classList.remove("signing-error");
      try {
        rebind();
        refresh();
        active();
        const result = await fn();
        active();
        refresh();
        out.textContent = result || text("Done.", "Gotowe.");
      } catch (e) {
        out.textContent = e.message;
        out.classList.add("signing-error");
      } finally {
        busy = false;
        refresh();
      }
    };
    return b;
  };
  const check = section("signing-check", text("1. Check received messages", "1. Sprawdź otrzymane wiadomości"), text("A verified signature checks message integrity. Your approval of its key is a separate decision. Neither proves that the message is true.", "Zweryfikowany podpis sprawdza integralność wiadomości. Zatwierdzenie jej klucza jest osobną decyzją. Żadne nie dowodzi prawdziwości treści."));
  const counts = node("p", "", check, "signing-counts"), legend = node("dl", "", check, "signing-legend");
  for (const [name, meaning] of [
    [text("Verified + unapproved key", "Zweryfikowany + niezatwierdzony klucz"), text("Intact signature. Review the participant's key in task 2 before relying on who sent it.", "Poprawny podpis. Sprawdź klucz uczestnika w zadaniu 2, zanim zaufasz tożsamości nadawcy.")],
    [text("Unsigned", "Bez podpisu"), text("No cryptographic proof of the author. Board rules decide whether it can drive actions.", "Brak kryptograficznego potwierdzenia autora. Reguły tablicy określają, czy może wywoływać działania.")],
    [text("Pending or blocked", "Oczekująca lub zablokowana"), text("Pending needs checking. Blocked messages cannot drive actions; expand the message's status to see why.", "Oczekująca wymaga sprawdzenia. Zablokowana nie może wywoływać działań; rozwiń status wiadomości, aby poznać powód.")]
  ]) {
    node("dt", name, legend);
    node("dd", meaning, legend);
  }
  const checkOut = feedback(check), checkActions = node("div", "", check, "signing-actions");
  add(checkActions, text("Check next 200 older messages", "Sprawdź kolejne 200 starszych wiadomości"), "verify-older", checkOut, async () => {
    const pending = model.msgs.filter((m) => m.signing?.reason?.startsWith("Outside verification")).slice(-200), c = model.signingContext;
    for (const m of pending) {
      C.require(!m.source?.file || m.source.file.size <= 4194304, "message byte budget");
      const raw = m.source?.file ? await rawBytes(m.source.file) : C.bytes(m.source?.text || "");
      active();
      const result = await c.evaluate(m.path, m.h, raw);
      active();
      m.signing = result;
    }
    await signingSave(model);
    active();
    await prepareAnswerStates(model);
    active();
    build({ background: true, preserveComposer: true });
    return text(`Checked ${pending.length} older messages.`, `Sprawdzono starsze wiadomości: ${pending.length}.`);
  }, () => !!model.signingContext && model.msgs.some((m) => m.signing?.reason?.startsWith("Outside verification")));
  add(checkActions, text("Inspect excluded messages", "Pokaż wykluczone wiadomości"), "inspect-excluded", checkOut, () => {
    signingInspect = !signingInspect;
    build({ background: true, preserveComposer: true });
    return signingInspect ? text("Excluded messages are visible for inspection only. They remain blocked.", "Wykluczone wiadomości są widoczne tylko do podglądu. Nadal są zablokowane.") : text("Excluded messages are hidden again.", "Wykluczone wiadomości są ponownie ukryte.");
  });
  node("p", text("The newest 200 messages are checked on opening. Checking older messages does not approve keys or modify shared message files.", "Po otwarciu sprawdzanych jest 200 najnowszych wiadomości. Sprawdzanie starszych nie zatwierdza kluczy ani nie zmienia wspólnych plików wiadomości."), check, "signing-help");
  const review = section("signing-review", text("2. Review a participant key", "2. Sprawdź klucz uczestnika"), text("Compare the full fingerprint with the participant through a separate channel you already trust, such as an in-person conversation. A message on this board alone is not enough.", "Porównaj cały odcisk z uczestnikiem przez osobny zaufany kanał, np. podczas osobistej rozmowy. Sama wiadomość na tej tablicy nie wystarcza."));
  const participant = field(review, text("Participant to review", "Uczestnik do sprawdzenia"), "select", "signingParticipant", "Trust participant");
  for (const p of model.signingContext?.registry.participants || []) {
    const o = node("option", `${model.people[p.id]?.name || p.id} (${p.id})`, participant);
    o.value = p.id;
  }
  const keyCard = node("div", "", review, "signing-key-card"), keyName = node("strong", "", keyCard), keyState = node("p", "", keyCard), key = node("code", "", keyCard), keyHelp = node("p", "", keyCard, "signing-help");
  const inspectActions = node("div", "", review, "signing-actions");
  const fingerprint = field(review, text("Paste the fingerprint you independently confirmed", "Wklej niezależnie potwierdzony odcisk"), "input", "signingFingerprint", "Independently verified fingerprint");
  fingerprint.autocomplete = "off";
  fingerprint.spellcheck = false;
  fingerprint.placeholder = text("Exact fingerprint, including prefix", "Dokładny odcisk, łącznie z prefiksem");
  const reviewOut = feedback(review), reviewActions = node("div", "", review, "signing-actions");
  let reviewed = null, catalogStamp = null;
  participant.onchange = () => {
    reviewed = null;
    fingerprint.value = "";
    reviewOut.textContent = "";
    refresh();
  };
  add(inspectActions, text("Refresh key details", "Odśwież dane klucza"), "inspect-profile", reviewOut, async () => {
    const id = participant.value;
    let context;
    if (base) {
      // A native board can change on disk while this dialog remains open.
      // The normal reader rechecks policy, profile lineage and revocations.
      await reload(id);
      active();
      context = model.signingContext;
    } else {
      // An upload is an immutable File snapshot. A fresh Context rechecks the
      // actual uploaded profile/event bytes instead of reusing resolve's memo.
      context = new C.Context(model.signingContext.config, model.signingContext.registry,
        model.signingRead, structuredClone(model.signingContext.state));
    }
    const r = await context.resolve(id);
    active();
    C.require(id === participant.value, "Participant changed; review again");
    reviewed = { id, fingerprint: r.head.fingerprint, revoked: r.revoked[r.head.fingerprint] };
    const pin = model.signingContext.state.pins[id];
    model.signingParticipants[id] = { fingerprint: r.head.fingerprint,
      trusted: pin === r.head.fingerprint, changed: !!pin && pin !== r.head.fingerprint,
      revoked: r.revoked[r.head.fingerprint] || null };
    const source = base ? text("Key details refreshed from the board folder. No approval changed.", "Dane klucza odświeżono z folderu tablicy. Zatwierdzenie nie zmieniło się.") :
      text("Uploaded key evidence rechecked. This is a fixed snapshot; reopen the folder to see newer keys or revocations. No approval changed.", "Ponownie sprawdzono wczytane dane klucza. To stała kopia; otwórz folder ponownie, aby zobaczyć nowsze klucze lub unieważnienia. Zatwierdzenie nie zmieniło się.");
    return source + " " + (reviewed.revoked ? text("This key is revoked. Do not approve or use it. Ask the participant about recovery.", "Klucz jest unieważniony. Nie zatwierdzaj go ani nie używaj. Zapytaj uczestnika o odzyskanie dostępu.") :
      text("Compare the full fingerprint independently before approving.", "Przed zatwierdzeniem porównaj cały odcisk niezależnie."));
  }, () => !!model.signingContext && !!participant.value);
  const reload = async (participantId) => {
    if (base) {
      active();
      C.require(await readFromHandle(true), text("Board refresh was superseded. Retry to review current evidence.", "Odświeżanie tablicy zostało zastąpione. Spróbuj ponownie, aby sprawdzić bieżące dane."));
      C.require(sameBoard(), "Board changed; reopen Signing");
      model = B;
      reviewed = null;
    } else {
      // Uploaded File objects are the exact read-only snapshot already reviewed.
      // Re-run verification rather than deriving eligibility from the new pin.
      // Older messages outside the verification window remain pending until the
      // user explicitly asks to check them.
      const context = model.signingContext;
      const affected = model.msgs.filter(m => m.h.FROM === participantId &&
        m.h.SIGNATURE !== undefined && m.signing?.signature === "valid" &&
        !m.signing.reason?.startsWith("Outside verification"));
      for (const message of affected) {
        active();
        C.require(message.source?.file, "Uploaded message source unavailable; reopen the board");
        C.require(message.source.file.size <= 4194304, "message byte budget");
        const raw = await rawBytes(message.source.file);
        active();
        const result = await context.evaluate(message.path, message.h, raw);
        active();
        message.signing = result;
      }
      await prepareAnswerStates(model);
      active();
      build({ background: true, preserveComposer: true });
    }
  };
  add(reviewActions, text("Approve this exact key", "Zatwierdź ten konkretny klucz"), "trust", reviewOut, async () => {
    const id = participant.value, typed = fingerprint.value, r = await model.signingContext.resolve(id);
    active();
    C.require(id === participant.value && typed === fingerprint.value, "Key review changed; review again");
    C.require(typed === r.head.fingerprint, "Fingerprint does not match verified current profile");
    C.require(!r.revoked[r.head.fingerprint], "Signing key revoked");
    await signingFresh(model, base, model.signingContext, model.signingExpected);
    active();
    C.require(id === participant.value && typed === fingerprint.value, "Key review changed; review again");
    model.signingContext.state.pins[id] = typed;
    await signingSave(model);
    active();
    await reload(id);
    return text("Exact key approved locally. This does not approve message content or share your decision with others.", "Konkretny klucz zatwierdzono lokalnie. Nie oznacza to zatwierdzenia treści ani udostępnienia tej decyzji innym.");
  }, () => !!model.signingContext && !!model.signingParticipants?.[participant.value]?.fingerprint && !model.signingParticipants[participant.value].revoked);
  add(reviewActions, text("Remove my approval", "Usuń moje zatwierdzenie"), "remove-trust", reviewOut, async () => {
    const id = participant.value;
    delete model.signingContext.state.pins[id];
    await signingSave(model);
    active();
    await reload(id);
    return text("Local approval removed. No shared files were deleted. Stricter rules may now block affected messages.", "Usunięto lokalne zatwierdzenie. Nie usunięto wspólnych plików. Ostrzejsze reguły mogą teraz blokować te wiadomości.");
  }, () => !!model.signingContext?.state.pins[participant.value]);
  node("p", text("Approval belongs to this browser and board location. A changed key needs a new review. Removing approval does not revoke the participant's key.", "Zatwierdzenie dotyczy tej przeglądarki i lokalizacji tablicy. Zmieniony klucz wymaga nowego sprawdzenia. Usunięcie zatwierdzenia nie unieważnia klucza uczestnika."), review, "signing-help");
  const own = section("signing-own", text("3. Sign your messages", "3. Podpisuj własne wiadomości"), text("You need a private JWK key matching a current registered participant profile. Ask the board administrator to register your public key first. Never share your private key or put it in the board folder.", "Potrzebujesz prywatnego klucza JWK pasującego do bieżącego profilu uczestnika. Najpierw poproś administratora o rejestrację klucza publicznego. Nigdy nie udostępniaj prywatnego klucza ani nie zapisuj go w folderze tablicy."));
  const ownState = node("p", "", own, "signing-mode");
  ownState.id = "signingMode";
  const input = field(own, text("Private key files — stay in this tab", "Pliki kluczy prywatnych — pozostają w tej karcie"), "input", "signingKeyFiles", "Private signing keys (kept only in this tab)");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = true;
  const ownOut = feedback(own), ownActions = node("div", "", own, "signing-actions");
  add(ownActions, text("Unlock selected keys", "Odblokuj wybrane klucze"), "unlock", ownOut, async () => {
    C.require(input.files.length > 0 && input.files.length <= 32, "Select 1–32 explicit private JWK files");
    unlocking = true;
    const epoch = signingProvider.generation;
    try {
      for (const f of [...input.files]) {
        C.require(f.size <= 16384, "Private key file too large");
        const bytes = new Uint8Array(await f.arrayBuffer());
        active();
        await signingProvider.unlock(bytes, model.signingContext);
        active();
      }
    } catch (e) {
      if ((!dialog.open || !dialog.isConnected) && epoch === signingProvider.generation) signingProvider.lock();
      throw e;
    } finally {
      unlocking = false;
    }
    input.value = "";
    signingMode = "signed";
    signingAs = "";
    return text("Keys unlocked. Choose who to sign as below before sending. There is no unsigned fallback.", "Klucze odblokowano. Przed wysłaniem wybierz poniżej, jako kto podpisujesz. Nie ma automatycznego przejścia na brak podpisu.");
  }, () => !!base && !!model.signingContext && !model.signingError);
  const select = field(own, text("Choose who to sign as", "Wybierz, jako kto podpisujesz"), "select", "signingIdentity", "Signing identity");
  select.onchange = () => {
    try {
      rebind();
      active();
      C.require(!busy, "Signing operation in progress");
      signingAs = select.value;
      signingMode = "signed";
      ownOut.textContent = text("New messages will use this signing identity.", "Nowe wiadomości użyją tej tożsamości podpisu.");
      refresh();
    } catch (e) {
      ownOut.textContent = e.message;
    }
  };
  node("p", text("Unlocking proves key possession; it does not approve a key. The signer sets the message author. Your viewing identity is separate and controls which conversations you see.", "Odblokowanie potwierdza posiadanie klucza; nie zatwierdza go. Podpisujący określa autora wiadomości. Tożsamość przeglądania jest osobna i decyduje, jakie rozmowy widzisz."), own, "signing-help");
  const lockActions = node("div", "", own, "signing-actions");
  add(lockActions, text("Lock signing keys", "Zablokuj klucze podpisu"), "lock", ownOut, () => {
    signingProvider.lock();
    signingAs = "";
    return text("Keys locked. Signed sending stays blocked until you unlock and choose a signer again.", "Klucze zablokowano. Wysyłanie z podpisem jest zablokowane do ponownego odblokowania i wyboru podpisującego.");
  }, () => signingProvider.catalog().length > 0);
  add(lockActions, text("Use unsigned mode", "Używaj trybu bez podpisu"), "unsigned", ownOut, () => {
    signingProvider.lock();
    signingMode = "unsigned";
    signingAs = "";
    return text("Keys locked; unsigned mode selected. Sending is still refused where board rules require signing.", "Klucze zablokowano; wybrano tryb bez podpisu. Wysyłanie nadal jest odrzucane tam, gdzie reguły tablicy wymagają podpisu.");
  });
  node("p", text("Keys stay in this tab's memory and lock after inactivity. Lock when you step away. Signed posting requires a writable board folder. With a read-only upload, unsigned replies may download where rules allow; open the writable folder to sign.", "Klucze pozostają w pamięci tej karty i blokują się po bezczynności. Zablokuj je, gdy odchodzisz. Wysyłanie z podpisem wymaga zapisywalnego folderu tablicy. Przy wczytaniu tylko do odczytu odpowiedzi bez podpisu mogą być pobierane, jeśli reguły pozwalają; otwórz zapisywalny folder, aby podpisywać."), own, "signing-help");
  const advanced = node("details", "", dialog, "signing-card");
  advanced.id = "signing-advanced";
  node("summary", text("Advanced: policy and technical evidence", "Zaawansowane: reguły i dane techniczne"), advanced);
  node("p", text("Remember the current policy floor to keep future checks at least as strict if shared configuration is weakened. This local action cannot lower an existing floor.", "Zapamiętaj bieżące minimum reguł, aby zachować co najmniej taką surowość po osłabieniu wspólnej konfiguracji. Ta lokalna akcja nie może obniżyć istniejącego minimum."), advanced, "signing-help");
  const advancedOut = feedback(advanced);
  add(advanced, text("Adopt current policy floor", "Zapamiętaj bieżące minimum reguł"), "policy-floor", advancedOut, async () => {
    const c = model.signingContext;
    c.state.floor = C.mergeFloor(c.floor, c.shared, c.config);
    await signingSave(model);
    active();
    return text("Current policy floor remembered locally.", "Bieżące minimum reguł zapamiętano lokalnie.");
  }, () => !!model.signingContext);
  const technical = node("details", "", advanced);
  node("summary", text("Technical message evidence", "Techniczne dane wiadomości"), technical);
  const list = node("pre", "", technical);
  function refresh() {
    const ready = !!model.signingContext && !model.signingError;
    status.textContent = model.signingError ? text("Signing unavailable: ", "Podpisy niedostępne: ") + model.signingError : !model.signingContext ? text("Signing requires a native board with valid signing configuration. Continue reading, or open a native board.", "Podpisy wymagają natywnej tablicy z poprawną konfiguracją. Kontynuuj czytanie lub otwórz natywną tablicę.") : !base ? text("Read-only board: approval lasts for this open session. Signed posting requires a writable folder; unsigned replies may download where rules allow.", "Tablica tylko do odczytu: zatwierdzenie obowiązuje w tej otwartej sesji. Podpisywanie wymaga zapisywalnego folderu; odpowiedzi bez podpisu można pobrać, jeśli reguły pozwalają.") : text("Your approvals are private to this browser and board location.", "Twoje zatwierdzenia są prywatne dla tej przeglądarki i lokalizacji tablicy.");
    counts.textContent = [text("Verified", "Zweryfikowane") + ": " + model.msgs.filter((m) => m.signing?.signature === "valid").length, text("Unsigned", "Bez podpisu") + ": " + model.msgs.filter((m) => m.signing?.signature === "unsigned").length, text("Pending / blocked", "Oczekujące / zablokowane") + ": " + model.msgs.filter((m) => !signingEligible(m)).length].join(" · ");
    const id = participant.value, f = model.signingParticipants?.[id];
    if (f?.fingerprint) {
      const pin = model.signingContext?.state.pins[id];
      f.trusted = pin === f.fingerprint;
      f.changed = !!pin && pin !== f.fingerprint;
    }
    keyCard.dataset.signingParticipant = id;
    keyName.textContent = model.people[id] ? `${model.people[id].name} (${id})` : id || text("No registered participants", "Brak zarejestrowanych uczestników");
    keyState.textContent = signingParticipantSummary(id, model);
    key.textContent = (reviewed?.id === id ? reviewed.fingerprint : f?.fingerprint) || text("No current fingerprint available", "Brak bieżącego odcisku");
    keyHelp.textContent = f?.error || (f?.revoked ? text("Revoked keys must not be used. Approval cannot restore them.", "Unieważnionych kluczy nie wolno używać. Zatwierdzenie ich nie przywróci.") : f?.changed ? text("This differs from your approved key. Check with the participant before approving a replacement.", "Różni się od zatwierdzonego klucza. Skontaktuj się z uczestnikiem przed zatwierdzeniem zamiennika.") : text("Compare the entire fingerprint, including its prefix, not just the ending.", "Porównaj cały odcisk, łącznie z prefiksem, nie tylko końcówkę."));
    const catalog = signingProvider.catalog();
    const nextCatalogStamp = JSON.stringify(catalog.map(p=>[p.participant, model.people[p.participant]?.name]));
    if (catalogStamp !== nextCatalogStamp) {
      catalogStamp = nextCatalogStamp;
      select.replaceChildren();
      const placeholder = node("option", text("Choose who to sign as", "Wybierz, jako kto podpisujesz"), select);
      placeholder.value = "";
      for (const p of catalog) {
        const o = node("option", `${model.people[p.participant]?.name || p.participant} (${p.participant})`, select);
        o.value = p.participant;
      }
    }
    select.value = signingAs;
    ownState.textContent = signingMode === "unsigned" ? text("Unsigned mode: unlock keys and choose a signer to sign new messages.", "Tryb bez podpisu: odblokuj klucze i wybierz podpisującego, aby podpisywać nowe wiadomości.") : signingAs && catalog.some((p) => p.participant === signingAs) ? text("Signing new messages as: ", "Podpisujesz nowe wiadomości jako: ") + signingAs : text("Signed sending paused — unlock a key and choose who to sign as. No unsigned fallback.", "Wysyłanie z podpisem wstrzymane — odblokuj klucz i wybierz podpisującego. Brak przejścia na brak podpisu.");
    select.disabled = busy || !ready || !catalog.length;
    participant.disabled = busy || !ready;
    fingerprint.disabled = busy || !ready;
    input.disabled = busy || !ready;
    for (const { b, available } of actions) b.disabled = busy || !available();
    list.textContent = model.msgs.filter((m) => !signingEligible(m) || m.h.SIGNATURE).map((m) => m.path + "\n" + JSON.stringify(m.signing)).join("\n");
  }
  document.body.append(dialog);
  refresh();
  dialog.showModal();
  const timer = setInterval(() => {
    if (!dialog.open) {
      clearInterval(timer);
      return;
    }
    if (!busy && sameBoard()) {
      rebind();
      refresh();
    }
  }, 3e3);
  dialog.addEventListener("close", () => clearInterval(timer), { once: true });
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
