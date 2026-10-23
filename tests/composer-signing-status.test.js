'use strict';
// SPEC-002-061: one pure function decides the composer signing status; the signer is the selected persona.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
function api(pl=false){
  const c=vm.createContext({exText:(en,polish)=>pl?polish:en});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'scripts/signing-help.js'),'utf8')+';this.api={signingComposerStatus,SIGNING_COMPOSER_ORDER};',c);
  return c.api;
}
const {signingComposerStatus:status,SIGNING_COMPOSER_ORDER:ORDER}=api();
const FP='ed25519:aaaa',OLD='ed25519:old';
const base=(over={})=>({hasContext:true,writable:true,required:false,mode:'unsigned',persona:'maya',name:'Maya',catalog:[],known:{},participants:{maya:{fingerprint:FP},sam:{fingerprint:'ed25519:bbbb'}},pins:{},...over});
const id=s=>status(s)?.id;

test('every state is reachable, ordered, and carries emoji, label, detail in both languages',()=>{
  const cases={
    unavailable:base({error:'Private signing context changed in another tab'}),
    'no-persona':base({required:true,persona:'',name:''}),
    'read-only':base({writable:false,required:true}),
    'not-registered':base({required:true,participants:{maya:{unregistered:true}}}),
    'key-revoked':base({required:true,catalog:['maya'],participants:{maya:{fingerprint:FP,revoked:{reason:'retired'}}}}),
    'key-rotated':base({mode:'signed',known:{maya:OLD}}),
    'needs-unlock':base({required:true}),
    'key-changed':base({required:true,mode:'signed',catalog:['maya'],pins:{maya:OLD}}),
    'needs-approval':base({required:true,mode:'signed',catalog:['maya']}),
    signed:base({mode:'signed',catalog:['maya']}),
    unsigned:base()
  };
  assert.deepEqual(Object.keys(cases).sort(),[...ORDER].sort());
  for(const [want,s] of Object.entries(cases)){
    for(const pl of [false,true]){
      const r=api(pl).signingComposerStatus(s);
      assert.equal(r.id,want,want);
      assert.ok(r.emoji&&r.label&&r.detail,want+' has emoji, label and detail');
      assert.ok(['ok','info','warn'].includes(r.tone));
      if(r.action)assert.ok(r.action.kind&&r.action.label,want+' action is named');
    }
  }
  assert.notEqual(api(true).signingComposerStatus(cases['needs-unlock']).label,status(cases['needs-unlock']).label,'Polish text differs');
});

test('no signing context and no error shows nothing',()=>{
  assert.equal(status(base({hasContext:false})),null);
});

test('precedence: errors, then read-only, then registration, revocation, rotation, unlock, approval',()=>{
  assert.equal(id(base({error:'x',writable:false,required:true})),'unavailable');
  assert.equal(id(base({writable:false,required:true,participants:{maya:{unregistered:true}}})),'read-only');
  assert.equal(id(base({required:true,participants:{maya:{unregistered:true}}})),'not-registered');
  assert.equal(id(base({required:true,known:{maya:OLD},participants:{maya:{fingerprint:FP,revoked:{}}}})),'key-revoked');
  assert.equal(id(base({required:true,known:{maya:OLD}})),'key-rotated');
  assert.equal(id(base({required:true,known:{maya:FP}})),'needs-unlock');
  assert.equal(id(base({required:true,mode:'signed',catalog:['maya'],pins:{maya:OLD}})),'key-changed');
  assert.equal(id(base({required:true,mode:'signed',catalog:['maya']})),'needs-approval');
  assert.equal(id(base({required:true,persona:'',name:'',writable:false})),'no-persona');
  assert.equal(id(base({required:true,mode:'signed',catalog:['maya'],pins:{maya:FP}})),'signed');
});

test('the signer is the selected persona: another unlocked key never makes the persona ready',()=>{
  const s=base({mode:'signed',catalog:['sam']}),r=status(s);
  assert.equal(r.id,'needs-unlock');
  assert.equal(r.action.kind,'unlock');assert.equal(r.action.participant,'maya');
  assert.match(r.detail,/Unlocked here: sam/);
  assert.match(status({...s,names:{sam:'Sam Rivera'}}).detail,/Unlocked here: Sam Rivera\./,'display names, not ids');
  assert.equal(id(base({mode:'signed',catalog:['sam'],persona:'sam',name:'Sam'})),'signed');
});

