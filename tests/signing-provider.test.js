'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,graph,key,gate}=require('./lib/signing-unit');
function fixture(){const h=harness(),g=graph(h.C),a=g.profile(key(1));g.head(a);return {...h,g,a,ctx:g.context(),provider:new h.C.Provider()};}
async function unlock(f){await f.provider.unlock(f.C.canonical(f.a.key.jwk),f.ctx);}
test('imported private handles are non-extractable and catalogs contain public bindings only',async()=>{
 const f=fixture(),original=f.subtle.importKey;let imported;
 f.subtle.importKey=async(...args)=>{imported=await original(...args);return imported;};await unlock(f);
 assert.equal(imported.extractable,false);await assert.rejects(require('node:crypto').webcrypto.subtle.exportKey('jwk',imported),/not extractable/);
 assert.deepEqual(Object.keys(f.provider.catalog()[0]).sort(),['fingerprint','participant','profile']);
});
test('failed crypto import returns no capability or private input and can be retried',async()=>{
 const f=fixture(),original=f.subtle.importKey;f.subtle.importKey=async()=>{throw Error('import failed');};
 await assert.rejects(f.provider.unlock(f.C.canonical(f.a.key.jwk),f.ctx),e=>/import unavailable/.test(e.message)&&!e.message.includes(f.a.key.jwk.d));
 assert.equal(f.provider.catalog().length,0);f.subtle.importKey=original;await unlock(f);assert.equal(f.provider.catalog().length,1);
});
for(const phase of ['importKey','possession'])test('lock during awaited '+phase+' prevents unlock completion',async()=>{
 const f=fixture(),wait=gate(),method=phase==='importKey'?'importKey':'sign',original=f.subtle[method];
 f.subtle[method]=async(...args)=>{wait.enter();await wait.released;return original(...args);};
 const pending=assert.rejects(f.provider.unlock(f.C.canonical(f.a.key.jwk),f.ctx),/locked/);
 await wait.entered;f.provider.lock();wait.release();await pending;assert.equal(f.provider.catalog().length,0);
});
for(const elapsed of [119999,120000])test('possession proof deadline at '+elapsed+'ms',async()=>{
 const f=fixture(),wait=gate(),original=f.subtle.sign;
 f.subtle.sign=async(...args)=>{wait.enter();await wait.released;return original(...args);};
 const operation=f.provider.unlock(f.C.canonical(f.a.key.jwk),f.ctx),result=elapsed===120000?assert.rejects(operation,/proof expired/):operation;
 await wait.entered;f.clock.value=elapsed;wait.release();await result;assert.equal(f.provider.catalog().length,elapsed===120000?0:1);
});
test('a rejected crypto signature yields no result, keeps the binding, and permits explicit retry',async()=>{
 const f=fixture();await unlock(f);const original=f.subtle.sign;f.subtle.sign=async()=>{throw Error('Synthetic signing failure');};
 await assert.rejects(f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('retry me')),/Synthetic signing failure/);
 assert.equal(f.provider.catalog().length,1);f.subtle.sign=original;
 const signature=await f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('retry me'));
 assert.equal(f.C.text((await f.C.verifyEnvelope(signature,f.C.TYPES.message,[f.a.key.descriptor])).payload),'retry me');
});
for(const phase of ['sign','verification'])test('lock during awaited message '+phase+' prevents a returned signature',async()=>{
 const f=fixture();await unlock(f);const wait=gate(),method=phase==='sign'?'sign':'digest',original=f.subtle[method];
 f.subtle[method]=async(...args)=>{wait.enter();await wait.released;return original(...args);};
 const pending=assert.rejects(f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('must not escape after lock')),/locked/);
 await wait.entered;f.provider.lock();wait.release();await pending;assert.equal(f.provider.catalog().length,0);
});
test('inactivity expiry while WebCrypto signs refuses completion',async()=>{
 const f=fixture();await unlock(f);f.clock.value=899999;const wait=gate(),original=f.subtle.sign;
 f.subtle.sign=async(...args)=>{wait.enter();await wait.released;return original(...args);};
 const pending=assert.rejects(f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('expired')),/locked/);
 await wait.entered;f.clock.value=900000;wait.release();await pending;assert.equal(f.provider.catalog().length,0);
});
test('two unlocked identities sign only as their own keys and reject an unknown identity',async()=>{
 const f=fixture(),b=f.g.profile(key(2),null,'other-agent-01');f.g.head(b);f.ctx=f.g.context();await unlock(f);await f.provider.unlock(f.C.canonical(b.key.jwk),f.ctx);
 assert.equal(f.provider.catalog().length,2);
 for(const [current,other] of [[f.a,b],[b,f.a]]){
  const signature=await f.provider.sign(current.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes(current.snapshot.id));
  assert.equal(f.C.text((await f.C.verifyEnvelope(signature,f.C.TYPES.message,[current.key.descriptor])).payload),current.snapshot.id);
  await assert.rejects(f.C.verifyEnvelope(signature,f.C.TYPES.message,[other.key.descriptor]),/signature/);
 }
 await assert.rejects(f.provider.sign('unknown-agent-01',f.ctx,f.C.TYPES.message,f.C.bytes('no')),/unlock/);
});
test('failed multi-identity unlock is atomic while an earlier independent signer stays usable',async()=>{
 const f=fixture(),b=key(2);f.g.head(f.g.profile(b,null,'bravo-agent'));f.g.head(f.g.profile(b,null,'charlie-agent'));f.ctx=f.g.context();await unlock(f);
 const before=JSON.stringify(f.provider.catalog()),original=f.subtle.sign;let proofs=0;
 f.subtle.sign=async(...args)=>{if(++proofs===2)throw Error('Second possession proof failed');return original(...args);};
 await assert.rejects(f.provider.unlock(f.C.canonical(b.jwk),f.ctx),/Second possession proof failed/);
 assert.equal(JSON.stringify(f.provider.catalog()),before);
 f.subtle.sign=original;await f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('earlier signer survives'));
});
test('catalog permits32 identities, refuses33 atomically, and keeps existing bindings usable',async()=>{
 const {C}=harness(),g=graph(C),k=key(1),provider=new C.Provider();
 for(let i=0;i<32;i++)g.head(g.profile(k,null,'alias-agent-'+String(i).padStart(2,'0')));
 const ctx=g.context();await provider.unlock(C.canonical(k.jwk),ctx);assert.equal(provider.catalog().length,32);
 g.head(g.profile(k,null,'overflow-agent'));const overflow=g.context(),empty=new C.Provider();
 await assert.rejects(empty.unlock(C.canonical(k.jwk),overflow),/catalog budget/);assert.equal(empty.catalog().length,0);
 await assert.rejects(provider.unlock(C.canonical(k.jwk),overflow),/catalog budget/);assert.equal(provider.catalog().length,32);
 await provider.sign('alias-agent-00',ctx,C.TYPES.message,C.bytes('still usable at capacity'));
});
test('private JWK byte cap accepts16KiB of valid JSON and rejects one byte more',async()=>{
 const f=fixture(),json=JSON.stringify(f.a.key.jwk),raw=f.C.bytes(json+' '.repeat(16384-json.length));
 await f.provider.unlock(raw,f.ctx);assert.equal(f.provider.catalog().length,1);
 await assert.rejects(new f.C.Provider().unlock(f.C.bytes(json+' '.repeat(16385-json.length)),f.ctx),/Invalid private JWK/);
});
test('expiry while local signature verification awaits crypto cannot return or renew capability',async()=>{
 const f=fixture();await unlock(f);f.clock.value=899999;const wait=gate(),original=f.subtle.digest;
 f.subtle.digest=async(...args)=>{wait.enter();await wait.released;return original(...args);};
 const pending=assert.rejects(f.provider.sign(f.a.snapshot.id,f.ctx,f.C.TYPES.message,f.C.bytes('late verification')),/locked/);
 await wait.entered;f.clock.value=900000;wait.release();await pending;assert.equal(f.provider.catalog().length,0);
});
