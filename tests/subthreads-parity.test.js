"use strict";
// SPEC-002-080 AC3: the viewer fixes and gap tests from docs/design/subthreads/SUBTHREAD-RULE-AUDIT.md. Each test
// names its audit row (#n) and, where it has one, its reproduction (Rn). The binding decisions are in
// docs/design/subthreads/SPEC-002-079-canonical-copy.md ("Decisions on the audit's ..."). Where canonical boardctl
// already agrees, the test also asks the pinned canonical CLI. Owner policy: no VoiceOver checks; these are unit,
// DOM text and file-byte checks.
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
// A message with a free DATE and POSTED-AT (the fixture builder fixes both to one minute).
function raw({ from, to = "all", tid = "T009", label = "planning", room = "planning", date, posted, reply = "-", status = "INFO", extra = [], body }) {
  return [`FROM: ${from}`, `TO: ${to}`, "SCOPE: ROOM", `ROOM: ${room}`, `THREAD: ${tid}-${label}`, `DATE: ${date}`, "LANGUAGE: en",
    `REPLY-TO: ${reply}`, `STATUS: ${status}`, ...(posted ? [`POSTED-AT: ${posted}`] : []), ...extra, "---", body, ""].join("\n");
}
async function boot({ extra = {}, files = {}, config, me = "human-owner-01", view = X.VIEW, invalid = false } = {}) {
  const { proj } = X.subthreadBoard({ extra, invalid });
  const base = h.path.join(proj, ".agent-board");
  for (const [rel, text] of Object.entries(files)) { h.fs.mkdirSync(h.path.dirname(h.path.join(base, rel)), { recursive: true }); h.fs.writeFileSync(h.path.join(base, rel), text); }
  if (config) { const p = h.path.join(base, "config.json"), c = JSON.parse(h.fs.readFileSync(p, "utf8")); config(c); h.fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n"); }
  const s = await h.openPage(browser, { tree: h.readTree(proj), fixedTime: AT, dialog: "accept" });
  const errors = []; s.page.on("pageerror", e => errors.push(e.message));
  await h.openBoardViaUi(s.page);
  await s.page.selectOption("#me", me);
  if (view) await h.openView(s.page, view);
  return { ...s, proj, errors, cleanup: async () => { await s.ctx.close(); h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); assert.deepEqual(errors, [], "no page errors"); } };
}
const errorOf = (page, name) => page.evaluate(n => B.msgs.find(m => m.file === n)?.validationError ?? null, name);
// The pane tells the reader the state: Resolve is offered while open, Reopen while resolved, and the banner names the outcome.
async function paneState(page, root) {
  await page.evaluate(key => openSubthread(key), X.KEY(root));
  await expect(page.locator("#subPane")).toBeVisible();
  return page.evaluate(() => ({ resolve: !$("#subResolve").hidden, reopen: !$("#subReopen").hidden, banner: $("#subBanner").hidden ? "" : $("#subBanner").textContent }));
}
function canonicalSubthreads(proj) {
  const r = h.boardctl(["recent", "--path", proj, "--participant", "human-owner-01", "--room", "planning", "--subthreads", "--limit", "200"]);
  assert.equal(r.code, 0, r.err);
  return Object.fromEntries((JSON.parse(r.out).subthreads || []).map(x => [x.root, x.state]));
}
const REOPEN = X.file("1300", "human-owner-01", "T009", "reopen-queue");

test("#22 R2: a time correction moves the message in the transcript, never the sub-thread state", async () => {
  const s = await boot({
    extra: { [REOPEN]: X.message({ from: "human-owner-01", date: "13:00", reply: F.root2, extra: [`SUBTHREAD: ${F.root2}`, "SUBTHREAD-STATE: open"], body: "Reopening: the file queue drops jobs." }) },
    files: { "time-corrections.txt": `${REOPEN} | 2026-10-15 12:50 | clock skew\n` },
  });
  try {
    assert.equal(await s.page.evaluate(n => B.msgs.find(m => m.file === n).time, REOPEN), "2026-10-15 12:50", "the correction still places the message");
    assert.deepEqual(canonicalSubthreads(s.proj)[F.root2], "open", "canonical orders by DATE");
    assert.deepEqual(await paneState(s.page, F.root2), { resolve: true, reopen: false, banner: "" }, "the later reopen by DATE wins");
  } finally { await s.cleanup(); }
});

