/* Collapse controls, never draft data or the visible posting destination. */
function updateComposerSummary(){
 composerTargetRender();
 const target=$('#composerOptionsSummary');if(!target)return;
 const label=id=>$(id)?.selectedOptions[0]?.textContent||'';
 target.textContent=B?[label('#cContentType'),$('#cLang')?.value||''].filter(Boolean).join(' · '):'';
}

/* Composer routing (SPEC-002-064): the visible view picks the destination. The Where/Thread/To
   selects stay as hidden backing state (draft stamp, voice, signing and history read them);
   setComposerTarget() is the only writer outside the Advanced fields. */
let composerViewKey=null,composerPin=null,composerNewRoomMode=false,composerTopicAuto=true,composerMenu=null,composerNoteKey='';
function composerTarget(){
 const where=$('#cWhere')?.value||'',newRoom=slugify($('#cNewRoom')?.value||''),to=$('#cTo')?.value||'all',newTopic=$('#cNewThread')?.value||'';
 if(where==='newdirect')return {scope:'newdirect',dir:[currentUser(),to].sort().join('--'),thread:'',newRoom:'',newTopic,to};
 if(where.startsWith('direct:'))return {scope:'direct',dir:where.slice(7),thread:$('#cThread')?.value||'',newRoom:'',newTopic,to};
 if(!where&&!newRoom)return {scope:null,dir:null,thread:'',newRoom:'',newTopic,to};
 return {scope:'room',dir:newRoom||where.slice(5),thread:newRoom?'':$('#cThread')?.value||'',newRoom,newTopic,to};
}
const composerTargetKey=x=>!x?.scope?'':x.scope==='newdirect'?'newdirect:'+x.to:x.scope+':'+x.dir+'|'+(x.newRoom?'+'+x.newRoom:x.thread||'');
const sameComposerTarget=(a,b)=>composerTargetKey(a)===composerTargetKey(b);
// What the visible view implies: a thread posts there, a room starts a new topic, a direct
// conversation continues its most recent topic; All messages has no destination.
function composerViewTarget(){
 if(!B||!sel.scope)return {scope:null};
 if(sel.thread&&threadsOf()[sel.thread])return {scope:sel.scope,dir:sel.dir,thread:sel.thread};
 return sel.scope==='direct'?composerDirectTarget(sel.dir):{scope:sel.scope,dir:sel.dir,thread:''};
}
function composerDirectTarget(dir){
 const latest=Object.values(threadsOf()).filter(x=>x.scope==='direct'&&x.dir===dir).sort((a,b)=>b.last.localeCompare(a.last)||(b.lastOrder||0)-(a.lastOrder||0))[0];
 return {scope:'direct',dir,thread:latest?.key||''};
}
const composerHasDraft=()=>notificationHasDraft()||!!voiceWorkPending;
function setComposerTarget(target={}){
 if(!B)return;
 const scope=target.scope||null;let where=!scope?'':scope==='newdirect'?'newdirect':scope+':'+target.dir;
 if(![...$('#cWhere').options].some(o=>o.value===where))where='';
 composerPin=null;composerNewRoomMode=!!target.newRoom;composerTopicAuto=true;
 $('#cWhere').value=where;if(!target.newRoom)$('#cNewRoom').value='';
 fillThreads(where&&scope!=='newdirect'?target.thread||'':'');
 let to=target.to||'all';
 if(scope==='direct'){const ids=target.dir.split('--'),me=currentUser();to=ids.includes(me)?ids.find(id=>id!==me)||'all':'all';}
 if(to.includes(',')&&![...$('#cTo').options].some(o=>o.value===to))$('#cTo').insertAdjacentHTML('beforeend',composerToOption(to));
 $('#cTo').value=[...$('#cTo').options].some(o=>o.value===to)?to:'all';
 updateComposerSummary();updateSigningNotice();
}
// Advanced fields and pin choices are explicit: they end any pending mismatch banner.
function composerExplicit(){composerPin=null;composerTargetRender();}
function composerFollowView(preserve){
 const key=JSON.stringify([sel.scope||null,sel.dir||null,sel.thread||null]);
 if(key===composerViewKey)return composerTargetRender();
 composerViewKey=key;
 if(preserve)return composerTargetRender();
 const want=composerViewTarget(),now=composerTarget();
 if(sameComposerTarget(want,now)){composerPin=null;return composerTargetRender();}
 // Draft pin (AC5): a draft never silently retargets; only an explicit choice does.
 if(composerHasDraft()&&now.scope){composerPin=want;return composerTargetRender();}
 setComposerTarget(want);
}
const composerName=id=>B?.people?.[id]?.name||id;
function composerDirLabel(scope,dir){
 if(scope!=='direct')return '# '+dir;
 const ids=dir.split('--'),me=currentUser();
 return '✉ '+(ids.includes(me)?composerName(ids.find(id=>id!==me)||me):ids.map(composerName).join(' ↔ '));
}
function composerTargetText(target=composerTarget()){
 if(!target.scope)return {where:exText('Choose where to post','Wybierz, gdzie wysłać'),topic:''};
 const where=target.scope==='newdirect'?'✉ '+composerName(target.to):target.newRoom?'# '+target.newRoom:composerDirLabel(target.scope,target.dir);
 const th=target.thread?threadsOf()[target.thread]:null,name=target.newTopic.trim();
 return {where,topic:th?th.tid+' '+threadTitle(th):exText('New topic','Nowy wątek')+(name?': '+name:'')};
}
function composerToText(to){
 if(!to||to==='all')return exText('to all','do wszystkich');
 return exText('to ','do ')+to.split(',').map(composerName).join(', ');
}
// Why Send cannot post to this destination now, with the one-click fixes the chip offers.
function composerBlock(target){
 const me=currentUser();
 if(target.scope==='direct'&&!target.dir.split('--').includes(me))return {text:exText(`You (${composerName(me)}) are not in this conversation.`,`Ty (${composerName(me)}) nie należysz do tej rozmowy.`),
  actions:target.dir.split('--').filter(id=>B.people[id]).map(id=>({action:'persona',id,label:exText('Switch to '+composerName(id),'Przełącz na '+composerName(id))}))};
 if(target.scope==='newdirect'&&(!B.people[target.to]||target.to===me))return {text:exText('Choose another participant to message.','Wybierz innego uczestnika.'),actions:[{action:'participant',label:exText('Message a participant…','Napisz do uczestnika…')}]};
 return null;
}
function composerTargetRender(){
 const composer=$('#composer'),chip=$('#composerTarget');if(!chip)return;
 const target=B?composerTarget():{scope:null,thread:'',newTopic:''},text=B?composerTargetText(target):{where:t('e_open_first'),topic:''};
 composer.dataset.target=target.scope||'none';
 const set=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 set(chip.querySelector('.composer-chip-lead'),!target.scope?'':replyTo?exText('Replying in','Odpowiadasz w'):exText('Posting to:','Wysyłasz do:'));
 set(chip.querySelector('.composer-chip-where'),text.where);set(chip.querySelector('.composer-chip-topic'),text.topic?'\u00a0\u203a '+text.topic:'');
 set(chip.querySelector('.composer-chip-change'),exText('Change','Zmień'));
 const full=[chip.querySelector('.composer-chip-lead').textContent,text.where,text.topic].filter(Boolean).join(' ');
 if(chip.title!==full)chip.title=full;chip.setAttribute('aria-label',full+' — '+exText('Change','Zmień'));
 const to=$('#composerTo');to.hidden=target.scope!=='room';set(to,composerToText(target.to));to.title=to.textContent;
 const advanced=$('#composerOptions')?.open&&$('#composerAdvanced')?.open;
 $('#cNewRoom').hidden=!B||target.scope==='direct'||target.scope==='newdirect'||!(composerNewRoomMode||$('#cNewRoom').value||advanced);
 $('#cNewThread').hidden=!B||!target.scope||!!target.thread;
 if(composerPin&&(!B||sameComposerTarget(composerPin,target)))composerPin=null;
 const pin=$('#composerPin');pin.hidden=!composerPin;composer.toggleAttribute('data-pinned',!!composerPin);
 if(composerPin){const now=text.where+(text.topic?' › '+text.topic:'');set(pin.querySelector('.composer-pin-text'),exText(`Draft for ${now}, not this view.`,`Szkic dla ${now}, nie dla tego widoku.`));set($('#composerPinHere'),exText('Post here instead','Wyślij tutaj'));set($('#composerPinKeep'),exText('Keep','Zostaw'));}
 const block=B&&target.scope?composerBlock(target):null,th=target.thread&&B?threadsOf()[target.thread]:null;
 const note=block||(th?.status==='CLOSED'?{tone:'info',text:exText('Topic closed. Posting is still allowed.','Wątek zamknięty. Nadal możesz tu pisać.'),actions:[{action:'newtopic',label:exText('New topic here','Nowy wątek tutaj')}]}:null);
 const noteEl=$('#composerTargetNote'),key=JSON.stringify(note);
 if(key!==composerNoteKey){composerNoteKey=key;noteEl.hidden=!note;
  if(note){noteEl.dataset.tone=note.tone||'warn';set(noteEl.querySelector('.composer-target-note-text'),note.text);
   noteEl.querySelector('.composer-target-note-actions').replaceChildren(...note.actions.map(a=>{const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.composerAction=a.action;if(a.id)b.dataset.id=a.id;b.textContent=a.label;return b;}));}}
 $('#send').disabled=!!B&&(!target.scope||!!block);
}
// Send from the composer: refuses without a destination, then re-follows the view after a post.
async function composerSend(){
 if(B){const target=composerTarget(),block=target.scope&&composerBlock(target);
  if(!target.scope){toast(exText('Choose where to post first.','Najpierw wybierz, gdzie wysłać.'));composerMenuOpen('target',$('#composerTarget'));return;}
  if(block){toast(block.text);return;}}
 const before=B?composerTarget():null,me=currentUser(),body=$('#cBody').value;
 await send();
 if(!B||!body.trim()||$('#cBody').value||composerHasDraft())return;
 const pair=before?.scope==='newdirect'?[me,before.to].sort().join('--'):'';
 const carry=typeof historyPostedCarry==='function'?historyPostedCarry:f=>f();
 if(pair&&B.directs.includes(pair)){carry(()=>{sel={scope:'direct',dir:pair,thread:null};rememberView();build();});return;}
 // A view without a destination (All messages, search) keeps the one just used instead of clearing it.
 if(composerViewTarget().scope)carry(()=>{composerViewKey=null;composerFollowView(false);});else composerTargetRender();
}
// "Message a participant" (native dialect): an existing pair opens its conversation, a new one targets newdirect.
function messageParticipant(id){
 const me=currentUser();composerMenuClose();
 if(!B||B.layout.dialect!=='native'||!B.people[id]||!me||id===me)return;
 const pair=[me,id].sort().join('--');
 if(B.directs.includes(pair)){sel={scope:'direct',dir:pair,thread:null};rememberView();$('#side').classList.remove('open');build();setComposerTarget(composerViewTarget());$('#cBody').focus();return;}
 setComposerTarget({scope:'newdirect',to:id});composerTopicFromBody();
 ($('#cBody').value.trim()?$('#cNewThread'):$('#cBody')).focus();
}
// A new direct conversation needs a topic: pre-fill it from the draft's first line until edited.
function composerTopicFromBody(){
 if(!B||!composerTopicAuto||composerTarget().scope!=='newdirect')return;
 const v=slugify($('#cBody').value.replace(/@\S+/g,'').split('\n')[0]).slice(0,32).replace(/-+$/,'');
 if($('#cNewThread').value!==v){$('#cNewThread').value=v;composerTargetRender();}
}
function composerMenuItems(mode,q){
 const match=s=>!q||s.toLowerCase().includes(q),items=[],cur=composerTarget(),native=B.layout.dialect==='native',me=currentUser();
 const head=label=>items.push({head:label});
 if(mode==='participant'){
  for(const p of Object.values(B.people).sort((a,b)=>a.name.localeCompare(b.name)))if(p.id!==me&&match(p.name+' '+p.id))items.push({label:p.name+' · '+p.id,party:p.id,pick:()=>messageParticipant(p.id)});
  return items;
 }
 if(mode==='to'){
  const picked=cur.to&&cur.to!=='all'?cur.to.split(','):[];
  const write=ids=>{const v=ids.length?ids.join(','):'all';if(!$('#cTo').querySelector(`option[value="${CSS.escape(v)}"]`))$('#cTo').insertAdjacentHTML('beforeend',composerToOption(v));$('#cTo').value=v;$('#cTo').dispatchEvent(new Event('change',{bubbles:true}));};
  if(match(exText('Everyone','Wszyscy')+' all'))items.push({label:exText('Everyone','Wszyscy')+' (all)',selected:!picked.length,keep:true,pick:()=>write([])});
  for(const p of Object.values(B.people).sort((a,b)=>a.name.localeCompare(b.name)))if(p.id!==me&&match(p.name+' '+p.id))items.push({label:p.name+' · '+p.id,party:p.id,selected:picked.includes(p.id),keep:true,pick:()=>write(picked.includes(p.id)?picked.filter(x=>x!==p.id):[...picked,p.id])});
  return items;
 }
 const actions=[];
 if((cur.scope==='room'||cur.scope==='direct')&&!cur.newRoom&&cur.thread)actions.push({label:exText('New topic here…','Nowy wątek tutaj…'),pick:()=>{setComposerTarget({scope:cur.scope,dir:cur.dir,thread:''});$('#cNewThread').focus();}});
 actions.push({label:exText('New room…','Nowy pokój…'),pick:()=>{const base=cur.scope==='room'&&B.rooms.includes(cur.dir)?cur.dir:B.defaultRoom&&B.rooms.includes(B.defaultRoom)?B.defaultRoom:B.rooms[0];setComposerTarget({scope:'room',dir:base,thread:'',newRoom:true});updateComposerSummary();$('#cNewRoom').focus();}});
 if(native)actions.push({label:exText('Message a participant…','Napisz do uczestnika…'),stay:true,pick:()=>composerMenuOpen('participant',composerMenu.anchor)});
 actions.push({label:exText('Advanced…','Zaawansowane…'),pick:()=>{S.composerOptionsOpen=S.composerAdvancedOpen=true;saveSettings();updateComposerSummary();$('#cWhere').focus();}});
 const shown=actions.filter(a=>match(a.label));if(shown.length){head(exText('Actions','Akcje'));items.push(...shown);}
 const rooms=B.rooms.filter(r=>match('# '+r));if(rooms.length){head(t('sg_rooms'));for(const r of rooms)items.push({label:'# '+r,pick:()=>{setComposerTarget({scope:'room',dir:r,thread:''});$('#cNewThread').focus();}});}
 const topics=Object.values(threadsOf()).filter(x=>(x.scope==='room'||native)&&match(composerDirLabel(x.scope,x.dir)+' '+x.tid+' '+threadTitle(x))).sort((a,b)=>b.last.localeCompare(a.last)).slice(0,q?40:12);
 if(topics.length){head(t('sg_threads'));for(const x of topics)items.push({label:composerDirLabel(x.scope,x.dir)+' › '+x.tid+' '+threadTitle(x),pick:()=>setComposerTarget({scope:x.scope,dir:x.dir,thread:x.key})});}
 const directs=native?B.directs.filter(d=>match(composerDirLabel('direct',d)+' '+d)):[];
 if(directs.length){head(t('sg_direct'));for(const d of directs)items.push({label:composerDirLabel('direct',d),pick:()=>setComposerTarget(composerDirectTarget(d))});}
 return items;
}
function composerMenuDraw(){
 const menu=$('#composerTargetMenu'),list=$('#composerTargetList'),q=$('#composerTargetSearch').value.trim().toLowerCase();
 const all=composerMenuItems(composerMenu.mode,q);composerMenu.items=all.filter(x=>!x.head);
 if(composerMenu.selected>=composerMenu.items.length)composerMenu.selected=composerMenu.items.length-1;
 let i=0;list.innerHTML=all.map(x=>x.head?`<h4>${esc(x.head)}</h4>`:`<button type="button" role="option" id="composerTargetOption${i}" data-index="${i++}" aria-selected="${x.selected===undefined?'false':String(!!x.selected)}"${x.party?` data-party="${esc(x.party)}" style="--c:${colorOf(x.party)}"`:''} class="${i-1===composerMenu.selected?'sel':''}"><span>${esc(x.label)}</span></button>`).join('')||`<h4>${esc(exText('No matches','Brak wyników'))}</h4>`;
 const title={target:exText('Where to post','Gdzie wysłać'),participant:exText('Message a participant','Napisz do uczestnika'),to:exText('Send to','Odbiorcy')}[composerMenu.mode];
 $('#composerTargetMenuTitle').textContent=title;$('#composerTargetSearch').setAttribute('aria-label',title);
 const active=composerMenu.selected>=0?'composerTargetOption'+composerMenu.selected:'';if(active)$('#composerTargetSearch').setAttribute('aria-activedescendant',active);else $('#composerTargetSearch').removeAttribute('aria-activedescendant');
 list.querySelector('.sel')?.scrollIntoView({block:'nearest'});composerMenuPlace();
}
function composerMenuPlace(){
 const menu=$('#composerTargetMenu');if(!composerMenu||menu.hidden)return;
 const r=composerMenu.anchor.getBoundingClientRect();
 if(innerWidth<=600){menu.style.left=menu.style.top=menu.style.bottom=menu.style.maxHeight='';return;}
 menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px';
 if(r.top>=240){menu.style.top='auto';menu.style.bottom=(innerHeight-r.top+6)+'px';menu.style.maxHeight=Math.min(innerHeight*.6,r.top-14)+'px';}
 else{menu.style.bottom='auto';menu.style.top=(r.bottom+6)+'px';menu.style.maxHeight=Math.max(160,innerHeight-r.bottom-16)+'px';}
}
function composerMenuOpen(mode,anchor){
 if(!B)return;
 for(const b of [$('#composerTarget'),$('#composerTo')])b.setAttribute('aria-expanded',String(b===anchor));
 composerMenu={mode,anchor,items:[],selected:-1};const menu=$('#composerTargetMenu'),search=$('#composerTargetSearch');
 search.value='';search.placeholder=mode==='target'?exText('Search rooms, topics, conversations','Szukaj pokoi, wątków, rozmów'):exText('Search participants','Szukaj uczestników');
 menu.hidden=false;composerMenuDraw();search.focus();
}
function composerMenuClose(focus=false){
 if(!composerMenu)return;const anchor=composerMenu.anchor;composerMenu=null;$('#composerTargetMenu').hidden=true;
 for(const b of [$('#composerTarget'),$('#composerTo')])b.setAttribute('aria-expanded','false');
 if(focus)anchor.focus();
}
function composerMenuPick(i){
 const item=composerMenu?.items[i];if(!item)return;
 if(item.keep){item.pick();composerMenu.selected=i;composerMenuDraw();return;}
 if(item.stay){item.pick();return;}
 const anchor=composerMenu.anchor;composerMenuClose();const before=document.activeElement;item.pick();
 if(document.activeElement===before||document.activeElement===document.body)anchor.focus();
}
function wireComposerTarget(){
 const menu=document.createElement('div');menu.id='composerTargetMenu';menu.className='composer-target-menu';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-labelledby','composerTargetMenuTitle');
 menu.innerHTML='<h3 id="composerTargetMenuTitle"></h3><input id="composerTargetSearch" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="composerTargetList"><div class="composer-target-list" id="composerTargetList" role="listbox"></div>';
 document.body.append(menu);
 const toggle=(mode,el)=>()=>{if(composerMenu?.anchor===el&&composerMenu.mode===mode)composerMenuClose(true);else composerMenuOpen(mode,el);};
 $('#composerTarget').onclick=toggle('target',$('#composerTarget'));$('#composerTo').onclick=toggle('to',$('#composerTo'));
 const search=$('#composerTargetSearch');
 search.addEventListener('input',()=>{composerMenu.selected=-1;composerMenuDraw();});
 search.addEventListener('keydown',e=>{
  if(!composerMenu)return;const n=composerMenu.items.length;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();composerMenuClose(true);}
  else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!n)return;const s=composerMenu.selected;composerMenu.selected=s<0?(e.key==='ArrowDown'?0:n-1):(s+(e.key==='ArrowDown'?1:-1)+n)%n;composerMenuDraw();}
  else if(e.key==='Enter'){e.preventDefault();composerMenuPick(composerMenu.selected<0?0:composerMenu.selected);}
  else if(e.key==='Tab')composerMenuClose();
 });
 menu.addEventListener('mousedown',e=>{if(e.target!==search)e.preventDefault();});
 $('#composerTargetList').addEventListener('click',e=>{const b=e.target.closest('button[data-index]');if(b)composerMenuPick(Number(b.dataset.index));});
 document.addEventListener('mousedown',e=>{if(composerMenu&&!menu.contains(e.target)&&!composerMenu.anchor.contains(e.target))composerMenuClose();},true);
 window.addEventListener('resize',composerMenuPlace);
 $('#composerPinHere').onclick=()=>{if(composerPin)setComposerTarget(composerPin);};
 $('#composerPinKeep').onclick=()=>{composerPin=null;composerTargetRender();$('#cBody').focus();};
 $('#composerTargetNote').addEventListener('click',e=>{
  const b=e.target.closest('[data-composer-action]');if(!b)return;const cur=composerTarget();
  if(b.dataset.composerAction==='newtopic'){setComposerTarget({scope:cur.scope,dir:cur.dir,thread:''});$('#cNewThread').focus();}
  else if(b.dataset.composerAction==='persona'){$('#me').value=b.dataset.id;$('#me').dispatchEvent(new Event('change'));}
  else if(b.dataset.composerAction==='participant')composerMenuOpen('participant',$('#composerTarget'));
 });
 $('#cNewThread').addEventListener('input',()=>{composerTopicAuto=false;composerTargetRender();});
 $('#cBody').addEventListener('input',composerTopicFromBody);
 $('#composerAdvanced').addEventListener('toggle',composerTargetRender);
 // The chip row, name fields and banners change the composer's height: keep a reader at the live edge there.
 let following=true;const feed=$('#feed');
 feed.addEventListener('scroll',()=>{following=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80;},{passive:true});
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(following)feed.scrollTop=feed.scrollHeight;}).observe($('#composer'));
 $('#tree').addEventListener('click',e=>{if(e.target.closest('[data-message-participant]')){e.preventDefault();$('#side').classList.remove('open');composerMenuOpen('participant',$('#composerTarget'));}});
 $('#presenceList').addEventListener('click',e=>{const b=e.target.closest('[data-message-participant]');if(b){$('#presenceDialog').close();messageParticipant(b.dataset.messageParticipant);}});
 composerTargetRender();
}
function applyComposerOptions(){
 const el=$('#composerOptions');if(el.open!==!!S.composerOptionsOpen)el.open=!!S.composerOptionsOpen;
 const advanced=$('#composerAdvanced');if(advanced&&advanced.open!==!!S.composerAdvancedOpen)advanced.open=!!S.composerAdvancedOpen;
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
 // Advanced routing remembers its fold the same way (SPEC-002-064).
 $('#composerAdvanced > summary').addEventListener('click',event=>{
  event.preventDefault();S.composerAdvancedOpen=!$('#composerAdvanced').open;$('#composerAdvanced').open=S.composerAdvancedOpen;saveSettings();
 });
 $('#composerAdvanced').addEventListener('toggle',()=>{
  const open=$('#composerAdvanced').open;
  if(S.composerAdvancedOpen!==open){S.composerAdvancedOpen=open;saveSettings();}
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
