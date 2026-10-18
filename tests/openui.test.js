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

const STATIC=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"examples/openui-report/static-dashboard.json"),"utf8"));

test("static v2 renders every adapter offline and local controls preserve immutable files and refresh state",async()=>{
  const {ctx,page,log}=await boot({ui:STATIC,body:"Synthetic release dashboard: 170 passed, 2 failed. Review before publishing."});
  await page.waitForSelector(".report-tabs [role=tab]");
  assert.equal(await article(page).locator(".report-error").isVisible(),false);
  assert.equal(await article(page).locator(".report-metric").count(),2);
  assert.match(await article(page).locator(".report-callout").innerText(),/Release held/);
  assert.equal(await article(page).locator(".report-tag").innerText(),"Review needed");
  assert.equal(await article(page).locator(".report-series-chart").count(),4);
  const original=await page.evaluate(()=>window.__fakefs.dump());
  const tabs=article(page).locator(".report-tabs"),results=tabs.getByRole("tab",{name:"Results"});
  await results.click();
  const table=tabs.locator(".report-table");
  await table.getByRole("button",{name:/Passed/}).click();
  assert.deepEqual(await table.locator("tbody tr td:first-child").allTextContents(),["Integration","Browser","Unit"]);
  await table.locator("input").fill("browser");
  assert.equal(await table.locator("tbody tr").count(),1);
  assert.equal(await table.locator("tbody td").first().innerText(),"Browser");
  await article(page).locator(".report-accordion summary").filter({hasText:"Commands"}).click();
  assert.equal(await article(page).locator(".report-code").innerText(),"npm test\npython3 -m unittest discover -s tests");
  await table.locator("input").focus();
  await table.locator("input").evaluate(el=>el.setSelectionRange(1,4));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.equal(await results.getAttribute("aria-selected"),"true");
  assert.equal(await article(page).locator(".report-accordion details").nth(1).getAttribute("open"),"");
  assert.equal(await table.locator("input").inputValue(),"browser");
  assert.deepEqual(await table.locator("input").evaluate(el=>[el===document.activeElement,el.selectionStart,el.selectionEnd]),[true,1,4]);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),original);
  assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(log.pageErrors,[]);
  await ctx.close();
});

test("static v2 charts expose signed data, keyboard tabs work and localization keeps local state",async()=>{
  const {ctx,page,log}=await boot({ui:STATIC});await page.waitForSelector(".report-series-chart svg");
  const tabs=article(page).locator(".report-tabs");
  await tabs.getByRole("tab",{name:"Trends"}).focus();await page.keyboard.press("ArrowRight");
  assert.equal(await tabs.getByRole("tab",{name:"Results"}).getAttribute("aria-selected"),"true");
  await tabs.locator(".report-filter input").fill("Unit");
  await page.click("#gear");await page.selectOption("#sLang","pl");
  await page.keyboard.press("Escape");
  await page.waitForFunction(()=>document.querySelector('.report-filter')?.textContent.includes('Filtruj'));
  assert.equal(await tabs.getByRole("tab",{name:"Results"}).getAttribute("aria-selected"),"true");
  assert.equal(await tabs.locator(".report-filter input").inputValue(),"Unit");
  assert.match(await article(page).locator(".report-steps").innerText(),/Ukończono|W toku/);
  await article(page).locator(".report-accordion summary").filter({hasText:"Commands"}).click();
  const chart=article(page).locator('[data-chart-kind="stacked-bar-chart"]');
  await chart.locator("summary").click();
  assert.deepEqual(await chart.locator("tbody td").allTextContents(),["3","2","-2","-4","0","1"]);
  const geometry=await chart.locator("rect").evaluateAll(nodes=>nodes.map(n=>({x:+n.getAttribute('x'),y:+n.getAttribute('y'),h:+n.getAttribute('height')})));
  assert.ok(geometry.every(r=>Number.isFinite(r.x+r.y+r.h) && r.h>=0));
  // First positive series3 + second positive2 share a cumulative stack at Mon.
  assert.ok(Math.abs(geometry[3].y+geometry[3].h-geometry[0].y)<.001);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("static v2 remains readable at phone width in both themes, including zero/single-point charts",async()=>{
  const ui=structuredClone(STATIC);
  ui.components.push({type:"line-chart",title:"One point",labels:["Zero"],series:[{name:"Only",values:[0]}]});
  const {ctx,page,log}=await boot({ui});await page.waitForSelector(".report-metric");
  await article(page).locator(".report-accordion summary").filter({hasText:"Review notes"}).click();
  for(const theme of ["light","dark"]){
    await page.emulateMedia({colorScheme:theme});
    for(const width of [1280,375]){
      await page.setViewportSize({width,height:1500});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await article(page).locator(".report-error").isVisible(),false);
      assert.ok(await article(page).locator(".report-card li").count()>=3);
    }
  }
  const last=article(page).locator('.report-series-chart').last();
  assert.equal(await last.locator('circle').count(),1);
  assert.equal(await last.locator('circle title').textContent(),"Zero: Only = 0");
  assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("static v2 invalid nested data is isolated and a missing renderer retains the readable summary",async()=>{
  const invalid=structuredClone(STATIC);invalid.components[0].children[0].action="run";
  const bad=await boot({ui:invalid});
  assert.equal(await article(bad.page).locator(".board-report,.choice-form").count(),0);
  assert.equal(await article(bad.page).locator(".metadata-error").count(),1);await bad.ctx.close();
  const missing=await boot({ui:STATIC,beforeOpen:page=>page.evaluate(()=>{delete window.BoardReportRenderer;})});
  await missing.page.waitForSelector(".report-error:not([hidden])");
  assert.match(await article(missing.page).locator(".body").innerText(),/170 passed/);
  assert.equal(await article(missing.page).locator(".choice-form").count(),1);await missing.ctx.close();
});

const CANDIDATES=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"examples/openui-report/static-candidates.json"),"utf8"));

