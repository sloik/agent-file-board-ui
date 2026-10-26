'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers');
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
test('feedback opens only on request, preserves drafts and translates on a narrow layout',async()=>{
 const root=h.layoutShuffled(h.tmpDir()),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(root)});
 try{
  await h.openBoardViaUi(page);await page.locator('#cBody').fill('Keep this unsent feedback context.');
  const before=await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt')));
  await page.locator('#gear').click();const link=page.getByRole('link',{name:'Send feedback',exact:true});await link.waitFor();
  assert.equal(await link.getAttribute('href'),'https://github.com/sloik/agent-file-board-ui/issues/new/choose');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
  assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
  let explicit=0;await ctx.route('https://github.com/**',async route=>{explicit++;await route.fulfill({status:200,contentType:'text/html',body:'<title>Feedback destination</title>'});});
  const opened=page.waitForEvent('popup');await link.click();const popup=await opened;await popup.waitForLoadState();assert.equal(popup.url(),'https://github.com/sloik/agent-file-board-ui/issues/new/choose');assert.equal(explicit,1);await popup.close();
  assert.equal(await page.locator('#cBody').inputValue(),'Keep this unsent feedback context.');assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt'))),before);
  await page.setViewportSize({width:390,height:844});await page.selectOption('#sLang','pl');const polish=page.getByRole('link',{name:'Prześlij opinię',exact:true});await polish.waitFor();assert.equal(await polish.getAttribute('href'),'https://github.com/sloik/agent-file-board-ui/issues/new/choose');assert.equal(await page.locator('#settings').evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
