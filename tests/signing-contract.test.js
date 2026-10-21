'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('esbuild');
const source=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../scripts/signing-contract.js')],bundle:true,write:false,format:'iife',globalName:'SigningContract',target:'es2022'}).outputFiles[0].text;
const context={crypto:crypto.webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,console};vm.createContext(context);vm.runInContext(source,context);const C=context.SigningContract;
const canonical=path.resolve(__dirname,'../vendor/agent-file-board'),vectors=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/signing-core/vectors.json'))),profiles=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/signing-core/profiles.json')));
const raw=s=>Uint8Array.from(Buffer.from(s,'base64')),plain=v=>JSON.parse(JSON.stringify(v));
test('OpenSSL/libsodium exact-byte message fixtures verify in bundled browser crypto',async()=>{for(const fixture of vectors.cases){const c=fixture.context,profileCase=profiles.cases[0],profileRaw=raw(profileCase.profile_envelope_base64);const result=await C.verifyEnvelope(C.canonical(fixture.envelope),C.TYPES.message,[vectors.descriptor]);assert.equal(C.text(result.payload),Buffer.from(fixture.payload_base64,'base64').toString());assert.equal(result.fingerprints[0],vectors.fingerprint);await assert.rejects(C.verifyEnvelope(C.canonical({...fixture.envelope,payload:Buffer.from('tampered').toString('base64')}),C.TYPES.message,[vectors.descriptor]));}});
test('frozen root/update profiles and bound messages have identical fingerprints/hash/context',async()=>{for(const f of profiles.cases){const rawProfile=raw(f.profile_envelope_base64),c=f.message_context,p=await C.verifyProfile(rawProfile,f.profile_envelope_sha256,c.board_id,c.participant);assert.equal(p.fingerprint,profiles.fingerprint);assert.deepEqual(plain(p.snapshot),f.snapshot);const result=await C.verifyMessage(C.canonical(f.message_envelope),rawProfile,raw(f.message_base64),{boardId:c.board_id,participant:c.participant,profile:c.profile,path:c.path});assert.equal(result.fingerprint,profiles.fingerprint);await assert.rejects(C.verifyProfile(rawProfile,f.profile_envelope_sha256,'3cda5aba-086d-46db-bfaf-46c51676f8bb',c.participant));}});
test('unsafe Ed25519 points, private descriptors and duplicate JSON reject',async()=>{for(const value of [Buffer.concat([Buffer.from([1]),Buffer.alloc(31)]),Buffer.alloc(32),Buffer.from('ea5ef8400c31ef41e28f22e718b43f66981b29cf645af2a0e223799bedaace47','hex')]){const descriptor=structuredClone(vectors.descriptor);descriptor.key.x=value.toString('base64url');await assert.rejects(C.publicKey(descriptor));}const descriptor=structuredClone(vectors.descriptor);descriptor.key.d='secret';await assert.rejects(C.publicKey(descriptor));for(const value of ['{"a":1,"a":2}','"\\ud800"','1.0000000000000001','1e400','1e-400'])assert.throws(()=>C.parse(C.bytes(value)));});
test('mirror comparison preserves boolean/number and integer/float distinctions',async()=>{const f=profiles.cases[0],p=await C.verifyProfile(raw(f.profile_envelope_base64),f.profile_envelope_sha256,f.message_context.board_id,f.message_context.participant);const a=JSON.stringify(f.snapshot),b=a.replace('"active":true','"active":1');assert.equal(C.mirrorMatches(p,C.parse(C.bytes(a))),true);assert.equal(C.mirrorMatches(p,C.parse(C.bytes(b))),false);assert.equal(C.same(C.parse(C.bytes('{"value":1}')),C.parse(C.bytes('{"value":1.0}'))),false);});
test('scope floors cannot be weakened and malformed shared declarations fail',()=>{const config={board:{direct_directory:'direct',thread_digits:3}},strong=C.policy(C.parse(C.bytes('{"version":1,"minimum":"trusted"}')),config),empty=C.policy(undefined,config);assert.equal(C.requirement(C.mergeFloor(strong,empty,config),'rooms/general','T001'),'trusted');for(const input of [null,{}, {version:1,minimum:null},{version:1,scopes:null},{version:1,scopes:{'rooms/general':{threads:null}}}, {version:1,minimum:'trusted',scopes:{'rooms/general':{minimum:'optional'}}}])assert.throws(()=>C.policy(input,config));});
test('tab provider proves possession, signs distinct typed payloads, rejects mismatches and locks',async()=>{
 context.performance=performance;const f=profiles.cases[0],c=f.message_context,rawProfile=raw(f.profile_envelope_base64),p=await C.verifyProfile(rawProfile,f.profile_envelope_sha256,c.board_id,c.participant),registry={participants:[{...f.snapshot,identity:{version:1,profile:f.profile_envelope_sha256}}]},config={identity:{boardId:c.board_id}},ctx=new C.Context(config,registry,async()=>rawProfile),provider=new C.Provider();
 const key={...p.descriptor.key,d:Buffer.from(profiles.seed_hex,'hex').toString('base64url')};await provider.unlock(C.canonical(key),ctx);assert.equal(provider.catalog()[0].participant,c.participant);
 const payload=C.bytes('independent payload'),proof=await provider.sign(c.participant,ctx,C.TYPES.message,payload);assert.equal(C.text((await C.verifyEnvelope(proof,C.TYPES.message,[p.descriptor])).payload),'independent payload');
 const bad={...key,d:Buffer.alloc(32,7).toString('base64url')};await assert.rejects(new C.Provider().unlock(C.canonical(bad),ctx));provider.lock();assert.equal(provider.catalog().length,0);await assert.rejects(provider.sign(c.participant,ctx,C.TYPES.message,payload));
 const pending=new C.Provider(),unlock=pending.unlock(C.canonical(key),ctx);pending.lock();await assert.rejects(unlock);
});
test('Python-signed lifecycle corpus agrees on same-key updates, dual rotation, compromise and remembered stripping',async()=>{
 const corpus=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/signing-core/runtime.json')));
 for(const f of corpus.cases){const config=C.parse(C.canonical(f.config)),registry=C.parse(C.canonical(f.registry)),available=new Map(Object.entries(f.files).map(([p,v])=>[p,raw(v)])),ctx=new C.Context(config,registry,async p=>available.get(p)||null);ctx.state.pins[f.participant]=f.expected.fingerprint;const message=raw(f.message),headers=Object.fromEntries(C.text(message).split('\n---\n')[0].split('\n').map(line=>{const at=line.indexOf(': ');return [line.slice(0,at),line.slice(at+2)];}));const result=await ctx.evaluate(f.path,headers,message);for(const key of ['signature','trust','lifecycle','eligibility'])assert.equal(result[key],f.expected[key],f.name+' '+key+': '+JSON.stringify(result));
 if(f.name==='compromise'){const person=registry.participants.find(p=>p.id===f.participant);person.identity.events=[];for(const p of available.keys())if(p.startsWith('identity/events/'))available.delete(p);const next=new C.Context(config,registry,async p=>available.get(p)||null,ctx.state);assert.equal((await next.evaluate(f.path,headers,message)).lifecycle,'compromised');}
 }
});
test('provider inactivity expires capability without background renewal',async()=>{
 let tick=0;context.performance={now:()=>tick};try{const f=profiles.cases[0],c=f.message_context,p=await C.verifyProfile(raw(f.profile_envelope_base64),f.profile_envelope_sha256,c.board_id,c.participant),ctx=new C.Context({identity:{boardId:c.board_id}},{participants:[{...p.snapshot,identity:{version:1,profile:p.digest}}]},async()=>raw(f.profile_envelope_base64)),provider=new C.Provider();await provider.unlock(C.canonical({...p.descriptor.key,d:Buffer.from(profiles.seed_hex,'hex').toString('base64url')}),ctx);tick=899999;assert.equal(provider.catalog().length,1);tick=900000;assert.equal(provider.catalog().length,0);await assert.rejects(provider.sign(c.participant,ctx,C.TYPES.message,C.bytes('late')));}finally{context.performance=performance;}
});

