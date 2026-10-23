/* Missing-message check: a read-only view of what locally approved signers once recorded
   about a room. Nothing here records and nothing changes message eligibility; recording
   stays with the CLI (`boardctl history observe`, or a signed `boardctl post` into a room
   that records automatically). The only board write is the room's shared setting in
   config.json (SPEC-002-063), after an explicit, reviewed confirmation. Rules live in
   room-history.js. */
let historySerial = Promise.resolve();
const historySessions = new Map(), historyDigests = new Map();
const historySerialize = (work) => { const run = historySerial.then(work); historySerial = run.catch(() => {}); return run; };
const historyStamp = (context) => JSON.stringify([Object.entries(context.state.pins).sort(), Object.entries(context.state.revoked).sort()]);

async function historyOpenFile(base, path) {
  try {
    let dir = base;
    const parts = path.split("/");
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await dir.getFileHandle(parts.at(-1))).getFile();
  } catch (e) {
    if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null;
    throw e;
  }
}
async function historyDigest(file, limit, key) {
  if (file.size > limit) return "error";
  const reliable = Number.isFinite(file.size) && Number.isFinite(file.lastModified), cached = historyDigests.get(key);
  if (reliable && cached && cached.size === file.size && cached.modified === file.lastModified) return cached.sha256;
  try {
    const sha256 = await SigningContract.hash(await rawBytes(file));
    if (reliable) {
      if (historyDigests.size > 8192) historyDigests.clear();
      historyDigests.set(key, { size: file.size, modified: file.lastModified, sha256 });
    }
    return sha256;
  } catch { return "error"; }
}
const historyMessageName = /^[A-Za-z0-9_.-]+\.txt$/;

function historyNativeHost(base, directDir, location, messagePaths) {
  const names = async (path) => {
    try {
      let dir = base;
      for (const part of path.split("/")) dir = await dir.getDirectoryHandle(part);
      const out = [];
      for await (const [name, handle] of dir.entries()) out.push([name, handle.kind]);
      return out;
    } catch (e) {
      if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null;
      throw e;
    }
  };
  return {
    scopes: async () => {
      const found = [];
      for (const [folder, prefix] of [["rooms", "rooms"], [directDir, directDir], ["history/rooms", "rooms"], ["history/" + directDir, directDir]]) {
        for (const [name, kind] of await names(folder) || []) if (kind === "directory" && !name.startsWith(".")) found.push(prefix + "/" + name);
      }
      return found;
    },
    listHistory: async (scope) => (await names("history/" + scope))?.filter(([, kind]) => kind === "file").map(([name]) => name) ?? null,
    readHistory: async (scope, name, limit) => {
      const file = await historyOpenFile(base, "history/" + scope + "/" + name);
      return file && file.size <= limit ? rawBytes(file) : null;
    },
    // The reader already indexed every message file; do not list large folders again.
    listMessages: async (scope) => [...messagePaths()].filter((path) => path.startsWith(scope + "/") && !path.slice(scope.length + 1).includes("/") && historyMessageName.test(path.slice(scope.length + 1))).map((path) => path.slice(scope.length + 1)),
    readCurrent: async (path) => {
      try {
        const file = await historyOpenFile(base, path);
        if (!file) return null;
        const sha256 = await historyDigest(file, 4194304, location + "|" + path);
        return sha256 === "error" ? "error" : { sha256, bytes: file.size };
      } catch { return "error"; }
    },
    readSidecar: async (scope, record) => {
      try {
        const file = await historyOpenFile(base, scope + "/.signatures/" + record + ".json");
        return file ? await historyDigest(file, 65536, location + "|" + scope + "|" + record) : null;
      } catch { return "error"; }
    }
  };
}

function historyUploadHost(files) {
  const index = new Map(files.map((f) => [f.path, f])), direct = (path, folder) => path.startsWith(folder + "/") && !path.slice(folder.length + 1).includes("/");
  const read = async (entry, source, limit) => {
    if (!source) return null;
    if (source.size > limit) return "error";
    try { return await SigningContract.hash(await rawBytes(source)); } catch { return "error"; }
  };
  return {
    scopes: async () => [...new Set(files.flatMap((f) => {
      const parts = f.path.split("/");
      return parts[0] === "history" && parts.length === 4 ? [parts[1] + "/" + parts[2]] : parts.length === 3 && f.path.endsWith(".txt") ? [parts[0] + "/" + parts[1]] : [];
    }))],
    listHistory: async (scope) => {
      const found = files.filter((f) => f.historyFile && direct(f.path, "history/" + scope)).map((f) => f.path.split("/").at(-1));
      return found.length ? found : null;
    },
    readHistory: async (scope, name, limit) => {
      const entry = index.get("history/" + scope + "/" + name);
      return entry?.historyFile && entry.historyFile.size <= limit ? rawBytes(entry.historyFile) : null;
    },
    listMessages: async (scope) => files.filter((f) => f.file && direct(f.path, scope) && historyMessageName.test(f.path.split("/").at(-1))).map((f) => f.path.split("/").at(-1)),
    readCurrent: async (path) => {
      const entry = index.get(path);
      if (!entry?.file) return null;
      const sha256 = await read(entry, entry.file, 4194304);
      return sha256 === "error" ? "error" : { sha256, bytes: entry.file.size };
    },
    readSidecar: async (scope, record) => {
      const entry = index.get(scope + "/.signatures/" + record + ".json");
      return entry?.signingFile ? read(entry, entry.signingFile, 65536) : null;
    }
  };
}

async function historySave(key, expected, state) {
  const raw = JSON.stringify(state);
  SigningContract.require(raw.length <= RoomHistory.STATE_LIMIT, "private history budget");
  const db = await idb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite"), store = tx.objectStore("kv"), q = store.get(key);
      let conflict = false;
      q.onsuccess = () => {
        if (JSON.stringify(q.result ?? null) !== expected) { conflict = true; tx.abort(); return; }
        store.put(JSON.parse(raw), key);
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || Error("Private history unavailable"));
      tx.onabort = () => reject(Error(conflict ? "Private history changed in another tab; refresh to review" : "Private history unavailable"));
    });
  } finally { db.close(); }
}

