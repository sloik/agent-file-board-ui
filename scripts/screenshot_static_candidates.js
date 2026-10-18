'use strict';
// Real offline viewer captures; all data and writes remain in disposable fixtures.
const h=require('../tests/lib/helpers'),assert=require('node:assert/strict');
(async()=>{
 const tmp=h.tmpDir(),project=h.layoutExample(tmp),source=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,'examples/openui-report/static-candidates.json'),'utf8'));
 assert.deepEqual(source,JSON.parse(h.fs.readFileSync(h.path.join(h.ROOT,'docs/examples/openui/static-candidates.json'),'utf8')));
 h.fs.mkdirSync(h.path.join(project,'.agent-board/rooms/reports'));
 const groups=[['charts',source.components.slice(0,5)],['media',source.components.slice(5)]];
 for(const [name,components] of groups){
  const file=h.path.join(tmp,name+'.json');h.fs.writeFileSync(file,JSON.stringify({...source,title:name==='charts'?'Specialty charts':'Offline media and cards',components}));
  const result=h.boardctl(['post','--path',project,'--from','implementation-agent-01','--to','all','--scope','room','--room','reports','--thread',name==='charts'?'T008':'T009','--slug',name,'--at','2026-10-18 12:30','--ui-file',file,'--body','Synthetic static report. All data and images are embedded; controls change only the local view.']);assert.equal(result.code,0,result.err);
 }
 assert.equal(h.boardctl(['validate','--path',project]).code,0);
 const browser=await h.launch();try{
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),clock:new Date('2026-10-18T10:30:00Z')});
  await page.clock.pauseAt(new Date('2026-10-18T10:30:01Z'));await page.setViewportSize({width:1440,height:2600});await page.emulateMedia({colorScheme:'light'});await h.openBoardViaUi(page);
  const before=await page.evaluate(()=>window.__fakefs.dump());
  const topic=name=>page.locator('[data-nav=thread]').filter({hasText:name});
  await topic('T008').click();await page.waitForSelector('.report-specialty');await page.locator('#feed').evaluate(e=>e.scrollTop=0);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-specialty.png')});
  await page.setViewportSize({width:1440,height:2000});await topic('T009').click();await page.waitForSelector('.report-carousel');await page.waitForFunction(()=>[...document.querySelectorAll('.board-report img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.locator('#feed').evaluate(e=>{const target=e.querySelector('.report-image-block');e.scrollTop+=target.getBoundingClientRect().top-e.getBoundingClientRect().top-16;});await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-media.png')});
  await page.locator('.report-modal-trigger>button').click();await page.locator('dialog.report-modal').waitFor({state:'visible'});await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-modal.png')});await page.keyboard.press('Escape');await page.locator('dialog.report-modal').waitFor({state:'hidden'});
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:375,height:1800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#feed').evaluate(e=>{const target=e.querySelector('.report-image-block');e.scrollTop+=target.getBoundingClientRect().top-e.getBoundingClientRect().top-16;});await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-media-phone.png')});
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);await ctx.close();console.log('Four v3 captures: CLI validated, immutable files, local modal and zero network.');
 }finally{await browser.close();h.fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
