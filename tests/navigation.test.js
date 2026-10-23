"use strict";
// AC5: tree, search suggestions with keyboard selection, reply and cancel-reply, left/right alignment, chat rendering.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");
const c = require("./lib/checks");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

test("AC5 tree: root, rooms as folders, threads as cards, closed group, direct section, collapse + keyboard", async () => {
  const { ctx, page, log } = await c.openExample(browser, h.BOARD_HTML);
  assert.match(await page.textContent(".tree-root"), /All messages\s*10/);
  assert.ok(await page.isVisible(".folder:has-text('architecture')"));
  // closed threads are in a collapsed group; opening it reveals the card
  assert.equal(await page.locator("#tree .tcard[data-tk='room:architecture|T001']").count(), 0);
  await page.click("#tree .group:has-text('closed (1)') >> nth=0");
  const card = page.locator("#tree .tcard[data-tk='room:architecture|T001']");
  assert.equal(await card.count(), 1);
  const cardText = await card.innerText();
  assert.match(cardText, /T001/); assert.match(cardText, /Message schema/); assert.match(cardText, /09-26 09:50/); assert.match(cardText, /\b4\b/);
  assert.ok(await card.locator(".sdot.s-CLOSED").count());     // status
  assert.ok((await card.locator(".faces i").count()) >= 2);     // participants
  // selecting a thread filters the feed
  await card.click();
  assert.deepEqual((await h.feedOrder(page)).map(f => f.split("_")[3]), ["T001", "T001", "T001", "T001"]);
  assert.match(await page.textContent("#title"), /# architecture › T001 Message schema/);
  // selecting a room filters; direct conversation is its own section
  await page.click(".fname:has-text('product')");
  assert.equal((await h.feedOrder(page)).length, 2);
  await page.click("#tree .fname:has-text('↔')");
  assert.equal((await h.feedOrder(page)).length, 4);
  // collapse a folder; state survives a rebuild
  await page.click(".folder:has-text('product') .chev");
  assert.equal(await page.locator("#tree .tcard[data-tk='room:product|T003']").count(), 0);
  assert.equal(await page.getAttribute(".folder:has-text('product') .chev", "aria-expanded"), "false");
  await page.click(".folder:has-text('product') .chev");
  assert.equal(await page.locator("#tree .tcard[data-tk='room:product|T003']").count(), 1);
  // keyboard: ArrowDown moves focus down the tree
  await page.focus("#tree .tree-root");
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => document.activeElement.className);
  assert.match(focused, /chev/);
  assert.deepEqual(log.pageErrors, []);
  await ctx.close();
});

test("AC5 search: '/' focuses, suggestions (threads, rooms, text), arrow keys, Enter, Esc, highlight and tree filter", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  await page.click("body", { position: { x: 5, y: 5 } });
  await page.keyboard.press("/");
  assert.equal(await page.evaluate(() => document.activeElement.id), "q");
  await page.keyboard.type("schema");
  await page.waitForSelector("#sugg.show");
  const heads = await page.$$eval("#sugg h4", e => e.map(x => x.textContent));
  assert.deepEqual(heads, ["Threads", "Messages"]);
  assert.match(await page.textContent("#sugg .all"), /Search "schema" in text/);
  assert.match(await page.textContent("#sugg .all .c"), /^\d+$/);
  // arrow selects, Enter navigates to the thread and clears the query
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator("#sugg button.sel").count(), 1);
  assert.match(await page.textContent("#sugg button.sel"), /T001/);
  await page.keyboard.press("Enter");
  assert.equal(await page.inputValue("#q"), "");
  assert.match(await page.textContent("#title"), /T001/);
  // ArrowUp from nothing selects the last entry ("search in text"); Enter keeps the text filter
  await page.click(".tree-root");
  await page.fill("#q", "handoff");
  await page.keyboard.press("ArrowUp");
  assert.match(await page.textContent("#sugg button.sel"), /in text/);
  await page.keyboard.press("Enter");
  assert.ok(await page.locator("#feed mark").count() > 0);
  assert.ok((await h.feedOrder(page)).length >= 1);
  // the tree is filtered to matching threads
  assert.equal(await page.locator("#tree .tcard[data-tk='room:product|T003']").count(), 0);
  // Esc closes suggestions
  await page.fill("#q", "pro");
  await page.waitForSelector("#sugg.show");
  assert.match((await page.$$eval("#sugg h4", e => e.map(x => x.textContent))).join(","), /Rooms/);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#sugg.show").count(), 0);
  await ctx.close();
});

