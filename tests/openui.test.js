"use strict";
const {test,before,after}=require("node:test"),assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const AT=new Date("2026-10-18T10:30:00Z"),FILE="2026-10-18_1230_implementation-agent-01_T004_report.txt";
const REPORT={library:"board-report",version:1,title:"Release review",components:[{type:"table",title:"Test results",columns:["Suite","Passed","Failed"],rows:[["Unit","128","0"],["Browser","42","2"]]},{type:"bar-chart",title:"Results",labels:["Passed","Failed"],values:[170,2]}]};
const QUESTION={id:"release-review",type:"single",prompt:"What should happen next?",options:[{id:"fix",label:"Fix failures"},{id:"postpone",label:"Postpone release"}]};
function message(ui=REPORT,body="170 passed; 2 failed. Fix failures or postpone release."){
  return `FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: T004-release\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: DECISION-NEEDED\nUI: ${typeof ui==="string"?ui:JSON.stringify(ui)}\nQUESTION: ${JSON.stringify(QUESTION)}\n---\n${body}\n`;
}
async function boot({ui=REPORT,body,upload=false,beforeOpen}={}){
  const tmp=h.tmpDir(),proj=h.layoutExample(tmp),dir=h.path.join(proj,".agent-board/rooms/reports");h.fs.mkdirSync(dir);
  h.fs.writeFileSync(h.path.join(dir,FILE),message(ui,body));
  const session=await h.openPage(browser,{tree:upload?undefined:h.readTree(proj),clock:AT});
  await session.page.clock.pauseAt(new Date("2026-10-18T10:30:01Z"));
  if(beforeOpen) await beforeOpen(session.page);
  if(upload) await session.page.setInputFiles("#fallback",proj);else await h.openBoardViaUi(session.page);
  await session.page.waitForSelector(`article[data-file='${FILE}']`);
  return {...session,tmp,proj};
}
const article=page=>page.locator(`article[data-file='${FILE}']`);

test("completed reports use the actual embedded OpenUI renderer offline, in both themes and at phone width",async()=>{
  const {ctx,page,log}=await boot();
  await page.waitForSelector(".board-report table tbody tr");
  assert.deepEqual(await article(page).locator(".board-report th").allTextContents(),["Suite","Passed","Failed"]);
  assert.equal(await article(page).locator(".board-report tbody tr").count(),2);
  assert.deepEqual(await article(page).locator(".report-value").allTextContents(),["170","2"]);
  assert.equal(await article(page).locator(".report-error").isVisible(),false);
  const colors=[];
  for(const theme of ["light","dark"]){
    await page.emulateMedia({colorScheme:theme});colors.push(await article(page).locator(".board-report").evaluate(el=>getComputedStyle(el).backgroundColor));
    for(const width of [1200,375]){
      await page.setViewportSize({width,height:1100});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await article(page).locator(".report-content h3").innerText(),"Release review");
    }
  }
  assert.notEqual(colors[0],colors[1]);assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(log.pageErrors,[]);
  await ctx.close();
});

test("reports keep choice drafts, focus and mounted content across refresh and write immutable ordinary answers",async()=>{
  const {ctx,page,log}=await boot();await page.waitForSelector(".board-report table");
  await page.selectOption("#me","human-owner-01");await page.fill("#cBody","Unfinished composer draft");
  const form=article(page).locator(".choice-form"),original=await page.evaluate(file=>window.__fakefs.read(".agent-board/rooms/reports/"+file),FILE);
  await form.locator("input[value=fix]").check();await form.locator("textarea").fill("Retest before release.");
  await form.locator("textarea").evaluate(el=>el.setSelectionRange(3,8));
  await article(page).locator(".report-content").evaluate(el=>el.__stableMarker=true);
  await page.evaluate(()=>window.__fakefs.addFile(".agent-board/rooms/reports/2026-10-18_1231_research-agent-01_T005_arrival.txt","FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: reports\nTHREAD: T005-arrival\nDATE: 2026-10-18 12:31\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nNew arrival\n"));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.equal(await form.locator("textarea").inputValue(),"Retest before release.");
  assert.deepEqual(await form.locator("textarea").evaluate(el=>[el===document.activeElement,el.selectionStart,el.selectionEnd]),[true,3,8]);
  assert.equal(await article(page).locator(".report-content").evaluate(el=>el.__stableMarker),true);
  await form.locator("[type=submit]").click();
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('ANSWER: {"question":"release-review"')));
  const answer=(await page.evaluate(()=>window.__fakefs.dump())).find(f=>f.text.includes('ANSWER: {"question":"release-review"'));
  assert.deepEqual(JSON.parse(answer.text.match(/^ANSWER: (.*)$/m)[1]),{question:"release-review",selected:["fix"],text:"Retest before release."});
  assert.match(answer.text,new RegExp("REPLY-TO: "+FILE.replace(/\./g,"\\.")));
  assert.equal(await page.evaluate(file=>window.__fakefs.read(".agent-board/rooms/reports/"+file),FILE),original);
  assert.equal(await page.inputValue("#cBody"),"Unfinished composer draft");
  const validated=h.path.join(h.tmpDir(),"validated");await h.dumpFakeFs(page,validated);
  const result=h.boardctl(["validate","--path",validated]);assert.equal(result.code,0,result.err);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("unknown and malformed UI metadata stays readable without report or choice controls",async()=>{
  for(const ui of [{...REPORT,version:99},{...REPORT,components:[{type:"html",title:"Run",html:"<script>alert(1)</script>"}]},'{"library":"board-report","library":"board-report"}']){
    const {ctx,page}=await boot({ui});
    assert.match(await article(page).locator(".body").innerText(),/170 passed/);
    assert.equal(await article(page).locator(".board-report,.choice-form").count(),0);
    assert.equal(await article(page).locator(".metadata-error").count(),1);
    assert.equal(await page.locator("article .body").filter({hasText:"Please review"}).count()>0,true);
    await ctx.close();
  }
});

