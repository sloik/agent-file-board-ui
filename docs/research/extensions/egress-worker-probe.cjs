'use strict';
const fs=require('node:fs'),path=require('node:path'),dgram=require('node:dgram'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const repo=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(repo,'node_modules/playwright'));
const root=process.argv[2]||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'afb-extension-probe-'));fs.mkdirSync(root,{recursive:true});
const basePolicy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; worker-src data:; frame-src about: blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'";
async function run(){
 const udp=dgram.createSocket('udp4');let packets=0;udp.on('message',()=>packets++);await new Promise(r=>udp.bind(0,'127.0.0.1',r));const port=udp.address().port;
 const browser=await chromium.launch({headless:true});const out={browser:browser.version(),date:'2026-10-19',rtcProbe:'STUN/ICE probe uses only an owned UDP listener on 127.0.0.1; no external traffic.',rtc:[],worker:{}};
 try{
  for(const blockRtc of [false,true]){
   const policy=basePolicy+(blockRtc?"; webrtc 'block'":'');const file=path.join(root,'rtc-'+blockRtc+'.html');fs.writeFileSync(file,'<!doctype html><meta http-equiv="Content-Security-Policy" content="'+policy+'"><h1>Local probe</h1>');
   const ctx=await browser.newContext(),page=await ctx.newPage();const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});await page.goto(pathToFileURL(file).href);
   const before=packets;const report=await page.evaluate(async({port,policy})=>{const frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="'+policy+'"><script>addEventListener("message",async e=>{const port=e.ports[0];try{const pc=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:'+port+'"}]});pc.createDataChannel("synthetic-local-only");await pc.setLocalDescription(await pc.createOffer());setTimeout(()=>{const result={available:true,state:pc.connectionState,gathering:pc.iceGatheringState};pc.close();port.postMessage(result)},900);}catch(error){port.postMessage({available:typeof RTCPeerConnection,error:error.name,message:error.message})}});</script>';document.body.append(frame);await new Promise(r=>frame.onload=r);const ch=new MessageChannel();const result=new Promise((resolve,reject)=>{ch.port1.onmessage=e=>resolve(e.data);setTimeout(()=>reject(Error('RTC frame result timeout')),3000)});frame.contentWindow.postMessage('start','*',[ch.port2]);return result;},{port,policy});
   out.rtc.push({blockRtc,udpPackets:packets-before,report,consoleErrors});await ctx.close();
  }
  const file=path.join(root,'worker.html');fs.writeFileSync(file,'<!doctype html><meta http-equiv="Content-Security-Policy" content="'+basePolicy+'"><h1>Worker host</h1>');
  const ctx=await browser.newContext();const requests=[],errors=[];await ctx.route(/^https?:/,async route=>{requests.push(route.request().url());await route.abort();});const page=await ctx.newPage();page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(pathToFileURL(file).href);
  out.worker.report=await page.evaluate(async()=>{const code=`(async()=>{const report={document:typeof document,rtc:typeof RTCPeerConnection,location:location.href,workerConstructor:typeof Worker};try{location.href='https://plugin-probe.invalid/worker-navigation';report.navigation=location.href;}catch(e){report.navigation=e.name;}try{await fetch('https://plugin-probe.invalid/worker-fetch');report.fetch='resolved';}catch(e){report.fetch=e.name;}try{new WebSocket('wss://plugin-probe.invalid/socket');report.socket='constructed';}catch(e){report.socket=e.name;}try{importScripts('https://plugin-probe.invalid/import.js');report.importScripts='loaded';}catch(e){report.importScripts=e.name;}try{await import('https://plugin-probe.invalid/dynamic.js');report.dynamicImport='loaded';}catch(e){report.dynamicImport=e.name;}try{const req=indexedDB.open('agent-file-board-ui');report.indexedDB=await new Promise(resolve=>{req.onsuccess=()=>{req.result.close();resolve('opened')};req.onerror=()=>resolve(req.error.name);});}catch(e){report.indexedDB=e.name;}report.origin=self.origin;postMessage(report);})();`;
    const worker=new Worker('data:text/javascript,'+encodeURIComponent(code));const report=await new Promise((resolve,reject)=>{worker.onmessage=e=>resolve(e.data);worker.onerror=e=>reject(Error(e.message));setTimeout(()=>reject(Error('Worker probe timeout')),3000)});worker.terminate();return report;});
  out.worker.report.navigationUnchanged=out.worker.report.navigation===out.worker.report.location;
  out.worker.report.locationScheme=new URL(out.worker.report.location).protocol;
  delete out.worker.report.location;delete out.worker.report.navigation;
  out.worker.requests=requests;out.worker.consoleErrors=errors;
  assert.equal(out.worker.report.document,'undefined');assert.equal(out.worker.report.rtc,'undefined');assert.equal(out.worker.report.indexedDB,'SecurityError');assert.equal(out.worker.requests.length,0);
  out.worker.termination=await page.evaluate(async()=>{const worker=new Worker('data:text/javascript,'+encodeURIComponent('postMessage("running");while(true){}'));await new Promise((resolve,reject)=>{worker.onmessage=resolve;worker.onerror=reject;});const start=performance.now();worker.terminate();await new Promise(r=>setTimeout(r,30));return {hostResponsive:true,elapsedMs:Math.round(performance.now()-start)};});await ctx.close();
 }finally{await browser.close();udp.close();fs.writeFileSync(path.join(root,'egress-worker-results.json'),JSON.stringify(out,null,2)+'\n');}
 console.log(JSON.stringify(out,null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
