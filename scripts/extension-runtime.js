/* Trusted local lifecycle and diagnostics. Extension jobs never collect source data. */
let extensionAutomaticRefresh=true;
const extensionRuntimeInstances=new Set(),extensionRuntimeQueue=[];
let extensionRuntimeActive=0,extensionRuntimeTimer=null,extensionRuntimeJob=0;
const extensionDiagnosticEntries=[];
let extensionDiagnosticBytes=0,extensionDiagnosticDropped=0,extensionDiagnosticSequence=0;
const extensionRuntimeBytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const extensionRuntimeText=(en,pl)=>typeof S!=='undefined'&&S.lang==='pl'?pl:en;
function extensionDiagnosticEntry(value){
 try{ExtensionContract.keys(value,['level','code','message'],['fields']);
  ExtensionContract.require(['debug','info','warn','error'].includes(value.level),'diagnostic level');
  ExtensionContract.require(typeof value.code==='string'&&value.code.length<=64&&ExtensionContract.NAME.test(value.code),'diagnostic code');
  ExtensionContract.require(typeof value.message==='string'&&[...value.message].length>0&&[...value.message].length<=500,'diagnostic message');
  if(value.fields!==undefined){ExtensionContract.require(value.fields&&typeof value.fields==='object'&&!Array.isArray(value.fields)&&Object.keys(value.fields).length<=8,'diagnostic fields');for(const [key,v]of Object.entries(value.fields)){ExtensionContract.require(key.length<=64&&ExtensionContract.NAME.test(key)&&(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&[...v].length<=200),'diagnostic field');}}
  return structuredClone(value);
 }catch{return null;}
}
function recordExtensionDiagnostic(meta,entry,origin='host'){
 const value=extensionDiagnosticEntry(entry);if(!value){extensionDiagnosticDropped++;return;}
 const record={id:++extensionDiagnosticSequence,at:new Date().toISOString(),origin:origin==='extension'?'extension':'host',artifact:String(meta.artifact||''),packageId:String(meta.packageId||''),version:String(meta.version||''),renderer:String(meta.renderer||''),componentId:String(meta.componentId||''),jobId:String(meta.jobId||''),event:String(meta.event||''),reason:String(meta.reason||''),entry:value};
 const size=extensionRuntimeBytes(record);if(size>524288){extensionDiagnosticDropped++;return;}
 while(extensionDiagnosticEntries.length>=500||extensionDiagnosticBytes+size>524288){const old=extensionDiagnosticEntries.shift();extensionDiagnosticBytes-=extensionRuntimeBytes(old);extensionDiagnosticDropped++;}
 extensionDiagnosticEntries.push(record);extensionDiagnosticBytes+=size;
}
function clearExtensionDiagnostics(){extensionDiagnosticEntries.length=0;extensionDiagnosticBytes=0;extensionDiagnosticDropped=0;const dialog=document.getElementById('extensionDiagnosticsDialog');if(dialog)dialog.remove();}
function getExtensionDiagnostics(filter={}){return {dropped:extensionDiagnosticDropped,entries:structuredClone(extensionDiagnosticEntries.filter(x=>(!filter.artifact||x.artifact===filter.artifact)&&(!filter.componentId||x.componentId===filter.componentId)))};}
function openExtensionDiagnostics(filter={}){
 let dialog=document.getElementById('extensionDiagnosticsDialog');if(dialog)dialog.remove();dialog=document.createElement('dialog');dialog.id='extensionDiagnosticsDialog';dialog.className='extensions-dialog';
 const title=document.createElement('h2'),hint=document.createElement('p'),pre=document.createElement('pre'),controls=document.createElement('div');
 title.textContent=extensionRuntimeText('Extension diagnostics','Diagnostyka rozszerzenia');hint.textContent=extensionRuntimeText('Local diagnostics can contain sensitive information. Inspect this preview before exporting. Nothing is uploaded.','Lokalna diagnostyka może zawierać poufne informacje. Sprawdź podgląd przed eksportem. Nic nie jest wysyłane.');pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';
 const refresh=()=>{pre.textContent=JSON.stringify(getExtensionDiagnostics(filter),null,2);};
 const button=(text,run)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.onclick=run;controls.append(b);};
 button(extensionRuntimeText('Close','Zamknij'),()=>dialog.close());button(extensionRuntimeText('Refresh preview','Odśwież podgląd'),refresh);
 button(extensionRuntimeText('Export preview','Eksportuj podgląd'),()=>{const blob=new Blob([pre.textContent],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='extension-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 button(extensionRuntimeText('Clear local diagnostics','Wyczyść lokalną diagnostykę'),()=>{extensionDiagnosticEntries.length=0;extensionDiagnosticBytes=0;extensionDiagnosticDropped=0;refresh();});
 dialog.append(title,hint,controls,pre);document.body.append(dialog);refresh();dialog.showModal();
}
function extensionRuntimeHidden(){return document.hidden===true;}
function extensionRuntimeSchedule(){
 clearTimeout(extensionRuntimeTimer);extensionRuntimeTimer=null;
 if(!extensionAutomaticRefresh||extensionRuntimeHidden())return;
 let due=Infinity;for(const x of extensionRuntimeInstances)if(x.canSchedule())due=Math.min(due,x.due);
 if(Number.isFinite(due))extensionRuntimeTimer=setTimeout(()=>{extensionRuntimeTimer=null;const now=performance.now();for(const x of extensionRuntimeInstances)if(x.canSchedule()&&x.due<=now){x.due=now+x.interval*1000;x.enqueueRefresh('timer');}extensionRuntimeSchedule();},Math.max(1,due-performance.now()));
}
function extensionRuntimeDispatch(){
 while(extensionRuntimeActive<8&&extensionRuntimeQueue.length){
  let index=extensionRuntimeQueue.findIndex(x=>x.hasUserJob());if(index<0)index=0;
  const instance=extensionRuntimeQueue.splice(index,1)[0];instance.queued=false;
  if(!instance.live)continue;const job=instance.takeJob();if(!job)continue;
  extensionRuntimeActive++;instance.running=true;instance.run(job);
 }
}
function setExtensionAutomaticRefresh(enabled){extensionAutomaticRefresh=enabled===true;const now=performance.now();for(const x of extensionRuntimeInstances){x.due=now+x.interval*1000;if(!extensionAutomaticRefresh)x.dropAutomatic();x.notify();}extensionRuntimeSchedule();extensionRuntimeDispatch();}
document.addEventListener('visibilitychange',()=>{
 if(extensionRuntimeHidden()){for(const x of extensionRuntimeInstances)x.dropAutomatic();}
 else if(extensionAutomaticRefresh){const now=performance.now();for(const x of extensionRuntimeInstances)if(x.canSchedule()){x.due=now+x.interval*1000;x.enqueueRefresh('resume');}}
 extensionRuntimeSchedule();extensionRuntimeDispatch();
});
function startExtensionRuntime(root,pkg,renderer,data,handlers,onError,context={information:{}},meta={}){
 const opted=!!renderer.refresh&&!meta.preview,interval=opted?renderer.refresh.intervalSeconds:0;
 const identity={artifact:pkg.artifact,packageId:pkg.package.id,version:pkg.package.version,renderer:renderer.id,componentId:meta.componentId||''};
 let state={},active=null,timeout=null,pendingRefresh=null,initialPending=true,lastUser=-Infinity,failed=false;const userJobs=[];
 const instance={live:true,running:false,queued:false,interval,due:performance.now()+interval*1000,
  canSchedule:()=>{if(instance.live&&!root.isConnected){controller.dispose();return false;}return instance.live&&opted&&!failed;},
  hasUserJob:()=>userJobs.length>0,
  notify:()=>{try{meta.onStatus?.(status());}catch{}},
  dropAutomatic:()=>{if(pendingRefresh&&['timer','resume'].includes(pendingRefresh))pendingRefresh=null;instance.notify();},
  enqueueRefresh:reason=>{if(!instance.live||!opted)return;const priorities={timer:0,resume:1,'source-change':2,manual:3};if(!Object.hasOwn(priorities,reason))return;
   if(failed){if(reason!=='manual')return;failed=false;state={};}
   if(!pendingRefresh||priorities[reason]>priorities[pendingRefresh])pendingRefresh=reason;enqueue();},
  takeJob:()=>{if(userJobs.length)return {event:userJobs.shift(),kind:'user'};if(initialPending){initialPending=false;return {event:opted&&meta.initialReason==='source-change'?{type:'refresh',reason:'source-change'}:null,kind:'initial'};}if(pendingRefresh){const reason=pendingRefresh;pendingRefresh=null;return {event:{type:'refresh',reason},kind:'refresh'};}return null;},
  run:job=>run(job)
 };
 function status(){return {busy:instance.running||instance.queued,failed,supported:opted,automatic:opted&&extensionAutomaticRefresh&&!failed,intervalSeconds:opted?interval:null};}
 function enqueue(){if(!instance.live)return;if(!instance.running&&!instance.queued&&(initialPending||pendingRefresh||userJobs.length)){instance.queued=true;extensionRuntimeQueue.push(instance);}instance.notify();extensionRuntimeDispatch();}
 function finish(){clearTimeout(timeout);timeout=null;if(active){active.terminate();active=null;}if(instance.running){instance.running=false;extensionRuntimeActive--;}if(instance.live)enqueue();instance.notify();extensionRuntimeSchedule();extensionRuntimeDispatch();}
 function fail(error,jobMeta){failed=true;pendingRefresh=null;userJobs.length=0;initialPending=false;recordExtensionDiagnostic(jobMeta,{level:'error',code:'component-failed',message:String(error.message||error).slice(0,500)});root.replaceChildren();try{onError(error);}finally{finish();}}
 function consumeDiagnostics(message,jobMeta){
  let used=0,count=0,dropped=Number.isSafeInteger(message.dropped)&&message.dropped>=0?Math.min(message.dropped,1000000):0;
  if(message.diagnostics!==undefined){if(!Array.isArray(message.diagnostics))dropped++;else for(const raw of message.diagnostics){const entry=extensionDiagnosticEntry(raw);if(!entry||count>=16){dropped++;continue;}const size=extensionRuntimeBytes(entry);if(used+size>8192){dropped++;continue;}used+=size;count++;recordExtensionDiagnostic(jobMeta,entry,'extension');}}
  if(dropped){extensionDiagnosticDropped+=dropped;recordExtensionDiagnostic(jobMeta,{level:'warn',code:'diagnostics-dropped',message:'Extension diagnostic entries were invalid or exceeded the job limit.',fields:{count:dropped}});}
 }
 function userEvent(event){
  if(!instance.live)return;const now=performance.now();if(now-lastUser<50){recordExtensionDiagnostic(identity,{level:'warn',code:'event-rate-limit',message:'Component input was rate limited.'});return;}lastUser=now;
  if(userJobs.length>=16){recordExtensionDiagnostic(identity,{level:'warn',code:'event-queue-limit',message:'Component input queue is full.'});return;}
  userJobs.push(event);enqueue();
 }
 function run(job){
  if(!root.isConnected){controller.dispose();return;}
  const now=new Date().toISOString(),event=job.event?{...job.event,...(job.event.type==='refresh'?{now}:{})}:null;
  const jobMeta={...identity,jobId:String(++extensionRuntimeJob),event:event?.type||'initial',reason:event?.reason||''};
  const jobContext=structuredClone(context);if(opted)jobContext.host={now,refresh:{supported:true,automatic:extensionAutomaticRefresh&&!failed,intervalSeconds:interval}};
  const readOnly=event?.type==='refresh';const guardedHandlers={field:(...args)=>{ExtensionContract.require(!readOnly,'refresh cannot propose a reply');handlers.field(...args);},proposal:(...args)=>{ExtensionContract.require(!readOnly,'refresh cannot propose a reply');handlers.proposal(...args);}};
  if(renderer.mode==='declarative'){try{drawExtensionTree(root,pkg.entry(renderer.entry,true),data,pkg,handlers,undefined,jobContext);finish();}catch(error){fail(error,jobMeta);}return;}
  try{
   const bootstrap=`'use strict';(()=>{const send=postMessage.bind(self);let api=null;const diagnostics=[];let diagnosticBytes=0,dropped=0;function log(value){try{const own=(o,required,optional=[])=>o&&typeof o==='object'&&!Array.isArray(o)&&required.every(k=>Object.hasOwn(o,k))&&Object.keys(o).every(k=>[...required,...optional].includes(k));const name=x=>typeof x==='string'&&x.length<=64&&/^[a-z][a-z0-9-]*$/.test(x);if(!own(value,['level','code','message'],['fields'])||!['debug','info','warn','error'].includes(value.level)||!name(value.code)||typeof value.message!=='string'||![...value.message].length||[...value.message].length>500)throw Error();if(value.fields!==undefined){if(!own(value.fields,[],Object.keys(value.fields))||Object.keys(value.fields).length>8)throw Error();for(const [k,v]of Object.entries(value.fields))if(!name(k)||!(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&[...v].length<=200))throw Error();}const entry=structuredClone(value),size=new TextEncoder().encode(JSON.stringify(entry)).length;if(diagnostics.length>=16||diagnosticBytes+size>8192)throw Error();diagnostics.push(entry);diagnosticBytes+=size;}catch{dropped++;}}for(const k of ['Worker','SharedWorker','RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(self,k,{value:undefined,writable:false,configurable:false});Object.defineProperty(self,'BoardExtension',{value:Object.freeze({define(a){if(api)throw Error('SDK already defined');api=a;},log}),writable:false});addEventListener('message',e=>{try{const {data,event,context}=e.data;let state=e.data.state,answer,result;if(event&&typeof api?.event==='function')result=api.event(event,data,state,context);if(result&&Object.hasOwn(result,'state'))state=result.state;if(result&&Object.hasOwn(result,'answer'))answer=result.answer;if(typeof api?.render!=='function')throw Error('SDK render required');const output={kind:'result',tree:api.render(data,state,context),state,diagnostics,dropped};if(answer!==undefined)output.answer=answer;send(output);}catch(e){send({kind:'error',message:String(e.message).slice(0,500),diagnostics,dropped});}});})();\n`;
   const worker=new Worker('data:text/javascript;base64,'+btoa(unescape(encodeURIComponent(bootstrap+pkg.entry(renderer.entry)))));active=worker;
   timeout=setTimeout(()=>fail(Error('extensions: worker time limit'),jobMeta),1000);
   worker.onerror=()=>{if(instance.live&&active===worker)fail(Error('extensions: worker failed'),jobMeta);};
   worker.onmessage=e=>{if(!instance.live||active!==worker)return;try{
    const message=e.data;ExtensionContract.require(extensionRuntimeBytes(message)<=65536,'worker output limit');
    consumeDiagnostics(message,jobMeta);
    if(message.kind==='error'){ExtensionContract.keys(message,['kind','message'],['diagnostics','dropped']);throw Error('extensions: '+String(message.message).slice(0,500));}
    ExtensionContract.keys(message,['kind','tree','state'],['answer','diagnostics','dropped']);ExtensionContract.require(message.kind==='result'&&extensionRuntimeBytes(message.state)<=16384,'worker state limit');
    ExtensionContract.require(extensionRuntimeBytes({kind:message.kind,tree:message.tree,state:message.state,...(Object.hasOwn(message,'answer')?{answer:message.answer}:{})})<=65536,'worker output limit');
    if(Object.hasOwn(message,'answer'))guardedHandlers.proposal(message.answer);
    state=structuredClone(message.state);drawExtensionTree(root,message.tree,data,pkg,handlers,userEvent,jobContext);finish();
   }catch(error){fail(error,jobMeta);}};
   worker.postMessage({data,state,event,context:jobContext});
  }catch(error){fail(error,jobMeta);}
 }
 const controller={dispose(){if(!instance.live)return;instance.live=false;pendingRefresh=null;initialPending=false;userJobs.length=0;const index=extensionRuntimeQueue.indexOf(instance);if(index>=0)extensionRuntimeQueue.splice(index,1);extensionRuntimeInstances.delete(instance);finish();},refresh:(reason='manual')=>instance.enqueueRefresh(reason),getRefreshStatus:status};
 if(extensionRuntimeInstances.size>=256){instance.live=false;failed=true;onError(Error('extensions: mounted component limit'));return controller;}
 extensionRuntimeInstances.add(instance);enqueue();extensionRuntimeSchedule();return controller;
}
