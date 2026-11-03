"use strict";
// SPEC-002-077: sub-threads in the viewer, part A. Model, main flow, summary strip, filtered sub-thread view,
// composer destination and stamping, unread, discovery, refresh and reload. Owner policy: no VoiceOver checks;
// these are unit, DOM text/hierarchy and geometry checks.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { expect } = require("playwright/test");
const h = require("./lib/helpers");
const X = require("./lib/subthread-fixture");
const { F } = X;

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

const AT = new Date("2026-10-15T13:05:00Z");
async function boot({ invalid = false, extra = {}, viewport, me = "human-owner-01", view = X.VIEW } = {}) {
  const { proj } = X.subthreadBoard({ invalid, extra });
  const s = await h.openPage(browser, { tree: h.readTree(proj), fixedTime: AT, dialog: "accept" });
  await h.openBoardViaUi(s.page);
  await s.page.selectOption("#me", me);
  if (view) await h.openView(s.page, view);
  if (viewport) await s.page.setViewportSize(viewport);
  return { ...s, proj, cleanup: () => h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }) };
}
const feedFiles = page => page.$$eval("#feed article.msg", els => els.map(e => e.dataset.file));
const written = (page, text) => page.evaluate(text => window.__fakefs.dump().find(f => f.text.includes(text))?.text || null, text);
const header = (text, key) => (text.match(new RegExp("^" + key + ": (.*)$", "m")) || [])[1];
async function refresh(page) {
  const n = await page.evaluate(() => window.__boardTest.stats.builds);
  await page.evaluate(() => readFromHandle(true));
  await page.waitForFunction(n => window.__boardTest.stats.builds > n, n);
}
const addFile = (page, name, text) => page.evaluate(([name, text]) => window.__fakefs.addFile(`.agent-board/rooms/planning/${name}`, text), [name, text]);
const memberText = (body, o = {}) => X.message({ from: "research-agent-01", date: "13:02", reply: F.root, extra: [`SUBTHREAD: ${F.root}`], body, ...o });