test('malformed private input diagnostics never echo private fragments',async()=>{const provider=new C.Provider();await assert.rejects(provider.unlock(C.bytes('{"d":"PRIVATE_FRAGMENT\\q"}'),{boardId:'board'}),error=>!error.message.includes('PRIVATE_FRAGMENT')&&/Invalid private JWK/.test(error.message));});
test('refresh discards a capability whose registered key is compromised',async()=>{context.performance=performance;const f=profiles.cases[0],c=f.message_context,p=await C.verifyProfile(raw(f.profile_envelope_base64),f.profile_envelope_sha256,c.board_id,c.participant),ctx=new C.Context({identity:{boardId:c.board_id}},{participants:[{...p.snapshot,identity:{version:1,profile:p.digest}}]},async()=>raw(f.profile_envelope_base64)),provider=new C.Provider();await provider.unlock(C.canonical({...p.descriptor.key,d:Buffer.from(profiles.seed_hex,'hex').toString('base64url')}),ctx);const f2=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/signing-core/runtime.json'))).cases.find(f=>f.name==='compromise'),next=new C.Context(f2.config,f2.registry,async path=>f2.files[path]?raw(f2.files[path]):null);await provider.reconcile(next);assert.equal(provider.catalog().length,0);});

function rootProviderContext() {
 const f=profiles.cases[0],c=f.message_context;
 const registry={participants:[{...f.snapshot,identity:{version:1,profile:f.profile_envelope_sha256}}]};
 const ctx=new C.Context({identity:{boardId:c.board_id}},registry,async()=>raw(f.profile_envelope_base64));
 return {ctx,participant:c.participant,key:{...vectors.descriptor.key,d:Buffer.from(profiles.seed_hex,'hex').toString('base64url')}};
}
function runtimeContext(name,state=null,withoutSharedEvidence=false) {
 const f=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/signing-core/runtime.json'))).cases.find(f=>f.name===name);
 const config=plain(f.config),registry=plain(f.registry);
 if(withoutSharedEvidence){delete config.message_signing;registry.participants.find(p=>p.id===f.participant).identity.events=[];}
 const ctx=new C.Context(config,registry,async p=>withoutSharedEvidence&&p.startsWith('identity/events/')?null:f.files[p]?raw(f.files[p]):null,state);
 return {ctx,fixture:f};
}
for(const change of ['dual-key rotation','different board','missing identity'])test('provider reconciliation clears unlocked capability after '+change,async()=>{
 context.performance=performance;
 const {ctx,participant,key}=rootProviderContext(),provider=new C.Provider();await provider.unlock(C.canonical(key),ctx);
 assert.equal(provider.catalog().length,1);
 let next;
 if(change==='dual-key rotation'){
  next=runtimeContext('rotation').ctx;
  assert.notEqual((await next.resolve(participant)).head.fingerprint,(await ctx.resolve(participant)).head.fingerprint);
 }else if(change==='different board'){
  next=new C.Context({identity:{boardId:'3cda5aba-086d-46db-bfaf-46c51676f8bb'}},ctx.registry,ctx.read);
 }else next=new C.Context(ctx.config,{participants:[]},async()=>null);
 const generation=provider.generation;await provider.reconcile(next);
 assert.equal(provider.catalog().length,0);assert.ok(provider.generation>generation);
 await assert.rejects(provider.sign(participant,next,C.TYPES.message,C.bytes('cannot sign after context loss')),/unlock/);
});
test('same-key profile advance rebinds possession; reconciliation never extends inactivity',async()=>{
 let tick=0;context.performance={now:()=>tick};
 try{
  const {ctx,participant,key}=rootProviderContext(),provider=new C.Provider();await provider.unlock(C.canonical(key),ctx);
  const next=runtimeContext('same-key').ctx,head=(await next.resolve(participant)).head;
  assert.notEqual(head.digest,(await ctx.resolve(participant)).head.digest);
  assert.equal(head.fingerprint,(await ctx.resolve(participant)).head.fingerprint);
  tick=20;await provider.reconcile(next);assert.equal(provider.catalog().length,1);
  const proof=await provider.sign(participant,next,C.TYPES.message,C.bytes('same key, advanced profile'));
  assert.equal(provider.catalog()[0].profile,head.digest);
  assert.equal(C.text((await C.verifyEnvelope(proof,C.TYPES.message,[head.descriptor])).payload),'same key, advanced profile');
  tick=900019;await provider.reconcile(next);assert.equal(provider.catalog().length,1);
  tick=900020;await provider.reconcile(next);assert.equal(provider.catalog().length,0);
 }finally{context.performance=performance;}
});
test('serialized private state retains adopted floor, compromise and UUID binding after shared stripping',async()=>{
 const {ctx,fixture:f}=runtimeContext('compromise');
 ctx.state.pins[f.participant]=f.expected.fingerprint;
 ctx.state.floor=C.mergeFloor(ctx.floor,C.policy({version:1,minimum:'trusted'},ctx.config),ctx.config);
 const message=raw(f.message),headers=Object.fromEntries(C.text(message).split('\n---\n')[0].split('\n').map(line=>{const at=line.indexOf(': ');return [line.slice(0,at),line.slice(at+2)];}));
 assert.equal((await ctx.evaluate(f.path,headers,message)).lifecycle,'compromised');
 const persisted=plain(ctx.state),restored=runtimeContext('compromise',persisted,true).ctx;
 const result=await restored.evaluate(f.path,headers,message);
 assert.equal(result.minimum,'trusted');assert.equal(result.lifecycle,'compromised');assert.equal(result.eligibility,'excluded');
 assert.equal((await restored.evaluate('rooms/general/never-signed.txt',{FROM:f.participant,THREAD:'T001'},C.bytes('unsigned'))).eligibility,'excluded');
 assert.throws(()=>new C.Context({...restored.config,identity:{boardId:'3cda5aba-086d-46db-bfaf-46c51676f8bb'}},restored.registry,restored.read,plain(persisted)),/board UUID changed/);
});
