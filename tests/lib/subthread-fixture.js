"use strict";
// SPEC-002-077: a board with sub-threads (SPEC-002-076 headers) on top of the canonical example, shared by
// tests/subthreads.test.js and the visual scenes. Room `planning`, topic T009; one more topic T010 for the
// "root in another thread" rule. Valid files only unless `invalid` is set.
const h = require("./helpers");

const ROOM = "planning";
const file = (time, sender, tid, slug) => `2026-10-15_${time}_${sender}_${tid}_${slug}.txt`;
const F = {
  root: file("1200", "human-owner-01", "T009", "pick-database"),
  first: file("1210", "research-agent-01", "T009", "compare-options"),
  also: file("1220", "implementation-agent-01", "T009", "benchmark-summary"),
  question: file("1230", "research-agent-01", "T009", "ask-budget"),
  plain: file("1240", "human-owner-01", "T009", "plain-reply"),
  root2: file("1250", "implementation-agent-01", "T009", "pick-queue"),
  resolved: file("1255", "research-agent-01", "T009", "queue-outcome"),
  other: file("1300", "human-owner-01", "T010", "other-topic"),
  hostq: file("1350", "research-agent-01", "T009", "host-question"),
  // SPEC-002-080 (audit #13, #14): a root question of its own, answered in the main flow and inside its sub-thread.
  rootq: file("1360", "implementation-agent-01", "T009", "pick-region"),
  answerMain: file("1370", "human-owner-01", "T009", "region-main"),
  answerJoined: file("1380", "human-owner-01", "T009", "region-joined"),
  // SPEC-002-080 (audit #29): PROMOTED-FROM origins that are missing, a member, or in another room (each a topic's first message).
  promotedGone: file("1410", "human-owner-01", "T011", "promoted-gone"),
  promotedMember: file("1420", "human-owner-01", "T012", "promoted-member"),
  promotedCrossRoom: file("1430", "human-owner-01", "T013", "promoted-cross-room"),
  otherRoom: "2026-09-26_1100_human-owner-01_T003_language-policy-question.txt",
};
// [name, headers..., body]; POSTED-AT keeps the posting order exact.
function message({ from, to = "all", tid = "T009", label = "planning", date, posted, reply = "-", status = "INFO", extra = [], body }) {
  return [`FROM: ${from}`, `TO: ${to}`, "SCOPE: ROOM", `ROOM: ${ROOM}`, `THREAD: ${tid}-${label}`, `DATE: 2026-10-15 ${date}`, "LANGUAGE: en",
    `REPLY-TO: ${reply}`, `STATUS: ${status}`, `POSTED-AT: 2026-10-15T${date}:00.000Z`, ...extra, "---", body, ""].join("\n");
}
const VALID = {
  [F.root]: message({ from: "human-owner-01", date: "12:00", body: "Which database should the planning service use?" }),
  [F.first]: message({ from: "research-agent-01", date: "12:10", reply: F.root, status: "REPLY", extra: [`SUBTHREAD: ${F.root}`], body: "Postgres and SQLite are the two candidates." }),
  [F.also]: message({ from: "implementation-agent-01", date: "12:20", reply: F.first, extra: [`SUBTHREAD: ${F.root}`, "SUBTHREAD-ALSO: main"], body: "Benchmark summary: Postgres is 3x faster on our load." }),
  [F.question]: message({ from: "research-agent-01", to: "human-owner-01", date: "12:30", reply: F.root, status: "QUESTION", extra: [`SUBTHREAD: ${F.root}`], body: "What is the hosting budget?" }),
  [F.plain]: message({ from: "human-owner-01", date: "12:40", reply: F.first, status: "REPLY", body: "A plain reply to a sub-thread message stays in the topic." }),
  [F.root2]: message({ from: "implementation-agent-01", date: "12:50", body: "Which queue should we use?" }),
  [F.resolved]: message({ from: "research-agent-01", date: "12:55", reply: F.root2, status: "DONE", extra: [`SUBTHREAD: ${F.root2}`, "SUBTHREAD-STATE: resolved"], body: "Outcome: keep the file queue.\nDetails follow." }),
  [F.other]: message({ from: "human-owner-01", tid: "T010", label: "other", date: "13:00", body: "Another topic." }),
};
// A valid member question, present with the invalid set so an unmarked answer to it can be checked.
const HOST_QUESTION = JSON.stringify({ id: "host", type: "single", prompt: "Where do we host?", options: [{ id: "cloud", label: "Cloud" }, { id: "local", label: "Local" }] });
const REGION_QUESTION = JSON.stringify({ id: "region", type: "single", prompt: "Which region?", options: [{ id: "eu", label: "EU" }, { id: "us", label: "US" }] });
const SUPPORT = {
  [F.hostq]: message({ from: "research-agent-01", to: "human-owner-01", date: "13:50", reply: F.root, status: "QUESTION", extra: [`SUBTHREAD: ${F.root}`, `QUESTION: ${HOST_QUESTION}`], body: "Where do we host?" }),
  [F.rootq]: message({ from: "implementation-agent-01", to: "human-owner-01", date: "13:52", status: "QUESTION", extra: [`QUESTION: ${REGION_QUESTION}`], body: "Which region?" }),
  [F.answerMain]: message({ from: "human-owner-01", to: "implementation-agent-01", date: "13:54", reply: F.rootq, status: "REPLY", extra: ['ANSWER: {"question":"region","selected":["eu"]}'], body: "EU, in the main flow." }),
  [F.answerJoined]: message({ from: "human-owner-01", to: "implementation-agent-01", date: "13:56", reply: F.rootq, status: "REPLY", extra: [`SUBTHREAD: ${F.rootq}`, 'ANSWER: {"question":"region","selected":["us"]}'], body: "US, joining the sub-thread." }),
};
// One file per SPEC-002-076 AC2 rule; each must be isolated as invalid (viewer) and rejected (canonical validate).
const inv = (slug, o) => [file("1400", "human-owner-01", "T009", slug), message({ from: "human-owner-01", date: "14:00", ...o })];
const INVALID = Object.fromEntries([
  inv("bad-root-name", { reply: F.root, extra: ["SUBTHREAD: ../" + F.root], body: "slash" }),
  inv("bad-root-ext", { reply: F.root, extra: ["SUBTHREAD: notes.md"], body: "non txt" }),
  inv("root-is-member", { reply: F.first, extra: [`SUBTHREAD: ${F.first}`], body: "nested" }),
  inv("root-other-thread", { reply: F.root, extra: [`SUBTHREAD: ${F.other}`], body: "other thread" }),
  inv("reply-dash", { extra: [`SUBTHREAD: ${F.root}`], body: "no reply" }),
  inv("reply-outside", { reply: F.plain, extra: [`SUBTHREAD: ${F.root}`], body: "outside" }),
  inv("also-without", { reply: F.root, extra: ["SUBTHREAD-ALSO: main"], body: "also alone" }),
  inv("state-without", { reply: F.root, extra: ["SUBTHREAD-STATE: resolved"], body: "state alone" }),
  inv("also-value", { reply: F.root, extra: [`SUBTHREAD: ${F.root}`, "SUBTHREAD-ALSO: yes"], body: "bad also" }),
  inv("state-value", { reply: F.root, extra: [`SUBTHREAD: ${F.root}`, "SUBTHREAD-STATE: done"], body: "bad state" }),
  inv("closed-member", { reply: F.root, status: "CLOSED", extra: [`SUBTHREAD: ${F.root}`], body: "closed" }),
  // SPEC-002-080: was mislabelled `promoted-not-first`; it is a T009 message naming a T009 root (audit #25).
  inv("promoted-same-topic", { extra: [`PROMOTED-FROM: ${F.root}`], body: "promoted into its own topic" }),
  inv("promoted-bad-name", { extra: ["PROMOTED-FROM: a/b.txt"], body: "promoted slash" }),
  inv("promoted-with-subthread", { reply: F.root, extra: [`SUBTHREAD: ${F.root}`, `PROMOTED-FROM: ${F.root}`], body: "both" }),
  // SPEC-002-080 (audit #9, #14): a member replying into another sub-thread; an answer to a main-flow question carrying a marker.
  inv("reply-crossed", { reply: F.resolved, extra: [`SUBTHREAD: ${F.root}`], body: "crossed into another sub-thread" }),
  inv("answer-wrong-marker", { to: "implementation-agent-01", reply: F.rootq, status: "REPLY", extra: [`SUBTHREAD: ${F.root}`, 'ANSWER: {"question":"region","selected":["eu"]}'], body: "wrong marker" }),
  inv("answer-unmarked", { to: "research-agent-01", reply: F.hostq, status: "REPLY", extra: ['ANSWER: {"question":"host","selected":["cloud"]}'], body: "unmarked answer" }),
]);
// Topic first messages whose PROMOTED-FROM origin is wrong (audit #29); invalid, judged like INVALID.
const first = (name, tid, origin) => [name, message({ from: "human-owner-01", tid, label: "promoted", date: "14:10", extra: [`PROMOTED-FROM: ${origin}`], body: "Promoted topic." })];
Object.assign(INVALID, Object.fromEntries([
  first(F.promotedGone, "T011", "2026-10-15_1100_human-owner-01_T009_gone.txt"),
  first(F.promotedMember, "T012", F.first),
  first(F.promotedCrossRoom, "T013", F.otherRoom),
]));

// Writes the example board plus the sub-thread files into a fresh temp project; returns {proj, room}.
function subthreadBoard({ invalid = false, extra = {} } = {}) {
  const proj = h.layoutExample(h.tmpDir("afb-subthreads-")), room = h.path.join(proj, ".agent-board", "rooms", ROOM);
  h.fs.mkdirSync(room, { recursive: true });
  for (const [name, text] of Object.entries({ ...VALID, ...(invalid ? { ...SUPPORT, ...INVALID } : {}), ...extra })) h.fs.writeFileSync(h.path.join(room, name), text);
  return { proj, room };
}
const VIEW = `room:${ROOM}|T009`;
const KEY = name => `room:${ROOM}|${name}`;
module.exports = { ROOM, F, VALID, INVALID, SUPPORT, HOST_QUESTION, VIEW, KEY, message, file, subthreadBoard };
