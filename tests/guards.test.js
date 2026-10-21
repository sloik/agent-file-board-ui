"use strict";
// AC1 (no network, light+dark), smoke (no pageerror), AC8 (write guards), AC4 refusal checks, AC7 key diff, scheduler pause.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");
const c = require("./lib/checks");
const fs = require("node:fs");

let browser;
before(async () => { browser = await h.launch(); });
after(async () => { await browser.close(); });

test("AC1: no network requests with daily checks disabled, in light and dark mode", async () => {
  assert.deepEqual(await c.checkNoNetwork(browser, h.BOARD_HTML), []);
});
test("AC1: source declares no external resources", () => {
  const src = fs.readFileSync(h.BOARD_HTML, "utf8");
  assert.doesNotMatch(src, /<script[^>]+\bsrc=/i);
  assert.doesNotMatch(src, /<link\b/i);
  assert.doesNotMatch(src, /@import|url\(\s*["']?https?:/i);
  assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
});
test("smoke: no pageerror or console error; handlers attached", async () => {
  assert.deepEqual(await c.checkSmoke(browser, h.BOARD_HTML), []);
});
test("AC8: no write path outside rooms/ or direct/ (attempts refused, nothing changed)", async () => {
  assert.deepEqual(await c.checkWriteGuard(browser, h.BOARD_HTML), []);
});
test("AC8: an existing message is never overwritten", async () => {
  assert.deepEqual(await c.checkNoOverwrite(browser, h.BOARD_HTML), []);
});
test("AC4: choosing an agent sender requires confirmation", async () => {
  assert.deepEqual(await c.checkAgentConfirmation(browser, h.BOARD_HTML), []);
});
test("AC4: an unregistered sender is refused", async () => {
  assert.deepEqual(await c.checkRegisteredSender(browser, h.BOARD_HTML), []);
});
test("AC7: EN and PL string tables have identical keys", async () => {
  assert.deepEqual(await c.checkKeyDiff(browser, h.BOARD_HTML), []);
});
test("AC6: scheduler pauses outside the schedule", async () => {
  assert.deepEqual(await c.checkSchedulePause(browser, h.BOARD_HTML), []);
});
