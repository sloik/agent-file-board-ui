'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('an older draft-list read cannot erase an import error after the import finishes',async()=>{
 let release,reads=0;const gate=new Promise(r=>release=r),result={textContent:''},list={replaceChildren(){}},dialog={open:true};
 const context=vm.createContext({$:id=>({'#draftManagerResult':result,'#draftManagerList':list,'#draftsDialog':dialog})[id],B:{msgs:[]},toolsBoardKey:()=> 'board',currentUser:()=> 'owner',formStorageIdentity:'identity',formStorageWrites:Promise.resolve(),formDraftBucket:async()=>({}),readInBatches:async()=>{if(++reads===1)await gate;},t:key=>key,jsonObject:()=>{throw Error('Invalid JSON from this import');}});
 vm.runInContext(fs.readFileSync(require.resolve('../scripts/draft-manager'),'utf8'),context);
 const old=vm.runInContext('openDraftManager()',context);await new Promise(r=>setImmediate(r));assert.equal(reads,1);
 context.event={target:{files:[{size:5,text:async()=>'{bad'}],value:'file.json'}};
 await vm.runInContext('importManagedDraft(event)',context);assert.equal(reads,2);assert.equal(result.textContent,'Invalid JSON from this import');
 release();await old;assert.equal(result.textContent,'Invalid JSON from this import');assert.equal(vm.runInContext('draftManagerBusy',context),false);
});