test('no unsigned fallback: signed mode or a required destination never reports unsigned',()=>{
  for(const required of [false,true])for(const catalog of [[],['sam']])for(const writable of [false,true]){
    const r=status(base({mode:'signed',required,catalog,writable}));
    assert.notEqual(r.id,'unsigned');
    assert.equal(r.alt?.kind==='unsigned',!required&&r.id!=='signed','"post unsigned instead" is offered only where the destination allows it');
  }
  for(const mode of ['signed','unsigned'])assert.notEqual(id(base({mode,required:true,catalog:['maya'],pins:{maya:FP}})),'unsigned');
});

test('required destination with approved key is signed; optional destination does not need approval',()=>{
  assert.equal(id(base({required:true,mode:'unsigned',catalog:['maya'],pins:{maya:FP}})),'signed');
  assert.equal(id(base({required:false,mode:'signed',catalog:['maya']})),'signed');
});

test('actions point at the step that helps',()=>{
  assert.equal(status(base({required:true})).action.kind,'unlock');
  assert.equal(status(base({required:true,catalog:['maya']})).action.kind,'approve');
  assert.equal(status(base({writable:false,required:true})).action.kind,'open-folder');
  assert.equal(status(base({required:true,participants:{maya:{unregistered:true}}})).action.kind,'howto');
  assert.equal(status(base({mode:'signed',catalog:['maya']})).action.kind,'lock');
  assert.equal(status(base()).action.kind,'unlock','an optional destination still offers to sign');
  assert.equal(status(base({participants:{maya:{unregistered:true}}})).action,null,'no unlock offer without a registered key');
  assert.equal(status(base({writable:false})).action,null,'no unlock offer on a read-only folder');
});

test('each state has its own mark: a blocked state never shows an open padlock, and only needs-unlock uses the closed one',()=>{
  const marks=new Map();
  const states=[base({error:'x'}),base({required:true,persona:'',name:''}),base({writable:false,required:true}),base({required:true,participants:{maya:{unregistered:true}}}),base({required:true,participants:{maya:{fingerprint:FP,revoked:{}}}}),base({mode:'signed',known:{maya:OLD}}),base({required:true}),base({required:true,catalog:['maya'],pins:{maya:OLD}}),base({required:true,catalog:['maya']}),base({mode:'signed',catalog:['maya']}),base()];
  for(const s of states){const r=status(s);marks.set(r.id,r.emoji);}
  assert.equal(new Set(marks.values()).size,marks.size,'distinct emoji per state: '+JSON.stringify([...marks]));
  assert.ok(![...marks.values()].includes('🔓'));
});

test('a changed key is told apart from a first approval and both go to the fingerprint review',()=>{
  const changed=status(base({required:true,catalog:['maya'],pins:{maya:OLD}})),first=status(base({required:true,catalog:['maya']}));
  assert.notEqual(changed.label,first.label);
  assert.equal(changed.action.kind,'approve');assert.equal(first.action.kind,'approve');
  assert.match(changed.label,/changed/);
});

test('an unlocked key with signing off offers to turn signing on; a locked persona offers another persona in required rooms',()=>{
  const r=status(base({catalog:['maya']}));
  assert.equal(r.id,'unsigned');assert.equal(r.action.kind,'sign');assert.match(r.detail,/signing is off/);
  assert.equal(status(base({required:true})).alt.kind,'persona');
  assert.equal(status(base({required:true,persona:'',name:''})).action.kind,'persona');
});

test('a revoked key is never offered for approval; signed names the persona, not "your" key',()=>{
  const r=status(base({required:true,catalog:['maya'],participants:{maya:{fingerprint:FP,revoked:{}}}}));
  assert.equal(r.id,'key-revoked');assert.notEqual(r.action.kind,'approve');
  const signed=status(base({mode:'signed',catalog:['maya']}));
  assert.match(signed.detail,/^Maya's key/);assert.equal(signed.action.label,"Lock Maya's key");
  assert.doesNotMatch(api(true).signingComposerStatus(base({required:true})).label,/\(Maya\)/,'Polish uses "klucz: Maya", not parentheses');
});
