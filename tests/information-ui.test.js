'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),h=require('./lib/helpers');
const source=name=>fs.readFileSync(path.join(__dirname,'../scripts',name),'utf8');
function host(context,lang='en'){
 const m={path:'rooms/general/message.txt',bodyLoaded:true,h:{INFORMATION:'{"version":1,"items":[]}'}};
 const sandbox={signingEligible:m=>!m?.signing||m.signing.eligibility==='eligible',B:{informationContexts:new Map([[m.path,context]])},S:{lang},ExtensionContract:require('../scripts/extension-contract'),esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),m};
 vm.createContext(sandbox);vm.runInContext(source('information-ui.js'),sandbox);return {sandbox,html:()=>vm.runInContext('informationPlaceholder(m)',sandbox)};
}
const context=(latest,other={})=>({information:{battery:{label:'Device A',presentation:'both',recorded:{data:100,observedAt:'2026-10-19T10:00:00Z',provenance:{method:'command',description:'device-cli battery <script>alert(1)</script>',collectedAt:'2026-10-19T10:01:00Z'}},latest,...other}}});
test('host information cards separate recorded/latest values, times and inert claimed provenance',()=>{
 const {html}=host(context({status:'resolved',data:90,observedAt:'2026-10-19T10:05:00Z',freshness:'stale',availability:{state:'disconnected',reportedAt:'2026-10-19T10:07:00Z',reason:'device unavailable'}}));const out=html();
 assert.match(out,/Recorded with this message/);assert.match(out,/Latest known reading/);assert.match(out,/Stale reading/);assert.match(out,/Source reported disconnected/);assert.match(out,/10:05:00Z/);assert.match(out,/10:07:00Z/);assert.match(out,/author claim/);assert.match(out,/&lt;script&gt;/);assert.doesNotMatch(out,/<script>/);assert.match(out,/not executed or independently verified/);
});
test('host information cards explain unavailable/current failures without replacing recorded values',()=>{
 for(const [status,copy]of Object.entries({missing:'unavailable in this board copy',incomplete:'history is incomplete',conflict:'latest reading unresolved',corrupt:'cannot be verified',limit:'state limit exceeded'})){const out=host(context({status,freshness:'unknown',heads:[]})).html();assert.match(out,new RegExp(copy));assert.match(out,/>100<\/pre>/);assert.doesNotMatch(out,/Source reported disconnected/);}
 for(const [freshness,copy]of Object.entries({unknown:'Freshness unknown',future:'Clock mismatch'}))assert.match(host(context({status:'resolved',data:90,freshness})).html(),new RegExp(copy));
});
test('latest view retains recorded disclosure, recorded view omits current output and Polish labels translate',()=>{
 const latest={status:'resolved',data:90,freshness:'fresh'};assert.match(host(context(latest,{presentation:'latest'})).html(),/<details class="information-recorded">/);assert.doesNotMatch(host(context(latest,{presentation:'recorded'})).html(),/Latest known reading/);assert.match(host(context(latest),'pl').html(),/Ostatni znany odczyt/);const hst=host(context(latest));hst.sandbox.m.bodyLoaded=false;assert.equal(hst.html(),'');hst.sandbox.m.bodyLoaded=true;hst.sandbox.m.h.INFORMATION='{broken';assert.match(hst.html(),/metadata is invalid/);
});
test('resolved state changes invalidate extension review signatures and old submit callbacks',async()=>{
 const hst=host(context({status:'resolved',data:90,heads:['a'],freshness:'fresh'}));Object.assign(hst.sandbox,{formStorageIdentity:'board-one',boardStorageId:'board-one',currentUser:()=> 'bravo-human',dirHandle:{},structuredClone});hst.sandbox.m.h.EXTENSION='{"data":{},"renderer":null}';hst.sandbox.B.byPath=new Map([[hst.sandbox.m.path,hst.sandbox.m]]);vm.runInContext(source('extension-ui.js'),hst.sandbox);const signature=vm.runInContext('extensionSignature(m)',hst.sandbox);hst.sandbox.B.informationContexts.set(hst.sandbox.m.path,context({status:'resolved',data:85,heads:['b'],freshness:'fresh'}));assert.notEqual(vm.runInContext('extensionSignature(m)',hst.sandbox),signature);hst.sandbox.oldSignature=signature;await assert.rejects(vm.runInContext("sendExtensionAnswer(m.path,m.h.EXTENSION,'bravo-human',{},oldSignature)",hst.sandbox),/stale extension reply/);
});
test('information failures and unverified recorded correspondence remain visible',()=>{
 for(const [verification,copy]of Object.entries({unavailable:'correspondence cannot be verified',invalid:'does not match its referenced revision'})){
  const ctx=context({status:'resolved',data:90,freshness:'fresh'});ctx.information.battery.recorded.verification=verification;assert.match(host(ctx).html(),new RegExp(copy));
 }
 const hst=host({information:{}});hst.sandbox.m.informationError='Scope does not match';assert.match(hst.html(),/Information unavailable: Scope does not match/);
});
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
async function drawingPage(){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({content:"const S={lang:'en'};"+source('extension-contract.js')+'\n'+source('extension-runtime.js')+'\n'+source('extension-ui.js')});return page;}
test('declarative context bindings are separate from recorded data and reject inherited or mixed paths',async()=>{
 const page=await drawingPage();try{const out=await page.evaluate(()=>{const root=document.querySelector('#root'),data={value:100},context={information:{battery:{latest:{data:90,observedAt:'10:05'}}}};drawExtensionTree(root,{type:'column',children:[{type:'text',text:{path:['value']}},{type:'text',text:{contextPath:['information','battery','latest','data']}},{type:'text',text:{contextPath:['information','battery','latest','observedAt']}}]},data,{}, {},undefined,context);return root.textContent;});assert.equal(out,'1009010:05');
 for(const binding of [{contextPath:['constructor']},{contextPath:['information'],path:['value']}]){const error=await page.evaluate(binding=>{try{drawExtensionTree(document.querySelector('#root'),{type:'text',text:binding},{value:100},{},{},undefined,{information:{}});return null;}catch(e){return e.message;}},binding);assert.match(error,/binding missing|unexpected or missing keys/);}
 }finally{await page.close();}
});
test('worker receives explicit context on render and event without replacing recorded data',async()=>{
 const page=await drawingPage();try{await page.evaluate(()=>{const code="BoardExtension.define({render(data,state,context){return {type:'column',children:[{type:'text',text:String(data.value)+'/'+String(context.information.battery.latest.data)+'/'+String(state.clicked||false)},{type:'button',label:'Observe',event:'observe'}]};},event(event,data,state,context){return {state:{clicked:context.information.battery.latest.data===90}};}});";window.disposeTestWorker=startExtensionWorker(document.querySelector('#root'),{artifact:'a'.repeat(64),package:{id:'com.example.test',version:'1.0.0'},entry:()=>code},{id:'view',mode:'worker',entry:'code.js'},{value:100},{},e=>{document.querySelector('#root').textContent=e.message;},{information:{battery:{latest:{data:90}}}});});await page.getByText('100/90/false',{exact:true}).waitFor();await page.getByRole('button',{name:'Observe',exact:true}).click();await page.getByText('100/90/true',{exact:true}).waitFor();await page.evaluate(()=>window.disposeTestWorker());}finally{await page.close();}
});
