'use strict';
// AC1/AC2: the browser rules must agree with the canonical frozen vectors, exactly.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load}=require('./lib/history-unit');
const VECTORS=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vendor/agent-file-board/tests/fixtures/room-history/vectors.json'),'utf8'));
const {C,H}=load();
const config={board:{direct_directory:VECTORS.directDirectory}};
const raw=value=>Uint8Array.from(Buffer.from(value,'base64'));
async function verify(envelope){
 const profile=await C.verifyProfile(raw(VECTORS.profileEnvelopeBase64),VECTORS.profileSha256,VECTORS.boardId,VECTORS.participant);
 const parsed=H.parseInventory(envelope);
 H.checkStatement(parsed.statement,VECTORS.boardId,config,VECTORS.scope);
 await H.verifySignature(parsed,profile.descriptor);
}
test('inventory vectors: every frozen vector gives the canonical verdict',async()=>{
 assert.ok(VECTORS.inventories.filter(v=>v.expect==='invalid').length>=10);
 let passed=0;
 for(const vector of VECTORS.inventories){
  if(vector.expect==='valid')await verify(raw(vector.envelopeBase64));
  else await assert.rejects(verify(raw(vector.envelopeBase64)),e=>typeof e?.message==='string'&&e.message.length>0,vector.name);
  passed++;
 }
 assert.equal(passed,VECTORS.inventories.length);
 console.log(`inventory vectors passed: ${passed}/${VECTORS.inventories.length}`);
});
test('status vectors: precedence tables and every frozen status case match',()=>{
 assert.deepEqual([...H.OBSERVED],VECTORS.observedPrecedence);
 assert.deepEqual([...H.SOURCE],VECTORS.sourcePrecedence);
 let passed=0;
 for(const vector of VECTORS.statuses){
  const row=H.entryRow({path:'x.txt',commitments:vector.commitments,statuses:vector.sourceStatus,current:vector.current,sidecars:vector.sidecars,
   ack:vector.acknowledgement?{superseded:vector.acknowledgement.superseded,reviewedMatches:vector.acknowledgement.reviewedMatches}:null});
  assert.deepEqual({observed:row.observed,source:row.source,needsAttention:row.needsAttention,neutral:row.neutral},vector.expect,vector.name);
  passed++;
 }
 assert.equal(passed,VECTORS.statuses.length);
 console.log(`status vectors passed: ${passed}/${VECTORS.statuses.length}`);
});
test('a message-sized inventory above the 64 KiB envelope default still parses and verifies',async()=>{
 // The generic envelope reader would refuse this; inventories may use up to 768 KiB.
 const crypto=require('node:crypto'),seed=Buffer.alloc(32,7);
 const key=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
 const pub=crypto.createPublicKey(key).export({format:'jwk'}),descriptor={format:'jwk',algorithm:'Ed25519',key:{kty:pub.kty,crv:pub.crv,x:pub.x}};
 const entries=Array.from({length:600},(_,i)=>({path:`rooms/general/2026-10-23_0900_test-agent-01_T001_${String(i).padStart(4,'0')}-${'x'.repeat(60)}.txt`,sha256:'a'.repeat(64),bytes:10,signature:null}));
 const statement={version:1,boardId:VECTORS.boardId,participant:VECTORS.participant,profile:VECTORS.profileSha256,scope:VECTORS.scope,previous:[],entries};
 const payload=Buffer.from(JSON.stringify(statement)),type='application/vnd.agent-file-board.inventory.ed25519.v1+json';
 const envelope=Buffer.from(JSON.stringify({payloadType:type,payload:payload.toString('base64'),signatures:[{keyid:'x',sig:crypto.sign(null,C.pae(type,payload),key).toString('base64')}]}));
 assert.ok(envelope.length>65536&&envelope.length<786432);
 const parsed=H.parseInventory(Uint8Array.from(envelope));
 H.checkStatement(parsed.statement,VECTORS.boardId,config,VECTORS.scope);
 assert.equal(await H.verifySignature(parsed,descriptor).then(()=>true),true);
 assert.equal(parsed.statement.entries.length,600);
});
test('float-valued version and byte counts are refused like the canonical integer-only rule',()=>{
 const make=text=>{const payload=Buffer.from(text),type='application/vnd.agent-file-board.inventory.ed25519.v1+json';return Uint8Array.from(Buffer.from(JSON.stringify({payloadType:type,payload:payload.toString('base64'),signatures:[{keyid:'x',sig:Buffer.alloc(64).toString('base64')}]})));};
 const base=`{"boardId":"${VECTORS.boardId}","entries":[{"bytes":10,"path":"rooms/general/a.txt","sha256":"${'a'.repeat(64)}","signature":null}],"participant":"${VECTORS.participant}","previous":[],"profile":"${VECTORS.profileSha256}","scope":"rooms/general","version":1}`;
 H.checkStatement(H.parseInventory(make(base)).statement,VECTORS.boardId,config,VECTORS.scope);
 assert.throws(()=>H.checkStatement(H.parseInventory(make(base.replace('"version":1','"version":1.0'))).statement,VECTORS.boardId,config,VECTORS.scope),/version/);
 assert.throws(()=>H.checkStatement(H.parseInventory(make(base.replace('"bytes":10','"bytes":10.0'))).statement,VECTORS.boardId,config,VECTORS.scope),/byte count/);
});
