"use strict";
// AC6: scheduler firing and pause (fake clock), sidebar resize, preferences surviving reload, folder reopen via IndexedDB.
// AC1/R13 extras live in guards.test.js.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");
const c = require("./lib/checks");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

const LATE = ".agent-board/rooms/architecture/2026-09-26_1200_research-agent-01_T001_late-arrival.txt";
const LATE_TEXT = "FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T001-message-schema\nDATE: 2026-09-26 12:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nlate arrival\n";

async function withClock(iso, extra = {}) {
  const s = await c.openExample(browser, h.BOARD_HTML, { clock: new Date(iso), ...extra });
  await s.page.clock.pauseAt(new Date(new Date(iso).getTime() + 5000));
  return s;
}

test("AC6 scheduler fires on the interval, shows countdown and progress, picks up new files", async () => {
  const { ctx, page, log } = await withClock("2026-10-14T10:00:00Z");   // Wed 12:00 Warsaw
  await page.click("#gear");
  await page.fill("#rEvery", "30"); await page.selectOption("#rUnit", "s");
  await page.click("[data-dpre='1234567']");
  await page.evaluate(([p, t]) => window.__fakefs.addFile(p, t), [LATE, LATE_TEXT]);
  assert.equal((await h.feedOrder(page)).length, 10);
  assert.match(await page.textContent("#rstat"), /refresh in 30 s/);
  await page.clock.runFor(10000);
  assert.match(await page.textContent("#rstat"), /refresh in 20 s/);
  const frac = Number(await page.getAttribute("#pbar", "data-frac"));
  assert.ok(frac > 0.3 && frac < 0.4, "progress bar fraction " + frac);
  assert.equal(await page.evaluate(() => window.__boardTest.stats.autoRefreshes), 0);
  await page.clock.runFor(21000);
  await page.waitForFunction(() => window.__boardTest.stats.autoRefreshes === 1);
  await page.waitForFunction(() => document.querySelectorAll("#feed article.msg").length === 11);
  // manual refresh restarts the countdown
  await page.clock.runFor(15000);
  assert.match(await page.textContent("#rstat"), /refresh in 1[3-5] s/);
  await page.click("#reload");
  await page.waitForTimeout(100);
  assert.match(await page.textContent("#rstat"), /refresh in 30 s/);
  assert.deepEqual(log.pageErrors, []);
  await ctx.close();
});

test("AC6 scheduler does not refresh while the tab is hidden", async () => {
  const { ctx, page } = await withClock("2026-10-14T10:00:00Z");
  await page.click("#gear");
  await page.fill("#rEvery", "5"); await page.selectOption("#rUnit", "s");
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
  await page.clock.runFor(20000);
  assert.equal(await page.evaluate(() => window.__boardTest.stats.autoRefreshes), 0);
  await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }));
  await page.clock.runFor(6000);
  await page.waitForFunction(() => window.__boardTest.stats.autoRefreshes >= 1);
  await ctx.close();
});

test("AC6 scheduler pauses outside the chosen days and outside the time-of-day window", async () => {
  const { ctx, page } = await withClock("2026-10-14T10:00:00Z");       // Wednesday
  await page.click("#gear");
  await page.click("[data-dpre='67']");                                 // weekend only
  assert.match(await page.textContent("#rstat"), /paused \(outside schedule\)/);
  await page.click("[data-dpre='12345']");                              // Mon-Fri: running again
  assert.match(await page.textContent("#rstat"), /refresh in/);
  await page.check("#rWin"); await page.fill("#rFrom", "13:00"); await page.fill("#rTo", "14:00");  // now 12:00 Warsaw
  await page.dispatchEvent("#rTo", "change");
  assert.match(await page.textContent("#rstat"), /paused/);
  await page.fill("#rFrom", "11:00"); await page.dispatchEvent("#rFrom", "change");
  assert.match(await page.textContent("#rstat"), /refresh in/);
  // pure schedule function: overnight window and board time zone (Europe/Warsaw)
  const r = await page.evaluate(() => {
    const f = window.__boardTest.inSchedule, S = { rDays: "12345", rWin: true, rFrom: "22:00", rTo: "06:00" }, z = "Europe/Warsaw";
    const at = s => f(S, new Date(s), z);
    return { friNight: at("2026-10-16T21:30:00Z"),     // Fri 23:30 local
             satEarly: at("2026-10-16T23:30:00Z"),     // Sat 01:30 local: belongs to Friday's window
             satNight: at("2026-10-17T21:30:00Z"),     // Sat 23:30 local: Saturday not selected
             monEarly: at("2026-10-18T23:30:00Z"),     // Mon 01:30 local: belongs to Sunday, not selected
             midday: at("2026-10-14T10:00:00Z") };     // Wed 12:00 local
  });
  assert.deepEqual(r, { friNight: true, satEarly: true, satNight: false, monEarly: false, midday: false });
  await ctx.close();
});

