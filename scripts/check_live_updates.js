'use strict';
// Explicit network qualification, separate from deterministic PR/main fixtures.
const {chromium,firefox}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 for(const [name,engine]of Object.entries({chromium,firefox})){
  const browser=await engine.launch({timeout:30000});
  try{
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.resolve(__dirname,'../board.html')).href);
   await page.waitForFunction(()=>window.__boardTest&&document.body.inert===false);
   await page.evaluate(()=>window.__boardTest.ready);await page.click('#toolbarToolsToggle');await page.click('#viewerUpdatesTools');
   await page.waitForFunction(()=>!document.querySelector('#viewerCheckNow').disabled);
   const state=await page.evaluate(()=>window.__boardTest.viewerUpdateState());
   assert.ok(state.lastSuccess>0,await page.locator('#viewerUpdateStatus').textContent());
   assert.equal(state.latest.status,'ok');assert.deepEqual(errors,[]);
   assert.equal(await page.locator('iframe').count(),0);
   console.log(name+': deployed HTTPS checker returned stable release '+state.latest.version);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
