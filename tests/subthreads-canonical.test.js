"use strict";
// SPEC-002-077 AC1/AC2/AC6: the viewer and the pinned canonical CLI (SPEC-002-076, agent-file-board 3.4) agree.
// One shared fixture set is judged by both validators, and the bytes every sub-thread writer produces are
// accepted by canonical `boardctl validate` and read back by `boardctl recent --subthread`.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { expect } = require("playwright/test");
const h = require("./lib/helpers");
const X = require("./lib/subthread-fixture");
const { F } = X;

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });
const AT = new Date("2026-10-15T14:05:00Z");

function canonical(proj) {
  const r = h.boardctl(["validate", "--json", "--path", proj]);
  assert.ok(r.out, "boardctl validate --json printed nothing: " + r.err);
  return JSON.parse(r.out);
}
async function viewerVerdicts(proj) {
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(proj), fixedTime: AT });
  try {
    await h.openBoardViaUi(page);
    return await page.evaluate(() => ({
      errors: Object.fromEntries(B.msgs.filter(m => m.dir === "planning").map(m => [m.file, m.validationError || ""])),
      orphans: [...subthreadsOf().values()].filter(subthreadOrphan).flatMap(x => x.members.map(m => m.file)),
    }));
  } finally { await ctx.close(); }
}
const lineFor = (lines, name) => lines.filter(l => l.includes("/planning/" + name + ":"));

test("AC1 the pinned canonical board is 3.4 and knows sub-threads", () => {
  const convention = h.fs.readFileSync(h.path.join(h.VENDOR, ".agent-board", "CONVENTION.md"), "utf8");
  assert.match(convention, /^Version: 3\.4\.\d+$/m);
  assert.match(convention, /Sub-threads \(3\.4\)/);
  assert.match(h.boardctl(["post", "--help"]).out, /--subthread ROOT/);
});