test("v3 renders all remaining static adapters and embedded PNGs without external requests",async()=>{
  const {ctx,page,log}=await boot({ui:CANDIDATES});
  await page.waitForSelector('.report-specialty');
  assert.equal(await article(page).locator('.report-error').isVisible(),false);
  assert.equal(await article(page).locator('.report-specialty').count(),5);
  assert.equal(await article(page).locator('.report-icon-text').count()>=2,true);
  assert.equal(await article(page).locator('.report-metric-comparison').count()>=1,true);
  assert.match(await article(page).locator('.report-metric-comparison').first().innerText(),/1\.3 MB.*1\.1 MB/s);
  assert.equal(await article(page).locator('.report-markdown strong').first().innerText(),'Static Markdown');
  assert.equal(await article(page).locator('.report-tag-block').count()>=1,true);
  assert.equal(await article(page).locator('.report-card-grid').count(),4);
  await page.waitForFunction(()=>[...document.querySelectorAll('.board-report img')].length===6 && [...document.querySelectorAll('.board-report img')].every(i=>i.complete && i.naturalWidth>0));
  assert.equal(await page.locator('.report-image-error').count(),0);
  assert.equal(await page.locator('dialog.report-modal').isVisible(),false);
  assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);
  assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);await ctx.close();
});

