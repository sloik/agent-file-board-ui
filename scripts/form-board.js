/* Trusted form transport and root lifetime, inside the viewer scope. */
const formRoots=new Map(),formDrafts=new Map(),submittingForms=new Set(),formDraftLoads=new Map(),formStorageNotes=new Map(),formDraftDirty=new Set();
let formStoragePending=0;
let formStorageIdentity=null,formStorageWrites=Promise.resolve();
const formKey=m=>JSON.stringify([formStorageIdentity||boardStorageId,currentUser(),m.path,m.h.QUESTION]);
async function formDraftBucket(identity,mutate){
 const db=await idb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('kv',mutate?'readwrite':'readonly'),store=tx.objectStore('kv'),request=store.get('form-drafts-v1:'+identity);let result;
 request.onsuccess=()=>{let bucket=request.result;const now=Date.now();if(!bucket||typeof bucket!=='object'||Array.isArray(bucket))bucket={};bucket=Object.fromEntries(Object.entries(bucket).filter(([key,row])=>/^[a-f0-9]{64}$/.test(key)&&row&&typeof row.updated==='number'&&now-row.updated<30*86400000));if(mutate){mutate(bucket);bucket=Object.fromEntries(Object.entries(bucket).sort((a,b)=>b[1].updated-a[1].updated).slice(0,20));store.put(bucket,'form-drafts-v1:'+identity);}result=bucket;};
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Draft storage unavailable'));});}finally{db.close();}
}
function loadFormDraft(key,q){
 if(formDraftLoads.has(key))return;
 const identity=formStorageIdentity;
 const pending=(async()=>{try{if(!identity)throw Error('No durable folder identity');const digest=await shaBytes(new TextEncoder().encode(key)),bucket=await formDraftBucket(identity);const draft=BoardFormContract.restore(q,bucket[digest]?.draft);if(draft){formDrafts.set(key,draft);if(JSON.stringify(draft)!==JSON.stringify(BoardFormContract.initial(q)))formDraftDirty.add(key);}formStorageNotes.set(key,"form_draft_saved");}catch{formStorageNotes.set(key,"form_draft_memory");}finally{formDraftLoads.set(key,true);if(B)mountForms();}})();formDraftLoads.set(key,pending);
}
function saveFormDraft(key,q,draft,clear=false){
 formDrafts.set(key,structuredClone(draft));if(clear||JSON.stringify(draft)===JSON.stringify(BoardFormContract.initial(q)))formDraftDirty.delete(key);else formDraftDirty.add(key);const identity=formStorageIdentity;formStoragePending++;
 formStorageWrites=formStorageWrites.catch(()=>{}).then(async()=>{let persisted=false;try{if(!identity||!BoardFormContract.restore(q,draft))throw Error('Draft exceeds storage limits');const digest=await shaBytes(new TextEncoder().encode(key));await formDraftBucket(identity,bucket=>{if(clear)delete bucket[digest];else bucket[digest]={updated:Math.max(Date.now(),...Object.values(bucket).map(row=>row.updated+1)),draft};});formStorageNotes.set(key,"form_draft_saved");persisted=true;}catch{formStorageNotes.set(key,"form_draft_memory");}if(B)mountForms();return persisted;}).finally(()=>{formStoragePending--;});return formStorageWrites;
}

