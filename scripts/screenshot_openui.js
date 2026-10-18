"use strict";
// Render and validate documentation examples using temporary boards only.
const h=require("../tests/lib/helpers"),assert=require("node:assert/strict");
const AT=new Date("2026-10-18T10:30:00Z"),FILE="2026-10-18_1230_implementation-agent-01_T004_report.txt";
const readJson=path=>JSON.parse(h.fs.readFileSync(path,"utf8"));
(async()=>{
  const tmp=h.tmpDir(),project=h.layoutExample(tmp),dir=h.path.join(project,".agent-board/rooms/reports");h.fs.mkdirSync(dir);
  const report=readJson(h.path.join(h.VENDOR,"examples/openui-report/report.json"));
  const question=readJson(h.path.join(h.VENDOR,"examples/openui-report/question.json"));
  const examples=h.path.join(h.ROOT,"docs/examples/openui");
  function add(file,thread,ui,body,q){
    h.fs.writeFileSync(h.path.join(dir,file),`FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: ${thread}\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: ${q?"DECISION-NEEDED":"INFO"}\nUI: ${JSON.stringify(ui)}\n${q?`QUESTION: ${JSON.stringify(q)}\n`:""}---\n${body}\n`);
  }
  add(FILE,"T004-release-review",report,"170 tests passed; 2 failed. Choose Fix failures or Postpone release.",question);
  add("2026-10-18_1230_implementation-agent-01_T005_tasks-versus-plan.txt","T005-tasks-versus-plan",readJson(h.path.join(examples,"signed-chart.json")),"Design completed 3 more tasks than planned; Implementation completed 2 fewer; Review met the plan.");
  add("2026-10-18_1230_implementation-agent-01_T006_delivery-checklist.txt","T006-delivery-checklist",readJson(h.path.join(examples,"table.json")),"Schema and viewer are ready; release needs an owner decision.");
  const validation=h.boardctl(["validate","--path",project]);assert.equal(validation.code,0,validation.err);
  const original=h.fs.readFileSync(h.path.join(dir,FILE),"utf8");
  const browser=await h.launch();try{
    const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),clock:AT});
    await page.clock.pauseAt(new Date("2026-10-18T10:30:01Z"));
    await page.emulateMedia({colorScheme:"light"});await page.setViewportSize({width:1440,height:1400});
    await h.openBoardViaUi(page);await page.selectOption("#me","human-owner-01");await page.click(".fname:has-text('reports')");
    const topic=async id=>{await page.click(`.tcard[data-tk='room:reports|${id}']`);await page.waitForSelector(".report-content");};
    const shot=async name=>{await page.locator("#feed").evaluate(el=>el.scrollTop=0);await page.screenshot({path:h.path.join(h.ROOT,"docs/images",name)});};
    await topic("T004");await page.waitForSelector(".report-content table");
    await page.locator(".choice-form input[value=fix]").check();
    await page.locator(".choice-form textarea").fill("Retest before release.");
    await shot("board-openui.png");
    await page.emulateMedia({colorScheme:"dark"});await page.setViewportSize({width:375,height:2150});
    await shot("board-openui-phone.png");
    await page.emulateMedia({colorScheme:"light"});await page.setViewportSize({width:1440,height:1400});
    await page.locator(".choice-form [type=submit]").click();
    await page.waitForFunction(()=>window.__boardTest.getModel().msgs.some(m=>m.h.ANSWER?.includes('"question":"release-review"') && m.bodyLoaded));
    const answer=(await page.evaluate(()=>window.__fakefs.dump())).find(f=>f.path.endsWith(".txt") && f.text.includes('ANSWER: {"question":"release-review"'));
    assert.ok(answer);assert.deepEqual(JSON.parse(answer.text.match(/^ANSWER: (.*)$/m)[1]),{question:"release-review",selected:["fix"],text:"Retest before release."});
    assert.equal(await page.evaluate(file=>window.__fakefs.read(".agent-board/rooms/reports/"+file),FILE),original);
    await page.clock.runFor(5000); // Let the real answer-posted toast clear before captures.
    await page.locator("#feed").evaluate(el=>el.scrollTop=el.scrollHeight);
    await page.screenshot({path:h.path.join(h.ROOT,"docs/images/board-openui-answer.png")});
    await page.setViewportSize({width:1440,height:1100});await topic("T005");await page.waitForSelector(".report-chart li:nth-child(3)");
    assert.deepEqual(await page.locator(".report-value").allTextContents(),["3","-2","0"]);await shot("board-openui-signed.png");
    await topic("T006");await page.waitForSelector(".report-content tbody tr:nth-child(3)");await shot("board-openui-table.png");
    const posted=h.path.join(tmp,"posted");await h.dumpFakeFs(page,posted);
    const result=h.boardctl(["validate","--path",posted]);assert.equal(result.code,0,result.err);
    assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(log.pageErrors,[]);await ctx.close();
    // The fallback image simulates a missing renderer; the message stays valid.
    const fallback=await h.openPage(browser,{tree:h.readTree(project),clock:AT});
    await fallback.page.emulateMedia({colorScheme:"light"});await fallback.page.setViewportSize({width:1440,height:1100});
    await fallback.page.evaluate(()=>{delete window.BoardReportRenderer;});
    await h.openBoardViaUi(fallback.page);await fallback.page.click(".fname:has-text('reports')");
    await fallback.page.click(".tcard[data-tk='room:reports|T004']");
    await fallback.page.waitForSelector(".report-error:not([hidden])");
    await fallback.page.locator("#feed").evaluate(el=>el.scrollTop=0);
    await fallback.page.screenshot({path:h.path.join(h.ROOT,"docs/images/board-openui-fallback.png")});
    assert.equal(fallback.log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(fallback.log.pageErrors,[]);await fallback.ctx.close();
    console.log("Captured six OpenUI examples; canonical validation, immutable answer and offline checks passed.");
  }finally{await browser.close();h.fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