test("#22 R2b: a DATE with an offset is ordered as an instant, not as text", async () => {
  // 13:06+05:00 is 08:06 UTC, earlier than the resolve at 12:55 Europe/Warsaw (10:55 UTC).
  const s = await boot({ extra: { [REOPEN]: raw({ from: "human-owner-01", date: "2026-10-15 13:06+05:00", posted: "2026-10-15T08:06:00.000Z", reply: F.root2, extra: [`SUBTHREAD: ${F.root2}`, "SUBTHREAD-STATE: open"], body: "An early reopen." }) } });
  try {
    assert.equal(await errorOf(s.page, REOPEN), "");
    assert.equal(canonicalSubthreads(s.proj)[F.root2], "resolved");
    const state = await paneState(s.page, F.root2);
    assert.deepEqual({ resolve: state.resolve, reopen: state.reopen }, { resolve: false, reopen: true });
    assert.match(state.banner, /Outcome: keep the file queue/);
  } finally { await s.cleanup(); }
});

test("#21: a STATE tie (same DATE and POSTED-AT) is broken by filename, as canonical message_order", async () => {
  // queue-outcome (resolved) and zz-reopen (open) share DATE and POSTED-AT; zz-reopen sorts last by filename.
  const tie = X.file("1255", "research-agent-01", "T009", "zz-reopen");
  const s = await boot({ extra: { [tie]: X.message({ from: "research-agent-01", date: "12:55", reply: F.root2, extra: [`SUBTHREAD: ${F.root2}`, "SUBTHREAD-STATE: open"], body: "Tie reopen." }) } });
  try {
    assert.equal(canonicalSubthreads(s.proj)[F.root2], "open");
    assert.deepEqual(await paneState(s.page, F.root2), { resolve: true, reopen: false, banner: "" });
  } finally { await s.cleanup(); }
});

test("#23 R8 (security): a signing-excluded member never resolves a sub-thread and its body is never shown as the outcome", async () => {
  // root2 keeps an eligible member; the resolving member is excluded by signing (its signing decision set as the signing pass would).
  const keep = X.file("1252", "implementation-agent-01", "T009", "queue-note");
  const s = await boot({ extra: { [keep]: X.message({ from: "implementation-agent-01", date: "12:52", reply: F.root2, extra: [`SUBTHREAD: ${F.root2}`], body: "Queue note." }) } });
  try {
    await s.page.evaluate(name => { B.msgs.find(m => m.file === name).signing = { eligibility: "excluded", signature: "unsigned", trust: "unknown", lifecycle: "unknown", reason: "Trusted signature required" }; build({ preserveComposer: true }); }, F.resolved);
    const strip = s.page.locator(`#feed article[data-file="${F.root2}"] .sub-strip`);
    await expect(strip).toBeVisible();
    await expect(strip).not.toHaveClass(/sub-resolved/);
    await expect(strip).not.toContainText("Outcome");
    await expect(strip.locator(".sub-count")).toHaveText("1 reply");
    await s.page.click("#subMenuToggle");
    const groups = await s.page.locator("#subMenuPanel").evaluate(el => [...el.children].map(c => c.tagName === "H4" ? "#" + c.textContent : c.dataset.subthreadOpen.split("|").pop()));
    assert.deepEqual(groups, ["#Active", F.root2, F.root], "an excluded resolve leaves the sub-thread active (newest activity first)");
    await s.page.click("#subMenuToggle");
    assert.deepEqual(await paneState(s.page, F.root2), { resolve: true, reopen: false, banner: "" });
  } finally { await s.cleanup(); }
});

