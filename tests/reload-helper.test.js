"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});

test("reload refuses a false storage condition and closes its observer",async()=>{
 const {ctx,page}=await h.openPage(browser);const token=await page.evaluate(()=>{window.documentToken=Math.random();return window.documentToken;});
 try{
  await assert.rejects(h.reloadSettled(ctx,page,{setting:["composerH",399]},{timeout:150}),/Stored state before reload/);
  assert.equal(ctx.pages().length,1);assert.equal(await page.evaluate(()=>window.documentToken),token);
 }finally{await ctx.close();}
});

test("reload waits for the actual asynchronous IndexedDB condition",async()=>{
 const {ctx,page}=await h.openPage(browser);
 try{
  // Delay the backing state from the Node clock; the helper must keep polling
  // false IDB results instead of considering their Promises successful.
  const publication=new Promise((resolve,reject)=>setTimeout(()=>page.evaluate(async()=>{
   const db=await new Promise((res,rej)=>{const r=indexedDB.open("agent-file-board-ui",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
   await new Promise((res,rej)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put({test:true},"lastDir");tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
  }).then(resolve,reject),100));
  await h.reloadSettled(ctx,page,{lastDir:true});await publication;
  assert.equal(ctx.pages().length,1);
  await page.evaluate(async()=>{
   const db=await new Promise((res,rej)=>{const r=indexedDB.open("agent-file-board-ui",1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
   await new Promise((res,rej)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(null,"lastDir");tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
  });
  await h.reloadSettled(ctx,page,{lastDir:false});
 }finally{await ctx.close();}
});