test("AC6 sidebar resize by dragging; double-click resets; width survives reload", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  const width = () => page.evaluate(() => Math.round(document.querySelector("#side").getBoundingClientRect().width));
  assert.equal(await width(), 270);
  const box = await page.locator("#resizer").boundingBox();
  const y = box.y + 200;
  await page.mouse.move(box.x + 3, y); await page.mouse.down(); await page.mouse.move(box.x + 123, y, { steps: 5 }); await page.mouse.up();
  assert.equal(await width(), 390);
  // clamps
  const b2 = await page.locator("#resizer").boundingBox();
  await page.mouse.move(b2.x + 3, y); await page.mouse.down(); await page.mouse.move(b2.x + 900, y, { steps: 5 }); await page.mouse.up();
  assert.equal(await width(), 560);
  const b3 = await page.locator("#resizer").boundingBox();
  await page.mouse.move(b3.x + 3, y); await page.mouse.down(); await page.mouse.move(5, y, { steps: 5 }); await page.mouse.up();
  assert.equal(await width(), 190);
  const b4 = await page.locator("#resizer").boundingBox();
  await page.mouse.move(b4.x + 3, y); await page.mouse.down(); await page.mouse.move(b4.x + 203, y, { steps: 5 }); await page.mouse.up();
  await h.reloadSettled(ctx, page, { setting: ["sideW", 390] });
  assert.equal(await width(), 390);
  await page.dblclick("#resizer");
  assert.equal(await width(), 270);
  await ctx.close();
});

test("AC6/R11 preferences survive reload; reset restores defaults", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  await page.click("#gear");
  await page.evaluate(() => { const set = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
    set("#sLh", "1.9"); set("#sFs", "17"); set("#sBubble", "70"); set("#sFeed", "900"); });
  await page.selectOption("#sAlign", "left");
  await page.check("#showReceipts"); await page.check("#expandAll"); await page.uncheck("#sAutoOpen");
  await page.fill("#rEvery", "7"); await page.selectOption("#rUnit", "h");
  await page.click("[data-dpre='67']");
  await page.check("#rWin"); await page.fill("#rFrom", "07:15"); await page.fill("#rTo", "19:45"); await page.dispatchEvent("#rTo", "change");
  await page.selectOption("#sLang", "pl");
  await page.click("#sClose");
  await page.selectOption("#me", "research-agent-01");
  await page.click(".folder:has-text('product') .chev");
  await page.click("#tree .group >> nth=0");
  await page.click(".fname:has-text('architecture')");
  const snap = () => page.evaluate(() => { const s = window.__boardTest.getSettings(); return { lh: s.lh, fs: s.fs, bubble: s.bubble, feed: s.feed, align: s.align, showReceipts: s.showReceipts,
    expandAll: s.expandAll, autoOpen: s.autoOpen, rEvery: s.rEvery, rUnit: s.rUnit, rDays: s.rDays, rWin: s.rWin, rFrom: s.rFrom, rTo: s.rTo, lang: s.lang, me: s.me,
    collapsed: s.collapsed, closedGroups: Object.keys(s.closedGroups).length, lastScope: s.lastScope, lastDir: s.lastDir }; });
  const before = await snap();
  assert.equal(before.lh, 1.9); assert.equal(before.lang, "pl"); assert.equal(before.rDays, "67"); assert.equal(before.lastDir, "architecture");
  // Chromium commits localStorage writes asynchronously; a reload racing that write can see an empty
  // store (seen once on CI). Wait until a second page of the same origin observes the write.
  const probe = await ctx.newPage();
  await probe.goto(page.url());
  await probe.waitForFunction(() => { try { return JSON.parse(localStorage.getItem("agent-file-board-ui.settings")).lastDir === "architecture"; } catch (e) { return false; } }, null, { timeout: 5000 });
  await probe.close();
  await page.reload();
  await h.openBoardViaUi(page);          // folder picker is a user gesture; preferences come from storage
  assert.deepEqual(await snap(), before);
  // restored into the UI as well
  assert.equal(await page.inputValue("#sLh"), "1.9");
  assert.equal(await page.inputValue("#me"), "research-agent-01");
  assert.equal(await page.getAttribute("html", "lang"), "pl");
  assert.match(await page.textContent("#title"), /architecture/);
  assert.equal(await page.getAttribute(".folder:has-text('product') .chev", "aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--fs")), "17px");
  // reset to defaults
  await page.click("#gear"); await page.click("#sReset");
  const s = await snap();
  assert.equal(s.lh, 1.6); assert.equal(s.lang, "en"); assert.equal(s.rDays, "1234567"); assert.equal(s.me, ""); assert.deepEqual(s.collapsed, {});
  await ctx.close();
});

