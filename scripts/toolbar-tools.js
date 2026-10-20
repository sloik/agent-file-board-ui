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
}
