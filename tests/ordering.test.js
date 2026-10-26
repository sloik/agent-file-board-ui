"use strict";
const {test,before,after}=require("node:test");const assert=require("node:assert/strict");const h=require("./lib/helpers");const c=require("./lib/checks");
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const head=(slug,posted,body)=>`FROM: human-owner-01\nTO: all\nSCOPE: ROOM\nROOM: general\nTHREAD: T009-order\nDATE: 2026-10-15 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n${posted?'POSTED-AT: '+posted+'\n':''}---\n${body}\n`;
const file=slug=>`2026-10-15_1230_human-owner-01_T009_${slug}.txt`;
test("same-minute posts follow precise timestamps rather than filenames, before and after reload",async()=>{
 const proj=h.layoutExample(h.tmpDir()),dir=h.path.join(proj,".agent-board/rooms/general");h.fs.mkdirSync(dir,{recursive:true});
 for(const [slug,time] of [["zzz-first","2026-10-15T10:30:01.200Z"],["aaa-last","2026-10-15T10:30:01.250Z"],["mmm-middle","2026-10-15T10:30:01.225Z"]])h.fs.writeFileSync(h.path.join(dir,file(slug)),head(slug,time,slug));
 const {ctx,page}=await h.openPage(browser,{tree:h.readTree(proj)});await h.openBoardViaUi(page);await h.expandComposer(page);await page.click(".fname:has-text('general')");
 const expected=[file("zzz-first"),file("mmm-middle"),file("aaa-last")];assert.deepEqual(await h.feedOrder(page),expected);
 await h.reloadSettled(ctx,page,{lastDir:true});await page.waitForSelector("#feed article");assert.deepEqual(await h.feedOrder(page),expected);await ctx.close();
});
test("rapid UI posts retain their actual order even within one frozen millisecond and after a clock step backwards",async()=>{
 const {ctx,page}=await c.openExample(browser,h.BOARD_HTML,{clock:new Date("2026-10-15T10:30:00Z")});await page.clock.pauseAt(new Date("2026-10-15T10:30:05Z"));
 await h.expandComposer(page);await page.selectOption("#cWhere","room:product");
 const expected=["Zzz first post","Aaa second post","Mmm third post"];
 let written=[];
 for(const text of expected){
  await page.fill("#cBody",text);await page.click("#send");
  await page.waitForFunction(text=>window.__fakefs.dump().some(f=>f.text.endsWith(text+"\n")),text);
  await page.waitForFunction(text=>window.__boardTest.getModel().msgs.some(m=>m.body===text),text);
  written=await page.evaluate(bodies=>window.__fakefs.dump().filter(f=>bodies.some(body=>f.text.endsWith(body+"\n"))),expected);
  assert.equal(written.length,expected.indexOf(text)+1,"All published messages remain in the backing folder");
  if(text.startsWith("Aaa")){
   await page.clock.setFixedTime(new Date("2026-10-15T10:30:04Z"));
   await h.reloadSettled(ctx,page,{lastDir:true,files:written});await page.waitForSelector("#feed article");
   const after=await page.evaluate(()=>window.__fakefs.dump());
   for(const file of written) assert.deepEqual(after.find(row=>row.path===file.path),file,"Published file survives reload byte-for-byte");
   const indexed=await page.evaluate(()=>window.__boardTest.getModel().msgs.map(m=>".agent-board/"+m.path));
   for(const file of written) assert.ok(indexed.includes(file.path),"Published file is indexed after reload: "+file.path);
   await page.selectOption("#cWhere","room:product");
  }
 }
 const own=await page.evaluate(()=>window.__boardTest.getModel().msgs.filter(m=>m.body.includes(" post")&&m.author==="human-owner-01").map(m=>({body:m.body,time:m.h["POSTED-AT"]})));
 assert.deepEqual(own.map(m=>m.body),["Zzz first post","Aaa second post","Mmm third post"]);assert.equal(new Set(own.map(m=>m.time)).size,3);
 for(let i=1;i<own.length;i++)assert.ok(Date.parse(own[i].time)>Date.parse(own[i-1].time));await ctx.close();
});
test("legacy minute-only messages use file modification times when available and filename fallback when absent",async()=>{
 const {ctx,page}=await h.openPage(browser);
 const result=await page.evaluate(({first,last,firstText,lastText})=>{
  const model=window.__boardTest.buildModel([{path:'rooms/general/'+last,text:lastText,lastModified:2000},{path:'rooms/general/'+first,text:firstText,lastModified:1000}],['rooms','rooms/general'],{name:'test'});
  const fallback=window.__boardTest.buildModel([{path:'rooms/general/'+first,text:firstText},{path:'rooms/general/'+last,text:lastText}],['rooms','rooms/general'],{name:'test'});
  return {ordered:model.msgs.map(m=>m.file),fallback:fallback.msgs.map(m=>m.file)};
 },{first:file("zzz-first"),last:file("aaa-last"),firstText:head("zzz-first",null,"first"),lastText:head("aaa-last",null,"last")});
 assert.deepEqual(result.ordered,[file("zzz-first"),file("aaa-last")]);assert.deepEqual(result.fallback,[file("aaa-last"),file("zzz-first")]);await ctx.close();
});
for(const upload of [false,true])test(`old message timestamps reach the model through ${upload?'folder upload':'native folder refresh'}`,async()=>{
 const proj=h.layoutExample(h.tmpDir()),dir=h.path.join(proj,".agent-board/rooms/general");h.fs.mkdirSync(dir,{recursive:true});
 const first=file("zzz-first"),last=file("aaa-last");
 for(const [name,ms] of [[first,100000],[last,200000]]){const path=h.path.join(dir,name);h.fs.writeFileSync(path,head(name,null,name));h.fs.utimesSync(path,ms/1000,ms/1000);}
 const tree=h.readTree(proj);for(const [name,ms] of [[first,100000],[last,200000]])tree.children[".agent-board"].children.rooms.children.general.children[name].lastModified=ms;
 const {ctx,page}=await h.openPage(browser,upload?{}:{tree});
 if(upload){await page.setInputFiles("#fallback",proj);await page.waitForSelector("#feed article");}else await h.openBoardViaUi(page);await h.expandComposer(page);
 await page.click(".fname:has-text('general')");assert.deepEqual(await h.feedOrder(page),[first,last]);await ctx.close();
});
