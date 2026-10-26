'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,graph,key,clone,BOARD}=require('./lib/signing-unit');
function fixture(){const h=harness(),g=graph(h.C),a=g.profile(key(1));g.head(a);return {...h,g,a,m:g.message(a)};}
const wrongBoard='3cda5aba-086d-46db-bfaf-46c51676f8bb';
for(const [name,change] of [
 ['board',v=>v.boardId=wrongBoard],['participant',v=>v.participant='other-agent-01'],
 ['profile',v=>v.profile='a'.repeat(64)],['physical path',v=>v.path=v.path.replace('general','other')]
])test('bound message rejects replay into another '+name,async()=>{
 const {C,a,m}=fixture();await C.verifyMessage(m.envelope,a.raw,m.raw,m.verification);
 const other={...m.verification};change(other);await assert.rejects(C.verifyMessage(m.envelope,a.raw,m.raw,other));
});
for(const [name,mutate] of [
 ['board',s=>s.boardId=wrongBoard],['sender',s=>s.participant='other-agent-01'],['profile',s=>s.profile='a'.repeat(64)],
 ['target kind',s=>s.target.kind='artifact'],['path',s=>s.target.path=s.target.path.replace('general','other')],
 ['hash',s=>s.target.sha256='a'.repeat(64)],['byte count',s=>s.target.bytes++],['extra field',s=>s.target.extra=true],
 ['version',s=>s.version=2]
])test('cryptographically valid message rejects incorrect '+name+' statement',async()=>{
 const {C,g,a,m}=fixture(),statement=clone(m.statement);mutate(statement);
 const signed=g.seal(C.TYPES.message,statement,[a.key]);await C.verifyEnvelope(signed,C.TYPES.message,[a.key.descriptor]);
 await assert.rejects(C.verifyMessage(signed,a.raw,m.raw,m.verification));
});
for(const name of ['changed body','truncated bytes','line endings','float version','float byte count','wrong payload type'])test('exact-byte verification rejects '+name,async()=>{
 const {C,g,a,m}=fixture();let envelope=m.envelope,raw=m.raw;
 if(name==='changed body')raw=Buffer.from(raw.toString().replace('Exact','Other'));
 if(name==='truncated bytes')raw=raw.subarray(0,-1);
 if(name==='line endings')raw=Buffer.from(raw.toString().replaceAll('\n','\r\n'));
 if(name==='float version')envelope=g.seal(C.TYPES.message,JSON.stringify(m.statement).replace('"version":1','"version":1.0'),[a.key]);
 if(name==='float byte count')envelope=g.seal(C.TYPES.message,JSON.stringify(m.statement).replace('"bytes":'+raw.length,'"bytes":'+raw.length+'.0'),[a.key]);
 if(name==='wrong payload type')envelope=g.seal(C.TYPES.profile,m.statement,[a.key]);
 await assert.rejects(C.verifyMessage(envelope,a.raw,raw,m.verification));
});
for(const [name,mutate] of [
 ['empty signatures',e=>e.signatures=[]],['duplicate signatures',e=>e.signatures.push(e.signatures[0])],
 ['missing key hint',e=>delete e.signatures[0].keyid],['short signature',e=>e.signatures[0].sig=Buffer.alloc(63).toString('base64')],
 ['extra signature member',e=>e.signatures[0].private='no'],['extra envelope member',e=>e.private='no'],
 ['noncanonical payload base64',e=>e.payload='Zh=='],['mixed base64 alphabet',e=>e.payload='+-/_']
])test('envelope rejects '+name,async()=>{
 const {C,a,m}=fixture(),envelope=JSON.parse(m.envelope);mutate(envelope);
 await assert.rejects(C.verifyEnvelope(C.canonical(envelope),C.TYPES.message,[a.key.descriptor]));
});
test('key hints cannot substitute for real signature verification; valid hints are not trust',async()=>{
 const {C,g,a,m}=fixture(),other=key(2),envelope=JSON.parse(m.envelope);envelope.signatures[0].keyid='forged-fingerprint';
 await C.verifyMessage(C.canonical(envelope),a.raw,m.raw,m.verification);
 const forged=JSON.parse(g.seal(C.TYPES.message,m.statement,[other]));forged.signatures[0].keyid=envelope.signatures[0].keyid;
 await assert.rejects(C.verifyMessage(C.canonical(forged),a.raw,m.raw,m.verification),/signature/);
});
for(const signatures of ['missing','duplicate old','duplicate new','wrong co-signer'])test('rotation rejects '+signatures+' authorization',async()=>{
 const {C,g,a}=fixture(),b=g.profile(key(2),a.digest),keys=signatures==='missing'?[a.key]:signatures==='duplicate old'?[a.key,a.key]:signatures==='duplicate new'?[b.key,b.key]:[a.key,key(3)];
 g.head(b,[g.transition(a,b,keys)]);await assert.rejects(g.context().resolve(a.snapshot.id),/signature/);
});
test('valid dual signatures work regardless of order; missing transition never authorizes rotation',async()=>{
 const {g,a}=fixture(),b=g.profile(key(2),a.digest);g.head(b);await assert.rejects(g.context().resolve(a.snapshot.id),/rotation authorization missing/);
 g.head(b,[g.transition(a,b,[b.key,a.key])]);assert.equal((await g.context().resolve(a.snapshot.id)).head.digest,b.digest);
});
test('valid but conflicting transitions from the same head fail closed',async()=>{
 const {g,a}=fixture(),b=g.profile(key(2),a.digest),c=g.profile(key(3),a.digest);
 g.head(b,[g.transition(a,b),g.transition(a,c)]);await assert.rejects(g.context().resolve(a.snapshot.id),/conflicting transitions/);
});
test('learned heads reject rollback and a same-key fork',async()=>{
 const {g,a}=fixture(),b=g.profile(a.key,a.digest,a.snapshot.id,{name:'Updated'});g.head(b);const first=g.context();await first.resolve(a.snapshot.id);
 const saved=clone(first.state);g.head(a);await assert.rejects(g.context(clone(saved)).resolve(a.snapshot.id),/rollback/);
 const fork=g.profile(a.key,a.digest,a.snapshot.id,{name:'Fork'});g.head(fork);await assert.rejects(g.context(clone(saved)).resolve(a.snapshot.id),/conflicting head/);
});
test('missing, tampered and self-referential predecessor evidence fails closed',async()=>{
 for(const kind of ['missing','tampered','self-reference']){
  const {g,a}=fixture(),b=g.profile(a.key,kind==='self-reference'?'a'.repeat(64):a.digest);g.head(b);
  if(kind==='missing')g.files.delete('identity/profiles/'+a.digest+'.json');
  if(kind==='tampered')g.files.set('identity/profiles/'+a.digest+'.json',Buffer.from('tampered'));
  if(kind==='self-reference')g.files.set('identity/profiles/'+'a'.repeat(64)+'.json',b.raw);
  await assert.rejects(g.context().resolve(a.snapshot.id),/evidence missing|hash\/size/);
 }
});
test('lifecycle events from another board or participant cannot change the current key',async()=>{
 for(const field of ['boardId','participant']){
  const {C,g,a}=fixture(),b=g.profile(key(2),a.digest),s={version:1,boardId:BOARD,participant:a.snapshot.id,fromProfile:a.digest,toProfile:b.digest};s[field]=field==='boardId'?wrongBoard:'other-agent-01';
  g.head(b,[g.event(C.TYPES.transition,s,[a.key,b.key])]);await assert.rejects(g.context().resolve(a.snapshot.id),/context mismatch/);
 }
});
test('retirement excludes valid signatures and cannot downgrade learned compromise',async()=>{
 const {C,g,a,m}=fixture(),fp=(await C.publicKey(a.key.descriptor)).fingerprint;
 const revoke=status=>g.event(C.TYPES.revocation,{version:1,boardId:BOARD,participant:a.snapshot.id,authorizingProfile:a.digest,keyId:fp,status},[a.key]);
 const retired=revoke('retired'),compromised=revoke('compromised');g.head(a,[retired]);const first=g.context();
 const result=await first.evaluate(m.path,m.headers,m.raw);assert.equal(result.signature,'valid');assert.equal(result.lifecycle,'retired');assert.equal(result.eligibility,'excluded');
 const provider=new C.Provider();await assert.rejects(provider.unlock(C.canonical(a.key.jwk),first),/no usable/);
 g.head(a,[retired,compromised]);const next=g.context(clone(first.state));assert.equal((await next.evaluate(m.path,m.headers,m.raw)).lifecycle,'compromised');
 g.head(a,[retired]);g.files.delete('identity/events/'+compromised+'.json');assert.equal((await g.context(clone(next.state)).evaluate(m.path,m.headers,m.raw)).lifecycle,'compromised');
});
test('transition authorizers and predecessor endpoints must belong to the exact lineage',async()=>{
 for(const kind of ['outside authorizer','wrong predecessor']){
  const {C,g,a}=fixture(),outsider=g.profile(key(3)),b=g.profile(key(2),a.digest),from=kind==='outside authorizer'?outsider:a;
  const statement={version:1,boardId:BOARD,participant:a.snapshot.id,fromProfile:from.digest,toProfile:kind==='wrong predecessor'?outsider.digest:b.digest};
  g.head(b,[g.event(C.TYPES.transition,statement,[from.key,b.key])]);
  await assert.rejects(g.context().resolve(a.snapshot.id),/authorizer outside lineage|transition endpoints/);
 }
});
test('a signed revocation cannot name another fingerprint or an out-of-lineage authorizer',async()=>{
 for(const kind of ['key','profile']){
  const {C,g,a}=fixture(),outsider=g.profile(key(3)),fp=(await C.publicKey(a.key.descriptor)).fingerprint;
  const statement={version:1,boardId:BOARD,participant:a.snapshot.id,authorizingProfile:kind==='profile'?outsider.digest:a.digest,keyId:kind==='key'?'forged':fp,status:'retired'};
  g.head(a,[g.event(C.TYPES.revocation,statement,[a.key])]);await assert.rejects(g.context().resolve(a.snapshot.id),/revocation authority/);
 }
});
test('a valid trusted-key message from another profile lineage is excluded',async()=>{
 const {C,g,a}=fixture(),outside=g.profile(a.key,null,a.snapshot.id,{name:'Unrelated root'}),message=g.message(outside),ctx=g.context();
 ctx.state.pins[a.snapshot.id]=(await C.publicKey(a.key.descriptor)).fingerprint;
 const result=await ctx.evaluate(message.path,message.headers,message.raw);
 assert.equal(result.signature,'valid');assert.equal(result.eligibility,'excluded');assert.match(result.reason,/outside accepted lineage/);
});
