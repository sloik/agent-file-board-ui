/* One local sidebar menu, bound to the exact board, identity and scope. */
let sidebarMenu=null,sidebarNotificationReturn=null;
function sidebarScopeAllowed(kind,key){
 if(!B)return false;
 if(kind==="room")return B.rooms.includes(key);
 if(kind!=="thread")return false;
 const thread=threadsOf()[key];return !!thread&&(thread.scope!=="direct"||thread.dir.split("--").includes(currentUser()));
}
function sidebarScopeButton(kind,key,label){
 if(!sidebarScopeAllowed(kind,key))return "";
 return `<button type="button" class="scope-menu-trigger" data-notification-menu="${kind}" data-notification-key="${esc(key)}" aria-label="${esc(t("notify_scope_menu",{scope:label}))}" title="${esc(t("notify_scope_menu",{scope:label}))}" aria-haspopup="menu" aria-controls="sidebarNotificationMenu" aria-expanded="false">...</button>`;
}
function sidebarTrigger(kind,key){return [...$("#tree").querySelectorAll("[data-notification-menu]")].find(el=>el.dataset.notificationMenu===kind&&el.dataset.notificationKey===key);}
function sidebarMenuCurrent(menu){return !!menu&&notificationCurrent(menu.state)&&sidebarScopeAllowed(menu.kind,menu.key);}
function closeSidebarMenu(restore=false){
 const menu=sidebarMenu;sidebarMenu=null;$("#sidebarNotificationMenu").hidden=true;
 for(const el of $("#tree").querySelectorAll('[data-notification-menu][aria-expanded="true"]'))el.setAttribute("aria-expanded","false");
 if(restore&&sidebarMenuCurrent(menu))sidebarTrigger(menu.kind,menu.key)?.focus({preventScroll:true});
}
function positionSidebarMenu(){
 const menu=sidebarMenu,box=$("#sidebarNotificationMenu"),trigger=menu&&sidebarTrigger(menu.kind,menu.key);if(!trigger)return;
 const r=trigger.getBoundingClientRect(),side=$("#side").getBoundingClientRect();
 if(r.bottom<side.top||r.top>side.bottom){closeSidebarMenu(false);return;}
 box.style.left=Math.max(8,Math.min(r.right-box.offsetWidth,innerWidth-box.offsetWidth-8))+"px";
 box.style.top=Math.max(8,Math.min(r.bottom+4,innerHeight-box.offsetHeight-8))+"px";
}
function syncSidebarMenu(){
 if(!sidebarMenu)return;
 if(!sidebarMenuCurrent(sidebarMenu)||!sidebarTrigger(sidebarMenu.kind,sidebarMenu.key)){closeSidebarMenu(false);return;}
 const trigger=sidebarTrigger(sidebarMenu.kind,sidebarMenu.key);trigger.setAttribute("aria-expanded","true");
 const following=sidebarMenu.state.follows.some(item=>item.kind===sidebarMenu.kind&&item.key===sidebarMenu.key);
 $("#sidebarNotificationToggle").textContent=t(following?"notify_unfollow":"notify_follow");$("#sidebarNotificationToggle").disabled=!sidebarMenu.state.ready;
 $("#sidebarNotificationSettings").textContent=t("notify_scope_settings");
 const history=$("#sidebarHistorySettings");history.hidden=B.layout.dialect!=="native";history.textContent=exText("Room history and signing…","Historia i podpisy pokoju…");$("#sidebarNotificationMenu").setAttribute("aria-label",trigger.getAttribute("aria-label"));positionSidebarMenu();
}
function openSidebarMenu(trigger,last=false){
 const kind=trigger.dataset.notificationMenu,key=trigger.dataset.notificationKey,state=notificationsContext();if(!state||!sidebarScopeAllowed(kind,key))return;
 if(sidebarMenu?.kind===kind&&sidebarMenu.key===key){closeSidebarMenu(true);return;}
 closeSidebarMenu(false);sidebarMenu={state,kind,key};$("#sidebarNotificationMenu").hidden=false;syncSidebarMenu();
 const items=[...$("#sidebarNotificationMenu").querySelectorAll("button:not(:disabled):not([hidden])")];(last?items.at(-1):items[0])?.focus({preventScroll:true});
}
function openSidebarNotificationSettings(menu){
 if(!sidebarMenuCurrent(menu))return;
 closeSidebarMenu(false);sidebarNotificationReturn={state:menu.state,kind:menu.kind,key:menu.key};
 $("#notificationsResult").textContent="";$("#notificationsDialog").showModal();renderNotifications();
 if(!sidebarMenuCurrent(menu)){$("#notificationsDialog").close();return;}
 const select=$("#notification-"+menu.kind);if(select&&[...select.options].some(option=>option.value===menu.key)){select.value=menu.key;select.focus({preventScroll:true});}
}
function wireSidebarMenu(){
 $("#tree").addEventListener("click",event=>{const trigger=event.target.closest("[data-notification-menu]");if(!trigger)return;event.preventDefault();event.stopImmediatePropagation();openSidebarMenu(trigger);},true);
 $("#tree").addEventListener("keydown",event=>{const trigger=event.target.closest("[data-notification-menu]");if(trigger&&["ArrowDown","ArrowUp"].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();openSidebarMenu(trigger,event.key==="ArrowUp");}},true);
 $("#sidebarNotificationToggle").onclick=()=>{const menu=sidebarMenu;if(!sidebarMenuCurrent(menu)){closeSidebarMenu(false);return;}const following=menu.state.follows.some(item=>item.kind===menu.kind&&item.key===menu.key);changeNotificationFollow(menu.kind,menu.key,following);closeSidebarMenu(true);};
 $("#sidebarNotificationSettings").onclick=()=>openSidebarNotificationSettings(sidebarMenu);
 $("#sidebarHistorySettings").onclick=()=>{const menu=sidebarMenu;if(!sidebarMenuCurrent(menu)){closeSidebarMenu(false);return;}closeSidebarMenu(false);historySettingsDialog(menu.kind,menu.key);};
 document.addEventListener("pointerdown",event=>{if(sidebarMenu&&!$("#sidebarNotificationMenu").contains(event.target)&&!event.target.closest("[data-notification-menu]"))closeSidebarMenu(false);},true);
 document.addEventListener("focusin",event=>{if(sidebarMenu&&!$("#sidebarNotificationMenu").contains(event.target)&&!event.target.closest("[data-notification-menu]"))closeSidebarMenu(false);});
 $("#sidebarNotificationMenu").addEventListener("keydown",event=>{
  if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeSidebarMenu(true);return;}
  if(event.key==="Tab"){closeSidebarMenu(true);return;}
  const items=[...$("#sidebarNotificationMenu").querySelectorAll("button:not(:disabled):not([hidden])")],at=items.indexOf(document.activeElement);let next;
  if(event.key==="ArrowDown")next=(at+1)%items.length;else if(event.key==="ArrowUp")next=(at-1+items.length)%items.length;else if(event.key==="Home")next=0;else if(event.key==="End")next=items.length-1;
  if(next!==undefined){event.preventDefault();items[next]?.focus();}
 });
 $("#side").addEventListener("scroll",positionSidebarMenu,{passive:true});window.addEventListener("resize",()=>closeSidebarMenu(false));
 $("#notificationsDialog").addEventListener("close",()=>{if($("#notificationsDialog").open)return;const target=sidebarNotificationReturn;sidebarNotificationReturn=null;if(target&&sidebarMenuCurrent(target))sidebarTrigger(target.kind,target.key)?.focus({preventScroll:true});});
}
/* Sidebar visibility (SPEC-002-068): #menu toggles a collapsed column above 820px and a drawer below.
   Only an explicit toggle is remembered; until then the window size decides. */