test("AC2 the index maps each root to its members in posting order, participants, last activity, state and ALSO members", async () => {
  const s = await boot({ view: null });
  try {
    const index = await s.page.evaluate(() => [...subthreadsOf().values()].map(x => ({ key: x.key, members: x.members.map(m => m.file), participants: x.participants,
      last: x.last, state: x.state, also: x.also.map(m => m.file), orphan: subthreadOrphan(x) })));
    assert.deepEqual(index, [
      { key: X.KEY(F.root), members: [F.first, F.also, F.question], participants: ["research-agent-01", "implementation-agent-01"], last: "2026-10-15 12:30", state: "open", also: [F.also], orphan: false },
      { key: X.KEY(F.root2), members: [F.resolved], participants: ["research-agent-01"], last: "2026-10-15 12:55", state: "resolved", also: [], orphan: false },
    ]);
    const fields = await s.page.evaluate(names => names.map(n => { const m = B.msgs.find(x => x.file === n); return [m.subthread, m.subthreadAlso, m.subthreadState]; }), [F.root, F.first, F.also, F.plain, F.resolved]);
    assert.deepEqual(fields, [[null, false, null], [F.root, false, null], [F.root, true, null], [null, false, null], [F.root2, false, "resolved"]],
      "a plain REPLY-TO reply to a member is not a member (subthread null)");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC2 every SPEC-002-076 rule isolates the file as invalid; invalid files are never members", async () => {
  const s = await boot({ invalid: true, view: null });
  try {
    const rows = await s.page.evaluate(names => names.map(n => { const m = B.msgs.find(x => x.file === n); return { file: n, error: m.validationError, metadataError: !!m.metadataError, member: m.subthread }; }), Object.keys(X.INVALID));
    for (const row of rows) { assert.ok(row.error && row.metadataError, "invalid: " + row.file); assert.equal(row.member, null, row.file); }
    const reasons = Object.fromEntries(rows.map(r => [r.file.replace(/^.*_T009_|\.txt$/g, ""), r.error]));
    const name = key => key + ": expected the filename of a .txt message in the same directory (no slashes, traversal or other extensions)";
    assert.deepEqual(reasons, {
      "bad-root-name": name("SUBTHREAD"), "bad-root-ext": name("SUBTHREAD"), "promoted-bad-name": name("PROMOTED-FROM"),
      "root-is-member": `SUBTHREAD: root ${F.first} is itself a sub-thread message; sub-threads nest one level only`,
      "root-other-thread": `SUBTHREAD: root ${F.other} is in another thread (T010), not T009`,
      "reply-dash": "SUBTHREAD: REPLY-TO must name the root or another message of the same sub-thread, not -",
      "reply-outside": `SUBTHREAD: REPLY-TO ${F.plain} is neither the root ${F.root} nor a message of its sub-thread`,
      "also-without": "SUBTHREAD-ALSO: only a sub-thread message (with SUBTHREAD) can also show in the main thread",
      "state-without": "SUBTHREAD-STATE: only a sub-thread message (with SUBTHREAD) can resolve or reopen a sub-thread",
      "also-value": "SUBTHREAD-ALSO: the only value is main", "state-value": "SUBTHREAD-STATE: expected resolved or open",
      "closed-member": "SUBTHREAD: STATUS CLOSED is invalid on a sub-thread message; resolve with SUBTHREAD-STATE: resolved (old readers would read CLOSED as closing the topic)",
      "promoted-not-first": "PROMOTED-FROM: a promoted sub-thread continues in a new topic, not in the root's own topic",
      "promoted-with-subthread": "PROMOTED-FROM: a topic's first message cannot also be a sub-thread message",
      "answer-unmarked": `SUBTHREAD: an ANSWER to a question inside a sub-thread must carry SUBTHREAD: ${F.root}`,
    });
    // The valid files are untouched by the invalid neighbours.
    assert.deepEqual(await s.page.evaluate(names => names.filter(n => B.msgs.find(x => x.file === n).validationError), [...Object.keys(X.VALID), ...Object.keys(X.SUPPORT)]), []);
    // Posting: a missing root is an error for a new message (an orphan only for files already on the board).
    const post = await s.page.evaluate(() => { const h = { THREAD: "T009-planning", STATUS: "INFO", "REPLY-TO": "2026-10-15_1100_human-owner-01_T009_gone.txt", SUBTHREAD: "2026-10-15_1100_human-owner-01_T009_gone.txt" };
      return [subthreadIssue(h, { dkey: "room:planning", index: B.messageIndex, post: true }), subthreadIssue(h, { dkey: "room:planning", index: B.messageIndex })]; });
    assert.deepEqual(post, ["SUBTHREAD: root 2026-10-15_1100_human-owner-01_T009_gone.txt does not exist in this directory", ""]);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC3 the main flow hides members, keeps plain replies, and shows a SUBTHREAD-ALSO member as a non-interactive stub", async () => {
  const s = await boot();
  try {
    assert.deepEqual(await feedFiles(s.page), [F.root, F.also, F.plain, F.root2]);
    const stub = s.page.locator(`article[data-file="${F.also}"]`);
    await expect(stub).toHaveClass(/sub-stub/);
    await expect(stub.locator(".sub-chip")).toHaveText("🧵 Also in a sub-thread");
    await expect(stub.locator(".sub-stub-text")).toHaveText("Benchmark summary: Postgres is 3x faster on our load.");
    assert.equal(await stub.locator(".tools, form, [data-reply], .board-report, .board-form").count(), 0, "a stub has no actions and no interactive body");
    assert.equal(await s.page.locator(`[id="m-${X.KEY(F.also)}"]`).count(), 1, "the member renders once in the document");
    // The plain reply links to a hidden member: the jump opens that member's sub-thread (AC3/AC5).
    await s.page.locator(`article[data-file="${F.plain}"] .reply-ref`).click();
    await expect.poll(() => s.page.evaluate(() => sel.sub || null)).toBe(F.root);
    assert.deepEqual(await feedFiles(s.page), [F.root, F.first, F.also, F.question]);
    // Inside the sub-thread the ALSO member renders in full, once.
    assert.equal(await s.page.locator(`article[data-file="${F.also}"].sub-stub`).count(), 0);
    assert.equal(await s.page.locator(`[id="m-${X.KEY(F.also)}"]`).count(), 1);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC4 the strip under a root shows count, participant dots, last activity, unread dot and capsule, from headers only", async () => {
  const s = await boot();
  try {
    // Headers only: the hidden members' bodies are never read for the strip.
    assert.deepEqual(await s.page.evaluate(n => n.map(f => B.msgs.find(m => m.file === f).bodyLoaded), [F.first, F.question]), [false, false]);
    const strip = s.page.locator(`article[data-file="${F.root}"] .sub-strip`);
    await expect(strip).toHaveAttribute("aria-label", "3 replies, last 35 min ago · unread replies · Question for you");
    await expect(strip).toHaveAttribute("title", "3 replies, last 35 min ago");
    assert.equal(await strip.evaluate(el => el.tagName), "BUTTON");
    await expect(strip.locator(".sub-count")).toHaveText("3 replies");
    assert.deepEqual(await strip.locator(".sub-dot").evaluateAll(els => els.map(e => e.dataset.party)), ["research-agent-01", "implementation-agent-01"]);
    const dot = await s.page.evaluate(n => [getComputedStyle(document.querySelector(`article[data-file="${n}"]`)).getPropertyValue("--c").trim(), getComputedStyle(document.querySelector(".sub-dot")).getPropertyValue("--c").trim()], F.plain.replace("human-owner-01", "human-owner-01"));
    const author = await s.page.evaluate(() => getComputedStyle(document.querySelector('article[data-author="implementation-agent-01"]')).getPropertyValue("--c").trim());
    const dots = await strip.locator(".sub-dot").evaluateAll(els => els.map(e => getComputedStyle(e).getPropertyValue("--c").trim()));
    assert.equal(dots[1], author, "dots use the stable participant palette (same colour as that author's bubbles)");
    assert.notEqual(dots[0], dots[1]); assert.ok(dot[1]);
    await expect(strip.locator(".sub-unread")).toHaveCount(1);
    await expect(strip.locator(".sub-cap")).toHaveText("Question for you");
    const resolved = s.page.locator(`article[data-file="${F.root2}"] .sub-strip`);
    await expect(resolved).toHaveClass(/sub-resolved/);
    await expect(resolved.locator(".sub-cap")).toHaveText("Resolved");
    await expect(resolved.locator(".sub-outcome")).toHaveText("Outcome: keep the file queue.");
    // Another reader is not asked: no question capsule. A DECISION-NEEDED member is the second capsule kind.
    await s.page.selectOption("#me", "implementation-agent-01");
    await expect(strip.locator(".sub-cap")).toHaveCount(0);
    await addFile(s.page, X.file("1302", "research-agent-01", "T009", "decide"), memberText("Decide on hosting.", { status: "DECISION-NEEDED" }));
    await refresh(s.page);
    await expect(strip.locator(".sub-cap")).toHaveText("Decision needed");
    await expect(strip).toHaveAttribute("title", "4 replies, last 3 min ago");
    // More than three participants: three dots and +N.
    for (const [i, who] of ["human-owner-01", "implementation-agent-01"].entries())
      await addFile(s.page, X.file("130" + (3 + i), who, "T009", "more-" + i), X.message({ from: who, date: "13:0" + (3 + i), reply: F.root, extra: [`SUBTHREAD: ${F.root}`], body: "more" }));
    await refresh(s.page);
    await expect(strip.locator(".sub-dot")).toHaveCount(3);
    await expect(strip.locator(".sub-more")).toHaveCount(0, { message: "three people exactly: no overflow" });
    assert.deepEqual(await s.page.evaluate(n => n.map(f => B.msgs.find(m => m.file === f).bodyLoaded), [F.first, F.question]), [false, false]);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC4 the strip fits at 320 px and is readable in System, Light, Dark and Dracula", async () => {
  const s = await boot({ viewport: { width: 320, height: 640 } });
  try {
    await expect(s.page.locator("#side")).toBeHidden();
    const strip = s.page.locator(`article[data-file="${F.root}"] .sub-strip`);
    await strip.scrollIntoViewIfNeeded();
    const box = await strip.boundingBox(), article = await s.page.locator(`article[data-file="${F.root}"]`).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, `strip inside 320px: ${JSON.stringify(box)}`);
    assert.ok(box.x + box.width <= article.x + article.width + 0.5, "strip inside its bubble");
    assert.deepEqual(await h.layoutViolations(s.page), []);
    await s.page.mouse.move(1, 1);
    const looks = {};
    for (const theme of ["system", "light", "dark", "dracula"]) {
      await s.page.evaluate(theme => { const el = document.querySelector("#sTheme"); el.value = theme; el.dispatchEvent(new Event("change", { bubbles: true })); }, theme);
      if (theme !== "system") await expect.poll(() => s.page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      looks[theme] = await strip.evaluate(el => {
        const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number), lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const cs = getComputedStyle(el), count = getComputedStyle(el.querySelector(".sub-count")), cap = getComputedStyle(el.querySelector(".sub-cap"));
        return { bg: cs.backgroundColor, text: ratio(cs.color, cs.backgroundColor), count: ratio(count.color, cs.backgroundColor), cap: ratio(cap.color, cap.backgroundColor) };
      });
      for (const k of ["text", "count", "cap"]) assert.ok(looks[theme][k] >= 3, `${theme} ${k} contrast ${looks[theme][k].toFixed(2)}`);
    }
    assert.notEqual(looks.dark.bg, looks.light.bg);
    assert.equal(looks.dracula.bg, looks.dark.bg, "inside a message Dracula keeps Dark's message colours (existing theme rule)");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 strip, Enter on the strip and Start sub-thread open the filtered view with a Back bar; members offer no Start", async () => {
  const s = await boot();
  try {
    await expect(s.page.locator("#subBack")).toBeHidden();
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).focus();
    await s.page.keyboard.press("Enter");
    await expect(s.page.locator("#title")).toHaveText("# planning › T009 Planning › 🧵 Sub-thread");
    await expect(s.page.locator("#subBack")).toBeVisible();
    assert.deepEqual(await feedFiles(s.page), [F.root, F.first, F.also, F.question]);
    assert.equal(await s.page.locator("#feed [data-subthread-start]").count(), 0, "no Start sub-thread inside a sub-thread (one level)");
    await expect(s.page.locator("#topicRename")).toBeHidden();
    await s.page.click("#subBack");
    await expect(s.page.locator("#subBack")).toBeHidden();
    assert.deepEqual(await feedFiles(s.page), [F.root, F.also, F.plain, F.root2]);
    // Start sub-thread on a message with none: the view opens with the root only and a hint; Start is not on the stub.
    assert.equal(await s.page.locator(`article[data-file="${F.also}"] [data-subthread-start]`).count(), 0);
    const start = s.page.locator(`article[data-file="${F.plain}"] [data-subthread-start]`);
    await expect(start).toHaveAttribute("aria-label", "Start sub-thread");
    await expect(s.page.locator(`article[data-file="${F.root}"] [data-subthread-start]`)).toHaveAttribute("aria-label", "Open sub-thread");
    await s.page.locator(`article[data-file="${F.plain}"]`).hover();
    await start.click();
    assert.deepEqual(await feedFiles(s.page), [F.plain]);
    await expect(s.page.locator("#feed .sub-empty")).toHaveText("No replies yet. The first message you post here starts the sub-thread.");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5/AC6 the composer targets the sub-thread: a post writes SUBTHREAD with REPLY-TO the root; Reply inside keeps it", async () => {
  const s = await boot();
  try {
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    assert.equal(await s.page.locator("#cSub").inputValue(), F.root);
    await expect(s.page.locator("#composerTargetRow")).toBeHidden();
    await s.page.fill("#cBody", "First post from the filtered view");
    await s.page.click("#send");
    await expect.poll(() => written(s.page, "First post from the filtered view")).not.toBeNull();
    let text = await written(s.page, "First post from the filtered view");
    assert.equal(header(text, "SUBTHREAD"), F.root); assert.equal(header(text, "REPLY-TO"), F.root); assert.equal(header(text, "SUBTHREAD-ALSO"), undefined);
    await expect.poll(() => s.page.evaluate(() => B.msgs.some(m => m.body === "First post from the filtered view" && m.subthread))).toBe(true);
    assert.equal(await s.page.evaluate(() => sel.sub), F.root, "the view stays on the sub-thread after posting");
    // Reply to a member inside the view.
    await s.page.locator(`article[data-file="${F.question}"]`).hover();
    await s.page.locator(`article[data-file="${F.question}"] [data-reply]`).click();
    await s.page.fill("#cBody", "Budget is small");
    await s.page.click("#send");
    await expect.poll(() => written(s.page, "Budget is small")).not.toBeNull();
    text = await written(s.page, "Budget is small");
    assert.equal(header(text, "SUBTHREAD"), F.root); assert.equal(header(text, "REPLY-TO"), F.question);
    // Back in the main flow, Reply on the root is a plain main-flow reply.
    await s.page.click("#subBack");
    await s.page.locator(`article[data-file="${F.root}"]`).hover();
    await s.page.locator(`article[data-file="${F.root}"] [data-reply]`).click();
    await s.page.fill("#cBody", "Plain main reply");
    await s.page.click("#send");
    await expect.poll(() => written(s.page, "Plain main reply")).not.toBeNull();
    text = await written(s.page, "Plain main reply");
    assert.equal(header(text, "SUBTHREAD"), undefined); assert.equal(header(text, "REPLY-TO"), F.root);
    // Topic titles are refused from a sub-thread.
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    const before = await s.page.evaluate(() => window.__fakefs.dump().length);
    await s.page.evaluate(() => { document.querySelector("#topicTitle").value = "Renamed"; return setTopicTitle(); });
    await expect(s.page.locator("#toast")).toHaveText("A topic title cannot be set from a sub-thread");
    assert.equal(await s.page.evaluate(() => window.__fakefs.dump().length), before);
    const refused = await s.page.evaluate(root => { try { composeMessage({ sender: "human-owner-01", to: "all", scope: "room", room: "planning", tid: "T009", slug: "x", status: "INFO", body: "x", topicTitle: "New", replyTo: root, subthread: root }); return "written"; } catch (e) { return e.message; } }, F.root);
    assert.equal(refused, "A topic title cannot be set from a sub-thread");
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 a draft never moves silently: opening a sub-thread with a main draft pins it, and it posts to the main flow", async () => {
  const s = await boot();
  try {
    await s.page.fill("#cBody", "Main flow draft");
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    await expect(s.page.locator("#composerPin")).toBeVisible();
    await expect(s.page.locator("#composerPin .composer-pin-text")).toHaveText("Draft for # planning › T009 Planning, not this view.");
    assert.equal(await s.page.locator("#cSub").inputValue(), "");
    await s.page.click("#send");
    await expect.poll(() => written(s.page, "Main flow draft")).not.toBeNull();
    assert.equal(header(await written(s.page, "Main flow draft"), "SUBTHREAD"), undefined);
    // "Post here instead" is the explicit move to the sub-thread.
    await s.page.click("#subBack");
    await s.page.fill("#cBody", "Second draft");
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    await s.page.click("#composerPinHere");
    assert.equal(await s.page.locator("#cSub").inputValue(), F.root);
    await expect(s.page.locator("#composerTarget .composer-chip-topic")).toHaveCount(1);
    await s.page.click("#send");
    await expect.poll(() => written(s.page, "Second draft")).not.toBeNull();
    assert.equal(header(await written(s.page, "Second draft"), "SUBTHREAD"), F.root);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC6 an answer to a member question carries the marker; a read-only board downloads the same bytes", async () => {
  const question = JSON.stringify({ id: "host", type: "single", prompt: "Where do we host?", options: [{ id: "cloud", label: "Cloud" }, { id: "local", label: "Local" }] });
  const name = X.file("1301", "research-agent-01", "T009", "host-question");
  const s = await boot({ extra: { [name]: memberText("Where do we host?", { to: "human-owner-01", status: "QUESTION", date: "13:01", extra: [`SUBTHREAD: ${F.root}`, `QUESTION: ${question}`] }) } });
  try {
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    const form = s.page.locator(`article[data-file="${name}"] .choice-form`);
    await form.locator("input[value=cloud]").check();
    await form.locator("[type=submit]").click();
    await expect.poll(() => written(s.page, '"selected":["cloud"]')).not.toBeNull();
    const text = await written(s.page, '"selected":["cloud"]');
    assert.equal(header(text, "SUBTHREAD"), F.root); assert.equal(header(text, "REPLY-TO"), name);
  } finally { await s.ctx.close(); s.cleanup(); }
  // Read-only upload: Post downloads a file with the same sub-thread headers.
  const { proj } = X.subthreadBoard();
  const { ctx, page } = await h.openPage(browser, { fixedTime: AT });
  try {
    await page.setInputFiles("#fallback", proj); await page.waitForSelector("#feed article");
    await page.selectOption("#me", "human-owner-01"); await h.openView(page, X.VIEW);
    await page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    await page.fill("#cBody", "Downloaded in a sub-thread");
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#send")]);
    const bytes = h.fs.readFileSync(await download.path(), "utf8");
    assert.equal(header(bytes, "SUBTHREAD"), F.root); assert.equal(header(bytes, "REPLY-TO"), F.root);
  } finally { await ctx.close(); h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("AC6 every writer passes the sub-thread marker of its source (form answer, acceptance, extension answer, choice, send)", () => {
  // Source guard for the writers that need a full extension or acceptance conflict fixture to drive in a browser;
  // the behaviour of composeMessage with `subthread` is covered by the browser tests above.
  const read = f => h.fs.readFileSync(h.path.join(h.ROOT, f), "utf8");
  const calls = src => [...src.matchAll(/composeMessage\(\{[^]*?\}\);/g)].map(m => m[0]);
  for (const call of calls(read("scripts/form-board.js"))) assert.match(call, /subthread:subthreadOf\((m|q)\)/, call.slice(0, 80));
  for (const call of calls(read("scripts/extension-ui.js"))) assert.match(call, /subthread:subthreadOf\(m\)/, call.slice(0, 80));
  const html = read("board.html");
  assert.match(html, /slug:"answer-"\+m\.question\.id,status:"REPLY",body,replyTo:m\.file,answer,subthread:subthreadOf\(m\)/);
  assert.match(html, /replyTo: replyTo \? replyTo\.file : subthread, subthread,/);
  assert.match(html, /if\(sel\.sub\)\{ toast\(t\("e_subthread_title"\)\); return; \}/);
});

test("AC7 a hidden member raises the topic badge and the strip dot; the main flow does not mark it read, the sub-thread does", async () => {
  const s = await boot();
  try {
    const name = X.file("1302", "research-agent-01", "T009", "late-member");
    await addFile(s.page, name, memberText("A late member"));
    await refresh(s.page);
    const unreadOf = n => s.page.evaluate(n => unread(B.msgs.find(m => m.file === n)), n);
    assert.equal(await unreadOf(name), true, "viewing the main flow does not mark a hidden member read");
    await s.page.click("#tree .tree-root");
    await expect(s.page.locator(`.tcard[data-tk="${X.VIEW}"] .unread-badge`)).toHaveText(/\d+ unread/);
    await expect(s.page.locator('.fname[data-dir="planning"] .unread-badge')).toHaveText(/\d+ unread/);
    await h.openView(s.page, X.VIEW);
    await expect(s.page.locator(`article[data-file="${F.root}"] .sub-unread`)).toHaveCount(1);
    assert.equal(await unreadOf(name), true);
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    await expect.poll(() => unreadOf(name)).toBe(false);
    await s.page.click("#subBack");
    await expect(s.page.locator(`article[data-file="${F.root}"] .sub-unread`)).toHaveCount(0);
    // A thread follow still matches members (same topic key).
    assert.equal(await s.page.evaluate(n => notificationMatches({ follows: [{ kind: "thread", key: "room:planning|T009" }] }, B.msgs.find(m => m.file === n)), name), true);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC8 Sub-threads (n) lists active, then resolved, then orphaned; full-board search finds members and opens them", async () => {
  const orphanFirst = X.file("1303", "research-agent-01", "T009", "orphan-first"), orphanNext = X.file("1304", "implementation-agent-01", "T009", "orphan-next");
  const s = await boot({ extra: {
    [orphanFirst]: X.message({ from: "research-agent-01", date: "13:03", reply: F.root, extra: ["SUBTHREAD: 2026-10-15_1100_human-owner-01_T009_deleted.txt"], body: "orphan source" }),
    [orphanNext]: X.message({ from: "implementation-agent-01", date: "13:04", reply: orphanFirst, extra: ["SUBTHREAD: 2026-10-15_1100_human-owner-01_T009_deleted.txt"], body: "Orphaned member stays visible" }),
  } });
  try {
    await expect(s.page.locator("#subMenuToggle")).toHaveText("🧵 Sub-threads (3)");
    await s.page.click("#subMenuToggle");
    const panel = s.page.locator("#subMenuPanel");
    await expect(panel).toBeVisible();
    const groups = await panel.evaluate(el => [...el.children].map(c => c.tagName === "H4" ? "#" + c.textContent : c.dataset.subthreadOpen.split("|").pop()));
    assert.deepEqual(groups, ["#Active", F.root, "#Resolved sub-threads", F.root2, "#Orphaned", "2026-10-15_1100_human-owner-01_T009_deleted.txt"]);
    await expect(panel.locator(".sub-row").last()).toContainText("Root message not found: 2026-10-15_1100_human-owner-01_T009_deleted.txt");
    await expect(panel.locator(`[data-subthread-open="${X.KEY(F.root)}"] .sub-row-meta`)).toHaveText("3 replies · 35 min ago");
    await expect(panel.locator(`[data-subthread-open="${X.KEY(F.root)}"] .unread-badge`)).toHaveText("2 unread", { message: "the ALSO member was read as a stub in the main flow" });
    // The orphaned member is listed, never dropped, and opens with its members.
    await panel.locator(".sub-row").last().click();
    await expect(panel).toBeHidden();
    assert.deepEqual(await feedFiles(s.page), [orphanNext]);
    await s.page.click("#subBack");
    await s.page.click("#subMenuToggle");
    await panel.locator(`[data-subthread-open="${X.KEY(F.root2)}"]`).click();
    assert.deepEqual(await feedFiles(s.page), [F.root2, F.resolved]);
    await s.page.click("#subBack");
    // Search: members are found and open in their sub-thread.
    await s.page.fill("#q", "hosting budget"); await s.page.keyboard.press("Escape");
    await expect.poll(() => feedFiles(s.page)).toEqual([F.question]);
    await s.page.locator(`article[data-file="${F.question}"] .sub-chip`).click();
    await expect(s.page.locator("#q")).toHaveValue("");
    assert.equal(await s.page.evaluate(() => sel.sub), F.root);
    assert.deepEqual(await feedFiles(s.page), [F.root, F.first, F.also, F.question]);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC3 Flat view is a saved preference (default off) that restores the flat display", async () => {
  const s = await boot();
  try {
    assert.equal(await s.page.evaluate(() => S.flatView), false);
    await h.openTopicMenu(s.page);
    await expect(s.page.locator("#flatViewToggle")).toHaveAttribute("aria-pressed", "false");
    await s.page.click("#flatViewToggle");
    assert.deepEqual(await feedFiles(s.page), [F.root, F.first, F.also, F.question, F.plain, F.root2, F.resolved]);
    assert.equal(await s.page.locator("#feed .sub-strip, #feed .sub-stub").count(), 0);
    await expect(s.page.locator(`article[data-file="${F.first}"] .sub-chip`)).toHaveText("🧵 In a sub-thread");
    await h.reloadSettled(s.ctx, s.page, { setting: ["flatView", true] });
    await s.page.waitForSelector("#feed article");
    assert.equal(await s.page.evaluate(() => S.flatView), true);
    await h.openTopicMenu(s.page);
    await s.page.click("#flatViewToggle");
    assert.deepEqual(await feedFiles(s.page), [F.root, F.also, F.plain, F.root2]);
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC9 refresh keeps the sub-thread view, scroll, focus and draft; reload restores it; a vanished one closes", async () => {
  const filler = Object.fromEntries(Array.from({ length: 14 }, (_, i) => { const n = String(10 + i).padStart(2, "0");
    return [X.file("13" + n, "implementation-agent-01", "T009", "filler-" + n), X.message({ from: "implementation-agent-01", date: "13:" + n, reply: F.root, extra: [`SUBTHREAD: ${F.root}`], body: "Filler member " + n + "\n\nwith a second paragraph so the transcript scrolls." })]; }));
  const s = await boot({ extra: filler, viewport: { width: 1280, height: 600 } });
  try {
    await s.page.locator(`article[data-file="${F.root}"] .sub-strip`).click();
    await s.page.fill("#cBody", "Draft kept across refresh");
    await s.page.evaluate(() => { const f = document.querySelector("#feed"); f.scrollTop = 120; });
    const top = await s.page.evaluate(() => document.querySelector("#feed").scrollTop);
    await s.page.focus("#cBody");
    await addFile(s.page, X.file("1340", "research-agent-01", "T009", "arrives"), memberText("Arrives during reading", { date: "13:40" }));
    await refresh(s.page);
    assert.equal(await s.page.evaluate(() => sel.sub), F.root);
    assert.equal(await s.page.inputValue("#cBody"), "Draft kept across refresh");
    assert.equal(await s.page.evaluate(() => document.activeElement.id), "cBody");
    assert.equal(await s.page.evaluate(() => document.querySelector("#feed").scrollTop), top, "a reader above the live edge is not moved");
    assert.ok(await s.page.evaluate(n => B.msgs.some(m => m.file === n && m.subthread), X.file("1340", "research-agent-01", "T009", "arrives")), "the new member is in the model");
    assert.ok(!(await feedFiles(s.page)).includes(X.file("1340", "research-agent-01", "T009", "arrives")), "a reader above the live edge keeps the window (existing rule)");
    await s.page.fill("#cBody", "");
    await h.reloadSettled(s.ctx, s.page, { setting: ["lastSub", F.root] });
    await s.page.waitForSelector("#feed article");
    await expect.poll(() => s.page.evaluate(() => sel.sub || null)).toBe(F.root);
    await expect(s.page.locator("#title")).toHaveText("# planning › T009 Planning › 🧵 Sub-thread");
    // The root and every member vanish: the next refresh closes the view instead of showing an empty one.
    await s.page.evaluate(async names => { for (const n of names) await window.__fakefs.removeFile(`.agent-board/rooms/planning/${n}`); }, [F.root, F.first, F.also, F.question, F.plain, ...Object.keys(filler), X.file("1340", "research-agent-01", "T009", "arrives")]);
    await refresh(s.page);
    await expect.poll(() => s.page.evaluate(() => sel.sub || null)).toBe(null);
    await expect(s.page.locator("#subBack")).toBeHidden();
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC5 a notification for a member opens its sub-thread", async () => {
  const s = await boot();
  try {
    await s.page.evaluate(n => { const m = B.msgs.find(x => x.file === n); sel = { scope: m.scope, dir: m.dir, thread: m.tkey, ...(m.subthread && !S.flatView ? { sub: m.subthread } : {}) }; build(); }, F.first);
    assert.equal(await s.page.evaluate(() => sel.sub), F.root);
    const src = h.fs.readFileSync(h.path.join(h.ROOT, "scripts/notifications.js"), "utf8");
    assert.match(src, /sel=\{scope:m\.scope,dir:m\.dir,thread:m\.tkey,\.\.\.\(m\.subthread&&!S\.flatView\?\{sub:m\.subthread\}:\{\}\)\};/);
    assert.ok((await feedFiles(s.page)).includes(F.first));
  } finally { await s.ctx.close(); s.cleanup(); }
});

test("AC10 Polish uses one/few/many forms and every new string differs from English", async () => {
  const { ctx, page } = await h.openPage(browser);
  try {
    const out = await page.evaluate(() => { S.lang = "pl"; const pl = [1, 2, 5, 22, 25].map(subthreadReplies); S.lang = "en"; const en = [1, 2, 5].map(subthreadReplies); return { pl, en }; });
    assert.deepEqual(out.pl, ["1 odpowiedź", "2 odpowiedzi", "5 odpowiedzi", "22 odpowiedzi", "25 odpowiedzi"]);
    assert.deepEqual(out.en, ["1 reply", "2 replies", "5 replies"]);
    const { en, pl } = await page.evaluate(() => window.__boardTest.STRINGS);
    const keys = Object.keys(en).filter(k => /^(sub_|flat_view|e_subthread)/.test(k));
    assert.ok(keys.length >= 25, keys.length + " keys");
    for (const k of keys) { assert.ok(pl[k], k); assert.notEqual(pl[k], en[k], k); }
  } finally { await ctx.close(); }
});
