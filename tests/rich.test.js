"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const AT=new Date("2026-10-15T10:30:00Z");
const QUESTION={id:"release",type:"single",prompt:"Where should we release?",options:[{id:"stage",label:"Staging"},{id:"prod",label:"Production"},{id:"hold",label:"Hold release"}]};
const QFILE="2026-10-15_1230_implementation-agent-01_T004_question.txt";
function rawMessage({body="Choose a target below.",contentType="text/markdown",question=QUESTION,scope="room",duplicate=false}={}){
  const routing=scope==="direct"?"SCOPE: DIRECT\nDIRECT-PARTICIPANTS: human-owner-01, implementation-agent-01":"SCOPE: ROOM\nROOM: questions";
  return `FROM: implementation-agent-01\nTO: human-owner-01\n${routing}\nTHREAD: T004-release\nDATE: 2026-10-15 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: QUESTION\nCONTENT-TYPE: ${contentType}\n${question?`QUESTION: ${typeof question==="string"?question:JSON.stringify(question)}\n`:""}${duplicate?'QUESTION: {}\n':""}---\n${body}\n`;
}
async function boot(opts={}){
  const tmp=h.tmpDir(),proj=h.layoutExample(tmp),dir=opts.scope==="direct"?"direct/human-owner-01--implementation-agent-01":"rooms/questions";
  h.fs.mkdirSync(h.path.join(proj,".agent-board",dir),{recursive:true});
  h.fs.writeFileSync(h.path.join(proj,".agent-board",dir,QFILE),rawMessage(opts));
  const s=await h.openPage(browser,{tree:h.readTree(proj),clock:AT,dialog:opts.dialog});
  await h.openBoardViaUi(s.page);await h.expandComposer(s.page); await s.page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));
  return {...s,tmp,proj,questionPath:`.agent-board/${dir}/${QFILE}`};
}
const form=page=>page.locator(".choice-form").last();
async function postedAnswer(page){
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.path.endsWith(".txt")&&f.text.includes('\nANSWER: ')));
  return (await page.evaluate(()=>window.__fakefs.dump())).filter(f=>f.path.endsWith(".txt")&&f.text.includes("\nANSWER: ")).at(-1);
}

test("nested Markdown, embedded HTML and literal fenced code render as structured content",async()=>{
  const body="# Release plan\n\n> Review **carefully**\n>\n> - Parent\n>   - Child with *emphasis*\n\n| Target | Ready |\n|---|---|\n| Staging | yes |\n\n<div><strong>Nested HTML <em>inside</em></strong></div>\n\n```html\n<img src=\"https://example.invalid/code\" onerror=\"alert(1)\">\n```\n\nAsk @human-owner-01.";
  const {ctx,page,log}=await boot({body});
  const article=page.locator(`article[data-file='${QFILE}']`);
  assert.equal(await article.locator(".body h1").innerText(),"Release plan");
  assert.equal(await article.locator("blockquote ul ul li").innerText(),"Child with emphasis");
  assert.equal(await article.locator("table tbody tr").count(),1);
  assert.equal(await article.locator(".body div strong em").innerText(),"inside");
  assert.match(await article.locator("pre code").innerText(),/<img src=/);
  assert.equal(await article.locator(".body img").count(),0);
  assert.equal(await article.locator(".body .mention").count(),1);
  assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);
  assert.deepEqual(log.pageErrors,[]); await ctx.close();
});

