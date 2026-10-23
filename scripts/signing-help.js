// Signing help: one table of "why you cannot post" reasons feeds the composer notice,
// the in-app "How signing works" diagrams and the committed documentation diagrams.
// Everything here is pure (state in, text or SVG out) so tests can run it in a vm.
const SIGNING_BLOCK_ORDER = ["no-board-id", "board-id-changed", "state-conflict", "signing-unavailable", "read-only", "not-registered", "no-key", "key-rotated", "no-signer", "key-revoked", "key-changed", "key-not-approved"];
// task: which part of the Signing dialog fixes it. focus: the control to land on.
function signingBlockInfo(id, vars = {}, text = exText) {
  const s = vars.s || "", who = s ? `${s}` : text("your key", "Twój klucz"), possessive = s ? text(`${s}'s`, `${s} –`) : text("your", "Twój");
  const rooms = text("This room requires trusted signatures", "Ten pokój wymaga zaufanych podpisów");
  const t = {
    "no-board-id": {
      message: text("Posting is blocked: this board requires signatures, but it has no identity UUID, so signatures cannot be checked yet. Only the board owner can fix this.", "Wysyłanie zablokowane: ta tablica wymaga podpisów, ale nie ma identyfikatora UUID, więc nie można ich sprawdzić. Naprawić to może tylko właściciel tablicy."),
      short: text("The board has no identity UUID", "Tablica nie ma identyfikatora UUID"),
      label: text("Show the board owner steps", "Pokaż kroki dla właściciela"), task: "howto", anchor: "owner"
    },
    "board-id-changed": {
      message: text("Posting is blocked: this board's identity UUID changed or was removed since you last opened it, and your local approvals belong to the old one. Ask the board owner to restore the original UUID.", "Wysyłanie zablokowane: identyfikator UUID tej tablicy zmienił się lub został usunięty od ostatniego otwarcia, a Twoje lokalne zatwierdzenia należą do starego. Poproś właściciela tablicy o przywrócenie pierwotnego UUID."),
      short: text("The board UUID changed", "UUID tablicy się zmienił"),
      label: text("Show the board owner steps", "Pokaż kroki dla właściciela"), task: "howto", anchor: "owner"
    },
    "state-conflict": {
      message: text("Posting is blocked: another tab changed your local signing records for this board. Refresh and review before posting.", "Wysyłanie zablokowane: inna karta zmieniła lokalne zapisy podpisów dla tej tablicy. Odśwież i sprawdź przed wysłaniem."),
      short: text("Signing records changed in another tab", "Zapisy podpisów zmieniła inna karta"),
      label: text("Open Signing and check", "Otwórz Podpisy i sprawdź"), task: "check"
    },
    "signing-unavailable": {
      message: text(`Posting is blocked: signing could not be checked for this board (${vars.err || "unknown reason"}).`, `Wysyłanie zablokowane: nie udało się sprawdzić podpisów dla tej tablicy (${vars.err || "nieznana przyczyna"}).`),
      short: text("Signing could not be checked", "Nie udało się sprawdzić podpisów"),
      label: text("Open Signing", "Otwórz Podpisy"), task: "check"
    },
    "read-only": {
      message: vars.required ? text(`${rooms}, but this board is open read-only, and signed messages can only be saved to a writable folder.`, `${rooms}, ale tablica jest otwarta tylko do odczytu, a podpisane wiadomości można zapisać tylko w folderze z możliwością zapisu.`)
        : text("You chose to sign, but this board is open read-only, and signed messages can only be saved to a writable folder.", "Wybrano podpisywanie, ale tablica jest otwarta tylko do odczytu, a podpisane wiadomości można zapisać tylko w folderze z możliwością zapisu."),
      short: text("The folder is read-only", "Folder jest tylko do odczytu"),
      label: text("Open the writable folder", "Otwórz folder z zapisem"), task: "folder"
    },
    "not-registered": {
      message: text(`${rooms}, but ${who} has no signing key registered on this board. Ask the board owner to register your public key.`, `${rooms}, ale ${who} nie ma zarejestrowanego klucza podpisu na tej tablicy. Poproś właściciela tablicy o rejestrację Twojego klucza publicznego.`),
      short: text("You have no key registered", "Nie masz zarejestrowanego klucza"),
      label: text("How to get a key", "Jak zdobyć klucz"), task: "howto", anchor: "keys"
    },
    "no-key": {
      message: text(`${rooms}, and no signing key is unlocked in this tab.`, `${rooms}, a w tej karcie nie jest odblokowany żaden klucz podpisu.`),
      short: text("No key is unlocked in this tab", "Żaden klucz nie jest odblokowany"),
      label: text("Unlock my key", "Odblokuj mój klucz"), task: "own", focus: "#signingKeyFiles"
    },
    "key-rotated": {
      message: text(`${possessive} signing key was replaced (rotated), so the key unlocked in this tab no longer matches the board. Unlock the new private key.`, `Klucz podpisu ${who} został wymieniony (rotacja), więc klucz odblokowany w tej karcie nie pasuje już do tablicy. Odblokuj nowy klucz prywatny.`),
      short: text("The key was rotated", "Klucz został wymieniony"),
      label: text("Unlock the new key", "Odblokuj nowy klucz"), task: "own", focus: "#signingKeyFiles"
    },
    "no-signer": {
      message: text("Your keys are unlocked, but you have not chosen who to sign as.", "Klucze są odblokowane, ale nie wybrano, jako kto podpisujesz."),
      short: text("No signer chosen", "Nie wybrano podpisującego"),
      label: text("Choose who to sign as", "Wybierz podpisującego"), task: "own", focus: "#signingIdentity"
    },
    "key-revoked": {
      message: text(`${possessive} signing key is revoked or retired and cannot sign new messages. Ask the board owner about a replacement key.`, `Klucz podpisu ${who} jest unieważniony lub wycofany i nie może podpisywać nowych wiadomości. Zapytaj właściciela tablicy o klucz zastępczy.`),
      short: text("The key is revoked or retired", "Klucz jest unieważniony lub wycofany"),
      label: text("Review the key", "Sprawdź klucz"), task: "review", focus: "#signingFingerprint"
    },
    "key-changed": {
      message: text(`${rooms}. You approved an earlier key for ${who}; the board now lists a different one. Approve the new key to post.`, `${rooms}. Zatwierdzono wcześniejszy klucz ${who}, a tablica wskazuje teraz inny. Zatwierdź nowy klucz, aby wysłać wiadomość.`),
      short: text("You approved an older key", "Zatwierdzono starszy klucz"),
      label: text("Approve the new key", "Zatwierdź nowy klucz"), task: "review", focus: "#signingFingerprint"
    },
    "key-not-approved": {
      message: text(`${rooms}, and ${possessive} key is not approved on this device yet. Even your own key is approved once here, so this device knows it really is yours.`, `${rooms}, a klucz (${who}) nie jest jeszcze zatwierdzony na tym urządzeniu. Nawet własny klucz zatwierdza się tu raz, aby urządzenie wiedziało, że naprawdę jest Twój.`),
      short: text("The key is not approved here", "Klucz nie jest zatwierdzony"),
      label: text("Approve the key", "Zatwierdź klucz"), task: "review", focus: "#signingFingerprint"
    }
  };
  const info = t[id];
  if (!info) return null;
  return { id, ...info, participant: s || undefined };
}
// state: {error, hasContext, writable, required, mode, signer, viewer, catalog:[ids], known:{id:fp},
// lastSigner, participants:{id:{fingerprint,revoked,unregistered}}, pins:{id:fp}}.
// The order mirrors what send, delivery and Provider.sign actually check, except that
// "unlock" comes before "approve" because that is the order people can act in.
function signingDiagnose(s) {
  if (s.error) {
    if (/board UUID changed/i.test(s.error)) return { id: "board-id-changed" };
    if (/board UUID/i.test(s.error)) return { id: "no-board-id" };
    if (/another tab|private signing (state|context)/i.test(s.error)) return { id: "state-conflict" };
    return { id: "signing-unavailable", vars: { err: s.error } };
  }
  if (!s.hasContext) return null;
  const signed = s.mode === "signed", catalog = s.catalog || [], people = s.participants || {}, pins = s.pins || {}, known = s.known || {};
  if (!s.required && !signed) return null;
  if (!s.writable) return { id: "read-only", vars: { required: !!s.required } };
  const lost = (id) => {
    const p = people[id];
    if (known[id] && p?.revoked) return { id: "key-revoked", vars: { s: id } };
    if (known[id] && p?.fingerprint && p.fingerprint !== known[id]) return { id: "key-rotated", vars: { s: id } };
    return null;
  };
  const who = signed ? s.signer : "";
  if (!who) {
    if (signed && catalog.length) return { id: "no-signer" };
    const candidate = s.lastSigner || s.viewer;
    const gone = candidate && lost(candidate);
    if (gone) return gone;
    if (s.viewer && people[s.viewer]?.unregistered && !catalog.length) return { id: "not-registered", vars: { s: s.viewer } };
    return { id: "no-key" };
  }
  if (!catalog.includes(who)) return lost(who) || { id: "no-key" };
  const p = people[who];
  if (p?.revoked) return { id: "key-revoked", vars: { s: who } };
  if (s.required && p?.fingerprint && pins[who] !== p.fingerprint) return { id: pins[who] ? "key-changed" : "key-not-approved", vars: { s: who } };
  return null;
}
// Reason a received message cannot drive actions, with the one step that helps.
function signingMessageBlock(m, text = exText) {
  const f = m?.signing || {}, a = m?.author || "", who = a || text("the sender", "nadawcy");
  const make = (message, label, task, extra = {}) => ({ message, label, task, participant: a || undefined, ...extra });
  if (f.eligibility === "pending-verification") {
    return /^Outside verification/.test(f.reason || "") ?
      make(text("Not checked yet: this message is older than the newest 200 that are checked on opening. Check older messages to use it.", "Jeszcze niesprawdzona: wiadomość jest starsza niż 200 najnowszych sprawdzanych po otwarciu. Sprawdź starsze wiadomości, aby jej użyć."), text("Check older messages", "Sprawdź starsze wiadomości"), "check") :
      make(text(`Not checked yet: ${f.reason || "verification has not finished"}.`, `Jeszcze niesprawdzona: ${f.reason || "weryfikacja nie została zakończona"}.`), text("Open Signing", "Otwórz Podpisy"), "check");
  }
  if (["compromised", "retired"].includes(f.lifecycle)) {
    return make(text(`Blocked: this was signed with a key that was ${f.lifecycle === "compromised" ? "reported compromised" : "retired"}. A matching signature does not make it usable.`, `Zablokowana: podpisano kluczem, który ${f.lifecycle === "compromised" ? "zgłoszono jako przejęty" : "wycofano"}. Zgodny podpis nie czyni jej użyteczną.`), text("Review the key", "Sprawdź klucz"), "review");
  }
  if (f.signature === "invalid" || f.signature === "stripped") {
    return make(f.signature === "stripped" ? text("Blocked: its signature was removed after it was verified. Ask the sender what happened.", "Zablokowana: usunięto jej podpis, który wcześniej został zweryfikowany. Zapytaj nadawcę, co się stało.") :
      text("Blocked: the signature does not match the message, so it was changed after signing or signed wrongly. Ask the sender.", "Zablokowana: podpis nie pasuje do wiadomości, więc zmieniono ją po podpisaniu lub podpisano błędnie. Zapytaj nadawcę."), text("How checking works", "Jak działa sprawdzanie"), "howto", { anchor: "sign" });
  }
  if (f.signature === "unsigned" || f.signature === "unchecked" || f.signature === "unavailable") {
    return make(text("Blocked: this message is unsigned, and this room requires trusted signatures.", "Zablokowana: wiadomość nie ma podpisu, a ten pokój wymaga zaufanych podpisów."), text("Why rooms refuse this", "Dlaczego pokój to odrzuca"), "howto", { anchor: "required" });
  }
  if (f.lifecycle === "superseded") {
    return make(text(`Blocked: this was signed with an older key of ${who}. This room needs the current key, approved by you.`, `Zablokowana: podpisano starszym kluczem (${who}). Ten pokój wymaga bieżącego klucza zatwierdzonego przez Ciebie.`), text("Review the key", "Sprawdź klucz"), "review");
  }
  if (f.signature === "valid" && f.trust !== "trusted") {
    return make(text(`Blocked: the signature is valid, but you have not approved the key of ${who} on this device.`, `Zablokowana: podpis jest poprawny, ale nie zatwierdzono na tym urządzeniu klucza: ${who}.`), text("Review the key", "Sprawdź klucz"), "review");
  }
  return make(text(`Blocked by signing rules${f.reason ? ": " + f.reason : ""}.`, `Zablokowana przez reguły podpisów${f.reason ? ": " + f.reason : ""}.`), text("Open Signing", "Otwórz Podpisy"), "check");
}