// Builds the per-room results for a native board or an upload. Never throws into the reader.
async function prepareHistory(model, files, base = null) {
  model.history = null;
  try { await prepareHistoryChecked(model, files, base); } catch (error) {
    model.history = { status: "unavailable", reason: String(error?.message || error).slice(0, 240), scopes: {} };
  }
}
async function prepareHistoryChecked(model, files, base) {
  if (model.layout.dialect !== "native") return;
  if (model.signingError) {
    if (/board UUID changed/i.test(model.signingError)) model.history = { status: "unavailable", reason: model.signingError, scopes: {} };
    return;
  }
  const context = model.signingContext;
  if (!context?.boardId) return;
  const location = base ? boardStorageId : "upload-session", key = base && !location.startsWith("session-") ? "history-state:" + location : null;
  const sessionKey = base ? "native:" + location : "upload:" + model.name + ":" + context.boardId;
  const host = base ? historyNativeHost(base, model.layout.directDir, location, () => messageFiles.keys()) : historyUploadHost(files);
  const run = () => historySerialize(async () => {
    const view = { status: "ready", reason: "", report: null, stamp: "", saveError: "", persistent: !!key };
    try {
      const stored = key ? await signingGet(key) : historySessions.get(sessionKey) ?? null, expected = JSON.stringify(stored ?? null);
      const state = RoomHistory.loadState(stored, context.boardId, location);
      view.report = RoomHistory.annotate(await RoomHistory.evaluate(context, state, host), state, context.state, historyConfig(model) || {});
      if (key) {
        // No record is created until a recording was attempted or remembered.
        if (JSON.stringify(state) !== expected && (stored !== null || state.sequence > 0)) {
          try { await historySave(key, expected, state); } catch (error) { view.saveError = error.message; }
        }
      } else historySessions.set(sessionKey, state);
    } catch (error) {
      view.status = "unavailable";
      view.reason = String(error.message || error).slice(0, 240);
    }
    view.stamp = historyStamp(context);
    model.history = view;
    return view;
  });
  model.historyRun = run;
  await run();
}