test("#23 R8b (security): under a trusted-signing topic an unsigned resolve shows no outcome banner and no Reopen", async () => {
  const s = await boot({ config: c => {
    c.identity = { boardId: "0b6f7c1e-3c2d-4a59-9a43-2f1f6d1a7e10" };
    c.message_signing = { version: 1, minimum: "optional", scopes: { "rooms/planning": { minimum: "optional", threads: { T009: { minimum: "trusted" } } } } };
  } });
  try {
    await expect.poll(() => s.page.evaluate(n => signingEligible(B.msgs.find(m => m.file === n)), F.resolved)).toBe(false);
    const state = await paneState(s.page, F.root2);
    assert.doesNotMatch(state.banner, /Outcome/, "the excluded message's body is not shown");
    assert.equal(state.reopen, false);
  } finally { await s.cleanup(); }
});

test("#36 R5: a new post naming a present but unparseable root is refused; an existing member of it stays valid", async () => {
  const broken = X.file("1245", "human-owner-01", "T009", "broken-root"), kept = X.file("1246", "research-agent-01", "T009", "kept-member");
  const s = await boot({ extra: {
    [broken]: "FROM: human-owner-01\nTO: all\nno header separator here\n",
    [kept]: X.message({ from: "research-agent-01", date: "12:46", reply: broken, extra: [`SUBTHREAD: ${broken}`], body: "Member of a broken root." }),
  } });
  try {
    assert.equal(await errorOf(s.page, kept), "", "an existing member of an unreadable root stays valid");
    const issue = await s.page.evaluate(([root, reply]) => subthreadIssue({ THREAD: "T009-planning", STATUS: "INFO", "REPLY-TO": reply, SUBTHREAD: root }, { dkey: "room:planning", index: B.messageIndex, post: true }), [broken, kept]);
    assert.equal(issue, `rooms/planning/${broken}: missing header separator`);
    const refused = await s.page.evaluate(([root, reply]) => { try { composeMessage({ sender: "human-owner-01", to: "all", scope: "room", room: "planning", tid: "T009", threadLabel: "T009-planning", slug: "x", status: "INFO", body: "x", replyTo: reply, subthread: root }); return ""; } catch (e) { return e.message; } }, [broken, kept]);
    assert.match(refused, new RegExp(`rooms/planning/${broken}: missing header separator`));
  } finally { await s.cleanup(); }
});

test("#9 a member replying into another sub-thread is invalid; a member replying to a member of its own sub-thread is valid", async () => {
  const crossed = X.file("1400", "human-owner-01", "T009", "reply-crossed");
  const s = await boot({ invalid: true, view: null });
  try {
    assert.equal(await errorOf(s.page, crossed), `SUBTHREAD: REPLY-TO ${F.resolved} is neither the root ${F.root} nor a message of its sub-thread`);
    // F.also replies to F.first, a member of the same sub-thread: chained, valid, a member.
    assert.deepEqual(await s.page.evaluate(n => { const m = B.msgs.find(x => x.file === n); return [m.validationError, m.replyTo, m.subthread]; }, F.also), ["", F.first, F.root]);
  } finally { await s.cleanup(); }
});

test("#13 #14 answers to main-flow questions: to the root question main by default or joined explicitly; to another question no marker", async () => {
  const s = await boot({ invalid: true, view: null });
  try {
    const rows = await s.page.evaluate(names => names.map(n => { const m = B.msgs.find(x => x.file === n); return [m.validationError, m.subthread]; }), [X.F.rootq, X.F.answerMain, X.F.answerJoined]);
    assert.deepEqual(rows, [["", null], ["", null], ["", X.F.rootq]]);
    assert.equal(await errorOf(s.page, X.file("1400", "human-owner-01", "T009", "answer-wrong-marker")), `SUBTHREAD: REPLY-TO ${X.F.rootq} is neither the root ${F.root} nor a message of its sub-thread`);
  } finally { await s.cleanup(); }
});

