const signingProvider = new SigningContract.Provider();
// The signer is always the persona selected in "I am" (SPEC-002-061); there is no separate signer choice.
let signingLocation = null, signingMode = "unsigned", signingInspect = false;
const signingEligible = (m) => !m?.signing || m.signing.eligibility === "eligible";
let signingKnown = {}, signingNoticeKey = "", signingNoticeStatus = null, signingComposerNote = null;
// Remember which fingerprint each unlocked key had, so a later lock can be told apart:
// rotated or revoked on the board, or merely expired.
function signingNoteCatalog() {
  for (const p of signingProvider.catalog()) signingKnown[p.participant] = p.fingerprint;
}
function signingDestinationPath() {
  const where = $("#cWhere")?.value || "", newRoom = slugify($("#cNewRoom")?.value || ""), L = B.layout;
  const th = $("#cThread")?.value ? threadsOf()[$("#cThread").value] : null;
  let dir = "", top = L.roomsDir;
  if (where.startsWith("direct:")) { top = L.directDir; dir = where.slice(7); }
  else if (where === "newdirect") { top = L.directDir; dir = [currentUser(), $("#cTo")?.value].sort().join("--"); }
  else dir = newRoom || where.slice(5);
  return { path: `${top}/${dir}/x.txt`, thread: newRoom ? "" : th?.tid || "" };
}
const signingPersonaName = (id) => B?.people?.[id]?.name || id;
// The conventional folder for private keys (canonical SPEC-002-066): ~/private/afb/<project id>/.
// Visible on purpose: file pickers hide dot-folders. Never the board, a repository or a synced folder.
function signingKeyFolder() {
  const id = B?.cfg?.project?.id;
  return "~/private/afb/" + (typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) ? id : exText("<project>", "<projekt>")) + "/";
}
// The one send decision (SPEC-002-061): what signingComposerStatus says now for the persona in
// "I am" and a destination. "signed" signs as that persona, "unsigned" posts unsigned, anything
// else refuses with the status detail. The composer row and delivery both use it.
function signingSendDecision(model, required) {
  signingNoteCatalog();
  const c = model.signingContext, names = Object.fromEntries(Object.entries(model.people || {}).map(([id, p]) => [id, p?.name || id]));
  const status = signingComposerStatus({ error: model.signingError, hasContext: !!c, writable: canWrite(), required, mode: signingMode, persona: currentUser(), names,
    catalog: signingProvider.catalog().map((p) => p.participant), known: signingKnown, participants: model.signingParticipants || {}, pins: c?.state?.pins || {} });
  return { kind: !status || status.id === "unsigned" ? "unsigned" : status.id === "signed" ? "signed" : "refused", status };
}
// What happens to the message in the composer now, for the composer's destination.
function signingPostBlock() {
  if (!B) return null;
  const c = B.signingContext, target = c ? signingDestinationPath() : null;
  let required = false;
  try { required = !!c && c.minimum(target.path, target.thread) === "trusted"; } catch { required = false; }
  // A ticked "Require trusted signatures" for a room or topic being created counts at once (SPEC-002-063).
  return signingSendDecision(B, required || (typeof historyCreationRequires === "function" && historyCreationRequires())).status;
}
function signingStatusError(status) {
  const error = new Error(status.detail);
  error.name = "BoardError";
  error.signing = status;
  return error;
}
// Emoji on the buttons show what the step is about; the text says it.
const SIGNING_ACTION_EMOJI = { unlock: "🔒", lock: "🔒", approve: "🔑", sign: "🔏", persona: "👤" };
// The Provider can only lock every key at once, so the lock button says so when more than one is unlocked.
function signingActionLabel(action) {
  if (action.kind !== "lock") return action.label;
  const others = signingProvider.catalog().filter((p) => p.participant !== action.participant);
  return others.length ? exText("Lock all keys in this tab", "Zablokuj wszystkie klucze w tej karcie") : action.label;
}
function signingNoticeButton(button, action, link) {
  button.hidden = !action;
  const emoji = action ? SIGNING_ACTION_EMOJI[action.kind] : "";
  const label = action ? (emoji ? emoji + " " : "") + signingActionLabel(action) : "";
  if (button.textContent !== label) button.textContent = label;
  // The compact phone row may cut the label short (SPEC-002-069 AC9); the tooltip keeps it whole.
  if (button.title !== label) button.title = label;
  button.dataset.signingKind = action?.kind || "";
  // A short label for the compact phone status line (SPEC-002-065); the full label stays the text.
  if (action?.short) button.dataset.short = (emoji ? emoji + " " : "") + action.short; else delete button.dataset.short;
  button.classList.toggle("btn", !link);
  button.classList.toggle("signing-link", !!link);
}
// Extra facts the status function does not cover: the last composer unlock attempt,
// and why unlocking is unavailable on a read-only folder.
function signingNoticeNote(status) {
  const persona = currentUser(), note = signingComposerNote;
  if (note && note.persona === persona && note.location === signingLocation) return note;
  if (status?.id === "unsigned" && status.action?.kind !== "unlock" && !canWrite() && B?.signingParticipants?.[persona]?.fingerprint)
    return { kind: "read-only", text: exText("Unlocking a key is unavailable because this folder is read-only. Open the board folder with write access to sign.", "Odblokowanie klucza jest niedostępne, bo ten folder jest tylko do odczytu. Otwórz folder tablicy z zapisem, aby podpisywać."), owners: [] };
  return null;
}
// One status row directly above Send, always visible on boards with signing. It is rebuilt only
// when its content changes, so a refresh tick never steals focus or moves the cursor.
function updateSigningNotice(status = signingPostBlock()) {
  if (typeof historyComposerUpdate === "function") historyComposerUpdate();
  signingKeysSync();
  // The status row already says when a destination requires signatures; the older hint shows only without it.
  const req = $("#signingRequires");
  if (req) {
    const note = status ? "" : signingRequirementNote();
    if (req.textContent !== note) req.textContent = note;
    req.hidden = !note;
  }
  const el = $("#signingNotice");
  if (!el) return;
  const note = signingNoticeNote(status), action = status?.action || null;
  const key = JSON.stringify([status, action && signingActionLabel(action), note && [note.kind, note.text, note.owners.map((id) => [id, signingPersonaName(id)])]]);
  signingNoticeStatus = status;
  if (key === signingNoticeKey) return;
  signingNoticeKey = key;
  el.hidden = !status;
  el.dataset.signingStatus = status?.id || "";
  el.dataset.tone = status?.tone || "";
  el.classList.toggle("has-note", !!note);
  el.querySelector(".signing-notice-emoji").textContent = status?.emoji || "";
  el.querySelector(".signing-notice-label").textContent = status?.label || "";
  el.querySelector(".signing-notice-text").textContent = status?.detail || "";
  const noteEl = el.querySelector(".signing-notice-note");
  noteEl.textContent = note?.text || "";
  noteEl.hidden = !note;
  noteEl.classList.toggle("signing-error", note?.kind === "error");
  const hint = el.querySelector(".signing-notice-hint");
  hint.textContent = exText(`The key file must be on this device, usually in ${signingKeyFolder()}`, `Plik klucza musi być na tym urządzeniu, zwykle w ${signingKeyFolder()}`);
  hint.hidden = action?.kind !== "unlock";
  // In an optional destination, signing is an offer, not the main step: it renders as a link.
  signingNoticeButton(el.querySelector(".signing-notice-action"), action, status?.id === "unsigned");
  signingNoticeButton(el.querySelector(".signing-notice-alt"), status?.alt || null, true);
  const switches = el.querySelector(".signing-notice-switches");
  switches.replaceChildren(...(note?.owners || []).map((id) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn signing-notice-switch";
    b.signingSwitch = id;
    b.textContent = "👤 " + exText(`Switch persona to ${signingPersonaName(id)}`, `Przełącz personę na: ${signingPersonaName(id)}`);
    return b;
  }));
  switches.hidden = !switches.childElementCount;
}
// Context races (a lock or draft edit during signing) keep their own messages. Any other refusal
// is explained from the current composer status, so a refused send says what the status row says.
const signingRaceError = /context changed|draft|retry|locked during|refresh/i;
function signingRefusal(error, force = false) {
  if (error?.signing) { updateSigningNotice(); return error; }
  if (!force && signingRaceError.test(error?.message || "")) return error;
  const status = signingPostBlock();
  if (!status || status.id === "signed" || status.id === "unsigned") return error;
  updateSigningNotice(status);
  return signingStatusError(status);
}
// Change "I am" through the same path as the select, so every dependent view follows.
function signingSelectPersona(id) {
  const me = $("#me");
  if (!me || ![...me.options].some((o) => o.value === id)) return false;
  me.value = id;
  me.dispatchEvent(new Event("change"));
  return true;
}
// Unlock from the composer, for the persona in "I am". A key of another participant is named with
// its fingerprint and never adopted silently; an invalid file changes nothing. Nothing about which
// file held which key is kept: the files are read once and the input is cleared.
async function signingComposerUnlock(files) {
  const C = SigningContract, model = B, context = B?.signingContext, origin = dirHandle, location = signingLocation, persona = currentUser(), name = signingPersonaName(persona);
  const before = new Set(signingProvider.catalog().map((p) => p.participant)), errors = [];
  const sameBoard = () => B?.signingContext?.boardId === context?.boardId && dirHandle === origin && signingLocation === location;
  const note = (kind, text, owners = []) => { signingComposerNote = { kind, text, owners, persona, location }; };
  signingComposerNote = null;
  for (const file of files.slice(0, 32)) {
    try {
      C.require(model && context && !model.signingError, exText("signing is unavailable for this board", "podpisy są niedostępne dla tej tablicy"));
      C.require(canWrite(), exText("this folder is read-only. Open the board folder with write access to sign", "ten folder jest tylko do odczytu. Otwórz folder tablicy z zapisem, aby podpisywać"));
      C.require(file.size <= 16384, "Private key file too large");
      const bytes = new Uint8Array(await file.arrayBuffer());
      C.require(sameBoard(), exText("the board changed while reading the file", "tablica zmieniła się podczas czytania pliku"));
      await signingProvider.unlock(bytes, context);
      C.require(sameBoard(), exText("the board changed while unlocking", "tablica zmieniła się podczas odblokowywania"));
    } catch (e) {
      errors.push(/no usable registered current profile/.test(e.message) ? exText("This key belongs to nobody on this board.", "Ten klucz nie należy do nikogo na tej tablicy.") : e.message);
    }
  }
  const catalog = signingProvider.catalog(), added = catalog.filter((p) => !before.has(p.participant));
  const failed = errors.length ? exText(`Not unlocked: ${errors.join(" ")} Nothing else changed.`, `Nie odblokowano: ${errors.join(" ")} Nic więcej nie zmieniono.`) : "";
  if (catalog.some((p) => p.participant === persona)) {
    signingMode = "signed";
    if (failed) note("error", failed);
  } else if (added.length) {
    const owners = added.map((p) => p.participant), who = added.map((p) => `${signingPersonaName(p.participant)} (${p.fingerprint})`).join(", ");
    note("other", exText(`This key is registered to ${who}. It is not for ${name}, so nothing is signed with it while “I am” is ${name}.`, `Ten klucz jest zarejestrowany dla: ${who}. Nie jest dla: ${name}, więc nic nim nie zostanie podpisane, dopóki „Jestem” to ${name}.`) + (failed ? " " + failed : ""), owners);
  } else note("error", errors.length ? failed : exText(`These keys were already unlocked here, and none is for ${name}.`, `Te klucze były już odblokowane, a żaden nie jest dla: ${name}.`));
  updateSigningNotice();
}
function signingNoticeAction(button) {
  const status = signingNoticeStatus, action = button.classList.contains("signing-notice-alt") ? status?.alt : status?.action;
  if (!action) return;
  if (action.kind === "unlock") { const input = $("#signingComposerKey"); input.value = ""; input.click(); }
  else if (action.kind === "approve") signingDialog({ task: "review", participant: action.participant, focus: "#signingFingerprint" });
  else if (action.kind === "open-folder") signingOpenTask("folder");
  else if (action.kind === "howto") signingDialog({ task: "howto", anchor: action.anchor });
  else if (action.kind === "open") signingOpenTask(action.task, { anchor: action.anchor });
  else if (action.kind === "persona") { const me = $("#me"); me?.scrollIntoView({ block: "nearest" }); me?.focus(); }
  else if (action.kind === "sign") { signingMode = "signed"; signingComposerNote = null; updateSigningNotice(); }
  else if (action.kind === "lock") { signingProvider.lock(); signingComposerNote = null; updateSigningNotice(); }
  else if (action.kind === "unsigned") {
    if (!window.confirm(exText("Post without a signature? This also locks the keys unlocked in this tab.", "Wysłać bez podpisu? To także zablokuje klucze odblokowane w tej karcie."))) return;
    signingProvider.lock(); signingMode = "unsigned"; signingComposerNote = null; updateSigningNotice();
  }
}
function signingOpenTask(task, options = {}) {
  if (task === "folder") { $("#folderName").click(); return; }
  signingDialog({ task, ...options });
}
function signingRequirementNote() {
  const c = B?.signingContext;
  if (!c || B.signingError) return "";
  let required = false;
  try { const target = signingDestinationPath(); required = c.minimum(target.path, target.thread) === "trusted"; } catch { return ""; }
  return required ? exText("This destination requires trusted signatures.", "Ten cel wymaga zaufanych podpisów.") : "";
}
function signingExclusionHtml(m) {
  const b = signingMessageBlock(m), attrs = [`data-signing-open="${esc(b.task)}"`, b.participant ? `data-signing-for="${esc(b.participant)}"` : "", b.anchor ? `data-signing-anchor="${esc(b.anchor)}"` : ""].filter(Boolean).join(" ");
  return `<p class="metadata-error signing-exclusion">${esc(exText("Inspection only", "Tylko podgląd"))}: ${esc(b.message)} ${esc(exText("Reply, choices and forms stay off for this message.", "Odpowiedź, wybory i formularze są dla tej wiadomości wyłączone."))} <button type="button" class="btn" ${attrs}>${esc(b.label)}</button></p>`;
}
// Signature integrity, local key approval and policy eligibility are independent facts.
function signingMessageFacts(m) {
  const f=m.signing || {}, text=exText;
  const signatures={
    valid:["✅",text("Signature verified","Podpis zweryfikowany"),text("The message bytes match the signing key. This does not establish your approval of the key or the truth of the content.","Bajty wiadomości zgadzają się z kluczem podpisu. Nie oznacza to Twojego zatwierdzenia klucza ani prawdziwości treści.")],
    unsigned:["📄",text("Unsigned message","Wiadomość bez podpisu"),text("This message has no signature. Board rules decide whether it can be used for replies and other actions.","Ta wiadomość nie ma podpisu. Reguły tablicy określają, czy można odpowiadać i wykonywać inne działania.")],
    invalid:["❌",text("Invalid signature","Nieprawidłowy podpis"),text("The signature check failed. Approving a key cannot repair a failed signature; inspect the details with the sender.","Sprawdzenie podpisu nie powiodło się. Zatwierdzenie klucza nie naprawi błędnego podpisu; sprawdź szczegóły z nadawcą.")],
    stripped:["❌",text("Signature removed","Usunięto podpis"),text("A previously verified signature is now missing. This message is blocked; inspect its history with the sender.","Brakuje wcześniej zweryfikowanego podpisu. Wiadomość jest zablokowana; sprawdź historię z nadawcą.")],
    unavailable:["⏳",text("Signature not verified yet","Podpis jeszcze niezweryfikowany"),text("Verification has not completed. Evidence may be missing, or the message may be outside the verification window. Open Signing to check older messages.","Weryfikacja nie została zakończona. Może brakować danych lub wiadomość jest poza oknem weryfikacji. Otwórz Podpisy, aby sprawdzić starsze wiadomości.")],
    unchecked:["❓",text("Signature not checked","Podpis niesprawdzony"),text("No verification result is available. Do not treat this message as verified.","Brak wyniku weryfikacji. Nie traktuj tej wiadomości jako zweryfikowanej.")]
  };
  const rows=[],add=(id,values,warning=false)=>rows.push({id,emoji:values[0],label:values[1],explanation:values[2],warning});
  const signature=Object.hasOwn(signatures,f.signature)?f.signature:"unchecked";
  add("signature-"+signature,signatures[signature],["invalid","stripped"].includes(signature));
  if(f.signature==="valid"){
    if(f.trust==="trusted")add("key-trusted",["🔑",text("Signing key trusted by you","Ufasz kluczowi podpisu"),text("You approved this exact participant key in this browser for this board location. Approval is local and does not endorse the message content.","Zatwierdzono ten konkretny klucz uczestnika w tej przeglądarce dla tej lokalizacji tablicy. Zatwierdzenie jest lokalne i nie potwierdza treści wiadomości.")]);
    else add("key-unfamiliar",["❓",text("Signing key not approved by you","Nie zatwierdzono klucza podpisu"),text("The signature verifies, but you have not approved this exact key locally. Compare its full fingerprint independently before approval. Optional board rules may still allow actions.","Podpis jest poprawny, ale ten konkretny klucz nie został lokalnie zatwierdzony. Przed zatwierdzeniem porównaj cały odcisk niezależnym kanałem. Opcjonalne reguły tablicy mogą nadal pozwalać na działania.")]);
  }
  const lifecycle={
    superseded:["🕰️",text("Older signing key","Starszy klucz podpisu"),text("This message used an older key from the participant's accepted key history. A newer current key exists; board rules determine whether the old message is usable.","Wiadomość podpisano starszym kluczem z zaakceptowanej historii uczestnika. Istnieje nowszy klucz; reguły tablicy określają, czy stara wiadomość może być używana.")],
    retired:["🚫",text("Signing key retired","Klucz podpisu wycofany"),text("This signing key was retired. A matching signature does not make this message eligible for actions.","Ten klucz podpisu wycofano. Zgodny podpis nie daje uprawnienia do działań na podstawie tej wiadomości.")],
    compromised:["🚨",text("Signing key compromised","Klucz podpisu przejęty"),text("This key was reported compromised. The message is blocked even when its signature matches the key.","Ten klucz zgłoszono jako przejęty. Wiadomość jest zablokowana nawet wtedy, gdy podpis zgadza się z kluczem.")]
  };
  if(Object.hasOwn(lifecycle,f.lifecycle))add("key-"+f.lifecycle,lifecycle[f.lifecycle],f.lifecycle!=="superseded");
  if(f.eligibility==="excluded")add("blocked",["⛔",text("Blocked by signing rules","Zablokowana przez reguły podpisów"),text("Signing rules or key evidence prevent replies, forms and other coordination actions. Expand the details for the reason; a verified signature alone does not remove this block.","Reguły podpisów lub dane klucza blokują odpowiedzi, formularze i inne działania koordynacyjne. Rozwiń szczegóły, aby poznać przyczynę; sam poprawny podpis nie usuwa blokady.")],true);
  if(f.eligibility==="pending-verification")add("pending",["⏳",text("Waiting for verification — inspection only","Oczekuje na weryfikację — tylko podgląd"),text("This message can be inspected, but it cannot drive actions until verification completes.","Można przeglądać tę wiadomość, ale nie może ona wywoływać działań do zakończenia weryfikacji.")]);
  return rows;
}
function signingMessageSummary(m) {
  return signingMessageFacts(m).map(f=>f.label).join(" · ");
}
function signingParticipantSummary(id,model=B) {
  const f=model?.signingParticipants?.[id];
  if(f?.unregistered) return exText("No signing key registered","Brak zarejestrowanego klucza podpisu");
  if(!f?.fingerprint) return exText("Current key unavailable","Bieżący klucz niedostępny");
  if(f.revoked) return exText("Current key revoked — do not use","Bieżący klucz unieważniony — nie używaj");
  if(f.trusted) return exText("Current key trusted by you","Ufasz bieżącemu kluczowi");
  return f.changed?exText("Key changed — review needed","Klucz zmieniony — wymaga sprawdzenia"):exText("Current key not approved by you","Nie zatwierdzono bieżącego klucza");
}
// Keys waiting for approval (SPEC-002-069): a current, unrevoked fingerprint that is not the one
// approved on this device. Approval is read from the pins, which an upload's approval updates
// without rebuilding signingParticipants. Changed keys first, then by display name.
function signingNeedsReview(id, model = B) {
  const f = model?.signingParticipants?.[id], pin = model?.signingContext?.state?.pins?.[id];
  return !!f?.fingerprint && !f.revoked && pin !== f.fingerprint;
}
function signingPendingReview(model) {
  const pins = model?.signingContext?.state?.pins || {}, name = (id) => model.people?.[id]?.name || id;
  const changed = (id) => pins[id] ? 0 : 1;
  return Object.keys(model?.signingParticipants || {}).filter((id) => signingNeedsReview(id, model))
    .sort((a, b) => changed(a) - changed(b) || name(a).localeCompare(name(b)) || (a < b ? -1 : a > b ? 1 : 0));
}
// Polish counts take three forms: 1 klucz, 2-4 (not 12-14) klucze, otherwise kluczy.
function signingCount(n, en1, en, one, few, many) {
  if (S.lang !== "pl") return n === 1 ? en1 : en;
  const form = new Intl.PluralRules("pl").select(n);
  return form === "one" ? one : form === "few" ? few : many;
}
const signingKeysToReview = (n) => signingCount(n, `${n} key to review`, `${n} keys to review`, `${n} klucz do sprawdzenia`, `${n} klucze do sprawdzenia`, `${n} kluczy do sprawdzenia`);
// The state after each name in the review list, from the same data as signingParticipantSummary.
function signingParticipantState(id, model = B) {
  const f = model?.signingParticipants?.[id];
  if (f?.unregistered) return exText("no key", "brak klucza");
  if (!f?.fingerprint) return exText("key unavailable", "klucz niedostępny");
  if (f.revoked) return exText("revoked", "unieważniony");
  if (!signingNeedsReview(id, model)) return exText("approved", "zatwierdzony");
  return model.signingContext?.state?.pins?.[id] ? exText("key changed", "klucz zmieniony") : exText("needs review", "wymaga sprawdzenia");
}
const signingParticipantOption = (id, model = B) => `${model.people[id]?.name || id} (${id}) - ${signingParticipantState(id, model)}`;
function signingPendingSummary(model = B) {
  const n = signingPendingReview(model).length;
  if (n) return signingCount(n, "1 key needs review", `${n} keys need review`, "1 klucz wymaga sprawdzenia", `${n} klucze wymagają sprawdzenia`, `${n} kluczy wymaga sprawdzenia`);
  return Object.values(model?.signingParticipants || {}).some((f) => f?.fingerprint) ? exText("All registered keys are approved on this device", "Wszystkie zarejestrowane klucze są zatwierdzone na tym urządzeniu") : exText("No participant has a registered key yet", "Żaden uczestnik nie ma jeszcze zarejestrowanego klucza");
}
// The first-open notice is dismissed per board for the exact pending (participant, fingerprint)
// pairs: a new or changed key shows it again. Storage may throw; the session copy still hides it.
const signingKeyNoticeSession = {};
function signingKeyNoticeId(model = B) {
  return "afb.keyReview." + (boardStorageId || model?.signingContext?.boardId || signingLocation || "");
}
function signingKeyNoticePairs(model = B) {
  return signingPendingReview(model).map((id) => id + "=" + model.signingParticipants[id].fingerprint).sort();
}
function signingKeyNoticeDismissed(id) {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(id) || "null"); } catch { stored = null; }
  return new Set([...(Array.isArray(stored) ? stored : []), ...(signingKeyNoticeSession[id] || [])]);
}
function signingKeyNoticeStore(id, pairs) {
  try { localStorage.setItem(id, JSON.stringify(pairs)); } catch {}
}
function signingKeyNoticeDismiss() {
  const id = signingKeyNoticeId(), pairs = signingKeyNoticePairs();
  signingKeyNoticeSession[id] = pairs;
  signingKeyNoticeStore(id, pairs);
  signingKeysSync();
}
// One place for the count: the Signing badge in Tools, the dot on the closed Tools menu and the notice.
// It runs on every composer status update, so it writes only what changed.
function signingKeysSync() {
  const model = B && B.signingContext && !B.signingError ? B : null, pending = model ? signingPendingReview(model) : [], n = pending.length;
  const dismissed = model ? signingKeyNoticeDismissed(signingKeyNoticeId(model)) : new Set();
  const notice = n > 0 && signingKeyNoticePairs(model).some((pair) => !dismissed.has(pair)), label = n ? signingKeysToReview(n) : "";
  const set = (el, key, value) => { if (el && el[key] !== value) el[key] = value; };
  const tools = $("#signingTools"), toggle = $("#toolbarToolsToggle"), box = $("#keyNotice");
  if (tools) {
    set(tools.querySelector(".signing-tools-label"), "textContent", exText("Signing", "Podpisy"));
    const badge = tools.querySelector(".key-badge");
    set(badge, "hidden", !n);
    set(badge.querySelector(".key-badge-count"), "textContent", n ? String(n) : "");
    set(badge, "title", label);
    set(tools, "title", n ? exText("Signing", "Podpisy") + ": " + label : "");
  }
  const review = $("#reviewKeysTool");
  if (review) {
    set(review, "hidden", !n);
    set(review, "textContent", n ? "🔑 " + exText(`Review keys (${n})`, `Sprawdź klucze (${n})`) : "");
    set(review, "title", label);
  }
  if (toggle) {
    if (n) { if (toggle.dataset.pendingKeys !== String(n)) toggle.dataset.pendingKeys = String(n); } else delete toggle.dataset.pendingKeys;
    set(toggle, "title", n ? t("toolbar_tools") + " - " + label : t("toolbar_tools"));
  }
  if (box) {
    if (box.classList.contains("show") !== notice) box.classList.toggle("show", notice);
    const text = notice ? signingCount(n, "1 participant key is not approved on this device.", `${n} participant keys are not approved on this device.`, "1 klucz uczestnika nie jest zatwierdzony na tym urządzeniu.", `${n} klucze uczestników nie są zatwierdzone na tym urządzeniu.`, `${n} kluczy uczestników nie jest zatwierdzonych na tym urządzeniu.`) : "";
    set($("#keyNoticeText"), "textContent", text);
    set($("#keyNoticeText"), "title", text);
    set($("#keyNoticeReview"), "textContent", exText("Review keys", "Sprawdź klucze"));
    set($("#keyNoticeLater"), "textContent", exText("Not now", "Nie teraz"));
  }
}
function signingMessageHtml(m) {
  const f=m.signing || {}, facts=signingMessageFacts(m), reason=f.reason && f.reason!=="verified" && f.reason!=="unsigned"?f.reason:"";
  const badges=facts.map(fact=>`<span class="signing-state${fact.warning?' signing-state-warning':''}" data-signing-state="${fact.id}" title="${esc(fact.label+': '+fact.explanation)}"><span aria-hidden="true">${fact.emoji}</span><span>${esc(fact.label)}</span></span>`).join("");
  const explanations=facts.map(fact=>`<dt>${esc(fact.label)}</dt><dd>${esc(fact.explanation)}</dd>`).join("");
  return `<details class="signing-facts"><summary aria-label="${esc(signingMessageSummary(m))}">${badges}<span class="signing-details-label">${esc(exText("Details","Szczegóły"))}</span></summary><dl class="signing-state-explanations">${explanations}</dl><p>${esc(exText("A verified signature proves these message bytes match the signing key. Your local key approval is separate; neither proves the claims in the message are true.","Zweryfikowany podpis potwierdza zgodność bajtów wiadomości z kluczem podpisu. Twoje lokalne zatwierdzenie klucza jest osobne; żadne nie potwierdza prawdziwości treści."))}</p>${f.fingerprint?`<p>${esc(exText("Signing key fingerprint","Odcisk klucza podpisu"))}: <code>${esc(f.fingerprint)}</code></p>`:""}${reason?`<p>${esc(reason)}</p>`:""}<p>${esc(exText("Open Signing in Tools to review keys or verify older messages.","Otwórz Podpisy w Narzędziach, aby sprawdzić klucze lub zweryfikować starsze wiadomości."))}</p></details>`;
}
// In signed mode the author and signer are the persona selected in "I am" at the moment of sending.
// A locked persona key refuses (the draft stays); it never falls back to unsigned or to another key.
function signingSender(fallback) {
  if (signingMode !== "signed") return fallback;
  const persona = currentUser();
  if (!signingProvider.catalog().some((p) => p.participant === persona)) throw signingRefusal(Error("Unlock the signing key of the selected persona"), true);
  return persona;
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
    signingLocation = location;
    signingKnown = {};
    signingComposerNote = null;
  }
  const source = Object.fromEntries(files.map((f) => [f.path, f]));
  try {
    const metadata = async (path) => base ? await signingRead(base, path) : source[path]?.metadataFile ? await rawBytes(source[path].metadataFile) : C.bytes(source[path]?.text || "{}");
    const configRaw = await metadata("config.json"), config = C.parse(configRaw), registry = C.parse(await metadata("participants.json"));
    // Room history reads its own setting from the same bytes (SPEC-002-063).
    model.signingConfigRaw = configRaw;
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
    signingNoteCatalog();
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
  // The decision taken now is re-derived after every await below and must not change.
  const decided = () => signingSendDecision(model, minimum === "trusted").kind, decision = signingSendDecision(model, minimum === "trusted");
  if (decision.kind === "refused") throw signingStatusError(decision.status);
  if (decision.kind === "unsigned") {
    C.require(minimum === "optional", "Trusted signing required; unlock and trust a signing identity");
    return { msg, guard: async () => {
      C.require(origin === dirHandle && model === (options.model || B) && stamp === signingDraftStamp() && decided() === "unsigned", "Posting context changed; review draft");
      await signingFresh(model, base, context, expected, source, sourceDigest);
      C.require(origin === dirHandle && model === (options.model || B) && stamp === signingDraftStamp() && decided() === "unsigned", "Posting context changed; review draft");
    } };
  }
  C.require(h.FROM === currentUser(), "Message author differs from the selected persona");
  const current = await context.resolve(h.FROM), fp = current.head.fingerprint;
  C.require(!current.revoked[fp], "Signing key revoked");
  C.require(minimum !== "trusted" || context.state.pins[h.FROM] === fp, "Trust the verified current fingerprint before posting");
  const record = "sig_" + crypto.randomUUID(), message = msg.text.replace("\n---\n", "\nSIGNATURE: " + JSON.stringify({ version: 1, record }) + "\n---\n"), raw = C.bytes(message);
  const payload = C.canonical({ version: 1, boardId: context.boardId, participant: h.FROM, profile: current.head.digest, target: { kind: "message", path: msg.relPath, sha256: await C.hash(raw), bytes: raw.length } });
  const envelope = await signingProvider.sign(h.FROM, context, C.TYPES.message, payload);
  C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && stamp === signingDraftStamp() && decided() === "signed" && currentUser() === h.FROM, "Board, draft or signer changed; review and retry");
  if (base) {
    const cfg = await signingRead(base, "config.json"), reg = await signingRead(base, "participants.json");
    C.require(C.same(C.parse(cfg), context.config) && C.same(C.parse(reg), context.registry), "Board policy/profile changed; refresh and retry");
  }
  await C.verifyMessage(envelope, await context.load("profiles", current.head.digest), raw, { boardId: context.boardId, participant: h.FROM, profile: current.head.digest, path: msg.relPath });
  return { guard: async () => {
    C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && decided() === "signed" && currentUser() === h.FROM && stamp === signingDraftStamp(), "Posting context changed; draft preserved");
    await signingFresh(model, base, context, expected, source, sourceDigest);
    C.require(origin === dirHandle && model === (options.model || B) && epoch === signingProvider.generation && decided() === "signed" && currentUser() === h.FROM && stamp === signingDraftStamp() && (minimum !== "trusted" || context.state.pins[h.FROM] === fp), "Posting context changed; draft preserved");
  }, msg: { ...msg, text: message }, sidecar: { path: msg.relPath.split("/").slice(0, -1).join("/") + "/.signatures/" + record + ".json", text: C.text(envelope) } };
}
// Guided key review (SPEC-002-071). The prefix is SigningContract.FP; this file is also loaded without the contract.
const SIGNING_FP_PREFIX = "urn:ietf:params:oauth:jwk-thumbprint:sha-256:";
const signingStripSpace = (value) => String(value ?? "").replace(/\s+/g, "");
// Display only: the prefix, then groups of 4. The copied and compared value stays the exact string.
function signingFingerprintGroups(value) {
  const v = String(value || ""), prefixed = v.startsWith(SIGNING_FP_PREFIX), rest = prefixed ? v.slice(SIGNING_FP_PREFIX.length) : v;
  return [...(prefixed ? [SIGNING_FP_PREFIX] : []), ...(rest.match(/.{1,4}/gsu) || [])];
}
// The one comparison behind the live result and the Approve button. A cut-off value is neutral, not a mismatch.
function signingFingerprintCompare(board, pasted) {
  const b = String(board || ""), p = String(pasted || "");
  if (!b) return { state: "none" };
  if (p === b) return { state: "match" };
  if (!p || b.startsWith(p) || (!p.startsWith(SIGNING_FP_PREFIX) && b.endsWith(p))) return { state: "partial" };
  let index = 0;
  while (index < b.length && index < p.length && b[index] === p[index]) index++;
  return { state: "mismatch", index };
}
// Echo guard: the pasted value is something copied inside this dialog, so it came from the board, not the owner.
function signingFingerprintEcho(copied, pasted, board) {
  const p = String(pasted || "");
  return !!p && [...copied].some((c) => c === p || (!!board && p === board && c.includes(p)));
}
function signingReviewApprovable(board, pasted, echo, confirmed) {
  return signingFingerprintCompare(board, pasted).state === "match" && (!echo || !!confirmed);
}
// Enough for the owner to see which key is meant, never the full value to echo back.
function signingFingerprintShort(value) {
  const v = String(value || ""), prefixed = v.startsWith(SIGNING_FP_PREFIX);
  return (prefixed ? SIGNING_FP_PREFIX : "") + "…" + v.slice(-8);
}
// The canonical command that prints the fingerprint of a private key file (its "key file matches current profile" row).
function signingOwnFingerprintCommand(id, text = exText) {
  return text(`boardctl signing check --path <board> --from ${id} --scope rooms/<room> --signing-key-file ${signingKeyFolder()}${id}.json`,
    `boardctl signing check --path <tablica> --from ${id} --scope rooms/<pokój> --signing-key-file ${signingKeyFolder()}${id}.json`);
}
function signingReviewRequest({ name, id, board, boardId, fingerprint }, text = exText) {
  const where = boardId ? `${board} (${text("board ID", "ID tablicy")} ${boardId})` : board, short = signingFingerprintShort(fingerprint), cli = signingOwnFingerprintCommand(id, text);
  return text(`Hi ${name}, I am approving your signing key on the board ${where}. Please send me your full key fingerprint, read on your own device: in the viewer, Tools → Signing → Sign as me → Copy my fingerprint (after unlocking your key file), or run ${cli} and copy the fingerprint in its "key file matches current profile" line. This board lists your key as ${short}; I will compare the whole value.`,
    `Cześć ${name}, zatwierdzam Twój klucz podpisu na tablicy ${where}. Prześlij mi proszę cały odcisk klucza, odczytany na własnym urządzeniu: w przeglądarce Narzędzia → Podpisy → Podpisuj jako ja → Kopiuj mój odcisk (po odblokowaniu pliku klucza) albo uruchom ${cli} i skopiuj odcisk z wiersza "key file matches current profile". Ta tablica pokazuje Twój klucz jako ${short}; porównam całą wartość.`);
}
// A fingerprint in groups; the group holding the first difference is marked. textContent stays the exact value.
function signingFingerprintNode(value, diff = -1) {
  const code = document.createElement("code");
  code.className = "signing-fp";
  let at = 0;
  for (const group of signingFingerprintGroups(value)) {
    const span = document.createElement("span");
    span.textContent = group;
    if (diff >= at && diff < at + group.length) span.className = "signing-fp-diff";
    code.append(span);
    at += group.length;
  }
  return code;
}
async function signingClipboardWrite(value, text = exText) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    throw Error(text("Copying is not allowed in this browser. Select and copy this text yourself: ", "Kopiowanie jest zablokowane w tej przeglądarce. Zaznacz i skopiuj ten tekst samodzielnie: ") + value);
  }
}
async function signingDialog(request) {
  const go = request && typeof request.task === "string" ? request : null;
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
  // Jump to a task. A request from the composer or a message also lands on the control that does the next step.
  const goTo = (task, req = {}) => {
    const target = dialog.querySelector(task === "howto" ? "#signing-howto" : "#signing-" + task);
    if (task === "howto") target.open = true;
    target.scrollIntoView({ block: "start" });
    let landing = target.querySelector("h3") || target.querySelector("summary");
    if (task === "howto" && req.anchor) landing = dialog.querySelector({ owner: "#signing-setup-owner", keys: "#signing-setup-you" }[req.anchor] || "#signing-fig-" + req.anchor) || landing;
    const control = req.focus && dialog.querySelector(req.focus);
    if (control && !control.disabled) landing = control;
    landing.scrollIntoView({ block: "start" });
    dialog.scrollTop = Math.max(0, dialog.scrollTop - head.getBoundingClientRect().height - 12);
    landing.focus({ preventScroll: true });
  };
  for (const [task, label] of [["check", text("Check messages", "Sprawdź wiadomości")], ["review", text("Review a key", "Sprawdź klucz")], ["own", text("Sign as me", "Podpisuj jako ja")], ["howto", text("How signing works", "Jak działają podpisy")]]) {
    const jump = node("button", label, taskNav, "btn");
    jump.dataset.signingTask = task;
    jump.onclick = () => goTo(task);
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
  node("p", text("Signing lets people check that a message really came from a particular key and was not changed. Some rooms require it. Pick the task that matches your question. If you cannot post, open “How signing works” and follow “Why can't I post?”.", "Podpis pozwala sprawdzić, że wiadomość naprawdę pochodzi od danego klucza i nie została zmieniona. Niektóre pokoje go wymagają. Wybierz zadanie pasujące do pytania. Jeśli nie możesz wysłać wiadomości, otwórz „Jak działają podpisy” i przejdź „Dlaczego nie mogę wysłać wiadomości?”."), dialog, "signing-intro");
  const guide = node("button", text("Open the illustrated guide (works offline)", "Otwórz ilustrowany przewodnik (działa offline)"), dialog, "btn");
  guide.type = "button";
  guide.dataset.action = "guide";
  guide.onclick = () => goTo("howto");
  const status = node("p", "", dialog, "signing-context");
  status.role = "status";
  const requires = node("p", "", dialog, "signing-help");
  requires.id = "signingRequirements";
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
  if (!document.getElementById("signingDiagramStyle")) {
    const style = document.createElement("style");
    style.id = "signingDiagramStyle";
    style.textContent = SIGNING_DIAGRAM_CSS;
    document.head.append(style);
  }
  const howto = node("details", "", dialog, "signing-card");
  howto.id = "signing-howto";
  node("summary", text("How signing works: pictures and plain answers", "Jak działają podpisy: obrazki i proste odpowiedzi"), howto);
  node("p", text("Four pictures: your key versus someone else's key, what happens when you sign, why a required room refuses some messages, and a flow for “Why can't I post?”. They work offline and follow your theme.", "Cztery obrazki: własny klucz a cudzy klucz, co dzieje się przy podpisywaniu, dlaczego pokój z wymogiem odrzuca część wiadomości oraz schemat „Dlaczego nie mogę wysłać wiadomości?”. Działają offline i dopasowują się do motywu."), howto, "signing-help");
  const diagrams = signingDiagrams(text);
  for (const key of ["keys", "sign", "required", "why"]) {
    const fig = node("figure", "", howto, "signing-figure");
    const h = node("h4", diagrams[key].title, fig);
    h.id = "signing-fig-" + key;
    h.tabIndex = -1;
    const wrap = node("div", "", fig, "signing-diagram-wrap");
    wrap.innerHTML = signingDiagramSvg(key, text);
    node("figcaption", diagrams[key].caption, fig, "signing-help");
  }
  node("h4", text("Good to know", "Warto wiedzieć"), howto);
  const know = node("ul", "", howto, "signing-help");
  for (const item of [
    text("In a room that requires trusted signatures you must approve your own key too, once per device.", "W pokoju wymagającym zaufanych podpisów musisz zatwierdzić także własny klucz, raz na urządzenie."),
    text("Approvals are kept per browser and per board folder. A second browser, computer or folder starts with none.", "Zatwierdzenia są osobne dla przeglądarki i folderu tablicy. Druga przeglądarka, komputer lub folder zaczyna bez nich."),
    text("When a key is rotated, messages signed with the old key stay blocked in required rooms, even if you approved it.", "Po rotacji klucza wiadomości podpisane starym kluczem pozostają zablokowane w pokojach z wymogiem, nawet jeśli go zatwierdzono."),
    text("If a requirement is set before the board has an identity UUID, every message shows as waiting for verification until the owner adds one.", "Jeśli wymóg ustawiono, zanim tablica dostała identyfikator UUID, każda wiadomość czeka na weryfikację, aż właściciel go doda."),
    text("Read-only folders and uploads can check messages but cannot unlock keys or save signed messages.", "Foldery i wczytane pliki tylko do odczytu pozwalają sprawdzać wiadomości, ale nie odblokowywać kluczy ani zapisywać podpisanych wiadomości.")
  ]) node("li", item, know);
  node("h4", text("What is safe to share", "Co można bezpiecznie udostępniać"), howto);
  const shared = node("dl", "", howto, "signing-legend");
  for (const [name, meaning] of [
    [text("Your private key file", "Plik Twojego klucza prywatnego"), text("Never share it. Keep it outside the board folder. After you unlock it, it lives only in this tab's memory and is forgotten when you lock, reload or wait 15 minutes.", "Nigdy go nie udostępniaj. Trzymaj go poza folderem tablicy. Po odblokowaniu jest tylko w pamięci tej karty i znika po zablokowaniu, przeładowaniu lub 15 minutach bezczynności.")],
    [text("Your public fingerprint", "Twój publiczny odcisk"), text("Safe to share. Give it to people in person or by phone so they can approve your key.", "Można go udostępniać. Podaj go osobiście lub przez telefon, aby inni mogli zatwierdzić Twój klucz.")],
    [text("Your approval of someone's key", "Twoje zatwierdzenie cudzego klucza"), text("Stays in this browser, for this board folder only. It is not written to the board and not sent to anyone.", "Zostaje w tej przeglądarce, tylko dla tego folderu tablicy. Nie jest zapisywane na tablicy ani nikomu wysyłane.")],
    [text("Signed messages and signature files", "Podpisane wiadomości i pliki podpisów"), text("They live in the shared board folder like any message. They contain no secret.", "Są we wspólnym folderze tablicy jak każda wiadomość. Nie zawierają sekretów.")]
  ]) {
    node("dt", name, shared);
    node("dd", meaning, shared);
  }
  const setupYou = node("h4", text("New here and have no key yet?", "Jesteś nowy i nie masz jeszcze klucza?"), howto);
  setupYou.id = "signing-setup-you";
  setupYou.tabIndex = -1;
  const youSteps = node("ol", "", howto, "signing-help");
  for (const step of [
    text(`Make a key with boardctl signing keygen --path <board> --participant <your id>. It saves the private key as ${signingKeyFolder()}<your id>.json and prints the next steps; ask the board owner to register its public half. The viewer cannot create or register keys.`, `Utwórz klucz poleceniem boardctl signing keygen --path <tablica> --participant <twój id>. Zapisze klucz prywatny jako ${signingKeyFolder()}<twój id>.json i wypisze kolejne kroki; poproś właściciela tablicy o zarejestrowanie części publicznej. Przeglądarka nie tworzy ani nie rejestruje kluczy.`),
    text(`Keep the private key file in ${signingKeyFolder()} on this device: never in the board folder, a repository or a synced folder such as Dropbox or iCloud Drive. Each person and each agent holds only its own key.`, `Trzymaj plik klucza prywatnego w ${signingKeyFolder()} na tym urządzeniu: nigdy w folderze tablicy, repozytorium ani folderze synchronizowanym, takim jak Dropbox czy iCloud Drive. Każda osoba i każdy agent ma tylko własny klucz.`),
    text("Task 3, Sign as me: pick your persona, choose its private key file and press Unlock. The padlock button next to Send does the same for the persona in “I am”.", "Zadanie 3, Podpisuj jako ja: wybierz personę, wybierz jej plik klucza prywatnego i naciśnij Odblokuj. Przycisk z kłódką obok Wyślij robi to samo dla persony z „Jestem”."),
    text("Task 2, Review a key: select yourself, press Check with my key file, then Approve. You do this once per device.", "Zadanie 2, Sprawdź klucz: wybierz siebie, naciśnij Sprawdź moim plikiem klucza, potem Zatwierdź. Robisz to raz na urządzenie."),
    text("Write your message and press Post.", "Napisz wiadomość i naciśnij Wyślij.")
  ]) node("li", step, youSteps);
  const setupOwner = node("h4", text("Board owner: require signatures for a room", "Właściciel tablicy: wymaganie podpisów w pokoju"), howto);
  setupOwner.id = "signing-setup-owner";
  setupOwner.tabIndex = -1;
  const ownerSteps = node("ol", "", howto, "signing-help");
  for (const step of [
    text("Give the board an identity UUID first: boardctl identity enable --path <board>. A room cannot require trusted signatures without one.", "Najpierw nadaj tablicy identyfikator UUID: boardctl identity enable --path <tablica>. Bez niego pokój nie może wymagać zaufanych podpisów."),
    text("Register everyone who must post: they make a key and profile (boardctl signing profile), and you import the public profile (boardctl identity import <id> --profile-file <file> --sha256 <hash>).", "Zarejestruj każdego, kto ma pisać: każdy tworzy klucz i profil (boardctl signing profile), a Ty importujesz profil publiczny (boardctl identity import <id> --profile-file <plik> --sha256 <skrót>)."),
    text("In .agent-board/config.json set message_signing to minimum trusted, for the whole board or for one room under scopes.", "W .agent-board/config.json ustaw message_signing na minimum trusted, dla całej tablicy lub jednego pokoju w scopes."),
    text("Tell people the steps above. Everyone approves keys on their own device; approvals are never shared.", "Przekaż ludziom powyższe kroki. Każdy zatwierdza klucze na własnym urządzeniu; zatwierdzenia nie są współdzielone.")
  ]) node("li", step, ownerSteps);
  node("p", text("Agent operators: agents that post with boardctl pass --signing-key-file. After a key rotation, every client must approve the new fingerprint. The browser and boardctl keep separate approvals.", "Operatorzy agentów: agenci piszący przez boardctl podają --signing-key-file. Po rotacji klucza każdy klient musi zatwierdzić nowy odcisk. Przeglądarka i boardctl mają osobne zatwierdzenia."), howto, "signing-help");
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
  const plain = (s, why, stored, shared) => {
    const dl = node("dl", "", s, "signing-plain");
    for (const [k, v] of [[text("Why", "Po co"), why], [text("Stored", "Gdzie zapisane"), stored], [text("Safe to share", "Co można udostępnić"), shared]]) {
      node("dt", k, dl);
      node("dd", v, dl);
    }
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
  const run = async (out, fn) => {
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
  const add = (s, label, action, out, fn, available = () => true) => {
    const b = node("button", label, s, "btn");
    b.dataset.action = action;
    actions.push({ b, available });
    b.onclick = () => run(out, fn);
    return b;
  };
  const check = section("signing-check", text("1. Check received messages", "1. Sprawdź otrzymane wiadomości"), text("A verified signature checks message integrity. Your approval of its key is a separate decision. Neither proves that the message is true.", "Zweryfikowany podpis sprawdza integralność wiadomości. Zatwierdzenie jej klucza jest osobną decyzją. Żadne nie dowodzi prawdziwości treści."));
  plain(check, text("so you can tell an intact message from one that was changed or forged.", "abyś odróżnił wiadomość nienaruszoną od zmienionej lub sfałszowanej."), text("nothing new. Checking reads public files already in the board folder.", "nic nowego. Sprawdzanie czyta publiczne pliki już obecne w folderze tablicy."), text("everything here is public evidence. No secret is involved.", "wszystko tutaj to dowody publiczne. Nie ma tu żadnych sekretów."));
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
  plain(review, text("a signature only says “this key signed it”. Your approval tells this device which key really belongs to which person.", "podpis mówi tylko „ten klucz to podpisał”. Twoje zatwierdzenie mówi temu urządzeniu, który klucz naprawdę należy do której osoby."), text("your approval stays in this browser, for this board folder only. It is not written to the board and not sent to anyone.", "zatwierdzenie zostaje w tej przeglądarce, tylko dla tego folderu tablicy. Nie jest zapisywane na tablicy ani nikomu wysyłane."), text("a fingerprint. Never share a private key.", "odcisk klucza. Nigdy nie udostępniaj klucza prywatnego."));
  // Keys that need review come first, each option names its state (SPEC-002-069).
  const pendingSummary = node("p", "", review, "signing-pending-summary");
  pendingSummary.id = "signingPendingSummary";
  const participant = field(review, text("Participant to review", "Uczestnik do sprawdzenia"), "select", "signingParticipant", "Trust participant");
  const pendingIds = signingPendingReview(model), registered = (model.signingContext?.registry.participants || []).map((p) => p.id);
  for (const id of [...pendingIds, ...registered.filter((id) => !pendingIds.includes(id))]) {
    const o = node("option", signingParticipantOption(id, model), participant);
    o.value = id;
  }
  const keyCard = node("div", "", review, "signing-key-card"), keyName = node("strong", "", keyCard), keyState = node("p", "", keyCard), key = node("code", "", keyCard), keyHelp = node("p", "", keyCard, "signing-help");
  const keyActions = node("div", "", keyCard, "signing-actions");
  const inspectActions = node("div", "", review, "signing-actions");
  // Guided steps (SPEC-002-071): get the fingerprint from its owner, paste it, compare, approve.
  // Approval stays a deliberate paste. The board's value can be copied to send to its owner (SPEC-002-072),
  // and pasting it back counts as an echo, so Approve then needs the outside-this-board confirmation.
  const stepList = node("ol", "", review, "signing-review-steps");
  stepList.id = "signingReviewSteps";
  const step = () => {
    const li = node("li", "", stepList);
    return { li, title: node("strong", "", li) };
  };
  const s1 = step(), s2 = step(), s3 = step(), s4 = step();
  const s1Body = node("p", "", s1.li, "signing-help");
  const findIt = node("details", "", s1.li, "signing-find"), findSummary = node("summary", "", findIt), findList = node("ul", "", findIt, "signing-help");
  const findViewer = node("li", "", findList), findCli = node("li", "", findList), findCliLead = node("span", "", findCli), findCliCode = node("code", "", findCli), findCliTail = node("span", "", findCli);
  const s1Actions = node("div", "", s1.li, "signing-actions");
  const ownCheck = node("div", "", s1.li, "signing-own-check");
  ownCheck.id = "signingOwnCheck";
  const ownCheckHelp = node("p", "", ownCheck, "signing-help"), ownCheckActions = node("div", "", ownCheck, "signing-actions");
  // Chosen through the button above; the label names it for the file chooser.
  const ownKeyLabel = node("label", text("Your private key file, read in this tab only", "Twój plik klucza prywatnego, czytany tylko w tej karcie"), ownCheck), ownKeyFile = node("input", "", ownKeyLabel);
  ownKeyLabel.hidden = true;
  ownKeyFile.type = "file";
  ownKeyFile.id = "signingOwnKeyFile";
  ownKeyFile.accept = ".json,application/json";
  const fpLabel = node("label", "", s2.li, "signing-field");
  fpLabel.htmlFor = "signingFingerprint";
  const fpTitle = node("span", "", fpLabel), fingerprint = node("input", "", fpLabel);
  fingerprint.id = "signingFingerprint";
  fingerprint.autocomplete = "off";
  fingerprint.spellcheck = false;
  fingerprint.placeholder = text("Exact fingerprint, including prefix", "Dokładny odcisk, łącznie z prefiksem");
  const s2Actions = node("div", "", s2.li, "signing-actions"), pasteOut = node("p", "", s2.li, "signing-help signing-paste-note");
  pasteOut.id = "signingPasteHint";
  pasteOut.setAttribute("aria-live", "polite");
  const compare = node("div", "", s3.li, "signing-compare");
  compare.id = "signingCompare";
  compare.setAttribute("aria-live", "polite");
  const s4Actions = node("div", "", s4.li, "signing-actions"), echoBox = node("div", "", s4.li, "signing-echo");
  echoBox.id = "signingEcho";
  echoBox.hidden = true;
  const echoText = node("p", "", echoBox), echoLabel = node("label", "", echoBox, "signing-echo-confirm"), echoConfirm = node("input", "", echoLabel), echoConfirmText = node("span", "", echoLabel);
  echoConfirm.type = "checkbox";
  echoConfirm.id = "signingEchoConfirm";
  const reviewOut = feedback(review), reviewActions = node("div", "", review, "signing-actions");
  let reviewed = null, compareKey = "";
  // Strings this dialog put on the clipboard: the request text and any selection copied here, except the
  // owner's own fingerprint from Sign as me and text copied out of input fields.
  const copied = new Set();
  dialog.addEventListener("copy", (event) => {
    if (event.target?.closest?.("input,textarea,#signingMyFingerprint")) return;
    const value = signingStripSpace(document.getSelection()?.toString());
    if (value) copied.add(value);
  });
  const reviewBoard = () => {
    const id = participant.value;
    return (reviewed?.id === id ? reviewed.fingerprint : model.signingParticipants?.[id]?.fingerprint) || "";
  };
  const reviewName = () => model.people?.[participant.value]?.name || participant.value;
  const reviewEcho = () => signingFingerprintEcho(copied, fingerprint.value, reviewBoard());
  const setFingerprint = (value) => {
    fingerprint.value = signingStripSpace(value);
    echoConfirm.checked = false;
    syncReview();
  };
  fingerprint.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text");
    if (typeof pasted !== "string") return;
    event.preventDefault();
    setFingerprint(pasted);
  });
  fingerprint.addEventListener("input", () => {
    const clean = signingStripSpace(fingerprint.value);
    if (clean !== fingerprint.value) fingerprint.value = clean;
    echoConfirm.checked = false;
    syncReview();
  });
  echoConfirm.onchange = () => syncReview();
  participant.onchange = () => {
    reviewed = null;
    fingerprint.value = "";
    echoConfirm.checked = false;
    reviewOut.textContent = "";
    pasteOut.textContent = "";
    refresh();
  };
  const copyRequest = add(s1Actions, text("Copy what to send them", "Kopiuj tekst do wysłania"), "copy-request", reviewOut, async () => {
    const id = participant.value, name = reviewName(), project = model.cfg?.project;
    const message = signingReviewRequest({ name, id, board: project?.name || project?.id || text("this board", "ta tablica"), boardId: model.signingContext?.boardId, fingerprint: reviewBoard() }, text);
    copied.add(signingStripSpace(message));
    await signingClipboardWrite(message, text);
    return text(`Copied. Send it to ${name} through a channel you already trust, then paste their reply in step 2.`, `Skopiowano. Wyślij to (${name}) kanałem, któremu już ufasz, a odpowiedź wklej w kroku 2.`);
  }, () => !!reviewBoard());
  const paste = add(s2Actions, text("Paste", "Wklej"), "paste", pasteOut, async () => {
    let value = null;
    try { value = await navigator.clipboard.readText(); } catch { value = null; }
    if (typeof value !== "string") {
      // The field is disabled while this action runs; focus it once the action has finished.
      setTimeout(() => fingerprint.focus());
      throw Error(text("Press Cmd+V / Ctrl+V in the field", "Naciśnij Cmd+V / Ctrl+V w polu"));
    }
    setFingerprint(value);
    return text("Pasted. The comparison is below.", "Wklejono. Wynik porównania jest niżej.");
  }, () => !!model.signingContext && !model.signingError);
  // Own key shortcut: the key file on this device confirms what the board lists. It fills the field with
  // the value derived from that file; approval is still the Approve button below.
  const unlockedOwn = () => signingProvider.catalog().find((p) => p.participant === participant.value && p.participant === currentUser());
  const ownMatch = (fp) => fp === reviewBoard() ? text("Your key file matches the key this board lists for you. Approve it in step 4.", "Twój plik klucza zgadza się z kluczem, który ta tablica pokazuje dla Ciebie. Zatwierdź go w kroku 4.") :
    text("Your key file does not match the key this board lists for you. Do not approve it; ask the board owner which key is registered.", "Twój plik klucza nie zgadza się z kluczem, który ta tablica pokazuje dla Ciebie. Nie zatwierdzaj go; zapytaj właściciela tablicy, który klucz jest zarejestrowany.");
  const checkOwn = add(ownCheckActions, text("Check with my key file", "Sprawdź moim plikiem klucza"), "check-own-key", reviewOut, () => {
    const own = unlockedOwn();
    if (own) {
      setFingerprint(own.fingerprint);
      return ownMatch(own.fingerprint);
    }
    ownKeyFile.value = "";
    ownKeyFile.click();
    return text("Choose your private key file. It is read in this tab only.", "Wybierz swój plik klucza prywatnego. Jest czytany tylko w tej karcie.");
  }, () => participant.value === currentUser() && !!reviewBoard() && (!!unlockedOwn() || (!!base && !!model.signingContext && !model.signingError)));
  const copyFingerprint = add(keyActions, text("Copy fingerprint", "Kopiuj odcisk"), "copy-fingerprint", reviewOut, async () => {
    const value = reviewBoard(), name = reviewName();
    copied.add(value);
    await signingClipboardWrite(value, text);
    return text(`Copied ${name}'s fingerprint as this board lists it. Send it to ${name} through a channel you already trust and ask them to compare it with the one on their own device. When they confirm it matches, paste it in step 2.`, `Skopiowano odcisk klucza (${name}) z tej tablicy. Wyślij go kanałem, któremu już ufasz, i poproś o porównanie z odciskiem na urządzeniu tej osoby. Gdy potwierdzi, że się zgadza, wklej go w kroku 2.`);
  }, () => !!reviewBoard());
  copyFingerprint.id = "signingCopyFingerprint";
  copyRequest.id = "signingCopyRequest";
  paste.id = "signingPaste";
  checkOwn.id = "signingCheckOwnKey";
  ownKeyFile.onchange = () => {
    const file = ownKeyFile.files[0];
    ownKeyFile.value = "";
    if (!file) return;
    run(reviewOut, async () => {
      const id = participant.value;
      C.require(id === currentUser(), "Participant changed; review again");
      C.require(file.size <= 16384, "Private key file too large");
      const bytes = new Uint8Array(await file.arrayBuffer());
      active();
      let fp;
      try {
        const jwk = C.parse(bytes, 16384);
        fp = (await C.publicKey({ format: "jwk", algorithm: "Ed25519", key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x } })).fingerprint;
      } catch {
        throw Error("Invalid private JWK");
      }
      active();
      C.require(id === participant.value, "Participant changed; review again");
      // Unlock through the existing flow only for the key the board lists: that also proves the file holds it.
      if (fp === reviewBoard() && !unlockedOwn()) await unlockFiles([file]);
      setFingerprint(fp);
      return ownMatch(fp);
    });
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
  const savePin = async (id, fingerprint) => {
    const target = model, state = target.signingContext.state, pins = state.pins;
    const hadPrevious = Object.hasOwn(pins, id), previous = pins[id];
    if (fingerprint === undefined) delete pins[id];
    else pins[id] = fingerprint;
    try {
      await signingSave(target);
    } catch (error) {
      // Restore only our attempted edit. Never replace a newer context/pin map
      // or overwrite a different pin change made while persistence awaited.
      const stillOurEdit = fingerprint === undefined ? !Object.hasOwn(pins, id) :
        Object.hasOwn(pins, id) && pins[id] === fingerprint;
      if (target.signingContext?.state === state && state.pins === pins && stillOurEdit) {
        if (hadPrevious) pins[id] = previous;
        else delete pins[id];
      }
      throw error;
    }
  };
  const approve = add(s4Actions, text("Approve this exact key", "Zatwierdź ten konkretny klucz"), "trust", reviewOut, async () => {
    const id = participant.value, typed = fingerprint.value, confirmed = echoConfirm.checked, r = await model.signingContext.resolve(id);
    active();
    C.require(id === participant.value && typed === fingerprint.value, "Key review changed; review again");
    C.require(typed === r.head.fingerprint, "Fingerprint does not match verified current profile");
    C.require(!signingFingerprintEcho(copied, typed, r.head.fingerprint) || confirmed, text("This is the value shown on this board. Confirm you checked it with the participant outside this board.", "To wartość pokazana na tej tablicy. Potwierdź, że sprawdzono ją z uczestnikiem poza tą tablicą."));
    C.require(!r.revoked[r.head.fingerprint], "Signing key revoked");
    await signingFresh(model, base, model.signingContext, model.signingExpected);
    active();
    C.require(id === participant.value && typed === fingerprint.value, "Key review changed; review again");
    await savePin(id, typed);
    active();
    await reload(id);
    return text("Exact key approved locally. This does not approve message content or share your decision with others.", "Konkretny klucz zatwierdzono lokalnie. Nie oznacza to zatwierdzenia treści ani udostępnienia tej decyzji innym.");
  }, () => !!model.signingContext && !!model.signingParticipants?.[participant.value]?.fingerprint && !model.signingParticipants[participant.value].revoked &&
    signingReviewApprovable(reviewBoard(), fingerprint.value, reviewEcho(), echoConfirm.checked));
  add(reviewActions, text("Remove my approval", "Usuń moje zatwierdzenie"), "remove-trust", reviewOut, async () => {
    const id = participant.value;
    await savePin(id, undefined);
    active();
    await reload(id);
    return text("Local approval removed. No shared files were deleted. Stricter rules may now block affected messages.", "Usunięto lokalne zatwierdzenie. Nie usunięto wspólnych plików. Ostrzejsze reguły mogą teraz blokować te wiadomości.");
  }, () => !!model.signingContext?.state.pins[participant.value]);
  node("p", text("Approval belongs to this browser and board location. A changed key needs a new review. Removing approval does not revoke the participant's key.", "Zatwierdzenie dotyczy tej przeglądarki i lokalizacji tablicy. Zmieniony klucz wymaga nowego sprawdzenia. Usunięcie zatwierdzenia nie unieważnia klucza uczestnika."), review, "signing-help");
  const own = section("signing-own", text("3. Sign your messages", "3. Podpisuj własne wiadomości"), text("You need a private JWK key matching a current registered participant profile. Ask the board administrator to register your public key first. Never share your private key or put it in the board folder.", "Potrzebujesz prywatnego klucza JWK pasującego do bieżącego profilu uczestnika. Najpierw poproś administratora o rejestrację klucza publicznego. Nigdy nie udostępniaj prywatnego klucza ani nie zapisuj go w folderze tablicy."));
  plain(own, text("only your own private key can sign as you. That makes your messages hard to fake. Rooms that require signatures also need your own key approved once, in task 2.", "tylko Twój klucz prywatny może podpisywać jako Ty. Dzięki temu Twoich wiadomości trudno podrobić. Pokoje wymagające podpisów potrzebują też jednorazowego zatwierdzenia Twojego klucza w zadaniu 2."), text("your private key stays in this tab's memory after you unlock it. It is never saved, uploaded or put in the board folder, and is forgotten when you lock, reload or wait 15 minutes.", "klucz prywatny zostaje w pamięci tej karty po odblokowaniu. Nigdy nie jest zapisywany, wysyłany ani umieszczany w folderze tablicy i znika po zablokowaniu, przeładowaniu lub 15 minutach."), text("nothing here. The key file is secret. Share only your public fingerprint.", "nic z tego. Plik klucza jest tajny. Udostępniaj tylko publiczny odcisk."));
  const ownState = node("p", "", own, "signing-mode");
  ownState.id = "signingMode";
  const needs = node("p", text("Unlocking needs two things: the persona you sign as and that persona's private key file. The file stays in this tab. You can also unlock with the padlock button next to Send.", "Odblokowanie wymaga dwóch rzeczy: persony, jako która podpisujesz, i pliku klucza prywatnego tej persony. Plik zostaje w tej karcie. Możesz też odblokować przyciskiem z kłódką obok Wyślij."), own, "signing-help");
  needs.id = "signingOwnNeeds";
  const persona = field(own, text("Step 1. Persona — the “I am” persona you sign as", "Krok 1. Persona — persona z „Jestem”, jako która podpisujesz"), "select", "signingPersona", "Persona to sign as");
  let personaStamp = null;
  persona.onchange = () => {
    try {
      rebind();
      active();
      C.require(!busy, "Signing operation in progress");
      C.require(signingSelectPersona(persona.value), "Persona unavailable");
      ownOut.textContent = text(`“I am” is now ${signingPersonaName(persona.value)}. Messages are signed only as this persona.`, `„Jestem” to teraz ${signingPersonaName(persona.value)}. Wiadomości są podpisywane tylko jako ta persona.`);
      refresh();
    } catch (e) {
      ownOut.textContent = e.message;
    }
  };
  const input = field(own, text("Step 2. Private key file of this persona — stays in this tab", "Krok 2. Plik klucza prywatnego tej persony — pozostaje w tej karcie"), "input", "signingKeyFiles", "Private signing keys (kept only in this tab)");
  input.type = "file";
  input.accept = ".json,application/json";
  input.multiple = true;
  const ownOut = feedback(own), ownActions = node("div", "", own, "signing-actions");
  // The one unlock path, also used by the own-key check in the review task. Signing turns on after it.
  const unlockFiles = async (files) => {
    unlocking = true;
    const epoch = signingProvider.generation;
    try {
      for (const f of files) {
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
    signingMode = "signed";
    signingComposerNote = null;
  };
  add(ownActions, text("🔒 Step 3. Unlock the key", "🔒 Krok 3. Odblokuj klucz"), "unlock", ownOut, async () => {
    C.require(input.files.length > 0 && input.files.length <= 32, "Select 1–32 explicit private JWK files");
    const before = new Set(signingProvider.catalog().map((p) => p.participant));
    await unlockFiles([...input.files]);
    input.value = "";
    const me = currentUser(), name = signingPersonaName(me), catalog = signingProvider.catalog();
    if (catalog.some((p) => p.participant === me)) return text(`Unlocked. New messages are signed as ${name}. There is no unsigned fallback.`, `Odblokowano. Nowe wiadomości są podpisywane jako ${name}. Nie ma automatycznego przejścia na brak podpisu.`);
    const owners = catalog.filter((p) => !before.has(p.participant)).map((p) => signingPersonaName(p.participant)).join(", ") || catalog.map((p) => signingPersonaName(p.participant)).join(", ");
    return text(`This key belongs to ${owners}, not ${name}. Choose that persona in step 1 to sign as them; messages are signed only as the persona in “I am”.`, `Ten klucz należy do: ${owners}, nie do: ${name}. Wybierz tę personę w kroku 1, aby podpisywać jako ona; wiadomości są podpisywane tylko jako persona z „Jestem”.`);
  }, () => !!base && !!model.signingContext && !model.signingError);
  const unlockNote = node("p", "", own, "signing-help");
  unlockNote.id = "signingUnlockNote";
  // The owner's own fingerprint, derived from the unlocked key file on this device, not read from the board.
  const mine = node("div", "", own, "signing-key-card signing-mine");
  mine.id = "signingMyFingerprint";
  mine.hidden = true;
  node("strong", text("Your key fingerprint", "Odcisk Twojego klucza"), mine);
  node("p", text("Read from your unlocked key file on this device, not from the board. Send it to people who review your key, through a channel they already trust.", "Odczytany z odblokowanego pliku klucza na tym urządzeniu, nie z tablicy. Wyślij go osobom, które sprawdzają Twój klucz, kanałem, któremu już ufają."), mine, "signing-help");
  let mineValue = node("code", "", mine), mineShown = null;
  const myFingerprint = () => signingProvider.catalog().find((p) => p.participant === currentUser())?.fingerprint || "";
  const mineActions = node("div", "", mine, "signing-actions");
  add(mineActions, text("Copy my fingerprint", "Kopiuj mój odcisk"), "copy-my-fingerprint", ownOut, async () => {
    await signingClipboardWrite(myFingerprint(), text);
    return text("Your fingerprint is copied. Send it to the person reviewing your key.", "Skopiowano Twój odcisk. Wyślij go osobie, która sprawdza Twój klucz.");
  }, () => !!myFingerprint());
  node("p", text("Unlocking proves you hold the key; it does not approve it. Messages are signed as the persona selected in “I am”: switching persona switches the signer, and posting waits while that persona's key is locked.", "Odblokowanie potwierdza, że masz klucz; nie zatwierdza go. Wiadomości są podpisywane jako persona wybrana w „Jestem”: zmiana persony zmienia podpisującego, a wysyłanie czeka, dopóki klucz tej persony jest zablokowany."), own, "signing-help");
  const lockActions = node("div", "", own, "signing-actions");
  // The Provider holds all unlocked keys under one generation, so locking is always all keys.
  add(lockActions, text("🔒 Lock all keys", "🔒 Zablokuj wszystkie klucze"), "lock", ownOut, () => {
    signingProvider.lock();
    return text("All keys in this tab are locked. Signed sending stays blocked until you unlock the persona's key again.", "Wszystkie klucze w tej karcie zablokowano. Wysyłanie z podpisem jest zablokowane do ponownego odblokowania klucza persony.");
  }, () => signingProvider.catalog().length > 0);
  add(lockActions, text("Use unsigned mode", "Używaj trybu bez podpisu"), "unsigned", ownOut, () => {
    signingProvider.lock();
    signingMode = "unsigned";
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
  // The review steps follow the selected participant and the field; only changed text is written.
  function syncReview() {
    const put = (el, value) => { if (el.textContent !== value) el.textContent = value; };
    const id = participant.value, name = reviewName(), board = reviewBoard(), value = fingerprint.value, result = signingFingerprintCompare(board, value), echo = reviewEcho();
    put(s1.title, text("Check the fingerprint with them.", "Sprawdź odcisk z tą osobą."));
    put(s1Body, text(`Check it with ${name} through a channel you already trust: in person, a phone call, or a chat app you already use with them. Not this board. Either copy the fingerprint above and ask ${name} to compare it with the one on their device, or ask them to send you theirs.`, `Sprawdź go z uczestnikiem ${name} kanałem, któremu już ufasz: osobiście, telefonicznie lub przez komunikator, którego już razem używacie. Nie przez tę tablicę. Skopiuj odcisk powyżej i poproś o porównanie z odciskiem na urządzeniu tej osoby albo poproś o przesłanie własnego.`));
    put(findSummary, text(`How ${name} finds it`, `Gdzie ${name} go znajdzie`));
    put(findViewer, text("In the viewer: Tools → Signing → Sign as me → Copy my fingerprint (after unlocking their key file).", "W przeglądarce: Narzędzia → Podpisy → Podpisuj jako ja → Kopiuj mój odcisk (po odblokowaniu swojego pliku klucza)."));
    put(findCliLead, text("On the command line: ", "W wierszu poleceń: "));
    put(findCliCode, signingOwnFingerprintCommand(id || "<id>", text));
    put(findCliTail, text(" The “key file matches current profile” line shows the fingerprint of that key file.", " Wiersz „key file matches current profile” pokazuje odcisk tego pliku klucza."));
    ownCheck.hidden = !id || id !== currentUser() || !board;
    put(ownCheckHelp, text("Reviewing your own key? Your key file is on this device, so it can confirm the board lists your key.", "Sprawdzasz własny klucz? Twój plik klucza jest na tym urządzeniu, więc może potwierdzić, że tablica pokazuje Twój klucz."));
    put(s2.title, text("Paste what they sent you.", "Wklej otrzymany odcisk."));
    put(fpTitle, text(`Fingerprint ${name} sent you`, `Odcisk przesłany przez: ${name}`));
    // The accessible name stays the earlier English label; Polish uses the visible label.
    const aria = text("Independently verified fingerprint", `Odcisk przesłany przez: ${name}`);
    if (fingerprint.getAttribute("aria-label") !== aria) fingerprint.setAttribute("aria-label", aria);
    put(s3.title, text("Compare.", "Porównaj."));
    put(s4.title, text("Approve.", "Zatwierdź."));
    put(approve, text(`Approve ${name}'s key`, `Zatwierdź klucz: ${name}`));
    put(copyFingerprint, text("Copy fingerprint", "Kopiuj odcisk"));
    put(copyRequest, text("Copy what to send them", "Kopiuj tekst do wysłania"));
    put(paste, text("Paste", "Wklej"));
    put(checkOwn, text("Check with my key file", "Sprawdź moim plikiem klucza"));
    const key = JSON.stringify([board, value, result, name, S.lang]);
    if (key !== compareKey) {
      compareKey = key;
      compare.dataset.state = result.state;
      const parts = [];
      if (result.state === "match") parts.push(node("strong", "✓ " + text("Matches the key on this board", "Zgadza się z kluczem na tej tablicy")));
      else if (result.state === "partial") parts.push(node("p", text("Paste the full fingerprint, including the prefix", "Wklej cały odcisk, łącznie z prefiksem")));
      else if (result.state === "mismatch") {
        parts.push(node("strong", "✗ " + text("Does not match", "Nie zgadza się")));
        parts.push(node("p", text(`The first difference is at character ${result.index + 1}, marked below. Do not approve. Ask ${name} to read it again on their own device.`, `Pierwsza różnica jest na znaku ${result.index + 1}, zaznaczona niżej. Nie zatwierdzaj. Poproś uczestnika ${name} o ponowne odczytanie na własnym urządzeniu.`), null, "signing-help"));
        const dl = node("dl", "", null, "signing-compare-values");
        node("dt", text("On this board", "Na tej tablicy"), dl);
        node("dd", "", dl).append(signingFingerprintNode(board, result.index));
        node("dt", text(`Sent by ${name}`, `Przesłany przez: ${name}`), dl);
        node("dd", "", dl).append(signingFingerprintNode(value, result.index));
        parts.push(dl);
      }
      compare.replaceChildren(...parts);
    }
    echoBox.hidden = !echo;
    put(echoText, text(`This is the value copied from this board. Approve only after ${name} confirmed, outside this board, that it matches the fingerprint on their own device.`, `To wartość skopiowana z tej tablicy. Zatwierdź dopiero, gdy ${name} potwierdzi poza tą tablicą, że zgadza się z odciskiem na urządzeniu tej osoby.`));
    put(echoConfirmText, text(`I confirmed it with ${name} outside this board`, `Potwierdzono z: ${name} poza tą tablicą`));
    const entry = actions.find((a) => a.b === approve);
    approve.disabled = busy || !entry.available();
  }
  function refresh() {
    const ready = !!model.signingContext && !model.signingError;
    status.textContent = model.signingError ? text("Signing unavailable: ", "Podpisy niedostępne: ") + model.signingError : !model.signingContext ? text("Signing requires a native board with valid signing configuration. Continue reading, or open a native board.", "Podpisy wymagają natywnej tablicy z poprawną konfiguracją. Kontynuuj czytanie lub otwórz natywną tablicę.") : !base ? text("Read-only board: approval lasts for this open session. Signed posting requires a writable folder; unsigned replies may download where rules allow.", "Tablica tylko do odczytu: zatwierdzenie obowiązuje w tej otwartej sesji. Podpisywanie wymaga zapisywalnego folderu; odpowiedzi bez podpisu można pobrać, jeśli reguły pozwalają.") : text("Your approvals are private to this browser and board location.", "Twoje zatwierdzenia są prywatne dla tej przeglądarki i lokalizacji tablicy.");
    unlockNote.textContent = base ? "" : text("Unlock is off because this folder is read-only. Open the board folder with write access to sign.", "Odblokowanie jest wyłączone, bo ten folder jest tylko do odczytu. Otwórz folder tablicy z zapisem, aby podpisywać.");
    requires.textContent = model.signingContext ? signingRequirementText(signingRequirementList([model.signingContext.shared, model.signingContext.floor])) : "";
    counts.textContent = [text("Verified", "Zweryfikowane") + ": " + model.msgs.filter((m) => m.signing?.signature === "valid").length, text("Unsigned", "Bez podpisu") + ": " + model.msgs.filter((m) => m.signing?.signature === "unsigned").length, text("Pending / blocked", "Oczekujące / zablokowane") + ": " + model.msgs.filter((m) => !signingEligible(m)).length].join(" · ");
    pendingSummary.textContent = signingPendingSummary(model);
    for (const o of participant.options) { const label = signingParticipantOption(o.value, model); if (o.textContent !== label) o.textContent = label; }
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
    syncReview();
    const catalog = signingProvider.catalog(), me = currentUser();
    const options = [...($("#me")?.options || [])].filter((o) => o.value).map((o) => [o.value, o.textContent]), nextPersonaStamp = JSON.stringify(options);
    if (personaStamp !== nextPersonaStamp && document.activeElement !== persona) {
      personaStamp = nextPersonaStamp;
      persona.replaceChildren(...options.map(([value, label]) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; }));
    }
    if (document.activeElement !== persona) persona.value = me;
    ownState.textContent = signingMode === "unsigned" ? text("Unsigned mode: follow steps 1–3 to sign new messages.", "Tryb bez podpisu: wykonaj kroki 1–3, aby podpisywać nowe wiadomości.") : catalog.some((p) => p.participant === me) ? text("Signing new messages as: ", "Podpisujesz nowe wiadomości jako: ") + `${signingPersonaName(me)} (${me})` : text(`Signed sending paused — unlock the key of ${signingPersonaName(me)}. No unsigned fallback.`, `Wysyłanie z podpisem wstrzymane — odblokuj klucz: ${signingPersonaName(me)}. Brak przejścia na brak podpisu.`);
    const mineFp = myFingerprint();
    mine.hidden = !mineFp;
    if (mineShown !== mineFp) {
      mineShown = mineFp;
      const next = signingFingerprintNode(mineFp);
      mineValue.replaceWith(next);
      mineValue = next;
    }
    persona.disabled = busy || !ready;
    participant.disabled = busy || !ready;
    fingerprint.disabled = busy || !ready;
    input.disabled = busy || !ready;
    for (const { b, available } of actions) b.disabled = busy || !available();
    list.textContent = model.msgs.filter((m) => !signingEligible(m) || m.h.SIGNATURE).map((m) => m.path + "\n" + JSON.stringify(m.signing)).join("\n");
    updateSigningNotice();
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
  dialog.addEventListener("close", () => {
    clearInterval(timer);
    updateSigningNotice();
  }, { once: true });
  if (go) {
    // Without a requested participant the review lands on the first key that needs review.
    const wanted = go.task === "review" ? go.participant || signingPendingReview(model)[0] : null;
    if (wanted && [...participant.options].some((o) => o.value === wanted)) {
      participant.value = wanted;
      participant.onchange();
    }
    goTo(go.task, go);
  }
}

function wireSigning() {
  const b = document.createElement("button");
  b.className = "btn";
  b.id = "signingTools";
  b.innerHTML = '<span class="signing-tools-label"></span><span class="key-badge" hidden><span aria-hidden="true">🔑</span> <span class="key-badge-count"></span></span>';
  b.querySelector(".signing-tools-label").textContent = exText("Signing", "Podpisy");
  b.onclick = () => signingDialog();
  // A separate entry, shown only while keys wait, opens the review on the first of them.
  const review = document.createElement("button");
  review.className = "btn";
  review.id = "reviewKeysTool";
  review.hidden = true;
  review.onclick = () => signingDialog({ task: "review" });
  $("#toolbarToolsPanel").append(b, review);
  $("#keyNoticeReview")?.addEventListener("click", () => signingDialog({ task: "review" }));
  $("#keyNoticeLater")?.addEventListener("click", signingKeyNoticeDismiss);
  document.addEventListener("click", (event) => {
    const opener = event.target.closest?.("[data-signing-open]");
    if (!opener) return;
    event.preventDefault();
    signingOpenTask(opener.dataset.signingOpen, { participant: opener.dataset.signingFor, anchor: opener.dataset.signingAnchor, focus: opener.dataset.signingFocus });
  });
  // The composer row: its buttons act on the status they show, and a key file chosen from
  // it unlocks for the persona in "I am".
  const key = document.createElement("input");
  key.type = "file";
  key.id = "signingComposerKey";
  key.multiple = true;
  key.hidden = true;
  key.setAttribute("aria-label", exText("Private key file of the selected persona", "Plik klucza prywatnego wybranej persony"));
  key.onchange = () => { const files = [...key.files]; key.value = ""; if (files.length) signingComposerUnlock(files); };
  document.body.append(key);
  const el = $("#signingNotice");
  el?.addEventListener("click", (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    if (button.classList.contains("signing-notice-more")) {
      const open = !el.classList.contains("expanded");
      el.classList.toggle("expanded", open);
      button.setAttribute("aria-expanded", String(open));
      return;
    }
    // Switching persona is always this explicit click; the key was unlocked to sign, so signing turns on.
    if (button.signingSwitch) {
      const id = button.signingSwitch;
      signingComposerNote = null;
      if (signingSelectPersona(id)) {
        signingMode = "signed";
        updateSigningNotice();
        $("#signingNotice .signing-notice-action:not([hidden])")?.focus();
      }
      return;
    }
    signingNoticeAction(button);
  });
  // Any destination change (room, topic, new room, recipient) recomputes the status.
  for (const type of ["input", "change"]) $("#composer")?.addEventListener(type, () => updateSigningNotice());
  setInterval(signingTick, 3e4);
  // Coming back to the tab rechecks at once; an expired key must not look ready.
  window.addEventListener("focus", signingTick);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) signingTick(); });
}
// Keys lock silently after 15 idle minutes; the composer must not keep showing them as ready.
function signingTick() {
  signingProvider.expire();
  updateSigningNotice();
}
