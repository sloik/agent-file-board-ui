/* Trusted form transport and root lifetime, inside the viewer scope. */
const formRoots=new Map(),formDrafts=new Map(),submittingForms=new Set(),formDraftLoads=new Map(),formStorageNotes=new Map(),formDraftDirty=new Set();
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
 const pending=(async()=>{try{if(!identity)throw Error('No durable folder identity');const digest=await shaBytes(new TextEncoder().encode(key)),bucket=await formDraftBucket(identity);const draft=BoardFormContract.restore(q,bucket[digest]?.draft);if(draft){formDrafts.set(key,draft);formDraftDirty.add(key);}formStorageNotes.set(key,"form_draft_saved");}catch{formStorageNotes.set(key,"form_draft_memory");}finally{formDraftLoads.set(key,true);if(B)mountForms();}})();formDraftLoads.set(key,pending);
}
function saveFormDraft(key,q,draft,clear=false){
 formDrafts.set(key,structuredClone(draft));if(clear)formDraftDirty.delete(key);else formDraftDirty.add(key);const identity=formStorageIdentity;
 formStorageWrites=formStorageWrites.catch(()=>{}).then(async()=>{let persisted=false;try{if(!identity||!BoardFormContract.restore(q,draft))throw Error('Draft exceeds storage limits');const digest=await shaBytes(new TextEncoder().encode(key));await formDraftBucket(identity,bucket=>{if(clear)delete bucket[digest];else bucket[digest]={updated:Math.max(Date.now(),...Object.values(bucket).map(row=>row.updated+1)),draft};});formStorageNotes.set(key,"form_draft_saved");persisted=true;}catch{formStorageNotes.set(key,"form_draft_memory");}if(B)mountForms();return persisted;});return formStorageWrites;
}

function formWords(){return {hint:t("form_hint"),choose:t("form_choose"),maxLength:t("form_max_length"),range:t("form_range"),step:t("form_step"),row:t("form_row"),changedCells:t("form_changed_cells"),invalid:t("form_invalid"),invalidForm:t("form_invalid_form"),tooLarge:t("form_too_large"),rowActions:t("form_row_actions"),moveUp:t("form_move_up"),moveDown:t("form_move_down"),removeRow:t("form_remove_row"),addRow:t("form_add_row"),rows:t("form_rows")};}
function formPlaceholder(m){if(!m.bodyLoaded)return '';if(!m.body.trim())return `<p class="metadata-error">${esc(t('report_fallback_missing'))}</p>`;return `<section class="board-form" data-form-path="${esc(m.path)}"><div class="form-mount"></div><p class="form-error" hidden>${esc(t('report_failed'))}</p></section>`;}
function reuseFormNodes(next,move){for(const node of next.querySelectorAll('[data-form-path]')){const saved=formRoots.get(node.dataset.formPath),m=B?.byPath.get(node.dataset.formPath);if(saved&&saved.element.isConnected&&saved.signature===formKey(m))node.replaceWith(move?saved.element:saved.element.cloneNode(true));}}
function disposeForms(){for(const saved of formRoots.values())saved.dispose();formRoots.clear();}
function mountForms(){
 for(const[path,saved]of formRoots)if(!saved.element.isConnected){saved.dispose();formRoots.delete(path);}
 for(const element of $('#feed').querySelectorAll('[data-form-path]')){
  const m=B?.byPath.get(element.dataset.formPath);if(!m?.question||m.metadataError)continue;
  const key=formKey(m);if(!formDraftLoads.has(key))loadFormDraft(key,m.question);const loading=formDraftLoads.get(key)!==true;const sender=currentUser(),options={draft:formDrafts.get(key),busy:loading||submittingForms.has(key),eligible:!!B.people[sender]&&(m.scope!=='direct'||m.dir.split('--').includes(sender)&&sender!==m.author),words:formWords(),storageStatus:t(formStorageNotes.get(key)||"form_draft_memory"),onDraft:(draft,clear)=>saveFormDraft(key,m.question,draft,clear),onSubmit:answer=>sendFormAnswer(m.path,m.h.QUESTION,sender,answer)};
  const saved=formRoots.get(m.path);if(saved?.element===element&&saved.loading===loading){saved.dispose.update(options);continue;}if(saved?.element===element)saved.dispose();
  const fail=()=>{element.querySelector('.form-error').hidden=false;element.querySelector('.form-mount').hidden=true;};let dispose=()=>{};
  try{if(!window.BoardFormRenderer)throw Error('Renderer unavailable');dispose=window.BoardFormRenderer.mount(element.querySelector('.form-mount'),m.question,options,fail);}catch(e){fail();}
  formRoots.set(m.path,{element,signature:key,dispose,loading});
 }
}
function formAnswerBody(q,answer){const lines=[q.prompt,''];for(const f of q.fields){const value=answer.values[f.id];if(value===null){lines.push(f.label+': null');continue;}if(f.type==='editable-table'){if(f.rowOperations){lines.push(f.label+': '+JSON.stringify(value));continue;}lines.push(f.label+': '+value.changes.length+' '+t("form_changed_cells"));for(const c of value.changes)lines.push('  '+c.row+' / '+f.columns.find(col=>col.id===c.column).label+': '+JSON.stringify(c.value));}else lines.push(f.label+': '+JSON.stringify(value));}return lines.join('\n');}
async function sendFormAnswer(path,definition,sender,answer){
 const m=B?.byPath.get(path),origin=dirHandle,identity=boardStorageId;
 if(!m||m.metadataError||![2,3].includes(m.question?.version)||m.h.QUESTION!==definition||currentUser()!==sender)throw Error(t("form_stale"));
 const key=formKey(m);if(submittingForms.has(key))return null;
 BoardFormContract.answer(answer,m.question);if(new TextEncoder().encode(JSON.stringify(answer)).length>65536)throw Error(t("form_too_large"));
 if(B.msgs.some(x=>x.dkey===m.dkey&&x.replyTo===m.file&&x.author===sender&&x.answer?.version===m.question.version&&JSON.stringify(x.answer.values)===JSON.stringify(answer.values)))return t("choice_already");
 submittingForms.add(key);
 try{
  const person=guardRegistered(sender),confirmed=person.kind==='agent'&&window.confirm(t('confirm_agent',{name:person.name}));if(person.kind==='agent'&&!confirmed)return null;
  if(canWrite()){
   let dir=baseHandle;for(const part of m.path.split('/').slice(0,-1))dir=await dir.getDirectoryHandle(part);
   const source=parseHeaders(new TextDecoder('utf-8',{fatal:true}).decode(await rawBytes(await(await dir.getFileHandle(m.file)).getFile()))).native;
   if(source.duplicates.length||!source.body.trim()||JSON.stringify(source.h)!==JSON.stringify(m.h))throw Error(t("form_stale"));
  }
  if(origin!==dirHandle||identity!==boardStorageId||currentUser()!==sender||B?.byPath.get(path)?.h.QUESTION!==definition)throw Error(t("form_stale"));
  const msg=composeMessage({sender,to:m.author,scope:m.scope,room:m.dir,pair:m.scope==='direct'?m.dir:null,tid:m.tid,threadLabel:threadsOf()[m.tkey].label,slug:'answer-'+m.question.id,status:'REPLY',body:formAnswerBody(m.question,answer),replyTo:m.file,answer,confirmedAgent:confirmed});
  await deliverMessage(msg);saveFormDraft(key,m.question,BoardFormContract.initial(m.question),true);await formStorageWrites;return t(canWrite()?"choice_sent":"form_downloaded");
 }finally{submittingForms.delete(key);if(B)build({background:true,preserveComposer:true});}
}
