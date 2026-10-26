"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const file=i=>`2026-10-15_1230_research-agent-01_T010_item-${String(i).padStart(5,"0")}.txt`;
function treeWithHistory(count=650){
  const tree=h.readTree(h.layoutExample(h.tmpDir()));
  tree.children[".agent-board"].children.rooms.children.bulk={kind:"directory",children:Object.fromEntries(Array.from({length:count},(_,i)=>[file(i),{kind:"file",lastModified:1000,text:`FROM: research-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: bulk\nTHREAD: T010-scroll-history\nDATE: 2026-10-15 12:30\nPOSTED-AT: ${new Date(Date.UTC(2026,9,15,10,30,0,i)).toISOString()}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nMessage ${i}. ${"Long historical content. ".repeat(150)}${i===0?"Only the oldest full body contains zirconium-unicorn.":""}\n`}]))};
  return tree;
}
const idle=page=>page.waitForFunction(()=>!window.__boardTest.loading());
async function scrollEdge(page,direction){
  const range=await page.locator(".history-nav span").textContent();
  await page.locator("#feed").evaluate((el,d)=>{el.scrollTop=d<0?0:el.scrollHeight;},direction);
  await page.hover("#feed");await page.mouse.wheel(0,direction*300);
  await page.clock.runFor(80);
  await page.waitForFunction(previous=>document.querySelector(".history-nav span").textContent!==previous && !window.__boardTest.loading(),range);
}

