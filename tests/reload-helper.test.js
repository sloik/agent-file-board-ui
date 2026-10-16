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

test("reload rejects absent IndexedDB state, then recognizes a committed folder and explicit null",async()=>{
 const {ctx,page}=await h.openPage(browser);
 try{
  const token=await page.evaluate(()=>{window.documentToken=Math.random();return window.documentToken;});
  await assert.rejects(h.reloadSettled(ctx,page,{lastDir:true},{timeout:150}),/Stored state before reload/);
  assert.equal(ctx.pages().length,1);assert.equal(await page.evaluate(()=>window.documentToken),token);
  const store=async value=>page.evaluate(async value=>{
   const db=await new Promise((res,rej)=>{const r=indexedDB.open("agent-file-board-ui",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
   await new Promise((res,rej)=>{const tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(value,"lastDir");tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();
  },value);
  await store({test:true});await h.reloadSettled(ctx,page,{lastDir:true});
  await store(null);await h.reloadSettled(ctx,page,{lastDir:false});
 }finally{await ctx.close();}
});

test("an IndexedDB failure cannot masquerade as a forgotten folder",async()=>{
 const {ctx,page}=await h.openPage(browser);
 try{
  await ctx.addInitScript(()=>{indexedDB.open=()=>{
   const request={error:new DOMException("Injected IndexedDB failure","UnknownError")};
   queueMicrotask(()=>request.onerror?.());return request;
  };});
  await assert.rejects(h.reloadSettled(ctx,page,{lastDir:false},{timeout:150}),/Injected IndexedDB failure/);
  assert.equal(ctx.pages().length,1);
 }finally{await ctx.close();}
});