/* ---------- diagrams ---------- */
// Classes use --sg-* tokens. The app maps them to its theme variables; standalone
// files (docs) define them with a prefers-color-scheme block.
const SIGNING_DIAGRAM_CSS = ".sg-box{fill:var(--sg-box);stroke:var(--sg-line)}.sg-ok{fill:var(--sg-ok-bg);stroke:var(--sg-ok)}.sg-warn{fill:var(--sg-warn-bg);stroke:var(--sg-warn)}.sg-secret{fill:var(--sg-warn-bg);stroke:var(--sg-warn);stroke-dasharray:4 3}.sg-t{fill:var(--sg-ink);font:12px system-ui,-apple-system,Segoe UI,sans-serif}.sg-b{font-weight:700}.sg-n{fill:var(--sg-muted)}.sg-link{stroke:var(--sg-muted);fill:none;stroke-width:1.5}.sg-head{fill:var(--sg-accent)}";
const SIGNING_DIAGRAM_TOKENS = ":root{--sg-box:#fafbfc;--sg-line:#9aa4b2;--sg-ink:#1c2230;--sg-muted:#5b6472;--sg-accent:#2465a8;--sg-ok:#2e7d4f;--sg-ok-bg:#e7f5ec;--sg-warn:#8a4b00;--sg-warn-bg:#fff4e5}@media(prefers-color-scheme:dark){:root{--sg-box:#1d2229;--sg-line:#4a5260;--sg-ink:#e7eaf0;--sg-muted:#98a1ad;--sg-accent:#8fb4ff;--sg-ok:#7bd3a0;--sg-ok-bg:#12301f;--sg-warn:#ffcf86;--sg-warn-bg:#3a2a10}}";
function sgEsc(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sgWrap(str, width) {
  const max = Math.max(8, Math.floor(width / 7)), lines = [];
  let cur = "";
  for (const word of String(str).split(/\s+/).filter(Boolean)) {
    if (cur && (cur + " " + word).length > max) { lines.push(cur); cur = word; } else cur = cur ? cur + " " + word : word;
  }
  if (cur) lines.push(cur);
  return lines;
}
// A diagram is a list of rows placed on a 360 wide canvas. Boxes grow to fit their wrapped text.
function sgBuild(id, title, desc, rows) {
  const W = 360, LH = 15, PAD = 8, parts = [];
  let y = 6;
  const box = (x, w, top, text, cls, bold) => {
    const lines = sgWrap(text, w - PAD * 2), h = lines.length * LH + PAD * 2 - 2;
    parts.push(`<rect class="sg-box ${cls || ""}" x="${x}" y="${top}" width="${w}" height="${h}" rx="7"/>` + lines.map((l, i) => `<text class="sg-t${bold ? " sg-b" : ""}" x="${x + PAD}" y="${top + PAD + 9 + i * LH}">${sgEsc(l)}</text>`).join(""));
    return h;
  };
  const arrowDown = (x, top, len, label) => {
    parts.push(`<path class="sg-link" d="M${x} ${top}V${top + len - 2}M${x - 4} ${top + len - 8}L${x} ${top + len - 1}L${x + 4} ${top + len - 8}"/>`);
    if (label) sgWrap(label, W - x - 20).forEach((l, i) => parts.push(`<text class="sg-t sg-n" x="${x + 10}" y="${top + 4 + len / 2 + i * LH - (sgWrap(label, W - x - 20).length - 1) * LH / 2}">${sgEsc(l)}</text>`));
  };
  const arrowRight = (x1, x2, yy) => parts.push(`<path class="sg-link" d="M${x1} ${yy}H${x2 - 1}M${x2 - 7} ${yy - 4}L${x2} ${yy}L${x2 - 7} ${yy + 4}"/>`);
  for (const row of rows) {
    if (row.head) {
      if (y > 20) y += 8;
      sgWrap(row.head, W - 16).forEach((l, i) => parts.push(`<text class="sg-t sg-b sg-head" x="8" y="${y + 12 + i * LH}">${sgEsc(l)}</text>`));
      y += sgWrap(row.head, W - 16).length * LH + 8;
    } else if (row.note) {
      const lines = sgWrap(row.note, W - 16);
      lines.forEach((l, i) => parts.push(`<text class="sg-t sg-n" x="8" y="${y + 11 + i * LH}">${sgEsc(l)}</text>`));
      y += lines.length * LH + 8;
    } else if (row.arrow !== undefined) {
      const len = Math.max(26, sgWrap(row.arrow, W - 190).length * LH + 8);
      arrowDown(40, y, len, row.arrow);
      y += len;
    } else if (row.pair) {
      const [left, right] = row.pair, lw = row.leftWidth || 166, rx = 8 + lw + 30, rw = W - rx - 8;
      const hl = sgWrap(left.text, lw - PAD * 2).length, hr = sgWrap(right.text, rw - PAD * 2).length, h = Math.max(hl, hr) * LH + PAD * 2 - 2;
      box(8, lw, y, left.text, left.cls, left.bold);
      box(rx, rw, y, right.text, right.cls, right.bold);
      arrowRight(8 + lw, rx, y + h / 2);
      if (left.no) parts.push(`<text class="sg-t sg-n" x="${8 + lw + 3}" y="${y + h / 2 - 5}">${sgEsc(left.no)}</text>`);
      if (row.pair[0].down !== undefined) arrowDown(8 + lw / 2, y + h, 26, row.pair[0].down);
      y += h + (row.pair[0].down !== undefined ? 26 : 10);
    } else {
      y += box(8, W - 16, y, row.text, row.cls, row.bold) + 6;
    }
  }
  const H = y + 4;
  return `<svg class="signing-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-labelledby="sg-${id}-t sg-${id}-d"><title id="sg-${id}-t">${sgEsc(title)}</title><desc id="sg-${id}-d">${sgEsc(desc)}</desc>${parts.join("")}</svg>`;
}
function signingDiagrams(text = exText) {
  const T = text, d = {};
  d.keys = {
    title: T("Your own key versus approving someone else's key", "Własny klucz a zatwierdzanie cudzego klucza"),
    caption: T("Two different jobs. Your own key lets you sign. Someone else's key is only something you decide to trust.", "Dwie różne sprawy. Własny klucz pozwala Ci podpisywać. Cudzy klucz możesz tylko uznać za zaufany."),
    rows: [
      { head: T("A. Your own key: used to sign", "A. Własny klucz: służy do podpisywania") },
      { text: T("You hold a private key file. It is a secret. Keep it outside the board folder.", "Masz plik klucza prywatnego. To sekret. Trzymaj go poza folderem tablicy."), cls: "sg-secret" },
      { arrow: T("Unlock it in Signing, in this tab", "Odblokuj w Podpisach, w tej karcie") },
      { text: T("The key is ready in this tab's memory only. Nothing is saved or uploaded.", "Klucz jest gotowy tylko w pamięci tej karty. Nic nie jest zapisywane ani wysyłane.") },
      { arrow: T("You press Post", "Wysyłasz wiadomość") },
      { text: T("The viewer signs your message. Only the signature goes into the board.", "Przeglądarka podpisuje wiadomość. Do tablicy trafia tylko podpis."), cls: "sg-ok" },
      { head: T("B. Someone else's key: approve to trust", "B. Cudzy klucz: zatwierdź, aby zaufać") },
      { text: T("Maya's public fingerprint. It is safe to share.", "Publiczny odcisk klucza Mai. Można go bezpiecznie udostępniać.") },
      { arrow: T("Compare it with Maya by phone or in person", "Porównaj z Mają przez telefon lub osobiście") },
      { text: T("You approve that exact key. The approval stays on this device.", "Zatwierdzasz ten konkretny klucz. Zatwierdzenie zostaje na tym urządzeniu."), cls: "sg-ok" },
      { note: T("Approving Maya's key never lets you sign as Maya.", "Zatwierdzenie klucza Mai nigdy nie pozwala podpisywać jako Maya.") }
    ]
  };
  d.sign = {
    title: T("What happens when you sign, and when others check", "Co dzieje się przy podpisywaniu i sprawdzaniu"),
    caption: T("Checking the signature and trusting the key are two separate questions.", "Sprawdzenie podpisu i zaufanie do klucza to dwa osobne pytania."),
    rows: [
      { text: T("Maya writes a message and signs it with her private key.", "Maya pisze wiadomość i podpisuje ją swoim kluczem prywatnym.") },
      { arrow: T("Both files are saved in the shared board folder", "Oba pliki trafiają do wspólnego folderu tablicy") },
      { text: T("The message file plus a signature file (.signatures). Neither contains a secret.", "Plik wiadomości i plik podpisu (.signatures). Żaden nie zawiera sekretu.") },
      { arrow: T("Sam's viewer checks the bytes against Maya's public key", "Przeglądarka Sama sprawdza bajty względem publicznego klucza Mai") },
      { pair: [{ text: T("Signature check", "Sprawdzenie podpisu"), bold: true }, { text: T("Verified: not changed. Invalid: changed or wrongly signed.", "Zweryfikowany: bez zmian. Nieprawidłowy: zmieniona lub źle podpisana."), cls: "sg-ok" }], leftWidth: 110 },
      { arrow: T("Separate question", "Osobne pytanie") },
      { pair: [{ text: T("Key approval", "Zatwierdzenie klucza"), bold: true }, { text: T("Approved by Sam: trusted. Not approved: Sam does not yet know whose key it is.", "Zatwierdzony przez Sama: zaufany. Niezatwierdzony: Sam nie wie jeszcze, czyj to klucz."), cls: "sg-ok" }], leftWidth: 110 },
      { note: T("Neither check proves the message is true.", "Żadne sprawdzenie nie dowodzi, że treść jest prawdziwa.") }
    ]
  };
  d.required = {
    title: T("Why a required room refuses some messages", "Dlaczego pokój z wymogiem odrzuca część wiadomości"),
    caption: T("In a room that requires trusted signatures, only the last case can drive replies, forms and other actions.", "W pokoju wymagającym zaufanych podpisów tylko ostatni przypadek może wywoływać odpowiedzi, formularze i inne działania."),
    rows: [
      { head: T("Rule: trusted signatures required", "Reguła: wymagane zaufane podpisy") },
      { pair: [{ text: T("Unsigned message", "Wiadomość bez podpisu") }, { text: T("Refused. Nobody can show who wrote it.", "Odrzucona. Nikt nie wykaże, kto ją napisał."), cls: "sg-warn" }] },
      { pair: [{ text: T("Signed, key not approved by you", "Podpisana, klucz niezatwierdzony przez Ciebie") }, { text: T("Refused. You can read it, but not act on it.", "Odrzucona. Możesz ją czytać, ale nie działać."), cls: "sg-warn" }] },
      { pair: [{ text: T("Signed with an old, retired or revoked key", "Podpisana starym, wycofanym lub unieważnionym kluczem") }, { text: T("Refused. The key is no longer current.", "Odrzucona. Klucz nie jest już bieżący."), cls: "sg-warn" }] },
      { pair: [{ text: T("Signed, key approved by you, current", "Podpisana, klucz zatwierdzony przez Ciebie, bieżący") }, { text: T("Accepted.", "Zaakceptowana."), cls: "sg-ok", bold: true }] },
      { note: T("The same rule applies when you post: your message needs your own approved key.", "Ta sama reguła dotyczy Twoich wiadomości: potrzebujesz własnego zatwierdzonego klucza.") }
    ]
  };
  const flow = [{ head: T("Start at the top and follow the first \"No\".", "Zacznij od góry i idź za pierwszym „Nie”.") }];
  const step = (question, ids) => {
    const info = ids.map((i) => signingBlockInfo(i, { s: T("you", "Ty") }, T));
    flow.push({ pair: [{ text: question, down: T("Yes", "Tak"), no: T("No", "Nie") }, { text: info.map((i) => i.short).join(T(" or ", " lub ")) + ". " + T("Fix: ", "Rozwiązanie: ") + info[0].label, cls: "sg-warn" }], leftWidth: 150 });
  };
  step(T("Can this board's signing be read, with an identity UUID?", "Czy podpisy tej tablicy można odczytać i ma identyfikator UUID?"), ["no-board-id"]);
  flow.push({ pair: [{ text: T("Does this room require trusted signatures?", "Czy ten pokój wymaga zaufanych podpisów?"), down: T("Yes", "Tak"), no: T("No", "Nie") }, { text: T("Post. Signing is optional here.", "Wyślij. Podpis jest tu opcjonalny."), cls: "sg-ok" }], leftWidth: 150 });
  step(T("Is the board folder writable?", "Czy folder tablicy jest zapisywalny?"), ["read-only"]);
  step(T("Is a key unlocked and current?", "Czy klucz jest odblokowany i bieżący?"), ["no-key", "key-rotated"]);
  step(T("Did you choose who to sign as?", "Czy wybrano, jako kto podpisujesz?"), ["no-signer"]);
  step(T("Is that key free of revocation?", "Czy ten klucz nie jest unieważniony?"), ["key-revoked"]);
  step(T("Have you approved that key on this device?", "Czy zatwierdzono ten klucz na tym urządzeniu?"), ["key-not-approved", "key-changed"]);
  flow.push({ text: T("You can post. The message is signed and accepted.", "Możesz wysłać wiadomość. Zostanie podpisana i zaakceptowana."), cls: "sg-ok", bold: true });
  d.why = {
    title: T("Why can't I post?", "Dlaczego nie mogę wysłać wiadomości?"),
    caption: T("The composer shows the first problem it finds, with one button for the next step.", "Pole wiadomości pokazuje pierwszy znaleziony problem i jeden przycisk z następnym krokiem."),
    rows: flow
  };
  return d;
}
function signingDiagramSvg(key, text = exText) {
  const d = signingDiagrams(text)[key];
  if (!d) return "";
  return sgBuild(key, d.title, d.caption, d.rows);
}
// Standalone file for the repository docs (EN) with its own theme tokens.
function signingStandaloneSvg(key, text = exText) {
  const svg = signingDiagramSvg(key, text);
  return svg.replace(/(<svg[^>]*>)/, `$1<style>${SIGNING_DIAGRAM_TOKENS}${SIGNING_DIAGRAM_CSS}</style>`);
}