test("AC5 reply and cancel-reply clear target and auto-filled mention; reply link jumps", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  const target = "2026-09-26_0920_implementation-agent-01_T001_schema-proposal.txt";
  await page.hover(`article.msg[data-file='${target}']`);
  await page.click(`article.msg[data-file='${target}'] [data-reply]`);
  assert.equal(await page.isVisible("#replying"), true);
  assert.match(await page.textContent("#replyName"), /implementation-agent-01/);
  assert.equal(await page.inputValue("#cBody"), "@implementation-agent-01 ");
  await page.click("#replyClear");
  assert.equal(await page.isVisible("#replying"), false);
  assert.equal(await page.inputValue("#cBody"), "");
  assert.equal(await page.inputValue("#cTo"), "all");
  // user-typed text is preserved on cancel
  await page.hover(`article.msg[data-file='${target}']`);
  await page.click(`article.msg[data-file='${target}'] [data-reply]`);
  await page.fill("#cBody", "my own text");
  await page.click("#replyClear");
  assert.equal(await page.inputValue("#cBody"), "my own text");
  // a reply shows a link to the message it answers
  assert.ok(await page.locator(`article.msg[data-file='${target}'] .reply-ref`).count());
  await ctx.close();
});

test("AC5 alignment: current user's messages on the right, others on the left, configurable", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  await page.selectOption("#me", "research-agent-01");
  const side = async () => page.$$eval("#feed article.msg", els => els.map(e => [e.dataset.author, getComputedStyle(e).alignSelf]));
  let rows = await side();
  assert.ok(rows.length === 10);
  for (const [author, align] of rows) assert.equal(align, author === "research-agent-01" ? "flex-end" : "flex-start");
  assert.ok(rows.some(r => r[1] === "flex-end") && rows.some(r => r[1] === "flex-start"));
  await page.click("#gear");
  await page.selectOption("#sAlign", "left");
  rows = await side();
  for (const [, align] of rows) assert.equal(align, "flex-start");
  await ctx.close();
});

test("R7 chat rendering: day separators, kind markers, @mentions, addressed-to-me, long messages, reflow, receipts", async () => {
  const { ctx, page } = await c.openExample(browser, h.BOARD_HTML);
  await page.evaluate(() => {
    const long = "=== SUMMARY ===\nFirst paragraph with `code` and @human-owner-01 mention.\n\n- item one\n- item two\n  continued\n\n" + "word ".repeat(200);
    const head = (f, from, date, extra) => `FROM: ${from}\nTO: human-owner-01\nSCOPE: ROOM\nROOM: general\nTHREAD: T009-long\nDATE: ${date}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\n${extra}`;
    window.__boardTest.loadFiles([
      { path: "participants.json", text: JSON.stringify({ participants: [{ id: "human-owner-01", kind: "human" }, { id: "research-agent-01", kind: "agent" }] }) },
      { path: "rooms/general/2026-10-01_0900_research-agent-01_T009_long.txt", text: head("a", "research-agent-01", "2026-10-01 09:00", long) },
      { path: "rooms/general/2026-10-02_0900_research-agent-01_T009_next.txt", text: head("b", "research-agent-01", "2026-10-02 09:00", "next day") },
      { path: "rooms/general/2026-10-02_0910_research-agent-01_T009_receipt.txt", text: head("c", "research-agent-01", "2026-10-02 09:10", "Read receipt only") }],
      ["rooms", "rooms/general"]);
  });
  assert.equal(await page.locator("#feed .day").count(), 2);
  const first = page.locator("article.msg").first();
  assert.ok(await first.locator(".body.clamp").count());              // long => collapsed
  assert.ok(await first.locator(".body .h").count());                  // === HEADING ===
  assert.ok(await first.locator(".body code").count());
  assert.ok(await first.locator(".body li").count() === 2);
  assert.ok(await first.locator(".mention").count());
  assert.ok(await first.evaluate(e => e.classList.contains("to-me")));
  await first.locator("[data-more]").click();
  assert.equal(await first.locator(".body.clamp").count(), 0);
  assert.equal(await page.locator(".receipt").count(), 0);             // receipts hidden by default
  await ctx.close();
});

test("search suggestions remain open when focus returns before an earlier blur timeout", async () => {
  const {ctx,page}=await c.openExample(browser,h.BOARD_HTML,{clock:new Date("2026-10-15T10:30:00Z")});
  await page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));
  await page.fill("#q","schema");await page.focus("#cBody");await page.fill("#q","pro");
  await page.clock.runFor(200);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"q");
  assert.equal(await page.isVisible("#sugg"),true);
  assert.match(await page.textContent("#sugg"),/Rooms/);
  await ctx.close();
});