function historyScope(model) {
  return model && sel.scope && sel.dir ? (sel.scope === "direct" ? model.layout.directDir : "rooms") + "/" + sel.dir : null;
}
function historyTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString(S.lang === "pl" ? "pl-PL" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

// Everything the indicator and panel say, in one place (EN and PL): hedged wording, no padlock imagery.
function historyWords(report, scope) {
  const text = exText, rows = report?.entries || [], count = (state) => rows.filter((r) => r.observed === state).length;
  const missing = count("message-unavailable"), changed = count("changed") + count("conflicting-commitments");
  const unchecked = count("signature-evidence-unavailable") + count("unverifiable"), pending = report?.pending || 0;
  const notes = report?.diagnostics || [];
  const neutral = !!report && (missing + unchecked + changed > 0 || !report.windowComplete || notes.some((n) => ["checkpoint-capacity-exhausted", "profile-evidence-unavailable", "referenced-observation-unavailable"].includes(n)));
  const tier = !report || !report.setUp ? "none" : report.needsAttention > 0 ? "warning" : neutral ? "neutral" : "ok";
  const expected = report?.coverage.expected ?? 0, available = report?.coverage.available ?? 0, uncovered = report?.coverage.uncovered ?? 0;
  const counts = text(`${expected} expected, ${available} available, ${uncovered} not covered`, `oczekiwane: ${expected}, dostępne: ${available}, nieobjęte: ${uncovered}`);
  const qualifier = text("seen from this folder only", "widziane tylko z tego folderu");
  const parts = [];
  if (changed) parts.push(text(`${changed} changed or in conflict`, `zmienione lub sprzeczne: ${changed}`));
  if (missing) parts.push(text(`${missing} not found here`, `nie znaleziono tutaj: ${missing}`));
  if (unchecked) parts.push(text(`${unchecked} cannot be checked`, `nie można sprawdzić: ${unchecked}`));
  if (pending) parts.push(text(`${pending} ${pending === 1 ? "observation" : "observations"} not yet checked`, `niesprawdzone obserwacje: ${pending}`));
  const short = !report?.setUp ? text("Not set up", "Nie skonfigurowano") : [text(`${available} of ${expected} available`, `dostępne: ${available} z ${expected}`), ...parts].join(" · ");
  return { tier, short, counts, qualifier, pending, missing, changed, unchecked, scope };
}

function historyIndicatorUpdate() {
  const button = document.getElementById("historyOpen"), model = B, scope = historyScope(model), view = model?.history;
  if (!button) return;
  if (!view || !scope) { button.hidden = true; return; }
  if (view.status === "ready" && model.signingContext && view.stamp !== historyStamp(model.signingContext) && !model.historyBusy) {
    // A key approval or learned revocation changed: recompute from the same snapshot.
    model.historyBusy = true;
    model.historyRun().finally(() => { model.historyBusy = false; if (B === model) historyIndicatorUpdate(); });
  }
  const label = exText("Missing-message check", "Kontrola brakujących wiadomości");
  const words = historyWords(view.report?.scopes[scope], scope);
  button.hidden = false;
  button.dataset.tier = view.status === "ready" ? words.tier : "neutral";
  button.textContent = label + ": " + (view.status === "ready" ? words.short : exText("unavailable", "niedostępna"));
  button.title = view.status === "ready" ? words.counts : view.reason;
}

const historySourceLabel = (row) => {
  const text = exText;
  if (row.source === "revoked") return text("recorded by a signer you no longer trust (key reported compromised)", "zapisane przez sygnatariusza, któremu już nie ufasz (klucz zgłoszono jako przejęty)");
  if (row.source === "unpinned") return text("recorded by a signer you no longer trust", "zapisane przez sygnatariusza, któremu już nie ufasz");
  if (row.source === "previously-trusted") return text("recorded by an earlier key of a signer you approved", "zapisane wcześniejszym kluczem zatwierdzonego sygnatariusza");
  return "";
};
function historyObservedLabel(row) {
  const text = exText;
  switch (row.observed) {
    case "available": return text("Available", "Dostępna");
    case "message-unavailable": return text(`Not found here since ${historyTime(row.unavailableSince)}; it may still be syncing`, `Nie znaleziono tutaj od ${historyTime(row.unavailableSince)}; może się jeszcze synchronizować`);
    case "signature-evidence-unavailable": return text("Message found here; its signature file was not found", "Wiadomość jest tutaj; nie znaleziono pliku jej podpisu");
    case "unverifiable": return text("Could not be checked here", "Nie udało się tego sprawdzić");
    case "changed": return text("Changed since it was recorded", "Zmieniona od czasu zapisania");
    case "conflicting-commitments": return text("Trusted records disagree about this message", "Zaufane zapisy nie zgadzają się co do tej wiadomości");
    default: return row.observed;
  }
}

function historyDialog() {
  const model = B, scope = historyScope(model), text = exText;
  if (!model?.history || !scope) return;
  const opener = document.getElementById("historyOpen");
  document.getElementById("historyDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "historyDialog";
  dialog.setAttribute("aria-labelledby", "historyDialogTitle");
  const node = (tag, content, parent, cls) => {
    const n = document.createElement(tag);
    if (content) n.textContent = content;
    if (cls) n.className = cls;
    if (parent) parent.append(n);
    return n;
  };
  const head = node("div", "", dialog, "vocabulary-head");
  const title = node("h2", text("Missing-message check", "Kontrola brakujących wiadomości"), head);
  title.id = "historyDialogTitle";
  const close = node("button", text("Close", "Zamknij"), head, "btn");
  close.dataset.action = "close";
  close.onclick = () => dialog.close();
  const body = node("div", "", dialog, "history-body");
  let shown = null;
  const fill = () => {
    const view = B?.history;
    if (!view) return;
    const report = view.report?.scopes[historyScope(B)], signature = JSON.stringify([view.status, view.reason, view.saveError, report]);
    if (signature === shown) return;
    shown = signature;
    const open = new Set([...body.querySelectorAll("details[open]")].map((d) => d.id)), scroll = dialog.scrollTop;
    body.replaceChildren();
    const words = historyWords(report, scope);
    node("p", scope, body, "history-scope");
    if (view.status === "ready" && report) historyRecordingSection(report, body, node, dialog);
    if (view.status !== "ready") {
      node("p", text("This check is unavailable: ", "Ta kontrola jest niedostępna: ") + view.reason, body, "history-note");
    } else {
      const summary = node("p", "", body, "history-summary");
      summary.setAttribute("role", "status");
      summary.dataset.tier = words.tier;
      if (!report?.setUp) {
        summary.textContent = text("Not set up: no observations yet", "Nie skonfigurowano: brak jeszcze obserwacji");
        node("p", text("Nothing in this room is protected yet. Uncovered messages are normal until someone records the room.", "Nic w tym pokoju nie jest jeszcze chronione. Wiadomości nieobjęte kontrolą są normalne, dopóki ktoś nie zapisze pokoju."), body, "history-note");
      } else {
        summary.textContent = words.counts + (report.bootstrap === "folder-only" ? " (" + words.qualifier + ")" : "");
        if (report.bootstrap === "folder-only") node("p", text("Seen from this folder only: anything removed before this browser first checked cannot be detected.", "Widziane tylko z tego folderu: braków sprzed pierwszego sprawdzenia w tej przeglądarce nie da się wykryć."), body, "history-note");
        if (!report.windowComplete) node("p", text(`${report.pending} ${report.pending === 1 ? "observation" : "observations"} not yet checked`, `Niesprawdzone obserwacje: ${report.pending}`), body, "history-note");
        const list = node("ul", "", body, "history-rows");
        const notable = report.entries.filter((r) => r.observed !== "available");
        for (const row of notable.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || (a.path < b.path ? -1 : 1)).slice(0, 200)) {
          const item = node("li", "", list, "history-row");
          item.dataset.historyPath = row.path;
          item.dataset.historyObserved = row.observed;
          item.dataset.historySource = row.source;
          item.dataset.historyTier = row.needsAttention ? "warning" : "neutral";
          node("strong", row.path.split("/").at(-1), item, "history-file");
          node("span", historyObservedLabel(row), item, "history-state");
          const source = historySourceLabel(row);
          if (source) node("span", source, item, "history-source");
        }
        if (notable.length > 200) node("p", text(`More not shown (see the technical details): ${notable.length - 200}`, `Nie pokazano więcej (zobacz szczegóły techniczne): ${notable.length - 200}`), body, "history-note");
        if (!notable.length) node("p", text("Every remembered message is available here.", "Wszystkie zapamiętane wiadomości są tutaj dostępne."), body, "history-note");
        if (report.coverage.uncovered) {
          const more = node("details", "", body, "history-more");
          more.id = "historyUncovered";
          node("summary", text(`Messages not covered: ${report.coverage.uncovered}`, `Wiadomości nieobjęte kontrolą: ${report.coverage.uncovered}`), more);
          node("p", text("These were added after the last recording, which is normal on an active room.", "Dodano je po ostatnim zapisie, co jest normalne w aktywnym pokoju."), more, "history-note");
          const names = node("ul", "", more);
          for (const path of report.uncoveredPaths) node("li", path.split("/").at(-1), names);
        }
      }
      if (report) {
        for (const [kind, en, pl] of [
          ["unpinned-signer", "Recordings from signers you have not approved (not used)", "Zapisy sygnatariuszy, których nie zatwierdzono (nieużywane)"],
          ["unfamiliar-signer", "Recordings signed with a key other than your approved current key (not used)", "Zapisy podpisane innym kluczem niż zatwierdzony bieżący (nieużywane)"],
          ["pending-verification", "Recordings that could not be checked yet", "Zapisy, których nie udało się jeszcze sprawdzić"]
        ]) {
          const count = report.inventories[kind].length;
          if (count) node("p", text(`${en}: ${count}`, `${pl}: ${count}`), body, "history-note").dataset.historyInventory = kind;
        }
        if (report.inventories["invalid-inventory"]) node("p", text(`Ignored recording files that are not valid: ${report.inventories["invalid-inventory"]}`, `Zignorowane nieprawidłowe pliki zapisów: ${report.inventories["invalid-inventory"]}`), body, "history-note");
        const diagnostics = {
          "checkpoint-capacity-exhausted": text("This browser's memory for this check is full, so newer recordings are not remembered. Nothing remembered was dropped.", "Pamięć tej kontroli w przeglądarce jest pełna, więc nowsze zapisy nie są zapamiętywane. Niczego zapamiętanego nie porzucono."),
          "profile-evidence-unavailable": text("A signer's key history could not be re-read. Earlier results are kept.", "Nie udało się ponownie odczytać historii kluczy sygnatariusza. Wcześniejsze wyniki zachowano."),
          "referenced-observation-unavailable": text("A recording that other recordings refer to is not available here.", "Zapis, do którego odwołują się inne zapisy, nie jest tutaj dostępny.")
        };
        for (const note of report.diagnostics) if (diagnostics[note]) node("p", diagnostics[note], body, "history-note");
      }
      if (view.saveError) node("p", text("This browser could not save its memory of this check: ", "Przeglądarka nie zapisała pamięci tej kontroli: ") + view.saveError, body, "history-note");
      node("p", view.persistent ? text("Remembered privately in this browser for this board folder; nothing is written to the board.", "Zapamiętane prywatnie w tej przeglądarce dla tego folderu tablicy; nic nie jest zapisywane na tablicy.")
        : text("Remembered only until this page is closed (read-only or temporary folder); nothing is written to the board.", "Zapamiętane tylko do zamknięcia tej strony (folder tylko do odczytu lub tymczasowy); nic nie jest zapisywane na tablicy."), body, "history-note");
    }
    const how = node("section", "", body, "history-how");
    node("h3", text("Recording a room", "Zapisywanie pokoju"), how);
    node("p", text("This viewer only shows results; it cannot record. To record what this room contains, approve the recording person's key under Signing, then run this in a terminal:", "Ta przeglądarka tylko pokazuje wyniki i nie potrafi zapisywać. Aby zapisać zawartość tego pokoju, zatwierdź klucz osoby zapisującej w Podpisach, a potem uruchom w terminalu:"), how);
    node("code", `boardctl history observe --scope ${scope} --from YOUR-PARTICIPANT-ID --signing-key-file YOUR-KEY.json`, how, "history-command");
    node("p", text("Or turn on automatic recording in the room menu (…): every signed post from the CLI then records the room with its poster's key.", "Albo włącz automatyczne zapisywanie w menu pokoju (…): każdy podpisany wpis z CLI zapisze wtedy pokój kluczem autora."), how);
    const limits = node("details", "", body, "history-more");
    limits.id = "historyLimits";
    node("summary", text("What this does not protect", "Czego to nie chroni"), limits);
    const bullets = node("ul", "", limits);
    for (const line of [
      text("It only detects. It cannot restore anything or stop a change; backups and access control are still needed.", "Tylko wykrywa. Niczego nie przywróci ani nie zapobiegnie zmianie; nadal potrzebne są kopie zapasowe i kontrola dostępu."),
      text("A recording is one signer's observation. It does not prove the list was complete or current.", "Zapis to obserwacja jednego sygnatariusza. Nie dowodzi, że lista była kompletna ani aktualna."),
      text("Anything that went missing before this browser first checked this folder cannot be detected, nor can the loss of a signer's newest recording that nothing refers to yet.", "Braków sprzed pierwszego sprawdzenia tego folderu w tej przeglądarce nie da się wykryć, podobnie jak zniknięcia najnowszego zapisu sygnatariusza, do którego nic jeszcze się nie odwołuje."),
      text("If this browser's saved memory is lost (for example by clearing site data), so is the protection.", "Jeśli zapisana pamięć przeglądarki zostanie utracona (na przykład po wyczyszczeniu danych witryn), traci się też ochronę."),
      text("A signer you approved, or someone holding that signer's key before it is reported compromised, can sign misleading recordings, including false \"not found\" reports.", "Zatwierdzony sygnatariusz lub ktoś, kto ma jego klucz, zanim zgłoszono przejęcie, może podpisać mylące zapisy, także fałszywe „nie znaleziono”."),
      text("Protection starts only after someone records the room with a key you approved.", "Ochrona zaczyna się dopiero po zapisaniu pokoju kluczem, który zatwierdzono."),
      text("It does not hide anything: everyone who can read the folder still reads every message.", "Niczego nie ukrywa: każdy, kto może czytać folder, nadal czyta wszystkie wiadomości.")
    ]) node("li", line, bullets);
    const technical = node("details", "", body, "history-more");
    technical.id = "historyTechnical";
    node("summary", text("Technical details", "Szczegóły techniczne"), technical);
    const facts = report && { setUp: report.setUp, bootstrap: report.bootstrap, diagnostics: report.diagnostics, needsAttention: report.needsAttention, summary: report.summary, coverage: report.coverage,
      uncoveredPaths: report.uncoveredPaths, windowComplete: report.windowComplete, inventories: Object.fromEntries(Object.entries(report.inventories).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])),
      recordedBy: report.recordedBy, ...(report.recording ? { recording: report.recording } : {}), ...(report.trustHint ? { trustHint: { participants: report.trustHint.participants } } : {}),
      entries: report.entries.map((r) => ({ path: r.path, observed: r.observed, source: r.source, needsAttention: r.needsAttention, neutral: r.neutral })) };
    const pre = node("pre", JSON.stringify(facts ?? null, null, 1), technical);
    pre.dataset.historyJson = "";
    for (const id of open) { const d = body.querySelector("#" + id); if (d) d.open = true; }
    dialog.scrollTop = scroll;
  };
  fill();
  document.body.append(dialog);
  dialog.showModal();
  const timer = setInterval(() => { if (dialog.open) fill(); }, 2000);
  dialog.addEventListener("close", () => { clearInterval(timer); dialog.remove(); if (!opener.hidden) opener.focus(); }, { once: true });
}