test("nested HTML is sanitized before any resources or viewer actions can execute",async()=>{
  const body='<section><h2>Safe heading</h2><div><p><strong>Nested <em>markup</em></strong></p></div></section>'+ 
    '<script>window.richAttack=true</script><img src="https://example.invalid/image" onerror="window.richAttack=true">'+
    '<iframe src="https://example.invalid/frame"></iframe><video poster="https://example.invalid/poster"><source src="https://example.invalid/video"></video>'+
    '<style>@import "https://example.invalid/css";</style><link rel="stylesheet" href="https://example.invalid/link">'+
    '<svg onload="window.richAttack=true"><a href="javascript:alert(1)">SVG</a></svg><math><mtext>Math</mtext></math>'+
    '<form id="me"><input name="dirHandle"><button data-reply="fake">Spoof</button></form><span class="btn" data-reply="fake" onclick="window.richAttack=true">Text</span>'+
    '<a href="javascript:alert(1)">Unsafe</a><a href="file:///etc/passwd">File</a><a href="https://example.com/docs">Docs</a>';
  const {ctx,page,log}=await boot({body,contentType:"text/html"});
  const article=page.locator(`article[data-file='${QFILE}'] .body`);
  assert.equal(await article.locator("section div p strong em").innerText(),"markup");
  assert.equal(await article.locator("script,img,iframe,video,source,style,link,svg,math,form,input,button,[id],[name],[style],[class]:not(.file-reference):not(.file-action),[data-reply],[onclick]").count(),0);
  assert.deepEqual(await article.locator("a:not(.file-action)").evaluateAll(els=>els.filter(el=>el.hasAttribute("href")).map(el=>[el.getAttribute("href"),el.rel,el.target])),[["https://example.com/docs","noopener noreferrer","_blank"]]);
  assert.equal(await page.evaluate(()=>window.richAttack),undefined);
  assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);
  assert.deepEqual(log.pageErrors,[]); await ctx.close();
});

test("single choice is exclusive and sends an immutable structured reply without touching the draft",async()=>{
  const {ctx,page,questionPath}=await boot();
  const original=await page.evaluate(path=>window.__fakefs.read(path),questionPath);
  assert.equal(await form(page).locator("[type=submit]").isDisabled(),true);
  await page.fill("#cBody","Keep my unfinished message");
  await form(page).locator("input[value=stage]").check(); await form(page).locator("input[value=prod]").check();
  assert.equal(await form(page).locator("input:checked").count(),1);
  await form(page).locator("[type=submit]").click();
  const answer=await postedAnswer(page),headers=Object.fromEntries(answer.text.split("\n---\n")[0].split("\n").map(line=>{const at=line.indexOf(": ");return [line.slice(0,at),line.slice(at+2)];}));
  assert.deepEqual(JSON.parse(headers.ANSWER),{question:"release",selected:["prod"]});
  assert.equal(headers["REPLY-TO"],QFILE);assert.equal(headers.FROM,"human-owner-01");assert.equal(headers.TO,"implementation-agent-01");
  assert.equal(headers.ROOM,"questions");assert.equal(headers.THREAD,"T004-release");assert.equal(headers.STATUS,"REPLY");
  assert.match(answer.text,/Selected: Production/);
  assert.equal(await page.evaluate(path=>window.__fakefs.read(path),questionPath),original);
  assert.equal(await page.inputValue("#cBody"),"Keep my unfinished message");
  await form(page).locator("[type=submit]").click(); assert.match(await page.textContent("#toast"),/already been posted/);
  assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>f.path.endsWith(".txt")&&f.text.includes("\nANSWER: ")).length,1);
  await ctx.close();
});

test("multiple choice allows several answers, keeps checked state/focus during timer refresh and separates respondents",async()=>{
  const {ctx,page}=await boot({question:{...QUESTION,type:"multiple"}});
  await form(page).locator("input[value=stage]").check(); await form(page).locator("input[value=hold]").check();
  await page.evaluate(()=>window.__fakefs.addFile(".agent-board/rooms/questions/2026-10-15_1231_research-agent-01_T005_new.txt",'FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: questions\nTHREAD: T005-new\nDATE: 2026-10-15 12:31\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nA new arrival\n'));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000); await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.deepEqual(await form(page).locator("input:checked").evaluateAll(els=>els.map(el=>el.value)),["stage","hold"]);
  assert.equal(await page.evaluate(()=>document.activeElement.value),"hold");
  await page.selectOption("#me","research-agent-01");assert.equal(await form(page).locator("input:checked").count(),0);
  await page.selectOption("#me","human-owner-01");assert.equal(await form(page).locator("input:checked").count(),2);
  await form(page).locator("[type=submit]").click();const answer=await postedAnswer(page);
  assert.deepEqual(JSON.parse(answer.text.match(/^ANSWER: (.*)$/m)[1]).selected,["stage","hold"]);await ctx.close();
});

