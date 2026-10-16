'use strict';
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');const h=require('./lib/helpers');let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const badPath='.agent-board/rooms/product/2026-10-16_1200_research-agent-01_T003_broken.txt';
const raw='FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: product\nTHREAD: T003-language-policy\nDATE: 2026-10-16 12:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INVALID\n---\nPlease review the repaired text.\n';
async function boot(){const root=h.layoutExample(h.tmpDir());h.fs.writeFileSync(h.path.join(root,badPath),raw);const s=await h.openPage(browser,{tree:h.readTree(root),dialog:"accept"});await h.openBoardViaUi(s.page);return s;}
for(const correction of [false,true])test(correction?'correction appends a valid message and retains original':'withdraw preserves the original and persists a hash-bound audit',async()=>{
 const {ctx,page,log}=await boot();await page.click('#repairsOpen');await page.selectOption('#repairSelect',badPath.replace('.agent-board/',''));await page.waitForSelector('#repairDialog[aria-busy=false]');await page.fill('#repairReason','Malformed status from agent');
 if(correction)await page.fill('#repairText',raw.replace('STATUS: INVALID','STATUS: INFO'));
 await page.click(correction?'#repairSave':'#repairWithdraw');await page.waitForFunction(()=>window.__boardTest.getModel().msgs.some(m=>m.quarantined));
 assert.equal(await page.evaluate(p=>window.__fakefs.read(p),badPath),raw);assert.equal(await page.locator('#repairWithdraw').isDisabled(),true);
 const files=await page.evaluate(()=>window.__fakefs.dump());assert.equal(files.filter(f=>f.path.includes('_amend-')).length,correction?1:0);
 const out=h.path.join(h.tmpDir(),'saved');h.fs.mkdirSync(out);await h.dumpFakeFs(page,out);const v=h.boardctl(['validate','--path',out]);assert.equal(v.code,0,v.err);
 assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('changed originals and invalid corrections are refused while editor drafts remain',async()=>{
 const {ctx,page}=await boot();await page.click('#repairsOpen');await page.selectOption('#repairSelect',badPath.replace('.agent-board/',''));await page.waitForSelector('#repairDialog[aria-busy=false]');await page.fill('#repairReason','Keep my reason');
 await page.fill('#repairText','invalid correction');await page.click('#repairSave');assert.match(await page.textContent('#repairResult'),/Invalid DATE/);assert.equal(await page.inputValue('#repairText'),'invalid correction');
 await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text),{path:badPath,text:raw+'changed'});await page.click('#repairWithdraw');assert.match(await page.textContent('#repairResult'),/Original changed/);
 assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>/\/repairs\/.*\.json$/.test(f.path)).length,0);await ctx.close();
});

test('valid messages and unrelated direct originals cannot be selected for repair',async()=>{
 const {ctx,page}=await boot();await page.click('#repairsOpen');
 const options=await page.locator('#repairSelect option').evaluateAll(els=>els.map(e=>e.value));assert.equal(options.some(v=>v.startsWith('direct/')),false);
 const healthy=options.find(v=>!v.endsWith('broken.txt'));await page.selectOption('#repairSelect',healthy);await page.waitForSelector('#repairDialog[aria-busy=false]');assert.equal(await page.locator('#repairWithdraw').isDisabled(),true);assert.equal(await page.locator('#repairSave').isDisabled(),true);await ctx.close();
});

test('native invalid UTF8 beyond the preview stays local and hash-bound withdrawal loads in uploads',async()=>{
 const root=h.layoutExample(h.tmpDir()),file=h.path.join(root,badPath);
 h.fs.writeFileSync(file,Buffer.concat([Buffer.from(raw.replace('STATUS: INVALID','STATUS: INFO')+'x'.repeat(10000)),Buffer.from([255])]));
 const result=h.boardctl(['repair','--path',root,'--message',badPath.replace('.agent-board/',''),'--by','human-owner-01','--reason','Invalid UTF8 from agent']);assert.equal(result.code,0,result.err);
 const {ctx,page,log}=await h.openPage(browser);await page.setInputFiles('#fallback',root);await page.waitForSelector('#feed article');
 assert.equal(await page.evaluate(()=>window.__boardTest.getModel().msgs.filter(m=>m.quarantined).length),1);
 assert.ok(await page.locator('#feed article').count()>1);await page.click('#repairsOpen');await page.selectOption('#repairSelect',badPath.replace('.agent-board/',''));await page.waitForSelector('#repairDialog[aria-busy=false]');assert.match(await page.textContent('#repairIssue'),/Invalid UTF-8/);assert.equal(await page.locator('#repairWithdraw').isDisabled(),true);assert.deepEqual(log.pageErrors,[]);await ctx.close();
});


test('repair selection clears stale diagnostics, disables writes and discards an older paused load',async()=>{
 const {ctx,page,log}=await boot();
 await page.click('#repairsOpen');await page.waitForSelector('#repairDialog[aria-busy=false]');
 await page.evaluate(path=>{
  const m=window.__boardTest.getModel().msgs.find(m=>m.path===path), original=m.source.file.text.bind(m.source.file);
  let resume; const gate=new Promise(resolve=>{resume=resolve;});window.__releaseRepair=resume;
  m.source.file.arrayBuffer=async()=>{await gate;return new TextEncoder().encode(await original()).buffer;};
 },badPath.replace('.agent-board/',''));
 await page.selectOption('#repairSelect',badPath.replace('.agent-board/',''));
 assert.equal(await page.getAttribute('#repairDialog','aria-busy'),'true');
 assert.match(await page.textContent('#repairIssue'),/Loading message/);
 assert.equal(await page.inputValue('#repairText'),'');assert.equal(await page.locator('#repairSave').isDisabled(),true);assert.equal(await page.locator('#repairWithdraw').isDisabled(),true);
 const healthy=await page.locator('#repairSelect option').evaluateAll(options=>options.map(o=>o.value).find(v=>!v.endsWith('broken.txt')));
 await page.selectOption('#repairSelect',healthy);await page.waitForSelector('#repairDialog[aria-busy=false]');
 const text=await page.inputValue('#repairText');assert.ok(text);assert.match(await page.textContent('#repairIssue'),/Valid messages are immutable/);
 await page.evaluate(()=>window.__releaseRepair());await page.waitForTimeout(50);
 assert.equal(await page.inputValue('#repairText'),text);assert.equal(await page.inputValue('#repairSelect'),healthy);assert.match(await page.textContent('#repairIssue'),/Valid messages are immutable/);
 assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