test("#15 an acceptance record (ANSWER-STATE) to a member question follows its question", async () => {
  const s = await boot({ invalid: true, view: null });
  try {
    const issue = sub => s.page.evaluate(([sub, q]) => subthreadIssue({ THREAD: "T009-planning", STATUS: "REPLY", "REPLY-TO": q, "ANSWER-STATE": "{}", ...(sub ? { SUBTHREAD: sub } : {}) }, { dkey: "room:planning", index: B.messageIndex }), [sub, F.hostq]);
    assert.equal(await issue(null), `SUBTHREAD: an ANSWER to a question inside a sub-thread must carry SUBTHREAD: ${F.root}`);
    assert.equal(await issue(F.root), "");
  } finally { await s.cleanup(); }
});

test("#19 a new sub-thread may start in a closed topic: posting is allowed and the pane says the topic is closed", async () => {
  const closed = X.file("1301", "human-owner-01", "T009", "close-topic");
  const s = await boot({ view: null, extra: { [closed]: X.message({ from: "human-owner-01", date: "13:01", status: "CLOSED", body: "Closing the planning topic." }) } });
  try {
    // A closed topic leaves the default sidebar list; open it directly.
    await s.page.evaluate(() => { sel = { scope: "room", dir: "planning", thread: "room:planning|T009" }; build(); });
    await s.page.locator(`#feed article[data-file="${F.plain}"]`).hover();
    await s.page.locator(`#feed article[data-file="${F.plain}"] [data-subthread-start]`).click();
    await expect(s.page.locator("#subBanner")).toHaveText("Topic closed. Posting is still allowed.");
    await s.page.fill("#subBody", "A sub-thread in a closed topic");
    await s.page.click("#subSend");
    await expect.poll(() => s.page.evaluate(() => B.msgs.find(m => m.body === "A sub-thread in a closed topic")?.subthread || null)).toBe(F.plain);
    const out = h.path.join(h.tmpDir("afb-subthread-closed-"), "board");
    try { await h.dumpFakeFs(s.page, out); const v = h.boardctl(["validate", "--json", "--path", out]); assert.deepEqual(JSON.parse(v.out).errors, []); }
    finally { h.fs.rmSync(h.path.dirname(out), { recursive: true, force: true }); }
  } finally { await s.cleanup(); }
});

test("#25 PROMOTED-FROM on a message that is not its topic's first is refused when posting", async () => {
  const s = await boot({ view: null, invalid: true });
  try {
    const refused = await s.page.evaluate(root => { try { composeMessage({ sender: "human-owner-01", to: "all", scope: "room", room: "planning", tid: "T010", threadLabel: "T010-other", slug: "late", status: "INFO", body: "late", promotedFrom: root }); return ""; } catch (e) { return e.message; } }, F.root);
    assert.match(refused, new RegExp(`PROMOTED-FROM: only the first message of a topic can carry it, but ${F.other} is earlier in T010`));
    assert.equal(await errorOf(s.page, X.file("1400", "human-owner-01", "T009", "promoted-same-topic")), "PROMOTED-FROM: a promoted sub-thread continues in a new topic, not in the root's own topic");
  } finally { await s.cleanup(); }
});

test("#29 PROMOTED-FROM origin: missing, a member, or in another room", async () => {
  const s = await boot({ invalid: true, view: null });
  try {
    const rows = await s.page.evaluate(names => names.map(n => B.msgs.find(x => x.file === n)?.validationError ?? null), [X.F.promotedGone, X.F.promotedMember, X.F.promotedCrossRoom]);
    assert.deepEqual(rows, [
      "PROMOTED-FROM: 2026-10-15_1100_human-owner-01_T009_gone.txt is not a message in this directory",
      "PROMOTED-FROM: names a sub-thread message, not a root",
      `PROMOTED-FROM: ${X.F.otherRoom} is not a message in this directory`,
    ]);
  } finally { await s.cleanup(); }
});

