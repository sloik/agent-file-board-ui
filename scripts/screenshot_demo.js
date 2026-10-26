'use strict';
const h=require('../tests/lib/helpers'),{demoFixture,topic}=require('../tests/lib/demo'),assert=require('node:assert/strict');
(async()=>{
 const demo=demoFixture(),browser=await h.launch();try{
  const {ctx,page,log}=await h.openPage(browser,{html:demo.html,tree:h.readTree(demo.project),rootName:'demo-board',clock:new Date('2026-10-18T12:00:00Z')});
  await page.setViewportSize({width:1440,height:1400});await h.openBoardViaUi(page);const before=await page.evaluate(()=>window.__fakefs.dump());
  await topic(page,'T007');await page.locator('#feed').evaluate(e=>e.scrollTop=0);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-demo.png')});
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);await ctx.close();console.log('Captured the actual extracted demo ZIP, offline and unchanged.');
 }finally{await browser.close();h.fs.rmSync(demo.tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
