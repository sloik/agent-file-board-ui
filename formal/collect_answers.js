'use strict';
/* Observe the production reducer, including deliberately broken source controls. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),digest='f'.repeat(64),author='owner';
function records(A){
 const r=(id,opts={})=>({file:id+'.txt',sha256:Buffer.from(id).toString('hex').padStart(64,'0'),author:'respondent',answer:true,eligible:true,state:null,...opts});
 const claim=()=>({version:1,questionDigest:digest,parents:[],winner:null});
 const a=r('a',{state:claim()}),b=r('b',{state:claim()}),h=r('h');
 const resolve=(id,parents,winner,who=author)=>r(id,{author:who,answer:false,state:{version:1,questionDigest:digest,parents:parents.map(A.reference),winner:A.reference(winner)}});
 const c=r('c',{state:claim()}),legacy=resolve('legacy',[],h);
 const ra=resolve('ra',[a,b],a),rb=resolve('rb',[a,b],b),merge=resolve('merge',[ra,rb],a),u=resolve('u',[],a,'intruder');
 return {a,b,c,h,legacy,ra,rb,merge,u};
}
function trace(scenario,actions,mutation=''){
 let source=fs.readFileSync(path.join(root,'scripts/answer-state.js'),'utf8');
 if(mutation==='conflict')source=source.replace("result.choices.length===1?'accepted':'conflict'","result.choices.length>=1?'accepted':'conflict'");
 if(mutation==='first')source=source.replace("result.winner=result.choices[0];return result;","result.winner=result.history.at(-1)||result.choices[0];return result;");
 if(mutation==='authority')source=source.replace("require(r.author===author&&!r.answer,'unauthorized explicit acceptance');",'');
 if(mutation==='trust')source=source.replace("require(r.eligible,'acceptance evidence is unavailable or signing-excluded');",'');
 const A=vm.runInNewContext(source+';AnswerState;',{TextEncoder}),all=records(A);let visible=[],denied=false;
 const observe=()=>{const rows=visible.map(id=>({...all[id],eligible:!(denied&&id==='a')})),r=A.resolve(digest,rows,author);return {visible:{$set:[...visible]},denied,status:r.status,winner:r.winner?.file.replace('.txt','')||'none'};};
 const states=[observe()];for(const action of actions){if(action==='trust')denied=!denied;else if(!visible.includes(action))visible.push(action);states.push(observe());}
 return {model:'AnswerAcceptance',scenario,states};
}
function traces(mutant=false){
 if(mutant)return [trace('answer mutant: ignores offline conflict',['a','b'],'conflict'),trace('answer mutant: later history replaces first',['a','h'],'first'),trace('answer mutant: accepts excluded claim',['a','trust'],'trust'),trace('answer mutant: unauthorized resolution',['a','u'],'authority')];
 return [trace('answer: first and backdated history survive reload',['a','h','a']),trace('answer: offline fork and explicit resolution',['a','b','ra']),trace('answer: concurrent resolutions and merge',['b','a','rb','ra','merge']),trace('answer: out-of-order missing evidence',['merge','ra','rb','a','b']),trace('answer: trust exclusion blocks promotion',['a','h','trust','trust']),trace('answer: unauthorized acceptance blocked',['a','u']),trace('answer: legacy history and reordered convergence',['h','b','a','ra']),trace('answer: late offline claim reopens conflict',['a','b','ra','c']),trace('answer: explicit legacy anchoring',['legacy','h'])];
}
if(require.main===module)process.stdout.write(JSON.stringify(traces(process.argv.includes('--mutant'))));
module.exports={traces,records};
