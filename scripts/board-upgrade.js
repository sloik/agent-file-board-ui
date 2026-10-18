/* Trusted metadata upgrades. Embedded in the viewer's existing script scope. */
let upgradeDraft=null, upgradeBusy=false, upgradeGeneration=0;
const UPGRADE_PATHS=["GLOSSARY.md","components/board-report-v1.schema.json","components/board-report-v2.schema.json","components/board-report-v3.schema.json","components/form-question-v2.schema.json","components/form-answer-v2.schema.json","components/form-question-v3.schema.json","components/form-answer-v3.schema.json","CONVENTION.md"];
const upgradeBytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const upgradeHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
function upgradeText(bytes){ return new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
function upgradeVersion(value){ return /^\d+\.\d+\.\d+$/.test(value||"")?value.split(".").map(Number):null; }
function upgradeNewer(a,b){ for(let i=0;i<3;i++){ if(a[i]!==b[i]) return a[i]>b[i]; } return false; }
async function upgradeRead(root,rel){
  let dir=root;
  try{
    const parts=rel.split("/");
    for(const name of parts.slice(0,-1)) dir=await dir.getDirectoryHandle(name);
    const file=await (await dir.getFileHandle(parts.at(-1))).getFile();
    if(file.size>1048576) throw Error(t("upgrade_large"));
    return file.arrayBuffer?new Uint8Array(await file.arrayBuffer()):new TextEncoder().encode(await file.text());
  }catch(e){ if(e.name==="NotFoundError") return null; throw e; }
}
async function upgradePlan(root){
  if(UPGRADE_DATA.files.map(r=>r.path).join("|")!==UPGRADE_PATHS.join("|")) throw Error(t("upgrade_invalid"));
  const files=[], blocked=[];
  for(const row of UPGRADE_DATA.files){
    if(await upgradeHash(upgradeBytes(row.content))!==row.sha256) throw Error(t("upgrade_invalid"));
    const old=await upgradeRead(root,row.path), before=old===null?null:await upgradeHash(old);
    if(before!==null && !row.known.includes(before)) blocked.push(t("upgrade_custom",{path:row.path}));
    files.push({path:row.path,before,after:row.sha256,old,content:row.content,action:before===row.sha256?"keep":old===null?"add":"replace"});
  }
  const convention=files.find(r=>r.path==="CONVENTION.md").old;
  const from=convention?(/^Version:\s*(\S+)\s*$/m.exec(upgradeText(convention))||[])[1]:null;
  const current=upgradeVersion(from), target=upgradeVersion(UPGRADE_DATA.version);
  if(current && upgradeNewer(current,target)) blocked.push(t("upgrade_newer"));
  else if(!current || !UPGRADE_DATA.supported.includes(from)) blocked.push(t("upgrade_unsupported"));
  return {root,dir:dirHandle,from,files,blocked,signature:JSON.stringify(files.map(r=>[r.path,r.before,r.after]))};
}
function upgradeSameBoard(plan){ return plan.dir===dirHandle && B?.layout.dialect==="native"; }
async function upgradeWrite(root,rel,text,expected){
  // Message writer remains append-only. Only these metadata/backup paths may replace files.
  const backup=/^upgrade-backups\/[a-f0-9]{32}\/(?:(?:snapshot|complete)\.json|GLOSSARY\.md|CONVENTION\.md|components\/(?:board-report-v[123]|form-(?:question|answer)-v2)\.schema\.json)$/.test(rel);
  if(!backup && !UPGRADE_PATHS.includes(rel)) throw Error(t("e_path"));
  let dir=root; const parts=rel.split("/");
  for(const name of parts.slice(0,-1)) dir=await dir.getDirectoryHandle(name,{create:true});
  const name=parts.at(-1);
  if(backup) await guardNoOverwrite(dir,name);
  else{
    const old=await upgradeRead(root,rel);
    if((old===null?null:await upgradeHash(old))!==expected) throw Error(t("upgrade_stale"));
  }
  const handle=await dir.getFileHandle(name,{create:true}), writer=await handle.createWritable();
  try{ await writer.write(text); await writer.close(); }
  catch(e){ try{ await writer.abort?.(); }catch(_){} throw e; }
}
function upgradeHelp(){
  $("#upgradeVersions").textContent=t("upgrade_versions",{viewer:VIEWER_VERSION,board:B?.boardVersion||t("ver_unknown"),target:UPGRADE_DATA.version});
  $("#upgradeFolder").textContent=t("upgrade_folder",{name:dirHandle?.name||t("read_only")});
  $("#upgradeCommands").textContent="python3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project\npython3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project --apply --expect <fingerprint>\npython3 /path/to/agent-file-board/boardctl.py upgrade --path /path/to/project --check-latest";
}
async function openUpgrade(){
  if(upgradeBusy) return;
  const generation=++upgradeGeneration;
  upgradeDraft=null; upgradeHelp(); $("#upgradeDetails").open=false;
  $("#upgradeApply").disabled=true; $("#upgradePreview").disabled=true;
  $("#upgradeResult").textContent=t("upgrade_checking"); $("#upgradeFiles").textContent="";
  if(!$("#upgradeDialog").open) $("#upgradeDialog").showModal();
  if(!B || B.layout.dialect!=="native" || !baseHandle){
    $("#upgradeResult").textContent=t("upgrade_readonly"); $("#upgradeDetails").open=true; return;
  }
  const root=baseHandle, dir=dirHandle;
  try{
    const plan=await upgradePlan(root);
    if(generation!==upgradeGeneration) return;
    if(dir!==dirHandle) throw Error(t("upgrade_stale"));
    upgradeDraft=plan;
    $("#upgradeFiles").textContent=plan.files.map(r=>t("upgrade_file",{path:r.path,action:({keep:t("upgrade_keep"),add:t("upgrade_add"),replace:t("upgrade_replace")})[r.action]})).join("\n");
    const changes=plan.files.some(r=>r.action!=="keep");
    $("#upgradeResult").textContent=plan.blocked.length?plan.blocked.join("\n"):changes?t("upgrade_ready"):t("upgrade_current");
    $("#upgradeApply").disabled=!!plan.blocked.length || !changes;
  }catch(e){ if(generation===upgradeGeneration) $("#upgradeResult").textContent=e.message; }
  finally{ if(generation===upgradeGeneration) $("#upgradePreview").disabled=false; }
}
async function applyUpgrade(){
  if(upgradeBusy || !upgradeDraft || upgradeDraft.blocked.length || !upgradeDraft.files.some(r=>r.action!=="keep")) return;
  const plan=upgradeDraft; upgradeDraft=null; upgradeBusy=true;
  $("#upgradeApply").disabled=true; $("#upgradePreview").disabled=true;
  let backup=null;
  try{
    if(!upgradeSameBoard(plan)) throw Error(t("upgrade_stale"));
    const permission=await plan.root.requestPermission({mode:"readwrite"});
    if(permission!=="granted") throw Error(t("upgrade_permission"));
    if(!upgradeSameBoard(plan)) throw Error(t("upgrade_stale"));
    let fresh=await upgradePlan(plan.root);
    if(fresh.signature!==plan.signature || fresh.blocked.length) throw Error(t("upgrade_stale"));
    const changes=plan.files.filter(r=>r.action!=="keep");
    backup="upgrade-backups/"+crypto.randomUUID().replaceAll("-","");
    const snapshot={created:new Date().toISOString(),state:"prepared",plan:{from:plan.from,to:UPGRADE_DATA.version,files:plan.files.map(({path,before,after,action})=>({path,before,after,action}))}};
    for(const row of changes){
      if(!upgradeSameBoard(plan)) throw Error(t("upgrade_stale"));
      if(row.old!==null) await upgradeWrite(plan.root,backup+"/"+row.path,upgradeText(row.old));
    }
    await upgradeWrite(plan.root,backup+"/snapshot.json",JSON.stringify(snapshot,null,2)+"\n");
    fresh=await upgradePlan(plan.root);
    if(!upgradeSameBoard(plan) || fresh.signature!==plan.signature || fresh.blocked.length) throw Error(t("upgrade_stale"));
    for(const row of changes){
      if(!upgradeSameBoard(plan)) throw Error(t("upgrade_stale"));
      await upgradeWrite(plan.root,row.path,upgradeText(upgradeBytes(row.content)),row.before);
    }
    const verify=await upgradePlan(plan.root);
    if(verify.blocked.length || verify.files.some(r=>r.action!=="keep")) throw Error(t("upgrade_verify"));
    if(!upgradeSameBoard(plan)) throw Error(t("upgrade_stale"));
    await upgradeWrite(plan.root,backup+"/complete.json",JSON.stringify({version:UPGRADE_DATA.version,completed:new Date().toISOString()})+"\n");
    await readFromHandle();
    upgradeHelp(); $("#upgradeResult").textContent=t("upgrade_done",{version:UPGRADE_DATA.version,backup});
  }catch(e){ $("#upgradeResult").textContent=backup?t("upgrade_failed_backup",{error:e.message,backup}):e.message; }
  finally{ upgradeBusy=false; $("#upgradePreview").disabled=false; }
}
