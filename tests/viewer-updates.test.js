'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium,firefox}=require('playwright'),h=require('./lib/helpers'),U=require('../scripts/viewer-updates');
const checker=h.fs.readFileSync(h.path.join(h.ROOT,'site/update-check.html'),'utf8'),api='https://api.github.com/repos/sloik/agent-file-board-ui/releases/latest';
const release=()=>({id:123,draft:false,prerelease:false,tag_name:'v2.12.1',html_url:U.links('2.12.1').release,assets:[{name:'agent-file-board-viewer.zip',state:'uploaded',browser_download_url:U.links('2.12.1').package}]});
async function boot(browser,{metadata=release(),offline=false,storageFailure=false,html=h.BOARD_HTML,transport=checker,tree=null}={}){
 const ctx=await browser.newContext({viewport:{width:1280,height:800}}),page=await ctx.newPage(),requests=[],errors=[];let checks=0;
 if(tree)await ctx.addInitScript({content:h.fakeFsScript(tree,'project')});
 if(storageFailure)await ctx.addInitScript(()=>{indexedDB.open=()=>{throw Error('Private storage unavailable');};});
 await ctx.route(U.endpoint,r=>{checks++;return offline?r.abort():r.fulfill({contentType:'text/html',body:transport});});
 await ctx.route(api,r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(metadata)}));
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(h.pathToFileURL(html).href);await page.evaluate(()=>window.__boardTest.ready);
 return {ctx,page,requests,errors,get checks(){return checks;}};
}
async function updates(p){await h.openToolbarTool(p,'viewerUpdatesTools');}
async function complete(p){await p.waitForFunction(()=>document.querySelector('#viewerCheckNow')&&!document.querySelector('#viewerCheckNow').disabled);}
for(const [name,engine]of Object.entries({chromium,firefox})){
 test(name+': isolated checker, manual package, daily reopen and opt-out',async()=>{
  const browser=await engine.launch({timeout:30000});try{const s=await boot(browser),p=s.page;try{
   await p.waitForSelector('#viewerUpdateNotice',{state:'visible'});await updates(p);await complete(p);
   assert.match(await p.locator('#viewerUpdateStatus').textContent(),/2.12.1 available/);assert.equal(await p.locator('#viewerPackageDownload').getAttribute('href'),U.links('2.12.1').package);
   assert.deepEqual(s.requests.filter(u=>/^https?:/.test(u)),[U.endpoint,api]);assert.equal(s.checks,1);
   const other=await s.ctx.newPage();await other.goto(h.pathToFileURL(h.BOARD_HTML).href);await other.evaluate(()=>window.__boardTest.ready);await updates(other);await complete(other);assert.equal(s.checks,1);await other.close();
   assert.ok((await p.evaluate(()=>window.__boardTest.viewerUpdateState())).lastSuccess>0);
   await p.locator('#viewerUpdatesClose').click();await p.reload();await p.evaluate(()=>window.__boardTest.ready);await updates(p);await complete(p);assert.equal(s.checks,1);
   await p.locator('#viewerCheckNow').click();await complete(p);assert.equal(s.checks,2);
   await p.locator('#viewerUpdateAuto').uncheck();await p.waitForFunction(async()=> (await window.__boardTest.viewerUpdateState()).auto===false);
   await p.locator('#viewerUpdatesClose').click();await p.evaluate(()=>window.__boardTest.viewerUpdateState(s=>({...s,lastAttempt:0})));await p.reload();await p.evaluate(()=>window.__boardTest.ready);await updates(p);await complete(p);assert.equal(s.checks,2);
   await p.locator('#viewerUpdateAuto').check();await p.waitForFunction(async()=> (await window.__boardTest.viewerUpdateState()).auto===true);await p.locator('#viewerUpdatesClose').click();await p.reload();await p.waitForSelector('#viewerUpdateNotice',{state:'visible'});await updates(p);await complete(p);assert.equal(s.checks,3);assert.deepEqual(s.errors,[]);
  }finally{await s.ctx.close();}}finally{await browser.close();}
 });
 test(name+': offline, storage failure and malformed release metadata fail closed',async()=>{
  const browser=await engine.launch({timeout:30000});try{for(const opts of [{offline:true},{storageFailure:true},{metadata:{...release(),prerelease:true}},{metadata:{...release(),html_url:'https://evil.test/'}},{metadata:{...release(),tag_name:'v2.12.1-rc'}}]){
   const s=await boot(browser,opts),p=s.page;try{await updates(p);await complete(p);
    if(opts.storageFailure){assert.equal(s.checks,0);assert.equal(await p.locator('#viewerUpdateAuto').isDisabled(),true);await p.locator('#viewerCheckNow').click();await complete(p);assert.equal(s.checks,1);}
    else{assert.match(await p.locator('#viewerUpdateStatus').textContent(),/unknown/);assert.equal(await p.locator('#viewerPackageDownload').isVisible(),false);assert.equal((await p.evaluate(()=>window.__boardTest.viewerUpdateState())).lastSuccess,undefined);}
    assert.equal(await p.locator('#viewerReleaseLink').getAttribute('href'),U.releases+'/latest');assert.deepEqual(s.errors,[]);
   }finally{await s.ctx.close();}}
  }finally{await browser.close();}
 });
 test(name+': reload guards actual unfinished drafts and explicit clearing permits reload',async()=>{
  const browser=await engine.launch({timeout:30000});try{const s=await boot(browser),p=s.page;try{
   await updates(p);await complete(p);await p.locator('#viewerUpdatesClose').click();assert.deepEqual(await p.evaluate(()=>window.__boardTest.viewerReloadBlockers()),[]);
   await p.evaluate(()=>{const b=document.querySelector('#cBody');b.value=' ';b.dispatchEvent(new Event('input',{bubbles:true}));});await updates(p);await p.locator('#viewerReload').click();assert.match(await p.locator('#viewerReloadResult').textContent(),/message draft/);assert.equal(await p.locator('#cBody').inputValue(),' ');
   await p.evaluate(()=>{document.querySelector('#cBody').value='';document.querySelector('#structuredJson').value='{"draft":"unfinished"}';});await p.locator('#viewerReload').click();assert.match(await p.locator('#viewerReloadResult').textContent(),/structured authoring/);
   await p.evaluate(()=>document.querySelector('#structuredJson').value='');await Promise.all([p.waitForEvent('load'),p.locator('#viewerReload').click()]);await p.evaluate(()=>window.__boardTest.ready);assert.deepEqual(await p.evaluate(()=>window.__boardTest.viewerReloadBlockers()),[]);assert.deepEqual(s.errors,[]);
  }finally{await s.ctx.close();}}finally{await browser.close();}
 });
 test(name+': phone dialog fits English and Polish; completed check removes its iframe',async()=>{
  const browser=await engine.launch({timeout:30000});try{const s=await boot(browser),p=s.page;try{await p.setViewportSize({width:390,height:844});await updates(p);await complete(p);
   for(const locale of ['en','pl']){if(locale==='pl'){await p.locator('#viewerUpdatesClose').click();await p.click('#gear');await p.selectOption('#sLang','pl');await p.click('#sClose');await updates(p);}
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await p.locator('#viewerUpdatesDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);const b=await p.locator('#viewerUpdatesDialog').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=391);}
   assert.equal(await p.locator('iframe').count(),0);assert.deepEqual(s.errors,[]);
  }finally{await s.ctx.close();}}finally{await browser.close();}
 });
}

test('browser rejects forged parent messages and checker proposals with stale channels or arbitrary URLs',async()=>{
 const browser=await chromium.launch();try{
  const transport=`<!doctype html><script>
   const channel=location.hash.slice(1),good={protocol:1,channel,status:'ok',version:'9.0.0',releaseId:1,packageAvailable:true};
   parent.postMessage({...good,channel:'stale'},'*');parent.postMessage({...good,url:'https://evil.test/'},'*');
   setTimeout(()=>parent.postMessage({protocol:1,channel,status:'error'},'*'),200);
  </script>`;
  const s=await boot(browser,{transport});try{await s.page.evaluate(()=>window.postMessage({protocol:1,channel:'forged',status:'ok',version:'9.0.0',releaseId:1,packageAvailable:true},'*'));await updates(s.page);await complete(s.page);assert.match(await s.page.locator('#viewerUpdateStatus').textContent(),/unknown/);assert.equal(await s.page.locator('#viewerUpdateNotice').isVisible(),false);assert.equal(await s.page.locator('iframe').count(),0);assert.equal((await s.page.evaluate(()=>window.__boardTest.viewerUpdateState())).lastSuccess,undefined);assert.deepEqual(s.errors,[]);}finally{await s.ctx.close();}
 }finally{await browser.close();}
});