test("direct answers preserve the pair; unrelated identities cannot answer",async()=>{
  const {ctx,page}=await boot({scope:"direct"});
  await page.selectOption("#me","research-agent-01");assert.equal(await form(page).locator("input").first().isDisabled(),true);
  await page.selectOption("#me","human-owner-01");await form(page).locator("input[value=stage]").check();await form(page).locator("[type=submit]").click();
  const answer=await postedAnswer(page);assert.match(answer.path,/direct\/human-owner-01--implementation-agent-01\//);
  assert.match(answer.text,/SCOPE: DIRECT\nDIRECT-PARTICIPANTS: human-owner-01, implementation-agent-01/);await ctx.close();
});

test("malformed metadata never creates working choice controls and retains readable body",async()=>{
  for(const opts of [{question:"{"},{question:{...QUESTION,options:[QUESTION.options[0],QUESTION.options[0]]}},{duplicate:true},{contentType:"application/javascript"}]){
    const {ctx,page}=await boot({...opts,body:"Readable fallback"});
    const article=page.locator(`article[data-file='${QFILE}']`);
    assert.match(await article.locator(".body").innerText(),/Readable fallback/);
    assert.equal(await article.locator(".choice-form").count(),0);
    assert.equal(await article.locator(".metadata-error").count(),1);await ctx.close();
  }
});

test("agent answering retains explicit confirmation and cancellation keeps choices",async()=>{
  const {ctx,page,log}=await boot({dialog:"dismiss"});await page.selectOption("#me","research-agent-01");
  await form(page).locator("input[value=stage]").check();await form(page).locator("[type=submit]").click();
  assert.equal(log.dialogs.length,1);assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>f.path.endsWith(".txt")&&f.text.includes("\nANSWER: ")).length,0);
  assert.equal(await form(page).locator("input[value=stage]").isChecked(),true);await ctx.close();
});

test("read-only answering downloads the structured reply",async()=>{
  const tmp=h.tmpDir(),proj=h.layoutExample(tmp);h.fs.mkdirSync(h.path.join(proj,".agent-board/rooms/questions"));
  h.fs.writeFileSync(h.path.join(proj,".agent-board/rooms/questions",QFILE),rawMessage());
  const {ctx,page}=await h.openPage(browser,{clock:AT});await page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));
  await page.setInputFiles("#fallback",proj);await page.waitForSelector(".choice-form");
  await form(page).locator("textarea").fill("My own answer 🦊");
  const [dl]=await Promise.all([page.waitForEvent("download"),form(page).locator("[type=submit]").click()]);
  const dest=h.path.join(tmp,dl.suggestedFilename());await dl.saveAs(dest);
  assert.match(await page.textContent("#toast"),/File downloaded/);
  assert.deepEqual(JSON.parse(h.fs.readFileSync(dest,"utf8").match(/^ANSWER: (.*)$/m)[1]),{question:"release",selected:[],text:"My own answer 🦊"});await ctx.close();
});

test("composer format selector writes CONTENT-TYPE; missing header retains legacy reflow",async()=>{
  const {ctx,page}=await boot({question:null});
  await h.expandComposer(page);await page.selectOption("#cWhere","room:questions");await page.selectOption("#cContentType","text/markdown");await page.fill("#cBody","## A composed heading\n\n- Parent\n  - Child");await page.click("#send");
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.path.endsWith(".txt")&&f.text.includes("## A composed heading")));
  const post=(await page.evaluate(()=>window.__fakefs.dump())).find(f=>f.path.endsWith(".txt")&&f.text.includes("## A composed heading"));
  assert.match(post.text,/^CONTENT-TYPE: text\/markdown$/m);
  await page.waitForSelector("article .body h2:has-text('A composed heading')");
  assert.equal(await page.locator("article .body h2:has-text('A composed heading')").count(),1);
  assert.equal(await page.locator("article .body ul ul li:has-text('Child')").count(),1);await ctx.close();
});

