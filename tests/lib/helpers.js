"use strict";
// Shared test helpers: browser launch, in-memory File System Access substitute, board layout helpers.
// The headless Chromium used here cannot show a directory picker and OPFS is unavailable on file://,
// so the page gets a substitute implementation of window.showDirectoryPicker backed by a JSON tree
// persisted in localStorage (so it survives reload). The viewer's real write path runs against it.
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
  return `(() => {
  const KEY = "__fakefs", PERM = "__fakefs_perm";
  let root = null;
  try { root = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!root) { root = ${JSON.stringify(tree)}; try { localStorage.setItem(KEY, JSON.stringify(root)); } catch (e) {} }
  const save = () => localStorage.setItem(KEY, JSON.stringify(root));
  const nf = n => new DOMException("not found: " + n, "NotFoundError");
  const nodeAt = p => p.reduce((n, k) => n && n.children && n.children[k], root);
  class FakeFile { constructor(path) { this.kind = "file"; this.name = path[path.length - 1]; this.__path = path; }
    async getFile() { const n = nodeAt(this.__path); if (!n) throw nf(this.name); const text = n.text, bytes = new TextEncoder().encode(text);
      return { name: this.name, size: bytes.length, lastModified: n.lastModified,
        slice: (start,end) => ({ text: async () => new TextDecoder().decode(bytes.subarray(start,end)) }), text: async () => text }; }
    async createWritable() { const p = this.__path; let buf = ""; return { write: async t => { buf += t; }, close: async () => { nodeAt(p).text = buf; save(); } }; } }
  class FakeDir { constructor(path) { this.kind = "directory"; this.name = path.length ? path[path.length - 1] : ${JSON.stringify(rootName)}; this.__path = path; }
    async getDirectoryHandle(name, o) { const n = nodeAt(this.__path); let c = n.children[name];
      if (!c) { if (o && o.create) { c = n.children[name] = { kind: "directory", children: {} }; save(); } else throw nf(name); }
      if (c.kind !== "directory") throw new DOMException("mismatch", "TypeMismatchError");
      return new FakeDir([...this.__path, name]); }
    async getFileHandle(name, o) { const n = nodeAt(this.__path); let c = n.children[name];
      if (!c) { if (o && o.create) { c = n.children[name] = { kind: "file", text: "" }; save(); } else throw nf(name); }
      if (c.kind !== "file") throw new DOMException("mismatch", "TypeMismatchError");
      return new FakeFile([...this.__path, name]); }
    async *entries() { const n = nodeAt(this.__path); for (const k of Object.keys(n.children)) yield [k, n.children[k].kind === "directory" ? new FakeDir([...this.__path, k]) : new FakeFile([...this.__path, k])]; }
    async removeEntry(name) { const n=nodeAt(this.__path); if(!n.children[name]) throw nf(name); delete n.children[name]; save(); }
    async queryPermission() { return localStorage.getItem(PERM) || "granted"; }
    async requestPermission() { localStorage.setItem(PERM, "granted"); return "granted"; } }
  // Structured clone (IndexedDB) drops prototypes: re-hydrate plain {__path} objects into FakeDir.
  const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result");
  Object.defineProperty(IDBRequest.prototype, "result", { configurable: true, get() {
    const v = desc.get.call(this);
    return v && Array.isArray(v.__path) && v.kind === "directory" && !v.getDirectoryHandle ? new FakeDir(v.__path) : v; } });
  window.showDirectoryPicker = async () => new FakeDir([]);
  const flat = (n, p, out) => { for (const k of Object.keys(n.children)) { const c = n.children[k], q = p ? p + "/" + k : k;
    if (c.kind === "directory") flat(c, q, out); else out.push({ path: q, text: c.text }); } return out; };
  window.__fakefs = {
    dump: () => flat(root, "", []),
    exists: p => !!nodeAt(p.split("/")),
    read: p => { const n = nodeAt(p.split("/")); return n ? n.text : null; },
    addFile: (p, text, lastModified) => { const parts = p.split("/"); let n = root;
      for (const k of parts.slice(0, -1)) n = n.children[k] || (n.children[k] = { kind: "directory", children: {} });
      n.children[parts[parts.length - 1]] = { kind: "file", text, lastModified }; save(); },
    removeFile: p => { const parts = p.split("/"), parent = nodeAt(parts.slice(0, -1)); delete parent.children[parts.at(-1)]; save(); },
    setPermission: v => localStorage.setItem(PERM, v) };
})();`;
}

async function launch() { return chromium.launch(); }

// Opens board.html (or a mutated copy) in a fresh context. Collects page errors, console errors, requests.
async function openPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    colorScheme: opts.colorScheme || "light", viewport: { width: 1280, height: 800 },
    acceptDownloads: true, locale: "en-US", permissions: [] });
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
  return { ctx, page, log };
}
async function openBoardViaUi(page) {
  await page.click("#open");
  await page.waitForFunction(() => window.__boardTest.getModel() !== null, null, { timeout: 5000 });
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
    if (c.perm !== undefined && (localStorage.getItem("__fakefs_perm") || "granted") !== c.perm) return false;
    if (c.setting) {
      try { if (JSON.parse(localStorage.getItem("agent-file-board-ui.settings"))[c.setting[0]] !== c.setting[1]) return false; } catch (e) { return false; }
    }
    if(c.files){
      let root; try{ root=JSON.parse(localStorage.getItem("__fakefs")); }catch(e){ return false; }
      if(!root || !c.files.every(file=>file.path.split("/").reduce((node,part)=>node?.children?.[part],root)?.text===file.text)) return false;
    }
    if (c.lastDir !== undefined) {
      const has = await new Promise((res,rej) => {
        const r = indexedDB.open("agent-file-board-ui", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("kv");
        r.onerror = () => rej(r.error || new Error("Cannot open remembered-folder storage"));
        r.onsuccess = () => { const db=r.result, q=db.transaction("kv").objectStore("kv").get("lastDir"); q.onsuccess = () => { db.close(); res(q.result !== undefined && q.result !== null); }; q.onerror = () => { db.close(); rej(q.error || new Error("Cannot read remembered-folder storage")); }; };
      });
      if (has !== c.lastDir) return false;
    }
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
    await wait(page,"after reload with observer");
  } finally { await probe.close(); }
  await wait(page,"after observer closes");
}

module.exports = { reloadSettled, ROOT, BOARD_HTML, VENDOR, BOARDCTL, EXAMPLE, readTree, writeTree, tmpDir, copyDir, layoutExample, layoutShuffled,
  fakeFsScript, launch, openPage, openBoardViaUi, boardctl, dumpFakeFs, feedOrder, fs, os, path, pathToFileURL };
