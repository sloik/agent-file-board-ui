/* Offline authoring: preview is isolated; attachment uses the normal composer. */
let authoringValid=null,authoringDispose=null,composerStructured=null;
function toolsBoardKey(){return B?JSON.stringify([formStorageIdentity||boardStorageId,B.layout.dialect]):null;}
function disposeAuthoring(){try{authoringDispose?.();}finally{authoringDispose=null;}}
function invalidateAuthoring(){authoringValid=null;disposeAuthoring();$('#structuredPreview').replaceChildren();$('#structuredError').textContent='';$('#structuredAttach').disabled=true;}
function parseStructured(kind,raw){
 if(new TextEncoder().encode(raw).length>262144)throw Error(t("tools_input_limit"));
 const value=kind==='report'?reportValue(raw):kind==='form'?questionValue(raw):null;
 if(!value||(kind==='form'&&![2,3].includes(value.version)))throw Error(t("authoring_typed_only"));
 return value;
}
function loadAuthoringExample(initial=false){if(!initial&&!authoringReplaceAllowed())return;showAuthoringJson();const item=AUTHORING_EXAMPLES.find(x=>x.id===$('#structuredExample').value);if(!item)return;$('#structuredKind').value=item.kind;$('#structuredJson').value=JSON.stringify(item.value,null,2);invalidateAuthoring();persistAuthoring();}
function closeAuthoring(){disposeAuthoring();authoringValid=null;$('#structuredAttach').disabled=true;$('#structuredPreview').replaceChildren();$('#structuredError').textContent='';$('#structuredDialog').close();}
function openAuthoring(){if(!$('#structuredJson').value)loadAuthoringExample(true);if(!$('#formBuilder').hidden&&builderQuestion)renderFormBuilder();authoringStorageStatus();renderAuthoringSaved();updateAuthoringRestore();if(!$('#structuredDialog').open)$('#structuredDialog').showModal();}
function validateAuthoring(){
 invalidateAuthoring();const kind=$('#structuredKind').value,raw=$('#structuredJson').value;
 try{const value=parseStructured(kind,raw),node=document.createElement('div');node.className=kind==='report'?'board-report':'board-form authoring-form';$('#structuredPreview').append(node);
  const fail=()=>{$('#structuredError').textContent=t("report_failed");authoringValid=null;$('#structuredAttach').disabled=true;};
  authoringDispose=kind==='report'?window.BoardReportRenderer.mount(node,value,fail,reportLabels()):window.BoardFormRenderer.mount(node,value,{draft:BoardFormContract.initial(value),eligible:true,busy:false,storageStatus:'',words:{...formWords(),hint:t("authoring_preview_only")},onDraft:()=>{},onSubmit:async()=>t("authoring_preview_only")},fail);
  if($('#structuredError').textContent)return;
  authoringValid={kind,raw};$('#structuredError').textContent=t("authoring_valid");$('#structuredAttach').disabled=!B||B.layout.dialect!=='native';
 }catch(error){disposeAuthoring();$('#structuredPreview').replaceChildren();$('#structuredError').textContent=error.message;}
}
function attachStructured(){
 try{if(!authoringValid||authoringValid.kind!==$('#structuredKind').value||authoringValid.raw!==$('#structuredJson').value)throw Error(t("authoring_validate_first"));if(!B||B.layout.dialect!=='native')throw Error(t("authoring_native"));
  parseStructured(authoringValid.kind,authoringValid.raw);composerStructured={...authoringValid,board:toolsBoardKey()};authoringSavedAttachment={...composerStructured};persistAuthoring();updateToolsChrome();closeAuthoring();$('#cBody').focus();
 }catch(error){$('#structuredError').textContent=error.message;}
}
function clearStructuredAttachment(){composerStructured=null;authoringSavedAttachment=null;persistAuthoring();updateToolsChrome();}
function structuredComposerPayload(){
 if(!composerStructured)return {};
 if(composerStructured.board!==toolsBoardKey()||B?.layout.dialect!=='native')throw Error(t("authoring_board_changed"));
 const value=parseStructured(composerStructured.kind,composerStructured.raw);return composerStructured.kind==='report'?{ui:value}:{question:value};
}
function updateToolsChrome(){
 if($('#draftsDialog').open&&draftManagerBinding&&!sameDraftBinding(draftManagerBinding))closeDraftManager();
 if(composerStructured&&composerStructured.board!==toolsBoardKey())composerStructured=null;
 updateAuthoringRestore();
 $('#draftsOpen').disabled=!B;$('#structuredAttachment').hidden=!composerStructured;
 if(composerStructured){const value=parseStructured(composerStructured.kind,composerStructured.raw);$('#structuredAttachedText').textContent=t("authoring_attached",{kind:composerStructured.kind==='report'?t("authoring_report"):t("authoring_form"),title:(value.title||value.prompt).slice(0,120)});}
 $('#structuredAttach').disabled=!authoringValid||!B||B.layout.dialect!=='native';
}
function downloadLocalJson(name,value){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json;charset=utf-8'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function wireOfflineTools(){
 wireAuthoringDrafts();wireFormBuilder();wireLocations();
 $('#structuredOpen').onclick=openAuthoring;$('#structuredClose').onclick=closeAuthoring;$('#structuredDialog').addEventListener('cancel',event=>{event.preventDefault();closeAuthoring();});$('#structuredDialog').addEventListener('close',()=>{if(!$('#structuredDialog').open){disposeAuthoring();authoringValid=null;$('#structuredAttach').disabled=true;$('#structuredPreview').replaceChildren();}});
 $('#structuredLoad').onclick=()=>loadAuthoringExample();$('#structuredKind').onchange=()=>{showAuthoringJson();invalidateAuthoring();persistAuthoring();};$('#structuredJson').oninput=()=>{invalidateAuthoring();persistAuthoring();};$('#structuredValidate').onclick=validateAuthoring;$('#structuredAttach').onclick=attachStructured;$('#structuredRemove').onclick=clearStructuredAttachment;
 $('#draftsOpen').onclick=openDraftManager;$('#draftsClose').onclick=closeDraftManager;$('#draftImport').onchange=importManagedDraft;$('#draftImportPick').onclick=()=>$('#draftImport').click();$('#draftsDialog').addEventListener('cancel',event=>{event.preventDefault();closeDraftManager();});$('#draftsDialog').addEventListener('close',()=>{if(!$('#draftsDialog').open){draftManagerBinding=null;draftManagerGeneration++;}});
}
