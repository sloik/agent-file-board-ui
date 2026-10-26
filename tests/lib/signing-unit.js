'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('esbuild');
const source=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../../scripts/signing-contract.js')],bundle:true,write:false,format:'iife',globalName:'SigningContract',target:'es2022'}).outputFiles[0].text;
const BOARD='2cda5aba-086d-46db-bfaf-46c51676f8bb';
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function harness(){
 const clock={value:0},subtle={};
 for(const name of ['digest','importKey','sign'])subtle[name]=crypto.webcrypto.subtle[name].bind(crypto.webcrypto.subtle);
 const sandbox={crypto:{subtle,getRandomValues:crypto.webcrypto.getRandomValues.bind(crypto.webcrypto)},performance:{now:()=>clock.value},TextEncoder,TextDecoder,Uint8Array,btoa,atob,console};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {C:sandbox.SigningContract,sandbox,clock,subtle};
}
function key(seed){
 const bytes=Buffer.alloc(32,seed),privateKey=crypto.createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),bytes]),format:'der',type:'pkcs8'});
 const pub=crypto.createPublicKey(privateKey).export({format:'jwk'}),jwk={kty:pub.kty,crv:pub.crv,x:pub.x};
 return {privateKey,descriptor:{format:'jwk',algorithm:'Ed25519',key:jwk},jwk:{...jwk,d:bytes.toString('base64url')}};
}
function graph(C){
 const files=new Map(),config={identity:{boardId:BOARD},board:{direct_directory:'direct',thread_digits:3}},registry={participants:[]};
 const seal=(type,value,signers)=>{
  const payload=typeof value==='string'?Buffer.from(value):Buffer.from(JSON.stringify(value));
  return Buffer.from(JSON.stringify({payloadType:type,payload:payload.toString('base64'),signatures:signers.map(k=>({keyid:'untrusted-hint',sig:crypto.sign(null,C.pae(type,payload),k.privateKey).toString('base64')}))}));
 };
 const profile=(k,previous=null,id='test-agent-01',extra={})=>{
  const snapshot={id,kind:'agent',name:'Test agent',...extra},raw=seal(C.TYPES.profile,{version:1,boardId:BOARD,previous,participant:snapshot,publicKey:k.descriptor},[k]),ref=digest(raw);
  files.set('identity/profiles/'+ref+'.json',raw);return {raw,digest:ref,snapshot,key:k};
 };
 const head=(p,events=[])=>{
  const person={...p.snapshot,identity:{version:1,profile:p.digest,events:[...events].sort()}},i=registry.participants.findIndex(x=>x.id===p.snapshot.id);
  if(i<0)registry.participants.push(person);else registry.participants[i]=person;
 };
 const event=(type,value,keys)=>{const raw=seal(type,value,keys),ref=digest(raw);files.set('identity/events/'+ref+'.json',raw);return ref;};
 const transition=(old,next,keys=[old.key,next.key])=>event(C.TYPES.transition,{version:1,boardId:BOARD,participant:old.snapshot.id,fromProfile:old.digest,toProfile:next.digest},keys);
 const context=state=>new C.Context(clone(config),clone(registry),async p=>files.get(p)||null,state);
 const message=(p)=>{
  const path='rooms/general/2026-10-21_1200_'+p.snapshot.id+'_T001_proof.txt',record='sig_18b6c9f2-13c4-4b59-aa77-6687e0713771',headers={FROM:p.snapshot.id,THREAD:'T001-proof',SIGNATURE:JSON.stringify({version:1,record})};
  const raw=Buffer.from(`FROM: ${headers.FROM}\nTO: all\nSCOPE: ROOM\nROOM: general\nTHREAD: T001-proof\nDATE: 2026-10-21 12:00\nREPLY-TO: -\nSTATUS: INFO\nSIGNATURE: ${headers.SIGNATURE}\n---\nExact bytes 🐈\n`);
  const statement={version:1,boardId:BOARD,participant:p.snapshot.id,profile:p.digest,target:{kind:'message',path,sha256:digest(raw),bytes:raw.length}};
  const envelope=seal(C.TYPES.message,statement,[p.key]);files.set('rooms/general/.signatures/'+record+'.json',envelope);
  return {raw,path,headers,statement,envelope,verification:{boardId:BOARD,participant:p.snapshot.id,profile:p.digest,path}};
 };
 return {files,config,registry,seal,profile,head,event,transition,context,message};
}
function gate(){let enter,release;return {entered:new Promise(r=>enter=r),released:new Promise(r=>release=r),enter:()=>enter(),release:()=>release()};}
module.exports={harness,graph,key,gate,clone,digest,BOARD};
