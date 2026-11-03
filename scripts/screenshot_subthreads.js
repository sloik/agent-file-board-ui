'use strict';
// SPEC-002-078: the sub-thread pane in the downloadable demo (architecture T017). Real viewer, the demo's
// fictional board, no user folders or network; writes only docs/images/board-subthread-*.png.
const h=require('../tests/lib/helpers'),{demoFixture}=require('../tests/lib/demo'),assert=require('node:assert/strict');
(async()=>{const demo=demoFixture(),browser=await h.launch();try{
 const {ctx,page,log}=await h.openPage(browser,{html:demo.html,dialog:'accept',tree:h.readTree(demo.project),clock:new Date('2026-10-18T11:05:00Z')});
 await page.setViewportSize({width:1440,height:900});await h.openBoardViaUi(page);await page.selectOption('#me','human-owner-01');const messages=()=>page.evaluate(()=>window.__fakefs.dump().filter(f=>/\/(rooms|direct)\//.test(f.path)));const before=await messages();
 await page.locator('.tcard[data-tk="room:architecture|T017"]').click();await page.locator('#feed .sub-strip').first().waitFor();await page.locator('#feed').evaluate(e=>e.scrollTop=0);await page.locator('#feed .sub-strip').first().click();await page.waitForTimeout(200);assert.equal(await page.locator('#feed').evaluate(e=>e.scrollTop),0,'opening the pane keeps the topic where it was');await page.locator('#subPane').waitFor();
 assert.equal(await page.locator('#subFeed article.msg').count(),3);await page.fill('#subBody','Keep 90 days of history.');
 await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-subthread-pane.png')});
 await page.locator('#subClose').click();await page.setViewportSize({width:390,height:760});await page.locator('#feed .sub-strip').first().click();await page.locator('#subPane').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-subthread-phone.png')});
 assert.deepEqual(await messages(),before);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);await ctx.close();console.log('Two real sub-thread pane captures; unchanged messages (the draft is not posted) and zero network.');
}finally{await browser.close();h.fs.rmSync(demo.tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
