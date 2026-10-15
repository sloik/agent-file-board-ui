"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const filename=i=>`2026-10-15_1230_research-agent-01_T010_item-${String(i).padStart(5,"0")}.txt`;
function message(i,body=`Message ${i}`,reply="-"){
  return `FROM: research-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: bulk\nTHREAD: T010-large-board\nDATE: 2026-10-15 12:30\nPOSTED-AT: ${new Date(Date.UTC(2026,9,15,10,30,0,i)).toISOString()}\nLANGUAGE: en\nREPLY-TO: ${reply}\nSTATUS: INFO\n---\n${body}\n`;
}
async function boot(count=250){
  const tmp=h.tmpDir(),proj=h.layoutExample(tmp),tree=h.readTree(proj);
  tree.children[".agent-board"].children.rooms.children.bulk={kind:"directory",children:Object.fromEntries(Array.from({length:count},(_,i)=>[filename(i),{kind:"file",text:message(i,i===count-1?"Latest message":i===0?"Ancient search needle":`Message ${i}`,i===count-1?filename(0):"-"),lastModified:1000}]))};
  const s=await h.openPage(browser,{tree,clock:new Date("2026-10-15T10:30:00Z")});
  await h.openBoardViaUi(s.page);
  return {...s,proj};
}
const indices=page=>page.locator("#feed article.msg").evaluateAll(els=>els.map(el=>Number(el.dataset.file.match(/item-(\d+)/)?.[1])));
async function refresh(page){
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.click("#reload");await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
}

test("5000-message board opens with only the latest 100 rendered; older pages preserve drafts and unread history",async()=>{
  const {ctx,page,log}=await boot(5000);
  assert.equal(await page.locator("#feed article.msg").count(),100);
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>4900+i));
  assert.match(await page.textContent("#subtitle"),/5010 messages/);
  await page.click(".tcard[data-tk='room:bulk|T010']");
  assert.equal(await page.locator(".tcard[data-tk='room:bulk|T010'] .unread-badge").innerText(),"4900 unread");
  await page.fill("#cBody","Keep this draft while browsing history");
  await page.click("[data-history=older]");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>4800+i));
  assert.match(await page.textContent(".history-nav"),/Showing 4801–4900 of 5000/);
  assert.equal(await page.locator(".tcard[data-tk='room:bulk|T010'] .unread-badge").innerText(),"4800 unread");
  assert.equal(await page.inputValue("#cBody"),"Keep this draft while browsing history");
  await page.click("[data-history=latest]");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>4900+i));
  assert.equal(await page.locator("#feed article.msg").count(),100);
  assert.deepEqual(log.pageErrors,[]);
  await ctx.close();
});

test("full-board search and reply links reach messages outside the current page",async()=>{
  const {ctx,page,log}=await boot();
  await page.click(".tcard[data-tk='room:bulk|T010']");
  await page.locator("#feed .reply-ref").click();
  assert.ok((await indices(page)).includes(0));
  assert.ok((await indices(page)).length<=100);
  await page.fill("#q","Ancient search needle");
  assert.deepEqual(await indices(page),[0]);
  await page.fill("#q","");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>150+i));
  assert.deepEqual(log.pageErrors,[]);
  await ctx.close();
});

test("timer refresh retains an older page and draft while new arrivals stay available through Latest",async()=>{
  const {ctx,page}=await boot();
  await page.click(".tcard[data-tk='room:bulk|T010']");
  await page.click("[data-history=older]");
  const old=await indices(page);
  await page.fill("#cBody","Still editing");
  await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text,2000),{path:".agent-board/rooms/bulk/"+filename(250),text:message(250)});
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  assert.deepEqual(await indices(page),old);
  assert.match(await page.textContent(".history-nav"),/of 251/);
  assert.equal(await page.inputValue("#cBody"),"Still editing");
  await page.click("[data-history=latest]");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>151+i));
  await ctx.close();
});

test("native refresh reuses unchanged message bytes, reads changed/new files, and resets cache on reopening",async()=>{
  const {ctx,page}=await boot();
  const reads=()=>page.evaluate(()=>window.__boardTest.stats.messageReads);
  const initial=await reads();
  await refresh(page);
  // The 10 old canonical fixtures have no metadata in the adapter and must be reread.
  assert.equal(await reads()-initial,10);
  await page.evaluate(({first,newPath,changed,newText})=>{
    window.__fakefs.addFile(first,changed,2000);
    window.__fakefs.addFile(newPath,newText,2000);
  },{first:".agent-board/rooms/bulk/"+filename(0),changed:message(0,"Changed old content"),newPath:".agent-board/rooms/bulk/"+filename(250),newText:message(250)});
  const before=await reads();await refresh(page);
  assert.equal(await reads()-before,12);
  await page.fill("#q","Changed old content");
  assert.deepEqual(await indices(page),[0]);
  await page.evaluate(path=>window.__fakefs.removeFile(path),".agent-board/rooms/bulk/"+filename(0));
  await refresh(page);
  assert.equal(await page.locator("#feed article.msg").count(),0);
  assert.equal(await page.evaluate(()=>window.__boardTest.getModel().msgs.some(m=>m.body==="Changed old content")),false);
  await page.press("#q","Escape");
  assert.equal(await page.isVisible("#sugg"),false);
  const beforeReopen=await reads();await page.click("#open");await page.waitForFunction(n=>window.__boardTest.stats.messageReads>=n+260,beforeReopen);
  assert.equal(await reads()-beforeReopen,260);
  await ctx.close();
});

test("an arriving message does not shift the latest page away from a reader scrolled up",async()=>{
  const {ctx,page}=await boot();
  await page.click(".tcard[data-tk='room:bulk|T010']");
  await page.locator("#feed").evaluate(el=>{el.scrollTop=300;});
  const old=await indices(page),top=await page.locator("#feed").evaluate(el=>el.scrollTop);
  await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text,2000),{path:".agent-board/rooms/bulk/"+filename(250),text:message(250)});
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  assert.deepEqual(await indices(page),old);
  assert.equal(await page.locator("#feed").evaluate(el=>el.scrollTop),top);
  assert.equal(await page.locator("[data-history=latest]").isEnabled(),true);
  await page.click("[data-history=latest]");
  assert.equal((await indices(page)).at(-1),250);
  await ctx.close();
});

test("folder upload also pages history and full search reaches the oldest message",async()=>{
  const proj=h.layoutExample(h.tmpDir()),dir=h.path.join(proj,".agent-board/rooms/bulk");
  h.fs.mkdirSync(dir,{recursive:true});
  for(let i=0;i<250;i++) h.fs.writeFileSync(h.path.join(dir,filename(i)),message(i,i===0?"Ancient upload needle":`Message ${i}`));
  const {ctx,page}=await h.openPage(browser);
  await page.setInputFiles("#fallback",proj);await page.waitForSelector("#feed article");
  await page.click(".tcard[data-tk='room:bulk|T010']");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>150+i));
  await page.click("[data-history=older]");await page.click("[data-history=older]");
  assert.deepEqual(await indices(page),Array.from({length:50},(_,i)=>i));
  assert.equal(await page.locator("[data-history=older]").isDisabled(),true);
  await page.click("[data-history=newer]");
  assert.deepEqual(await indices(page),Array.from({length:100},(_,i)=>50+i));
  await page.fill("#q","Ancient upload needle");
  assert.deepEqual(await indices(page),[0]);
  await ctx.close();
});
