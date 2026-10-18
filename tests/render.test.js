"use strict";
// AC2: DATE ordering and participant kinds/names on examples/full-conversation (+ a board whose filename order is wrong).
// AC3: legacy Polish dialect fixture: mapping, time corrections, read-only.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

function expectedOrder(dir) {
  // independent oracle: DATE header, filename tiebreak, over every message file
  const out = [];
  for (const top of ["rooms", "direct"]) {
    const root = h.path.join(dir, top);
    if (!h.fs.existsSync(root)) continue;
    for (const d of h.fs.readdirSync(root)) for (const f of h.fs.readdirSync(h.path.join(root, d))) {
      const txt = h.fs.readFileSync(h.path.join(root, d, f), "utf8");
      out.push({ f, date: /^DATE: (.*)$/m.exec(txt)[1] });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.f < b.f ? -1 : 1)).map(x => x.f);
}

test("AC2: example (bare root, uploaded read-only) renders every room and direct message in DATE order", async () => {
  const { ctx, page, log } = await h.openPage(browser);
  await page.setInputFiles("#fallback", h.EXAMPLE);
  await page.waitForSelector("#feed article.msg");
  assert.deepEqual(await h.feedOrder(page), expectedOrder(h.EXAMPLE));
  assert.equal((await h.feedOrder(page)).length, 10);
  assert.match(await page.textContent("#folderName"), /read-only/);
  assert.deepEqual(log.pageErrors, []);
  await ctx.close();
});

test("AC2: example laid out as proj/.agent-board renders in DATE order with kinds and names from participants.json", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(proj) });
  await h.openBoardViaUi(page);
  assert.deepEqual(await h.feedOrder(page), expectedOrder(h.path.join(proj, ".agent-board")));
  const people = await page.$$eval("#feed article.msg", els => els.map(e => [e.querySelector(".who").textContent, e.querySelector(".kind").textContent]));
  const seen = Object.fromEntries(people);
  assert.equal(seen["human-owner-01"], "human");
  assert.equal(seen["research-agent-01"], "agent");
  assert.equal(seen["implementation-agent-01"], "agent");
  // direct conversations are their own sidebar section
  const direct = await page.textContent("#tree h3:has-text('Direct')");
  assert.match(direct, /Direct conversations/i);
  assert.ok(await page.isVisible("#tree .folder:has-text('implementation-agent-01 \u2194 research-agent-01')"));
  // versions: viewer 2.0.0 and board 2.0.0 (from CONVENTION.md); no mismatch warning
  const bar = await page.textContent("#verbar");
  assert.match(bar, /Viewer v2\.0\.0/); assert.match(bar, /Board v2\.0\.0/);
  assert.equal(await page.isVisible("#verwarn"), false);
  await ctx.close();
});

test("AC2: ordering follows DATE, not filename", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutShuffled(tmp);
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(proj) });
  await h.openBoardViaUi(page);
  const order = await h.feedOrder(page);
  assert.deepEqual(order.map(f => f.split("_")[4].split(".")[0].slice(0, 3)), ["ccc", "aaa", "bbb"]);
  assert.deepEqual(order, expectedOrder(h.path.join(proj, ".agent-board")));
  await ctx.close();
});

