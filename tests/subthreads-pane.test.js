"use strict";
// SPEC-002-078: the sub-thread pane. Layouts (wide column, medium overlay, compact full screen), resize
// persistence, Esc/Back focus return, reading position, two composers with independent drafts across refresh and
// reload, signed send from the pane, also-send, resolve/reopen, promote (bytes compared with canonical
// `boardctl promote` and validated), follow/mute alerts, paging and collapse of a 120-message sub-thread, and one
// rendering of every interactive body. Owner policy: no VoiceOver checks; these are DOM text/hierarchy, geometry,
// storage and file-byte checks.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { expect } = require("playwright/test");
const h = require("./lib/helpers");
const X = require("./lib/subthread-fixture");
const native = require("./lib/signing-browser");
const { F } = X;

let browser, server, url;
before(async () => {
  browser = await h.launch();
  server = http.createServer((req, res) => { if (req.url !== "/board.html") { res.writeHead(404).end(); return; } res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(h.fs.readFileSync(h.BOARD_HTML)); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}/board.html`;
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

const AT = new Date("2026-10-15T13:05:00Z");
async function boot({ extra = {}, viewport = { width: 1280, height: 800 }, me = "human-owner-01", view = X.VIEW } = {}) {
  const { proj } = X.subthreadBoard({ extra });
  const s = await h.openPage(browser, { tree: h.readTree(proj), fixedTime: AT, dialog: "accept", viewport: viewport.width < 821 ? { width: 1280, height: 800 } : viewport });
  const errors = []; s.page.on("pageerror", e => errors.push(e.message));
  await h.openBoardViaUi(s.page);
  await s.page.selectOption("#me", me);
  // Rooms are a drawer on a phone: open the topic at the default width, then take the test's viewport.
  if (view) await h.openView(s.page, view);
  if (viewport.width < 821) await s.page.setViewportSize(viewport);
  return { ...s, proj, errors, cleanup: () => { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); assert.deepEqual(errors, [], "no page errors"); } };
}
const feedFiles = page => page.$$eval("#feed article.msg", els => els.map(e => e.dataset.file));
const paneFiles = page => page.$$eval("#subFeed article.msg", els => els.map(e => e.dataset.file));
const written = (page, text) => page.evaluate(text => window.__fakefs.dump().find(f => f.text.includes(text))?.text || null, text);
const header = (text, key) => (text.match(new RegExp("^" + key + ": (.*)$", "m")) || [])[1];
const addFile = (page, name, text) => page.evaluate(([name, text]) => window.__fakefs.addFile(`.agent-board/rooms/planning/${name}`, text), [name, text]);
async function refresh(page) {
  const n = await page.evaluate(() => window.__boardTest.stats.builds);
  await page.evaluate(() => readFromHandle(true));
  await page.waitForFunction(n => window.__boardTest.stats.builds > n, n);
}
const strip = (page, root = F.root) => page.locator(`#feed article[data-file="${root}"] .sub-strip`);
async function openPane(page, root = F.root) { await strip(page, root).click(); await expect(page.locator("#subPane")).toBeVisible(); }
const box = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; });
// The pane's own composer and the document stay inside the viewport (the SPEC-002-068 rule, for the pane).
async function paneFits(page) {
  return page.evaluate(() => {
    const out = [], W = innerWidth, H = innerHeight;
    for (const s of ["#subPane", "#subBody", "#subSend", "#subClose", "#subPaneTitle"]) { const r = document.querySelector(s).getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) out.push(s + " not rendered"); else if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) out.push(`${s} outside ${W}x${H}`); }
    const doc = document.documentElement; if (doc.scrollWidth > W) out.push("document scrollWidth " + doc.scrollWidth); if (doc.scrollHeight > H) out.push("document scrollHeight " + doc.scrollHeight);
    return out;
  });
}
const member = (file, o) => X.message({ from: "research-agent-01", date: "13:02", reply: F.root, extra: [`SUBTHREAD: ${F.root}`], ...o });

