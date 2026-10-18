"use strict";
const h=require("../tests/lib/helpers"),assert=require("node:assert/strict");
(async()=>{
  const tmp=h.tmpDir(),project=h.layoutExample(tmp),dir=h.path.join(project,".agent-board/rooms/reports");h.fs.mkdirSync(dir);
  const report=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"examples/openui-report/report.json"),"utf8"));
  const question=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"examples/openui-report/question.json"),"utf8"));
  h.fs.writeFileSync(h.path.join(dir,"2026-10-18_1230_implementation-agent-01_T004_report.txt"),`FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: T004-release-review\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: DECISION-NEEDED\nUI: ${JSON.stringify(report)}\nQUESTION: ${JSON.stringify(question)}\n---\n170 tests passed; 2 failed. Choose Fix failures or Postpone release.\n`);
  const browser=await h.launch();try{
    const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),clock:new Date("2026-10-18T10:30:00Z")});
    await page.setViewportSize({width:1440,height:1100});await h.openBoardViaUi(page);await page.selectOption("#me","human-owner-01");
    await page.click(".fname:has-text('reports')");await page.waitForSelector(".report-content table");
    await page.locator(".choice-form input[value=fix]").check();
    await page.locator("#feed").evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:h.path.join(h.ROOT,"docs/images/board-openui.png")});
    await page.emulateMedia({colorScheme:"dark"});await page.setViewportSize({width:375,height:2000});
    await page.locator("#feed").evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:h.path.join(h.ROOT,"docs/images/board-openui-phone.png")});
    assert.deepEqual(log.pageErrors,[]);await ctx.close();
  }finally{await browser.close();h.fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
