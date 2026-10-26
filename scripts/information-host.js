/* Host-owned local state reads. A package cannot select files or execute sources. */
const informationFileCache=new Map();
const INFORMATION_ARTIFACTS=128,INFORMATION_BYTES=67108864;
function resetInformation(){informationFileCache.clear();}
function informationDeclarations(model){
 const declarations=new Map();
 for(const m of model.msgs){
  if(m.metadataError||!m.h.INFORMATION)continue;
  try{const extension=m.h.EXTENSION?ExtensionContract.parse(m.h.EXTENSION,65536):null;
   const info=InformationContract.validateInformation(m.h.INFORMATION,extension,!!m.h['EXTENSION-ANSWER']);
   declarations.set(m.path,{info,extension,scope:m.path.split('/').slice(0,2).join('/')});
  }catch(e){m.informationError=e.message;}
 }
 return declarations;
}
async function collectInformationFiles(model,sourceFiles,base,force=false){
 const declarations=informationDeclarations(model),wanted=new Map(),out=new Map();
 for(const d of declarations.values())for(const item of d.info.items)if(item.tracking){
  const scopes=wanted.get(item.tracking.artifact)||new Set();scopes.add(d.scope);wanted.set(item.tracking.artifact,scopes);
 }
 let total=0,index=0;
 const cachedRead=async(file,path)=>{
  if(file.size>InformationContract.MAX||total+file.size>INFORMATION_BYTES)throw Object.assign(Error('information byte limit'),{limit:true});
  total+=file.size;
  const saved=informationFileCache.get(path);
  if(!force&&file.lastModified>0&&saved?.size===file.size&&saved.modified===file.lastModified)return saved.raw;
  const raw=await rawBytes(file);
  if(raw.length!==file.size||raw.length>InformationContract.MAX)throw Error('information file changed during read');
  informationFileCache.set(path,{size:file.size,modified:file.lastModified,raw});return raw;
 };
 let state=null,stateError=null;
 if(base){try{state=await(await base.getDirectoryHandle('extensions')).getDirectoryHandle('state');}catch(e){if(e.name!=='NotFoundError')stateError=e;}}
 const uploaded=new Map(sourceFiles.filter(f=>f.stateFile).map(f=>[f.path,f.stateFile]));
 for(const [id,scopes]of wanted){
  const prefix='extensions/state/'+id+'/',definitionPath=prefix+'definition.json';
  if(++index>INFORMATION_ARTIFACTS){out.set(definitionPath,{error:'information artifact limit',limit:true});continue;}
  try{
   if(stateError)throw stateError;
   let dir=null,definitionFile;
   if(base){if(!state)continue;try{dir=await state.getDirectoryHandle(id);definitionFile=await(await dir.getFileHandle('definition.json')).getFile();}catch(e){if(e.name==='NotFoundError')continue;throw e;}}
   else definitionFile=uploaded.get(definitionPath);
   if(!definitionFile)continue;
   const definitionRaw=await cachedRead(definitionFile,definitionPath);out.set(definitionPath,definitionRaw);
   let definition;try{definition=InformationContract.validateDefinition(definitionRaw);}catch{continue;}
   // Foreign source bytes never enter the resolved component context.
   if(!scopes.has(definition.scope))continue;
   let count=0,bytes=0;
   const add=async(name,file)=>{
    if(++count>InformationContract.MAX_REVISIONS||bytes+file.size>InformationContract.MAX_TOTAL)throw Object.assign(Error('information revision limit'),{limit:true});
    bytes+=file.size;out.set(prefix+'revisions/'+name,await cachedRead(file,prefix+'revisions/'+name));
   };
   if(base){
    let revisions;try{revisions=await dir.getDirectoryHandle('revisions');}catch(e){if(e.name==='NotFoundError')continue;throw e;}
    for await(const [name,handle]of revisions.entries()){
     if(name==='.DS_Store'||name.startsWith('.pending-'))continue;
     if(handle.kind!=='file')throw Error('unexpected information revision entry');
     await add(name,await handle.getFile());
    }
   }else for(const [path,file]of uploaded)if(path.startsWith(prefix+'revisions/')){const name=path.slice((prefix+'revisions/').length);if(name!=='.DS_Store'&&!name.startsWith('.pending-'))await add(name,file);}
  }catch(e){out.set(out.has(definitionPath)?prefix+'revisions/.error':definitionPath,{error:String(e.message).slice(0,200),limit:!!e.limit});}
 }
 if(!force)for(const path of informationFileCache.keys())if(!out.has(path))informationFileCache.delete(path);
 return {files:out,declarations};
}
async function prepareInformation(model,sourceFiles,base=null,force=false){
 const loaded=await collectInformationFiles(model,sourceFiles,base,force),contexts=new Map();
 const catalog=model.extensions?.catalog||new Map(),now=Date.now();
 for(const m of model.msgs)if(!m.metadataError&&m.h['EXTENSION-ANSWER'])try{
  const answer=ExtensionContract.parse(m.h['EXTENSION-ANSWER'],65536),source=loaded.declarations.get(answer.source.message);
  const refs=(source?.info.items||[]).filter(i=>i.tracking).map(i=>({id:i.id,artifact:i.tracking.artifact,definition:i.tracking.definition})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const review=loaded.declarations.get(m.path)?.info.review;
  ExtensionContract.require(!refs.length||review,'tracked extension answer requires reviewed state bindings');
  if(review)ExtensionContract.require(InformationContract.stable(review.bindings.map(({id,artifact,definition})=>({id,artifact,definition})))===InformationContract.stable(refs),'review bindings differ from source');
 }catch(e){m.metadataError=true;m.informationError=e.message;m.validationError=e.message;}
 for(const [path,d]of loaded.declarations){try{
  // Review-only answer metadata has no drawing inputs.
  const info={version:1,items:d.info.items};
  if(!info.items.length)continue;
  contexts.set(path,await InformationContract.buildContext(info,d.extension,d.scope,loaded.files,catalog,now));
 }catch(e){model.byPath.get(path).informationError=e.message;}}
 model.informationContexts=contexts;model.informationFiles=loaded.files;model.informationDeclarations=loaded.declarations;
}
async function informationReviewGuard(m,expectedContext){
 const declared=B?.informationDeclarations?.get(m.path);
 if(!declared||!declared.info.items.some(i=>i.tracking))return null;
 const expected=InformationContract.reviewBindings(declared.info,expectedContext);
 let context=informationContext(m);
 if(canWrite()){
  const model=B,origin=dirHandle,identity=currentUser();
  const loaded=await collectInformationFiles({...model,msgs:[m]},[],baseHandle,true);
  ExtensionContract.require(B===model&&origin===dirHandle&&identity===currentUser(),'information reply context changed');
  context=await InformationContract.buildContext({version:1,items:declared.info.items},declared.extension,declared.scope,loaded.files,model.extensions.catalog);
 }
 ExtensionContract.require(InformationContract.stable(InformationContract.reviewBindings(declared.info,context))===InformationContract.stable(expected),'Shared state changed since review. Refresh and review the reply again.');
 return {version:1,items:[],review:expected};
}
function informationClock(){
 if(!B?.informationContexts?.size)return;
 let changed=false;
 for(const [path,context]of B.informationContexts){
  const declaration=B.informationDeclarations.get(path);
  for(const item of declaration?.info.items||[]){
   const latest=context.information[item.id]?.latest;
   if(!item.tracking||latest?.status!=='resolved'||!latest.observedAt)continue;
   try{const raw=B.informationFiles.get('extensions/state/'+item.tracking.artifact+'/definition.json'),definition=InformationContract.validateDefinition(raw);
    const age=Date.now()-InformationContract.time(latest.observedAt),freshness=age < -60000?'future':age>=definition.staleAfterSeconds*1000?'stale':'fresh';
    if(freshness!==latest.freshness){latest.freshness=freshness;changed=true;}
   }catch{}
  }
 }
 if(changed)render(true);
}
setInterval(informationClock,30000);