test("R11 storage failures degrade silently", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const { ctx, page, log } = await h.openPage(browser, { tree: h.readTree(proj) });
  // break settings storage (not the fake FS key) after the page has loaded, then exercise setters
  await page.evaluate(() => {
    const g = Storage.prototype.getItem, s = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k.startsWith("agent-file-board-ui")) throw new DOMException("quota", "QuotaExceededError"); return s.call(this, k, v); };
    Storage.prototype.getItem = function (k) { if (k.startsWith("agent-file-board-ui")) throw new DOMException("denied", "SecurityError"); return g.call(this, k); };
  });
  await h.openBoardViaUi(page);
  await page.click("#gear"); await page.selectOption("#sLang", "pl"); await page.selectOption("#sLang", "en");
  await page.click(".fname >> nth=0");
  assert.deepEqual(log.pageErrors, []);
  assert.equal((await h.feedOrder(page)).length, 4);
  await ctx.close();
});

// Wait for the reopen banner; on failure report the state that decides whether it appears (CI flake evidence).
async function bannerShown(page) {
  try { await page.waitForSelector("#banner.show", { timeout: 10000 }); return; } catch (e) {}
  const state = await page.evaluate(async () => {
    const idb = await new Promise((res) => {
      const r = indexedDB.open("agent-file-board-ui", 1);
      r.onerror = () => res("open-error");
      r.onsuccess = () => { try { const q = r.result.transaction("kv").objectStore("kv").get("lastDir");
        q.onsuccess = () => res(q.result === undefined ? "undefined" : q.result === null ? "null" : typeof q.result + ":" + (q.result.name || "?"));
        q.onerror = () => res("get-error"); } catch (err) { res("tx-error " + err.name); } };
    });
    const s = window.__boardTest.getSettings();
    return { perm: localStorage.getItem("__fakefs_perm"), idbLastDir: idb, autoOpen: s.autoOpen,
      model: window.__boardTest.getModel() !== null, banner: document.querySelector("#banner").className,
      hasPicker: typeof window.showDirectoryPicker, url: location.href };
  });
  throw new Error("banner did not show; state=" + JSON.stringify(state));
}

test("R9 remembered folder: reopen silently when permission still granted, else one-click banner", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const tree = h.readTree(proj);
  const { ctx, page } = await h.openPage(browser, { tree });
  await h.openBoardViaUi(page);                        // stores the handle in IndexedDB
  // permission still granted: silent reopen after reload, no click
  await h.reloadSettled(ctx, page, { lastDir: true });
  await page.waitForFunction(() => window.__boardTest.getModel() !== null);
  assert.equal(await page.isVisible("#banner"), false);
  assert.match(await page.textContent("#folderName"), /Folder: proj/);
  // permission needs a gesture: banner offers one-click reopen
  await page.evaluate(() => window.__fakefs.setPermission("prompt"));
  await h.reloadSettled(ctx, page, { perm: "prompt", lastDir: true });
  await bannerShown(page);
  assert.match(await page.textContent("#lastName"), /proj/);
  assert.equal(await page.evaluate(() => window.__boardTest.getModel()), null);
  await page.click("#reopen");
  await page.waitForFunction(() => window.__boardTest.getModel() !== null);
  assert.equal(await page.isVisible("#banner"), false);
  // "forget" removes the offer
  await page.evaluate(() => window.__fakefs.setPermission("prompt"));
  await h.reloadSettled(ctx, page, { perm: "prompt", lastDir: true });
  await bannerShown(page);
  await page.click("#forget");
  await page.waitForSelector("#banner:not(.show)", { state: "attached" });
  await h.reloadSettled(ctx, page, { lastDir: false });
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible("#banner"), false);
  await ctx.close();
});

test("R13 light and dark themes follow the system preference", async () => {
  const bg = async scheme => { const { ctx, page } = await h.openPage(browser, { colorScheme: scheme });
    const v = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); await ctx.close(); return v; };
  const light = await bg("light"), dark = await bg("dark");
  assert.notEqual(light, dark);
  assert.equal(light, "rgb(244, 245, 247)");
});
