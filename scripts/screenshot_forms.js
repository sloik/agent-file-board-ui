'use strict';
const h=require('../tests/lib/helpers'),{demoFixture}=require('../tests/lib/demo'),assert=require('node:assert/strict');
(async()=>{
 const demo=demoFixture(),browser=await h.launch();try{
  const {ctx,page,log}=await h.openPage(browser,{html:demo.html,tree:h.readTree(demo.project),rootName:'demo-board',clock:new Date('2026-10-18T12:00:00Z')});await page.setViewportSize({width:1440,height:2000});await h.openBoardViaUi(page);await page.locator('.tcard[data-tk="room:reports|T011"]').click();await page.waitForSelector('.typed-form');
  const before=await page.evaluate(()=>window.__fakefs.dump());await page.locator('[data-form-field=owner] input').fill('Demo owner');await page.locator('[data-form-field=tasks] [data-row=schema][data-column=hours] input').fill('3');await page.locator('[data-form-field=tasks] [data-row=viewer][data-column=approved] input').check();
  await page.locator('#feed').evaluate(e=>e.scrollTop=0);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-forms.png')});
  await page.setViewportSize({width:1440,height:1400});await page.locator('#feed').evaluate(e=>{const target=e.querySelector('[data-form-field=due]');e.scrollTop+=target.getBoundingClientRect().top-e.getBoundingClientRect().top-12;});await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-form-cells.png')});
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:375,height:2200});await page.locator('#feed').evaluate(e=>e.scrollTop=0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-forms-phone.png')});
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);await ctx.close();console.log('Three actual file-page form captures; originals unchanged, zero network.');
 }finally{await browser.close();h.fs.rmSync(demo.tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