test("shared standard metadata fixtures produce matching frontend validation",async()=>{
  const cases=JSON.parse(h.fs.readFileSync(h.path.join(__dirname,"fixtures/rich-metadata.json"),"utf8"));
  const {ctx,page}=await h.openPage(browser);
  const actual=await page.evaluate(cases=>cases.map(c=>{try{window.__boardTest.messageMetadata(c.headers,c.source);return true;}catch(e){return false;}}),cases);
  assert.deepEqual(actual,cases.map(c=>c.valid));await ctx.close();
});

test("failed answer writes retain choices and question history",async()=>{
  const {ctx,page,questionPath}=await boot();
  const original=await page.evaluate(path=>window.__fakefs.read(path),questionPath);
  await page.evaluate(async name=>{
    const root=await window.showDirectoryPicker(),base=await root.getDirectoryHandle(".agent-board"),rooms=await base.getDirectoryHandle("rooms"),dir=await rooms.getDirectoryHandle("questions"),file=await dir.getFileHandle(name);
    Object.getPrototypeOf(file).createWritable=async()=>{throw Error("Disk unavailable");};
  },QFILE);
  await form(page).locator("input[value=prod]").check();await form(page).locator("textarea").fill("Keep this note");await form(page).locator("[type=submit]").click();
  await page.waitForFunction(()=>document.querySelector("#toast").textContent.includes("Disk unavailable"));
  assert.match(await page.textContent("#toast"),/Disk unavailable/);
  assert.equal(await form(page).locator("textarea").inputValue(),"Keep this note");
  assert.equal(await form(page).locator("input[value=prod]").isChecked(),true);
  assert.equal(await form(page).locator("[type=submit]").isEnabled(),true);
  assert.equal(await page.evaluate(path=>window.__fakefs.read(path),questionPath),original);
  assert.equal((await page.evaluate(()=>window.__fakefs.dump())).some(f=>f.path.endsWith(".txt")&&f.text.includes("\nANSWER: ")),false);await ctx.close();
});

test("rapid duplicate submits write just one answer",async()=>{
  const {ctx,page}=await boot();await form(page).locator("input[value=stage]").check();
  await form(page).evaluate(el=>{el.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));el.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
  await postedAnswer(page);
  assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>f.path.endsWith(".txt")&&f.text.includes("\nANSWER: ")).length,1);await ctx.close();
});

test("long questions expand their message body while leaving the choice controls usable",async()=>{
  const {ctx,page}=await boot({body:"Long explanation. ".repeat(100)});
  const article=page.locator(`article[data-file='${QFILE}']`);
  assert.equal(await article.locator(".body.clamp").count(),1);
  await article.locator("[data-more]").click();assert.equal(await article.locator(".body.clamp").count(),0);
  assert.equal(await article.locator(".choice-form.clamp").count(),0);
  await article.locator("input[value=stage]").check();assert.equal(await article.locator("input[value=stage]").isChecked(),true);
  await article.locator("[data-more]").click();assert.equal(await article.locator(".body.clamp").count(),1);await ctx.close();
});

test("long code lines and nested tables scroll within message bounds on desktop and phone",async()=>{
  const {ctx,page}=await boot({body:"```text\n"+"long-code-".repeat(80)+"\n```\n\n| Column | Details |\n|---|---|\n| Item | "+"long-table-content-".repeat(40)+" |\n"});
  for(const width of [1280,375]){
    await page.setViewportSize({width,height:900});
    const layout=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));
    assert.equal(layout.documentWidth,layout.width);
    assert.equal(await page.locator(`article[data-file='${QFILE}'] pre`).evaluate(el=>el.scrollWidth>el.clientWidth),true);
  }
  await ctx.close();
});


