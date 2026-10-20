'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers');
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const geometry=page=>page.evaluate(()=>{
 const rect=el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100);};
 return {controls:[...document.querySelectorAll('.top button,.top summary,.top .me,.top .search')].map(el=>[el.id||el.className,rect(el)]),top:rect(document.querySelector('.top')),feed:rect(document.querySelector('.feed-wrap'))};
});
async function readable(page){assert.equal(await page.locator('#rstat').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight),true,'full status text fits its reserved line');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
for(const lang of ['en','pl'])test(`toolbar stays fixed through real countdown, refresh, pause and off in ${lang}`,async()=>{
 const project=h.layoutExample(h.tmpDir()),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),clock:new Date('2026-10-19T12:00:00Z')});try{
  await h.openBoardViaUi(page);await page.click('#gear');await page.selectOption('#sLang',lang);await page.click('#sClose');await page.fill('#cBody','Keep my unsent draft');const files=await page.evaluate(()=>window.__fakefs.dump());
  for(const width of [1440,1280,1024,820,700,375]){
   await page.setViewportSize({width,height:1000});await page.click('#gear');await page.check('#rOn');await page.fill('#rEvery','61');await page.selectOption('#rUnit','s');await page.click('[data-dpre="1234567"]');await page.click('#sClose');
   const initial=await geometry(page);await readable(page);assert.match(await page.textContent('#rstat'),lang==='en'?/refresh in 1 min 1 s/:/odświeżenie za 1 min 1 s/);
   for(const ms of [2000,50000,8000]){await page.clock.runFor(ms);await readable(page);assert.deepEqual(await geometry(page),initial,'timer digit/unit boundary at '+width);}
   const builds=await page.evaluate(()=>window.__boardTest.stats.builds);await page.clock.runFor(2000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);assert.deepEqual(await geometry(page),initial,'automatic refresh rollover');assert.equal(await page.inputValue('#cBody'),'Keep my unsent draft');
   await page.click('#gear');await page.click('[data-dpre="67"]');await page.click('#sClose');await readable(page);assert.deepEqual(await geometry(page),initial,'paused status');assert.match(await page.textContent('#rstat'),lang==='en'?/paused/:/wstrzymane/);
   await page.click('#gear');await page.uncheck('#rOn');await page.click('#sClose');assert.equal(await page.textContent('#rstat'),'');assert.deepEqual(await geometry(page),initial,'empty/off status');
   for(const id of ['structuredOpen','toolbarToolsToggle','gear','folderName'])assert.equal(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}),true,'clickable '+id);
   await page.click('#toolbarToolsToggle');
   for(const id of ['vocabularyOpen','presenceOpen','extensionsOpen','draftsOpen'])assert.equal(await page.locator('#'+id).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===el||el.contains(hit);}),true,'clickable expanded tool '+id);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),false);assert.deepEqual(await geometry(page),initial,'closing tools restores geometry');
  }
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),files);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);
 }finally{await ctx.close();}
});
test('read-only status has the same reserved geometry when toggled off on phones',async()=>{
 const project=h.layoutExample(h.tmpDir()),{ctx,page,log}=await h.openPage(browser);try{
  await page.setInputFiles('#fallback',project);await page.waitForFunction(()=>window.__boardTest.getModel()!==null);await page.setViewportSize({width:375,height:1000});await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  const initial=await geometry(page);await readable(page);assert.match(await page.textContent('#rstat'),/folderu z zapisem/);await page.click('#gear');await page.uncheck('#rOn');await page.click('#sClose');assert.deepEqual(await geometry(page),initial);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
