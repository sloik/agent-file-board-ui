'use strict';
// Actual file:// captures, using CLI-posted data in a disposable board.
const h=require('../tests/lib/helpers'),assert=require('node:assert/strict');
(async()=>{
  const tmp=h.tmpDir(),project=h.layoutExample(tmp);
  h.fs.mkdirSync(h.path.join(project,'.agent-board/rooms/reports'));
  const source=h.path.join(h.VENDOR,'examples/openui-report/static-dashboard.json');
  assert.deepEqual(JSON.parse(h.fs.readFileSync(source,'utf8')),JSON.parse(h.fs.readFileSync(h.path.join(h.ROOT,'docs/examples/openui/static-dashboard.json'),'utf8')));
  const posted=h.boardctl(['post','--path',project,'--from','implementation-agent-01','--to','all','--scope','room','--room','reports','--thread','T007','--slug','static-dashboard','--at','2026-10-18 12:30','--ui-file',source,'--body','Synthetic release dashboard: 170 passed, 2 failed. Review before publishing.']);
  assert.equal(posted.code,0,posted.err);
  assert.equal(h.boardctl(['validate','--path',project]).code,0);
  const browser=await h.launch();
  try{
    const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),clock:new Date('2026-10-18T10:30:00Z')});
    await page.clock.pauseAt(new Date('2026-10-18T10:30:01Z'));
    await page.setViewportSize({width:1440,height:1600});await page.emulateMedia({colorScheme:'light'});
    await h.openBoardViaUi(page);await page.click(".fname:has-text('reports')");
    await page.waitForSelector('.report-tabs [role=tab]');
    const original=await page.evaluate(()=>window.__fakefs.dump());
    const report=page.locator('.board-report');
    await page.locator('#feed').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-static.png')});
    await report.getByRole('tab',{name:'Results'}).click();
    await report.locator('.report-table input').fill('Browser');
    await report.locator('.report-accordion summary').filter({hasText:'Commands'}).click();
    await page.locator('#feed').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-static-details.png')});
    await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:375,height:1800});
    await report.getByRole('tab',{name:'Trends'}).click();
    await report.locator('.report-accordion summary').filter({hasText:'Commands'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#feed').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-openui-static-phone.png')});
    assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),original);
    assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);
    assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
    await ctx.close();console.log('Three static dashboard captures: validated CLI post, local interactions, immutable files and zero network.');
  }finally{await browser.close();h.fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
