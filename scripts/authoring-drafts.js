/* Local authoring workspace: committed recovery plus explicit named snapshots. */
const AUTHORING_STORE='authoring-workspace-v1',AUTHORING_LIMIT=1048576;
let authoringWorkspace={active:null,saved:[]},authoringWrites=Promise.resolve(),authoringStorageOk=true,authoringReady=false,authoringSavedAttachment=null,authoringPending=0;
function authoringRecord(){return {kind:$('#structuredKind').value,raw:$('#structuredJson').value,attachment:authoringSavedAttachment};}
function checkedAuthoringRecord(v){
 if(!v||Object.keys(v).sort().join()!=='attachment,kind,raw'||!['report','form'].includes(v.kind)||typeof v.raw!=='string'||new TextEncoder().encode(v.raw).length>262144)throw Error(t("authoring_backup_invalid"));
 if(v.attachment!==null){const a=v.attachment;if(!a||Object.keys(a).sort().join()!=='board,kind,raw'||typeof a.board!=='string'||a.board.length>2000||typeof a.raw!=='string')throw Error(t("authoring_backup_invalid"));parseStructured(a.kind,a.raw);}
 if(new TextEncoder().encode(JSON.stringify(v)).length>AUTHORING_LIMIT-128)throw Error(t("authoring_backup_invalid"));return structuredClone(v);
}
function authoringStorageStatus(){if($('#authoringStorage'))$('#authoringStorage').textContent=t(authoringPending?"authoring_saving":authoringStorageOk?"authoring_saved_local":"authoring_memory");}
function persistAuthoring(){
 if(!authoringReady)return Promise.resolve(false);
 let snapshot;try{snapshot=checkedAuthoringRecord(authoringRecord());}catch{authoringStorageOk=false;authoringStorageStatus();return Promise.resolve(false);}
 authoringPending++;authoringStorageStatus();
 const next=authoringWrites.then(async()=>{try{await authoringTransaction(store=>{store.active=snapshot;return store;});authoringWorkspace.active=snapshot;if(JSON.stringify(authoringRecord())===JSON.stringify(snapshot))authoringStorageOk=true;authoringStorageStatus();return true;}catch{authoringStorageOk=false;authoringStorageStatus();return false;}finally{authoringPending--;authoringStorageStatus();}});authoringWrites=next.catch(()=>{});return next;
}
async function authoringTransaction(change){
 const db=await idb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),kv=tx.objectStore('kv'),q=kv.get(AUTHORING_STORE);let value;
 q.onsuccess=()=>{try{value=change(cleanAuthoringStore(q.result));kv.put(value,AUTHORING_STORE);}catch(e){tx.abort();reject(e);}};
 tx.oncomplete=()=>{authoringWorkspace=value;resolve(value);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Authoring transaction aborted'));});}finally{db.close();}
}
function cleanAuthoringStore(value){
 const result={active:null,saved:[]};if(!value||typeof value!=='object')return result;
 try{if(value.active)result.active=checkedAuthoringRecord(value.active);}catch{}
 for(const item of Array.isArray(value.saved)?value.saved.slice(0,20):[])try{if(typeof item.id==='string'&&item.id.length<=80&&typeof item.name==='string'&&item.name.length<=120&&typeof item.at==='string')result.saved.push({...item,record:checkedAuthoringRecord(item.record)});}catch{}
 return result;
}
async function initAuthoringStorage(){
 try{const db=await idb();let stored;try{stored=await new Promise((resolve,reject)=>{const tx=db.transaction('kv'),q=tx.objectStore('kv').get(AUTHORING_STORE);tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Read aborted'));});}finally{db.close();}authoringWorkspace=cleanAuthoringStore(stored);
  if(authoringWorkspace.active)applyAuthoringRecord(authoringWorkspace.active);else loadAuthoringExample(true);
 }catch{authoringStorageOk=false;loadAuthoringExample(true);}finally{authoringReady=true;if(authoringStorageOk&&!authoringWorkspace.active)await persistAuthoring();authoringStorageStatus();renderAuthoringSaved();}
}
function applyAuthoringRecord(v){$('#structuredKind').value=v.kind;$('#structuredJson').value=v.raw;authoringSavedAttachment=v.attachment;invalidateAuthoring();$('#formBuilder').hidden=true;$('#structuredJson').hidden=false;$('#structuredJsonLabel').hidden=false;builderQuestion=null;updateAuthoringRestore();}
function authoringReplaceAllowed(){return !$('#structuredJson').value||confirm(t("authoring_replace"));}
function renderAuthoringSaved(){const select=$('#authoringSaved'),selected=select.value;select.replaceChildren();for(const item of authoringWorkspace.saved){const option=document.createElement('option');option.value=item.id;option.textContent=item.name;select.append(option);}if([...select.options].some(o=>o.value===selected))select.value=selected;}
async function mutateAuthoringSaved(change){
 authoringPending++;authoringStorageStatus();
 const next=authoringWrites.then(async()=>{try{await authoringTransaction(change);authoringStorageOk=JSON.stringify(authoringWorkspace.active)===JSON.stringify(authoringRecord());authoringStorageStatus();renderAuthoringSaved();return true;}catch(e){authoringStorageOk=false;authoringStorageStatus();$('#authoringDraftResult').textContent=e.message||t("authoring_memory");return false;}finally{authoringPending--;authoringStorageStatus();}});authoringWrites=next.catch(()=>{});return next;
}
async function saveAuthoringNamed(){
 try{const record=checkedAuthoringRecord(authoringRecord()),name=$('#authoringName').value.trim().slice(0,120);if(!name)throw Error(t("authoring_name_needed"));const item={id:crypto.randomUUID(),name,at:new Date().toISOString(),record};const ok=await mutateAuthoringSaved(store=>{if(store.saved.length>=20)throw Error(t("authoring_snapshot_limit"));store.saved.unshift(item);store.active=record;return store;});if(ok)$('#authoringDraftResult').textContent=t("authoring_snapshot_saved");}catch(e){$('#authoringDraftResult').textContent=e.message;}
}
async function restoreAuthoringNamed(){await authoringWrites;const item=authoringWorkspace.saved.find(x=>x.id===$('#authoringSaved').value);if(!item||!authoringReplaceAllowed())return;applyAuthoringRecord(item.record);await persistAuthoring();}
async function deleteAuthoringNamed(){const id=$('#authoringSaved').value;if(!id||!confirm(t("authoring_delete_confirm")))return;await mutateAuthoringSaved(store=>{store.saved=store.saved.filter(x=>x.id!==id);return store;});}
async function clearAuthoringWorkspace(){if(!confirm(t("authoring_replace")))return;const original=JSON.stringify(authoringRecord());const ok=await mutateAuthoringSaved(store=>{store.active=null;return store;});if(ok){if(JSON.stringify(authoringRecord())!==original){persistAuthoring();return;}composerStructured=null;authoringSavedAttachment=null;authoringStorageOk=true;authoringStorageStatus();$('#structuredJson').value='';invalidateAuthoring();$('#formBuilder').hidden=true;$('#structuredJson').hidden=false;updateToolsChrome();updateAuthoringRestore();}}
function exportAuthoring(){try{const envelope={format:'agent-file-board-authoring',version:1,record:checkedAuthoringRecord(authoringRecord())};if(new TextEncoder().encode(JSON.stringify(envelope,null,2)+'\n').length>AUTHORING_LIMIT)throw Error(t("authoring_backup_invalid"));downloadLocalJson('board-authoring-draft.json',envelope);}catch(e){$('#authoringDraftResult').textContent=e.message;}}
async function importAuthoring(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;try{if(file.size>AUTHORING_LIMIT)throw Error(t("authoring_backup_invalid"));const value=JSON.parse(await file.text());if(!value||Object.keys(value).sort().join()!=='format,record,version'||value.format!=='agent-file-board-authoring'||value.version!==1)throw Error(t("authoring_backup_invalid"));const record=checkedAuthoringRecord(value.record);if(!authoringReplaceAllowed())return;applyAuthoringRecord(record);await persistAuthoring();$('#authoringDraftResult').textContent=t("authoring_imported");}catch(e){$('#authoringDraftResult').textContent=e.message;}
}
function updateAuthoringRestore(){const a=authoringSavedAttachment;$('#authoringRestoreAttachment').disabled=!a||a.board!==toolsBoardKey()||B?.layout.dialect!=='native';}
function restoreAuthoringAttachment(){try{const a=authoringSavedAttachment;if(!a||a.board!==toolsBoardKey()||B?.layout.dialect!=='native')throw Error(t("authoring_board_changed"));parseStructured(a.kind,a.raw);composerStructured={...a};updateToolsChrome();persistAuthoring();}catch(e){$('#authoringDraftResult').textContent=e.message;}}
function wireAuthoringDrafts(){
 $('#authoringSave').onclick=saveAuthoringNamed;$('#authoringRestore').onclick=restoreAuthoringNamed;$('#authoringDelete').onclick=deleteAuthoringNamed;$('#authoringClear').onclick=clearAuthoringWorkspace;$('#authoringExport').onclick=exportAuthoring;$('#authoringImportPick').onclick=()=>$('#authoringImport').click();$('#authoringImport').onchange=importAuthoring;$('#authoringRestoreAttachment').onclick=restoreAuthoringAttachment;
 window.addEventListener('beforeunload',event=>{if((authoringPending||!authoringStorageOk)&&$('#structuredJson').value){event.preventDefault();event.returnValue='';}});
}