test("AC3: legacy dialect fixture opens read-only with mapping and time corrections", async () => {
  const dir = h.path.join(__dirname, "fixtures", "legacy-board");
  const { ctx, page, log } = await h.openPage(browser);
  await page.setInputFiles("#fallback", dir);
  await page.waitForSelector("#feed article.msg");
  assert.match(await page.textContent("#verbar"), /legacy \(pokoje\/\)/);
  assert.match(await page.textContent("#verbar"), /Board vunknown/);   // no CONVENTION.md in a legacy board
  assert.match(await page.textContent("#folderName"), /read-only/);
  // order: corrected Kit message (23:00 in file -> 10:15) sits between 09:30 and 11:00; receipt hidden
  const order = await h.feedOrder(page);
  assert.deepEqual(order, [
    "2026-03-02_0900_ada_T001_start.txt", "2026-03-02_0930_robo_T001_propozycja.txt", "2026-03-02_2300_kit_T001_zrobione.txt",
    "2026-03-02_1100_robo_T002_budzet.txt", "2026-03-03_0800_ada_T002_zamkniecie.txt"]);
  const kit = page.locator("article.msg[data-file='2026-03-02_2300_kit_T001_zrobione.txt']");
  assert.match(await kit.locator(".time").textContent(), /10:15.*corrected/);
  assert.ok(await kit.locator(".time.fixed").count());
  assert.match(await kit.locator(".time").getAttribute("title"), /23:00/);
  // mapping: PYTANIE->QUESTION, ODPOWIEDZ->REPLY, ZROBIONE->DONE, wszyscy->all, kinds from RUNTIME
  const chips = await page.$$eval("article.msg", els => els.map(e => [e.dataset.file, e.querySelector(".chip.status").textContent, e.querySelector(".to").textContent, e.querySelector(".who").textContent, e.querySelector(".kind").textContent]));
  const m = {}; for (const c of chips) { const k = c[0].split("_")[2]; if (!m[k]) m[k] = c; }
  assert.equal(m.ada[1], "QUESTION"); assert.match(m.ada[2], /all/); assert.equal(m.ada[4], "human");
  assert.equal(m.robo[1], "REPLY"); assert.equal(m.robo[4], "agent");
  assert.equal(m.kit[1], "DONE"); assert.equal(m.kit[3], "Kit");
  // reply link, mention highlight, list reflow
  assert.ok(await page.locator("article.msg[data-file='2026-03-02_0930_robo_T001_propozycja.txt'] .reply-ref").count());
  assert.ok(await page.locator(".mention", { hasText: "@Robo" }).count());
  assert.equal(await page.locator("article.msg[data-file='2026-03-02_0930_robo_T001_propozycja.txt'] li").count(), 2);
  // receipts hidden by default, shown on demand as a single line
  assert.equal(await page.locator(".receipt").count(), 0);
  await page.click("#gear"); await page.check("#showReceipts"); await page.click("#sClose");
  assert.equal(await page.locator(".receipt").count(), 1);
  // closed thread (ZAMKNIETY) is grouped
  assert.match(await page.textContent("#tree"), /closed \(1\)/i);
  // read-only: posting downloads a legacy-format file and never touches a folder
  await page.fill("#cBody", "Odpowiedź testowa");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#send")]);
  const saved = h.path.join(h.tmpDir(), dl.suggestedFilename()); await dl.saveAs(saved);
  const txt = h.fs.readFileSync(saved, "utf8");
  assert.match(txt, /^OD: Ada\nDO: wszyscy\nPOKOJ: 00_ogolne\nWATEK: T001-plan-lata\nDATA: \d{4}-\d\d-\d\d \d\d:\d\d\nODPOWIEDZ-NA: -\n/);
  assert.match(txt, /\nSTATUS: INFO\n/);
  assert.deepEqual(log.pageErrors, []);
  await ctx.close();
});

test("AC3: writing to a legacy board uses the legacy dialect under pokoje/ and never overwrites", async () => {
  const dir = h.path.join(__dirname, "fixtures", "legacy-board");
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(dir), rootName: "legacy-board", clock: new Date("2026-03-04T09:00:00Z") });
  await page.clock.pauseAt(new Date("2026-03-04T09:00:05Z"));
  await h.openBoardViaUi(page);
  await page.selectOption("#me", "ada");
  await page.selectOption("#cStatus", "DECISION-NEEDED");
  await page.fill("#cBody", "Decyzja potrzebna w sprawie lata");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /^pokoje\/00_ogolne\/2026-03-04_1000_ada_T001_/.test(f.path)));
  const files = await page.evaluate(() => window.__fakefs.dump());
  const f = files.find(x => /^pokoje\/00_ogolne\/2026-03-04_1000_ada_T001_/.test(x.path));
  assert.match(f.text, /^OD: Ada\nDO: wszyscy\nPOKOJ: 00_ogolne\nWATEK: T001-plan-lata\nDATA: 2026-03-04 10:00\nODPOWIEDZ-NA: -\nRUNTIME: .*\nSTATUS: DECYZJA-MISI\nPRZECZYTANE-DO: 2026-03-02_2300_kit_T001_zrobione.txt\nPOSTED-AT: 2026-03-04T09:00:05\.000Z\n---\nDecyzja potrzebna w sprawie lata\n$/);
  // legacy registry file (01_POKOJE.txt) is an existing file: untouched
  assert.equal(files.find(x => x.path === "01_POKOJE.txt").text, h.fs.readFileSync(h.path.join(dir, "01_POKOJE.txt"), "utf8"));
  // the legacy board refuses native paths
  const r = await page.evaluate(async () => { try { await window.__boardTest.writeNewFile("rooms/x/y.txt", "x"); return "WROTE"; } catch (e) { return e.key; } });
  assert.equal(r, "e_path");
  await ctx.close();
});