function formWords(){return {hint:t("form_hint"),choose:t("form_choose"),maxLength:t("form_max_length"),range:t("form_range"),step:t("form_step"),row:t("form_row"),changedCells:t("form_changed_cells"),invalid:t("form_invalid"),invalidForm:t("form_invalid_form"),tooLarge:t("form_too_large"),rowActions:t("form_row_actions"),moveUp:t("form_move_up"),moveDown:t("form_move_down"),removeRow:t("form_remove_row"),addRow:t("form_add_row"),rows:t("form_rows")};}
function formPlaceholder(m){if(!m.bodyLoaded)return '';if(!m.body.trim())return `<p class="metadata-error">${esc(t('report_fallback_missing'))}</p>`;return `<section class="board-form" data-form-path="${esc(m.path)}"><div class="form-mount"></div><p class="form-error" hidden>${esc(t('report_failed'))}</p></section>`;}
function reuseFormNodes(next,move){for(const node of next.querySelectorAll('[data-form-path]')){const saved=formRoots.get(node.dataset.formPath),m=B?.byPath.get(node.dataset.formPath);if(saved&&saved.element.isConnected&&saved.signature===formKey(m))node.replaceWith(move?saved.element:saved.element.cloneNode(true));}}
function disposeForms(){for(const saved of formRoots.values())saved.dispose();formRoots.clear();}
function mountForms(){
 bindAnswerChoices();
 for(const[path,saved]of formRoots)if(!saved.element.isConnected){saved.dispose();formRoots.delete(path);}
 for(const element of $('#feed').querySelectorAll('[data-form-path]')){
  const m=B?.byPath.get(element.dataset.formPath);if(!m?.question||m.metadataError)continue;
  const key=formKey(m);if(!formDraftLoads.has(key))loadFormDraft(key,m.question);const loading=formDraftLoads.get(key)!==true;const sender=currentUser(),options={draft:formDrafts.get(key),busy:loading||submittingForms.has(key),eligible:answerSubmissionOpen(m)&&signingEligible(m)&&!!B.people[sender]&&(m.scope!=='direct'||m.dir.split('--').includes(sender)&&sender!==m.author),words:formWords(),storageStatus:t(formStorageNotes.get(key)||"form_draft_memory"),onDraft:(draft,clear)=>saveFormDraft(key,m.question,draft,clear),onSubmit:answer=>sendFormAnswer(m.path,m.h.QUESTION,sender,answer)};
  const saved=formRoots.get(m.path);if(saved?.element===element&&saved.loading===loading){saved.dispose.update(options);continue;}if(saved?.element===element)saved.dispose();
  const fail=()=>{element.querySelector('.form-error').hidden=false;element.querySelector('.form-mount').hidden=true;};let dispose=()=>{};
  try{if(!window.BoardFormRenderer)throw Error('Renderer unavailable');dispose=window.BoardFormRenderer.mount(element.querySelector('.form-mount'),m.question,options,fail);}catch(e){fail();}
  formRoots.set(m.path,{element,signature:key,dispose,loading});
 }
}
function formAnswerBody(q,answer){const lines=[q.prompt,''];for(const f of q.fields){const value=answer.values[f.id];if(value===null){lines.push(f.label+': null');continue;}if(f.type==='editable-table'){if(f.rowOperations){lines.push(f.label+': '+JSON.stringify(value));continue;}lines.push(f.label+': '+value.changes.length+' '+t("form_changed_cells"));for(const c of value.changes)lines.push('  '+c.row+' / '+f.columns.find(col=>col.id===c.column).label+': '+JSON.stringify(c.value));}else lines.push(f.label+': '+JSON.stringify(value));}return lines.join('\n');}
async function sendFormAnswer(path,definition,sender,answer){
 const m=B?.byPath.get(path),origin=dirHandle,identity=boardStorageId;
 if(!m||!answerSubmissionOpen(m)||!signingEligible(m)||m.metadataError||![2,3].includes(m.question?.version)||m.h.QUESTION!==definition||currentUser()!==sender)throw Error(t("form_stale"));
 const key=formKey(m);if(submittingForms.has(key))return null;
 BoardFormContract.answer(answer,m.question);if(new TextEncoder().encode(JSON.stringify(answer)).length>65536)throw Error(t("form_too_large"));
 if(B.msgs.some(x=>x.dkey===m.dkey&&x.replyTo===m.file&&x.author===sender&&x.answer?.version===m.question.version&&JSON.stringify(x.answer.values)===JSON.stringify(answer.values)))return t("choice_already");
 submittingForms.add(key);
 try{
  const actualSender=signingSender(sender),person=guardRegistered(actualSender),confirmed=person.kind==='agent'&&window.confirm(t('confirm_agent',{name:person.name}));if(person.kind==='agent'&&!confirmed)return null;
  if(canWrite()){
   let dir=baseHandle;for(const part of m.path.split('/').slice(0,-1))dir=await dir.getDirectoryHandle(part);
   const source=parseHeaders(new TextDecoder('utf-8',{fatal:true}).decode(await rawBytes(await(await dir.getFileHandle(m.file)).getFile()))).native;
   if(source.duplicates.length||!source.body.trim()||JSON.stringify(source.h)!==JSON.stringify(m.h))throw Error(t("form_stale"));
  }
  if(origin!==dirHandle||identity!==boardStorageId||currentUser()!==sender||B?.byPath.get(path)?.h.QUESTION!==definition)throw Error(t("form_stale"));
  const msg=composeMessage({sender:actualSender,to:m.author,scope:m.scope,room:m.dir,pair:m.scope==='direct'?m.dir:null,tid:m.tid,threadLabel:threadsOf()[m.tkey].label,slug:'answer-'+m.question.id,status:'REPLY',body:formAnswerBody(m.question,answer),replyTo:m.file,answer,confirmedAgent:confirmed});
  await deliverMessage(msg);saveFormDraft(key,m.question,BoardFormContract.initial(m.question),true);await formStorageWrites;return t(canWrite()?"choice_sent":"form_downloaded");
 }finally{submittingForms.delete(key);if(B)build({background:true,preserveComposer:true});}
}