test("questions accept notes with choices and text-only replies, deduplicating the full answer",async()=>{
  const {ctx,page}=await boot();
  await form(page).locator("textarea").fill("  ");
  assert.equal(await form(page).locator("[type=submit]").isDisabled(),true);
  await form(page).locator("input[value=stage]").check();
  const text="Please verify first.\n<table>custom 🦊</table>";
  await form(page).locator("textarea").fill(text);
  await form(page).locator("[type=submit]").click();
  const first=await postedAnswer(page);
  assert.deepEqual(JSON.parse(first.text.match(/^ANSWER: (.*)$/m)[1]),{question:"release",selected:["stage"],text});
  assert.ok(first.text.includes("\n\n"+text));
  await page.waitForFunction(()=>window.__boardTest.stats.builds>0 && document.querySelectorAll("article").length>1);
  await form(page).locator("[data-clear-choices]").click();
  assert.equal(await form(page).locator("input:checked").count(),0);
  await form(page).locator("[type=submit]").click();
  await page.waitForFunction(()=>window.__fakefs.dump().filter(f=>f.path.endsWith(".txt")&&f.text?.includes("\nANSWER: ")).length===2);
  const second=await postedAnswer(page);
  assert.deepEqual(JSON.parse(second.text.match(/^ANSWER: (.*)$/m)[1]),{question:"release",selected:[],text});
  await page.waitForFunction(()=>document.querySelectorAll("article").length>2);
  assert.equal(await page.locator(".body table").count(),0);
  await form(page).locator("[type=submit]").click();
  assert.match(await page.textContent("#toast"),/already been posted/);
  await form(page).locator("textarea").fill("A different reply");
  await form(page).locator("[type=submit]").click();
  await page.waitForFunction(()=>window.__fakefs.dump().filter(f=>f.path.endsWith(".txt")&&f.text?.includes("\nANSWER: ")).length===3);
  const out=h.path.join(h.tmpDir(),"posted");h.fs.mkdirSync(out);await h.dumpFakeFs(page,out);
  const validation=h.boardctl(["validate","--path",out]);assert.equal(validation.code,0,validation.err);
  await ctx.close();
});

test("custom text, selection and caret survive refresh and identity changes",async()=>{
  const {ctx,page}=await boot({question:{...QUESTION,type:"multiple"}});
  await form(page).locator("input[value=stage]").check();
  await form(page).locator("textarea").fill("My custom answer\nSecond line");
  await form(page).locator("textarea").evaluate(el=>el.setSelectionRange(3,9,"backward"));
  await page.evaluate(()=>window.__fakefs.addFile(".agent-board/rooms/questions/2026-10-15_1231_research-agent-01_T005_arrival.txt",'FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: questions\nTHREAD: T005-arrival\nDATE: 2026-10-15 12:31\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nArrival\n'));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.deepEqual(await form(page).locator("textarea").evaluate(el=>[el.value,el===document.activeElement,el.selectionStart,el.selectionEnd,el.selectionDirection]),["My custom answer\nSecond line",true,3,9,"backward"]);
  await page.selectOption("#me","research-agent-01");assert.equal(await form(page).locator("textarea").inputValue(),"");
  await page.selectOption("#me","human-owner-01");assert.equal(await form(page).locator("textarea").inputValue(),"My custom answer\nSecond line");
  assert.equal(await form(page).locator("input[value=stage]").isChecked(),true);
  await form(page).locator("textarea").fill("x".repeat(10001));assert.equal(await form(page).locator("[type=submit]").isDisabled(),true);
  await form(page).locator("textarea").fill("🦊".repeat(10000));assert.equal(await form(page).locator("[type=submit]").isDisabled(),false);
  await page.setViewportSize({width:375,height:800});await page.emulateMedia({colorScheme:"dark"});
  assert.equal(await form(page).evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.equal(await form(page).locator("textarea").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(29, 34, 41)");
  await ctx.close();
});