test("v3 carousel/modal remain local across refresh and dispose native dialog portals",async()=>{
  const {ctx,page,log}=await boot({ui:CANDIDATES});await page.waitForSelector('.report-carousel');
  const before=await page.evaluate(()=>window.__fakefs.dump());
  const carousel=article(page).locator('.report-carousel');
  await carousel.getByRole('button',{name:'Next',exact:true}).click();
  assert.equal(await carousel.locator('[data-carousel-panel=context]').isVisible(),true);
  await carousel.getByRole('button',{name:'Next',exact:true}).focus();await page.keyboard.press('End');
  assert.equal(await carousel.locator('[data-carousel-panel=composite]').isVisible(),true);
  const trigger=article(page).locator('.report-modal-trigger>button');await trigger.click();
  const dialog=page.locator('dialog.report-modal');await dialog.waitFor({state:'visible'});
  await dialog.locator('.report-filter input').fill('Offline');
  await dialog.locator('.report-filter input').evaluate(el=>el.setSelectionRange(1,4));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);await page.clock.runFor(61000);
  await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.equal(await dialog.evaluate(el=>el.open),true);
  assert.equal(await dialog.locator('.report-filter input').inputValue(),'Offline');
  assert.deepEqual(await dialog.locator('.report-filter input').evaluate(el=>[el===document.activeElement,el.selectionStart,el.selectionEnd]),[true,1,4]);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  assert.equal(await carousel.locator('[data-carousel-panel=composite]').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await trigger.click();await dialog.waitFor({state:'visible'});
  // Simulate a route change while the modal is open; disposal must remove its portal.
  await page.evaluate(()=>[...document.querySelectorAll('.fname')].find(el=>el.textContent.includes('product')).click());
  await page.waitForFunction(()=>!document.querySelector('dialog.report-modal'));
  await page.locator('#cBody').focus();assert.equal(await page.locator('#cBody').evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("v3 Markdown removes active resources while literal data and bad images stay isolated",async()=>{
  const ui=structuredClone(CANDIDATES);
  ui.components.find(c=>c.type==='markdown').text='**Safe**\n<script>window.attack=1</script><img src="https://example.invalid/image"><iframe src="https://example.invalid"></iframe><style>body{display:none}</style><form><button onclick="window.attack=2">Run</button></form>\n[link](javascript:alert(1))';
  const {ctx,page,log}=await boot({ui});await page.waitForSelector('.report-markdown strong');
  const md=article(page).locator('.report-markdown');
  assert.equal(await md.locator('script,img,iframe,style,form,button,a[href]').count(),0);
  assert.equal(await page.evaluate(()=>window.attack),undefined);
  assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
  const invalid=structuredClone(CANDIDATES);invalid.components.find(c=>c.type==='image').src='https://example.invalid/photo.png';
  const bad=await boot({ui:invalid});assert.equal(await article(bad.page).locator('.board-report,.choice-form').count(),0);assert.equal(await article(bad.page).locator('.metadata-error').count(),1);await bad.ctx.close();
});

test("v3 works in read-only uploads and at phone widths with local controls and translated labels",async()=>{
  const {ctx,page,log}=await boot({ui:CANDIDATES,upload:true});await page.waitForSelector('.report-carousel');
  await article(page).locator('.report-carousel').getByRole('button',{name:'Next',exact:true}).click();
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('.report-carousel-controls').textContent.includes('Następny'));
  assert.equal(await article(page).locator('[data-carousel-panel=context]').isVisible(),true);
  await article(page).locator('.report-modal-trigger>button').click();const dialog=page.locator('dialog.report-modal');await dialog.waitFor({state:'visible'});
  assert.equal(await dialog.getByRole('button',{name:'Zamknij',exact:true}).count(),1);await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();
  for(const theme of ['light','dark']) for(const width of [1280,375]){
    await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:1500});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await article(page).locator('.report-error').isVisible(),false);
  }
  assert.match(await page.locator('#cInfo').innerText(),/tylko.*odczyt/i);
  assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("v3 large image headers hydrate completely; zero and one-point charts keep finite geometry",async()=>{
  const cases=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,'tests/fixtures/ui-metadata.json'),'utf8'));
  const broken=JSON.parse(cases.find(c=>c.name==='v3-png-decode-fallback').headers.UI);
  broken.components.push({type:'text',title:'Sibling',text:'Still readable'});
  const failed=await boot({ui:broken});await failed.page.waitForSelector('.board-report img');
  // Chromium tolerates corrupt pixel streams as transparent images, including
  // img.decode(). Exercise an explicit browser error event for the fallback.
  await article(failed.page).locator('img').dispatchEvent('error');
  await failed.page.waitForSelector('.report-image-error');
  assert.match(await article(failed.page).locator('.report-image-error').innerText(),/Synthetic red pixel/);
  assert.match(await article(failed.page).innerText(),/Still readable/);
  assert.equal(await article(failed.page).locator('.report-error').isVisible(),false);
  assert.deepEqual(failed.log.pageErrors,[]);await failed.ctx.close();
  const large=JSON.parse(cases.find(c=>c.name==='v3-large-header-image').headers.UI);
  assert.ok(JSON.stringify(large).length>16384);
  const loaded=await boot({ui:large});await loaded.page.waitForFunction(()=>document.querySelector('.board-report img')?.naturalWidth===240);
  assert.equal(await article(loaded.page).locator('.report-error').isVisible(),false);await loaded.ctx.close();
  const ui={library:'board-report',version:3,title:'Degenerate data',components:[{type:'pie-chart',title:'Zero',labels:['Zero'],values:[0],variant:'pie'},{type:'pie-chart',title:'One',labels:['Only'],values:[1],variant:'pie'},{type:'scatter-chart',title:'One point',xLabel:'x',yLabel:'y',datasets:[{name:'Only',points:[{x:0,y:0,z:0}]}]}]};
  const {ctx,page,log}=await boot({ui});await page.waitForSelector('.report-specialty');
  assert.equal(await article(page).locator('.report-error').isVisible(),false);
  assert.match(await article(page).locator('[data-chart-kind=pie-chart]').first().innerText(),/No positive values/);
  const point=article(page).locator('[data-chart-kind=scatter-chart] circle');
  assert.equal(await point.count(),1);assert.equal(await point.getAttribute('cx'),'330');assert.equal(await point.getAttribute('cy'),'125');
  await article(page).locator('[data-chart-kind=scatter-chart] summary').click();
  assert.deepEqual(await article(page).locator('[data-chart-kind=scatter-chart] tbody td').allTextContents(),['Only','0','0','0']);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
