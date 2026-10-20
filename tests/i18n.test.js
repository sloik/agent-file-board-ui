"use strict";
// AC7 localisation and AC12 version display.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");
const c = require("./lib/checks");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

const SRC = h.fs.readFileSync(h.BOARD_HTML, "utf8");

test("AC7 EN and PL key sets are identical", async () => {
  assert.deepEqual(await c.checkKeyDiff(browser, h.BOARD_HTML), []);
});

test("AC7 every referenced key exists, no dead keys, PL differs from EN", async () => {
  const { ctx, page } = await h.openPage(browser);
  const { en, pl, same } = await page.evaluate(() => ({ en: window.__boardTest.STRINGS.en, pl: window.__boardTest.STRINGS.pl, same: window.__boardTest.SAME_OK }));
  const tableStart = SRC.indexOf("const STRINGS = {"), tableEnd = SRC.indexOf("const SAME_OK");
  const outside = SRC.slice(0, tableStart) + SRC.slice(tableEnd);
  const used = new Set();
  for (const m of outside.matchAll(/\bt\(\s*"([a-z_0-9]+)"/g)) used.add(m[1]);
  for (const m of outside.matchAll(/data-i18n(?:-ph|-title|-aria)?="([a-z_0-9]+)"/g)) used.add(m[1]);
  for (const k of used) assert.ok(k in en, "key referenced but not in table: " + k);
  for (const k of Object.keys(en)) assert.ok(outside.includes('"' + k + '"') || new RegExp(`data-i18n[a-z-]*="${k}"`).test(outside), "dead key: " + k);
  for (const k of Object.keys(en)) if (!same.includes(k)) assert.notEqual(pl[k], en[k], "untranslated (PL equals EN): " + k);
  // placeholders must match across languages
  for (const k of Object.keys(en)) assert.deepEqual((pl[k].match(/\{\w+\}/g) || []).sort(), (en[k].match(/\{\w+\}/g) || []).sort(), "placeholder mismatch: " + k);
  await ctx.close();
});

test("AC7 English is the default; switching to Polish translates all UI chrome and dates", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  assert.equal(await page.getAttribute("html", "lang"), "en");
  assert.equal(await page.textContent("#open"), "Choose another folder…");
  assert.match(await page.textContent("#feed .day >> nth=0"), /26 September 2026/);
  await page.click("#gear");
  await page.selectOption("#sLang", "pl");
  assert.equal(await page.getAttribute("html", "lang"), "pl");
  const pl = await page.evaluate(() => window.__boardTest.STRINGS.pl);
  const stale = await page.evaluate(pl => {
    const bad = [];
    document.querySelectorAll("[data-i18n]").forEach(e => { if (e.textContent !== pl[e.dataset.i18n]) bad.push(e.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach(e => { if (e.placeholder !== pl[e.dataset.i18nPh]) bad.push(e.dataset.i18nPh); });
    document.querySelectorAll("[data-i18n-title]").forEach(e => { if (e.title !== pl[e.dataset.i18nTitle]) bad.push(e.dataset.i18nTitle); });
    return bad;
  }, pl);
  assert.deepEqual(stale, []);
  assert.equal(await page.textContent("#open"), pl.change_folder);
  assert.match(await page.textContent(".tree-root"), /Wszystkie wiadomości/);
  assert.match(await page.textContent("#feed .day >> nth=0"), /26 września 2026/);
  assert.match(await page.textContent("#verbar"), /Przeglądarka v2\.9\.1/);
  assert.match(await page.textContent("#verbar"), /Tablica v2\.9\.1/);
  // message content is never translated
  assert.match(await page.textContent("#feed"), /Czy ten wątek może domyślnie używać polskiego/);
  assert.match(await page.textContent("#feed"), /schema/i);
  await ctx.close();
});

// ---- AC12 versions ----
async function boardWithVersion(versionLine) {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const conv = h.path.join(proj, ".agent-board", "CONVENTION.md");
  const txt = h.fs.readFileSync(conv, "utf8");
  h.fs.writeFileSync(conv, versionLine === null ? txt.replace(/^Version:.*\n/m, "") : txt.replace(/^Version:.*$/m, versionLine));
  const s = await h.openPage(browser, { tree: h.readTree(proj) });
  await h.openBoardViaUi(s.page);
  return s;
}
test("AC12 viewer and board versions are displayed together", async () => {
  assert.match(SRC, /const VIEWER_VERSION = "2\.9\.1";/);
  const { ctx, page } = await boardWithVersion("Version: 2.9.9");
  assert.match(await page.textContent("#verbar"), /Viewer v2\.9\.1 · Board v2\.9\.9/);
  assert.equal(await page.isVisible("#verwarn"), false);       // same MAJOR.MINOR: no warning
  await ctx.close();
});
test("AC12 'unknown' when the board has no Version line", async () => {
  const { ctx, page } = await boardWithVersion(null);
  assert.match(await page.textContent("#verbar"), /Board vunknown/);
  assert.equal(await page.isVisible("#verwarn"), false);
  await ctx.close();
});
test("AC12 MAJOR.MINOR mismatch warns but never blocks (reading and posting still work)", async () => {
  const { ctx, page, tmp } = await boardWithVersion("Version: 1.3.0");
  assert.equal(await page.isVisible("#verwarn"), true);
  assert.match(await page.textContent("#verwarn"), /v2\.9\.1.*v1\.3\.0/);
  assert.equal((await h.feedOrder(page)).length, 10);
  await page.fill("#cBody", "Still can post");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /Still-can-post|still-can-post/.test(f.path)));
  await ctx.close();
});
