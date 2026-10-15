"use strict";
// Non-vacuity: each guard check must go RED when the guard it protects is deliberately broken.
// A mutated copy of board.html is written to a temp dir; the same check used by the real tests
// is run against it and must report at least one problem.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");
const c = require("./lib/checks");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

const SRC = h.fs.readFileSync(h.BOARD_HTML, "utf8");
function mutate(from, to) {
  const n = SRC.split(from).length - 1;
  assert.equal(n, 1, `mutation anchor must occur exactly once (found ${n}): ${from}`);
  const dir = h.tmpDir("afbui-mut-");
  const p = h.path.join(dir, "board.html");
  h.fs.writeFileSync(p, SRC.replace(from, to));
  return p;
}

const MUTATIONS = [
  ["write-path guard removed", "function guardWritePath(rel){", "function guardWritePath(rel){ return;", c.checkWriteGuard],
  ["no-overwrite guard removed", "async function guardNoOverwrite(dir, name){", "async function guardNoOverwrite(dir, name){ return;", c.checkNoOverwrite],
  ["agent confirmation guard removed (core)", "function guardAgent(person, confirmed){", "function guardAgent(person, confirmed){ return;", c.checkAgentConfirmation],
  ["agent confirmation dialog removed (UI)", 'if(!window.confirm(t("confirm_agent",{name:person.name}))) return;', "", c.checkAgentConfirmation],
  ["registered-sender guard removed", "if(!B || !B.people[sender]) throw", "if(!B || false) throw", c.checkRegisteredSender],
  ["PL string key dropped", 's_done:"Gotowe", ', "", c.checkKeyDiff],
  ["schedule always on", "function inSchedule(set, now, tz){", "function inSchedule(set, now, tz){ return true;", c.checkSchedulePause],
  ["network resource added", '<div class="toast" id="toast"', '<img src="https://example.invalid/x.png"><div class="toast" id="toast"', c.checkNoNetwork],
  ["startup error injected (smoke)", "  wire();\n  renderChrome();\n  setInterval(tick, 1000);", "  wire();\n  notDefinedAtInit();\n  renderChrome();\n  setInterval(tick, 1000);", c.checkSmoke],
  ["reply handler detached (smoke)", '$("#replyClear").onclick = clearReply;', "", c.checkSmoke],
];
for (const [name, from, to, check] of MUTATIONS) {
  test(`mutation goes red: ${name}`, async () => {
    const html = mutate(from, to);
    const problems = await check(browser, html);
    assert.ok(problems.length > 0, "check stayed green on a broken copy - the guard test is vacuous");
  });
}
test("control: unmutated board.html is green for the same checks", async () => {
  for (const check of new Set(MUTATIONS.map(m => m[3]))) assert.deepEqual(await check(browser, h.BOARD_HTML), []);
});
