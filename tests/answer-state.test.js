'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),h=require('./lib/helpers');
let browser;before(async()=>browser=await h.launch());after(async()=>browser.close());
const file='2026-10-18_1230_implementation-agent-01_T011_question.txt',dir='.agent-board/rooms/reports/';
const q1={id:'pick',type:'single',prompt:'Choose a release',options:[{id:'ship',label:'Ship'},{id:'hold',label:'Hold'}]};
function question(version){return version===1?q1:{version,id:'pick',type:'form',prompt:'Choose a release',fields:[{id:'choice',type:'input',dataType:'text',label:'Release choice',required:true,maxLength:100}],buttons:[{id:'submit',label:'Submit',action:'submit'}]};}
function answer(version,value){return version===1?{question:'pick',selected:[value==='Ship'?'ship':'hold']}:{version,question:'pick',values:{choice:value}};}
function questionText(version){return `FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: T011-release\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: DECISION-NEEDED\nQUESTION: ${JSON.stringify(question(version))}\n---\nReadable question.\n`;}
function reply(version,value,name,{claim=false,source=file}={}){return `FROM: human-owner-01\nTO: implementation-agent-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: T011-release\nDATE: 2026-10-18 12:31\nLANGUAGE: en\nREPLY-TO: ${source}\nSTATUS: REPLY\nANSWER: ${JSON.stringify(answer(version,value))}\n${claim?'ANSWER-STATE: '+JSON.stringify({version:1,questionDigest:crypto.createHash('sha256').update(questionText(version)).digest('hex'),parents:[],winner:null})+'\n':''}---\nReadable answer: ${value}.\n`;}
async function boot(version,initial=[],upload=false){const project=h.layoutExample(h.tmpDir('afb-acceptance-'));h.fs.mkdirSync(h.path.join(project,dir),{recursive:true});h.fs.writeFileSync(h.path.join(project,dir,file),questionText(version));for(const r of initial)h.fs.writeFileSync(h.path.join(project,dir,r.name),r.text);const s=await h.openPage(browser,{tree:upload?undefined:h.readTree(project)});if(upload)await s.page.setInputFiles('#fallback',project);else await h.openBoardViaUi(s.page);await s.page.locator('.fname').filter({hasText:'reports'}).click();await s.page.waitForSelector(`article[data-file="${file}"]`);return s;}
const firstName='2026-10-18_1231_human-owner-01_T011_first.txt',lateName='2026-10-18_1232_human-owner-01_T011_later.txt';
for(const version of [1,2,3])test(`v${version}: submit embeds shared first claim; all viewers and reload retain it over backdated history`,async()=>{
 const {ctx,page,log}=await boot(version);try{
  if(version===1){await page.locator('.choice-form input[value=ship]').check();await page.locator('.choice-form [type=submit]').click();}
  else{await page.locator('[data-form-field=choice] input').fill('Ship');await page.locator('.form-buttons [type=submit]').click();}
  await page.waitForSelector('[data-answer-status=accepted]');const before=await page.evaluate(()=>window.__fakefs.dump()),published=before.find(f=>/^ANSWER:/m.test(f.text)&&f.text.includes('REPLY-TO: '+file));assert.ok(/^ANSWER-STATE:/m.test(published.text));assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);await page.setViewportSize({width:375,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.setViewportSize({width:1280,height:1000});
  const backdated=reply(version,'Hold',lateName).replace('DATE: 2026-10-18 12:31','DATE: 2026-10-18 12:30');await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text),{path:dir+lateName,text:backdated});await page.click('#reload');await page.waitForFunction(()=>window.__boardTest.getModel().msgs.some(m=>m.file.includes('_later.txt')));
  assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);assert.doesNotMatch(await page.locator('.canonical-answer').innerText(),/Readable answer: Hold/);
  await page.reload();await page.waitForSelector('[data-answer-status=accepted]');assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);
  const snapshot=h.tmpDir('afb-viewer-copy-');await h.dumpFakeFs(page,snapshot);const tree=h.readTree(snapshot);
  const second=await h.openPage(browser,{tree});try{await h.openBoardViaUi(second.page);await second.page.locator('.fname').filter({hasText:'reports'}).click();await second.page.waitForSelector('[data-answer-status=accepted]');assert.match(await second.page.locator('.canonical-answer').innerText(),/Ship/);}finally{await second.ctx.close();}
  assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('offline forks require an explicit question-author choice and preserve all replies',async()=>{
 const {ctx,page,log}=await boot(1,[{name:firstName,text:reply(1,'Ship',firstName,{claim:true})},{name:lateName,text:reply(1,'Hold',lateName,{claim:true})}]);try{
  await page.waitForSelector('[data-answer-status=conflict]');assert.equal(await page.locator('[data-accept-file]').count(),0);
  await page.selectOption('#me','implementation-agent-01');await page.waitForSelector('[data-accept-file]');page.on('dialog',d=>d.accept());
  const before=await page.evaluate(()=>window.__fakefs.dump());await page.locator(`[data-accept-file="${firstName}"]`).click();await page.waitForSelector('[data-answer-status=accepted]');assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);
  const after=await page.evaluate(()=>window.__fakefs.dump());for(const row of before)assert.deepEqual(after.find(r=>r.path===row.path),row);assert.equal(after.filter(r=>/^ANSWER-STATE:/m.test(r.text)).length,3);
  await page.reload();await page.waitForSelector('[data-answer-status=accepted]');assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('legacy answers have no invented historical acceptance; wrong-source reused IDs never count',async()=>{
 const other=file.replace('_question.txt','_other.txt'),{ctx,page,log}=await boot(1,[{name:other,text:questionText(1)},{name:firstName,text:reply(1,'Hold',firstName,{source:other})}]);try{
  const question=page.locator(`article[data-file="${file}"]`);assert.equal(await question.locator('.canonical-answer').count(),0);assert.equal(await question.locator('.choice-form input').count(),2);
  await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text),{path:dir+lateName,text:reply(1,'Ship',lateName)});await page.click('#reload');await question.locator('[data-answer-status=legacy]').waitFor();assert.equal(await question.locator('[type=submit]').count(),0);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});

test('failed conflict publication preserves the unresolved choices and every earlier message',async()=>{
 const {ctx,page,log}=await boot(1,[{name:firstName,text:reply(1,'Ship',firstName,{claim:true})},{name:lateName,text:reply(1,'Hold',lateName,{claim:true})}]);try{
  await page.selectOption('#me','implementation-agent-01');page.on('dialog',d=>d.accept());await page.waitForSelector('[data-accept-file]');const before=await page.evaluate(()=>window.__fakefs.dump());
  await page.evaluate(async file=>{const root=await window.showDirectoryPicker(),b=await root.getDirectoryHandle('.agent-board'),r=await b.getDirectoryHandle('rooms'),d=await r.getDirectoryHandle('reports');Object.getPrototypeOf(await d.getFileHandle(file)).createWritable=async()=>{throw new DOMException('Acceptance write denied','NotAllowedError');};},file);
  await page.locator(`[data-accept-file="${firstName}"]`).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Acceptance write denied'));assert.equal(await page.locator('[data-answer-status=conflict]').count(),1);assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('read-only legacy choice downloads a record without claiming shared acceptance',async()=>{
 const {ctx,page,log}=await boot(1,[{name:firstName,text:reply(1,'Ship',firstName)}],true);try{
  await page.waitForSelector('[data-answer-status=legacy]');await page.selectOption('#me','implementation-agent-01');page.on('dialog',d=>d.accept());const pending=page.waitForEvent('download');await page.locator(`[data-accept-file="${firstName}"]`).click();const download=await pending,text=h.fs.readFileSync(await download.path(),'utf8');
  const state=JSON.parse(text.match(/^ANSWER-STATE: (.*)$/m)[1]);assert.equal(state.winner.file,firstName);assert.deepEqual(state.parents,[]);assert.equal(await page.locator('[data-answer-status=legacy]').count(),1);assert.equal(await page.locator('[data-answer-status=accepted]').count(),0);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});

test('one question has one pending explicit choice even when a stale second control fires',async()=>{
 const {ctx,page,log}=await boot(1,[{name:firstName,text:reply(1,'Ship',firstName,{claim:true})},{name:lateName,text:reply(1,'Hold',lateName,{claim:true})}]);try{
  await page.selectOption('#me','implementation-agent-01');page.on('dialog',d=>d.accept());await page.waitForSelector('[data-accept-file]');
  await page.evaluate(async file=>{const root=await window.showDirectoryPicker(),b=await root.getDirectoryHandle('.agent-board'),r=await b.getDirectoryHandle('rooms'),d=await r.getDirectoryHandle('reports'),proto=Object.getPrototypeOf(await d.getFileHandle(file)),original=proto.createWritable;window.acceptanceWriterCalls=0;proto.createWritable=async function(){window.acceptanceWriterCalls++;await new Promise(resolve=>window.releaseAcceptanceWriter=resolve);return original.call(this);};},file);
  await page.locator(`[data-accept-file="${firstName}"]`).click();await page.waitForFunction(()=>window.acceptanceWriterCalls===1);
  assert.equal(await page.locator(`[data-accept-file="${lateName}"]`).isDisabled(),true);assert.ok((await page.evaluate(()=>window.__boardTest.viewerReloadBlockers())).includes('operation in progress'));
  await page.locator(`[data-accept-file="${lateName}"]`).evaluate(button=>{button.disabled=false;button.click();});assert.equal(await page.evaluate(()=>window.acceptanceWriterCalls),1);
  await page.evaluate(()=>window.releaseAcceptanceWriter());await page.waitForSelector('[data-answer-status=accepted]');assert.match(await page.locator('.canonical-answer').innerText(),/Ship/);assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(r=>/^ANSWER-STATE:/m.test(r.text)).length,3);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