// -- automatic recording (SPEC-002-063) -----------------------------------------------

// config.json as room-history.js parses it (its own number kinds), from the bytes signing read.
function historyConfig(model) {
  if (!model?.signingConfigRaw) return null;
  if (model.historyConfigRaw !== model.signingConfigRaw) {
    model.historyConfigRaw = model.signingConfigRaw;
    try { model.historyConfigParsed = RoomHistory.parseConfig(model.signingConfigRaw); } catch { model.historyConfigParsed = null; }
  }
  return model.historyConfigParsed;
}

const historyName = (id) => B?.people?.[id]?.name || id;
const historyKeyLabel = (source) => ({
  "pinned-current": exText("approved key", "zatwierdzony klucz"),
  "previously-trusted": exText("earlier approved key", "wcześniejszy zatwierdzony klucz"),
  unpinned: exText("key no longer approved", "klucz już niezatwierdzony"),
  revoked: exText("key reported compromised", "klucz zgłoszony jako przejęty")
})[source] || source;
function historyRecordingText(recording) {
  if (!recording) return exText("Automatic recording is off for this room. Turn it on in the room menu (…).", "Automatyczne zapisywanie jest wyłączone w tym pokoju. Włącz je w menu pokoju (…).");
  if (recording.unreadable) return exText("The automatic recording setting in config.json cannot be read: ", "Nie można odczytać ustawienia automatycznego zapisywania w config.json: ") + recording.unreadable;
  if (!recording.threads) return exText("Records automatically on signed posts", "Zapisuje automatycznie przy podpisanych wpisach");
  return exText(`Records automatically on signed posts in topics ${recording.threads.join(", ")}`, `Zapisuje automatycznie przy podpisanych wpisach w wątkach ${recording.threads.join(", ")}`);
}
// The declared setting, who recorded, and whose key would make their records count here.
function historyRecordingSection(report, body, node, dialog) {
  const box = node("section", "", body, "history-recording");
  const declared = node("p", historyRecordingText(report.recording), box, "history-recording-setting");
  declared.dataset.historyRecording = report.recording ? report.recording.unreadable ? "unreadable" : report.recording.threads ? "threads" : "room" : "off";
  if (report.recording && !report.recording.unreadable) node("p", exText("Only signed posts from the CLI record. This viewer cannot record yet; its posts are covered by the next recording.", "Zapisują tylko podpisane wpisy z CLI. Ta przeglądarka jeszcze nie potrafi zapisywać; jej wpisy obejmie następny zapis."), box, "history-note");
  const by = report.recordedBy || [];
  if (by.length) {
    const line = node("p", "", box, "history-recorded-by");
    line.textContent = exText("Recorded by ", "Zapisali: ") + by.map((r) => `${historyName(r.participant)} (${historyKeyLabel(r.source)})`).join(", ");
    line.dataset.historyRecordedBy = by.map((r) => r.participant + ":" + r.source).join(" ");
  }
  for (const participant of report.trustHint?.participants || []) {
    const name = historyName(participant), hint = node("p", "", box, "history-trust-hint");
    hint.dataset.historyTrustHint = participant;
    node("span", exText(`Records by ${name} count here only after you approve ${name}'s key.`, `Zapisy: ${name} liczą się tutaj dopiero po zatwierdzeniu klucza: ${name}.`) + " ", hint);
    const review = node("button", exText(`Review ${name}'s fingerprint`, `Sprawdź odcisk klucza: ${name}`), hint, "btn");
    review.type = "button";
    review.onclick = () => { dialog.close(); signingDialog({ task: "review", participant, focus: "#signingFingerprint" }); };
  }
}

