/* Explicit local draft operations. Imports never write a board message. */
let draftManagerBinding=null,draftManagerGeneration=0,draftManagerBusy=false;
function closeDraftManager(){draftManagerBinding=null;draftManagerGeneration++;$('#draftsDialog').close();}
function draftBinding(){return {board:toolsBoardKey(),user:currentUser(),identity:formStorageIdentity};}
function sameDraftBinding(binding){return !!binding&&binding.board===toolsBoardKey()&&binding.user===currentUser()&&binding.identity===formStorageIdentity;}
function managedDraft(q,raw){
 const value=BoardFormContract.restore(q,raw);if(!value)return null;
 for(const f of q.fields){const v=value[f.id];if(f.options){const ids=new Set(f.options.map(o=>o.id));if(Array.isArray(v)?v.some(id=>!ids.has(id)):v!==null&&!ids.has(v))return null;}
  if(f.type==='editable-table'&&f.rowOperations){const policy=f.rowOperations,base=new Set(f.rows.map(r=>r.id)),order=v.order,added=order.filter(id=>!base.has(id)),removed=f.rows.filter(r=>!order.includes(r.id));
   if((added.length&&!policy.add)||(removed.length&&!policy.remove)||order.length<policy.minRows)return null;
   const expected=f.rows.filter(r=>order.includes(r.id)).map(r=>r.id).concat(added);if(!policy.reorder&&JSON.stringify(order)!==JSON.stringify(expected))return null;
  }
 }return value;
}
function draftManagerMessage(error){$('#draftManagerResult').textContent=error?.message||String(error);}
async function openDraftManager(){
 if(!B){toast(t("e_open_first"));return;}
 draftManagerBinding=draftBinding();if(!$('#draftsDialog').open)$('#draftsDialog').showModal();await renderDraftManager();
}
async function renderDraftManager(){
 const binding=draftManagerBinding,generation=++draftManagerGeneration;if(!sameDraftBinding(binding))return;
 $('#draftManagerList').replaceChildren();$('#draftManagerResult').textContent=t("draft_loading");
 try{await formStorageWrites;if(!sameDraftBinding(binding)||generation!==draftManagerGeneration)return;
  let bucket={};try{if(binding.identity)bucket=await formDraftBucket(binding.identity);}catch{/* memory-only records are still available */}
  const rows=[];await readInBatches(B.msgs.filter(m=>!m.metadataError&&!m.quarantined&&[2,3].includes(m.question?.version)),async m=>{
   const key=JSON.stringify([binding.identity||boardStorageId,binding.user,m.path,m.h.QUESTION]),hash=await shaBytes(new TextEncoder().encode(key)),stored=bucket[hash],memory=formDraftDirty.has(key)?formDrafts.get(key):null,raw=memory||stored?.draft;
   if(raw&&managedDraft(m.question,raw)){const current=!!stored&&(!memory||formStorageNotes.get(key)==="form_draft_saved");rows.push({m,key,raw,updated:current?stored.updated:undefined,stored:current,hasStored:!!stored});}
  });
  if(!sameDraftBinding(binding)||generation!==draftManagerGeneration||!$('#draftsDialog').open)return;
  rows.sort((a,b)=>(b.updated||0)-(a.updated||0)||a.m.path.localeCompare(b.m.path));
  for(const row of rows){const element=document.createElement('section');element.className='managed-draft';element.dataset.draftPath=row.m.path;
   const heading=document.createElement('h3');heading.textContent=row.m.question.prompt;const path=document.createElement('code');path.textContent=row.m.path;const status=document.createElement('p'),stamp=new Date(row.updated);status.className='hint';status.textContent=(row.stored?t("draft_stored"):t("draft_memory"))+(Number.isFinite(stamp.getTime())?' · '+stamp.toISOString():'');
   const actions=document.createElement('div');actions.className='draft-actions';for(const action of ['export','delete']){const button=document.createElement('button');button.className='btn';button.textContent=action==='export'?t("draft_export"):t("draft_delete");button.onclick=()=>action==='export'?exportManagedDraft(row,binding):deleteManagedDraft(row,binding);actions.append(button);}
   element.append(heading,path,status,actions);$('#draftManagerList').append(element);
  }$('#draftManagerResult').textContent=rows.length?t("draft_count",{n:rows.length}):t("draft_none");
 }catch(error){if(generation===draftManagerGeneration)draftManagerMessage(error);}
}
function assertDraftSource(binding,path,definition){
 if(!sameDraftBinding(binding))throw Error(t("draft_changed"));const m=B?.byPath.get(path);if(!m||m.metadataError||m.quarantined||![2,3].includes(m.question?.version)||m.h.QUESTION!==definition)throw Error(t("draft_source"));return m;
}
function exportManagedDraft(row,binding){
 try{const m=assertDraftSource(binding,row.m.path,row.m.h.QUESTION),raw=formDraftDirty.has(row.key)?formDrafts.get(row.key):row.raw,draft=managedDraft(m.question,raw);if(!draft)throw Error(t("draft_invalid"));
  const envelope={format:'agent-file-board-draft',version:1,respondent:binding.user,path:m.path,question:m.h.QUESTION,draft};if(new TextEncoder().encode(JSON.stringify(envelope,null,2)+'\n').length>393216)throw Error(t("draft_file_limit"));downloadLocalJson('board-draft-'+m.question.id+'.json',envelope);$('#draftManagerResult').textContent=t("draft_exported");
 }catch(error){draftManagerMessage(error);}
}
async function deleteManagedDraft(row,binding){
 if(draftManagerBusy)return;draftManagerBusy=true;
 try{const m=assertDraftSource(binding,row.m.path,row.m.h.QUESTION);if(!window.confirm(t("draft_delete_confirm",{path:m.path})))return;assertDraftSource(binding,m.path,m.h.QUESTION);
  const previous=structuredClone(formDrafts.get(row.key)||row.raw),persisted=await saveFormDraft(row.key,m.question,BoardFormContract.initial(m.question),true);if(!persisted&&row.hasStored){formDrafts.set(row.key,previous);formDraftDirty.add(row.key);if(sameDraftBinding(binding))resetManagedForm(row.key);throw Error(t("draft_delete_failed"));}if(!sameDraftBinding(binding))return;resetManagedForm(row.key);await renderDraftManager();
 }catch(error){draftManagerMessage(error);}finally{draftManagerBusy=false;}
}
function resetManagedForm(key){for(const[path,saved]of formRoots)if(saved.signature===key){saved.dispose();formRoots.delete(path);}if(B)build({background:true,preserveComposer:true});}
async function importManagedDraft(event){
 const file=event.target.files?.[0],binding=draftManagerBinding;event.target.value='';if(!file||draftManagerBusy)return;draftManagerBusy=true;$('#draftManagerResult').textContent=t("draft_loading");
 try{if(file.size>393216)throw Error(t("draft_file_limit"));const value=jsonObject(await file.text());
  if(Object.keys(value).sort().join(',')!=='draft,format,path,question,respondent,version'||value.format!=='agent-file-board-draft'||value.version!==1||typeof value.path!=='string'||value.path.length>1024||typeof value.question!=='string'||value.respondent!==binding?.user)throw Error(t("draft_invalid"));
  const m=assertDraftSource(binding,value.path,value.question),draft=managedDraft(m.question,value.draft);if(!draft)throw Error(t("draft_invalid"));
  if(!window.confirm(t("draft_import_confirm",{path:m.path,who:binding.user})))return;
  assertDraftSource(binding,m.path,value.question);const key=formKey(m);saveFormDraft(key,m.question,draft);await formStorageWrites;if(!sameDraftBinding(binding))return;formDraftLoads.set(key,true);resetManagedForm(key);await renderDraftManager();$('#draftManagerResult').textContent=t("draft_imported");
 }catch(error){draftManagerMessage(error);}finally{draftManagerBusy=false;}
}
