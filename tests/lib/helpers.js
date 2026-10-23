"use strict";
// Shared test helpers: browser launch, in-memory File System Access substitute, board layout helpers.
// The headless Chromium used here cannot show a directory picker and OPFS is unavailable on file://,
// so the page gets a substitute implementation of window.showDirectoryPicker backed by a JSON tree
// persisted in IndexedDB (so it survives reload independently of renderer localStorage caches).
// The viewer's real write path runs against it.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");
const { expect } = require("playwright/test");

const ROOT = path.resolve(__dirname, "..", "..");
const BOARD_HTML = path.join(ROOT, "board.html");
const VENDOR = path.join(ROOT, "vendor", "agent-file-board");
const BOARDCTL = path.join(VENDOR, "boardctl.py");
const EXAMPLE = path.join(VENDOR, "examples", "full-conversation");

function readTree(dir) {
  const node = { kind: "directory", children: {} };
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) node.children[name] = readTree(p);
    else node.children[name] = { kind: "file", text: fs.readFileSync(p, "utf8") };
  }
  return node;
}
function writeTree(node, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, child] of Object.entries(node.children)) {
    if (child.kind === "directory") writeTree(child, path.join(dir, name));
    else fs.writeFileSync(path.join(dir, name), child.text);
  }
}
function tmpDir(prefix = "afbui-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function copyDir(src, dst) { fs.cpSync(src, dst, { recursive: true }); }

// Lay the (root-level) example out as <tmp>/proj/.agent-board with the config boardctl needs.
function layoutExample(tmp) {
  const proj = path.join(tmp, "proj");
  const base = path.join(proj, ".agent-board");
  fs.mkdirSync(base, { recursive: true });
  copyDir(path.join(EXAMPLE, "rooms"), path.join(base, "rooms"));
  copyDir(path.join(EXAMPLE, "direct"), path.join(base, "direct"));
  fs.copyFileSync(path.join(EXAMPLE, "participants.json"), path.join(base, "participants.json"));
  fs.copyFileSync(path.join(VENDOR, ".agent-board", "CONVENTION.md"), path.join(base, "CONVENTION.md"));
  const cfg = JSON.parse(fs.readFileSync(path.join(VENDOR, ".agent-board", "config.json"), "utf8"));
  const lang = JSON.parse(fs.readFileSync(path.join(EXAMPLE, "language-config.json"), "utf8"));
  cfg.language = lang.language;
  fs.writeFileSync(path.join(base, "config.json"), JSON.stringify(cfg, null, 2) + "\n");
  return proj;
}
// A small native board whose filename order differs from DATE order.
function layoutShuffled(tmp) {
  const proj = path.join(tmp, "proj");
  const base = path.join(proj, ".agent-board");
  const room = path.join(base, "rooms", "general");
  fs.mkdirSync(room, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(VENDOR, ".agent-board", "config.json"), "utf8"));
  fs.writeFileSync(path.join(base, "config.json"), JSON.stringify(cfg, null, 2) + "\n");
  fs.writeFileSync(path.join(base, "participants.json"), JSON.stringify({ version: 1, participants: [
    { id: "alpha-agent", kind: "agent", language: { preferred: "en" } },
    { id: "bravo-human", kind: "human", language: { preferred: "en" } } ] }, null, 2));
  fs.copyFileSync(path.join(VENDOR, ".agent-board", "CONVENTION.md"), path.join(base, "CONVENTION.md"));
  const msg = (file, from, to, date, body, reply = "-") => fs.writeFileSync(path.join(room, file),
    `FROM: ${from}\nTO: ${to}\nSCOPE: ROOM\nROOM: general\nTHREAD: T001-order-check\nDATE: ${date}\nLANGUAGE: en\nREPLY-TO: ${reply}\nSTATUS: INFO\n---\n${body}\n`);
  // Filenames sort A,B,C but DATE order is C,A,B (a participant wrote wrong filename times).
  msg("2026-10-01_0900_alpha-agent_T001_aaa-first-by-name.txt", "alpha-agent", "all", "2026-10-01 11:00", "MARK-B second by date");
  msg("2026-10-01_0910_bravo-human_T001_bbb-second-by-name.txt", "bravo-human", "all", "2026-10-01 12:00", "MARK-C third by date");
  msg("2026-10-01_0920_alpha-agent_T001_ccc-third-by-name.txt", "alpha-agent", "all", "2026-10-01 10:00", "MARK-A first by date");
  return proj;
}

