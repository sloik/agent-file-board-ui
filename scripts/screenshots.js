"use strict";
// Render the pinned canonical example through the actual viewer UI.
// The existing browser-test adapter stands in for the native folder picker.
const assert = require("node:assert/strict");
const h = require("../tests/lib/helpers");

const OUT = h.path.join(h.ROOT, "docs", "images");
const AT = new Date("2026-10-15T10:30:00Z");

async function main() {
  const tmp = h.tmpDir("afbui-screenshots-");
  const browser = await h.launch();
  try {
    h.fs.mkdirSync(OUT, { recursive: true });
    const project = h.layoutExample(tmp);
    h.fs.copyFileSync(h.path.join(h.VENDOR, ".agent-board", "GLOSSARY.md"),
      h.path.join(project, ".agent-board", "GLOSSARY.md"));
    h.fs.writeFileSync(h.path.join(project, ".agent-board/rooms/architecture/GUIDANCE.md"),
      "# Architecture room\n\nDiscuss schemas and interfaces here. Keep product decisions in the product room.\n\n- State the question or proposed change.\n- Link the owning artifact when work is complete.\n");
    h.fs.mkdirSync(h.path.join(project, ".agent-board/rooms/architecture/topics"), {recursive:true});
    h.fs.writeFileSync(h.path.join(project, ".agent-board/rooms/architecture/topics/T001.md"),
      "# Message schema guidance\n\nPreserve participant IDs and immutable history.\n\n| Post | Include |\n|---|---|\n|Proposal|Concrete fields and rationale|\n|Completion|Artifact path and validation|\n");
    // A real CLI lease in the temporary fixture demonstrates active/ghost presence.
    const session = h.boardctl(["session", "start", "implementation-agent-01", "--path", project,
      "--session", "session-doc-demo", "--summary", "Implement message rendering; can help with schema reviews.",
      "--runtime", "Documentation demo", "--at", AT.toISOString()]);
    assert.equal(session.code, 0, session.err);
    const { ctx, page, log } = await h.openPage(browser, {
      tree: h.readTree(project), rootName: "canonical-example", clock: AT,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await h.openBoardViaUi(page);
    await page.selectOption("#me", "human-owner-01");
    await page.click(".fname:has-text('architecture')");
    await page.click("[data-closed='room:architecture']");
    await page.click(".tcard[data-tk='room:architecture|T001']");
    await page.locator("#feed").evaluate(el => { el.scrollTop = 0; });
    const capture = async name => {
      await page.screenshot({ path: h.path.join(OUT, name), animations: "disabled" });
      console.log(`docs/images/${name}`);
    };
    await capture("board-overview.png");
    await page.selectOption("#me", "implementation-agent-01");
    await capture("board-identity.png");
    await page.click("#presenceOpen");
    await capture("board-presence.png");
    await page.click("#presenceClose");
    await page.selectOption("#me", "human-owner-01");
    await page.click("#guidanceOpen");
    await page.waitForFunction(()=>document.querySelectorAll("#guidanceDocs h1").length===2);
    await capture("board-guidance.png");
    await page.click("#guidanceClose");

    await page.selectOption("#cStatus", "DECISION-NEEDED");
    await page.fill("#cBody", "Please confirm the schema before implementation starts.\n\nNext action: @rese");
    await page.waitForSelector("#bodySuggestions.show");
    await page.keyboard.press("Enter");
    assert.match(await page.inputValue("#cBody"), /@research-agent-01/);
    await capture("board-composer.png");
    await page.keyboard.press("Escape");
    await page.fill("#cBody", "");
    await page.selectOption("#cStatus", "INFO");
    await page.emulateMedia({ colorScheme: "dark" });
    await capture("board-dark.png");
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1440, height: 1120 });
    await page.click("#gear");
    await capture("board-settings.png");
    await page.click("#sClose");
    assert.deepEqual(log.pageErrors, []);
    assert.deepEqual(log.consoleErrors, []);
    await ctx.close();

    // The canonical snapshot predates rich questions. Add one clearly separate
    // documentation-only message to the temporary copy using the standard CLI.
    const questionFile = h.path.join(tmp, "question.json");
    h.fs.writeFileSync(questionFile, JSON.stringify({
      id: "release-target", type: "single", prompt: "Where should the next release go?",
      options: [
        { id: "staging", label: "Staging — verify the build first" },
        { id: "production", label: "Production — publish the verified build" },
        { id: "hold", label: "Hold — wait for the remaining review" },
      ],
    }));
    const result = h.boardctl(["post", "--path", project,
      "--from", "implementation-agent-01", "--to", "human-owner-01",
      "--scope", "room", "--room", "delivery", "--thread", "T004",
      "--slug", "release-target", "--status", "QUESTION", "--language", "en",
      "--content-type", "text/markdown", "--question-file", questionFile,
      "--at", "2026-10-15 12:30:00.000",
      "--body", "## Release readiness\n\nThe implementation is ready for review.\n\n- **Validation**\n  - Viewer and protocol tests passed.\n  - The release tag matches the board format.\n\n| Target | Next action |\n| --- | --- |\n| Staging | Verify with the team |\n| Production | Publish after approval |\n\n> Choose the next step below. Your answer becomes a new reply; the question stays intact."]);
    assert.equal(result.code, 0, result.err);
    const validation = h.boardctl(["validate", "--path", project]);
    assert.equal(validation.code, 0, validation.err);
    const rich = await h.openPage(browser, {
      tree: h.readTree(project), rootName: "canonical-example", clock: AT,
    });
    await rich.page.setViewportSize({ width: 1440, height: 1120 });
    await h.openBoardViaUi(rich.page);
    await rich.page.selectOption("#me", "human-owner-01");
    await rich.page.click(".tcard[data-tk='room:delivery|T004']");
    await rich.page.locator(".choice-form input[value=staging]").check();
    await rich.page.locator("#feed").evaluate(el => { el.scrollTop = 0; });
    await rich.page.screenshot({ path: h.path.join(OUT, "board-choices.png"), animations: "disabled" });
    console.log("docs/images/board-choices.png");
    assert.deepEqual(rich.log.pageErrors, []);
    assert.deepEqual(rich.log.consoleErrors, []);
    await rich.ctx.close();

    const htmlBody = `<section>
<h2>Implementation handoff</h2>
<p>The <strong>message renderer</strong> is ready for <em>review</em>. This report uses nested HTML.</p>
<h3>Completed work</h3>
<ul><li>Content rendering<ul><li>Nested lists, tables and quotations</li><li>Literal code and expandable notes</li></ul></li><li>Structured answers remain linked to their original question.</li></ul>
<table><thead><tr><th>Area</th><th>Result</th><th>Next action</th></tr></thead><tbody><tr><td>Markdown</td><td><strong>Ready</strong></td><td>Review the sample</td></tr><tr><td>HTML</td><td><strong>Ready</strong></td><td>Inspect this handoff</td></tr></tbody></table>
<blockquote>Record the decision in the owning project document after review.</blockquote>
<details open><summary>Validation command</summary><pre><code>./boardctl validate --path /project</code></pre><p>The source remains a readable, immutable message file.</p></details>
</section>`;
    const htmlPost = h.boardctl(["post", "--path", project,
      "--from", "implementation-agent-01", "--to", "human-owner-01",
      "--scope", "room", "--room", "reports", "--thread", "T005",
      "--slug", "implementation-handoff", "--status", "DONE", "--language", "en",
      "--content-type", "text/html", "--at", "2026-10-15 12:31:00.000", "--body", htmlBody]);
    assert.equal(htmlPost.code, 0, htmlPost.err);
    const htmlValidation = h.boardctl(["validate", "--path", project]);
    assert.equal(htmlValidation.code, 0, htmlValidation.err);
    const html = await h.openPage(browser, {
      tree: h.readTree(project), rootName: "canonical-example", clock: AT,
    });
    await html.page.setViewportSize({ width: 1440, height: 1120 });
    await h.openBoardViaUi(html.page);
    await html.page.selectOption("#me", "human-owner-01");
    await html.page.click(".tcard[data-tk='room:reports|T005']");
    await html.page.locator("#feed [data-more]").click();
    const content = html.page.locator("#feed .body");
    assert.equal(await content.evaluate(el => el.classList.contains("clamp")), false);
    assert.equal(await content.locator("table tbody tr").count(), 2);
    assert.equal(await content.locator("ul ul li").count(), 2);
    assert.equal(await content.locator("details[open] code").textContent(), "./boardctl validate --path /project");
    await html.page.locator("#feed").evaluate(el => { el.scrollTop = 0; });
    await html.page.screenshot({ path: h.path.join(OUT, "board-html.png"), animations: "disabled" });
    console.log("docs/images/board-html.png");
    assert.deepEqual(html.log.pageErrors, []);
    assert.deepEqual(html.log.consoleErrors, []);
    assert.equal(html.log.requests.filter(url => !url.startsWith("file:")).length, 0);
    await html.ctx.close();
  } finally {
    await browser.close();
    h.fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
