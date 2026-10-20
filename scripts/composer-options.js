/* Collapse controls, never draft data or the visible posting destination. */
function updateComposerSummary(){
 const target=$('#composerRouteSummary');if(!target)return;
 if(!B){target.textContent=t('e_open_first');target.title=target.textContent;return;}
 const value=id=>$(id)?.value||'',label=id=>$(id)?.selectedOptions[0]?.dataset.partyLabel||$(id)?.selectedOptions[0]?.textContent||'';
 const thread=B?threadsOf()[value('#cThread')]:null;
 const newRoom=value('#cWhere').startsWith('room:')?slugify(value('#cNewRoom')):'';
 const where=newRoom?'# '+newRoom:label('#cWhere');
 const topic=(!newRoom&&thread?.tid)||value('#cNewThread').trim()||t('c_new_thread_opt');
 const recipient=value('#cTo')&&value('#cTo')!=='all'?label('#cTo')+' ('+value('#cTo')+')':label('#cTo');
 const parts=[where,topic,recipient,label('#cContentType'),value('#cLang')].filter(Boolean);
 target.textContent=parts.join(' · ');target.title=target.textContent;
}
function applyComposerOptions(){
 const el=$('#composerOptions');if(el.open!==!!S.composerOptionsOpen)el.open=!!S.composerOptionsOpen;
 updateComposerSummary();
}
function wireComposerOptions(){
 $('#composerOptions > summary').addEventListener('click',event=>{
  // Native toggle is queued; commit before a following settings change can
  // restore the old state (also matters while the viewer's timer is paused).
  event.preventDefault();const el=$('#composerOptions'),feed=$('#feed');
  const follow=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80;
  S.composerOptionsOpen=!el.open;el.open=S.composerOptionsOpen;saveSettings();
  if(follow)feed.scrollTop=feed.scrollHeight;
 });
 $('#composerOptions').addEventListener('toggle',()=>{
  const open=$('#composerOptions').open;
  if(S.composerOptionsOpen!==open){S.composerOptionsOpen=open;saveSettings();}
 });
 for(const event of ['input','change'])$('#composer').addEventListener(event,updateComposerSummary);
}
const PRESENCE_NOTICE_HEADERS=new Set("FROM TO SCOPE ROOM THREAD DATE POSTED-AT LANGUAGE REPLY-TO RUNTIME STATUS".split(" "));
function presenceNoticeHeaders(h){
 return h && Object.keys(h).every(key=>PRESENCE_NOTICE_HEADERS.has(key)) && h.SCOPE==='ROOM' && h.TO==='all' && h['REPLY-TO']==='-' && h.STATUS==='INFO'
  && /^T0+-(?:session-presence|session-(?:start|release)-[a-f0-9-]+)$/.test(h.THREAD||'');
}
function purePresenceBody(body){
 return /^Session (?:start|release): identifier /.test(body)
  && !/(?<![\w@.-])@[a-z][a-z0-9-]{2,63}(?![\w-])/i.test(body);
}
function sessionNotice(m){
 if(!presenceNoticeHeaders(m.h)||m.metadataError||m.quarantined||m.source?.readError||m.source?.ioError)return false;
 // A short preview cannot prove that a later coordination mention is absent.
 // Native indexing checks complete small notices once; uncertain/large ones stay visible.
 if(m.source)return m.source.parsed?.routinePresenceNotice===true;
 return new TextEncoder().encode(m.body||'').length<=32768&&purePresenceBody(m.body||'');
}
function routinePresenceVisible(m,selection=sel,query=$('#q').value.trim()){
 return S.showPresenceNotices || !!query || selection.thread===m.tkey || !sessionNotice(m);
}
