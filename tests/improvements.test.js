"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
const c=require("./lib/checks");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const AT=new Date("2026-10-15T10:30:00Z");
async function boot(){
  const s=await c.openExample(browser,h.BOARD_HTML,{clock:AT});
  await s.page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));
  return s;
}
async function addMessage(page,{room="product",tid="T003",label="polish-default",slug="incoming",date="2026-10-15 12:31"}={}){
  await page.evaluate(o=>window.__fakefs.addFile(`.agent-board/rooms/${o.room}/2026-10-15_1231_research-agent-01_${o.tid}_${o.slug}.txt`,
    `FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: ${o.room}\nTHREAD: ${o.tid}-${o.label}\nDATE: ${o.date}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nNew incoming message ${o.slug}\n`),{room,tid,label,slug,date});
}
async function refresh(page){
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.click("#reload");
  await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
}

test("completion searches room, topic and participant names and chooses with keyboard or mouse",async()=>{
  const {ctx,page,log}=await boot();
  await page.fill("#cWhereSearch","prod");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  assert.equal(await page.inputValue("#cWhere"),"room:product");
  await page.fill("#cThreadSearch","T003");
  await page.click("#cThreadSuggestions button");
  assert.equal(await page.inputValue("#cThread"),"room:product|T003");
  await page.fill("#cToSearch","research"); await page.keyboard.press("Enter");
  assert.equal(await page.inputValue("#cTo"),"research-agent-01");
  await page.fill("#cBody","Ask @rese"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  assert.equal(await page.inputValue("#cBody"),"Ask @research-agent-01 ");
  await page.fill("#cBody","See #prod"); await page.keyboard.press("Tab");
  assert.equal(await page.inputValue("#cBody"),"See #product ");
  await page.fill("#cBody","See #T003"); await page.keyboard.press("Enter");
  assert.match(await page.inputValue("#cBody"),/^See #T003-\S+ $/);
  await page.fill("#cBody","@rese"); await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#bodySuggestions"),false);
  assert.equal(await page.inputValue("#cBody"),"@rese");
  assert.deepEqual(log.pageErrors,[]); await ctx.close();
});

test("timer refresh preserves different composer destination, new topic, recipient, status, language, focus, caret and reply",async()=>{
  const {ctx,page}=await boot();
  await page.click(".fname:has-text('architecture')");
  await page.locator("#feed [data-reply]").first().click({force:true});
  await page.selectOption("#cWhere","room:product"); await page.selectOption("#cThread","");
  await page.fill("#cNewThread","Unfinished topic"); await page.fill("#cNewRoom","future-room");
  await page.selectOption("#cTo","research-agent-01"); await page.selectOption("#cStatus","QUESTION"); await page.selectOption("#cLang","en");
  await page.fill("#cBody","My unfinished draft");
  await page.evaluate(()=>{const el=document.querySelector("#cBody");el.focus();el.setSelectionRange(3,7);window.savedBody=el;window.savedTo=document.querySelector("#cTo").firstChild;});
  await addMessage(page);
  const n=await page.evaluate(()=>window.__boardTest.stats.autoRefreshes);
  await page.clock.runFor(61000);
  await page.waitForFunction(n=>window.__boardTest.stats.autoRefreshes>n && window.__boardTest.getModel().msgs.some(m=>m.body.includes("New incoming")),n);
  assert.deepEqual(await page.evaluate(()=>({where:document.querySelector("#cWhere").value,thread:document.querySelector("#cThread").value,to:document.querySelector("#cTo").value,status:document.querySelector("#cStatus").value,lang:document.querySelector("#cLang").value,
    body:document.querySelector("#cBody").value,focus:document.activeElement.id,selection:[savedBody.selectionStart,savedBody.selectionEnd],sameBody:savedBody===document.querySelector("#cBody"),sameOption:savedTo===document.querySelector("#cTo").firstChild})),
    {where:"room:product",thread:"",to:"research-agent-01",status:"QUESTION",lang:"en",body:"My unfinished draft",focus:"cBody",selection:[3,7],sameBody:true,sameOption:true});
  assert.equal(await page.inputValue("#cNewThread"),"Unfinished topic"); assert.equal(await page.inputValue("#cNewRoom"),"future-room");
  assert.equal(await page.isVisible("#replying"),true);
  await page.focus("#cTo");
  await page.evaluate(()=>{
    const path=".agent-board/participants.json", registry=JSON.parse(window.__fakefs.read(path));
    registry.participants.push({id:"new-agent-01",kind:"agent",name:"New agent"}); window.__fakefs.addFile(path,JSON.stringify(registry));
    window.selectedOption=document.querySelector("#cTo").firstChild;
  });
  await page.clock.runFor(61000);
  await page.waitForFunction(()=>!!window.__boardTest.getModel().people["new-agent-01"]);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"cTo");
  assert.equal(await page.evaluate(()=>window.selectedOption===document.querySelector("#cTo").firstChild),true);
  assert.equal(await page.inputValue("#cTo"),"research-agent-01");
  await page.focus("#cBody");
  assert.equal(await page.locator("#cTo option[value='new-agent-01']").count(),1);
  await ctx.close();
});

test("composer resize changes the whole pane, persists and resets; keyboard works",async()=>{
  const {ctx,page}=await boot();
  const height=()=>page.locator("#composer").evaluate(el=>Math.round(el.getBoundingClientRect().height));
  const initial=await height(), box=await page.locator("#composerResizer").boundingBox();
  await page.mouse.move(box.x+100,box.y+4); await page.mouse.down(); await page.mouse.move(box.x+100,box.y-96,{steps:5}); await page.mouse.up();
  const resized=await height(); assert.ok(resized>initial+50,`${initial} -> ${resized}`);
  const stored=await page.evaluate(()=>window.__boardTest.getSettings().composerH);
  await h.reloadSettled(ctx,page,{setting:["composerH",stored]}); await page.waitForSelector("#feed article.msg");
  assert.equal(await height(),resized,JSON.stringify(await page.evaluate(()=>({settings:window.__boardTest.getSettings(),style:document.documentElement.style.cssText,storage:localStorage.getItem("agent-file-board-ui.settings")}))));
  await page.focus("#composerResizer"); await page.keyboard.press("ArrowDown"); assert.equal(await height(),resized-20);
  await page.dblclick("#composerResizer"); assert.equal(await height(),initial);
  await ctx.close();
});

test("unread badges survive polling and reload, clear on visit, aggregate in collapsed rooms; topic order is stable or newest by preference",async()=>{
  const {ctx,page}=await boot();
  await page.click(".fname:has-text('product')");
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").count(),0);
  await page.click(".fname:has-text('architecture')");
  await page.click(".folder:has(.fname:has-text('product')) .chev");
  await addMessage(page); await refresh(page);
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").innerText(),"1 unread");
  await h.reloadSettled(ctx,page,{lastDir:true}); await page.waitForSelector("#feed article.msg");
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").innerText(),"1 unread");
  await page.click(".fname:has-text('product')");
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").count(),0);
  // Two open topics in the same room: later activity does not reorder default.
  await addMessage(page,{tid:"T004",label:"later-topic",slug:"later"}); await refresh(page);
  await page.click(".folder:has(.fname:has-text('product')) .chev");
  const order=()=>page.locator(".folder:has(.fname:has-text('product')) .tcard").evaluateAll(els=>els.map(e=>e.dataset.tk));
  assert.deepEqual(await order(),["room:product|T003","room:product|T004"]);
  await addMessage(page,{slug:"latest",date:"2026-10-15 12:32"}); await refresh(page);
  assert.deepEqual(await order(),["room:product|T003","room:product|T004"]);
  await page.click("#gear"); await page.selectOption("#sThreadOrder","newest");
  assert.deepEqual(await order(),["room:product|T003","room:product|T004"]);
  await page.selectOption("#sThreadOrder","stable");
  await page.click("#sClose"); await addMessage(page,{tid:"T004",label:"later-topic",slug:"last",date:"2026-10-15 12:33"}); await refresh(page);
  assert.deepEqual(await order(),["room:product|T003","room:product|T004"]);
  await page.click("#gear"); await page.selectOption("#sThreadOrder","newest");
  assert.deepEqual(await order(),["room:product|T004","room:product|T003"]);
  await h.reloadSettled(ctx,page,{setting:["threadOrder","newest"]}); await page.waitForSelector("#feed article.msg");
  assert.deepEqual(await order(),["room:product|T004","room:product|T003"]); await ctx.close();
});

test("setting a current topic title appends a valid message, updates every current title and preserves history and draft",async()=>{
  const {ctx,page,tmp}=await boot();
  await page.click(".tcard[data-tk='room:product|T003']");
  const original=await page.evaluate(()=>window.__fakefs.dump());
  await page.fill("#cBody","Keep my draft"); await page.fill("#topicTitle","Updated topic title"); await page.click("#setTitle");
  await page.waitForFunction(()=>document.querySelector("#title").textContent.includes("Updated topic title"));
  assert.match(await page.locator(".tcard[data-tk='room:product|T003'] .ttl").innerText(),/Updated topic title/);
  assert.match(await page.locator("#cThread option:checked").innerText(),/Updated topic title/);
  assert.equal(await page.inputValue("#cBody"),"Keep my draft");
  const files=await page.evaluate(()=>window.__fakefs.dump());
  assert.equal(files.length,original.length+1);
  for(const f of original) assert.equal(files.find(x=>x.path===f.path).text,f.text);
  assert.match(files.find(x=>!original.some(f=>f.path===x.path)).text,/THREAD: T003-updated-topic-title\n/);
  const out=h.path.join(tmp,"output"); await h.dumpFakeFs(page,out); const v=h.boardctl(["validate","--path",out]); assert.equal(v.code,0,v.err);
  await refresh(page); assert.match(await page.textContent("#title"),/Updated topic title/);
  // Same minute, reversed alphabetic slug: the newest title must still win.
  await page.fill("#topicTitle","An earlier alphabetic title"); await page.click("#setTitle");
  await page.waitForFunction(()=>document.querySelector("#title").textContent.includes("An earlier alphabetic title"));
  await page.fill("#topicTitle","!!!"); await page.click("#setTitle"); assert.equal((await page.evaluate(()=>window.__fakefs.dump())).length,files.length+1);
  await ctx.close();
});

test("background refresh preserves a reader's scroll and expanded messages; unchanged polls keep feed nodes",async()=>{
  const {ctx,page}=await boot();
  await page.evaluate(()=>{
    for(let i=0;i<12;i++) window.__fakefs.addFile(`.agent-board/rooms/product/2026-10-15_1200_research-agent-01_T003_long-${i}.txt`,
      `FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: product\nTHREAD: T003-language-policy\nDATE: 2026-10-15 12:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: REPLY\n---\n${"Paragraph of a long message. ".repeat(70)}`);
  });
  await refresh(page); await page.click(".fname:has-text('product')");
  await page.locator("#feed [data-more]").first().click();
  await page.evaluate(()=>{document.querySelector("#feed").scrollTop=100; window.savedArticle=document.querySelector("#feed .msg");});
  const top=await page.locator("#feed").evaluate(el=>el.scrollTop);
  await refresh(page);
  assert.equal(await page.evaluate(()=>window.savedArticle===document.querySelector("#feed .msg")),true);
  await addMessage(page); await refresh(page);
  assert.equal(await page.locator("#feed").evaluate(el=>el.scrollTop),top);
  assert.equal(await page.locator("#feed .msg:has([data-more])").first().locator(".body").evaluate(el=>el.classList.contains("clamp")),false);
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").innerText(),"1 unread");
  await ctx.close();
});

test("title updates retain a closed topic's status and require agent confirmation",async()=>{
  const {ctx,page,log}=await c.openExample(browser,h.BOARD_HTML,{clock:AT,dialog:"dismiss"});
  await page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));
  await page.click(".folder:has(.fname:has-text('architecture')) .group");
  await page.click(".tcard[data-tk='room:architecture|T001']");
  const count=await page.evaluate(()=>window.__fakefs.dump().length);
  await page.selectOption("#me","research-agent-01"); await page.fill("#topicTitle","Closed schema"); await page.click("#setTitle");
  assert.equal(log.dialogs.length,1); assert.equal(await page.evaluate(()=>window.__fakefs.dump().length),count);
  await page.selectOption("#me","human-owner-01"); await page.click("#setTitle");
  await page.waitForFunction(()=>document.querySelector("#title").textContent.includes("Closed schema"));
  assert.equal(await page.locator(".tcard[data-tk='room:architecture|T001'] .sdot.s-CLOSED").count(),1);
  await ctx.close();
});

