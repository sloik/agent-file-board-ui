/* Settings keeps controls inside the viewport without rewriting saved desktop width. */
function settingsWidthBounds(){const max=Math.max(1,Math.min(900,innerWidth-32));return {min:Math.min(280,max),max};}
function applySettingsWidth(){
 const {min,max}=settingsWidthBounds(),width=Math.max(min,Math.min(max,Number.isFinite(S.settingsW)?S.settingsW:340));
 $('#settings').style.setProperty('--settings-width',width+'px');
 const handle=$('#settingsResize');handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',Math.round(width));
}
function wirePanelLayout(){
 const pane=$('#settings'),handle=$('#settingsResize');
 const resize=width=>{const {min,max}=settingsWidthBounds();S.settingsW=Math.round(Math.max(min,Math.min(max,width)));applySettingsWidth();};
 const reset=()=>{S.settingsW=340;saveSettings();};
 $('#sClose').onclick=()=>{pane.classList.remove('show');$('#gear').focus();};
 handle.onpointerdown=e=>{
  if(e.button!==0)return;e.preventDefault();const x=e.clientX,width=pane.getBoundingClientRect().width;
  handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing');
  handle.onpointermove=event=>resize(width+x-event.clientX);
  const done=()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;handle.onlostpointercapture=null;document.body.classList.remove('resizing');saveSettings();};
  handle.onpointerup=done;handle.onpointercancel=done;handle.onlostpointercapture=done;
 };
 handle.ondblclick=reset;
 handle.onkeydown=e=>{
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();resize(pane.getBoundingClientRect().width+(e.key==='ArrowLeft'?20:-20));saveSettings();}
  else if(e.key==='Home'){e.preventDefault();reset();}
 };
 addEventListener('resize',applySettingsWidth);
}