test("#37 R9: a repair replacement keeps the original's valid sub-thread headers; one that corrects only the invalid one is published", async () => {
  const bad = X.file("1302", "research-agent-01", "T009", "bad-state"), rel = `rooms/planning/${bad}`;
  const original = X.message({ from: "research-agent-01", date: "13:02", reply: F.root, extra: [`SUBTHREAD: ${F.root}`, "SUBTHREAD-ALSO: main", "SUBTHREAD-STATE: done"], body: "Resolved with a typo." });
  const s = await boot({ extra: { [bad]: original } });
  try {
    assert.equal(await errorOf(s.page, bad), "SUBTHREAD-STATE: expected resolved or open");
    await h.topicAction(s.page, "repairsOpen");
    await s.page.selectOption("#repairSelect", rel);
    await s.page.waitForSelector("#repairDialog[aria-busy=false]");
    await s.page.fill("#repairReason", "Fix the state value");
    // R9: the dialog used to publish this, dropping the member out of its sub-thread.
    const dropped = original.replace(`SUBTHREAD: ${F.root}\n`, "").replace("SUBTHREAD-ALSO: main\n", "").replace("SUBTHREAD-STATE: done\n", "").replace(`REPLY-TO: ${F.root}`, "REPLY-TO: -");
    await s.page.fill("#repairText", dropped);
    await s.page.click("#repairSave");
    await expect(s.page.locator("#repairResult")).toHaveText(`a replacement keeps the original's sub-thread headers: SUBTHREAD is ${F.root} in the original and absent in the replacement`);
    await s.page.fill("#repairText", original.replace("SUBTHREAD-ALSO: main\n", ""));
    await s.page.click("#repairSave");
    await expect(s.page.locator("#repairResult")).toHaveText("a replacement keeps the original's sub-thread headers: SUBTHREAD-ALSO is main in the original and absent in the replacement");
    assert.equal((await s.page.evaluate(() => window.__fakefs.dump())).filter(f => f.path.includes("_amend-")).length, 0, "nothing was published");
    await s.page.fill("#repairText", original.replace("SUBTHREAD-STATE: done", "SUBTHREAD-STATE: resolved"));
    await s.page.click("#repairSave");
    await s.page.waitForFunction(() => B.msgs.some(m => m.quarantined));
    const amend = await s.page.evaluate(() => B.msgs.find(m => m.file.includes("_amend-")));
    assert.equal(amend.subthread, F.root); assert.equal(amend.subthreadAlso, true); assert.equal(amend.validationError, "");
    const out = h.path.join(h.tmpDir("afb-subthread-repair-"), "board");
    try { await h.dumpFakeFs(s.page, out); const v = h.boardctl(["validate", "--json", "--path", out]); assert.deepEqual(JSON.parse(v.out).errors, []); }
    finally { h.fs.rmSync(h.path.dirname(out), { recursive: true, force: true }); }
  } finally { await s.cleanup(); }
});

