'use strict';
// Disposable platform research. All HTTP(S) requests are intercepted locally.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const repo=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(repo,'node_modules/playwright'));
const esbuild=require(path.join(repo,'node_modules/esbuild'));
const root=process.argv[2]||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'afb-extension-probe-'));fs.mkdirSync(root,{recursive:true});
const childPolicy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const parentPolicy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src blob:; frame-src about: blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const react=esbuild.buildSync({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
function Card(){const [count,setCount]=useState(0);return <section><h2>Company purchase</h2><button id="choice" onClick={()=>{setCount(count+1);window.channel.postMessage({type:'reply-proposal',value:count+1});}}>Approve {count}</button></section>}
addEventListener('message',e=>{if(e.data?.type==='init'&&e.ports[0]){window.channel=e.ports[0];createRoot(document.getElementById('root')).render(<Card/>);window.channel.postMessage({type:'ready'});}});`,loader:'jsx',resolveDir:repo},bundle:true,write:false,minify:true,format:'iife',define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;
function html(policy){return '<!doctype html><meta charset="utf-8">'+(policy?'<meta http-equiv="Content-Security-Policy" content="'+policy+'">':'')+'<h1 id="host">Research host</h1>';}
function srcdoc(code){return '<!doctype html><meta http-equiv="Content-Security-Policy" content="'+childPolicy+'"><div id="root"></div><script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';}
async function run(){
 const browser=await chromium.launch({headless:true});const out={browser:browser.version(),date:'2026-10-19',networkInterception:'All HTTP(S) intercepted and fulfilled locally; no DNS/network connection required.',cases:[]};
 try{
  for(const parentCsp of [false,true]){
   const file=path.join(root,parentCsp?'parent-csp.html':'parent-open.html');fs.writeFileSync(file,html(parentCsp?parentPolicy:null));
   const ctx=await browser.newContext();const requests=[],violations=[],errors=[];
   await ctx.route(/^https?:/,async route=>{requests.push({url:route.request().url(),kind:route.request().resourceType(),navigation:route.request().isNavigationRequest()});await route.fulfill({status:200,contentType:'text/html',body:'<h1>Intercepted navigation</h1>'});});
   const page=await ctx.newPage();page.on('console',m=>{if(m.type()==='error')violations.push(m.text());});page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);
   await page.evaluate(doc=>{window.events=[];const f=document.createElement('iframe');f.id='plugin';f.sandbox='allow-scripts';f.srcdoc=doc;f.onload=()=>{const ch=new MessageChannel();window.channel=ch.port1;ch.port1.onmessage=e=>window.events.push(e.data);f.contentWindow.postMessage({type:'init'},'*',[ch.port2]);};document.body.append(f);},srcdoc(react));
   await page.waitForFunction(()=>window.events.some(e=>e.type==='ready'));
   await page.frameLocator('#plugin').locator('#choice').click();await page.waitForFunction(()=>window.events.some(e=>e.type==='reply-proposal'));
   const rendered=await page.frameLocator('#plugin').locator('#choice').textContent();const events=await page.evaluate(()=>window.events);
   const limits=await page.frames()[1].evaluate(async()=>{let parentDom,storage;try{parentDom=parent.document.querySelector('#host').textContent;}catch(e){parentDom=e.name;}try{storage=localStorage.getItem('host-secret');}catch(e){storage=e.name;}let fetchResult;try{await fetch('https://plugin-probe.invalid/fetch');fetchResult='resolved';}catch(e){fetchResult=e.name;}let childWorker;try{new Worker(URL.createObjectURL(new Blob(['postMessage(1)'],{type:'text/javascript'})));childWorker='constructed';}catch(e){childWorker=e.name;}const image=new Image();image.src='https://plugin-probe.invalid/image';document.body.append(image);return {parentDom,storage,fetchResult,childWorker};});
   const frame=page.frames()[1];await frame.evaluate(()=>{location.href='https://plugin-probe.invalid/self-navigation?synthetic=1';});
   await page.waitForTimeout(250);
   const caseResult={parentCsp,parentPolicy:parentCsp?parentPolicy:null,childPolicy,rendered,events,limits,requests,frameUrls:page.frames().map(f=>f.url()),violations,errors};
   assert.equal(rendered,'Approve 1');assert.equal(limits.parentDom,'SecurityError');assert.equal(limits.storage,'SecurityError');assert.equal(limits.fetchResult,'TypeError');
   out.cases.push(caseResult);await ctx.close();
  }
  // Real file-page feature availability; no permission prompt is requested.
  const ctx=await browser.newContext();const page=await ctx.newPage();await page.goto(pathToFileURL(path.join(root,'parent-open.html')).href);
  out.fileCapabilities=await page.evaluate(async()=>{let workerRegistration;try{await navigator.serviceWorker.register('sw.js');workerRegistration='registered';}catch(e){workerRegistration={name:e.name,message:e.message};}return {secureContext:isSecureContext,notifications:typeof Notification,permission:typeof Notification==='function'?Notification.permission:null,serviceWorker:!!navigator.serviceWorker,workerRegistration};});await ctx.close();
 }finally{await browser.close();fs.writeFileSync(path.join(root,'results.json'),JSON.stringify(out,null,2)+'\n');}
 console.log(JSON.stringify(out,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
