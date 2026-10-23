'use strict';
// AC1-AC3 state rules on real signed inventories, without a browser or filesystem.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {load}=require('./lib/history-unit');
const {key,graph,BOARD}=require('./lib/signing-unit');
const {C,H}=load();
// signing-unit builds its own SigningContract copy; use that Context for pins and lineage.
const unit=require('./lib/signing-unit').harness();
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const SCOPE='rooms/general',TYPE='application/vnd.agent-file-board.inventory.ed25519.v1+json';
const sha=ch=>ch.repeat(64);
function setup(){
 const k=key(1),g=graph(unit.C),profile=g.profile(k);g.head(profile);
 const ctx=g.context(),message=(name,body)=>({path:`${SCOPE}/${name}`,raw:Buffer.from(body)});
 const files=new Map(),inventories=new Map(),sidecars=new Map();
 const inventory=(entries,{previous=[],signer=k,profileDigest=profile.digest}={})=>{
  const statement={version:1,boardId:BOARD,participant:profile.snapshot.id,profile:profileDigest,scope:SCOPE,previous,entries};
  const raw=g.seal(TYPE,statement,[signer]);inventories.set(digest(raw)+'.json',Uint8Array.from(raw));return digest(raw);
 };
 const entry=m=>({path:m.path,sha256:digest(m.raw),bytes:m.raw.length,signature:null});
 const host={
  scopes:async()=>[SCOPE],
  listHistory:async()=>inventories.size?[...inventories.keys()]:null,
  readHistory:async(scope,name)=>inventories.get(name)??null,
  listMessages:async()=>[...files.keys()].map(p=>p.split('/').at(-1)),
  readCurrent:async path=>files.has(path)?{sha256:digest(files.get(path)),bytes:files.get(path).length}:null,
  readSidecar:async(scope,record)=>sidecars.get(record)??null
 };
 const put=m=>files.set(m.path,m.raw);
 return {k,g,profile,ctx,host,inventories,files,put,message,entry,inventory,sidecars};
}
async function pin(s){s.ctx.state.pins[s.profile.snapshot.id]=(await unit.C.publicKey(s.k.descriptor)).fingerprint;}
const row=(report,name)=>report.scopes[SCOPE].entries.find(r=>r.path.endsWith(name));

test('an untrusted inventory creates nothing; pinning the key later lets the same file take effect',async()=>{
 const s=setup(),a=s.message('a.txt','alpha'),b=s.message('b.txt','beta');s.put(a);s.put(b);
 s.inventory([s.entry(a),s.entry(b)]);
 const state=H.newState(BOARD,'here');
 let report=await H.evaluate(s.ctx,state,s.host);
 assert.equal(report.scopes[SCOPE].setUp,false);assert.equal(JSON.stringify(report.scopes[SCOPE].inventories['unpinned-signer'].map(x=>x.participant)),'["test-agent-01"]');
 assert.equal(JSON.stringify(state.commitments),'{}','no expectation without a locally approved key');
 await pin(s);report=await H.evaluate(s.ctx,state,s.host);
 assert.equal(JSON.stringify(report.scopes[SCOPE].coverage),'{"expected":2,"available":2,"uncovered":0}');
 assert.equal(report.scopes[SCOPE].bootstrap,'folder-only');assert.equal(report.bootstrapNote,H.FOLDER_ONLY);
});

test('a key other than the approved current key is not trusted (superseded or different)',async()=>{
 const s=setup(),other=key(2),a=s.message('a.txt','alpha');s.put(a);
 s.ctx.state.pins[s.profile.snapshot.id]=(await unit.C.publicKey(other.descriptor)).fingerprint;
 s.inventory([s.entry(a)]);
 const report=await H.evaluate(s.ctx,H.newState(BOARD,'here'),s.host);
 assert.equal(report.scopes[SCOPE].setUp,false);assert.equal(report.scopes[SCOPE].inventories['unfamiliar-signer'].length,1);
});

test('removing a message and then the shared inventory keeps the expectation and reports the message as not found',async()=>{
 const s=setup(),a=s.message('a.txt','alpha'),b=s.message('b.txt','beta');s.put(a);s.put(b);await pin(s);s.inventory([s.entry(a),s.entry(b)]);
 const state=H.newState(BOARD,'here');await H.evaluate(s.ctx,state,s.host);
 s.files.delete(a.path);s.inventories.clear();
 const report=await H.evaluate(s.ctx,state,s.host),r=row(report,'a.txt');
 assert.deepEqual([r.observed,r.source,r.needsAttention,r.neutral],['message-unavailable','pinned-current',false,false]);
 assert.match(r.unavailableSince,/^\d{4}-\d\d-\d\dT/);assert.equal(report.scopes[SCOPE].coverage.expected,2);
 assert.equal(row(report,'b.txt').observed,'available');
 const stored=JSON.stringify(state);await H.evaluate(s.ctx,state,s.host);
 assert.equal(JSON.stringify(state),stored,'a repeated check changes nothing and keeps the first-seen time');
});

