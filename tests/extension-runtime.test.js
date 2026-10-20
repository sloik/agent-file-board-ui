'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),h=require('./lib/helpers');
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
async function fixture(){
 const context=await browser.newContext(),page=await context.newPage();
 await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; worker-src data:"><main></main>`);
 for(const file of ['extension-contract.js','extension-ui.js','extension-runtime.js'])await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../scripts',file),'utf8')});
 await page.evaluate(()=>{window.S={lang:'en'};window.failures=[];window.proposals=[];window.controllers=[];window.make=(source,options={})=>{
  const root=document.createElement('section');document.querySelector('main').append(root);const renderer={id:'test',mode:options.mode||'worker',entry:'test.js',...(options.refresh===false?{}:{refresh:{intervalSeconds:30}})};
  const pkg={artifact:'a'.repeat(64),package:{id:'com.example.test',version:'1.0.0'},entry:(_name,json)=>json?source:source};
  const controller=startExtensionRuntime(root,pkg,renderer,{recorded:100},{field(){},proposal:x=>proposals.push(x)},e=>failures.push(e.message),{information:{reading:{observedAt:'2026-10-20T10:00:00Z',value:100}}},{componentId:String(controllers.length),...options.meta});controllers.push(controller);return controllers.length-1;
 };});return {context,page};
}
const counter=`BoardExtension.define({event(e,d,s,c){return {state:{count:(s.count||0)+1,reason:e.reason||e.type,now:c.host?.now}};},render(d,s,c){return {type:'text',text:JSON.stringify({count:s.count||0,reason:s.reason||'initial',now:c.host?.now||null,reading:c.information.reading.value,observedAt:c.information.reading.observedAt})};}});`;
async function idle(page){await page.waitForFunction(()=>controllers.every(c=>!c.getRefreshStatus().busy));}
test('bounded refresh uses explicit local context, coalesces jobs, resets state on new mount and preserves legacy',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(source=>{make(source);for(let i=0;i<20;i++)controllers[0].refresh();},counter);await idle(page);
  const rendered=await page.locator('section').first().textContent(),value=JSON.parse(rendered);assert.equal(value.count,1);assert.equal(value.reason,'manual');assert.equal(value.reading,100);assert.equal(value.observedAt,'2026-10-20T10:00:00Z');
  await page.evaluate(source=>{controllers[0].dispose();make(source,{meta:{initialReason:'source-change'}});make(source,{refresh:false});},counter);await idle(page);
  const values=await page.locator('section').allTextContents();assert.equal(JSON.parse(values[1]).count,1);assert.equal(JSON.parse(values[1]).reason,'source-change');assert.equal(JSON.parse(values[2]).now,null);assert.deepEqual(await page.evaluate(()=>failures),[]);
 }finally{await context.close();}
});
test('periodic jobs, pause/manual and declarative host time binding use one visible best-effort clock',async()=>{
 const {context,page}=await fixture();try{
  await page.clock.install({time:new Date('2026-10-20T12:00:00Z')});await page.evaluate(source=>make(source),counter);await idle(page);
  await page.clock.fastForward(30000);await idle(page);assert.equal(JSON.parse(await page.locator('section').textContent()).reason,'timer');
  await page.evaluate(()=>setExtensionAutomaticRefresh(false));const before=await page.locator('section').textContent();await page.clock.fastForward(90000);assert.equal(await page.locator('section').textContent(),before);
  await page.evaluate(()=>controllers[0].refresh());await idle(page);assert.equal(JSON.parse(await page.locator('section').textContent()).reason,'manual');
  await page.evaluate(()=>{make({type:'text',text:{contextPath:['host','now']}},{mode:'declarative'});});await idle(page);const initial=await page.locator('section').nth(1).textContent();await page.clock.fastForward(1000);await page.evaluate(()=>controllers[1].refresh());await idle(page);assert.notEqual(await page.locator('section').nth(1).textContent(),initial);
 }finally{await context.close();}
});
test('hidden tabs coalesce resume and detached/disposed components receive no more jobs',async()=>{
 const {context,page}=await fixture();try{
  await page.clock.install();await page.evaluate(source=>make(source),counter);await idle(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});const before=await page.locator('section').textContent();await page.clock.fastForward(120000);assert.equal(await page.locator('section').textContent(),before);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await idle(page);assert.equal(JSON.parse(await page.locator('section').textContent()).reason,'resume');
  await page.evaluate(()=>document.querySelector('section').remove());await page.clock.fastForward(30000);assert.equal(await page.evaluate(()=>extensionRuntimeInstances.size),0);assert.equal(await page.evaluate(()=>extensionRuntimeActive),0);
 }finally{await context.close();}
});
test('global dispatcher queues more than eight mounts without destroying healthy components',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(source=>{window.maxActive=0;for(let i=0;i<24;i++){make(source);maxActive=Math.max(maxActive,extensionRuntimeActive);}},counter);await idle(page);assert.equal(await page.evaluate(()=>maxActive),8);assert.equal(await page.locator('section').count(),24);assert.ok((await page.locator('section').allTextContents()).every(Boolean));assert.deepEqual(await page.evaluate(()=>failures),[]);
  await page.evaluate(()=>controllers.forEach(c=>c.dispose()));assert.equal(await page.evaluate(()=>extensionRuntimeInstances.size),0);assert.equal(await page.evaluate(()=>extensionRuntimeActive),0);
 }finally{await context.close();}
});
test('refresh cannot propose an answer, failures stop automatic work and manual retries are explicit',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>make(`BoardExtension.define({event(e){return {answer:{approved:true}};},render(){return {type:'text',text:'Ready'};}});`));await idle(page);await page.evaluate(()=>controllers[0].refresh());await idle(page);
  assert.deepEqual(await page.evaluate(()=>proposals),[]);assert.equal(await page.evaluate(()=>controllers[0].getRefreshStatus().failed),true);assert.match((await page.evaluate(()=>failures))[0],/refresh cannot propose/);
  const rows=await page.evaluate(()=>getExtensionDiagnostics());assert.equal(rows.entries.at(-1).origin,'host');assert.equal(rows.entries.at(-1).entry.code,'component-failed');
  await page.evaluate(()=>controllers[0].refresh());await idle(page);assert.equal((await page.evaluate(()=>failures)).length,2);
 }finally{await context.close();}
});
test('job logs are bounded inert extension claims with independent host identity and local preview/export',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>make(`BoardExtension.define({render(){for(let i=0;i<25;i++)BoardExtension.log({level:'debug',code:'reading',message:'<img src=x onerror=alert(1)>',fields:{value:90}});BoardExtension.log({level:'warn',code:'bad',message:'No nested fields',fields:{nested:{value:1}}});return {type:'text',text:'Valid tree'};}});`));await idle(page);
  const result=await page.evaluate(()=>getExtensionDiagnostics());assert.equal(result.entries.filter(x=>x.origin==='extension').length,16);assert.equal(result.dropped,10);assert.equal(result.entries.at(-1).origin,'host');assert.ok(result.entries.every(x=>x.artifact==='a'.repeat(64)&&x.renderer==='test'&&x.jobId));assert.equal(await page.locator('section').textContent(),'Valid tree');
  await page.evaluate(()=>openExtensionDiagnostics({componentId:'0'}));assert.equal(await page.locator('#extensionDiagnosticsDialog img').count(),0);assert.match(await page.locator('#extensionDiagnosticsDialog pre').textContent(),/onerror/);
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export preview',exact:true}).click();const download=await pending;assert.equal(download.suggestedFilename(),'extension-diagnostics.json');
  await page.getByRole('button',{name:'Clear local diagnostics',exact:true}).click();assert.deepEqual(await page.evaluate(()=>getExtensionDiagnostics()),{entries:[],dropped:0});
 }finally{await context.close();}
});
test('malformed raw diagnostic channel is dropped while a valid tree survives; ring evicts and counts',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>make(`postMessage({kind:'result',tree:{type:'text',text:'Survives'},state:{},diagnostics:[{level:'error',code:'bad',message:'x',artifact:'spoof'}]});`));await idle(page);assert.equal(await page.locator('section').textContent(),'Survives');assert.equal(await page.evaluate(()=>getExtensionDiagnostics().dropped),1);
  await page.evaluate(()=>{for(let i=0;i<600;i++)recordExtensionDiagnostic({artifact:'trusted'},{level:'info',code:'test',message:String(i)});});const result=await page.evaluate(()=>getExtensionDiagnostics());assert.equal(result.entries.length,500);assert.equal(result.dropped,102);assert.equal(result.entries[0].entry.message,'100');
 }finally{await context.close();}
});
test('preview suppresses refresh, timeout is independently logged, disposed jobs cannot return results',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(source=>{make(source,{meta:{preview:true}});make(`BoardExtension.define({render(){while(true){};}});`);make(source);controllers[2].dispose();},counter);await idle(page);assert.equal(await page.evaluate(()=>controllers[0].getRefreshStatus().supported),false);assert.equal(await page.locator('section').nth(2).textContent(),'');assert.match((await page.evaluate(()=>failures))[0],/time limit/);assert.equal(await page.evaluate(()=>getExtensionDiagnostics().entries.at(-1).origin),'host');assert.equal(await page.evaluate(()=>extensionRuntimeActive),0);
 }finally{await context.close();}
});
test('ordinary user actions still propose answers and total output including logs stays within64KiB',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>make(`BoardExtension.define({event(e){if(e.type==='action')return {answer:{approved:true},state:{approved:true}};},render(d,s){return {type:'column',children:[{type:'text',text:s.approved?'Approved':'Ready'},{type:'button',label:'Approve',event:'approve'}]};}});`,{refresh:false}));await idle(page);
  await page.getByRole('button',{name:'Approve',exact:true}).click();await idle(page);assert.deepEqual(await page.evaluate(()=>proposals),[{approved:true}]);assert.match(await page.locator('section').first().textContent(),/Approved/);
  await page.evaluate(()=>make(`postMessage({kind:'result',tree:{type:'text',text:'x'.repeat(57000)},state:{},diagnostics:Array.from({length:16},()=>({level:'info',code:'padding',message:'x'.repeat(500)}))});`));await idle(page);assert.match((await page.evaluate(()=>failures))[0],/worker output limit/);assert.equal(await page.locator('section').nth(1).textContent(),'');
 }finally{await context.close();}
});