test("vocabulary reads the board's canonical glossary, refreshes it, renders safely and reports absent files",async()=>{
  const {ctx,page,log}=await boot();
  await page.click("#vocabularyOpen");
  assert.match(await page.textContent("#vocabularyText"),/no GLOSSARY.md/);
  await page.click("#vocabularyClose");
  const glossary="# Canonical vocabulary\n\nCoordinate: take the next action toward the goal.\n<script>throw Error('must remain text')</script>";
  await page.evaluate(text=>window.__fakefs.addFile(".agent-board/GLOSSARY.md",text),glossary);
  await refresh(page); await page.click("#vocabularyOpen");
  assert.equal(await page.textContent("#vocabularyText"),glossary);
  assert.equal(await page.locator("#vocabularyText script").count(),0);
  await page.keyboard.press("Escape"); assert.equal(await page.isVisible("#vocabulary"),false);
  await page.evaluate(()=>window.__fakefs.addFile(".agent-board/GLOSSARY.md","# Changed canonical definitions\nRead does not mean accept."));
  await refresh(page); await page.click("#vocabularyOpen");
  assert.match(await page.textContent("#vocabularyText"),/Changed canonical/);
  assert.deepEqual(log.pageErrors,[]); await ctx.close();
});

test("read-only folder upload also loads the canonical glossary",async()=>{
  const tmp=h.tmpDir(), proj=h.layoutExample(tmp);
  const text="# Board glossary\nCoordinate: act on the next authorized step.";
  h.fs.writeFileSync(h.path.join(proj,".agent-board/GLOSSARY.md"),text);
  const {ctx,page}=await h.openPage(browser);
  await page.setInputFiles("#fallback",proj); await page.waitForSelector("#feed article.msg");
  await page.click("#vocabularyOpen"); assert.equal(await page.textContent("#vocabularyText"),text);
  await ctx.close();
});