test("bodies load on upward scroll, retain the visible anchor, and stay within DOM/cache limits",async()=>{
  const {ctx,page,log}=await h.openPage(browser,{tree:treeWithHistory(),clock:new Date("2026-10-15T10:30:00Z")});
  await h.openBoardViaUi(page);
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.messageReads),100);
  assert.equal(await page.evaluate(()=>window.__boardTest.getModel().msgs.filter(m=>m.bodyLoaded).length),100);
  await page.click(".tcard[data-tk='room:bulk|T010']");
  await page.fill("#cBody","Keep this unfinished draft");
  await page.evaluate(()=>document.querySelector("#cBody").setSelectionRange(5,9));
  await page.locator("#feed").evaluate(el=>{el.scrollTop=0;});
  const anchor=page.locator(`#feed article[data-file='${file(550)}']`),top=(await anchor.boundingBox()).y;
  await page.hover("#feed");await page.mouse.wheel(0,-300);await page.clock.runFor(80);
  await page.waitForFunction(()=>document.querySelectorAll("#feed article.msg").length===200 && !window.__boardTest.loading());
  assert.ok(Math.abs((await anchor.boundingBox()).y-top)<1,"same message stays at the same viewport position");
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.messageReads),200);
  for(let i=0;i<4;i++) await scrollEdge(page,-1);
  assert.ok(await page.locator(`#feed article[data-file='${file(50)}']`).count());
  assert.ok(await page.locator("#feed article.msg").count()<=200);
  assert.ok(await page.evaluate(()=>window.__boardTest.cachedBodies())<=300);
  assert.ok(await page.evaluate(()=>window.__boardTest.getModel().msgs.filter(m=>m.bodyLoaded).length)<=300);
  await scrollEdge(page,1);
  assert.ok(await page.locator("#feed article.msg").count()<=200);
  assert.equal(await page.inputValue("#cBody"),"Keep this unfinished draft");
  assert.deepEqual(await page.evaluate(()=>({id:document.activeElement.id,start:document.querySelector("#cBody").selectionStart,end:document.querySelector("#cBody").selectionEnd})),{id:"cBody",start:5,end:9});
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("search scans an unloaded old body beyond its preview without retaining the entire history",async()=>{
  const {ctx,page,log}=await h.openPage(browser,{tree:treeWithHistory(450),clock:new Date("2026-10-15T10:30:00Z")});
  await h.openBoardViaUi(page);
  assert.equal(await page.evaluate(()=>window.__boardTest.getModel().msgs.find(m=>m.file.endsWith('item-00000.txt')).bodyLoaded),false);
  assert.equal(await page.evaluate(()=>window.__boardTest.getModel().msgs.find(m=>m.file.endsWith('item-00000.txt')).body.includes('zirconium-unicorn')),false);
  await page.fill("#q","zirconium-unicorn");await idle(page);
  assert.equal(await page.locator("#feed article.msg").count(),1);
  assert.match(await page.textContent("#feed"),/zirconium-unicorn/);
  assert.ok(await page.evaluate(()=>window.__boardTest.cachedBodies())<=300);
  assert.ok(await page.evaluate(()=>window.__boardTest.getModel().msgs.filter(m=>m.bodyLoaded).length)<=300);
  await page.fill("#q","not-a-real-search-result");await page.fill("#q","");await idle(page);
  assert.equal(await page.locator("#feed article.msg").count(),100);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("identity picker colors match chat and stable IDs survive registry additions, removal, reorder and reload",async()=>{
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(h.layoutExample(h.tmpDir()))});
  await h.openBoardViaUi(page);
  const colors=()=>page.locator("#feed article.msg").evaluateAll(els=>Object.fromEntries(els.map(el=>[el.dataset.author,getComputedStyle(el.querySelector('.who')).color])));
  const initial=await colors();
  for(const id of Object.keys(initial)){
    await page.selectOption("#me",id);
    assert.equal(await page.locator("#me").evaluate(el=>getComputedStyle(el).color),initial[id]);
    assert.equal(await page.locator(`#me option[value='${id}']`).evaluate(el=>getComputedStyle(el).color),initial[id]);
    assert.equal(await page.locator(".me").evaluate(el=>getComputedStyle(el,"::before").backgroundColor),initial[id]);
  }
  await page.evaluate(()=>{
    const path='.agent-board/participants.json',reg=JSON.parse(window.__fakefs.read(path));
    reg.participants.reverse();reg.participants.unshift({id:'aaa-new-agent',kind:'agent'});
    window.__fakefs.addFile(path,JSON.stringify(reg));
  });
  let n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click("#reload");await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  assert.deepEqual(await colors(),initial);
  await page.evaluate(()=>{
    const path='.agent-board/participants.json',reg=JSON.parse(window.__fakefs.read(path));
    reg.participants=reg.participants.filter(p=>p.id!=='research-agent-01');window.__fakefs.addFile(path,JSON.stringify(reg));
  });
  n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click("#reload");await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  assert.deepEqual(await colors(),initial);
  await h.reloadSettled(ctx,page,{lastDir:true});await page.waitForSelector("#feed article");
  assert.deepEqual(await colors(),initial);
  await page.emulateMedia({colorScheme:"dark"});
  const me=await page.inputValue("#me");
  assert.equal(await page.locator("#me").evaluate(el=>getComputedStyle(el).color),(await colors())[me]);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("a failed body search reports incomplete results and can retry after refresh",async()=>{
  const {ctx,page,log}=await h.openPage(browser,{tree:treeWithHistory(250),clock:new Date("2026-10-15T10:30:00Z")});
  await h.openBoardViaUi(page);
  await page.evaluate(async()=>{
    const root=await window.showDirectoryPicker(),base=await root.getDirectoryHandle('.agent-board'),rooms=await base.getDirectoryHandle('rooms'),bulk=await rooms.getDirectoryHandle('bulk'),handle=await bulk.getFileHandle('2026-10-15_1230_research-agent-01_T010_item-00000.txt');
    const proto=Object.getPrototypeOf(handle),original=proto.getFile;
    window.restoreBodyReader=()=>{proto.getFile=original;};
    proto.getFile=async function(){const result=await original.call(this);if(this.name.endsWith('item-00000.txt')) result.text=async()=>{throw Error('Temporary read failure');};return result;};
  });
  let n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click("#reload");await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  await page.fill("#q","zirconium-unicorn");await idle(page);
  assert.match(await page.textContent("#subtitle"),/Search incomplete/);
  assert.match(await page.textContent("#toast"),/Could not load message: Temporary read failure/);
  await page.evaluate(()=>window.restoreBodyReader());
  await page.press("#q","Escape");
  assert.equal(await page.inputValue("#q"),"zirconium-unicorn");
  n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click("#reload");await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);await idle(page);
  assert.equal(await page.locator("#feed article.msg").count(),1);
  assert.match(await page.textContent("#feed"),/zirconium-unicorn/);
  assert.doesNotMatch(await page.textContent("#subtitle"),/incomplete/);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("header indexing preserves a structured question larger than the initial read chunk",async()=>{
  const tree=treeWithHistory(250),question={id:'large-question',type:'single',prompt:'Choose a detailed option',options:Array.from({length:25},(_,i)=>({id:'option-'+i,label:`Option ${i}: `+'Detailed context. '.repeat(70)}))};
  tree.children['.agent-board'].children.rooms.children.questions={kind:'directory',children:{'2026-10-15_1231_research-agent-01_T011_large-question.txt':{kind:'file',lastModified:2000,text:`FROM: research-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: questions\nTHREAD: T011-large-question\nDATE: 2026-10-15 12:31\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: QUESTION\nQUESTION: ${JSON.stringify(question)}\n---\nThe full header must be read without loading unrelated bodies.\n`}}};
  const {ctx,page,log}=await h.openPage(browser,{tree});await h.openBoardViaUi(page);
  assert.equal(await page.locator(".choice-form input").count(),25);
  assert.match(await page.textContent(".choice-form legend"),/Choose a detailed option/);
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.messageReads),100);
  assert.equal(await page.locator(".metadata-error").count(),0);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test("keyboard scrolling fetches older bodies without requiring a paging-button click",async()=>{
  const {ctx,page}=await h.openPage(browser,{tree:treeWithHistory(),clock:new Date("2026-10-15T10:30:00Z")});
  await h.openBoardViaUi(page);await page.click(".tcard[data-tk='room:bulk|T010']");
  await page.focus("#feed");
  const range=await page.locator(".history-nav span").textContent();
  await page.keyboard.press("Home");await page.clock.runFor(80);
  await page.waitForFunction(previous=>document.querySelector(".history-nav span").textContent!==previous && !window.__boardTest.loading(),range);
  assert.equal(await page.locator("#feed article.msg").count(),200);
  assert.equal(await page.locator(`#feed article[data-file='${file(450)}']`).count(),1);
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.messageReads),200);
  await ctx.close();
});
