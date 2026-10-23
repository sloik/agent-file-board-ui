'use strict';
/* Drive the production composer status function (signingComposerStatus in
   scripts/signing-help.js) through host-shaped composer events. The collector only
   changes host inputs and records the real function's answer; ComposerSigning.tla's
   Initial/Step/Safe are the oracle (TLC), not a JavaScript copy of them. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),set=values=>({$set:[...values].sort()});
const ID={A:'alpha-agent',B:'bravo-agent',C:'charlie-agent',none:''},NAME={A:'Alpha',B:'Bravo',C:'Charlie',none:''},KEYS=['A','B'];
const NO_POST={made:false,persona:'none',signer:'none',signed:false,required:false,mode:'none',status:'none',gate:'none'};
const NO_UNLOCK={made:false,key:'none',before:'none',bound:false};
function replace(source,before,after){assert.equal(source.split(before).length,2,'mutation anchor must be unique: '+before);return source.replace(before,after);}
function production(mutation){
 let source=fs.readFileSync(path.join(root,'scripts/signing-help.js'),'utf8');
 if(mutation==='persona')source=replace(source,'if (!catalog.includes(who)) {','if (!catalog.length) {');
 if(mutation==='fallback')source=replace(source,'if (s.mode !== "signed" && !s.required) {','if (!s.required) {');
 if(mutation==='approval')source=replace(source,'if (s.required && p.fingerprint && pins[who] !== p.fingerprint) {','if (false) {');
 if(mutation==='changed')source=replace(source,'if (s.required && p.fingerprint && pins[who] && pins[who] !== p.fingerprint) {','if (false) {');
 if(mutation==='revoked')source=replace(source,'if (p.revoked) {','if (false) {');
 const context=vm.createContext({exText:(en)=>en});
 vm.runInContext(source+';this.api={signingComposerStatus,SIGNING_COMPOSER_ORDER};',context);
 return context.api;
}
// Host inputs: what the viewer passes to signingComposerStatus. Fingerprint generations
// model rotation; approvals and unlock-time fingerprints keep the value they were made for.
function host(init){
 return {persona:init.persona||'A',mode:init.mode||'unsigned',required:!!init.required,writable:init.writable!==false,error:init.error?'Private signing context changed in another tab':'',
  catalog:new Set(),gen:{A:0,B:0},known:{},pins:{...(init.pins||{})},revoked:new Set()};
}
const fp=(h,k)=>'ed25519:'+k+h.gen[k];
function input(h){
 const participants={},known={},pins={};
 for(const k of KEYS)participants[ID[k]]={fingerprint:fp(h,k),...(h.revoked.has(k)?{revoked:{reason:'retired'}}:{})};
 participants[ID.C]={unregistered:true};
 for(const [k,v] of Object.entries(h.known))known[ID[k]]=v;
 for(const [k,v] of Object.entries(h.pins))pins[ID[k]]=v;
 return {error:h.error,hasContext:true,writable:h.writable,required:h.required,mode:h.mode,persona:ID[h.persona],name:NAME[h.persona],
  catalog:KEYS.filter(k=>h.catalog.has(k)).map(k=>ID[k]),known,participants,pins};
}
function trace(scenario,init,actions,mutation=''){
 const api=production(mutation),h=host(init);
 // Initial approvals were given for the current key.
 for(const k of Object.keys(h.pins))h.pins[k]=fp(h,k);
 const status=()=>{const r=api.signingComposerStatus(input(h));assert(r&&api.SIGNING_COMPOSER_ORDER.includes(r.id),'status must be one of SIGNING_COMPOSER_ORDER');return r.id;};
 let shown=status(),stale=false,post=NO_POST,unlock=NO_UNLOCK;
 const observe=()=>({persona:h.persona,signer:h.persona,catalog:set(h.catalog),mode:h.mode,required:h.required,
  pins:set(KEYS.filter(k=>h.pins[k]===fp(h,k))),oldPins:set(KEYS.filter(k=>k in h.pins&&h.pins[k]!==fp(h,k))),known:set(KEYS.filter(k=>k in h.known)),
  rotated:set(KEYS.filter(k=>k in h.known&&h.known[k]!==fp(h,k))),revoked:set(h.revoked),writable:h.writable,error:!!h.error,
  shown,stale,post,unlock,progress:0});
 const states=[observe()];
 for(const action of actions){
  const [verb,arg]=action.split(' ');post=NO_POST;unlock=NO_UNLOCK;
  if(verb==='select')h.persona=arg;
  else if(verb==='destination')h.required=!h.required;
  else if(verb==='unlock'){
   assert(!h.revoked.has(arg)&&!h.error,'a revoked key or missing signing context cannot unlock');
   const bound=arg===h.persona;h.catalog.add(arg);h.known[arg]=fp(h,arg);if(bound)h.mode='signed';
   unlock={made:true,key:arg,before:h.persona,bound};
  }
  else if(verb==='lock'||verb==='expire'){assert(h.catalog.size,'nothing unlocked');h.catalog.clear();}
  else if(verb==='approve'){assert(KEYS.includes(h.persona)&&!h.revoked.has(h.persona),'approve the persona key');h.pins[h.persona]=fp(h,h.persona);}
  else if(verb==='unsigned'){assert(!h.required&&h.mode==='signed','unsigned is offered only where allowed');h.mode='unsigned';}
  else if(verb==='signed'){assert(h.mode==='unsigned');h.mode='signed';}
  else if(verb==='sign'){assert(h.mode==='unsigned'&&!h.required&&h.catalog.has(h.persona),'the composer offers to turn signing on only for an unlocked persona key');h.mode='signed';}
  else if(verb==='revoke'){assert(!h.revoked.has(arg));h.revoked.add(arg);h.catalog.delete(arg);}
  else if(verb==='rotate'){assert(!h.revoked.has(arg));h.gen[arg]++;h.catalog.delete(arg);}
  else if(verb==='fault')h.error=h.error?'':'Private signing context changed in another tab';
  else if(verb==='reopen'){h.writable=!h.writable;h.catalog.clear();}
  else if(verb==='send'){
   // Send recomputes the status now; it never trusts what the composer showed earlier.
   const gate=status(),signed=gate==='signed';
   if(gate==='signed'||gate==='unsigned')post={made:true,persona:h.persona,signer:signed?h.persona:'none',signed,required:h.required,mode:h.mode,status:gate,gate};
  }
  else if(verb!=='tick')throw Error('unknown composer action '+action);
  // Expiry happens on a timer; the composer learns about it on the next tick or event.
  if(verb==='expire')stale=true;else{shown=status();stale=false;}
  states.push(observe());
 }
 return {model:'ComposerSigning',scenario,states};
}
function scenarios(){
 return [
  ['composer: unlock persona key, turn signing on and post signed',{},['unlock A','send','lock','send','select B','unlock A','unsigned','select A','send','sign','send']],
  ['composer: other participant key never binds',{mode:'signed'},['unlock B','send','select B','send','select A','send']],
  ['composer: switching to a locked persona blocks signed posting',{},['unlock A','select B','send','select A','send']],
  ['composer: expiry is rechecked at send',{},['unlock A','expire','send','unlock A','expire','tick','send']],
  ['composer: required destination needs approval',{required:true},['unlock A','send','approve','send','destination','send','unsigned','send']],
  ['composer: no unsigned fallback in signed mode or required room',{},['signed','send','unsigned','send','destination','send','unlock A','send']],
  ['composer: read-only folder',{required:true,writable:false},['send','reopen','unlock A','approve','send','reopen','send']],
  ['composer: no persona or unregistered persona',{persona:'none',required:true},['send','unlock A','send','select C','send','select A','approve','send','select C','send','select none','destination','send']],
  ['composer: revoked key',{persona:'B',mode:'signed'},['unlock B','send','revoke B','send','select A','unlock A','send']],
  ['composer: rotated key needs the new key and a fresh review',{required:true,pins:{A:true}},['unlock A','send','rotate A','send','unlock A','send','approve','send']],
  ['composer: signing unavailable',{mode:'signed'},['unlock A','fault','send','fault','send']],
  ['composer: every status in one session',{},['fault','fault','destination','select none','select A','reopen','reopen','select C','select A','unlock A','approve','send','rotate A','unlock A','select B','revoke B','select A','destination','unsigned','send']]
 ];
}
// Deterministic schedules of currently enabled composer events, replayable by seed.
function schedules(){
 return Array.from({length:8},(_,seed)=>{
  let x=seed*2654435761+12345>>>0;const rand=n=>{x=(Math.imul(x,1103515245)+12345)>>>0;return (x>>>8)%n;};
  const h={persona:['A','B','C'][seed%3],mode:seed&1?'signed':'unsigned',required:!!(seed&2),writable:seed!==5,error:false,catalog:new Set(),revoked:new Set(),pinned:new Set(seed&4?['A']:[])};
  const init={persona:h.persona,mode:h.mode,required:h.required,writable:h.writable,pins:seed&4?{A:true}:{}},actions=[];
  while(actions.length<40){
   const options=['select A','select B','select C','select none','destination','tick','send','send','send'].filter(a=>a!=='select '+h.persona);
   // Faults and read-only reopening are rarer, and always undone soon, so posts stay reachable.
   if(h.error||!h.writable||rand(8)===0)options.push(h.error?'fault':'reopen',h.error?'fault':'reopen');
   if(!h.error&&h.writable&&rand(8)===0)options.push('fault');
   if(!h.error)for(const k of KEYS)if(!h.revoked.has(k))options.push('unlock '+k,'unlock '+k);
   if(h.catalog.size)options.push('lock','expire');
   if(KEYS.includes(h.persona)&&!h.revoked.has(h.persona)&&!h.pinned.has(h.persona))options.push('approve');
   if(!h.required&&h.mode==='signed')options.push('unsigned');
   if(h.mode==='unsigned')options.push('signed');
   if(h.mode==='unsigned'&&!h.required&&h.catalog.has(h.persona))options.push('sign');
   for(const k of KEYS)if(!h.revoked.has(k)&&rand(4)===0)options.push('rotate '+k);
   if(actions.length>20)for(const k of KEYS)if(!h.revoked.has(k)&&rand(6)===0)options.push('revoke '+k);
   const action=options[rand(options.length)],[verb,arg]=action.split(' ');actions.push(action);
   if(verb==='select')h.persona=arg;else if(verb==='destination')h.required=!h.required;else if(verb==='fault')h.error=!h.error;
   else if(verb==='reopen'){h.writable=!h.writable;h.catalog.clear();}else if(verb==='unlock'){h.catalog.add(arg);if(arg===h.persona)h.mode='signed';}
   else if(verb==='lock'||verb==='expire')h.catalog.clear();else if(verb==='approve')h.pinned.add(h.persona);
   else if(verb==='unsigned')h.mode='unsigned';else if(verb==='signed'||verb==='sign')h.mode='signed';
   else if(verb==='revoke'){h.revoked.add(arg);h.catalog.delete(arg);}else if(verb==='rotate'){h.catalog.delete(arg);h.pinned.delete(arg);}
  }
  return {seed,init,actions};
 });
}
function traces(mutant=false){
 if(mutant)return [
  trace('composer mutant: another unlocked key makes the persona ready',{mode:'signed'},['unlock B','send'],'persona'),
  trace('composer mutant: signed mode falls back to unsigned',{},['signed','send'],'fallback'),
  trace('composer mutant: required destination skips approval',{required:true},['unlock A','send'],'approval'),
  trace('composer mutant: changed key treated as never approved',{required:true,pins:{A:true}},['unlock A','rotate A','unlock A','send'],'changed'),
  trace('composer mutant: revoked key is ignored',{persona:'B',mode:'signed'},['unlock B','revoke B','send'],'revoked')
 ];
 const fixed=scenarios().map(([name,init,actions])=>trace(name,init,actions));
 const generated=schedules().map(({seed,init,actions})=>trace('composer generated schedule '+seed,init,actions));
 // Non-vacuity: the fixed witnesses show every production status and both kinds of post.
 const seen=new Set(fixed.flatMap(t=>t.states.map(s=>s.shown)));
 assert.deepEqual([...seen].sort(),[...production('').SIGNING_COMPOSER_ORDER].sort(),'every composer status must be observed');
 const posts=fixed.flatMap(t=>t.states.map(s=>s.post).filter(p=>p.made));
 assert(posts.some(p=>p.signed)&&posts.some(p=>!p.signed),'signed and unsigned posts must both be observed');
 assert(fixed.some(t=>t.states.some((s,i)=>i&&s.stale&&t.states[i+1]&&!t.states[i+1].post.made)),'a send after expiry must be refused');
 return [...fixed,...generated];
}
if(require.main===module)process.stdout.write(JSON.stringify(traces(process.argv.includes('--mutant'))));
module.exports={traces,schedules};