test("a missing or failed renderer shows the fallback and leaves sibling messages working",async()=>{
  for(const mode of ["missing","throw"]){
    const {ctx,page,log}=await boot({beforeOpen:page=>page.evaluate(mode=>{if(mode==="missing") delete window.BoardReportRenderer;else window.BoardReportRenderer.mount=()=>{throw Error("test failure");};},mode)});
    await page.waitForSelector(".report-error:not([hidden])");
    assert.match(await article(page).locator(".body").innerText(),/170 passed/);
    assert.equal(await page.locator("article").count()>1,true);assert.deepEqual(log.pageErrors,[]);await ctx.close();
  }
});

test("plain component strings cannot inject HTML, language statements, tools or network resources",async()=>{
  const report=structuredClone(REPORT);report.title='</script><img src="https://example.invalid" onerror="window.attack=1">';
  report.components[0].rows[0][0]='\"), Query(\"run\", {}); root = Html(\"<script>\")';
  report.components[1].values=[-12.5,0];
  const {ctx,page,log}=await boot({ui:report});await page.waitForSelector(".report-content h3");
  assert.equal(await article(page).locator(".report-content h3").innerText(),report.title);
  assert.equal(await article(page).locator("tbody td").first().innerText(),report.components[0].rows[0][0]);
  assert.equal(await article(page).locator(".board-report img,.board-report script,.board-report iframe,.board-report a").count(),0);
  assert.equal(await page.evaluate(()=>window.attack),undefined);assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);
  assert.deepEqual(await article(page).locator(".report-value").allTextContents(),["-12.5","0"]);assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("uploaded reports retain the existing download response flow",async()=>{
  const {ctx,page}=await boot({upload:true});await page.waitForSelector(".board-report table");await page.selectOption("#me","human-owner-01");
  await article(page).locator("input[value=postpone]").check();const download=page.waitForEvent("download");await article(page).locator("[type=submit]").click();
  const saved=await download;assert.match(h.fs.readFileSync(await saved.path(),"utf8"),/ANSWER: .*postpone/);await ctx.close();
});

test("shared canonical UI fixtures agree with browser validation",async()=>{
  const cases=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"tests/fixtures/ui-metadata.json"),"utf8"));
  const {ctx,page}=await h.openPage(browser);
  const actual=await page.evaluate(cases=>cases.map(c=>{try{window.__boardTest.messageMetadata(c.headers);return true;}catch(e){return false;}}),cases);
  assert.deepEqual(actual,cases.map(c=>c.valid));await ctx.close();
});

test("report roots are disposed on navigation and remounted once when returning",async()=>{
  const {ctx,page,log}=await boot({beforeOpen:page=>page.evaluate(()=>{
    window.reportLifecycle={mounted:0,disposed:0};const original=window.BoardReportRenderer.mount;
    window.BoardReportRenderer.mount=(...args)=>{window.reportLifecycle.mounted++;const dispose=original(...args);return ()=>{window.reportLifecycle.disposed++;dispose();};};
  })});
  await page.waitForSelector(".report-content table");
  assert.deepEqual(await page.evaluate(()=>window.reportLifecycle),{mounted:1,disposed:0});
  await page.click(".fname:has-text('product')");
  assert.equal(await page.locator(".board-report").count(),0);
  assert.deepEqual(await page.evaluate(()=>window.reportLifecycle),{mounted:1,disposed:1});
  await page.click(".fname:has-text('reports')");await page.waitForSelector(".report-content table");
  assert.deepEqual(await page.evaluate(()=>window.reportLifecycle),{mounted:2,disposed:1});
  assert.equal(await page.locator(".board-report").count(),1);assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("large report headers hydrate completely while missing fallback bodies disable all controls",async()=>{
  const report=structuredClone(REPORT);report.components[0].rows=Array.from({length:40},(_,i)=>[String(i),"x".repeat(100),"ok"]);
  assert.equal(JSON.stringify(report).length>4096,true);
  const {ctx,page}=await boot({ui:report});await page.waitForSelector(".board-report tbody tr:nth-child(40)");
  assert.equal(await article(page).locator("tbody tr").count(),40);await ctx.close();
  for(const upload of [false,true]){
    const {ctx,page}=await boot({body:" ",upload});
    await page.waitForSelector(`article[data-file='${FILE}'] .metadata-error`);
    assert.equal(await article(page).locator(".board-report,.choice-form").count(),0);await ctx.close();
  }
});
