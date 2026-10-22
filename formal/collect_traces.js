'use strict';
/* Drive production claim/reload code. Records are observations of its effects,
   not a second implementation of the TLA+ transition relation. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function collect(scenario,actions,mutation=''){
 let source=fs.readFileSync(path.join(root,'scripts/viewer-updates.js'),'utf8');
 if(mutation==='daily')source=source.replace('!manual&&(s.auto===false||!due(s.lastAttempt,now))','!manual&&s.auto===false');
 const U=vm.runInNewContext(source+';ViewerUpdates;',{});
 let ui=fs.readFileSync(path.join(root,'scripts/viewer-updates-ui.js'),'utf8');
 if(mutation==='reload')ui=ui.replace('const reasons=viewerReloadBlockers();','const reasons=[];');
 const raw={value:''},kind={value:'report'};
 const context={notificationHasDraft:()=>false,choiceDrafts:new Map(),formDraftDirty:new Set(),extensionDirty:new Set(),$:id=>id==='#structuredJson'?raw:kind,AUTHORING_EXAMPLES:[],voiceWorkPending:false,extensionMutationPending:0,signingSavePending:0,viewerActiveWrites:0,viewerActiveDeliveries:0,viewerActiveSends:0,upgradeBusy:false,repairBusy:false,draftManagerBusy:false,locationBusy:false,authoringPending:0,formStoragePending:0,submittingForms:new Set(),submittingChoices:new Set(),extensionSending:new Set(),location:{reload(){called=true;}}};
 const reload=vm.runInNewContext(ui+';viewerReload;',context);
 let called=false,browser={},s={day:0,stamp:2,claims:[0,0],enabled:true,draft:false,pending:false,checks:0,manualUsed:false,reloaded:false,badReload:false};
 const states=[structuredClone(s)];
 for(const action of actions){
  if(action==='tick')s.day++;
  else if(action==='enable'){s.enabled=!s.enabled;browser.auto=s.enabled;}
  else if(action==='edit')s.draft=!s.draft;
  else if(action==='write')s.pending=!s.pending;
  else if(action==='reload'){
   context.notificationHasDraft=()=>s.draft;context.viewerActiveWrites=s.pending?1:0;called=false;reload();
   if(called){s.reloaded=true;s.badReload=s.draft||s.pending;}
  }else{
   const manual=action==='manual',claim=U.claim(browser,(s.day+1)*U.day,manual);browser=claim.state;
   if(claim.claimed){s.stamp=browser.lastAttempt/U.day-1;s.checks++;if(manual)s.manualUsed=true;else s.claims[s.day]++;}
  }
  states.push(structuredClone(s));
 }
 return {model:'ViewerUpdate',scenario,states};
}
function traces(mutant=false){
 if(mutant)return [collect('implementation mutant: duplicate daily claim',['auto','auto'],'daily'),collect('implementation mutant: reload erases unfinished draft',['edit','reload'],'reload')];
 const daily=collect('same-day contenders, overdue reopening and manual check',['auto','auto','tick','auto','manual']);assert.equal(daily.states.at(-1).checks,3);
 const optout=collect('opt-out preserves explicit manual check',['enable','auto','manual']);assert.equal(optout.states.at(-1).checks,1);
 const reload=collect('dirty and pending reloads refuse until cleared',['edit','reload','edit','write','reload','write','reload']);assert.equal(reload.states.at(-1).reloaded,true);assert.equal(reload.states.at(-1).badReload,false);
 return [daily,optout,reload,...generated()];
}
function schedules(){
 // Three binary choices enumerate eight bounded schedules reproducibly.
 return Array.from({length:8},(_,seed)=>{
  const checks=seed&1?['manual','auto']:['auto','manual'];
  const blockers=seed&2?['write','edit']:['edit','write'];
  return {seed,actions:[...(seed&4?['enable']:[]),...checks,'tick','auto','auto',
   ...(seed&4?['enable','auto']:[]),...blockers,'reload',blockers[0],'reload',blockers[1],'reload']};
 });
}
function generated(){return schedules().map(({seed,actions})=>{
 const trace=collect('generated viewer schedule '+seed,actions),last=trace.states.at(-1);
 assert(last.reloaded&&!last.badReload,'generated schedule must reach an actually permitted reload');
 assert(last.checks>=1&&last.manualUsed,'manual check must remain usable in every schedule');return trace;
});}
async function allTraces(mutant=false){return [...traces(mutant),...await require('./collect_signer').traces(mutant),...require('./collect_answers').traces(mutant)];}
if(require.main===module)allTraces(process.argv.includes('--mutant')).then(t=>process.stdout.write(JSON.stringify(t))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={traces,schedules};
