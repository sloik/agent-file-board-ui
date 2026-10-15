"use strict";
// Guard checks. Each takes (browser, htmlPath) and returns an array of problems (empty = guard holds).
// The normal tests assert [] on the real board.html; tests/mutation.test.js asserts non-empty on
// deliberately broken copies, proving each check can go red.
const h = require("./helpers");

async function openExample(browser, html, extra = {}) {
  const tmp = h.tmpDir();
  const proj = h.layoutExample(tmp);
  const s = await h.openPage(browser, { html, tree: h.readTree(proj), ...extra });
  await h.openBoardViaUi(s.page);
  return { ...s, tmp, proj };
}

async function checkNoNetwork(browser, html) {
  const problems = [];
  for (const scheme of ["light", "dark"]) {
    const { ctx, page, log } = await openExample(browser, html, { colorScheme: scheme });
    await page.fill("#q", "schema");
    await page.click("#gear");
    await page.selectOption("#sLang", "pl");
    await page.waitForTimeout(150);
    for (const u of log.requests) if (!/^(file|data|blob):/.test(u)) problems.push(`${scheme}: non-local request ${u}`);
    await ctx.close();
  }
  return problems;
}

async function checkSmoke(browser, html) {
  const problems = [];
  const { ctx, page, log } = await openExample(browser, html);
  await page.click("#tree .fname >> nth=0");
  await page.fill("#q", "schema");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.click("#gear");
  await page.selectOption("#sLang", "pl");
  await page.selectOption("#sLang", "en");
  await page.click("#sClose");
  await page.hover("#feed article.msg >> nth=0");
  await page.click("#feed article.msg >> nth=0 >> [data-reply]", { force: true });
  // Handlers must actually be attached (the prototype's startup-order bug silently disabled them).
  if (!(await page.isVisible("#replying"))) problems.push("reply handler not attached (reply bar not shown)");
  await page.click("#replyClear");
  if (await page.isVisible("#replying")) problems.push("cancel-reply handler not attached");
  await page.waitForTimeout(100);
  for (const e of log.pageErrors) problems.push("pageerror: " + e);
  for (const e of log.consoleErrors) problems.push("console error: " + e);
  await ctx.close();
  return problems;
}

async function checkWriteGuard(browser, html) {
  const problems = [];
  const { ctx, page, tmp } = await openExample(browser, html);
  const before = await page.evaluate(() => window.__fakefs.dump());
  const bad = ["../evil.txt", "config.json", "participants.json", "CONVENTION.md", "rooms/../../evil.txt",
    "rooms/architecture/../../../evil.txt", "rooms/general/sub/deep.txt", "/etc/evil.txt", "evil.txt", "pokoje/room/x.txt",
    "rooms/architecture/notes.json", "rooms/architecture/.hidden.txt", "other/room/x.txt", "rooms\\architecture\\x.txt"];
  for (const rel of bad) {
    const r = await page.evaluate(async p => { try { await window.__boardTest.writeNewFile(p, "x"); return "WROTE"; } catch (e) { return "refused:" + e.name; } }, rel);
    if (r === "WROTE") problems.push("write outside rooms/direct accepted: " + rel);
  }
  const after = await page.evaluate(() => window.__fakefs.dump());
  const key = f => f.path + "\u0000" + f.text;
  const added = after.map(key).filter(k => !before.map(key).includes(k));
  if (added.length) problems.push("file system changed by refused writes: " + added.map(a => a.split("\u0000")[0]).join(", "));
  // positive control: a well-formed new message path is accepted (the guard is not a blanket refusal)
  const ok = await page.evaluate(async () => { try { await window.__boardTest.writeNewFile("rooms/architecture/2026-10-15_0900_research-agent-01_T001_control.txt", "x"); return true; } catch (e) { return false; } });
  if (!ok) problems.push("positive control failed: valid new message path refused");
  await ctx.close();
  return problems;
}

