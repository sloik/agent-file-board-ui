'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness,graph,clone}=require('./lib/signing-unit');
const config={board:{direct_directory:'private',thread_digits:4}};
const room={version:1,scopes:{'rooms/general':{minimum:'trusted'}}};
const direct={version:1,scopes:{'private/alpha-agent--bravo-agent':{minimum:'trusted'}}};
const thread={version:1,scopes:{'rooms/review':{threads:{T0001:{minimum:'trusted'}}}}};
for(const [name,value,expected] of [
 ['board',{version:1,minimum:'trusted'},['trusted','trusted','trusted','trusted','trusted']],
 ['room',room,['trusted','trusted','optional','optional','optional']],
 ['direct',direct,['optional','optional','optional','trusted','optional']],
 ['stable thread',thread,['optional','optional','trusted','optional','optional']]
])test('policy '+name+' inheritance stays within its physical scope',()=>{
 const {C}=harness(),policy=C.policy(value,config);
 const inputs=[['rooms/general','T0001'],['rooms/general','T0002'],['rooms/review','T0001'],['private/alpha-agent--bravo-agent','T0001'],['private/alpha-agent--charlie-agent','T0001']];
 assert.deepEqual(inputs.map(([scope,tid])=>C.requirement(policy,scope,tid)),expected);
});
test('floor union is commutative, idempotent and monotonic without broadening unrelated threads',()=>{
 const {C}=harness(),a=C.policy(room,config),b=C.policy(thread,config),c=C.policy(direct,config),empty=C.policy(undefined,config);
 const both=C.mergeFloor(C.mergeFloor(a,b,config),c,config);
 assert.deepEqual(clone(both),clone(C.mergeFloor(c,C.mergeFloor(b,a,config),config)));
 assert.deepEqual(clone(C.mergeFloor(both,both,config)),clone(both));
 assert.deepEqual(clone(C.mergeFloor(both,empty,config)),clone(both));
 for(const [scope,tid,expected] of [['rooms/general','T0001','trusted'],['rooms/general','T0002','trusted'],['rooms/review','T0001','trusted'],['rooms/review','T0002','optional'],['rooms/elsewhere','T0001','optional'],['private/alpha-agent--bravo-agent','T0001','trusted'],['private/alpha-agent--charlie-agent','T0001','optional']])assert.equal(C.requirement(both,scope,tid),expected,scope+' '+tid);
});
test('adopted stable thread survives title change, shared removal and weaker replacement',()=>{
 const {C}=harness(),g=graph(C);g.config.board=config.board;g.config.message_signing=thread;
 const first=g.context();first.state.floor=C.mergeFloor(first.floor,first.shared,first.config);
 delete g.config.message_signing;const next=g.context(clone(first.state));
 for(const title of ['T0001-original','T0001-renamed'])assert.equal(next.minimum('rooms/review/a.txt',title.split('-')[0]),'trusted');
 g.config.message_signing={version:1,minimum:'optional'};const weaker=g.context(clone(first.state));
 assert.equal(weaker.minimum('rooms/review/a.txt','T0001'),'trusted');assert.equal(weaker.minimum('rooms/review/a.txt','T0002'),'optional');
});
for(const [name,value] of [
 ['room weakening',{version:1,minimum:'trusted',scopes:{'rooms/general':{minimum:'optional'}}}],
 ['thread weakening',{version:1,scopes:{'rooms/general':{minimum:'trusted',threads:{T0001:{minimum:'optional'}}}}}],
 ['wrong thread digits',{version:1,scopes:{'rooms/general':{threads:{T001:{minimum:'trusted'}}}}}],
 ['thread title as key',{version:1,scopes:{'rooms/general':{threads:{'T0001-title':{minimum:'trusted'}}}}}],
 ['unknown directory',{version:1,scopes:{'direct/alpha-agent--bravo-agent':{minimum:'trusted'}}}],
 ['path traversal',{version:1,scopes:{'rooms/../general':{minimum:'trusted'}}}],
 ['extra fields',{version:1,scopes:{'rooms/general':{surprise:true}}}]
])test('scoped policy rejects '+name,()=>{const {C}=harness();assert.throws(()=>C.policy(value,config));});
test('policy scope and thread counts accept the limit and reject one more',()=>{
 const {C}=harness(),scopes=Object.fromEntries(Array.from({length:128},(_,i)=>['rooms/room'+i,{minimum:'trusted'}]));
 assert.equal(Object.keys(C.policy({version:1,scopes},config).scopes).length,128);
 assert.throws(()=>C.policy({version:1,scopes:{...scopes,'rooms/overflow':{}}},config),/minimum\/scopes/);
 const threads=Object.fromEntries(Array.from({length:1024},(_,i)=>['T'+String(i).padStart(4,'0'),{minimum:'trusted'}]));
 assert.equal(Object.keys(C.policy({version:1,scopes:{'rooms/general':{threads}}},config).scopes['rooms/general'].threads).length,1024);
 assert.throws(()=>C.policy({version:1,scopes:{'rooms/general':{threads:{...threads,T1024:{minimum:'trusted'}}}}},config),/weakening/);
 const left=C.policy({version:1,scopes},config),right=C.policy({version:1,scopes:{'rooms/new-room':{minimum:'trusted'}}},config);
 assert.throws(()=>C.mergeFloor(left,right,config),/minimum\/scopes/);assert.equal(Object.keys(left.scopes).length,128);
});
