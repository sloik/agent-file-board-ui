"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const KEY="agent-file-board-ui.settings";
async function open(){const proj=h.layoutExample(h.tmpDir());const s=await h.openPage(browser,{tree:h.readTree(proj)});await h.openBoardViaUi(s.page);return s;}
async function height(page){return page.locator('#composer').evaluate(el=>Math.round(el.getBoundingClientRect().height));}
async function grow(page){await page.focus('#composerResizer');for(let i=0;i<5;i++)await page.keyboard.press('ArrowUp');return height(page);}
for(const legacy of [null,JSON.stringify({composerH:180,lang:'en'})])test(`committed preferences survive ${legacy===null?'missing':'stale'} renderer localStorage`,async()=>{
 const {ctx,page,log}=await open();try{
  const expected=await grow(page);await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  await ctx.addInitScript(({key,value})=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k===key?value:get.call(this,k);};},{key:KEY,value:legacy});
  await h.reloadSettled(ctx,page,{setting:['composerH',expected],lastDir:true});await page.waitForSelector('#feed article');
  assert.equal(await height(page),expected);assert.equal(await page.getAttribute('html','lang'),'pl');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),legacy);
  assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().composerH),expected);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});

test('legacy preferences migrate once and later stale legacy values cannot override them',async()=>{
 const {ctx,page}=await open();try{
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('agent-file-board-ui',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').delete('settings');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  });
  await ctx.addInitScript(key=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k===key?JSON.stringify({composerH:330,lang:'pl',sideW:350}):get.call(this,k);};},KEY);
  await page.reload();await page.evaluate(()=>window.__boardTest.ready);await page.waitForSelector('#feed article');
  assert.equal(await height(page),330);assert.equal(await page.getAttribute('html','lang'),'pl');
  await page.focus('#composerResizer');await page.keyboard.press('ArrowUp');
  await h.reloadSettled(ctx,page,{setting:['composerH',350],lastDir:true});await page.waitForSelector('#feed article');
  assert.equal(await height(page),350);assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().sideW),350);
 }finally{await ctx.close();}
});

test('settings restore finishes before controls become interactive',async()=>{
 const {ctx,page}=await open();try{
  const expected=await grow(page);
  await h.reloadSettled(ctx,page,{setting:['composerH',expected],lastDir:true});
  await page.addInitScript(()=>{
   const open=indexedDB.open.bind(indexedDB);window.__nativeSettingsOpen=open;
   indexedDB.open=(...args)=>{
    const request=open(...args);if(args[0]!=='agent-file-board-ui')return request;
    const deferred={get result(){return request.result;},get error(){return request.error;}};
    request.onupgradeneeded=e=>deferred.onupgradeneeded?.(e);request.onerror=e=>deferred.onerror?.(e);
    request.onsuccess=e=>{window.__releaseSettings=()=>deferred.onsuccess?.(e);};return deferred;
   };
  });
  await page.reload();await page.waitForFunction(()=>typeof window.__releaseSettings==='function');
  assert.equal(await page.evaluate(()=>document.body.inert),true);assert.equal(await page.getAttribute('body','aria-busy'),'true');
  // Restore the native opener before auto-reopening the remembered board.
  await page.evaluate(()=>{indexedDB.open=window.__nativeSettingsOpen;window.__releaseSettings();});await page.evaluate(()=>window.__boardTest.ready);
  assert.equal(await page.evaluate(()=>document.body.inert),false);assert.equal(await page.getAttribute('body','aria-busy'),'false');
  assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().composerH),expected);
 }finally{await ctx.close();}
});

test('unavailable IndexedDB leaves the UI interactive with the legacy fallback',async()=>{
 const {ctx,page,log}=await h.openPage(browser);try{
  await page.addInitScript(key=>{
   const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k===key?JSON.stringify({lang:'pl',composerH:330}):k===key+'.committed'||k===key+'.pending'?null:get.call(this,k);};
   indexedDB.open=()=>{throw new DOMException('Storage denied','SecurityError');};
  },KEY);
  await page.reload();await page.evaluate(()=>window.__boardTest.ready);
  assert.equal(await page.evaluate(()=>document.body.inert),false);assert.equal(await page.getAttribute('html','lang'),'pl');
  await page.click('#gear');await page.selectOption('#sLang','en');assert.equal(await page.getAttribute('html','lang'),'en');assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});


test('read markers survive a missing renderer cache with the same board and identity',async()=>{
 const {ctx,page,log}=await open();try{
  await page.click(".fname:has-text('product')");assert.equal(await page.locator(".fname:has-text('product') .unread-badge").count(),0);
  await page.click(".fname:has-text('architecture')");
  await ctx.addInitScript(()=>{Storage.prototype.getItem=function(){return null;};});
  await h.reloadSettled(ctx,page,{lastDir:true,setting:['lastDir','architecture']});await page.waitForSelector('#feed article');
  assert.equal(await page.locator(".fname:has-text('product') .unread-badge").count(),0);
  assert.match(await page.textContent('#title'),/architecture/);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});


test('fallback edits recover against their committed base and stale journals cannot replace newer settings',async()=>{
 const {ctx,page}=await h.openPage(browser);try{
  await page.click('#gear');await page.fill('#sFs','19');
  await h.reloadSettled(ctx,page,{setting:['fs',19]});
  const committed=await page.evaluate(key=>JSON.parse(localStorage.getItem(key+".committed")),KEY),base=JSON.stringify(committed);
  await page.addInitScript(({key,base})=>{
   if(location.hash!=='#storage-off')return;
   const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k===key+'.committed'?base:get.call(this,k);};
   indexedDB.open=()=>{throw new DOMException('Storage denied','SecurityError');};
  },{key:KEY,base});
  await page.evaluate(()=>{location.hash='storage-off';});await page.reload();await page.evaluate(()=>window.__boardTest.ready);
  await page.click('#gear');await page.fill('#sFs','20');
  const pending=await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'.pending')),KEY);
  assert.equal(pending.base,committed.revision);assert.equal(pending.settings.fs,20);
  // Model a readable fallback journal on reconnection. Its causal base, not
  // wall-clock time or renderer-cache freshness, decides whether it may recover.
  await page.addInitScript(({key,pending})=>{const get=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return k===key+'.pending'?JSON.stringify(pending):get.call(this,k);};},{key:KEY,pending});
  await page.evaluate(()=>{location.hash='';});await page.reload();await page.evaluate(()=>window.__boardTest.ready);
  assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().fs),20);
  await page.click('#gear');await page.fill('#sFs','18');
  await h.reloadSettled(ctx,page,{setting:['fs',18]});
  assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().fs),18);
  await page.click('#gear');await page.fill('#sFs','19');
  await h.reloadSettled(ctx,page,{setting:['fs',19]});
  assert.equal(await page.evaluate(()=>window.__boardTest.getSettings().fs),19,'Returning to the same values must not revive an older journal');
 }finally{await ctx.close();}
});
