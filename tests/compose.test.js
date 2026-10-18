"use strict";
// AC4: a message posted through the viewer passes `boardctl validate`; matches `boardctl post` byte for byte.
// Method: the viewer runs in headless Chromium against an in-memory File System Access substitute
// (tests/lib/helpers.js); its real write path executes, then the written tree is dumped to disk and validated.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

const AT = new Date("2026-10-15T10:30:00Z");   // 12:30 Europe/Warsaw (board time_zone)
async function boot(extra = {}) {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const s = await h.openPage(browser, { tree: h.readTree(proj), clock: AT, ...extra });
  await s.page.clock.pauseAt(new Date("2026-10-15T10:30:05Z"));
  await h.openBoardViaUi(s.page);
  return { ...s, tmp, proj };
}
function validate(dir) { return h.boardctl(["validate", "--path", dir]); }

test("baseline: the laid-out example passes boardctl validate", () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const r = validate(proj);
  assert.equal(r.code, 0, r.err);
});

test("AC4: new-thread room post matches boardctl byte for byte with precise posting timestamp and validates", async () => {
  const { ctx, page, tmp } = await boot();
  await page.selectOption("#me", "human-owner-01");
  await page.selectOption("#cWhere", "room:architecture");
  await page.selectOption("#cThread", "");
  await page.fill("#cNewThread", "Check new thing");
  await page.selectOption("#cTo", "research-agent-01");
  await page.selectOption("#cStatus", "QUESTION");
  await page.fill("#cBody", "Check new thing\nSecond line of the body.");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /T004_check-new-thing\.txt$/.test(f.path)));
  const out = h.path.join(tmp, "viewer"); h.fs.mkdirSync(out);
  const files = await h.dumpFakeFs(page, out);
  const msg = files.find(f => /T004_check-new-thing\.txt$/.test(f.path));
  assert.equal(msg.path, ".agent-board/rooms/architecture/2026-10-15_1230_human-owner-01_T004_check-new-thing.txt");
  const v = validate(out); assert.equal(v.code, 0, v.err);
  // reference: the same post made by boardctl on a pristine copy
  const ref = h.path.join(tmp, "ref"); h.copyDir(h.path.join(tmp, "proj"), ref);
  const p = h.boardctl(["post", "--path", ref, "--from", "human-owner-01", "--to", "research-agent-01", "--scope", "room", "--room", "architecture",
    "--thread", "T004", "--slug", "check-new-thing", "--status", "QUESTION", "--body", "Check new thing\nSecond line of the body.",
    "--at", "2026-10-15 12:30:05.000", "--runtime", "agent-file-board-ui 2.4.2"]);
  assert.equal(p.code, 0, p.err);
  const refText = h.fs.readFileSync(h.path.join(ref, ".agent-board/rooms/architecture/2026-10-15_1230_human-owner-01_T004_check-new-thing.txt"), "utf8");
  assert.equal(msg.text, refText);
  await ctx.close();
});

test("AC4: reply in an existing thread keeps THREAD, sets REPLY-TO, validates; cancel clears it", async () => {
  const { ctx, page, tmp } = await boot();
  await page.selectOption("#me", "human-owner-01");
  const target = "2026-09-26_0940_implementation-agent-01_T001_schema-written.txt";
  await page.hover(`article.msg[data-file='${target}']`);
  await page.click(`article.msg[data-file='${target}'] [data-reply]`);
  assert.equal(await page.inputValue("#cBody"), "@implementation-agent-01 ");
  assert.equal(await page.inputValue("#cTo"), "implementation-agent-01");
  await page.click("#replyClear");
  assert.equal(await page.inputValue("#cBody"), "");
  assert.equal(await page.inputValue("#cTo"), "all");
  assert.equal(await page.isVisible("#replying"), false);
  await page.hover(`article.msg[data-file='${target}']`);
  await page.click(`article.msg[data-file='${target}'] [data-reply]`);
  await page.fill("#cBody", "@implementation-agent-01 Looks good, thanks.");
  await page.selectOption("#cStatus", "REPLY");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /human-owner-01_T001_/.test(f.path)));
  const out = h.path.join(tmp, "viewer"); h.fs.mkdirSync(out);
  const files = await h.dumpFakeFs(page, out);
  const msg = files.find(f => /human-owner-01_T001_/.test(f.path));
  assert.match(msg.text, /^FROM: human-owner-01\nTO: implementation-agent-01\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T001-message-schema\nDATE: 2026-10-15 12:30\nLANGUAGE: pl\nREPLY-TO: 2026-09-26_0940_implementation-agent-01_T001_schema-written\.txt\nRUNTIME: agent-file-board-ui 2\.4\.2\nSTATUS: REPLY\nPOSTED-AT: 2026-10-15T10:30:05\.000Z\n---\n/);
  const v = validate(out); assert.equal(v.code, 0, v.err);
  await ctx.close();
});

