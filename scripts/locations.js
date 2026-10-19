/* Most recently opened locations. Handles stay local; uploaded files are never saved. */
const LOCATION_STORE='location-history-v1',LOCATION_LIMIT=20;
let locationRecords=[],locationWrites=Promise.resolve(),locationStored=true,locationBusy=false,locationIntent=0,locationLoading=false,locationDialogGeneration=0,locationPendingUpdates=[];
function cleanLocations(value){
 const records=[];for(const row of Array.isArray(value?.records)?value.records.slice(0,LOCATION_LIMIT):[]){
  if(!row||typeof row.id!=='string'||row.id.length>80||typeof row.name!=='string'||row.name.length>500||!['native','upload'].includes(row.kind)||!(row.openedAt===null||typeof row.openedAt==='string'&&Number.isFinite(Date.parse(row.openedAt))))continue;
  if(row.kind==='native'&&(!row.handle||typeof row.handle.getDirectoryHandle!=='function'))continue;
  if(row.kind==='upload'&&(typeof row.fingerprint!=='string'||!/^upload-[a-f0-9]{64}$/.test(row.fingerprint)))continue;
  if(!records.some(x=>x.id===row.id))records.push(row);
 }return {revision:typeof value?.revision==='string'?value.revision:null,records};
}
async function readLocations(){const db=await idb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('kv'),q=tx.objectStore('kv').get(LOCATION_STORE);tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Location read aborted'));});}finally{db.close();}}
async function sameLocationHandle(a,b){try{return !!a&&!!b&&typeof a.isSameEntry==='function'&&await a.isSameEntry(b);}catch{return false;}}
async function nativeLocationMatches(row,handle,boardHandle){return row.kind==='native'&&(await sameLocationHandle(row.handle,handle)||await sameLocationHandle(row.boardHandle||row.handle,boardHandle));}
async function commitLocations(expected,records){
 const db=await idb();try{await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),kv=tx.objectStore('kv'),q=kv.get(LOCATION_STORE);let conflict=false;
 q.onsuccess=()=>{try{if(cleanLocations(q.result).revision!==expected){conflict=true;tx.abort();return;}const revision=crypto.randomUUID();kv.put({revision,records},LOCATION_STORE);kv.put(records[0]?.kind==='native'?records[0].handle:null,'lastDir');}catch(error){tx.abort();reject(error);}};
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(conflict?Object.assign(Error('Location history changed'),{conflict:true}):tx.error||Error('Location transaction aborted'));});}finally{db.close();}
}
function changeLocations(update,{retainOnFailure=false}={}){
 const next=locationWrites.then(async()=>{
  let candidate;try{for(let attempt=0;attempt<4;attempt++){const stored=cleanLocations(await readLocations());let base=stored.records;for(const pending of locationPendingUpdates)base=await pending(base);candidate=(await update(base)).slice(0,LOCATION_LIMIT);try{await commitLocations(stored.revision,candidate);locationRecords=candidate;locationPendingUpdates=[];locationStored=true;renderLocations();return true;}catch(e){if(!e.conflict)throw e;}}throw Error(t("locations_changed"));
  }catch(e){locationStored=false;if(!retainOnFailure){locationPendingUpdates.push(update);locationRecords=(await update(locationRecords)).slice(0,LOCATION_LIMIT);}renderLocations();$('#locationsResult').textContent=t(retainOnFailure?"locations_delete_failed":"locations_memory");return false;}
 });locationWrites=next.catch(()=>{});return next;
}
async function initLocations(){
 try{const value=await readLocations(),store=cleanLocations(value);locationRecords=store.records;
  if(value===undefined||value===null){const handle=await idbGet('lastDir');if(handle&&typeof handle.getDirectoryHandle==='function')await changeLocations(async records=>{for(const row of records)if(await nativeLocationMatches(row,handle,handle))return records;return [{id:crypto.randomUUID(),kind:'native',name:handle.name||'',handle,boardHandle:handle,openedAt:null},...records];});}
 }catch{locationStored=false;}
}
async function rememberNativeLocation(handle,boardHandle){const fresh={id:crypto.randomUUID(),kind:'native',name:handle.name||'',handle,boardHandle,openedAt:new Date().toISOString()};return changeLocations(async records=>{const rest=[];let prior=null;for(const row of records){if(await nativeLocationMatches(row,handle,boardHandle))prior??=row;else rest.push(row);}return [{...fresh,id:prior?.id||fresh.id},...rest];});}
async function rememberUploadLocation(name,fingerprint){const fresh={id:crypto.randomUUID(),kind:'upload',name,fingerprint,openedAt:new Date().toISOString()};return changeLocations(records=>{const prior=records.find(r=>r.kind==='upload'&&r.fingerprint===fingerprint);return [{...fresh,id:prior?.id||fresh.id},...records.filter(r=>r.kind!=='upload'||r.fingerprint!==fingerprint)];});}
function locationButton(parent,label,action){const b=document.createElement('button');b.className='btn';b.type='button';b.textContent=label;b.disabled=locationBusy||locationLoading;b.onclick=action;parent.append(b);return b;}
function renderLocations(){
 if(!$('#locationsDialog').open)return;$('#open').disabled=locationBusy||locationLoading;const list=$('#locationsList');list.setAttribute('aria-busy',String(locationLoading));list.replaceChildren();$('#locationsStorage').textContent=t(locationStored?"locations_local":"locations_memory");$('#locationsClear').disabled=locationBusy||locationLoading||!locationRecords.length;
 if(locationLoading){const p=document.createElement('p');p.textContent=t("locations_loading");list.append(p);return;}
 if(!locationRecords.length){const p=document.createElement('p');p.textContent=t("locations_empty");list.append(p);return;}
 for(const row of locationRecords){const item=document.createElement('section');item.className='location-entry';item.dataset.location=row.id;item.dataset.kind=row.kind;const name=document.createElement('strong');name.textContent=row.name;item.append(name);const meta=document.createElement('p');meta.className='hint';meta.textContent=t(row.kind==='native'?"locations_native":"locations_upload")+' · '+(row.openedAt?new Date(row.openedAt).toLocaleString(S.lang==='pl'?'pl-PL':'en-GB'):t("locations_previous"));item.append(meta);const actions=document.createElement('div');actions.className='tool-actions';locationButton(actions,t(row.kind==='native'?"locations_reopen":"locations_choose"),()=>openRecentLocation(row));locationButton(actions,t("locations_remove"),()=>removeLocation(row));item.append(actions);list.append(item);}
}
async function openLocations(){const generation=++locationDialogGeneration;$('#locationsResult').textContent='';if(!$('#locationsDialog').open)$('#locationsDialog').showModal();$('#folderName').setAttribute('aria-expanded','true');locationLoading=true;renderLocations();await locationWrites;try{const stored=cleanLocations(await readLocations());if(generation!==locationDialogGeneration)return;let rows=stored.records;for(const pending of locationPendingUpdates)rows=await pending(rows);if(generation!==locationDialogGeneration)return;locationRecords=rows.slice(0,LOCATION_LIMIT);}catch{locationStored=false;}finally{if(generation===locationDialogGeneration){locationLoading=false;renderLocations();}}}
function closeLocations(){locationDialogGeneration++;locationLoading=false;$('#locationsDialog').close();$('#folderName').setAttribute('aria-expanded','false');}
async function openRecentLocation(row){
 if(locationBusy)return;const intent=++locationIntent,generation=locationDialogGeneration;
 if(row.kind==='upload'){closeLocations();$('#fallback').value='';$('#fallback').click();return;}
 locationBusy=true;renderLocations();$('#locationsResult').textContent=t("locations_opening");
 try{if(typeof row.handle.requestPermission!=='function'||await row.handle.requestPermission({mode:'readwrite'})!=='granted')throw Error(t("toast_no_perm"));if(intent!==locationIntent)return;const ok=await useDir(row.handle);if(intent!==locationIntent||generation!==locationDialogGeneration)return;if(!ok)throw Error(t("e_no_board"));closeLocations();}catch(e){if(intent===locationIntent&&generation===locationDialogGeneration){$('#locationsResult').textContent=e.message;if(!$('#locationsDialog').open)toast(e.message);}}finally{locationBusy=false;renderLocations();}
}
async function chooseNewLocation(){
 if(locationBusy||locationLoading)return;
 const intent=++locationIntent,generation=locationDialogGeneration;
 if(!window.showDirectoryPicker){closeLocations();$('#fallback').value='';$('#fallback').click();return;}
 locationBusy=true;renderLocations();$('#locationsResult').textContent='';
 try{
  const handle=await window.showDirectoryPicker({mode:'readwrite',id:'agent-board'});
  if(intent!==locationIntent)return;
  const ok=await useDir(handle);
  if(intent!==locationIntent||generation!==locationDialogGeneration)return;
  if(ok)closeLocations();else $('#locationsResult').textContent=t('e_no_board');
 }catch(error){if(error?.name!=='AbortError'&&intent===locationIntent&&generation===locationDialogGeneration)$('#locationsResult').textContent=error.message;}
 finally{locationBusy=false;renderLocations();}
}
async function withoutLocation(records,row){const keep=[];for(const item of records){if(item.id===row.id||row.kind==='upload'&&item.kind==='upload'&&item.fingerprint===row.fingerprint||row.kind==='native'&&await nativeLocationMatches(item,row.handle,row.boardHandle||row.handle))continue;keep.push(item);}return keep;}
async function removeLocation(row){
 if(locationBusy||!confirm(t("locations_remove_confirm",{name:row.name})))return;locationBusy=true;renderLocations();const ok=await changeLocations(records=>withoutLocation(records,row),{retainOnFailure:true});locationBusy=false;renderLocations();if(ok)$('#banner').classList.remove('show');
}
async function clearLocations(){
 if(locationBusy||!confirm(t("locations_clear_confirm")))return;locationBusy=true;renderLocations();const ok=await changeLocations(()=>[],{retainOnFailure:true});locationBusy=false;renderLocations();if(ok)$('#banner').classList.remove('show');
}
async function forgetLastLocation(){const row=locationRecords[0];if(row)await changeLocations(records=>withoutLocation(records,row),{retainOnFailure:true});else try{await idbSet('lastDir',null);}catch{toast(t("locations_delete_failed"));return;}if(!locationRecords.some(r=>r.id===row?.id))$('#banner').classList.remove('show');else toast(t("locations_delete_failed"));}
async function offerLastLocation(){
 if(!S.autoOpen)return;const row=locationRecords[0],intent=locationIntent;if(!row)return;
 if(row.kind==='native'&&window.showDirectoryPicker)try{if(await row.handle.queryPermission({mode:'readwrite'})==='granted'){if(intent===locationIntent)await useDir(row.handle);return;}}catch{}
 if(intent!==locationIntent)return;$('#lastName').textContent=row.name;$('#banner').classList.add('show');$('#reopen').onclick=()=>openRecentLocation(row);$('#forget').onclick=forgetLastLocation;
}
function wireLocations(){$('#folderName').onclick=openLocations;$('#locationsClose').onclick=closeLocations;$('#locationsClear').onclick=clearLocations;$('#locationsDialog').addEventListener('cancel',e=>{e.preventDefault();closeLocations();});}
