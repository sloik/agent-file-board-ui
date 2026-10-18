/* Trusted form transport and root lifetime, inside the viewer scope. */
const formRoots=new Map(),formDrafts=new Map(),submittingForms=new Set();
function formWords(){return {hint:t("form_hint"),choose:t("form_choose"),maxLength:t("form_max_length"),range:t("form_range"),step:t("form_step"),row:t("form_row"),changedCells:t("form_changed_cells"),invalid:t("form_invalid"),invalidForm:t("form_invalid_form"),tooLarge:t("form_too_large")};}
function formPlaceholder(m){if(!m.bodyLoaded)return '';if(!m.body.trim())return `<p class="metadata-error">${esc(t('report_fallback_missing'))}</p>`;return `<section class="board-form" data-form-path="${esc(m.path)}"><div class="form-mount"></div><p class="form-error" hidden>${esc(t('report_failed'))}</p></section>`;}
function reuseFormNodes(next,move){for(const node of next.querySelectorAll('[data-form-path]')){const saved=formRoots.get(node.dataset.formPath),m=B?.byPath.get(node.dataset.formPath);if(saved&&saved.element.isConnected&&saved.signature===choiceKey(m))node.replaceWith(move?saved.element:saved.element.cloneNode(true));}}
function disposeForms(){for(const saved of formRoots.values())saved.dispose();formRoots.clear();}
function mountForms(){
 for(const[path,saved]of formRoots)if(!saved.element.isConnected){saved.dispose();formRoots.delete(path);}
 for(const element of $('#feed').querySelectorAll('[data-form-path]')){
  const m=B?.byPath.get(element.dataset.formPath);if(!m?.question||m.metadataError)continue;
  const key=choiceKey(m),sender=currentUser(),options={draft:formDrafts.get(key),busy:submittingForms.has(key),eligible:!!B.people[sender]&&(m.scope!=='direct'||m.dir.split('--').includes(sender)&&sender!==m.author),words:formWords(),onDraft:draft=>formDrafts.set(key,structuredClone(draft)),onSubmit:answer=>sendFormAnswer(m.path,m.h.QUESTION,sender,answer)};
  const saved=formRoots.get(m.path);if(saved?.element===element){saved.dispose.update(options);continue;}
  const fail=()=>{element.querySelector('.form-error').hidden=false;element.querySelector('.form-mount').hidden=true;};let dispose=()=>{};
  try{if(!window.BoardFormRenderer)throw Error('Renderer unavailable');dispose=window.BoardFormRenderer.mount(element.querySelector('.form-mount'),m.question,options,fail);}catch(e){fail();}
  formRoots.set(m.path,{element,signature:key,dispose});
 }
}
function formAnswerBody(q,answer){const lines=[q.prompt,''];for(const f of q.fields){const value=answer.values[f.id];if(f.type==='editable-table'){lines.push(f.label+': '+value.changes.length+' '+t("form_changed_cells"));for(const c of value.changes)lines.push('  '+c.row+' / '+f.columns.find(col=>col.id===c.column).label+': '+JSON.stringify(c.value));}else lines.push(f.label+': '+JSON.stringify(value));}return lines.join('\n');}
async function sendFormAnswer(path,definition,sender,answer){
 const m=B?.byPath.get(path),origin=dirHandle,identity=boardStorageId;
 if(!m||m.metadataError||m.question?.version!==2||m.h.QUESTION!==definition||currentUser()!==sender)throw Error(t("form_stale"));
 const key=choiceKey(m);if(submittingForms.has(key))return null;
 BoardFormContract.answer(answer,m.question);if(new TextEncoder().encode(JSON.stringify(answer)).length>65536)throw Error(t("form_too_large"));
 if(B.msgs.some(x=>x.dkey===m.dkey&&x.replyTo===m.file&&x.author===sender&&x.answer?.version===2&&JSON.stringify(x.answer.values)===JSON.stringify(answer.values)))return t("choice_already");
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
  await deliverMessage(msg);return t(canWrite()?"choice_sent":"form_downloaded");
 }finally{submittingForms.delete(key);if(B)build({background:true,preserveComposer:true});}
}