const SIDEBAR_KEY="afb.sidebar";
let sidebarChoice=null;
function sidebarStored(){try{const value=localStorage.getItem(SIDEBAR_KEY);return value==="shown"||value==="hidden"?value:null;}catch(e){return null;}}
const sidebarDrawer=()=>innerWidth<=820;
function sidebarShown(){const choice=sidebarChoice||sidebarStored();return choice?choice==="shown":innerWidth>=1000&&innerHeight>=560;}
const sidebarShortcut=()=>/Mac|iPhone|iPad/.test(navigator.platform||"")?"⌘B":"Ctrl+B";
function syncSidebar(){
 const drawer=sidebarDrawer(),side=$("#side"),open=drawer?side.classList.contains("open"):sidebarShown(),button=$("#menu");
 document.body.classList.toggle("side-hidden",!drawer&&!open);
 $("#sideScrim").classList.toggle("show",drawer&&open);
 const label=t(open?"sidebar_hide":"sidebar_show");button.setAttribute("aria-expanded",String(open));
 if(button.getAttribute("aria-label")!==label){button.setAttribute("aria-label",label);button.title=label+" ("+sidebarShortcut()+")";}
 const tool=$("#sidebarToggleTool");if(tool&&tool.firstChild.textContent!==label){tool.firstChild.textContent=label;tool.lastChild.textContent=sidebarShortcut();}
 // The "«" inside the sidebar heading only ever hides it (SPEC-002-069).
 const hide=$("#sideHide"),hideLabel=t("sidebar_hide");if(hide&&hide.getAttribute("aria-label")!==hideLabel){hide.setAttribute("aria-label",hideLabel);hide.title=hideLabel+" ("+sidebarShortcut()+")";}
}
function closeSidebarDrawer(focus){
 const side=$("#side");if(!side.classList.contains("open"))return;
 side.classList.remove("open");closeSidebarMenu(false);syncSidebar();if(focus)$("#menu").focus({preventScroll:true});
}
function toggleSidebar(){
 const side=$("#side");
 if(sidebarDrawer()){if(side.classList.contains("open"))closeSidebarDrawer(true);else{side.classList.add("open");syncSidebar();}return;}
 sidebarChoice=sidebarShown()?"hidden":"shown";
 try{localStorage.setItem(SIDEBAR_KEY,sidebarChoice);}catch(e){}
 if(sidebarChoice==="hidden"){closeSidebarMenu(false);if(side.contains(document.activeElement))$("#menu").focus({preventScroll:true});}
 syncSidebar();
}
function wireSidebarToggle(){
 const top=document.querySelector(".top"),measure=()=>document.documentElement.style.setProperty("--top-h",Math.round(top.getBoundingClientRect().bottom)+"px");
 measure();if(typeof ResizeObserver==="function")new ResizeObserver(measure).observe(top);
 $("#menu").onclick=toggleSidebar;$("#sideScrim").onclick=()=>closeSidebarDrawer(true);
 $("#sideHide").onclick=()=>{toggleSidebar();$("#menu").focus({preventScroll:true});};
 document.addEventListener("keydown",event=>{
  if(event.defaultPrevented)return;
  if(event.key==="Escape"&&sidebarDrawer()&&$("#side").classList.contains("open")&&!document.querySelector("dialog[open]")){event.preventDefault();closeSidebarDrawer(true);}
  else if((event.key==="b"||event.key==="B")&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey){event.preventDefault();toggleSidebar();}
 });
 addEventListener("resize",()=>{measure();if(!sidebarDrawer())$("#side").classList.remove("open");syncSidebar();});
 syncSidebar();
}
