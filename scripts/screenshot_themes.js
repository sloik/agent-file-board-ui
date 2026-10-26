'use strict';
const h=require('../tests/lib/helpers'),{demoFixture,topic}=require('../tests/lib/demo'),assert=require('node:assert/strict');
(async()=>{const demo=demoFixture(),browser=await h.launch();try{
 const {ctx,page,log}=await h.openPage(browser,{html:demo.html,tree:h.readTree(demo.project),clock:new Date('2026-10-19T12:00:00Z')});await page.setViewportSize({width:1440,height:1000});await h.openBoardViaUi(page);await topic(page,'T007');
 const before=await page.evaluate(()=>window.__fakefs.dump());await page.click('#gear');await page.selectOption('#sTheme','dracula');await page.click('#sClose');await page.locator('#feed').evaluate(e=>e.scrollTop=0);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-dracula.png')});
 await page.click('#gear');await page.selectOption('#sLang','pl');await page.setViewportSize({width:375,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-themes-phone.png')});
 assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);await ctx.close();console.log('Dracula desktop and Polish phone theme captures; unchanged files, zero network.');
}finally{await browser.close();h.fs.rmSync(demo.tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