/* Acceptance is derived solely from shared immutable message bytes. */
async function prepareAnswerStates(model){
 const relevant=model.msgs.filter(m=>m.question||m.h.ANSWER!==undefined||m.h['ANSWER-STATE']!==undefined);
 await readInBatches(relevant,async m=>{try{
  const bytes=m.source?.file?await rawBytes(m.source.file):new TextEncoder().encode(m.rawText||'');
  if(bytes.length>4194304)throw Error('Acceptance message exceeds 4 MiB');
  m.answerDigest=await shaBytes(bytes);
  const parsed=parseHeaders(new TextDecoder('utf-8',{fatal:true}).decode(bytes)).native;
  if(parsed.duplicates.length||!parsed.hasSeparator||([2,3].includes(m.question?.version)&&!parsed.body.trim()))throw Error('Invalid readable acceptance evidence');
  m.answerEvidence=true;
 }catch(e){m.answerEvidence=false;m.answerEvidenceError=e.message;}});
 for(const q of relevant.filter(m=>m.question)){
  if(q.metadataError||q.quarantined||!q.answerEvidence||!signingEligible(q)){q.acceptance={status:'blocked',reason:'Question evidence is unavailable or signing-excluded',history:[],choices:[],heads:[]};continue;}
  const records=[];
  for(const m of relevant){
   if(m.dkey!==q.dkey||m.replyTo!==q.file||m.tid!==q.tid||(m.metadataError&&!m.quarantined))continue;
   try{messageMetadata(m.h,q.h);if(!m.answerDigest)throw Error('Missing bytes');records.push({file:m.file,sha256:m.answerDigest,author:m.author,answer:!!m.answer,state:AnswerState.metadata(m.h,q.h,jsonObject),eligible:!!m.answerEvidence&&!m.quarantined&&signingEligible(m)});}catch{}
  }
  q.acceptance=AnswerState.resolve(q.answerDigest,records,q.author);
 }
}
function acceptedAnswerHtml(m){
 const a=m.acceptance;if(!a||a.status==='none')return '';
 const text=(en,pl)=>esc(exText(en,pl));let html=`<section class="canonical-answer choice-form" data-answer-status="${esc(a.status)}"><h4>${text('Accepted answer','Przyjęta odpowiedź')}</h4>`;
 if(a.status==='accepted'){
  const answer=B.messageIndex.get(m.dkey+'|'+a.winner.file);
  if(!answer||answer.answerDigest!==a.winner.sha256)return html+`<p>${text('Accepted evidence unavailable.','Przyjęta odpowiedź jest niedostępna.')}</p></section>`;
  html+=`<p>${esc(personOf(answer.author,answer.authorName).name)} · <code>${esc(answer.file)}</code></p>`;
  if([2,3].includes(answer.answer?.version))html+=answerReview({...answer,bodyLoaded:true});
  else html+=`<p>${esc(m.question.options.filter(o=>answer.answer.selected.includes(o.id)).map(o=>o.label).join('; '))}</p>${answer.answer.text?`<p style="white-space:pre-wrap">${esc(answer.answer.text)}</p>`:''}`;
 }else{
  html+=`<p role="status">${a.status==='conflict'?text('Conflicting offline acceptances. The question author must choose.','Sprzeczne przyjęcia offline. Autor pytania musi wybrać.'):a.status==='legacy'?text('Earlier replies have no recorded acceptance. The question author can record a choice.','Wcześniejsze odpowiedzi nie mają zapisanego przyjęcia. Autor pytania może wybrać.'):text('Acceptance blocked: ','Przyjęcie zablokowane: ')+esc(a.reason||'')}</p>`;
  const choices=a.status==='legacy'?a.history:a.choices;
  if(a.status!=='blocked')for(const ref of choices){const answer=B.messageIndex.get(m.dkey+'|'+ref.file);if(!answer)continue;html+=`<div><code>${esc(ref.file)}</code>${answer.answer?.text?`<p>${esc(answer.answer.text)}</p>`:''}${[2,3].includes(answer.answer?.version)?answerReview({...answer,bodyLoaded:true}):`<p>${esc(m.question.options?.filter(o=>answer.answer.selected.includes(o.id)).map(o=>o.label).join('; ')||'')}</p>`}${currentUser()===m.author?`<button class="btn" ${submittingForms.has(formKey(m))?'disabled':''} data-accept-question="${esc(m.path)}" data-accept-file="${esc(ref.file)}">${text('Accept this answer','Przyjmij tę odpowiedź')}</button>`:''}</div>`;}
 }
 return html+`<p class="hint">${text('Later submissions remain in message history.','Późniejsze odpowiedzi pozostają w historii wiadomości.')}</p></section>`;
}
function bindAnswerChoices(){for(const button of $('#feed').querySelectorAll('[data-accept-question]'))button.onclick=async()=>{
 const q=B?.byPath.get(button.dataset.acceptQuestion),snapshot=q?.acceptance,origin=B,root=dirHandle,identity=boardStorageId;
 if(!q||currentUser()!==q.author||!['legacy','conflict'].includes(snapshot?.status))return;
 const winner=(snapshot.status==='legacy'?snapshot.history:snapshot.choices).find(r=>r.file===button.dataset.acceptFile);if(!winner)return;
 const pending=formKey(q);if(submittingForms.has(pending))return;submittingForms.add(pending);
 for(const control of $('#feed').querySelectorAll('[data-accept-question]'))if(control.dataset.acceptQuestion===q.path)control.disabled=true;
 try{
  const sender=signingSender(currentUser());if(sender!==q.author)throw Error('Select the question author identity');
  const person=guardRegistered(sender),confirmed=person.kind==='agent'&&window.confirm(t('confirm_agent',{name:person.name}));if(person.kind==='agent'&&!confirmed)return;
  if(B!==origin||dirHandle!==root||boardStorageId!==identity)throw Error(t('form_stale'));
  const msg=composeMessage({sender,to:q.scope==='direct'?q.dir.split('--').find(p=>p!==sender):q.author,scope:q.scope,room:q.dir,pair:q.scope==='direct'?q.dir:null,tid:q.tid,threadLabel:q.label,slug:'answer-acceptance-'+crypto.randomUUID().replaceAll('-',''),status:'REPLY',body:exText('Explicitly accepted answer: ','Jawnie przyjęta odpowiedź: ')+winner.file,replyTo:q.file,answerState:{version:1,questionDigest:q.answerDigest,parents:snapshot.heads,winner},confirmedAgent:confirmed});
  await deliverMessage(msg);
 }catch(e){toast(e.message);}finally{submittingForms.delete(pending);if(B)build({background:true,preserveComposer:true});}
};}
function answerSubmissionOpen(q){return !q.acceptance||q.acceptance.status==='none';}
function withFirstAnswerClaim(msg){
 const h=parseHeaders(msg.text).native.h;if(!h.ANSWER||h['ANSWER-STATE'])return msg;
 const q=B?.msgs.find(m=>m.dkey===((h.SCOPE==='DIRECT'?'direct:':'room:')+(h.SCOPE==='DIRECT'?h['DIRECT-PARTICIPANTS'].split(',').map(x=>x.trim()).join('--'):h.ROOM))&&m.file===h['REPLY-TO']);
 if(!q?.answerDigest||q.acceptance?.status!=='none')return msg;
 const state={version:1,questionDigest:q.answerDigest,parents:[],winner:null};
 return {...msg,text:msg.text.replace('\n---\n','\nANSWER-STATE: '+JSON.stringify(state)+'\n---\n')};
}
