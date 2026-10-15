"use strict";
// AC9: README states plainly that this is the UI for agent-file-board, documents support and the authorship caveat.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./lib/helpers");

const readme = h.fs.readFileSync(h.path.join(h.ROOT, "README.md"), "utf8");
test("AC9: first paragraph names the standard and links it", () => {
  const body = readme.split("\n").filter(l => !l.startsWith("#")).join("\n").trim();
  const first = body.split(/\n\s*\n/)[0];
  assert.match(first, /UI \(viewer and composer\) for \[agent-file-board\]\(https:\/\/github\.com\/sloik\/agent-file-board\)/);
  assert.match(first, /not a separate protocol/);
});
test("AC9: documents browser support, authorship caveat, versioning, licence and spec location", () => {
  for (const re of [/Browser support/i, /not authentication/i, /requires explicit confirmation/i, /vX\.Y\.Z/, /submodule/i,
    /MIT/, /specs\/SPEC-002-board-viewer\.md/, /npm test/]) assert.match(readme, re);
});