test("#11 a new member that would sort before its root is refused; an existing one stays valid with a warning", async () => {
  // The root is dated after the fixed clock (13:05 UTC = 15:05 Europe/Warsaw), so a post now would sort before it.
  const late = X.file("1600", "human-owner-01", "T009", "late-root"), early = X.file("1500", "research-agent-01", "T009", "early-member");
  const s = await boot({ view: null, extra: {
    [late]: raw({ from: "human-owner-01", date: "2026-10-15 16:00", posted: "2026-10-15T14:00:00.000Z", body: "A root dated later." }),
    [early]: raw({ from: "research-agent-01", date: "2026-10-15 15:00", posted: "2026-10-15T13:00:00.000Z", reply: late, extra: [`SUBTHREAD: ${late}`], body: "A member dated before it." }),
  } });
  try {
    assert.equal(await errorOf(s.page, early), "", "validity is monotonic: an existing member is never invalidated by order");
    assert.equal(await s.page.evaluate(n => subthreadWarning(B.msgs.find(m => m.file === n)), early), `sub-thread message sorts before its root ${late} in posting order`);
    const refused = await s.page.evaluate(root => { try { composeMessage({ sender: "research-agent-01", to: "all", scope: "room", room: "planning", tid: "T009", threadLabel: "T009-planning", slug: "now", status: "INFO", body: "now", replyTo: root, subthread: root, confirmedAgent: true }); return ""; } catch (e) { return e.message; } }, late);
    assert.match(refused, new RegExp(`SUBTHREAD: a sub-thread message must sort after its root ${late} in posting order \\(DATE, then POSTED-AT\\)`));
    // An ordinary member (root earlier) composes.
    assert.equal(await s.page.evaluate(root => { try { composeMessage({ sender: "research-agent-01", to: "all", scope: "room", room: "planning", tid: "T009", threadLabel: "T009-planning", slug: "ok", status: "INFO", body: "ok", replyTo: root, subthread: root, confirmedAgent: true }); return ""; } catch (e) { return e.message; } }, F.root), "");
  } finally { await s.cleanup(); }
});

const PROMOTED = X.file("1310", "human-owner-01", "T011", "promoted"), SIBLING = X.file("1320", "research-agent-01", "T011", "sibling");
const promoted = () => X.message({ from: "human-owner-01", tid: "T011", label: "promoted", date: "13:10", extra: [`PROMOTED-FROM: ${F.root}`], body: "Continues the sub-thread." });
test("#26 #27 R10b: a sibling that sorts earlier (an offset DATE) leaves the promoted message valid, with a warning", async () => {
  const s = await boot({ view: null, extra: { [PROMOTED]: promoted(),
    [SIBLING]: raw({ from: "research-agent-01", tid: "T011", label: "promoted", date: "2026-10-15 13:08+05:00", posted: "2026-10-15T08:08:00.000Z", body: "Backdated sibling." }) } });
  try {
    assert.equal(await errorOf(s.page, PROMOTED), "");
    assert.equal(await s.page.evaluate(n => subthreadWarning(B.msgs.find(m => m.file === n)), PROMOTED),
      `PROMOTED-FROM: ${SIBLING} is earlier in T011, so this is no longer the topic's first message; it still continues the sub-thread of ${F.root}`);
    await h.openView(s.page, "room:planning|T011");
    await expect(s.page.locator(`#feed article[data-file="${PROMOTED}"] .sub-warning`)).toHaveText(`⚠ No longer the first message of its topic (${SIBLING} is earlier); it still continues its sub-thread.`);
  } finally { await s.cleanup(); }
});

test("#27 R10a: a time correction that moves a sibling first changes neither validity nor warnings", async () => {
  const s = await boot({ view: null, extra: { [PROMOTED]: promoted(), [SIBLING]: X.message({ from: "research-agent-01", tid: "T011", label: "promoted", date: "13:20", body: "Later sibling." }) },
    files: { "time-corrections.txt": `${SIBLING} | 2026-10-15 13:05 | clock skew\n` } });
  try {
    assert.equal(await errorOf(s.page, PROMOTED), "");
    assert.equal(await s.page.evaluate(n => subthreadWarning(B.msgs.find(m => m.file === n)), PROMOTED), "");
    const r = h.boardctl(["validate", "--json", "--path", s.proj]);
    assert.deepEqual(JSON.parse(r.out).errors, [], "canonical agrees: corrections never decide validity");
  } finally { await s.cleanup(); }
});

test("#28 R10c: a sibling with an unreadable DATE is isolated and never invalidates the promoted message", async () => {
  const s = await boot({ view: null, extra: { [PROMOTED]: promoted(), [SIBLING]: X.message({ from: "research-agent-01", tid: "T011", label: "promoted", date: "13:20", body: "Bad date." }).replace("DATE: 2026-10-15 13:20", "DATE: soon") } });
  try {
    assert.equal(await errorOf(s.page, PROMOTED), "");
    assert.equal(await errorOf(s.page, SIBLING), "Invalid DATE");
    assert.equal(await s.page.evaluate(n => subthreadWarning(B.msgs.find(m => m.file === n)), PROMOTED), "");
  } finally { await s.cleanup(); }
});

