/* Local follow notifications. No service worker, push, transport or message mutation. */
const NOTIFY_LIMIT=50,NOTIFY_FOLLOW_LIMIT=100;
let notificationState=null,notificationEpoch=0,notificationWrites=Promise.resolve(),notificationOS=false,notificationPermissionNote=null;
const notificationMemory=new Map();
function notificationBinding(){return B?JSON.stringify([dirHandle?boardStorageId:"upload-session",currentUser()]):"";}
function notificationCurrent(state){return state===notificationState&&state.binding===notificationBinding()&&state.root===dirHandle;}
async function readNotificationFollows(key){const db=await idb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("kv"),q=tx.objectStore("kv").get(key);tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error("Notification preference read aborted"));});}finally{db.close();}}
function cleanNotificationFollows(value){
 const result=[];for(const item of Array.isArray(value)?value.slice(0,NOTIFY_FOLLOW_LIMIT):[]){if(!item||!["room","thread","participant"].includes(item.kind)||typeof item.key!=="string"||!item.key||item.key.length>1000)continue;if(!result.some(x=>x.kind===item.kind&&x.key===item.key))result.push({kind:item.kind,key:item.key});}return result;
}
function notificationsContext(reset=false){
 const binding=notificationBinding();if(!binding)return null;
 if(!reset&&notificationState?.binding===binding&&notificationState.root===dirHandle)return notificationState;
 if(notificationState)for(const alert of notificationState.system)try{alert.close();}catch{}
 const durable=!!dirHandle&&!!formStorageIdentity&&!boardStorageId.startsWith("session-");
 const state={binding,root:dirHandle,epoch:++notificationEpoch,model:B,follows:[],entries:[],system:[],delivered:new Set(),stored:durable,ready:!durable,store:durable?"notification-follows-v1:"+binding:null,scan:Promise.resolve(),pending:new Map(),scanning:false};
 notificationState=state;notificationPermissionNote=null;
 const memoryKey=durable?binding:null;if(memoryKey&&notificationMemory.has(memoryKey)){state.follows=notificationMemory.get(memoryKey);state.ready=true;state.stored=false;}
 else if(durable)state.loading=(async()=>{try{const value=await readNotificationFollows(state.store);if(notificationCurrent(state))state.follows=cleanNotificationFollows(value);}catch{state.stored=false;}finally{state.ready=true;if(notificationCurrent(state))renderNotifications();}})();
 renderNotifications();return state;
}
function notificationMatches(state,m){return state.follows.some(x=>x.kind==="room"?m.scope==="room"&&m.dir===x.key:x.kind==="thread"?m.tkey===x.key:m.author===x.key);}
function notificationEligible(m){return !m.metadataError&&!m.quarantined&&!m.receipt&&!m.source?.readError&&!m.source?.ioError&&m.author!==currentUser()&&repairVisible(m);}
function notificationsObserve(model,background){
 const state=notificationsContext(!background);if(!state)return;
 const previous=state.model;state.model=model;
 // Baseline even while preferences load: never replay history or a missed startup interval.
 if(!background||!state.ready||previous===model)return;
 const candidates=model.msgs.filter(m=>!previous.byPath.has(m.path)&&notificationMatches(state,m)&&notificationEligible(m)).slice(-NOTIFY_LIMIT);
 for(const candidate of candidates){state.pending.set(candidate.path,true);if(state.pending.size>NOTIFY_LIMIT)state.pending.delete(state.pending.keys().next().value);}
 if(!state.scanning)state.scan=drainNotifications(state);
}
async function drainNotifications(state){
 state.scanning=true;
 try{while(state.pending.size){
  const path=state.pending.keys().next().value;state.pending.delete(path);
  if(!notificationCurrent(state))return;const model=B,current=model?.byPath.get(path);if(!current||state.delivered.has(path)||!notificationMatches(state,current)||!notificationEligible(current))continue;
  try{await hydrateMessages([current],model);}catch{continue;}
  if(!notificationCurrent(state))return;
  if(B!==model){if(B.byPath.has(path)){state.pending.set(path,true);if(state.pending.size>NOTIFY_LIMIT)state.pending.delete(state.pending.keys().next().value);}continue;}
  if(!notificationEligible(current)||!notificationMatches(state,current)||!current.bodyLoaded)continue;
  state.delivered.add(path);if(state.delivered.size>1000)state.delivered.delete(state.delivered.values().next().value);
  const entry={path,unread:true,author:current.author,title:current.dir+" · "+current.label,preview:current.body.slice(0,240)};
  state.entries.unshift(entry);state.entries.length=Math.min(state.entries.length,NOTIFY_LIMIT);notificationSystem(state,entry);renderNotifications();
 }}catch{if(notificationCurrent(state)){notificationPermissionNote="error";renderNotifications();}}finally{state.scanning=false;}
}

