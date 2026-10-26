'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {harness,graph,key,digest,clone,BOARD}=require('./lib/signing-unit');
function fixture(){const h=harness(),g=graph(h.C),a=g.profile(key(1));g.head(a);return {...h,g,a};}
test('strict JSON accepts byte, depth and node limits, rejecting limit plus one',()=>{
 const {C}=harness();assert.equal(C.parse(C.bytes('null'+' '.repeat(65532))),null);
 assert.throws(()=>C.parse(C.bytes('null'+' '.repeat(65533))),/byte budget/);
 assert.ok(C.parse(C.bytes('['.repeat(16)+'0'+']'.repeat(16))));
 assert.throws(()=>C.parse(C.bytes('['.repeat(17)+'0'+']'.repeat(17))),/structure budget/);
 assert.equal(C.parse(C.bytes(JSON.stringify(Array(4095).fill(0)))).length,4095);
 assert.throws(()=>C.parse(C.bytes(JSON.stringify(Array(4096).fill(0)))),/structure budget/);
});
test('public evidence accepts64KiB and4MiB total, rejects overflow, and cached reads do not spend twice',async()=>{
 const {g}=fixture(),ctx=g.context();let last;
 for(let i=0;i<64;i++){
  const prefix=JSON.stringify({i}),raw=Buffer.from(prefix+' '.repeat(65536-prefix.length)),ref=digest(raw);g.files.set('identity/profiles/'+ref+'.json',raw);
  await ctx.load('profiles',ref);last=ref;
 }
 assert.equal(ctx.used,4194304);await ctx.load('profiles',last);assert.equal(ctx.used,4194304);
 const extra=Buffer.from('{}'),ref=digest(extra);g.files.set('identity/profiles/'+ref+'.json',extra);
 await assert.rejects(ctx.load('profiles',ref),/lifecycle byte budget/);
 const large=Buffer.alloc(65537,32),largeRef=digest(large);g.files.set('identity/profiles/'+largeRef+'.json',large);
 await assert.rejects(g.context().load('profiles',largeRef),/hash\/size/);
});
test('distinct lifecycle envelope count accepts128 and rejects129',async()=>{
 const {g}=fixture(),ctx=g.context();
 for(let i=0;i<128;i++){const raw=Buffer.from(JSON.stringify({i})),ref=digest(raw);g.files.set('identity/profiles/'+ref+'.json',raw);await ctx.load('profiles',ref);}
 assert.equal(ctx.raw.size,128);const raw=Buffer.from('{"overflow":true}'),ref=digest(raw);g.files.set('identity/profiles/'+ref+'.json',raw);
 await assert.rejects(ctx.load('profiles',ref),/envelope budget/);
});
test('profile chain accepts64 ancestors and rejects a65th',async()=>{
 const {g,a}=fixture();let last=a;
 for(let i=1;i<64;i++)last=g.profile(a.key,last.digest,a.snapshot.id,{name:'Update '+i});
 g.head(last);assert.equal((await g.context().resolve(a.snapshot.id)).chain.length,64);
 const overflow=g.profile(a.key,last.digest,a.snapshot.id,{name:'Overflow'});g.head(overflow);
 await assert.rejects(g.context().resolve(a.snapshot.id),/predecessor budget\/cycle/);
});
test('event locators accept64, reject65, duplicates, unsorted hashes and learned union overflow',async()=>{
 const {C,g,a}=fixture(),fp=(await C.publicKey(a.key.descriptor)).fingerprint,events=[];
 for(let i=0;i<65;i++)events.push(g.event(C.TYPES.revocation,{version:1,boardId:BOARD,participant:a.snapshot.id,authorizingProfile:a.digest,keyId:fp,status:'retired',reason:'Event '+i},[a.key]));
 g.head(a,events.slice(0,64));assert.equal((await g.context().resolve(a.snapshot.id)).events.length,64);
 g.head(a,events);await assert.rejects(g.context().resolve(a.snapshot.id),/event locator/);
 g.head(a,[events[0],events[0]]);await assert.rejects(g.context().resolve(a.snapshot.id),/event locator/);
 g.head(a,events.slice(0,2));g.registry.participants[0].identity.events.sort().reverse();await assert.rejects(g.context().resolve(a.snapshot.id),/event locator/);
 g.head(a,events.slice(0,64));const next=g.context(),old=events[64];next.state.evidence['events/'+old]=g.files.get('identity/events/'+old+'.json').toString('base64');
 await assert.rejects(next.resolve(a.snapshot.id),/event budget/);
});
test('missing evidence can use verified private cache; tampered shared bytes cannot override its digest',async()=>{
 const {g,a}=fixture(),first=g.context();await first.resolve(a.snapshot.id);const saved=clone(first.state),file='identity/profiles/'+a.digest+'.json';
 g.files.delete(file);assert.equal((await g.context(clone(saved)).resolve(a.snapshot.id)).head.digest,a.digest);
 g.files.set(file,Buffer.from('tampered'));await assert.rejects(g.context(clone(saved)).resolve(a.snapshot.id),/hash\/size/);
});
test('private history accepts8MiB exactly, refuses overflow before opening IndexedDB, and preserves old state',async()=>{
 const {C,sandbox}=harness();let opened=0,closed=0,saved=null;
 sandbox.idb=async()=>{opened++;return {close(){closed++;},transaction(){const tx={};tx.objectStore=()=>({get(){const q={result:saved};queueMicrotask(()=>q.onsuccess());return q;},put(value){saved=value;queueMicrotask(()=>tx.oncomplete());}});return tx;}};};
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../scripts/signing-ui.js'),'utf8'),sandbox);
 const state=new C.Context({identity:{boardId:BOARD}},{participants:[]},async()=>null).state;
 state.evidence.padding='';state.evidence.padding='x'.repeat(8388608-Buffer.byteLength(JSON.stringify(state)));
 const model={signingKey:'private-test',signingExpected:'null',signingContext:{boardId:BOARD,state},msgs:[]};
 assert.equal(Buffer.byteLength(JSON.stringify(state)),8388608);await sandbox.signingSave(model);
 assert.equal(opened,1);assert.equal(closed,1);assert.equal(Buffer.byteLength(JSON.stringify(saved)),8388608);
 const before=JSON.stringify(saved);state.evidence.padding+='x';await assert.rejects(sandbox.signingSave(model),/private signing history budget/);
 assert.equal(opened,1);assert.equal(JSON.stringify(saved),before);assert.equal(model.signingExpected,before);
});
test('message verification accepts4MiB exact bytes and rejects a signed larger message',async()=>{
 const {C,g,a}=fixture(),m=g.message(a),prefix=m.raw.subarray(0,m.raw.indexOf('\n---\n')+5);
 for(const size of [4194304,4194305]){
  const raw=Buffer.concat([prefix,Buffer.alloc(size-prefix.length-1,97),Buffer.from('\n')]),statement=clone(m.statement);statement.target.bytes=raw.length;statement.target.sha256=digest(raw);
  g.files.set('rooms/general/.signatures/'+JSON.parse(m.headers.SIGNATURE).record+'.json',g.seal(C.TYPES.message,statement,[a.key]));
  const result=await g.context().evaluate(m.path,m.headers,raw);
  assert.equal(result.eligibility,size===4194304?'eligible':'excluded');
  if(size===4194304)assert.equal(result.signature,'valid');else assert.match(result.reason,/message byte budget/);
 }
});
test('unrelated learned events do not consume this participant event allowance',async()=>{
 const {C,g,a}=fixture(),ctx=g.context();
 for(let i=0;i<65;i++){
  const ref=g.event(C.TYPES.revocation,{version:1,boardId:BOARD,participant:'other-agent-01',authorizingProfile:a.digest,keyId:'unrelated',status:'retired',reason:String(i)},[a.key]);
  ctx.state.evidence['events/'+ref]=g.files.get('identity/events/'+ref+'.json').toString('base64');
 }
 assert.equal((await ctx.resolve(a.snapshot.id)).head.digest,a.digest);
});
