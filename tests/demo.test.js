'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const h=require('./lib/helpers'),{demoFixture,topic}=require('./lib/demo');
let browser,demo;
const AT=new Date('2026-10-18T12:00:00Z');
before(async()=>{demo=demoFixture();browser=await h.launch();});
after(async()=>{await browser?.close();if(demo) h.fs.rmSync(demo.tmp,{recursive:true,force:true});});
async function open(upload=false){
 const s=await h.openPage(browser,{html:demo.html,tree:upload?undefined:h.readTree(demo.project),rootName:'demo-board',clock:AT});
 if(upload) await s.page.setInputFiles('#fallback',demo.project);else await h.openBoardViaUi(s.page);
 await s.page.waitForSelector('.tcard');return s;
}
test('extracted downloadable demo renders every gallery topic and posts a valid immutable answer offline',async()=>{
 const {ctx,page,log}=await open();try{
  assert.equal(demo.manifest.componentTypes.length,34);
  assert.match(await page.locator('#folderName').innerText(),/demo-board/);
  assert.equal(await page.locator('.tcard[data-tk="room:general|T000"]').count(),1);
  assert.equal(await page.locator('.tcard[data-tk="room:product|T003"]').count(),1);
  const before=await page.evaluate(()=>window.__fakefs.dump());
  for(const report of demo.manifest.reports){
   await topic(page,report.thread);assert.equal(await page.locator('.report-error:not([hidden]),.metadata-error').count(),0);
   assert.equal(await page.locator('.report-content h3').first().innerText(),report.title);
  }
  await topic(page,'T007');await page.getByRole('tab',{name:'Results',exact:true}).click();await page.locator('.report-filter input').fill('Browser');
  assert.match(await page.locator('.report-table tbody').innerText(),/Browser/);
  await topic(page,'T008');assert.equal(await page.locator('.report-specialty').count(),5);
  await topic(page,'T009');await page.waitForFunction(()=>[...document.querySelectorAll('.board-report img')].length===6&&[...document.querySelectorAll('.board-report img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('.report-carousel').getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('[data-carousel-panel=context]').isVisible(),true);
  await page.locator('.report-modal-trigger>button').click();await page.locator('dialog.report-modal').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('dialog.report-modal').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await topic(page,'T010');await page.selectOption('#me','human-owner-01');await page.locator('.choice-form input[value=fix]').check();await page.locator('.choice-form textarea').fill('Demo answer: fix and retest.');await page.locator('.choice-form [type=submit]').click();
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('ANSWER: {"question":"demo-next-step"')));
  const after=await page.evaluate(()=>window.__fakefs.dump());for(const original of before) assert.deepEqual(after.find(f=>f.path===original.path),original);
  const out=h.path.join(h.tmpDir('afb-demo-posted-'),'project');try{await h.dumpFakeFs(page,out);const result=h.boardctl(['validate','--path',out]);assert.equal(result.code,0,result.err);}finally{h.fs.rmSync(h.path.dirname(out),{recursive:true,force:true});}
  assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});
test('the extracted demo uploads read-only, keeps local controls and downloads a valid reply',async()=>{
 const before=h.readTree(demo.project),{ctx,page,log}=await open(true);try{
  await topic(page,'T009');await page.locator('.report-carousel').getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('[data-carousel-panel=context]').isVisible(),true);
  await page.locator('.report-modal-trigger>button').click();await page.locator('dialog.report-modal').waitFor({state:'visible'});await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('dialog.report-modal').waitFor({state:'hidden'});
  await topic(page,'T010');await page.selectOption('#me','human-owner-01');await page.locator('.choice-form input[value=fix]').check();await page.locator('.choice-form textarea').fill('Read-only demo answer.');
  const downloaded=page.waitForEvent('download');await page.locator('.choice-form [type=submit]').click();const download=await downloaded;
  const out=h.path.join(h.tmpDir('afb-demo-download-'),'project');try{
   h.fs.cpSync(demo.project,out,{recursive:true});await download.saveAs(h.path.join(out,'.agent-board/rooms/reports',download.suggestedFilename()));
   const result=h.boardctl(['validate','--path',out]);assert.equal(result.code,0,result.err);
  }finally{h.fs.rmSync(h.path.dirname(out),{recursive:true,force:true});}
  assert.deepEqual(h.readTree(demo.project),before);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});