async function checkNoOverwrite(browser, html) {
  const problems = [];
  const { ctx, page } = await openExample(browser, html);
  const rel = "rooms/architecture/2026-09-26_0900_research-agent-01_T001_propose-message-schema.txt";
  const base = ".agent-board/" + rel;
  const orig = await page.evaluate(p => window.__fakefs.read(p), base);
  const r = await page.evaluate(async p => { try { await window.__boardTest.writeNewFile(p, "OVERWRITTEN"); return "WROTE"; } catch (e) { return "refused:" + e.name; } }, rel);
  const now = await page.evaluate(p => window.__fakefs.read(p), base);
  if (r === "WROTE") problems.push("overwrite of an existing message was accepted");
  if (now !== orig) problems.push("existing message content changed");
  await ctx.close();
  return problems;
}

async function checkAgentConfirmation(browser, html) {
  const problems = [];
  // core: composing as an agent without confirmation must throw
  const a = await openExample(browser, html, { dialog: "dismiss" });
  const core = await a.page.evaluate(() => {
    try { window.__boardTest.composeMessage({ sender: "research-agent-01", to: "all", scope: "room", room: "architecture", tid: "T001",
      threadLabel: "T001-message-schema", slug: "hello", status: "INFO", body: "hi", at: "2026-10-15 09:00" }); return "COMPOSED"; }
    catch (e) { return e.key || ("unexpected:" + e.name); } });
  if (core !== "e_agent_unconfirmed") problems.push("agent sender not refused by the confirmation guard: " + core);
  // UI: choosing an agent and posting must raise a confirmation; dismissing must not write
  await a.page.selectOption("#me", "research-agent-01");
  await a.page.fill("#cBody", "agent post attempt");
  const before = (await a.page.evaluate(() => window.__fakefs.dump())).length;
  await a.page.click("#send");
  await a.page.waitForTimeout(250);
  if (!a.log.dialogs.length) problems.push("no confirmation dialog shown for agent sender");
  const after = (await a.page.evaluate(() => window.__fakefs.dump())).length;
  if (after !== before) problems.push("file written although confirmation was dismissed");
  await a.ctx.close();
  return problems;
}

async function checkRegisteredSender(browser, html) {
  const problems = [];
  const { ctx, page } = await openExample(browser, html);
  const r = await page.evaluate(() => {
    try { window.__boardTest.composeMessage({ sender: "ghost-writer", to: "all", scope: "room", room: "architecture", tid: "T001",
      threadLabel: "T001-message-schema", slug: "hello", status: "INFO", body: "hi", at: "2026-10-15 09:00", confirmedAgent: true }); return "COMPOSED"; }
    catch (e) { return e.key || ("unexpected:" + e.name); } });
  if (r !== "e_unregistered") problems.push("unregistered sender not refused by the registry guard: " + r);
  await ctx.close();
  return problems;
}

async function checkKeyDiff(browser, html) {
  const problems = [];
  const { ctx, page } = await openExample(browser, html);
  const { en, pl } = await page.evaluate(() => ({ en: Object.keys(window.__boardTest.STRINGS.en), pl: Object.keys(window.__boardTest.STRINGS.pl) }));
  for (const k of en) if (!pl.includes(k)) problems.push("missing in pl: " + k);
  for (const k of pl) if (!en.includes(k)) problems.push("missing in en: " + k);
  await ctx.close();
  return problems;
}

async function checkSchedulePause(browser, html) {
  const problems = [];
  // Wednesday 2026-10-14 10:00 UTC = 12:00 Europe/Warsaw; schedule is weekend only => must pause
  const { ctx, page } = await openExample(browser, html, { clock: new Date("2026-10-14T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-14T10:00:05Z"));
  await page.click("#gear");
  await page.click("[data-dpre='67']");
  await page.waitForTimeout(100);
  const txt = await page.textContent("#rstat");
  if (!/paused/i.test(txt)) problems.push("not paused outside schedule: " + txt);
  const n0 = await page.evaluate(() => window.__boardTest.stats.autoRefreshes);
  await page.clock.runFor(130000);
  const n1 = await page.evaluate(() => window.__boardTest.stats.autoRefreshes);
  if (n1 !== n0) problems.push("refreshed outside schedule");
  await ctx.close();
  return problems;
}

module.exports = { openExample, checkNoNetwork, checkSmoke, checkWriteGuard, checkNoOverwrite, checkAgentConfirmation,
  checkRegisteredSender, checkKeyDiff, checkSchedulePause };
