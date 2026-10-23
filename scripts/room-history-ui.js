/* Missing-message check: a read-only view of what locally approved signers once recorded
   about a room. Nothing here writes to the board and nothing changes message eligibility;
   recording stays with `boardctl history observe`. Rules live in room-history.js. */
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

function historyNativeHost(base, directDir, location) {
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
    listMessages: async (scope) => ((await names(scope)) || []).filter(([name, kind]) => kind === "file" && historyMessageName.test(name)).map(([name]) => name),
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
  const sessionKey = base ? "native:" + location : "upload:" + model.name;
  const host = base ? historyNativeHost(base, model.layout.directDir, location) : historyUploadHost(files);
  const run = () => historySerialize(async () => {
    const view = { status: "ready", reason: "", report: null, stamp: "", saveError: "", persistent: !!key };
    try {
      const stored = key ? await signingGet(key) : historySessions.get(sessionKey) ?? null, expected = JSON.stringify(stored ?? null);
      const state = RoomHistory.loadState(stored, context.boardId, location);
      view.report = await RoomHistory.evaluate(context, state, host);
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
    node("p", text("This viewer only shows results; it never writes to the board. To record what this room contains, approve the recording person's key under Signing, then run this in a terminal:", "Ta przeglądarka tylko pokazuje wyniki i nigdy nie zapisuje na tablicy. Aby zapisać zawartość tego pokoju, zatwierdź klucz osoby zapisującej w Podpisach, a potem uruchom w terminalu:"), how);
    node("code", `boardctl history observe --scope ${scope} --from YOUR-PARTICIPANT-ID --signing-key-file YOUR-KEY.json`, how, "history-command");
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
    const pre = node("pre", JSON.stringify((report?.entries || []).map((r) => ({ path: r.path, observed: r.observed, source: r.source, needsAttention: r.needsAttention, neutral: r.neutral })), null, 1), technical);
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

function wireRoomHistory() {
  const button = document.createElement("button");
  button.className = "btn history-check";
  button.id = "historyOpen";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-haspopup", "dialog");
  button.onclick = historyDialog;
  $("#guidanceOpen").after(button);
}
