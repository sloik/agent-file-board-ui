'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const U=require('../scripts/viewer-updates');
const reply={protocol:1,channel:'nonce',status:'ok',version:'2.12.0',releaseId:12,packageAvailable:true};
test('release comparisons are numeric and reject prerelease, leading zeros and unsafe versions',()=>{
 for(const [a,b,want]of [['2.12.0','2.9.9',true],['3.0.0','2.999.999',true],['2.11.3','2.11.4',false],['2.11.4','2.11.4',false],['2.11.4-rc','2.11.3',false],['02.1.1','1.1.1',false],['9999999.1.1','1.1.1',false]])assert.equal(U.newer(a,b),want);
 for(const v of ['../bad','v2.1.0','2.1.0?x','2.1.0/evil',null])assert.throws(()=>U.links(v));
 assert.equal(U.links('2.11.4').package,'https://github.com/sloik/agent-file-board-ui/releases/download/v2.11.4/agent-file-board-viewer.zip');
});
test('daily cadence covers overdue, reopening, invalid and future timestamps',()=>{
 const now=10*U.day;for(const last of [undefined,NaN,0,-1,now+1,now-U.day])assert.equal(U.due(last,now),true);
 for(const last of [now,now-1,now-U.day+1])assert.equal(U.due(last,now),false);
});
test('metadata schema rejects forged channels, extra URLs and malformed release fields',()=>{
 assert.equal(U.valid(reply,'nonce'),true);assert.equal(U.valid({protocol:1,channel:'nonce',status:'error'},'nonce'),true);
 for(const m of [null,[],{...reply,channel:'wrong'},{...reply,url:'https://evil.test'},{...reply,version:'2.12.0-rc'},{...reply,releaseId:0},{...reply,releaseId:1.5},{...reply,packageAvailable:1},{...reply,extra:'x'.repeat(5000)},{...reply,status:'error'}])assert.equal(U.valid(m,'nonce'),false);
 const cyclic={...reply};cyclic.loop=cyclic;assert.equal(U.valid(cyclic,'nonce'),false);
});
function host(){let listeners={},frame,timer;const win={location:{origin:'null'},crypto:{randomUUID:()=> 'nonce'},document:{createElement:()=>frame={contentWindow:{},setAttribute(){},remove(){this.removed=true;}},body:{append(){}}},addEventListener:(n,f)=>listeners[n]=f,removeEventListener:(n)=>delete listeners[n],setTimeout:f=>(timer=f,1),clearTimeout(){}};return {win,get frame(){return frame;},emit:(data,origin='https://sloik.github.io',source=frame.contentWindow)=>listeners.message?.({data,origin,source}),timeout:()=>timer(),listeners};}
test('transport binds source, exact origin and nonce; settles once and removes frame/listeners',async()=>{
 const h=host(),task=U.request(h.win);h.emit(reply,'https://evil.test');h.emit(reply,undefined,{});h.emit({...reply,channel:'stale'});assert.equal(h.frame.removed,undefined);
 h.emit(reply);assert.deepEqual(await task.promise,reply);assert.equal(h.frame.removed,true);assert.deepEqual(h.listeners,{});h.timeout();
 assert.equal(h.frame.src,U.endpoint+'#nonce');assert.equal(h.frame.referrerPolicy,'no-referrer');
});
test('timeout, explicit cancellation, checker errors and same-origin hosting fail closed',async()=>{
 for(const action of ['timeout','cancel','error','pagehide']){const h=host(),task=U.request(h.win);if(action==='timeout')h.timeout();if(action==='cancel')task.cancel();if(action==='error')h.emit({protocol:1,channel:'nonce',status:'error'});if(action==='pagehide')h.listeners.pagehide();await assert.rejects(task.promise);assert.equal(h.frame.removed,true);assert.deepEqual(h.listeners,{});}
 const h=host();h.win.location.origin='https://sloik.github.io';await assert.rejects(U.request(h.win).promise,/offline viewer/);
});
test('reload guard covers every draft family and asynchronous operation, without blocking pristine defaults',()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const raw={value:''},kind={value:'report'};
 const s={notificationHasDraft:()=>false,choiceDrafts:new Map(),formDraftDirty:new Set(),extensionDirty:new Set(),$:id=>id==='#structuredJson'?raw:kind,AUTHORING_EXAMPLES:[{kind:'report',value:{example:true}}],voiceWorkPending:false,signingSavePending:0,viewerActiveWrites:0,viewerActiveDeliveries:0,viewerActiveSends:0,upgradeBusy:false,repairBusy:false,draftManagerBusy:false,locationBusy:false,authoringPending:0,formStoragePending:0,submittingForms:new Set(),submittingChoices:new Set(),extensionSending:new Set()};
 const block=vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/viewer-updates-ui'),'utf8')+';viewerReloadBlockers;',s);
 const empty=()=>assert.equal(block().length,0);empty();raw.value=JSON.stringify({example:true},null,2);empty();raw.value='';
 for(const [key,label]of [['voiceWorkPending','voice capture or transcript'],['signingSavePending','operation in progress'],['viewerActiveWrites','operation in progress'],['viewerActiveDeliveries','operation in progress'],['viewerActiveSends','operation in progress'],['upgradeBusy','operation in progress'],['repairBusy','operation in progress'],['draftManagerBusy','operation in progress'],['locationBusy','operation in progress'],['authoringPending','operation in progress'],['formStoragePending','operation in progress']]){s[key]=1;assert.ok(block().includes(label),key);s[key]=0;empty();}
 for(const [key,label]of [['formDraftDirty','form reply'],['extensionDirty','custom reply'],['submittingForms','operation in progress'],['submittingChoices','operation in progress'],['extensionSending','operation in progress']]){s[key].add('draft');assert.ok(block().includes(label),key);s[key].clear();empty();}
 s.choiceDrafts.set('x',{selected:[],text:''});empty();s.choiceDrafts.set('x',{selected:['yes'],text:''});assert.ok(block().includes('choice reply'));s.choiceDrafts.set('x',{selected:[],text:' '});assert.ok(block().includes('choice reply'));s.choiceDrafts.clear();s.notificationHasDraft=()=>true;assert.ok(block().includes('message draft'));
});