test("#16 an extension answer follows its request into the sub-thread like an ANSWER", async () => {
  const s = await boot({ invalid: true, view: null });
  try {
    const issue = sub => s.page.evaluate(([sub, q]) => subthreadIssue({ THREAD: "T009-planning", STATUS: "REPLY", "REPLY-TO": q, "EXTENSION-ANSWER": "{}", ...(sub ? { SUBTHREAD: sub } : {}) }, { dkey: "room:planning", index: B.messageIndex }), [sub, F.hostq]);
    assert.equal(await issue(null), `SUBTHREAD: an ANSWER to a question inside a sub-thread must carry SUBTHREAD: ${F.root}`);
    assert.equal(await issue(F.root), "");
  } finally { await s.cleanup(); }
});

test("#39 a post into a sub-thread whose root is excluded by signing is refused, also when it replies to a member", async () => {
  const s = await boot({ config: c => { c.identity = { boardId: "0b6f7c1e-3c2d-4a59-9a43-2f1f6d1a7e10" }; c.message_signing = { version: 1, minimum: "optional", scopes: {} }; } });
  try {
    await expect.poll(() => s.page.evaluate(() => !!B.signingContext && !B.signingError)).toBe(true);
    await s.page.locator(`#feed article[data-file="${F.root}"] .sub-strip`).click();
    await expect(s.page.locator("#subPane")).toBeVisible();
    await s.page.locator(`#subFeed article[data-file="${F.first}"]`).hover();
    await s.page.locator(`#subFeed article[data-file="${F.first}"] [data-reply]`).click();
    // The root's signing decision turns excluded (as the signing pass would set it) after the reply started.
    await s.page.evaluate(name => { B.msgs.find(m => m.file === name).signing = { eligibility: "excluded", signature: "unsigned", trust: "unknown", lifecycle: "unknown", reason: "Trusted signature required" }; }, F.root);
    await s.page.fill("#subBody", "Reply to a member of an excluded root");
    await s.page.click("#subSend");
    await expect(s.page.locator("#toast")).toContainText("Sub-thread root excluded by signing requirements");
    assert.equal(await s.page.evaluate(() => window.__fakefs.dump().some(f => f.text.includes("Reply to a member of an excluded root"))), false, "nothing was written");
  } finally { await s.cleanup(); }
});

test("#37 an existing repair record whose replacement dropped SUBTHREAD is a repair error and quarantines nothing", async () => {
  const bad = X.file("1302", "research-agent-01", "T009", "bad-state"), amend = X.file("1302", "research-agent-01", "T009", "amend-0123456789abcdef0123456789abcdef");
  const original = X.message({ from: "research-agent-01", date: "13:02", reply: F.root, extra: [`SUBTHREAD: ${F.root}`, "SUBTHREAD-STATE: done"], body: "Resolved with a typo." });
  const dropped = X.message({ from: "research-agent-01", date: "13:02", body: "Resolved with a typo." });
  const record = { version: 1, target: `rooms/planning/${bad}`, sha256: require("node:crypto").createHash("sha256").update(original).digest("hex"), by: "human-owner-01", at: "2026-10-15T13:03:00.000Z", reason: "R9 replacement", replacement: `rooms/planning/${amend}` };
  const s = await boot({ view: null, extra: { [bad]: original, [amend]: dropped }, files: { "repairs/0123456789abcdef0123456789abcdef.json": JSON.stringify(record) + "\n" } });
  try {
    assert.deepEqual(await s.page.evaluate(n => [B.msgs.find(m => m.file === n).quarantined || false, B.repairErrors], bad),
      [false, [`repairs/0123456789abcdef0123456789abcdef.json: a replacement keeps the original's sub-thread headers: SUBTHREAD is ${F.root} in the original and absent in the replacement`]]);
  } finally { await s.cleanup(); }
});