test("AC2 parity: every shared fixture gets the same verdict and rule from the viewer and canonical validate", async () => {
  const { proj } = X.subthreadBoard({ invalid: true });
  try {
    const report = canonical(proj), viewer = await viewerVerdicts(proj);
    assert.equal(report.valid, false);
    let compared = 0;
    for (const [name, error] of Object.entries(viewer.errors)) {
      const lines = lineFor(report.errors, name);
      if (!error) { assert.deepEqual(lines, [], `${name}: valid in the viewer, canonical says ${lines}`); continue; }
      assert.equal(lines.length, 1, `${name}: invalid in the viewer (${error}), canonical lines: ${JSON.stringify(lines)}`);
      if (/^(SUBTHREAD|PROMOTED-FROM)/.test(error)) { assert.ok(lines[0].endsWith(": " + error), `${name}: same rule\n viewer:    ${error}\n canonical: ${lines[0]}`); compared++; }
    }
    for (const name of Object.keys(X.INVALID)) assert.ok(viewer.errors[name], name + " is rejected");
    assert.equal(compared, Object.keys(X.INVALID).length, "every sub-thread rule was compared word for word");
    for (const name of [...Object.keys(X.VALID), ...Object.keys(X.SUPPORT)]) assert.equal(viewer.errors[name], "", name + " is valid");
    assert.deepEqual(report.warnings, []);
  } finally { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("AC2 parity: a deleted root leaves its valid members orphaned in both, listed and never dropped", async () => {
  const { proj, room } = X.subthreadBoard();
  try {
    h.fs.rmSync(h.path.join(room, F.root));
    const report = canonical(proj), viewer = await viewerVerdicts(proj);
    // Members replying to the deleted root lose their REPLY-TO target in both validators; the member replying to
    // another member stays valid and is the orphan.
    // SPEC-002-080 (audit #10): the same words as canonical check_message.
    for (const name of [F.first, F.question]) {
      assert.equal(viewer.errors[name], "REPLY-TO target is missing", name);
      assert.deepEqual(lineFor(report.errors, name).map(l => l.slice(l.indexOf("/planning/" + name + ": ") + ("/planning/" + name + ": ").length)), [viewer.errors[name]], name);
    }
    assert.equal(viewer.errors[F.also], ""); assert.deepEqual(lineFor(report.errors, F.also), []);
    assert.deepEqual(viewer.orphans, [F.also]);
    assert.ok(report.warnings.some(w => w.includes(`/planning/${F.also}: orphaned sub-thread: root ${F.root} is missing`)), JSON.stringify(report.warnings));
  } finally { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("AC6 bytes from every writer in the sub-thread destination validate canonically and read back as members", async () => {
  const name = X.file("1301", "research-agent-01", "T009", "host-question"), formName = X.file("1302", "implementation-agent-01", "T009", "release-form");
  const FORM = h.fs.readFileSync(h.path.join(h.VENDOR, "examples/openui-report/form-question.json"), "utf8").trim();
  const { proj } = X.subthreadBoard({ extra: {
    [name]: X.message({ from: "research-agent-01", to: "human-owner-01", date: "13:01", reply: F.root, status: "QUESTION", extra: [`SUBTHREAD: ${F.root}`, `QUESTION: ${X.HOST_QUESTION}`], body: "Where do we host?" }),
    [formName]: X.message({ from: "implementation-agent-01", to: "human-owner-01", date: "13:02", reply: F.root, status: "DECISION-NEEDED", extra: [`SUBTHREAD: ${F.root}`, `QUESTION: ${JSON.stringify(JSON.parse(FORM))}`], body: "Synthetic release configuration. Submit typed fields as a new reply." }),
  } });
  const { ctx, page } = await h.openPage(browser, { tree: h.readTree(proj), fixedTime: AT, dialog: "accept" });
  const out = h.path.join(h.tmpDir("afb-subthread-out-"), "board");
  try {
    await h.openBoardViaUi(page); await page.selectOption("#me", "human-owner-01"); await h.openView(page, X.VIEW);
    // SPEC-002-078: an open sub-thread is the pane; its composer (#subBody/#subSend) is the sub-thread writer.
    await page.locator(`#feed article[data-file="${F.root}"] .sub-strip`).click();
    const post = async text => { await page.fill("#subBody", text); await page.click("#subSend"); await expect.poll(() => page.evaluate(t => B.msgs.some(m => m.body === t), text)).toBe(true); };
    await post("Canonical check: a sub-thread post");
    await page.locator(`#subFeed article[data-file="${F.question}"]`).hover(); await page.locator(`#subFeed article[data-file="${F.question}"] [data-reply]`).click();
    await post("Canonical check: a reply to a member");
    const form = page.locator(`#subFeed article[data-file="${name}"] .choice-form`);
    await form.locator("input[value=local]").check(); await form.locator("[type=submit]").click();
    await expect.poll(() => page.evaluate(() => B.msgs.some(m => m.answer && m.subthread))).toBe(true);
    // A typed form answer (version 2) to a member form, filled as in tests/forms.test.js.
    const field = id => page.locator(`#subFeed article[data-file="${formName}"] [data-form-field='${id}']`);
    await page.locator(`#subFeed article[data-file="${formName}"] .typed-form`).waitFor();
    await field("owner").locator("input").fill("Demo owner"); await field("notes").locator("textarea").fill("Keep original source unchanged.");
    await field("tasks").locator("[data-row=schema][data-column=hours] input").fill("3"); await field("tasks").locator("[data-row=viewer][data-column=approved] input").check();
    await field("checks").getByLabel("Browser tests").check(); await field("labels").getByRole("button", { name: "Needs review", exact: true }).click();
    await page.locator(`#subFeed article[data-file="${formName}"] .form-buttons [type=submit]`).click();
    await expect.poll(() => page.evaluate(n => B.msgs.some(m => m.replyTo === n && m.answer && m.subthread), formName)).toBe(true);
    await h.dumpFakeFs(page, out);
    const board = h.path.join(out, ".agent-board"), written = h.fs.readdirSync(h.path.join(board, "rooms", "planning")).filter(f => !Object.keys(X.VALID).includes(f) && f !== name && f !== formName);
    assert.equal(written.length, 4, written.join(","));
    const report = canonical(h.path.join(out));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.warnings, []);
    const recent = h.boardctl(["recent", "--path", out, "--participant", "human-owner-01", "--room", "planning", "--subthread", F.root, "--limit", "50"]);
    assert.equal(recent.code, 0, recent.err);
    const rows = JSON.parse(recent.out).messages || JSON.parse(recent.out);
    for (const file of written) {
      const row = rows.find(r => String(r.path || r.file).endsWith(file));
      assert.ok(row, file + " is in the canonical sub-thread"); assert.equal(row.subthread, F.root);
    }
  } finally { await ctx.close(); h.fs.rmSync(h.path.dirname(out), { recursive: true, force: true }); h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("SPEC-002-080 #10: an answer whose question file is missing gets canonical's ANSWER wording in both", async () => {
  const answer = X.file("1301", "human-owner-01", "T009", "answer-gone");
  const { proj, room } = X.subthreadBoard({ invalid: true, extra: {
    [answer]: X.message({ from: "human-owner-01", to: "research-agent-01", date: "13:01", reply: "2026-10-15_1100_research-agent-01_T009_gone.txt", status: "REPLY", extra: ['ANSWER: {"question":"host","selected":["cloud"]}'], body: "answer to a deleted question" }),
  } });
  try {
    const report = canonical(proj), viewer = await viewerVerdicts(proj);
    assert.equal(viewer.errors[answer], "ANSWER reply target is missing");
    assert.deepEqual(lineFor(report.errors, answer), [report.errors.find(l => l.endsWith(`/planning/${answer}: ANSWER reply target is missing`))]);
  } finally { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("SPEC-002-080 #35: a quarantined root leaves its members valid and orphaned in both, with the same warning", async () => {
  // The root is invalid (unknown status), withdrawn by a hash-bound repair record; its members stay valid.
  const { proj, room } = X.subthreadBoard();
  try {
    const rootPath = h.path.join(room, F.root), text = h.fs.readFileSync(rootPath, "utf8").replace("STATUS: INFO", "STATUS: BOGUS");
    h.fs.writeFileSync(rootPath, text);
    const r = h.boardctl(["repair", "--path", proj, "--message", `rooms/planning/${F.root}`, "--by", "human-owner-01", "--reason", "Unknown status"]);
    assert.equal(r.code, 0, r.err);
    const report = canonical(proj), viewer = await viewerVerdicts(proj);
    for (const name of [F.first, F.also, F.question]) { assert.equal(viewer.errors[name], "", name); assert.deepEqual(lineFor(report.errors, name), [], name); }
    assert.deepEqual(viewer.orphans, [F.first, F.also, F.question]);
    for (const name of [F.first, F.also, F.question]) assert.ok(report.warnings.includes(`rooms/planning/${name}: orphaned sub-thread: root ${F.root} is quarantined by a repair record`), JSON.stringify(report.warnings));
  } finally { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});

test("SPEC-002-080 #30: an unreadable PROMOTED-FROM origin gets canonical's parse error for the origin in both", async () => {
  const broken = X.file("1305", "human-owner-01", "T009", "broken-origin"), promoted = X.file("1410", "human-owner-01", "T011", "promoted-broken");
  const { proj } = X.subthreadBoard({ extra: {
    [broken]: "FROM: human-owner-01\nTO: all\nno header separator here\n",
    [promoted]: X.message({ from: "human-owner-01", tid: "T011", label: "promoted", date: "14:10", extra: [`PROMOTED-FROM: ${broken}`], body: "Promoted from an unreadable root." }),
  } });
  try {
    const report = canonical(proj), viewer = await viewerVerdicts(proj);
    assert.equal(viewer.errors[promoted], `rooms/planning/${broken}: missing header separator`);
    // Canonical names the origin by its full path; the shared fixtures record it relative to .agent-board/, as the viewer reports it.
    const lines = lineFor(report.errors, promoted);
    assert.equal(lines.length, 1, JSON.stringify(report.errors));
    assert.match(lines[0], new RegExp(`/planning/${promoted}: /.+/planning/${broken}: missing header separator$`));
    assert.ok(lines[0].endsWith("/.agent-board/" + viewer.errors[promoted]), lines[0]);
  } finally { h.fs.rmSync(h.path.dirname(proj), { recursive: true, force: true }); }
});