test('a changed message needs attention; a message added later is uncovered, never a mismatch',async()=>{
 const s=setup(),a=s.message('a.txt','alpha');s.put(a);await pin(s);s.inventory([s.entry(a)]);
 const state=H.newState(BOARD,'here');await H.evaluate(s.ctx,state,s.host);
 s.put(s.message('later.txt','new'));
 let report=await H.evaluate(s.ctx,state,s.host);assert.equal(report.scopes[SCOPE].coverage.uncovered,1);assert.equal(report.scopes[SCOPE].needsAttention,0);
 s.put({path:a.path,raw:Buffer.from('alpha!')});
 report=await H.evaluate(s.ctx,state,s.host);assert.deepEqual([row(report,'a.txt').observed,row(report,'a.txt').needsAttention],['changed',true]);assert.equal(report.scopes[SCOPE].needsAttention,1);
});

test('a compromise revocation wins over pins and keeps a missing message in needsAttention',async()=>{
 const s=setup(),a=s.message('a.txt','alpha');s.put(a);await pin(s);s.inventory([s.entry(a)]);
 const state=H.newState(BOARD,'here');await H.evaluate(s.ctx,state,s.host);
 const fp=s.ctx.state.pins[s.profile.snapshot.id];s.files.delete(a.path);s.inventories.clear();
 s.ctx.state.revoked[fp]='compromised';
 let r=row(await H.evaluate(s.ctx,state,s.host),'a.txt');
 assert.deepEqual([r.observed,r.source,r.needsAttention],['message-unavailable','revoked',true]);
 delete s.ctx.state.pins[s.profile.snapshot.id];
 r=row(await H.evaluate(s.ctx,state,s.host),'a.txt');
 assert.deepEqual([r.source,r.needsAttention],['revoked',true],'removing the approval cannot shadow a learned compromise');
 delete s.ctx.state.revoked[fp];
 r=row(await H.evaluate(s.ctx,state,s.host),'a.txt');
 assert.deepEqual([r.source,r.needsAttention,r.neutral],['unpinned',false,true],'unpinned-only sources stay neutral and visible');
});

test('a board UUID change refuses and never resets the stored checkpoint',async()=>{
 const state=H.newState(BOARD,'here');state.sequence=7;const before=JSON.stringify(state);
 assert.throws(()=>H.loadState(state,'00000000-0000-4000-8000-000000000000','here'),/board UUID changed/);
 assert.equal(JSON.stringify(state),before);
 assert.equal(H.loadState(JSON.parse(before),BOARD,'here').sequence,7);
 assert.throws(()=>H.loadState({...state,extra:1},BOARD,'here'),/unsupported schema fields/);
});

test('the verification window is bounded and reported as incomplete, then finishes without losing anything',async()=>{
 const s=setup(),a=s.message('a.txt','alpha');s.put(a);await pin(s);s.inventory([s.entry(a)]);
 const state=H.newState(BOARD,'here');await H.evaluate(s.ctx,state,s.host);
 for(let i=0;i<205;i++){const raw=Buffer.from('junk '+i);s.inventories.set(digest(raw)+'.json',Uint8Array.from(raw));}
 let report=await H.evaluate(s.ctx,state,s.host);
 assert.equal(report.scopes[SCOPE].windowComplete,false);assert.equal(report.scopes[SCOPE].pending,5);
 assert.equal(report.scopes[SCOPE].coverage.expected,1,'junk cannot remove remembered coverage');
 report=await H.evaluate(s.ctx,state,s.host);assert.equal(report.scopes[SCOPE].windowComplete,true);
 assert.equal(report.scopes[SCOPE].inventories['invalid-inventory'],205);
});

test('capacity exhaustion refuses new coverage visibly and drops nothing',async()=>{
 const s=setup(),a=s.message('a.txt','alpha'),b=s.message('b.txt','beta');s.put(a);s.put(b);await pin(s);s.inventory([s.entry(a)]);
 const state=H.newState(BOARD,'here');await H.evaluate(s.ctx,state,s.host);
 state.sources.filler={participant:s.profile.snapshot.id,fingerprint:'x',profile:sha('c'),scope:'rooms/other',previous:[],accepted:false,sequence:99,learned:'x',envelope:'a'.repeat(H.SIGNER_QUOTA)};
 s.inventory([s.entry(b)]);
 const report=await H.evaluate(s.ctx,state,s.host);
 assert.ok(report.scopes[SCOPE].diagnostics.includes('checkpoint-capacity-exhausted'));
 assert.equal(report.scopes[SCOPE].coverage.expected,1,'existing expectation kept; new recording not remembered');
 assert.equal(report.scopes[SCOPE].inventories['pending-verification'].length,1);
});

test('only inventory entries of the declared scope with the configured direct directory are accepted',async()=>{
 const config={board:{direct_directory:'direct'}};
 assert.equal(H.checkScope('direct/research-agent-01--implementation-agent-01',config),'direct/research-agent-01--implementation-agent-01');
 for(const bad of ['rooms/Gen','rooms/a/b','history/general','rooms/','rooms/a--b','direct/Bad'])assert.throws(()=>H.checkScope(bad,config),/scope not recognized/);
 assert.throws(()=>H.directDirectory({board:{direct_directory:'history'}}),/history-unavailable/);
 assert.equal(H.checkScope('talks/research-agent-01--implementation-agent-01',{board:{direct_directory:'talks'}}).startsWith('talks/'),true);
});