// One review for every config.json edit: the exact bytes before and after, and an extra
// confirmation when the edit weakens a protection (`--weaken` on the CLI).
function historyDiff(before, after) {
  const a = before.split("\n"), b = after.split("\n"), n = a.length, m = b.length, lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push("  " + a[i]); i++; j++; }
    else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) out.push("+ " + b[j++]);
    else out.push("- " + a[i++]);
  }
  return out.join("\n");
}
async function historyConfigPlan(edits) {
  SigningContract.require(B?.layout.dialect === "native" && canWrite() && baseHandle, exText("Open the board folder with write access to change this setting.", "Otwórz folder tablicy z zapisem, aby zmienić to ustawienie."));
  const base = baseHandle, origin = dirHandle, raw = await signingRead(base, "config.json", 1048576), before = SigningContract.text(raw), original = RoomHistory.parseConfig(raw);
  let config = original, changed = false, weakening = [];
  for (const edit of edits) {
    const result = edit(config);
    if (result.changed) { config = result.config; changed = true; }
    if (result.weakening) weakening.push(result.target);
  }
  return { base, origin, before, after: changed ? RoomHistory.encodeConfig(config, original) : before, changed, config, weakening };
}
function historyReview(plan, summary, weakenText) {
  return new Promise((resolve) => {
    document.getElementById("historyReviewDialog")?.remove();
    const dialog = document.createElement("dialog"), text = exText;
    dialog.id = "historyReviewDialog";
    dialog.setAttribute("aria-labelledby", "historyReviewTitle");
    const add = (tag, content, parent = dialog, cls = "") => { const n = document.createElement(tag); if (content) n.textContent = content; if (cls) n.className = cls; parent.append(n); return n; };
    add("h2", text("Review the change to config.json", "Sprawdź zmianę w config.json")).id = "historyReviewTitle";
    for (const line of summary) add("p", line, dialog, "history-review-line");
    add("p", text("This writes the shared board setting in .agent-board/config.json, exactly as shown. It is refused if the file changes before you confirm. Review it in Git like any other config change.", "To zapisze wspólne ustawienie tablicy w .agent-board/config.json dokładnie tak, jak pokazano. Zapis zostanie odrzucony, jeśli plik zmieni się przed potwierdzeniem. Przejrzyj go w Git jak każdą zmianę konfiguracji."), dialog, "history-note");
    const diff = add("pre", historyDiff(plan.before, plan.after), dialog, "history-diff");
    diff.dataset.historyDiff = "";
    const full = add("details", "", dialog, "history-more");
    add("summary", text("Exact new file", "Dokładna nowa treść pliku"), full);
    add("pre", plan.after, full).dataset.historyAfter = "";
    let confirm = null;
    if (weakenText) {
      const label = add("label", "", dialog, "history-weaken");
      confirm = document.createElement("input");
      confirm.type = "checkbox";
      confirm.id = "historyWeakenConfirm";
      label.append(confirm, " " + weakenText);
    }
    const actions = add("div", "", dialog, "history-review-actions");
    const cancel = add("button", text("Cancel", "Anuluj"), actions, "btn");
    const ok = add("button", text("Write config.json", "Zapisz config.json"), actions, "btn primary");
    cancel.type = ok.type = "button";
    cancel.dataset.action = "cancel";
    ok.dataset.action = "confirm";
    let answer = false;
    if (confirm) { ok.disabled = true; confirm.onchange = () => { ok.disabled = !confirm.checked; }; }
    cancel.onclick = () => dialog.close();
    ok.onclick = () => { answer = true; dialog.close(); };
    dialog.addEventListener("close", () => { dialog.remove(); resolve(answer); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}
const historySameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
// Writes exactly the reviewed bytes, with the CLI's rules: refuse while a CLI writer holds the
// board's write lock, and refuse when config.json no longer has the reviewed bytes.
async function historyConfigCommit(plan) {
  const C = SigningContract, expected = C.bytes(plan.before);
  const guard = async () => {
    C.require(dirHandle === plan.origin && baseHandle === plan.base, exText("The board changed; nothing was written.", "Tablica się zmieniła; niczego nie zapisano."));
    let busy = true;
    try { await plan.base.getDirectoryHandle(".identity-write-lock"); } catch (error) { if (error.name !== "NotFoundError") throw error; busy = false; }
    C.require(!busy, exText("Another board writer is busy (.agent-board/.identity-write-lock exists); nothing was written. If no command is running, inspect that lock manually.", "Inny zapis tablicy jest w toku (istnieje .agent-board/.identity-write-lock); niczego nie zapisano. Jeśli żadne polecenie nie działa, sprawdź tę blokadę ręcznie."));
    C.require(historySameBytes(await signingRead(plan.base, "config.json", 1048576), expected), exText("config.json changed since you reviewed it; nothing was written. Review the change again.", "config.json zmienił się od przeglądu; niczego nie zapisano. Przejrzyj zmianę ponownie."));
  };
  const run = async () => {
    await guard();
    const handle = await plan.base.getFileHandle("config.json"), writer = await handle.createWritable();
    try {
      await writer.write(plan.after);
      await guard();
      await writer.close();
    } catch (error) {
      try { await writer.abort(); } catch { /* the original file stays */ }
      throw error;
    }
    C.require(C.text(await signingRead(plan.base, "config.json", 1048576)) === plan.after, exText("config.json could not be verified after writing; inspect it.", "Nie udało się sprawdzić config.json po zapisie; sprawdź go."));
  };
  if (navigator.locks) await navigator.locks.request("afb-config:" + boardStorageId, run); else await run();
}
const historyError = (message) => Object.assign(new Error(message), { name: "BoardError" });

// -- composer: options when creating a room or topic -----------------------------------

// "room" for a new room, "thread" for a new topic, null otherwise; only where the options can be honored.
function historyCreationMode() {
  if (!B || B.layout.dialect !== "native" || !canWrite() || !B.signingContext?.boardId) return null;
  const where = $("#cWhere")?.value || "";
  if (!where.startsWith("direct:") && where !== "newdirect" && slugify($("#cNewRoom")?.value || "")) return "room";
  return $("#cThread") && !$("#cThread").value ? "thread" : null;
}
function historyCreationChoice() {
  const mode = historyCreationMode(), box = document.getElementById("historyCreate");
  if (!mode || !box) return null;
  const require = box.querySelector("#cRequireTrusted").checked, record = box.querySelector("#cRecordHistory").checked;
  return require || record ? { mode, require, record } : null;
}
// The composer signing status treats a ticked requirement as required at once (AC3).
const historyCreationRequires = () => !!historyCreationChoice()?.require;
function historyComposerScope() {
  const where = $("#cWhere")?.value || "", L = B.layout, room = slugify($("#cNewRoom")?.value || "");
  if (where === "newdirect") return L.directDir + "/" + [currentUser(), $("#cTo")?.value].sort().join("--");
  if (where.startsWith("direct:")) return L.directDir + "/" + where.slice(7);
  return L.roomsDir + "/" + (room || where.slice(5));
}
let historyPosted = null;
const historyComposerAnchor = () => { try { return historyComposerScope() + "|" + signingDestinationPath().thread; } catch { return ""; } };
// Keeps the composer's history options and note in step with its destination.
function historyComposerUpdate() {
  const box = document.getElementById("historyCreate"), note = document.getElementById("historyComposerNote");
  if (!box || !note) return;
  const mode = historyCreationMode();
  box.hidden = !mode;
  if (!mode) for (const input of box.querySelectorAll("input")) input.checked = false;
  const set = (el, value) => { if (el.textContent !== value) el.textContent = value; };
  set(box.querySelector(".history-create-title"), mode === "room" ? exText("New room settings", "Ustawienia nowego pokoju") : exText("New topic settings", "Ustawienia nowego wątku"));
  set(box.querySelector("[data-history-option=require] span"), exText("Require trusted signatures", "Wymagaj zaufanych podpisów"));
  set(box.querySelector("[data-history-option=record] span"), exText("Record room history automatically", "Automatycznie zapisuj historię pokoju"));
  set(box.querySelector(".history-create-note"), exText("Written to config.json before the first message, after you review it. Recording happens on signed posts from the CLI; this viewer cannot record.", "Zapisywane w config.json przed pierwszą wiadomością, po Twoim przeglądzie. Zapis historii następuje przy podpisanych wpisach z CLI; ta przeglądarka nie potrafi zapisywać."));
  let text = "";
  if (B?.signingContext && B.layout.dialect === "native" && !mode) {
    try {
      const target = signingDestinationPath(), scope = historyComposerScope();
      if (RoomHistory.records(historyConfig(B), scope, target.thread)) text = exText(`${scope} records history automatically, but this viewer cannot record. After posting, record with boardctl history observe or post from the CLI.`, `${scope} zapisuje historię automatycznie, ale ta przeglądarka nie potrafi zapisywać. Po wysłaniu zapisz przez boardctl history observe albo wyślij z CLI.`);
    } catch { /* an unreadable setting is shown in the history panel */ }
  }
  // The note after a post stays until the destination changes.
  if (historyPosted && B && historyPosted.anchor === historyComposerAnchor()) text = historyPosted.text;
  else historyPosted = null;
  if (historyPosted) note.dataset.historyPosted = ""; else delete note.dataset.historyPosted;
  set(note, text);
  note.hidden = !text;
}
// Checks what canonical `post --new-room/--new-thread` checks before writing anything.
async function historyCreationPreflight(choice, me, scope, tid) {
  const text = exText, model = B, context = model.signingContext, flags = [choice.require && text("Require trusted signatures", "Wymagaj zaufanych podpisów"), choice.record && text("Record room history automatically", "Automatycznie zapisuj historię pokoju")].filter(Boolean).join(", ");
  const decision = signingSendDecision(model, true);
  if (decision.kind !== "signed") throw historyError(text(`“${flags}” needs this first message to be signed with ${historyName(me)}'s key: `, `„${flags}” wymaga, aby pierwsza wiadomość była podpisana kluczem: ${historyName(me)}: `) + (decision.status?.detail || decision.status?.label || ""));
  if (!model.signingParticipants?.[me]?.trusted) throw historyError(text(`“${flags}” needs ${historyName(me)}'s own key approved on this device. Approve it under Signing, then send again.`, `„${flags}” wymaga zatwierdzenia na tym urządzeniu własnego klucza: ${historyName(me)}. Zatwierdź go w Podpisach i wyślij ponownie.`));
  const existing = text("Use the room menu (…) > Room history and signing to change an existing room or topic.", "Aby zmienić istniejący pokój lub wątek, użyj menu pokoju (…) > Historia i podpisy pokoju.");
  if (choice.mode === "room") {
    const folder = scope.split("/")[1];
    let found = model.msgs.some((m) => m.scope === "room" && m.dir === folder);
    try {
      const dir = await (await baseHandle.getDirectoryHandle(model.layout.roomsDir)).getDirectoryHandle(folder);
      for await (const [name, handle] of dir.entries()) if (handle.kind === "file" && name.endsWith(".txt")) found = true;
    } catch (error) { if (error.name !== "NotFoundError") throw error; }
    if (found) throw historyError(text(`Room ${folder} already has messages, so this post does not create it. `, `Pokój ${folder} ma już wiadomości, więc ten wpis go nie tworzy. `) + existing);
  } else if (model.msgs.some((m) => m.path.startsWith(scope + "/") && m.tid === tid)) {
    throw historyError(text(`Topic ${tid} already has messages here. `, `Wątek ${tid} ma już tutaj wiadomości. `) + existing);
  }
}
// Writes the creation-time policy before the first message (AC3). Returns the topic number to
// post under and whether config.json was written, or null when no option is ticked.
async function historyCreationDeclare({ me, tid }) {
  const choice = historyCreationChoice();
  if (!choice) return null;
  const scope = historyComposerScope(), thread = choice.mode === "thread" ? tid || nextThreadId() : null;
  await historyCreationPreflight(choice, me, scope, thread);
  const edits = [];
  if (choice.require) edits.push((config) => RoomHistory.requireSigning(config, scope, thread, "trusted"));
  if (choice.record) edits.push((config) => RoomHistory.declare(config, scope, thread, true));
  let plan;
  try { plan = await historyConfigPlan(edits); } catch (error) { throw historyError(exText("Refused before writing anything: ", "Odrzucono przed jakimkolwiek zapisem: ") + error.message); }
  const result = { tid: thread, written: false, record: choice.record, scope };
  if (!plan.changed) return result;
  const target = scope + (thread ? " " + thread : ""), summary = [];
  if (choice.require) summary.push(exText(`${target} will require trusted signatures (message_signing).`, `${target} będzie wymagać zaufanych podpisów (message_signing).`));
  if (choice.record) summary.push(exText(`${target} will record room history on every signed CLI post (room_history). This viewer cannot record.`, `${target} będzie zapisywać historię pokoju przy każdym podpisanym wpisie z CLI (room_history). Ta przeglądarka nie potrafi zapisywać.`));
  summary.push(exText("Then your message is signed and posted as the first message.", "Potem Twoja wiadomość zostanie podpisana i wysłana jako pierwsza."));
  const stamp = signingDraftStamp();
  if (!await historyReview(plan, summary, null)) throw historyError(exText("Not sent: the setting was not confirmed. Your draft is kept.", "Nie wysłano: ustawienie nie zostało potwierdzone. Szkic zachowano."));
  if (stamp !== signingDraftStamp()) throw historyError(exText("The draft changed during review; nothing was written. Review and send again.", "Szkic zmienił się podczas przeglądu; niczego nie zapisano. Sprawdź i wyślij ponownie."));
  await historyConfigCommit(plan);
  result.written = true;
  await readFromHandle(true);
  if (stamp !== signingDraftStamp() || historyComposerScope() !== scope) throw historyError(exText("The composer changed while the board refreshed.", "Kompozytor zmienił się podczas odświeżania tablicy."));
  if (choice.mode === "thread" && B.msgs.some((m) => m.tid === thread)) throw historyError(exText(`Someone started topic ${thread} meanwhile.`, `Ktoś w międzyczasie założył wątek ${thread}.`));
  return result;
}
// After a failure: say plainly whether the setting was already saved.
function historyCreationFailure(message, created) {
  return created?.written ? exText(`Setting saved in config.json, but the message was not posted (draft kept): ${message}`, `Ustawienie zapisano w config.json, ale wiadomość nie została wysłana (szkic zachowano): ${message}`) : message;
}
// AC4: a post from this viewer into a recording scope is never a silent gap.
function historyPostedNote(msg) {
  historyPosted = null;
  try {
    const h = parseHeaders(msg.text).native.h, scope = msg.relPath.split("/").slice(0, 2).join("/");
    if (!historyConfig(B) || !RoomHistory.records(historyConfig(B), scope, (h.THREAD || "").split("-")[0])) return;
    const text = exText(`Not recorded by this viewer: record with boardctl history observe --scope ${scope} --from ${h.FROM} --signing-key-file KEY_FILE, or post from the CLI.`, `Nie zapisano przez tę przeglądarkę: zapisz przez boardctl history observe --scope ${scope} --from ${h.FROM} --signing-key-file KEY_FILE albo wyślij z CLI.`);
    // Called after the composer is reset: the note stays until its destination changes.
    historyPosted = { anchor: historyComposerAnchor(), text };
    toast(text);
  } catch { /* the history panel reports an unreadable setting */ } finally { historyComposerUpdate(); }
}
function historyCreationReset() {
  for (const input of document.querySelectorAll("#historyCreate input")) input.checked = false;
  historyComposerUpdate();
}

// -- room menu: change an existing room or topic (AC5) ---------------------------------

function historySettingsTarget(kind, key) {
  if (kind === "room") return { scope: B.layout.roomsDir + "/" + key, thread: null, label: key };
  const th = threadsOf()[key];
  return th ? { scope: (th.scope === "direct" ? B.layout.directDir : B.layout.roomsDir) + "/" + th.dir, thread: th.tid, label: th.dir + " " + th.tid } : null;
}
function historySettingsDialog(kind, key, message = "") {
  const text = exText, model = B, target = model && historySettingsTarget(kind, key);
  if (!target) return;
  document.getElementById("historySettingsDialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "historySettingsDialog";
  dialog.setAttribute("aria-labelledby", "historySettingsTitle");
  const add = (tag, content, parent = dialog, cls = "") => { const n = document.createElement(tag); if (content) n.textContent = content; if (cls) n.className = cls; parent.append(n); return n; };
  const head = add("div", "", dialog, "vocabulary-head");
  add("h2", text("Room history and signing", "Historia i podpisy pokoju"), head).id = "historySettingsTitle";
  const close = add("button", text("Close", "Zamknij"), head, "btn");
  close.type = "button";
  close.dataset.action = "close";
  close.onclick = () => dialog.close();
  add("p", target.scope + (target.thread ? " · " + target.thread : ""), dialog, "history-scope");
  const config = historyConfig(model) || {}, signing = model.signingContext;
  let recordAll = null, recordOn = false, unreadable = "";
  try {
    const all = RoomHistory.setting(config), rule = Object.hasOwn(all, target.scope) ? all[target.scope] : null;
    recordAll = !!rule?.record;
    recordOn = !!rule && (rule.record || rule.threads.includes(target.thread));
  } catch (error) { unreadable = error.message; }
  let trustedOn = false, parentTrusted = false;
  try {
    trustedOn = SigningContract.requirement(signing.shared, target.scope, target.thread || "") === "trusted";
    parentTrusted = !!target.thread && SigningContract.requirement(signing.shared, target.scope, "") === "trusted";
    if (!target.thread) parentTrusted = signing.shared.minimum === "trusted";
  } catch { /* no signing context: the option stays unavailable */ }
  const option = (id, label, checked, disabled, why) => {
    const row = add("label", "", dialog, "history-option"), input = document.createElement("input");
    input.type = "checkbox"; input.id = id; input.checked = checked; input.disabled = disabled;
    row.append(input, " " + label);
    if (why) add("p", why, dialog, "history-note");
    return input;
  };
  const writable = model.layout.dialect === "native" && canWrite() && !!signing;
  const require = option("historySettingRequire", text("Require trusted signatures", "Wymagaj zaufanych podpisów"), trustedOn, !writable || trustedOn && parentTrusted,
    trustedOn && parentTrusted ? (target.thread ? text("The whole room already requires trusted signatures.", "Cały pokój już wymaga zaufanych podpisów.") : text("The whole board requires trusted signatures.", "Cała tablica wymaga zaufanych podpisów.")) : "");
  const record = option("historySettingRecord", text("Record room history automatically", "Automatycznie zapisuj historię pokoju"), recordOn, !writable || !!unreadable || !!target.thread && recordAll,
    unreadable ? text("The room_history setting in config.json is invalid, so it cannot be edited safely: ", "Ustawienie room_history w config.json jest nieprawidłowe, więc nie można go bezpiecznie edytować: ") + unreadable
      : target.thread && recordAll ? text("The whole room records, which includes every topic.", "Cały pokój jest zapisywany, łącznie ze wszystkimi wątkami.") : "");
  add("p", text("Recording runs on signed posts from the CLI, with the poster's own key; this viewer cannot record. Readers count a record only after approving the recorder's key. A topic setting decides when recording happens; a recording always covers the whole room.", "Zapis następuje przy podpisanych wpisach z CLI, kluczem autora; ta przeglądarka nie potrafi zapisywać. Czytelnicy liczą zapis dopiero po zatwierdzeniu klucza zapisującego. Ustawienie wątku decyduje, kiedy następuje zapis; zapis zawsze obejmuje cały pokój."), dialog, "history-note");
  if (!writable) add("p", text("Open the board folder with write access to change these settings.", "Otwórz folder tablicy z zapisem, aby zmienić te ustawienia."), dialog, "history-note");
  const result = add("p", message, dialog, "history-settings-result");
  result.setAttribute("role", "status");
  const apply = add("button", text("Review change…", "Przejrzyj zmianę…"), dialog, "btn primary");
  apply.type = "button";
  apply.dataset.action = "apply";
  apply.disabled = !writable;
  apply.onclick = async () => {
    result.textContent = "";
    const edits = [], summary = [], weaker = [], name = target.scope + (target.thread ? " " + target.thread : "");
    if (require.checked !== trustedOn) {
      edits.push((config) => RoomHistory.requireSigning(config, target.scope, target.thread, require.checked ? "trusted" : "optional", !require.checked));
      if (require.checked) summary.push(text(`${name} will require trusted signatures.`, `${name} będzie wymagać zaufanych podpisów.`));
      else { summary.push(text(`${name} will no longer require trusted signatures.`, `${name} przestanie wymagać zaufanych podpisów.`)); weaker.push(text("Lowering a requirement lets unsigned messages in again. Clients that adopted a local policy floor keep requiring trusted signatures here.", "Obniżenie wymagania znów wpuszcza niepodpisane wiadomości. Klienci, którzy przyjęli lokalne minimum reguł, nadal wymagają tu zaufanych podpisów.")); }
    }
    if (record.checked !== recordOn) {
      edits.push((config) => RoomHistory.declare(config, target.scope, target.thread, record.checked, !record.checked));
      if (record.checked) summary.push(text(`${name} will record room history on every signed CLI post.`, `${name} będzie zapisywać historię pokoju przy każdym podpisanym wpisie z CLI.`));
      else { summary.push(text(`${name} will stop recording room history automatically.`, `${name} przestanie automatycznie zapisywać historię pokoju.`)); weaker.push(text("Existing records and private checkpoints stay; new messages are no longer covered automatically.", "Istniejące zapisy i prywatne punkty kontrolne zostają; nowe wiadomości nie będą już obejmowane automatycznie.")); }
    }
    if (!edits.length) { result.textContent = text("Nothing to change.", "Nic do zmiany."); return; }
    apply.disabled = true;
    try {
      const plan = await historyConfigPlan(edits);
      if (!plan.changed) { result.textContent = text("Nothing to change.", "Nic do zmiany."); return; }
      const weakenText = weaker.length ? text("I understand this weakens protection: ", "Rozumiem, że to osłabia ochronę: ") + weaker.join(" ") : null;
      if (!await historyReview(plan, summary, weakenText)) { result.textContent = text("Not changed.", "Nie zmieniono."); return; }
      await historyConfigCommit(plan);
      await readFromHandle(true);
      // Reopen from the saved file, so the next change starts from what is now shared.
      if (dialog.open) { dialog.close(); historySettingsDialog(kind, key, text("Saved in config.json.", "Zapisano w config.json.")); }
    } catch (error) {
      result.textContent = text("Not changed: ", "Nie zmieniono: ") + (error?.message || String(error));
    } finally { apply.disabled = !writable; }
  };
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

function wireRoomHistory() {
  const button = document.createElement("button");
  button.className = "btn history-check";
  button.id = "historyOpen";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-haspopup", "dialog");
  button.onclick = historyDialog;
  $("#guidanceOpen").after(button);
  const create = document.createElement("div");
  create.id = "historyCreate";
  create.className = "history-create";
  create.hidden = true;
  create.innerHTML = '<strong class="history-create-title"></strong><label data-history-option="require"><input type="checkbox" id="cRequireTrusted"> <span></span></label><label data-history-option="record"><input type="checkbox" id="cRecordHistory"> <span></span></label><span class="history-create-note"></span>';
  $("#cNewRoom").after(create);
  for (const input of create.querySelectorAll("input")) input.addEventListener("change", () => updateSigningNotice());
  const note = document.createElement("div");
  note.id = "historyComposerNote";
  note.className = "hint history-composer-note";
  note.hidden = true;
  $("#signingRequires").before(note);
}
