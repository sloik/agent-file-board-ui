'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers');
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
async function pinned(page,dialog,close){
 for(const fraction of [.5,1]){
  const state=await page.locator(dialog).evaluate((el,{fraction,close})=>{
   el.scrollTop=(el.scrollHeight-el.clientHeight)*fraction;
   const b=el.querySelector(close),r=b.getBoundingClientRect(),d=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
   return {scroll:el.scrollTop,visible:r.top>=d.top&&r.bottom<=d.bottom&&r.top>=0&&r.bottom<=innerHeight,hit:hit===b||b.contains(hit)};
  },{fraction,close});
  assert.ok(state.scroll>40,'fixture really scrolls');assert.equal(state.visible,true,dialog+' Close remains inside visible dialog');assert.equal(state.hit,true,dialog+' Close accepts a normal pointer click');
 }
}
function clean(log){assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);}
test('long real Structured message preview keeps Close reachable and preserves JSON when reopened',async()=>{
 const {ctx,page,log}=await h.openPage(browser,{dialog:'accept'});try{
  await page.click('#structuredOpen');await page.selectOption('#structuredExample','report-v3');await page.click('#structuredLoad');await page.click('#structuredValidate');await page.waitForSelector('#structuredPreview .report-content');
  const raw=await page.inputValue('#structuredJson');assert.equal(JSON.parse(raw).version,3);await pinned(page,'#structuredDialog','#structuredClose');await page.click('#structuredClose');assert.equal(await page.locator('#structuredDialog').isVisible(),false);
  await page.click('#structuredOpen');assert.equal(await page.inputValue('#structuredJson'),raw);await page.click('#structuredClose');clean(log);
 }finally{await ctx.close();}
});
test('every built-in dialog retains its real Close control with long content on desktop and Polish Dracula phone',async()=>{
 const {ctx,page,log}=await h.openPage(browser,{dialog:'accept'});try{
  for(const phone of [false,true]){
   if(phone){await page.click('#gear');await page.selectOption('#sLang','pl');await page.selectOption('#sTheme','dracula');await page.click('#sClose');await page.setViewportSize({width:375,height:700});}
   for(const [id,close] of [['locationsDialog','locationsClose'],['structuredDialog','structuredClose'],['draftsDialog','draftsClose'],['upgradeDialog','upgradeClose'],['vocabulary','vocabularyClose'],['presenceDialog','presenceClose'],['repairDialog','repairClose'],['guidanceDialog','guidanceClose']]){
    await page.evaluate(id=>{const dialog=document.getElementById(id),fixture=document.createElement('div');fixture.dataset.scrollFixture='';for(let i=0;i<80;i++){const p=document.createElement('p');p.textContent='Long dialog fixture '+i;fixture.append(p);}dialog.append(fixture);dialog.showModal();},id);
    await pinned(page,'#'+id,'#'+close);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.click('#'+close);assert.equal(await page.locator('#'+id).isVisible(),false);await page.locator('#'+id+' [data-scroll-fixture]').evaluate(el=>el.remove());
   }
  }clean(log);
 }finally{await ctx.close();}
});
test('real generated report modal keeps its toolbar visible while long authored evidence scrolls',async()=>{
 const {ctx,page,log}=await h.openPage(browser,{dialog:'accept'});try{
  const report={library:'board-report',version:3,title:'Long modal',components:[{type:'modal',title:'Supporting evidence',children:[{type:'markdown',title:'Evidence',text:Array.from({length:80},(_,i)=>'Paragraph '+i+' of embedded evidence.').join('\n\n')}]}]};
  await page.click('#structuredOpen');await page.fill('#structuredJson',JSON.stringify(report));await page.click('#structuredValidate');assert.match(await page.locator('#structuredError').innerText(),/Valid payload/);await page.locator('.report-modal-trigger>button').click();await pinned(page,'.report-modal','.report-modal-toolbar button');await page.locator('.report-modal-toolbar button').click();assert.equal(await page.locator('.report-modal').isVisible(),false);clean(log);
 }finally{await ctx.close();}
});
test('settings width drag and keyboard persist, viewport clamps preserve saved width, defaults reset',async()=>{
 const {ctx,page,log}=await h.openPage(browser,{dialog:'accept'});try{
  await page.click('#gear');const width=()=>page.locator('#settings').evaluate(el=>Math.round(el.getBoundingClientRect().width));assert.equal(await width(),340);
  const box=await page.locator('#settingsResize').boundingBox();await page.mouse.move(box.x+4,box.y+150);await page.mouse.down();await page.mouse.move(box.x-176,box.y+150,{steps:6});await page.mouse.up();assert.equal(await width(),520);
  await h.reloadSettled(ctx,page,{setting:['settingsW',520]});await page.click('#gear');assert.equal(await width(),520);
  await page.locator('#settingsResize').focus();await page.keyboard.press('ArrowLeft');assert.equal(await width(),540);await page.keyboard.press('ArrowRight');assert.equal(await width(),520);
  await page.selectOption('#sLang','pl');await page.selectOption('#sTheme','dracula');await page.setViewportSize({width:375,height:700});assert.equal(await width(),343);assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().settingsW),520);
  await page.locator('#settingsScroll').evaluate(el=>el.scrollTop=el.scrollHeight);
  for(const selector of ['#sClose','#settingsResize'])assert.equal(await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),true);
  await page.click('#sClose');assert.equal(await page.locator('#settings').isVisible(),false);await page.setViewportSize({width:1280,height:800});await page.click('#gear');assert.equal(await width(),520);
  await page.locator('#settingsResize').focus();await page.keyboard.press('Home');assert.equal(await width(),340);await page.keyboard.press('ArrowLeft');await page.locator('#settingsResize').dblclick();assert.equal(await width(),340);
  await page.locator('#settingsResize').focus();for(let i=0;i<35;i++)await page.keyboard.press('ArrowLeft');assert.equal(await width(),900);for(let i=0;i<40;i++)await page.keyboard.press('ArrowRight');assert.equal(await width(),280);await page.click('#sReset');assert.equal(await width(),340);clean(log);
 }finally{await ctx.close();}
});
