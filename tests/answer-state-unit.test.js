'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),A=require('../scripts/answer-state');
const digest='f'.repeat(64),author='question-author';
const record=(file,options={})=>({file:file+'.txt',sha256:file.charCodeAt(0).toString(16).padStart(64,'0'),author:'respondent',answer:true,eligible:true,state:null,...options});
const root=file=>record(file,{state:{version:1,questionDigest:digest,parents:[],winner:null}});
const a=root('a'),b=root('b'),h=record('history');
const resolution=(file,parents,winner,opts={})=>record(file,{author,answer:false,state:{version:1,questionDigest:digest,parents:parents.map(A.reference),winner:A.reference(winner)},...opts});
const result=records=>A.resolve(digest,records,author);
test('recorded first answer survives later/backdated history, order and reconstruction',()=>{
 for(const rows of [[a,h],[h,a],[a]]){const actual=result(rows);assert.equal(actual.status,'accepted');assert.deepEqual(actual.winner,A.reference(a));assert.equal(result(JSON.parse(JSON.stringify(rows))).status,'accepted');}
 assert.equal(result([h]).status,'legacy');assert.equal(result([]).status,'none');
});
test('offline first claims conflict; explicit owner resolution retains a claimed winner',()=>{
 const ra=resolution('ra',[a,b],a),rb=resolution('rb',[a,b],b),merged=resolution('merged',[ra,rb],a);
 assert.equal(result([b,a]).status,'conflict');assert.equal(result([a,b,ra]).status,'accepted');assert.deepEqual(result([a,b,ra]).winner,A.reference(a));
 assert.equal(result([a,b,ra,rb]).status,'conflict');assert.deepEqual(result([a,b,ra,rb,merged]).winner,A.reference(a));
 assert.equal(result([a,b,ra,resolution('bad',[ra],h),h]).status,'blocked');
 assert.equal(result([a,ra]).status,'blocked');
 assert.equal(result([a,b,resolution('bad',[a,b],a,{author:'intruder'})]).status,'blocked');
});
test('later independent offline root reopens a resolved conflict; same-choice resolutions converge',()=>{
 const ra=resolution('ra',[a,b],a),same=resolution('same',[a,b],a),c=root('c');
 assert.equal(result([a,b,ra,same]).status,'accepted');assert.equal(result([a,b,ra,c]).status,'conflict');
 for(const rows of [[c,ra,b,a],[ra,a,c,b]])assert.deepEqual(result(rows),result([a,b,ra,c]));
});
test('missing, changed, unavailable or excluded evidence never promotes later history',()=>{
 const ra=resolution('ra',[a,b],a);
 for(const rows of [[a,h,{...b,eligible:false}],[a,b,{...ra,eligible:false}], [{...a,state:{...a.state,questionDigest:'e'.repeat(64)}},h],[ra,h],[{...a,eligible:false},h]]){assert.equal(result(rows).status,'blocked');assert.equal(result(rows).winner,null);}
 const legacy=resolution('legacy',[],h);assert.deepEqual(result([h,legacy]).winner,A.reference(h));
});
test('closed bounded metadata rejects duplicate refs, traversal, non-root self claims and extra keys',()=>{
 for(const state of [{...a.state,other:1},{...a.state,version:true},{...a.state,questionDigest:[]},{...a.state,questionDigest:digest+'\n'},{...a.state,winner:{file:'bad.txt\n',sha256:digest}},{...a.state,winner:{file:'bad.txt',sha256:digest+'\n'}},{...a.state,parents:[A.reference(a)]},{...a.state,winner:{file:'../bad.txt',sha256:digest}}, {...a.state,winner:A.reference(a),parents:[A.reference(a),A.reference(a)]}])assert.throws(()=>A.validate(state));
 const source={FROM:author,QUESTION:'{}',SCOPE:'ROOM',ROOM:'general',THREAD:'T001-x'};
 const header={FROM:'respondent',SCOPE:'ROOM',ROOM:'general',THREAD:'T001-x','REPLY-TO':'q.txt',ANSWER:'{}','ANSWER-STATE':JSON.stringify(a.state)};
 assert.ok(A.metadata(header,source));assert.throws(()=>A.metadata({...header,ROOM:'other'},source));assert.throws(()=>A.metadata({...header,ANSWER:undefined,'ANSWER-STATE':JSON.stringify({...a.state,winner:A.reference(a)})},source));
});
module.exports={record,root,resolution,digest,author,a,b,h};

test('pinned canonical fixtures and shared model agree with the UI resolver',()=>{
 const fs=require('node:fs'),path=require('node:path'),vendor=path.join(__dirname,'../vendor/agent-file-board');
 const fixture=JSON.parse(fs.readFileSync(path.join(vendor,'tests/fixtures/answer-acceptance.json')));
 for(const c of fixture.cases){const rows=c.visible.map(id=>({...fixture.records[id],eligible:!c.excluded?.includes(id)})),r=A.resolve(fixture.questionDigest,rows,fixture.author);assert.equal(r.status,c.status,c.name);assert.equal(r.winner?.file||null,c.winner?fixture.records[c.winner].file:null,c.name);}
 assert.equal(fs.readFileSync(path.join(__dirname,'../formal/AnswerAcceptance.tla'),'utf8'),fs.readFileSync(path.join(vendor,'formal/AnswerAcceptance.tla'),'utf8'));
});


test('bounded graph limits and cycles block instead of dropping evidence or choosing another answer',()=>{
 assert.equal(result(Array(4097).fill(a)).status,'blocked');
 const many=Array.from({length:33},(_,i)=>root('root'+i));assert.equal(result(many).status,'blocked');
 const x=resolution('x',[],a),y=resolution('y',[x],a);x.state.parents=[A.reference(y)];assert.equal(result([a,x,y]).status,'blocked');
 const deep=[a];for(let i=0;i<130;i++)deep.push(resolution('depth'+i,[deep.at(-1)],a));assert.equal(result(deep).status,'blocked');assert.equal(result(deep.reverse()).status,'blocked');
});