function notificationSystem(state,entry){
 if(!notificationOS||typeof window.Notification!=="function"||Notification.permission!=="granted")return;
 try{const alert=new Notification(entry.title,{body:entry.author+": "+entry.preview,tag:"afb-"+state.epoch+"-"+entry.path});state.system.push(alert);if(state.system.length>NOTIFY_LIMIT)state.system.shift().close();alert.onclick=()=>{try{alert.close();}catch{}if(notificationCurrent(state)){window.focus();activateNotification(state,entry,false);}};alert.onerror=()=>{if(notificationCurrent(state)){notificationPermissionNote="error";renderNotifications();}};}
 catch{notificationPermissionNote="error";renderNotifications();}
}
async function enableNotificationOS(){
 const state=notificationsContext();if(!state)return;
 if(typeof window.Notification!=="function"||typeof Notification.requestPermission!=="function"){notificationPermissionNote="unavailable";renderNotifications();return;}
 try{const permission=await Notification.requestPermission();if(!notificationCurrent(state))return;notificationOS=permission==="granted";notificationPermissionNote=permission==="granted"?"granted":permission==="denied"?"denied":"default";}catch{if(!notificationCurrent(state))return;notificationOS=false;notificationPermissionNote="error";}renderNotifications();
}
function notificationButton(parent,label,action){const b=document.createElement("button");b.type="button";b.className="btn";b.textContent=label;b.onclick=action;parent.append(b);return b;}
function changeNotificationFollow(kind,key,remove=false){
 const state=notificationsContext();if(!state?.ready||!key)return;
 const exists=state.follows.some(x=>x.kind===kind&&x.key===key);
 if(!remove&&!exists&&state.follows.length>=NOTIFY_FOLLOW_LIMIT){$("#notificationsResult").textContent=t("notify_limit");return;}
 state.follows=state.follows.filter(x=>x.kind!==kind||x.key!==key);if(!remove)state.follows.push({kind,key});
 const snapshot=structuredClone(state.follows);renderNotifications();
 if(state.store){notificationWrites=notificationWrites.then(async()=>{try{await idbSet(state.store,snapshot);notificationMemory.delete(state.binding);if(notificationCurrent(state))state.stored=true;}catch{notificationMemory.set(state.binding,snapshot);while(notificationMemory.size>20)notificationMemory.delete(notificationMemory.keys().next().value);state.stored=false;}if(notificationCurrent(state))renderNotifications();});}
}
const NOTIFICATION_WORDS={room:"notify_room",thread:"notify_thread",participant:"notify_participant",unavailable:"notify_unavailable",denied:"notify_denied",default:"notify_default",granted:"notify_granted",off:"notify_off",error:"notify_error"};
function notificationBackgroundRefresh(){const state=notificationState;return !!notificationOS&&typeof window.Notification==="function"&&Notification.permission==="granted"&&!!state&&notificationCurrent(state)&&state.ready&&state.follows.length>0;}
function notificationHasDraft(){return !!($("#cBody").value.length||$("#cNewThread").value.length||$("#cNewRoom").value.length||replyTo||composerStructured);}
function renderNotifications(){
 const button=$("#notificationsOpen");if(!button)return;const state=notificationState,active=state&&notificationCurrent(state),unread=active?state.entries.filter(x=>x.unread).length:0;
 button.textContent=t("notify_title")+(unread?" ("+unread+")":"");button.disabled=!B;
 if(!$("#notificationsDialog").open)return;
 $("#notificationsStorage").textContent=t(!active||!state.ready?"notify_loading":state.stored?"notify_saved":"notify_memory");
 let permission=typeof window.Notification!=="function"?"unavailable":Notification.permission==="denied"?"denied":notificationPermissionNote||(notificationOS?"granted":"off");
 $("#notificationsPermissionState").textContent=t(NOTIFICATION_WORDS[permission]);$("#notificationsPermission").disabled=!active||typeof window.Notification!=="function";
 const focusedId=$("#notificationsDialog").contains(document.activeElement)?document.activeElement.id:null,selected=new Map([...$("#notificationsScopes").querySelectorAll("select")].map(el=>[el.id,el.value]));
 const scopes=$("#notificationsScopes"),follows=$("#notificationsFollows"),list=$("#notificationsList");scopes.replaceChildren();follows.replaceChildren();list.replaceChildren();if(!active)return;
 const choices=[["room",B.rooms.map(key=>({key,label:key}))],["thread",Object.values(threadsOf()).filter(x=>x.scope!=="direct"||x.dir.split("--").includes(currentUser())).map(x=>({key:x.key,label:x.dir+" · "+x.tid+" · "+threadTitle(x)}))],["participant",Object.values(B.people).map(x=>({key:x.id,label:x.name+" ("+x.id+")"}))]];
 for(const [kind,items] of choices){const row=document.createElement("div");row.className="notification-scope";const select=document.createElement("select");select.id="notification-"+kind;select.setAttribute("aria-label",t(NOTIFICATION_WORDS[kind]));for(const item of items){const option=document.createElement("option");option.value=item.key;option.textContent=item.label;select.append(option);}if([...select.options].some(option=>option.value===selected.get(select.id)))select.value=selected.get(select.id);row.append(select);const b=notificationButton(row,t("notify_follow")+" · "+t(NOTIFICATION_WORDS[kind]),()=>changeNotificationFollow(kind,select.value));b.id="notification-follow-"+kind;b.disabled=!state.ready||!items.length;scopes.append(row);}
 for(const follow of state.follows){const row=document.createElement("div");row.className="notification-scope";const text=document.createElement("span");text.textContent=t(NOTIFICATION_WORDS[follow.kind])+": "+follow.key;row.append(text);notificationButton(row,t("notify_unfollow"),()=>changeNotificationFollow(follow.kind,follow.key,true));follows.append(row);}
 if(!state.entries.length){const p=document.createElement("p");p.textContent=t("notify_empty");list.append(p);}
 for(const entry of state.entries){const row=document.createElement("section");row.className="notification-entry";row.dataset.path=entry.path;const title=document.createElement(entry.unread?"strong":"span");title.textContent=entry.title;const p=document.createElement("p");p.textContent=entry.author+": "+entry.preview;row.append(title,p);const actions=document.createElement("div");actions.className="tool-actions";notificationButton(actions,t("notify_open"),()=>activateNotification(state,entry,false));notificationButton(actions,t("notify_reply"),()=>activateNotification(state,entry,true));row.append(actions);list.append(row);}
 if(focusedId)document.getElementById(focusedId)?.focus({preventScroll:true});
}
async function activateNotification(state,entry,reply){
 if(!notificationCurrent(state))return;const m=B.byPath.get(entry.path);if(!m||!notificationEligible(m)){ $("#notificationsResult").textContent=t("notify_changed");return;}
 // Retargeting even unchanged text can send a draft to the wrong conversation. Require an empty composer.
 if(reply&&notificationHasDraft()){ $("#notificationsResult").textContent=t("notify_draft");return;}
 const model=B;try{await hydrateMessages([m],model);}catch{$("#notificationsResult").textContent=t("notify_changed");return;}
 if(!notificationCurrent(state)||B!==model||!notificationEligible(m))return;
 if(reply&&notificationHasDraft()){$("#notificationsResult").textContent=t("notify_draft");return;}
 $("#notificationsDialog").close();entry.unread=false;$("#q").value="";bodySearch={model:null,query:"",pending:false,hits:new Set()};sel={scope:m.scope,dir:m.dir,thread:m.tkey};rememberView();build({preserveComposer:true});
 const view=matchingMessages(),at=view.findIndex(x=>x.path===m.path),end=Math.min(view.length,at+Math.ceil(MESSAGE_PAGE_SIZE/2));historyPage.end=end===view.length?null:view[end-1]?.path;build({preserveComposer:true});
 const element=document.getElementById("m-"+m.dkey+"|"+m.file);if(element){element.tabIndex=-1;element.scrollIntoView({block:"center"});element.focus({preventScroll:true});}if(reply)startReply(m);renderNotifications();
}
function wireNotifications(){
 $("#notificationsOpen").onclick=()=>{notificationsContext();$("#notificationsResult").textContent="";$("#notificationsDialog").showModal();renderNotifications();};
 $("#notificationsClose").onclick=()=>{$("#notificationsDialog").close();$("#notificationsOpen").focus();};
 $("#notificationsDialog").addEventListener("cancel",e=>{e.preventDefault();$("#notificationsDialog").close();$("#notificationsOpen").focus();});
 $("#notificationsPermission").onclick=enableNotificationOS;$("#notificationsDisable").onclick=()=>{notificationOS=false;notificationPermissionNote="off";for(const alert of notificationState?.system||[])try{alert.close();}catch{}renderNotifications();};
 $("#notificationsClear").onclick=()=>{const state=notificationsContext();if(state){state.entries=[];for(const alert of state.system)try{alert.close();}catch{}state.system=[];renderNotifications();}};
 renderNotifications();
}