function fakeFsScript(tree, rootName) {
  const rootIdentity=require("node:crypto").randomUUID();
  return `(() => {
  const dbReady=new Promise((resolve,reject)=>{
    const r=indexedDB.open("agent-file-board-ui-test-fs",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });
  const value=async(key,write,input)=>{
    const db=await dbReady;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction("kv",write?"readwrite":"readonly"),store=tx.objectStore("kv"),q=write?store.put(input,key):store.get(key);
      tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || Error("Test filesystem transaction aborted"));
    });
  };
  let root=null,permission="granted",changes=Promise.resolve();
  const ready=(async()=>{
    root=await value("root",false);
    if(!root){root=${JSON.stringify(tree)};await value("root",true,root);}
    permission=await value("permission",false)||"granted";
  })();
  const mutate=action=>{
    const next=changes.then(async()=>{await ready;const copy=structuredClone(root);action(copy);await value("root",true,copy);root=copy;});
    changes=next.catch(()=>{});return next;
  };
  const settled=async()=>{await ready;await changes;};
  const nf = n => new DOMException("not found: " + n, "NotFoundError");
  const nodeAt = p => p.reduce((n, k) => n && n.children && n.children[k], root);
  class FakeFile { constructor(path) { this.kind = "file"; this.name = path[path.length - 1]; this.__path = path; }
    async isSameEntry(other) { return other?.kind === "file" && JSON.stringify(other.__path) === JSON.stringify(this.__path); }
    async getFile() { await settled(); const n = nodeAt(this.__path); if (!n) throw nf(this.name); const text = n.text, bytes = new TextEncoder().encode(text);
      return { name: this.name, size: bytes.length, lastModified: n.lastModified,
        slice: (start,end) => ({ text: async () => new TextDecoder().decode(bytes.subarray(start,end)) }), text: async () => text }; }
    async createWritable() { const p = this.__path; let buf = ""; return { write: async t => { buf += t; }, close: async () => { await mutate(copy=>{p.reduce((n,k)=>n.children[k],copy).text=buf;}); } }; } }
  class FakeDir { constructor(path) { this.__rootIdentity=${JSON.stringify(rootIdentity)}; this.kind = "directory"; this.name = path.length ? path[path.length - 1] : ${JSON.stringify(rootName)}; this.__path = path; }
    async isSameEntry(other) { return other?.kind === "directory" && other.__rootIdentity === this.__rootIdentity && JSON.stringify(other.__path) === JSON.stringify(this.__path); }
    async getDirectoryHandle(name, o) { await settled(); const n = nodeAt(this.__path); let c = n.children[name];
      if (!c) { if (o && o.create) { c = { kind: "directory", children: {} };await mutate(copy=>{this.__path.reduce((n,k)=>n.children[k],copy).children[name] ||= c;}); } else throw nf(name); }
      if (c.kind !== "directory") throw new DOMException("mismatch", "TypeMismatchError");
      return new FakeDir([...this.__path, name]); }
    async getFileHandle(name, o) { await settled(); const n = nodeAt(this.__path); let c = n.children[name];
      if (!c) { if (o && o.create) { c = { kind: "file", text: "" };await mutate(copy=>{this.__path.reduce((n,k)=>n.children[k],copy).children[name] ||= c;}); } else throw nf(name); }
      if (c.kind !== "file") throw new DOMException("mismatch", "TypeMismatchError");
      return new FakeFile([...this.__path, name]); }
    async *entries() { await settled(); const n = nodeAt(this.__path); for (const k of Object.keys(n.children)) yield [k, n.children[k].kind === "directory" ? new FakeDir([...this.__path, k]) : new FakeFile([...this.__path, k])]; }
    async removeEntry(name) { await settled(); await mutate(copy=>{const n=this.__path.reduce((n,k)=>n.children[k],copy);if(!n.children[name]) throw nf(name);delete n.children[name];}); }
    async queryPermission() { await settled(); return permission; }
    async requestPermission() { await window.__fakefs.setPermission("granted"); return "granted"; } }
  // Structured clone (IndexedDB) drops prototypes: re-hydrate plain {__path} objects into FakeDir.
  const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result");
  Object.defineProperty(IDBRequest.prototype, "result", { configurable: true, get() {
    const v = desc.get.call(this);
    const hydrate=x=>{if(!x||typeof x!=="object")return x;
      if(Array.isArray(x.__path)&&x.kind==="directory"&&!x.getDirectoryHandle)return new FakeDir(x.__path);
      if(Array.isArray(x))return x.map(hydrate);
      for(const key of ["handle","boardHandle","records"])if(x[key])x[key]=hydrate(x[key]);return x;};
    return hydrate(v); } });
  window.showDirectoryPicker = async () => {await settled();return new FakeDir([]);};
  const flat = (n, p, out) => { for (const k of Object.keys(n.children)) { const c = n.children[k], q = p ? p + "/" + k : k;
    if (c.kind === "directory") flat(c, q, out); else out.push({ path: q, text: c.text }); } return out; };
  window.__fakefs = {
    dump: () => flat(root, "", []),
    exists: p => !!nodeAt(p.split("/")),
    read: p => { const n = nodeAt(p.split("/")); return n ? n.text : null; },
    ready, get settled(){return changes;},
    addFile: (p,text,lastModified) => mutate(copy=>{
      const parts=p.split("/");let n=copy;
      for(const k of parts.slice(0,-1)) n=n.children[k] || (n.children[k]={kind:"directory",children:{}});
      n.children[parts.at(-1)]={kind:"file",text,lastModified};
    }),
    removeFile: p => mutate(copy=>{const parts=p.split("/"),parent=parts.slice(0,-1).reduce((n,k)=>n.children[k],copy);delete parent.children[parts.at(-1)];}),
    setPermission: v => {
      const next=changes.then(async()=>{await ready;await value("permission",true,v);permission=v;});changes=next.catch(()=>{});return next;
    } };

})();`;
}

