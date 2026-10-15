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
  } finally {
    await browser.close();
    h.fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