test("AC2 wide: a 4th column beside the main feed; both composers visible with distinct destinations", async () => {
  const s = await boot();
  try {
    const before = await box(s.page, "#feed");
    await openPane(s.page);
    assert.equal(await s.page.evaluate(() => document.body.dataset.subMode), "wide");
    const pane = await box(s.page, "#subPane"), feed = await box(s.page, "#feed");
    assert.equal(pane.w, 420, "default width");
    assert.ok(feed.r <= pane.x + 1, "the pane is a column to the right of the feed, not over it");
    assert.equal(pane.r, 1280); assert.ok(feed.w < before.w, "the feed column gave the pane its width");
    assert.equal(await s.page.evaluate(() => getComputedStyle(document.querySelector("#subPane")).position), "relative");
    // Both composers: the main one names the topic, the pane one the sub-thread, in the thread accent.
    await expect(s.page.locator("#cBody")).toBeVisible(); await expect(s.page.locator("#subBody")).toBeVisible();
    await expect(s.page.locator("#composerTargetRow")).toBeVisible();
    await expect(s.page.locator("#composerTarget")).toContainText("# planning › T009 Planning");
    await expect(s.page.locator("#subTarget")).toHaveText("Posting to 🧵 sub-thread of human-owner-01: Which database should the planning service use?");
    const colors = await s.page.evaluate(() => [getComputedStyle(document.querySelector("#composerTarget")).color, getComputedStyle(document.querySelector("#subTarget")).color]);
    assert.notEqual(colors[0], colors[1], "the two destinations look different");
    assert.deepEqual(await paneFits(s.page), []);
    assert.deepEqual(await h.layoutViolations(s.page), []);
    assert.equal(await s.page.evaluate(() => [document.querySelector(".feed-wrap").inert, document.querySelector("#composer").inert].join()), "false,false");
    // Closing gives the column back.
    await s.page.click("#subClose");
    assert.deepEqual((await box(s.page, "#feed")).w, before.w);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC2 medium: an overlay sheet over the transcript; only the pane composer is reachable", async () => {
  const s = await boot({ viewport: { width: 1000, height: 700 } });
  try {
    const before = await box(s.page, "#feed");
    await openPane(s.page);
    assert.equal(await s.page.evaluate(() => document.body.dataset.subMode), "medium");
    const pane = await box(s.page, "#subPane");
    assert.equal(await s.page.evaluate(() => getComputedStyle(document.querySelector("#subPane")).position), "fixed");
    assert.deepEqual(await box(s.page, "#feed"), before, "the transcript keeps its size under the sheet");
    assert.equal(pane.r, 1000); assert.equal(pane.w, 420); assert.ok(pane.x > before.x, "the sheet covers the right part of the transcript");
    assert.equal(await s.page.evaluate(() => [getComputedStyle(document.querySelector("#composer")).visibility, document.querySelector("#composer").inert].join()), "hidden,true");
    await expect(s.page.locator("#subBody")).toBeVisible();
    assert.deepEqual(await paneFits(s.page), []);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC2/AC3 compact: full screen with Back; Back and Esc close it, keep the draft and return focus to the strip", async () => {
  const s = await boot({ viewport: { width: 390, height: 640 } });
  try {
    await openPane(s.page);
    assert.equal(await s.page.evaluate(() => document.body.dataset.subMode), "compact");
    const pane = await box(s.page, "#subPane"), top = await s.page.evaluate(() => Math.round(document.querySelector(".top").getBoundingClientRect().bottom));
    assert.deepEqual([pane.x, pane.w, pane.b], [0, 390, 640]); assert.ok(Math.abs(pane.y - top) <= 1, "below the top bar");
    await expect(s.page.locator("#subBack")).toBeVisible();
    assert.equal(await s.page.evaluate(() => document.querySelector(".feed-wrap").inert), true, "the covered main view is out of the tab order");
    assert.equal(await s.page.evaluate(() => document.activeElement.id), "subPaneTitle", "opening moves focus to the pane header");
    assert.deepEqual(await paneFits(s.page), []);
    await s.page.fill("#subBody", "Compact draft");
    await s.page.click("#subBack");
    await expect(s.page.locator("#subPane")).toBeHidden();
    assert.equal(await s.page.evaluate(() => document.querySelector(".feed-wrap").inert), false);
    assert.equal(await s.page.evaluate(f => document.activeElement === document.querySelector(`#feed article[data-file="${f}"] .sub-strip`), F.root), true, "focus returns to the strip");
    await openPane(s.page);
    await expect(s.page.locator("#subBody")).toHaveValue("Compact draft");
    await s.page.locator("#subFeed").click({ position: { x: 5, y: 5 } });
    await s.page.keyboard.press("Escape");
    await expect(s.page.locator("#subPane")).toBeHidden();
    assert.equal(await s.page.evaluate(f => document.activeElement === document.querySelector(`#feed article[data-file="${f}"] .sub-strip`), F.root), true);
    await openPane(s.page);
    await expect(s.page.locator("#subBody")).toHaveValue("Compact draft", { message: "Esc keeps the draft" });
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC2 opening and closing never shifts the main feed's reading position", async () => {
  const filler = Object.fromEntries(Array.from({ length: 12 }, (_, i) => { const n = String(10 + i);
    return [X.file("11" + n, "human-owner-01", "T009", "earlier-" + n), X.message({ from: "human-owner-01", date: "11:" + n, body: "Earlier main message " + n + "\n\nwith a second paragraph that wraps differently when the column narrows. ".repeat(3) })]; }));
  const s = await boot({ extra: filler, viewport: { width: 1280, height: 700 } });
  try {
    const anchor = () => s.page.evaluate(() => { const feed = document.querySelector("#feed"), top = feed.getBoundingClientRect().top;
      const el = [...feed.querySelectorAll("article.msg")].find(e => e.getBoundingClientRect().bottom > top + 1); return { id: el.id, offset: Math.round(el.getBoundingClientRect().top - top) }; });
    await s.page.evaluate(() => { const feed = document.querySelector("#feed"); feed.scrollTop = Math.round(feed.scrollHeight / 3); });
    const before = await anchor();
    await s.page.evaluate(f => openSubthread("room:planning|" + f), F.root);
    await expect(s.page.locator("#subPane")).toBeVisible();
    const open = await anchor();
    assert.equal(open.id, before.id); assert.ok(Math.abs(open.offset - before.offset) <= 2, `offset ${before.offset} -> ${open.offset}`);
    await s.page.click("#subClose");
    const closed = await anchor();
    assert.equal(closed.id, before.id); assert.ok(Math.abs(closed.offset - before.offset) <= 2, `offset ${before.offset} -> ${closed.offset}`);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC2 the pane width resizes from its handle (keys, pointer, Home) and is remembered across reload", async () => {
  const s = await boot();
  try {
    await openPane(s.page);
    await s.page.focus("#subResize");
    await s.page.keyboard.press("ArrowLeft"); await s.page.keyboard.press("ArrowLeft");
    assert.equal((await box(s.page, "#subPane")).w, 460);
    const handle = await box(s.page, "#subResize");
    await s.page.mouse.move(handle.x + 4, 300); await s.page.mouse.down(); await s.page.mouse.move(handle.x - 36, 300); await s.page.mouse.up();
    assert.equal((await box(s.page, "#subPane")).w, 500);
    assert.equal(await s.page.evaluate(() => S.subW), 500);
    assert.equal(await s.page.locator("#subResize").getAttribute("aria-valuenow"), "500");
    await h.reloadSettled(s.ctx, s.page, { setting: ["subW", 500] });
    await s.page.waitForSelector("#feed article");
    await expect(s.page.locator("#subPane")).toBeVisible();
    assert.equal((await box(s.page, "#subPane")).w, 500, "the reopened pane keeps the width");
    await s.page.focus("#subResize"); await s.page.keyboard.press("Home");
    assert.equal((await box(s.page, "#subPane")).w, 420);
    // The bounds keep the conversation readable: at most 60% of the conversation area.
    await s.page.evaluate(() => { S.subW = 5000; applySubWidth(); });
    const area = await s.page.evaluate(() => document.querySelector(".feed-wrap").getBoundingClientRect().width + document.querySelector("#subPane").getBoundingClientRect().width);
    assert.ok((await box(s.page, "#subPane")).w <= Math.floor(area * 0.6) + 1);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 two composers keep independent drafts across refresh and reload; neither moves into the other", async () => {
  const s = await boot();
  try {
    await s.page.fill("#cBody", "Main composer draft");
    await openPane(s.page);
    await s.page.fill("#subBody", "Pane composer draft");
    await s.page.check("#subAlso");
    await addFile(s.page, X.file("1303", "research-agent-01", "T009", "late"), member("", { date: "13:03", body: "Arrives while both drafts wait" }));
    await refresh(s.page);
    await expect(s.page.locator("#cBody")).toHaveValue("Main composer draft");
    await expect(s.page.locator("#subBody")).toHaveValue("Pane composer draft");
    await expect(s.page.locator("#subAlso")).toBeChecked();
    // Another sub-thread has its own (empty) draft; coming back restores this one.
    await s.page.click("#subClose"); await openPane(s.page, F.root2);
    await expect(s.page.locator("#subBody")).toHaveValue("");
    await s.page.click("#subClose"); await openPane(s.page);
    await expect(s.page.locator("#subBody")).toHaveValue("Pane composer draft");
    // Reload: the pane draft is stored per board + room + topic + root and comes back with the pane.
    const store = await s.page.evaluate(() => "subthread-drafts-v1:" + boardStorageId);
    await expect.poll(() => s.page.evaluate(async k => Object.values(await idbGet(k) || {}).map(d => d.body), store)).toEqual(["Pane composer draft"]);
    const key = JSON.parse(Object.keys(await s.page.evaluate(async k => await idbGet(k), store))[0]);
    assert.deepEqual(key.slice(1), ["room:planning", X.VIEW, F.root]);
    await s.page.fill("#cBody", "");
    await h.reloadSettled(s.ctx, s.page, { setting: ["lastSub", F.root] });
    await s.page.waitForSelector("#feed article");
    await expect(s.page.locator("#subPane")).toBeVisible();
    await expect(s.page.locator("#subBody")).toHaveValue("Pane composer draft");
    await expect(s.page.locator("#subAlso")).toBeChecked();
    await expect(s.page.locator("#cBody")).toHaveValue("", { message: "the pane draft never appears in the main composer" });
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 also-send writes SUBTHREAD-ALSO: main and appears in the main flow as a stub; a reply sets REPLY-TO", async () => {
  const s = await boot();
  try {
    await openPane(s.page);
    await s.page.locator(`#subFeed article[data-file="${F.first}"]`).hover();
    await s.page.locator(`#subFeed article[data-file="${F.first}"] [data-reply]`).click();
    await expect(s.page.locator("#subReplyName")).toContainText("research-agent-01");
    // A reader following the main flow's live edge sees new main-flow entries (the existing window rule).
    await s.page.evaluate(() => { const f = document.querySelector("#feed"); f.scrollTop = f.scrollHeight; });
    await s.page.fill("#subBody", "Decision: Postgres, also for the topic");
    await s.page.check("#subAlso");
    await s.page.click("#subSend");
    await expect.poll(() => written(s.page, "Decision: Postgres")).not.toBeNull();
    const text = await written(s.page, "Decision: Postgres");
    assert.equal(header(text, "SUBTHREAD"), F.root); assert.equal(header(text, "SUBTHREAD-ALSO"), "main"); assert.equal(header(text, "REPLY-TO"), F.first);
    assert.equal(header(text, "TO"), "research-agent-01");
    const file = await s.page.evaluate(() => B.msgs.find(m => m.body.startsWith("Decision: Postgres")).file);
    await s.page.click("#subClose");
    const stub = s.page.locator(`#feed article[data-file="${file}"]`);
    await expect(stub).toHaveClass(/sub-stub/);
    await expect(stub.locator(".sub-chip")).toHaveText("🧵 Also in a sub-thread");
    await expect(s.page.locator("#subAlso")).not.toBeChecked();
    // Posting followed the sub-thread (AC8).
    assert.equal(await s.page.evaluate(f => subFollowState(subFollowKey("room:planning|T009", f)), F.root), "following");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC6 Resolve asks for an outcome and posts SUBTHREAD-STATE: resolved with DONE; Reopen posts open; posting stays allowed", async () => {
  const s = await boot();
  try {
    await openPane(s.page);
    await s.page.click("#subPaneMenuToggle"); await s.page.click("#subResolve");
    await expect(s.page.locator("#subAsk")).toBeVisible();
    await expect(s.page.locator("#subAskLabel")).toHaveText("Outcome (one line)");
    await s.page.fill("#subAskInput", "Postgres, decided on benchmark");
    await s.page.click("#subAskOk");
    await expect.poll(() => written(s.page, "Postgres, decided on benchmark")).not.toBeNull();
    const text = await written(s.page, "Postgres, decided on benchmark");
    assert.equal(header(text, "SUBTHREAD-STATE"), "resolved"); assert.equal(header(text, "STATUS"), "DONE"); assert.equal(header(text, "SUBTHREAD"), F.root);
    assert.equal(text.includes("STATUS: CLOSED"), false);
    await expect(s.page.locator("#subAsk")).toBeHidden();
    await expect(s.page.locator("#subBanner")).toHaveText("Resolved: Postgres, decided on benchmark. Posting stays allowed.");
    await expect(strip(s.page)).toContainText("Resolved");
    await s.page.click("#subMenuToggle");
    await expect(s.page.locator("#subMenuPanel h4").first()).toHaveText("Resolved sub-threads");
    await s.page.keyboard.press("Escape");
    // Posting into a resolved sub-thread is allowed.
    await s.page.fill("#subBody", "One more note after resolving");
    await s.page.click("#subSend");
    await expect.poll(() => written(s.page, "One more note after resolving")).not.toBeNull();
    await s.page.click("#subPaneMenuToggle");
    await expect(s.page.locator("#subResolve")).toBeHidden();
    await s.page.click("#subReopen");
    await expect.poll(() => written(s.page, "Reopened this sub-thread.")).not.toBeNull();
    assert.equal(header(await written(s.page, "Reopened this sub-thread."), "SUBTHREAD-STATE"), "open");
    await expect(s.page.locator("#subBanner")).toBeHidden();
    await expect(strip(s.page)).not.toContainText("Resolved");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC7 Promote writes the same bytes as boardctl promote, validates canonically and opens the new topic", async () => {
  const s = await boot();
  const twin = h.path.join(h.tmpDir("afb-promote-twin-"), "proj");
  try {
    h.copyDir(s.proj, twin);
    await openPane(s.page);
    await s.page.click("#subPaneMenuToggle"); await s.page.click("#subPromote");
    await expect(s.page.locator("#subAskLabel")).toHaveText("New topic title");
    await s.page.fill("#subAskInput", "Database choice");
    await s.page.click("#subAskOk");
    await expect.poll(() => s.page.evaluate(() => sel.thread)).toBe("room:planning|T011");
    await expect(s.page.locator("#subPane")).toBeHidden();
    const first = await s.page.evaluate(() => B.msgs.find(m => m.tid === "T011")), resolution = await s.page.evaluate(() => B.msgs.find(m => m.file.includes("promoted-to-t011")));
    assert.ok(first && resolution, "both posts are on the board");
    // The new topic's first message links back.
    const back = s.page.locator(`#feed article[data-file="${first.file}"] .sub-promoted`);
    await expect(back).toHaveText("🧵 Continued from a sub-thread ›");
    // Canonical twin: the same promote with the same clock and sender.
    const at = first.h.DATE.replace(" ", "T");
    const r = h.boardctl(["promote", "--path", twin, "--root", F.root, "--room", "planning", "--from", "human-owner-01", "--title", "Database choice", "--at", at]);
    assert.equal(r.code, 0, r.err);
    const out = JSON.parse(r.out), dir = h.path.join(twin, ".agent-board", "rooms", "planning");
    const strip_ = t => t.replace(/^POSTED-AT: .*\n/m, "").replace(/^RUNTIME: .*\n/m, "");
    for (const [ours, theirs] of [[first, out.first_message], [resolution, out.resolution_message]]) {
      const canonicalText = h.fs.readFileSync(h.path.join(dir, h.path.basename(theirs)), "utf8"), viewerText = await written(s.page, ours.body.slice(0, 40));
      assert.equal(h.path.basename(theirs), ours.file, "same file name");
      assert.equal(strip_(viewerText), strip_(canonicalText), "same bytes apart from POSTED-AT and RUNTIME");
    }
    assert.equal(header(await written(s.page, "Continues the sub-thread of"), "PROMOTED-FROM"), F.root);
    // The viewer's board validates with the canonical CLI.
    const outDir = h.path.join(h.tmpDir("afb-promote-out-"), "board");
    await h.dumpFakeFs(s.page, outDir);
    const v = h.boardctl(["validate", "--path", outDir, "--json"]);
    const report = JSON.parse(v.out);
    assert.deepEqual(report.errors, [], v.out);
    h.fs.rmSync(h.path.dirname(outDir), { recursive: true, force: true });
    // The jump link opens the original sub-thread, now resolved.
    await back.click();
    await expect(s.page.locator("#subPane")).toBeVisible();
    assert.equal(await s.page.evaluate(() => sel.sub), F.root);
    await expect(s.page.locator("#subBanner")).toContainText("Resolved: Continued as T011");
  } finally { await s.ctx.close(); s.cleanup(); h.fs.rmSync(h.path.dirname(twin), { recursive: true, force: true }); }
});

test("AC7 a failed second write of Promote is reported and nothing is deleted", async () => {
  const s = await boot();
  try {
    await openPane(s.page);
    const before = await s.page.evaluate(() => window.__fakefs.dump().length);
    await s.page.evaluate(() => { const real = deliverMessage; let n = 0; window.deliverMessage = async (...a) => { if (++n === 2) throw Error("disk full"); return real(...a); }; });
    await s.page.click("#subPaneMenuToggle"); await s.page.click("#subPromote");
    await s.page.fill("#subAskInput", "Queue choice"); await s.page.click("#subAskOk");
    await expect(s.page.locator("#subAskResult")).toContainText("Topic T011 was posted (");
    await expect(s.page.locator("#subAskResult")).toContainText("but the resolving sub-thread message failed: disk full. Nothing was deleted");
    assert.equal(await s.page.evaluate(() => window.__fakefs.dump().length), before + 1, "the new topic stays; nothing is removed");
    assert.equal(await s.page.evaluate(() => sel.sub), F.root, "the pane stays open for resolving by hand");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC8 follow and mute: a muted sub-thread stays silent under a topic follow; a sub-thread follow alone alerts", async () => {
  const s = await boot();
  try {
    await openPane(s.page);
    await expect(s.page.locator("#subFollow")).toHaveText("🔔 Follow");
    await s.page.evaluate(() => changeNotificationFollow("thread", "room:planning|T009"));
    await s.page.click("#subFollow"); await expect(s.page.locator("#subFollow")).toHaveText("🔔 Following");
    await s.page.click("#subFollow"); await expect(s.page.locator("#subFollow")).toHaveText("🔕 Muted");
    const follows = () => s.page.evaluate(() => notificationState.follows.map(x => x.kind + ":" + x.key).sort());
    assert.deepEqual(await follows(), ["subthread-mute:room:planning|T009|" + F.root, "thread:room:planning|T009"]);
    const entries = () => s.page.evaluate(() => notificationState.entries.map(e => e.path.split("/").pop()));
    const muted = X.file("1310", "research-agent-01", "T009", "muted-member"), plainTopic = X.file("1311", "research-agent-01", "T009", "topic-message");
    await addFile(s.page, muted, member("", { date: "13:10", body: "Muted member" }));
    await addFile(s.page, plainTopic, X.message({ from: "research-agent-01", date: "13:11", body: "Main flow message" }));
    await refresh(s.page);
    await expect.poll(entries).toEqual([plainTopic]);
    // Unmute, drop the topic follow, follow only the sub-thread: its member alerts, the topic does not.
    await s.page.click("#subFollow"); await expect(s.page.locator("#subFollow")).toHaveText("🔔 Follow");
    await s.page.evaluate(() => changeNotificationFollow("thread", "room:planning|T009", true));
    await s.page.click("#subFollow");
    assert.deepEqual(await follows(), ["subthread:room:planning|T009|" + F.root]);
    const followed = X.file("1312", "implementation-agent-01", "T009", "followed-member"), other = X.file("1313", "research-agent-01", "T009", "other-topic-message");
    await addFile(s.page, followed, member("", { from: "implementation-agent-01", date: "13:12", body: "Followed member" }));
    await addFile(s.page, other, X.message({ from: "research-agent-01", date: "13:13", body: "Not followed" }));
    await refresh(s.page);
    await expect.poll(entries).toEqual([followed, plainTopic]);
    // The follow is stored with the other local rules (reload keeps it).
    await expect.poll(() => s.page.evaluate(async () => (await readNotificationFollows(notificationState.store) || []).map(x => x.kind))).toEqual(["subthread"]);
    // Quick reply on the member's alert opens its pane composer.
    await s.page.click("#subClose");
    await s.page.evaluate(async () => { await activateNotification(notificationState, notificationState.entries[0], true); });
    assert.equal(await s.page.evaluate(() => sel.sub), F.root);
    await expect(s.page.locator("#subReplyName")).toContainText("implementation-agent-01");
    await s.page.fill("#subBody", "Quick answer in the sub-thread");
    await s.page.click("#subSend");
    await expect.poll(() => written(s.page, "Quick answer in the sub-thread")).not.toBeNull();
    const text = await written(s.page, "Quick answer in the sub-thread");
    assert.equal(header(text, "SUBTHREAD"), F.root); assert.equal(header(text, "REPLY-TO"), followed);
    // A mute is a decision: posting does not override it.
    await s.page.click("#subFollow"); await expect(s.page.locator("#subFollow")).toHaveText("🔕 Muted");
    await s.page.fill("#subBody", "Posting while muted"); await s.page.click("#subSend");
    await expect.poll(() => written(s.page, "Posting while muted")).not.toBeNull();
    await expect(s.page.locator("#subFollow")).toHaveText("🔕 Muted");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC4 a 120-message sub-thread: newest 50 first, Older paging, collapse of routine runs, divider, N new and Latest", async () => {
  const many = {};
  for (let i = 0; i < 120; i++) {
    const hh = String(14 + Math.floor(i / 60)).padStart(2, "0"), mm = String(i % 60).padStart(2, "0");
    const question = i === 95;
    many[X.file(hh + mm, "implementation-agent-01", "T009", "step-" + i)] = X.message({ from: "implementation-agent-01", to: question ? "human-owner-01" : "all", date: `${hh}:${mm}`, reply: F.root, status: question ? "QUESTION" : "INFO", extra: [`SUBTHREAD: ${F.root}`], body: (question ? "Question for the owner at step " : "Routine progress step ") + i });
  }
  const s = await boot({ extra: many, viewport: { width: 1280, height: 800 } });
  try {
    // Read every member before step 77, so the reader's first unread is step 77 (inside the newest 50).
    await s.page.evaluate(() => {
      for (const m of B.msgs.filter(m => m.subthread)) { const n = Number((m.file.match(/step-(\d+)/) || [0, -1])[1]); if (n < 77) seen[m.path] = true; } });
    await openPane(s.page);
    await expect(s.page.locator("#subFeed .sub-history span")).toHaveText("Showing 74–123 of 123");
    // The newest 50 of 123 members (steps 70-119). The first unread (step 77) and the question to the reader
    // (step 95) stay visible and break the routine runs; the run 96-119 (24 > 20) is one stub.
    const stubs = s.page.locator("#subFeed .sub-collapse-btn");
    await expect(stubs).toHaveCount(1);
    await expect(stubs.first()).toHaveText("▸ 24 routine agent messages (implementation-agent-01) · Expand");
    const rows = await paneFiles(s.page);
    assert.equal(rows.length, 26);
    assert.ok(rows.some(f => f.includes("step-95")), "the question to the reader is visible");
    assert.ok(rows.some(f => f.includes("step-80")), "a run of 17 is not collapsed");
    assert.ok(!rows.some(f => f.includes("step-100")), "routine messages inside a long run are collapsed");
    await expect(s.page.locator("#subFeed .sub-divider")).toHaveText("New messages");
    assert.equal(await s.page.evaluate(() => { let n = document.querySelector("#subFeed .sub-divider").nextElementSibling; while (n && !n.matches("article.msg")) n = n.nextElementSibling; return n.dataset.file; }), X.file("1517", "implementation-agent-01", "T009", "step-77"));
    assert.ok(await s.page.evaluate(() => { const f = document.querySelector("#subFeed"), d = f.querySelector(".sub-divider").getBoundingClientRect(), r = f.getBoundingClientRect(); return d.top >= r.top && d.top < r.top + 40; }), "the pane opens at the divider");
    await stubs.first().click();
    await expect(stubs).toHaveCount(0);
    assert.equal((await paneFiles(s.page)).length, 50);
    // Older pages by 50; at most 150 are rendered.
    await s.page.click("#subFeed [data-sub-history=older]");
    await expect(s.page.locator("#subFeed .sub-history span")).toHaveText("Showing 24–123 of 123");
    await s.page.click("#subFeed [data-sub-history=older]");
    await expect(s.page.locator("#subFeed .sub-history")).toHaveCount(0, { message: "the whole sub-thread is in the window" });
    // N new and Latest while reading above the live edge.
    await s.page.evaluate(() => { document.querySelector("#subFeed").scrollTop = 0; });
    await expect(s.page.locator("#subLatest")).toBeVisible();
    await addFile(s.page, X.file("1600", "research-agent-01", "T009", "late-a"), member("", { date: "16:00", body: "Late a" }));
    await addFile(s.page, X.file("1601", "research-agent-01", "T009", "late-b"), member("", { date: "16:01", body: "Late b" }));
    await refresh(s.page);
    await expect(s.page.locator("#subNew")).toHaveText("2 new ↓");
    assert.equal(await s.page.evaluate(() => document.querySelector("#subFeed").scrollTop), 0, "arrivals never move the reader");
    await s.page.click("#subNew");
    await expect(s.page.locator("#subNew")).toBeHidden();
    await expect(s.page.locator("#subLatest")).toBeHidden();
    assert.ok(await s.page.evaluate(() => { const f = document.querySelector("#subFeed"); return f.scrollHeight - f.scrollTop - f.clientHeight < 80; }));
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC1 an interactive message renders once: member choices in the pane, the root's form in the main feed; ids stay unique", async () => {
  const q = X.file("1301", "research-agent-01", "T009", "host-question");
  const formRoot = X.file("1320", "implementation-agent-01", "T009", "form-root");
  const FORM = h.fs.readFileSync(h.path.join(h.VENDOR, "examples/openui-report/form-question.json"), "utf8").trim();
  const s = await boot({ extra: {
    [q]: member("", { to: "human-owner-01", date: "13:01", status: "QUESTION", extra: [`SUBTHREAD: ${F.root}`, `QUESTION: ${X.HOST_QUESTION}`], body: "Where do we host?" }),
    [formRoot]: X.message({ from: "implementation-agent-01", to: "human-owner-01", date: "13:20", status: "DECISION-NEEDED", extra: [`QUESTION: ${JSON.stringify(JSON.parse(FORM))}`], body: "Synthetic release configuration. Submit typed fields as a new reply." }),
    [X.file("1321", "research-agent-01", "T009", "form-talk")]: X.message({ from: "research-agent-01", date: "13:21", reply: formRoot, extra: [`SUBTHREAD: ${formRoot}`], body: "Discussing the form" }),
  } });
  try {
    const unique = () => s.page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map(e => e.id); return ids.filter((id, i) => ids.indexOf(id) !== i); });
    await openPane(s.page);
    assert.deepEqual(await unique(), []);
    const qPath = await s.page.evaluate(f => B.msgs.find(m => m.file === f).path, q);
    assert.equal(await s.page.locator(`.choice-form[data-question-path="${qPath}"]`).count(), 1, "the member question renders its choices once");
    assert.equal(await s.page.locator(`#subFeed .choice-form[data-question-path="${qPath}"]`).count(), 1, "in the pane");
    // A form root: the typed form is mounted once, in the main feed; the pinned root is a preview with no controls.
    await s.page.click("#subClose");
    await s.page.locator(`#feed article[data-file="${formRoot}"] .typed-form`).waitFor();
    await openPane(s.page, formRoot);
    const formPath = await s.page.evaluate(f => B.msgs.find(m => m.file === f).path, formRoot);
    assert.equal(await s.page.locator(`[data-form-path="${formPath}"]`).count(), 1);
    assert.equal(await s.page.locator(`#feed [data-form-path="${formPath}"]`).count(), 1);
    assert.equal(await s.page.locator("#subRoot :is(form,input,textarea,select,[data-form-path],[data-report-path],[data-extension-path],[data-accept-question],.choice-form)").count(), 0);
    await expect(s.page.locator("#subRoot details")).not.toHaveAttribute("open", "");
    await expect(s.page.locator("#subRoot .sub-root-note")).toHaveText("This message has a form, report or question; it is answered in the main thread.");
    assert.deepEqual(await unique(), []);
    // Show in main thread scrolls the main feed to the root, the pane stays open on wide windows.
    await s.page.click("#subRoot [data-sub-main]");
    await expect(s.page.locator("#subPane")).toBeVisible();
    // Flat view while the pane is open: the pane's members are still stubs in the main flow (one rendering).
    await s.page.evaluate(() => { S.flatView = true; build({ preserveComposer: true }); });
    const talk = X.file("1321", "research-agent-01", "T009", "form-talk");
    await expect(s.page.locator(`#feed article[data-file="${talk}"]`)).toHaveClass(/sub-stub/);
    await expect(s.page.locator(`#feed article[data-file="${F.first}"]`)).not.toHaveClass(/sub-stub/);
    assert.deepEqual(await unique(), []);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC4 compact: a REPLY-TO link to the main flow closes the pane and offers Back to sub-thread", async () => {
  const s = await boot({ viewport: { width: 390, height: 640 }, extra: {
    [X.file("1305", "research-agent-01", "T009", "points-main")]: member("", { date: "13:05", reply: F.first, body: "Builds on the first reply" }),
  } });
  try {
    // A member replying to another member jumps inside the pane.
    await openPane(s.page);
    const link = s.page.locator(`#subFeed article[data-file="${X.file("1305", "research-agent-01", "T009", "points-main")}"] .reply-ref`);
    await expect(link).toHaveAttribute("data-sub-jump", X.KEY(F.first));
    await link.click();
    await expect.poll(() => s.page.evaluate(() => document.activeElement.id)).toBe("sm-" + X.KEY(F.first));
    // The pinned root's "Show in main thread" goes to the main flow: on a phone the pane closes, a chip brings it back.
    await s.page.click("#subRoot [data-sub-main]");
    await expect(s.page.locator("#subPane")).toBeHidden();
    await expect(s.page.locator("#subReturn")).toBeVisible();
    await expect(s.page.locator("#subReturn")).toHaveText("↩ Back to sub-thread");
    await s.page.click("#subReturn");
    await expect(s.page.locator("#subPane")).toBeVisible();
    await expect(s.page.locator("#subReturn")).toBeHidden();
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 signed send from the pane: its own status row, for its own destination; the post verifies in Python", async t => {
  const f = await native.boot(t, browser, url, f => {
    const room = h.path.join(f.proj, ".agent-board", "rooms", X.ROOM); h.fs.mkdirSync(room, { recursive: true });
    for (const [name, text] of Object.entries(X.VALID)) h.fs.writeFileSync(h.path.join(room, name), text);
  });
  const { page, owner } = f;
  await page.selectOption("#me", owner.participant);
  await h.openView(page, X.VIEW);
  await openPane(page);
  const notice = page.locator("#subSigningNotice"), name = await page.evaluate(id => B.people[id].name, owner.participant);
  await expect(notice).toHaveAttribute("data-signing-status", "unsigned");
  await expect(notice.locator(".signing-notice-action")).toHaveText(`🔒 Unlock ${name}'s key to sign`);
  // The row follows the pane's destination, not the main composer's: a requirement on rooms/planning only
  // turns the pane's row into the required state while the main composer, moved to another room, stays optional.
  await page.evaluate(() => { const c = B.signingContext; c.minimumBefore = c.minimum; c.minimum = (path, thread) => path.startsWith("rooms/planning/") ? "trusted" : c.minimumBefore(path, thread);
    setComposerTarget({ scope: "room", dir: B.rooms.find(r => r !== "planning"), thread: "" }); updateSigningNotice(); });
  await expect(notice).toHaveAttribute("data-signing-status", "needs-unlock");
  await expect(page.locator("#signingNotice")).toHaveAttribute("data-signing-status", "unsigned");
  await page.evaluate(() => { const c = B.signingContext; c.minimum = c.minimumBefore; delete c.minimumBefore; updateSigningNotice(); });
  await expect(notice).toHaveAttribute("data-signing-status", "unsigned");
  // The pane row's button acts on the pane row's status: it opens the key file picker for the persona.
  const chooser = page.waitForEvent("filechooser");
  await notice.locator(".signing-notice-action").click();
  await (await chooser).setFiles(owner.key);
  await expect(notice).toHaveAttribute("data-signing-status", "signed");
  assert.equal(await page.evaluate(() => signingMode), "signed");
  await page.fill("#subBody", "Signed from the sub-thread pane");
  await page.click("#subSend");
  await expect(page.locator("#subBody")).toHaveValue("");
  await native.exportBoard(page, f.proj);
  const dir = h.path.join(f.proj, ".agent-board/rooms/planning"), file = h.fs.readdirSync(dir).find(n => n.endsWith("_signed-from-the-sub-thread-pane.txt"));
  assert.ok(file, "the pane post is on the board");
  const raw = h.fs.readFileSync(h.path.join(dir, file), "utf8");
  assert.match(raw, /^SIGNATURE: /m); assert.equal(header(raw, "SUBTHREAD"), F.root);
  f.cli("signing", "trust", "--participant", owner.participant, "--profile", owner.profile, "--fingerprint", owner.fingerprint);
  const verdict = JSON.parse(f.cli("signing", "inspect", "--message", "rooms/planning/" + file));
  assert.equal(verdict.signature, "valid"); assert.equal(verdict.eligibility, "eligible");
  assert.equal(await page.inputValue("#cSub"), "", "the main composer never took the sub-thread");
});
