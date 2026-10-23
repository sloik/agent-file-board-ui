/* Secondary tools stay reachable without occupying multiple toolbar rows. */
function wireToolbarTools(){
 const menu=$('#toolbarTools'),summary=$('#toolbarToolsToggle'),panel=$('#toolbarToolsPanel');
 summary.addEventListener('click',event=>{
  event.preventDefault();menu.open=!menu.open;if(!menu.open)return;
  const rect=summary.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(rect.left,innerWidth-panel.offsetWidth-8))+'px';
  panel.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-panel.offsetHeight-8))+'px';
 });
 // Capture before showModal so its native return-focus target is the summary,
 // rather than a button that becomes hidden when the menu closes.
 panel.addEventListener('click',event=>{if(event.target.closest('button:not(:disabled)')){menu.open=false;summary.focus({preventScroll:true});}},true);
 document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open&&!document.querySelector('dialog[open]')){event.preventDefault();menu.open=false;summary.focus();}});
 window.addEventListener('resize',()=>{menu.open=false;});
 wireToolbarExtras();
}
/* The topic bar keeps one line (SPEC-002-068): rename, repairs, guidance and the missing-message check sit
   behind "...". Items stay open while their dialogs run, so focus returns to the item that opened them. */
function wireTopicMenu(){
 const menu=$('#topicMenu'),summary=$('#topicMenuToggle'),panel=$('#topicMenuPanel');
 const close=focus=>{if(!menu.open)return;menu.open=false;$('#titleEditor').hidden=true;if(focus)summary.focus();};
 summary.addEventListener('click',event=>{
  event.preventDefault();if(menu.open)return close(false);menu.open=true;
  const rect=summary.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(rect.right-panel.offsetWidth,innerWidth-panel.offsetWidth-8))+'px';
  panel.style.top=Math.max(8,Math.min(rect.bottom+6,innerHeight-panel.offsetHeight-8))+'px';
 });
 $('#topicRename').onclick=()=>{const editor=$('#titleEditor'),input=$('#topicTitle');editor.hidden=false;if(!input.value)input.value=threadTitle(threadsOf()[sel.thread])||'';input.focus();input.select();};
 document.addEventListener('click',event=>{if(menu.open&&!menu.contains(event.target)&&!event.target.closest?.('dialog'))close(false);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){event.preventDefault();close(true);}});
 window.addEventListener('resize',()=>close(false));
}
/* Tools also carries the sidebar toggle, the refresh status and the version line the toolbar no longer shows. */
function wireToolbarExtras(){
 const panel=$('#toolbarToolsPanel'),toggle=document.createElement('button'),status=document.createElement('div'),version=document.createElement('button');
 toggle.type='button';toggle.className='btn';toggle.id='sidebarToggleTool';toggle.append(document.createElement('span'),document.createElement('kbd'));toggle.onclick=toggleSidebar;
 status.id='toolbarStatus';status.className='hint toolbar-status';
 version.type='button';version.className='btn verbar';version.id='toolbarVersion';version.onclick=()=>$('#verbar').click();
 panel.append(toggle,status,version);syncSidebar();
 const notice=$('#viewerUpdateNotice');if(notice)notice.title=notice.textContent; // its text hides behind an icon below 1100px
}
