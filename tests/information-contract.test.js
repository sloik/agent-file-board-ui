const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../scripts/information-contract.js');
const E=require('../scripts/extension-contract.js');
const artifact='art_550e8400-e29b-41d4-a716-446655440000';
const instant='2026-10-19T10:00:00Z';
const now=Date.parse(instant);
const text=x=>JSON.stringify(x);
async function fixture(){
 const files=new Map(),prefix='extensions/state/'+artifact+'/';
 const definition={version:1,id:artifact,label:'Battery 🔋',scope:'rooms/general',staleAfterSeconds:300};
 const raw=text(definition),digest=await E.hash(E.bytes(raw));files.set(prefix+'definition.json',raw);
 async function add(data=100,parents=[],extra={}){const r={version:1,artifact,definition:digest,parents:[...parents].sort(),author:'agent-a',recordedAt:instant,reading:{data,observedAt:instant},availability:{state:'available',reportedAt:instant},...extra};const raw=text(r),hash=await E.hash(E.bytes(raw));files.set(prefix+'revisions/'+hash+'.json',raw);return hash;}
 const first=await add();const tracking={artifact,definition:digest,revision:first};
 const info={version:1,items:[{id:'battery',value:100,observedAt:instant,tracking}]};
 return {files,prefix,definition,digest,add,first,tracking,info};
}
test('strict information wire accepts inert claims and rejects ambiguity or unsafe JSON',()=>{
 const x={version:1,items:[{id:'reading',value:{level:90},label:'Battery 🔋',provenance:{method:'command',description:'device-cli battery; $(anything)',evidence:'<script>inert</script>'}}]};
 assert.equal(C.validateInformation(x).items[0].value.level,90);
 for(const bad of ['{"version":1,"version":1,"items":[]}',text({version:1,items:[]}),text({version:1,items:[{id:'a',target:'extension-data'}]}),text({version:1,items:[{id:'a',value:1,target:'extension-data'}]}),text({version:1,items:[{id:'a',value:9007199254740992}]})])assert.throws(()=>C.validateInformation(bad));
 assert.throws(()=>C.validateInformation({version:1,items:[{id:'x',value:Infinity}]}));
 assert.throws(()=>C.validateInformation({version:1,items:[{id:'x',value:'\ud800'}]}));
 assert.throws(()=>C.time('2026-02-30T10:00:00Z'));
 assert.throws(()=>C.time('0000-01-01T10:00:00Z'));
 assert.throws(()=>C.time('2026-10-19T10:00:00+00:00'));
 assert.equal(C.time(instant),now);
});
test('extension target preserves existing envelope data; review is typed-answer-only',()=>{
 assert.equal(C.validateInformation({version:1,items:[{id:'data',target:'extension-data'}]},{data:{level:90}}).items.length,1);
 const review={version:1,items:[],review:{bindings:[]}};
 assert.throws(()=>C.validateInformation(review));
 assert.equal(C.validateInformation(review,null,true).review.bindings.length,0);
});
test('latest revision updates all bindings, recorded snapshot stays fixed, availability preserves age',async()=>{
 const f=await fixture(),next=await f.add(90,[f.first]);
 const output=await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now+300000);
 assert.equal(output.revision,next);assert.equal(output.data,90);assert.equal(output.freshness,'stale');
 f.info.items.push({...f.info.items[0],id:'second'});
 const context=await C.buildContext(f.info,null,'rooms/general',f.files,new Map(),now+300000);
 assert.equal(context.information.battery.recorded.data,100);assert.equal(context.information.second.latest.data,90);
 assert.deepEqual(C.reviewBindings(f.info,context),C.reviewBindings(context));
 const down=await f.add(90,[next],{availability:{state:'disconnected',reportedAt:'2026-10-19T10:05:00Z'}});
 const result=await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now+300000);
 assert.equal(result.revision,down);assert.equal(result.freshness,'stale');assert.equal(result.observedAt,instant);assert.equal(result.availability.state,'disconnected');
});
test('freshness handles absent times and future clock without fake freshness',async()=>{
 const f=await fixture();await f.add(90,[f.first],{reading:{data:90}});
 assert.equal((await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now)).freshness,'unknown');
 const g=await fixture();await g.add(90,[g.first],{reading:{data:90,observedAt:'2026-10-19T10:01:01Z'}});
 assert.equal((await C.resolve(g.files,g.tracking,'rooms/general',new Map(),now)).freshness,'future');
});
test('offline forks are conflicts, explicit multi-parent revision resolves them',async()=>{
 const f=await fixture(),a=await f.add(90,[f.first]),b=await f.add(80,[f.first]);
 const conflict=await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now);
 assert.equal(conflict.status,'conflict');assert.deepEqual(conflict.heads,[a,b].sort());assert.equal(conflict.data,undefined);
 const merge=await f.add(85,[a,b]);assert.equal((await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now)).revision,merge);
});
test('scope mismatch and malformed source never expose foreign current data',async()=>{
 const f=await fixture();let out=await C.resolve(f.files,f.tracking,'direct/a--b',new Map(),now);
 assert.equal(out.status,'corrupt');assert.equal(out.data,undefined);
 f.files.set(f.prefix+'revisions/'+f.first+'.json','{"secret":"do not expose"}');
 out=await C.resolve(f.files,f.tracking,'rooms/general',new Map(),now);assert.equal(out.status,'corrupt');assert.equal(out.data,undefined);
});
test('typed missing definitions are incomplete and revision ceilings never choose a partial head',async()=>{
 const f=await fixture(),typed={...f.definition,contract:{package:'a'.repeat(64),contract:'com.example.telemetry/reading',contractVersion:'1.0.0',contractDigest:'b'.repeat(64)}};
 const raw=text(typed),definition=await E.hash(E.bytes(raw));f.files=new Map([[f.prefix+'definition.json',raw]]);
 const r={version:1,artifact,definition,parents:[],author:'agent-alpha',recordedAt:instant,reading:{data:90},availability:{state:'unknown',reportedAt:instant}},bytes=text(r),hash=await E.hash(E.bytes(bytes));f.files.set(f.prefix+'revisions/'+hash+'.json',bytes);
 const output=await C.resolve(f.files,{artifact,definition,revision:hash},'rooms/general');assert.equal(output.status,'incomplete');assert.equal(output.data,undefined);
 const g=await fixture();for(let i=0;i<4097;i++)g.files.set(g.prefix+'revisions/'+i.toString(16).padStart(64,'0')+'.json','{}');const limit=await C.resolve(g.files,g.tracking,'rooms/general');assert.equal(limit.status,'limit');assert.equal(limit.data,undefined);
});
test('missing, incomplete, limits and changed definition have explicit outcomes',async()=>{
 const f=await fixture();assert.equal((await C.resolve(new Map(),f.tracking,'rooms/general')).status,'missing');
 await f.add(90,['a'.repeat(64)]);assert.equal((await C.resolve(f.files,f.tracking,'rooms/general')).status,'incomplete');
 f.files.set(f.prefix+'.error',{error:'limit'});assert.equal((await C.resolve(f.files,f.tracking,'rooms/general')).status,'limit');
 f.files.delete(f.prefix+'.error');f.files.set(f.prefix+'definition.json',text({...f.definition,label:'Changed'}));assert.equal((await C.resolve(f.files,f.tracking,'rooms/general')).status,'corrupt');
 const g=await fixture();g.files.set(g.prefix+'revisions/.error',{error:'limit',limit:true});assert.equal((await C.resolve(g.files,g.tracking,'rooms/general')).status,'limit');
});
test('snapshot mismatch marks only affected binding corrupt and preserves body data',async()=>{
 const f=await fixture();f.info.items.push({...f.info.items[0],id:'bad',value:22});
 const c=await C.buildContext(f.info,null,'rooms/general',f.files,new Map(),now);
 assert.equal(c.information.battery.latest.status,'resolved');assert.equal(c.information.battery.recorded.verification,'verified');assert.equal(c.information.bad.latest.status,'corrupt');assert.equal(c.information.bad.recorded.data,22);assert.equal(c.information.bad.recorded.verification,'invalid');
});
test('one immutable file snapshot resolves repeated messages once and retains unavailable correspondence',async()=>{
 const f=await fixture(),hash=E.hash;let calls=0;E.hash=async raw=>{calls++;return hash(raw);};
 try{for(let i=0;i<20;i++)await C.buildContext(f.info,null,'rooms/general',f.files,new Map(),now);assert.equal(calls,2);}finally{E.hash=hash;}
 const info=structuredClone(f.info);info.items[0].tracking.revision='f'.repeat(64);
 const c=await C.buildContext(info,null,'rooms/general',f.files,new Map(),now);
 assert.equal(c.information.battery.latest.status,'resolved');assert.equal(c.information.battery.recorded.verification,'unavailable');
});
test('new roots, invalid parents and structural amplification are rejected',async()=>{
 const f=await fixture();await f.add(90);assert.equal((await C.resolve(f.files,f.tracking,'rooms/general')).status,'conflict');
 let v=1;for(let i=0;i<10;i++)v=[v];assert.throws(()=>C.generic(v));
 assert.throws(()=>C.generic(Array(1025).fill(null)));
 assert.throws(()=>C.validateRevision({version:1,artifact,definition:'a'.repeat(64),parents:['b'.repeat(64),'a'.repeat(64)],author:'a',recordedAt:instant,reading:null,availability:{state:'unknown',reportedAt:instant}}));
});
test('canonical Python/JS validation and freshness fixture parity',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const fixturePath=process.env.AFB_STATE_FIXTURE||path.join(__dirname,'../vendor/agent-file-board/tests/fixtures/state-parity.json');
 const shared=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
 const validators={information:C.validateInformation,definition:C.validateDefinition,revision:C.validateRevision,value:C.generic};
 for(const row of shared.validation){let valid=true;try{validators[row.kind](row.value);}catch{valid=false;}assert.equal(valid,row.valid,row.name);}
 for(const row of shared.freshness){const f=await fixture();f.definition.staleAfterSeconds=row.staleAfterSeconds;const raw=text(f.definition),definition=await E.hash(E.bytes(raw));f.files=new Map([[f.prefix+'definition.json',raw]]);const revision={version:1,artifact,definition,parents:[],author:'agent-alpha',recordedAt:instant,reading:{data:90,observedAt:row.observedAt},availability:{state:'available',reportedAt:instant}},r=text(revision),hash=await E.hash(E.bytes(r));f.files.set(f.prefix+'revisions/'+hash+'.json',r);assert.equal((await C.resolve(f.files,{artifact,definition,revision:hash},'rooms/general',new Map(),Date.parse(row.now))).freshness,row.expected,JSON.stringify(row));}
});
test('custom direct directories reject correctly hashed revisions by outsiders',async()=>{
 const f=await fixture(),scope='private/agent-a--human-b';
 const definition={...f.definition,scope},raw=text(definition),hash=await E.hash(E.bytes(raw));
 const revision={version:1,artifact,definition:hash,parents:[],author:'outsider-agent',recordedAt:instant,reading:{data:'PRIVATE'},availability:{state:'available',reportedAt:instant}};
 const bytes=text(revision),digest=await E.hash(E.bytes(bytes)),files=new Map([[f.prefix+'definition.json',raw],[f.prefix+'revisions/'+digest+'.json',bytes]]);
 const out=await C.resolve(files,{artifact,definition:hash,revision:digest},scope,new Map(),now);
 assert.equal(out.status,'corrupt');assert.equal(out.data,undefined);
});
test('unchanged immutable byte snapshots reuse verification across refresh maps',async()=>{
 const f=await fixture(),files=new Map([...f.files].map(([k,v])=>[k,E.bytes(v)])),hash=E.hash;let calls=0;
 E.hash=async bytes=>{calls++;return hash(bytes);};
 try{await C.resolve(files,f.tracking,'rooms/general',new Map(),now);await C.resolve(new Map(files),f.tracking,'rooms/general',new Map(),now+1);assert.equal(calls,2);
  const changed=new Map(files);changed.set(f.prefix+'revisions/'+f.first+'.json',E.bytes('{}'));assert.equal((await C.resolve(changed,f.tracking,'rooms/general',new Map(),now)).status,'corrupt');assert.equal(calls,3);
 }finally{E.hash=hash;}
});