test("#37 (ruling 2026-11-03) repair header clauses: keep valid, correct or drop invalid, never add, SUBTHREAD only when invalid", async () => {
  const s = await boot({ view: null });
  try {
    const head = extra => ["FROM: research-agent-01", "TO: all", ...extra, "---", "body", ""].join("\n");
    const issue = (o, r) => s.page.evaluate(([o, r]) => repairSubthreadIssue(new TextEncoder().encode(o), new TextEncoder().encode(r)), [head(o), head(r)]);
    const R = `SUBTHREAD: ${F.root}`, keep = "a replacement keeps the original's sub-thread headers: ";
    // (a) a valid value is kept byte for byte, for each of the four headers.
    assert.equal(await issue([R, "SUBTHREAD-ALSO: main", "SUBTHREAD-STATE: resolved"], [R, "SUBTHREAD-ALSO: main", "SUBTHREAD-STATE: resolved"]), "");
    assert.equal(await issue([R, "SUBTHREAD-STATE: resolved"], [R, "SUBTHREAD-STATE: open"]), `${keep}SUBTHREAD-STATE is resolved in the original and open in the replacement`);
    assert.equal(await issue([R, "SUBTHREAD-ALSO: main"], [R]), `${keep}SUBTHREAD-ALSO is main in the original and absent in the replacement`);
    assert.equal(await issue([`PROMOTED-FROM: ${F.root}`], [`PROMOTED-FROM: ${F.root2}`]), `${keep}PROMOTED-FROM is ${F.root} in the original and ${F.root2} in the replacement`);
    // (b) an invalid value may be corrected or dropped.
    assert.equal(await issue([R, "SUBTHREAD-STATE: done"], [R, "SUBTHREAD-STATE: resolved"]), "");
    assert.equal(await issue([R, "SUBTHREAD-STATE: done"], [R]), "");
    assert.equal(await issue([R, "SUBTHREAD-ALSO: yes"], [R]), "");
    assert.equal(await issue(["PROMOTED-FROM: a/b.txt"], []), "");
    // (c) never add a header the original lacked.
    assert.equal(await issue([R], [R, "SUBTHREAD-ALSO: main"]), `${keep}SUBTHREAD-ALSO is absent in the original and main in the replacement`);
    assert.equal(await issue([], [R]), `${keep}SUBTHREAD is absent in the original and ${F.root} in the replacement`);
    // (d) SUBTHREAD changes only when its original value is invalid.
    assert.equal(await issue([R], [`SUBTHREAD: ${F.root2}`]), `${keep}SUBTHREAD is ${F.root} in the original and ${F.root2} in the replacement`);
    assert.equal(await issue([`SUBTHREAD: ../${F.root}`], [R]), "");
    assert.equal(await issue([`SUBTHREAD: ../${F.root}`], []), "");
  } finally { await s.cleanup(); }
});

test("SPEC-002-080: the topic subtitle counts messages with the plural helper (1 message, not 1 messages; Polish forms)", async () => {
  const s = await boot({ view: "room:planning|T010" });
  try {
    await expect(s.page.locator("#subtitle")).toHaveText(/^1 message · last status: INFO$/);
    const pl = await s.page.evaluate(() => { S.lang = "pl"; const out = [1, 2, 5, 22].map(n => plural(n, "n_messages_one", "n_messages_few", "n_messages_many", "n_messages")); S.lang = "en"; return out; });
    assert.deepEqual(pl, ["1 wiadomość", "2 wiadomości", "5 wiadomości", "22 wiadomości"]);
    await h.openView(s.page, X.VIEW);
    await expect(s.page.locator("#subtitle")).toHaveText(/^4 messages · /);
  } finally { await s.cleanup(); }
});