test("AC4: direct conversation post lands in direct/<a>--<b>/ and validates", async () => {
  const { ctx, page, tmp } = await boot();
  await page.selectOption("#me", "human-owner-01");
  await page.selectOption("#cWhere", "newdirect");
  await page.selectOption("#cTo", "research-agent-01");
  await page.fill("#cNewThread", "private check");
  await page.fill("#cBody", "Private question for the researcher.");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /^\.agent-board\/direct\/human-owner-01--research-agent-01\//.test(f.path)));
  const out = h.path.join(tmp, "viewer"); h.fs.mkdirSync(out);
  const files = await h.dumpFakeFs(page, out);
  const msg = files.find(f => /direct\/human-owner-01--research-agent-01\//.test(f.path));
  assert.match(msg.text, /SCOPE: DIRECT\nDIRECT-PARTICIPANTS: human-owner-01, research-agent-01\nTHREAD: T004-private-check\n/);
  const v = validate(out); assert.equal(v.code, 0, v.err);
  await ctx.close();
});

test("AC4: agent sender requires confirmation; accepted post validates and is marked as manual", async () => {
  const { ctx, page, log, tmp } = await boot({ dialog: "accept" });
  await page.selectOption("#me", "research-agent-01");
  assert.match(await page.textContent("#cInfo"), /agent is selected/i);
  await page.selectOption("#cWhere", "room:architecture");
  await page.fill("#cBody", "Relayed by hand.");
  await page.click("#send");
  await page.waitForFunction(() => window.__fakefs.dump().some(f => /research-agent-01_T001_relayed-by-hand/.test(f.path)));
  assert.equal(log.dialogs.length, 1);
  assert.match(log.dialogs[0].message, /research-agent-01.*agent/);
  const out = h.path.join(tmp, "viewer"); h.fs.mkdirSync(out);
  const files = await h.dumpFakeFs(page, out);
  assert.match(files.find(f => /relayed-by-hand/.test(f.path)).text, /RUNTIME: agent-file-board-ui 2\.4\.2 \(manual post, sender is an agent\)/);
  const v = validate(out); assert.equal(v.code, 0, v.err);
  await ctx.close();
});

test("AC4: unregistered sender is refused in the UI (empty registry) and nothing is written", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  h.fs.writeFileSync(h.path.join(proj, ".agent-board", "participants.json"), JSON.stringify({ version: 1, participants: [] }));
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(proj) });
  await h.openBoardViaUi(page);
  const before = (await page.evaluate(() => window.__fakefs.dump())).length;
  await page.fill("#cBody", "I am nobody");
  await page.click("#send");
  await page.waitForSelector(".toast.show");
  assert.match(await page.textContent("#toast"), /not in participants\.json/);
  assert.equal((await page.evaluate(() => window.__fakefs.dump())).length, before);
  await ctx.close();
});

test("AC4/R9: read-only upload mode downloads a file that validates once placed", async () => {
  const tmp = h.tmpDir(); const proj = h.layoutExample(tmp);
  const { ctx, page } = await h.openPage(browser, { clock: AT });
  await page.clock.pauseAt(new Date("2026-10-15T10:30:05Z"));
  await page.setInputFiles("#fallback", proj);
  await page.waitForSelector("#feed article.msg");
  assert.match(await page.textContent("#cInfo"), /Read-only mode/);
  await page.selectOption("#cWhere", "room:product");
  await page.fill("#cBody", "Odpowiedź z trybu tylko do odczytu");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#send")]);
  const name = dl.suggestedFilename();
  assert.match(name, /^2026-10-15_1230_human-owner-01_T003_/);
  const dest = h.path.join(proj, ".agent-board", "rooms", "product", name);
  await dl.saveAs(dest);
  const v = validate(proj); assert.equal(v.code, 0, v.err);
  await ctx.close();
});

test("AC4: a message that would collide gets a numeric slug suffix and is never overwritten", async () => {
  const { ctx, page } = await boot();
  const r = await page.evaluate(async () => {
    const T = window.__boardTest, o = { sender: "human-owner-01", to: "all", scope: "room", room: "architecture", tid: "T001",
      threadLabel: "T001-message-schema", slug: "same", status: "INFO", body: "x", at: "2026-10-15 12:30" };
    const a = T.composeMessage(o); await T.writeNewFile(a.relPath, a.text);
    // simulate refresh so the model knows the file
    const files = window.__fakefs.dump().map(f => ({ path: f.path.replace(/^\.agent-board\//, ""), text: f.text }));
    T.loadFiles(files, []);
    const b = T.composeMessage(o);
    return [a.relPath, b.relPath];
  });
  assert.notEqual(r[0], r[1]);
  assert.match(r[1], /_T001_same-2\.txt$/);
  await ctx.close();
});