async function launch() { return chromium.launch(); }

// Opens board.html (or a mutated copy) in a fresh context. Collects page errors, console errors, requests.
async function openPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    colorScheme: opts.colorScheme || "light", viewport: opts.viewport || { width: 1280, height: 800 },
    acceptDownloads: true, locale: "en-US", permissions: [] });
  // Existing offline/security fixtures explicitly opt out of the newly optional
  // daily public-metadata check. Update tests exercise the enabled default.
  if (!opts.updateChecks) await ctx.addInitScript(() => {
    const r=indexedDB.open('agent-file-board-ui',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('kv');
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({auto:false},'viewer-updates-v1');tx.oncomplete=()=>db.close();};
  });
  const page = await ctx.newPage();
  const log = { pageErrors: [], consoleErrors: [], requests: [], dialogs: [] };
  page.on("pageerror", e => log.pageErrors.push(String(e && e.message || e)));
  page.on("console", m => { if (m.type() === "error") log.consoleErrors.push(m.text()); });
  page.on("request", r => log.requests.push(r.url()));
  if (opts.dialog) page.on("dialog", async d => { log.dialogs.push({ type: d.type(), message: d.message() }); if (opts.dialog === "accept") await d.accept(); else await d.dismiss(); });
  if (opts.tree) await page.addInitScript({ content: fakeFsScript(opts.tree, opts.rootName || "proj") });
  if (opts.clock) {
    await page.clock.install({ time: opts.clock });
    // Freeze before navigation: slow concurrent page loads must not run past
    // a test's intended pauseAt deadline. No application timers exist yet.
    await page.clock.pauseAt(new Date(opts.clock.getTime() + 86400000));
    await page.clock.setSystemTime(opts.clock);
  }
  await page.goto(pathToFileURL(opts.html || BOARD_HTML).href);
  try{ await page.evaluate(async()=>{await window.__fakefs?.ready;await window.__boardTest?.ready;}); }catch(e){ log.pageErrors.push("Startup: "+e.message); }
  return { ctx, page, log };
}
async function openFolderMenu(page){
  if(await page.locator('#locationsDialog').isVisible())await page.waitForFunction(()=>!document.querySelector('#locationsDialog').open||!document.querySelector('#open').disabled);
  if(!await page.locator('#locationsDialog').isVisible())await page.click('#folderName');
  await page.waitForFunction(()=>document.querySelector('#locationsList').getAttribute('aria-busy')==='false');
}
async function pickFolder(page){
  await openFolderMenu(page);
  await page.click("#open");
}
async function openBoardViaUi(page) {
  await pickFolder(page);
  await page.waitForFunction(() => window.__boardTest.getModel() !== null && !document.querySelector('#locationsDialog').open, null, { timeout: 5000 });
}
async function openToolbarTool(page,id) {
  if(await page.locator('#toolbarTools').count() && !await page.locator('#toolbarTools').evaluate(el=>el.open))await page.click('#toolbarToolsToggle');
  await page.locator('#'+id).click();
}
async function expandComposer(page) {
  if(await page.locator('#composerOptions').count() && !await page.locator('#composerOptions').evaluate(el=>el.open))
    await page.locator('#composerOptions > summary').click();
  // SPEC-002-064: Where/Thread/To live under Options -> Advanced routing with unchanged IDs.
  if(await page.locator('#composerAdvanced').count() && !await page.locator('#composerAdvanced').evaluate(el=>el.open))
    await page.locator('#composerAdvanced > summary').click();
}
// Opens a view in the sidebar so the composer follows it (thread key, or room/direct folder name).
async function openView(page, target) {
  if(target.includes('|')) await page.locator(`.tcard[data-tk="${target}"]`).click();
  else await page.locator(`.fname[data-dir="${target}"]`).click();
}
// SPEC-002-068: the chip row is hidden while the destination equals the view, so tests open the
// destination popover through the always-visible change button next to Post.
async function openDestination(page) {
  await page.locator('#composerTargetChange').click();
  await expect(page.locator('#composerTargetMenu')).toBeVisible();
}
async function startNewRoom(page, label = 'New room…') {
  await openDestination(page);
  await page.locator('#composerTargetList button', { hasText: label }).click();
}
// SPEC-002-068: rename, repairs, guidance and the missing-message check live in the topic bar's "..." menu.
async function openTopicMenu(page) {
  if (!await page.locator('#topicMenu').evaluate(el => el.open)) await page.locator('#topicMenuToggle').click();
}
async function topicAction(page, id) {
  await openTopicMenu(page);
  await page.locator('#' + id).click();
}
async function renameTopic(page, title) {
  await openTopicMenu(page);
  if (await page.locator('#titleEditor').evaluate(el => el.hidden)) await page.locator('#topicRename').click();
  await page.fill('#topicTitle', title);
  await page.click('#setTitle');
}
// SPEC-002-068 AC1/AC2: returns every layout violation instead of asserting, so a test can also
// prove that a mutation makes it fail. Boxes come from getBoundingClientRect, never isVisible.
async function layoutViolations(page) {
  return page.evaluate(() => {
    const out = [], H = innerHeight, W = innerWidth, $ = s => document.querySelector(s);
    const shown = el => !!el && !el.hidden && el.getClientRects().length > 0;
    const inside = (s, r) => { if (r.top < -0.5 || r.bottom > H + 0.5 || r.left < -0.5 || r.right > W + 0.5) out.push(`${s} outside ${W}x${H}: ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`); };
    const body = $("#cBody"), send = $("#send");
    if (!shown(body)) out.push("#cBody not rendered");
    else {
      inside("#cBody", body.getBoundingClientRect());
      const cs = getComputedStyle(body), line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const content = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (content < 2 * line - 0.5) out.push(`#cBody shows ${content.toFixed(1)}px, under 2 lines of ${line.toFixed(1)}px`);
    }
    if (!shown(send)) out.push("#send not rendered"); else inside("#send", send.getBoundingClientRect());
    for (const s of ["#signingNotice", "#composerTargetRow", "#composerPin"]) {
      const el = $(s); if (!el || el.hidden) continue;
      if (!shown(el)) out.push(s + " not rendered"); else inside(s, el.getBoundingClientRect());
    }
    const doc = document.documentElement;
    if (doc.scrollHeight > H) out.push(`document scrollHeight ${doc.scrollHeight} > ${H}`);
    if (doc.scrollWidth > W) out.push(`document scrollWidth ${doc.scrollWidth} > ${W}`);
    return out;
  });
}
function boardctl(args) {
  // Isolated Python omits the script directory; admit only the pinned CLI's
  // own module directory so its adjacent message_extensions import works.
  const bootstrap = "import pathlib,runpy,sys; entry=sys.argv.pop(1); sys.path.insert(0,str(pathlib.Path(entry).resolve().parent)); runpy.run_path(entry,run_name='__main__')";
  const r = spawnSync("python3", ["-I", "-c", bootstrap, BOARDCTL, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
// Copy the in-page fake file system back to disk under dir (mirrors the picked folder).
async function dumpFakeFs(page, dir) {
  const files = await page.evaluate(() => window.__fakefs.dump());
  for (const f of files) { const p = path.join(dir, f.path); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.text); }
  return files;
}
async function feedOrder(page) {
  return page.$$eval("#feed article.msg", els => els.map(e => e.dataset.file));
}

// Chromium commits localStorage/IndexedDB writes asynchronously, so a reload that races a write can see
// stale storage (CI flakes). Wait until a second page of the same origin observes the expected state, then reload.
async function reloadSettled(ctx, page, cond, {timeout = 5000} = {}) {
  const probe = await ctx.newPage();
  const committed = async (c) => {
    const get=(database,key)=>new Promise((resolve,reject)=>{
      const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onerror=()=>reject(r.error || Error("Cannot open storage"));
      r.onsuccess=()=>{const db=r.result,tx=db.transaction("kv"),q=tx.objectStore("kv").get(key);
        tx.oncomplete=()=>{db.close();resolve(q.result);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error || Error("Storage read aborted"));};};
    });
    if(c.perm!==undefined && ((await get("agent-file-board-ui-test-fs","permission")) || "granted")!==c.perm) return false;
    if(c.setting){const saved=await get("agent-file-board-ui","settings");if(saved?.[c.setting[0]]!==c.setting[1]) return false;}
    if(c.files){const root=await get("agent-file-board-ui-test-fs","root");if(!root || !c.files.every(file=>file.path.split("/").reduce((node,part)=>node?.children?.[part],root)?.text===file.text)) return false;}
    if(c.local && localStorage.getItem(c.local[0])!==c.local[1]) return false;
    if(c.lastDir!==undefined){const folder=await get("agent-file-board-ui","lastDir");if((folder!==undefined && folder!==null)!==c.lastDir) return false;}
    return true;
  };
  // waitForFunction in the pinned Playwright treats an async predicate's Promise
  // as truthy, even when it resolves false. Poll its actual resolved value in Node,
  // outside the page's deliberately frozen clock, without changing the deadline.
  const wait = (target,stage) => expect.poll(()=>target.evaluate(committed,cond),
    {timeout,message:"Stored state "+stage,intervals:[10,25,50,100]}).toBe(true);
  try {
    await probe.goto(page.url());
    await wait(probe,"before reload");
    await page.reload();
    await page.evaluate(async()=>{await window.__fakefs?.ready;await window.__boardTest?.ready;});
    await wait(page,"after reload with observer");
  } finally { await probe.close(); }
  await wait(page,"after observer closes");
}

module.exports = { reloadSettled, ROOT, BOARD_HTML, VENDOR, BOARDCTL, EXAMPLE, readTree, writeTree, tmpDir, copyDir, layoutExample, layoutShuffled,
  fakeFsScript, launch, openPage, openFolderMenu, pickFolder, openBoardViaUi, expandComposer, expandAdvanced: expandComposer, openView, layoutViolations, openDestination, startNewRoom, openTopicMenu, topicAction, renameTopic, openToolbarTool, boardctl, dumpFakeFs, feedOrder, fs, os, path, pathToFileURL };
