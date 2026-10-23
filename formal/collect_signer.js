'use strict';
/* Observe production Provider, signingDelivery, writer and composer functions.
   Instrumentation only reports boundaries; TLC owns the transition oracle. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('esbuild'),assert=require('node:assert/strict');
const {graph,key}=require('../tests/lib/signing-unit');
const root=path.resolve(__dirname,'..'),set=values=>({$set:[...values]}),clone=value=>JSON.parse(JSON.stringify(value));
function replace(source,before,after){assert.equal(source.split(before).length,2,'instrumentation anchor must be unique: '+before);return source.replace(before,after);}
function instrument(mutation){
 let source=fs.readFileSync(path.join(root,'scripts/signing-contract.js'),'utf8');
 if(mutation==='partial')source=replace(source,'await this.#prove(key, binding, board, epoch);','await this.#prove(key, binding, board, epoch); this.#keys.set(binding.participant, { ...binding, key });');
 if(mutation==='epoch'){
  source=replace(source,'require(epoch === this.#epoch && this.#keys.get(participant) === binding, "signer locked during operation");','/* planted stale-return defect */');
  source=replace(source,'require(epoch === this.#epoch && this.#keys.get(participant) === binding, "signer locked during verification");','/* planted stale-return defect */');
 }
 const edits=[
  ['this.#board = null;\n  }','this.#board = null;\n    globalThis.observe("invalidate", this);\n  }'],
  ['const epoch = this.#epoch, board = context.boardId;','const epoch = this.#epoch, board = context.boardId; globalThis.observe("unlock-start", this);'],
  ['require(epoch === this.#epoch, "signer locked");\n    const matches','require(epoch === this.#epoch, "signer locked"); globalThis.observe("unlock-imported", this);\n    const matches'],
  ['for (const binding of matches) {','globalThis.observe("unlock-resolved", this);\n    for (const binding of matches) {'],
  ['require(epoch === this.#epoch, "signer locked");\n    }','require(epoch === this.#epoch, "signer locked"); globalThis.observe("proof", this, binding.participant);\n    }'],
  ['return this.catalog();','globalThis.observe("installed", this); return this.catalog();'],
  ['require(binding && context.boardId === this.#board, "unlock a registered signing identity");','require(binding && context.boardId === this.#board, "unlock a registered signing identity"); globalThis.observe("sign-start", this);'],
  ['const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", binding.key, pae(type, payload)));','globalThis.observe("sign-resolved", this); const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", binding.key, pae(type, payload))); globalThis.observe("signed", this);'],
  ['this.#activity = performance.now();\n    return result;','globalThis.observe("verified", this); this.#activity = performance.now();\n    globalThis.observe("returned", this); return result;']
 ];
 for(const [before,after] of edits)source=replace(source,before,after);
 return esbuild.buildSync({stdin:{contents:source,resolveDir:path.join(root,'scripts'),sourcefile:'signing-contract.js'},bundle:true,write:false,format:'iife',globalName:'SigningContract',target:'es2022'}).outputFiles[0].text;
}
async function scenario(kind,mutation=''){
 let recording=false,reason='lock',provider,s,states,proofs=0;
 const clock={value:0},subtle={};
 for(const name of ['digest','importKey','sign'])subtle[name]=crypto.webcrypto.subtle[name].bind(crypto.webcrypto.subtle);
 const sandbox={crypto:{subtle,getRandomValues:crypto.webcrypto.getRandomValues.bind(crypto.webcrypto),randomUUID:crypto.randomUUID},performance:{now:()=>clock.value},TextEncoder,TextDecoder,Uint8Array,btoa,atob,console,structuredClone};
 const labels=new Map();
 function catalog(p){return set(p.catalog().map(b=>labels.get(b.participant)));}
 function record(){states.push(clone(s));}
 sandbox.observe=(event,p,participant)=>{
  if(!recording)return;
  if(event==='invalidate'){
   assert(!s.invalidations.$set.includes(reason),'bounded invalidation reason reused');
   s.invalidations.$set.push(reason);s.catalog=catalog(p);
   if(reason==='board')s.board=1;if(reason==='key')s.head=1;
  }else if(event==='unlock-start'){s.unlockEpoch=p.generation;s.unlockPc='import';}
  else if(event==='unlock-imported')s.unlockPc='resolve';
  else if(event==='unlock-resolved')s.unlockPc='proveA';
  else if(event==='proof'){s.proved.$set.push(labels.get(participant));s.unlockPc=s.proved.$set.length===1?'proveB':'install';s.catalog=catalog(p);}
  else if(event==='installed'){s.unlockPc='done';s.catalog=catalog(p);}
  else if(event==='sign-start'){s.signPc='resolve';s.signEpoch=p.generation;s.deliveryEpoch=p.generation;s.reviewedBoard=s.board;s.reviewedHead=s.head;}
  else if(event==='sign-resolved')s.signPc='crypto';
  else if(event==='signed')s.signPc='verify';
  else if(event==='verified')s.signPc='return';
  else if(event==='returned'){s.signPc='done';s.returned=true;s.badReturn=s.signEpoch!==p.generation||!p.catalog().some(b=>labels.get(b.participant)==='A');}
  else throw Error('unknown observation '+event);
  record();
 };
 vm.createContext(sandbox);vm.runInContext(instrument(mutation),sandbox);
 const C=sandbox.SigningContract,g=graph(C),existing=g.profile(key(1),null,'existing-agent'),shared=key(2),a=g.profile(shared,null,'alpha-agent'),b=g.profile(shared,null,'bravo-agent');
 g.head(existing);g.head(a);g.head(b);
 labels.set(existing.snapshot.id,'existing');labels.set(a.snapshot.id,'A');labels.set(b.snapshot.id,'B');
 // Evaluate the production delivery module with the same Provider instance.
 let deliverySource=fs.readFileSync(path.join(root,'scripts/signing-ui.js'),'utf8');
 if(mutation==='guard'){
  const checks=/C\.require\(origin === dirHandle[^\n]+, "Posting context changed; draft preserved"\);/g;
  assert.equal([...deliverySource.matchAll(checks)].length,2,'mutate exactly the two signed delivery guard checks');
  deliverySource=deliverySource.replace(checks,'C.require(true, "Posting context changed; draft preserved");');
 }
 // Delivery derives its send decision from the production composer status function.
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/signing-help.js'),'utf8')+'\n'+deliverySource+';globalThis.traceProvider=signingProvider;',sandbox);
 provider=sandbox.traceProvider;
 let context=g.context();await provider.unlock(C.canonical(existing.key.jwk),context);
 s={catalog:set(['existing']),invalidations:set([]),unlockEpoch:0,unlockPc:'start',proved:set([]),signEpoch:0,signPc:'start',returned:false,badReturn:false,publishPc:'start',deliveryEpoch:0,board:0,head:0,reviewedBoard:0,reviewedHead:0,draft:0,buffer:0,authorized:false,badAuthorization:false,published:false,completed:false};states=[clone(s)];recording=true;
 const rawSign=subtle.sign;
 const rawImport=subtle.importKey;
 subtle.importKey=async(...args)=>{
  if(kind==='lock during import'&&s.unlockPc==='import'){reason='lock';provider.lock();}
  return rawImport(...args);
 };
 subtle.sign=async(...args)=>{
  if(s.unlockPc!=='done'){
   proofs++;
   if(kind==='lock during second proof'&&proofs===2){reason='lock';provider.lock();}
   if((kind==='atomic failed second binding'||mutation==='partial')&&proofs===2)throw Error('owned second proof failure');
  }else if(s.signPc==='crypto'){
   if(kind==='crypto failure')throw Error('owned message crypto failure');
   if(kind==='lock during signing'||mutation==='epoch'){reason='lock';provider.lock();}
   if(kind==='expiry during signing'){reason='expiry';clock.value=900000;provider.expire();}
  }
  return rawSign(...args);
 };
 try{await provider.unlock(C.canonical(shared.jwk),context);}
 catch(error){s.unlockPc='failed';s.catalog=catalog(provider);record();assert.equal(proofs,kind==='lock during import'?0:2);if(!mutation)assert.deepEqual(s.catalog.$set,kind.startsWith('lock during')?[]:['existing']);return {model:'Signer',scenario:mutation?'signer mutant: partial unlock':'signer: '+kind,states};}
 assert.deepEqual([...s.catalog.$set].sort(),['A','B','existing']);
 if(['lock during signing','expiry during signing','crypto failure'].includes(kind)||mutation==='epoch'){
  let escaped=false;
  try{await provider.sign(a.snapshot.id,context,C.TYPES.message,C.bytes('owned trace'));escaped=true;}
  catch(error){s.signPc='refused';record();}
  assert.equal(escaped,mutation==='epoch','returned/refused signature witness missing');
  return {model:'Signer',scenario:mutation?'signer mutant: stale signature':'signer: '+kind,states};
 }
 const fields=Object.fromEntries(['cWhere','cNewRoom','cThread','cNewThread','cBody','cTo','cStatus','cLang','cContentType'].map(id=>[id,{id,name:id,value:'',checked:false,focus(){}}]));
 Object.assign(fields.cWhere,{value:'room:general'});fields.cThread.value='thread';fields.cBody.value='original draft';fields.cTo.value='all';fields.cStatus.value='INFO';
 const initialDir={},model={msgs:[],signingContext:context,signingExpected:'null'},fileBytes=new Map();let guardCalls=0,guardRefused=false;
 const directory={async getDirectoryHandle(){return directory;},async getFileHandle(name){
  if(s.publishPc==='start'){s.publishPc='acquire';record();}
  const handle={async createWritable(){s.publishPc='write';record();return {
   async write(raw){fileBytes.set('pending',raw);s.publishPc='guard';record();
    if(kind==='board change before guard'||mutation==='guard'){reason='board';sandbox.dirHandle={};provider.lock();}
    if(kind==='key change before guard'){reason='key';g.head(g.profile(key(3),null,a.snapshot.id));await provider.reconcile(g.context());}
   },
   async close(){
    if(kind==='newer draft during close'||mutation==='draft'){fields.cBody.value='newer draft';s.draft=1;s.buffer=1;record();}
    fileBytes.set('committed',fileBytes.get('pending'));s.published=true;s.publishPc='committed';record();
   },async abort(){fileBytes.delete('pending');}
  };},async isSameEntry(other){return other===handle;},async getFile(){return {size:fileBytes.get('committed')?.length||0};}};return handle;
 },async removeEntry(){}};
 Object.assign(sandbox,{B:model,baseHandle:null,dirHandle:initialDir,composerStructured:null,document:{querySelectorAll:()=>Object.values(fields)},$:selector=>fields[selector.slice(1)],currentUser:()=>a.snapshot.id,guardRegistered:()=>({kind:'agent',name:'Synthetic'}),window:{confirm:()=>true},slugify:value=>value,threadsOf:()=>({thread:{tid:'T001',label:'trace'}}),structuredComposerPayload:()=>({}),replyTo:null,
  parseHeaders:text=>({native:{h:Object.fromEntries(text.split('\n').filter(l=>l.includes(': ')).map(l=>[l.slice(0,l.indexOf(': ')),l.slice(l.indexOf(': ')+2)]))}}),
  composeMessage:o=>({relPath:'rooms/general/2026-10-22_1200_alpha-agent_T001_trace.txt',text:`FROM: ${o.sender}\nTO: all\nSCOPE: ROOM\nROOM: general\nTHREAD: T001-trace\nDATE: 2026-10-22 12:00\nREPLY-TO: -\nSTATUS: INFO\n---\n${o.body}\n`}),
  canWrite:()=>true,guardWritePath:()=>{},guardNoOverwrite:async()=>{},boardErr:message=>Error(message),t:(k,v)=>v?.m||k,exText:x=>x,toast:()=>{},clearStructuredAttachment:()=>{},clearReply:()=>{},syncLang:()=>{}});
 vm.runInContext(`signingMode='signed';`,sandbox);
 let html=fs.readFileSync(path.join(root,'board.html'),'utf8');
 const writer=html.slice(html.indexOf('async function writeNewFileImpl('),html.indexOf('/* ===== reading ===== */'));
 let send=html.slice(html.indexOf('async function sendImpl(){'),html.indexOf('/* ===== search ===== */'));
 if(mutation==='draft')send=replace(send,'if(submittedDraft!==signingDraftStamp())','if(false)');
 vm.runInContext(writer+'\n'+send,sandbox);
 sandbox.deliverMessage=async msg=>{
  const delivery=await vm.runInContext('signingDelivery',sandbox)(msg);
  const guard=async()=>{
   guardCalls++;const final=guardCalls===2;
   let accepted=false;
   try{await delivery.guard();accepted=true;}
   finally{if(final){s.authorized=accepted;s.badAuthorization=accepted&&(s.deliveryEpoch!==provider.generation||s.reviewedBoard!==s.board||s.reviewedHead!==s.head||s.draft!==0);s.publishPc=accepted?'closing':'refused';guardRefused=!accepted;record();}}
  };
  await vm.runInContext('writeNewFileImpl',sandbox)(msg.relPath,delivery.msg.text,directory,'message',guard);
 };
 await vm.runInContext('sendImpl()',sandbox);
 if(s.published){s.completed=true;s.publishPc='done';s.buffer=fields.cBody.value==='newer draft'?1:2;record();}
 if(kind.includes('change before guard')&&!mutation){assert(guardRefused&&!fileBytes.has('committed'),'final guard refusal witness missing');}
 else {assert(fileBytes.has('committed'),'successful close witness missing');assert.equal(fields.cBody.value,mutation==='draft'?'':kind==='newer draft during close'?'newer draft':'');}
 return {model:'Signer',scenario:mutation?({guard:'signer mutant: skipped delivery guard',draft:'signer mutant: erased newer draft'}[mutation]):'signer: '+kind,states};
}
async function traces(mutant=false){
 const cases=mutant?[['atomic failed second binding','partial'],['lock during signing','epoch'],['board change before guard','guard'],['newer draft during close','draft']]:[
  ['successful publish and completion'],['atomic failed second binding'],['lock during import'],['lock during second proof'],['lock during signing'],['expiry during signing'],['board change before guard'],['key change before guard'],['newer draft during close'],['crypto failure']];
 const out=[];for(const args of cases)out.push(await scenario(...args));return out;
}
module.exports={traces,scenario};
if(require.main===module)traces(process.argv.includes('--mutant')).then(t=>process.stdout.write(JSON.stringify(t))).catch(e=>{console.error(e);process.exitCode=1;});
