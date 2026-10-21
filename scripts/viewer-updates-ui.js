/* Scheduling is private browser state, never board metadata. */
async function viewerUpdateState(change){
  const db=await idb();try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('kv',change?'readwrite':'readonly'),store=tx.objectStore('kv'),q=store.get('viewer-updates-v1');let result;
    q.onsuccess=()=>{result=ViewerUpdates.stored(q.result);if(change){result=change(result);store.put(result,'viewer-updates-v1');}};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Update schedule unavailable'));
  });}finally{db.close();}
}
function viewerReloadBlockers(){
  const reasons=[];
  if(notificationHasDraft())reasons.push('message draft');
  if([...choiceDrafts.values()].some(d=>d.selected?.length||d.text?.length))reasons.push('choice reply');
  if(formDraftDirty.size)reasons.push('form reply');
  if(extensionDirty.size)reasons.push('custom reply');
  const raw=$('#structuredJson').value;
  if(raw&&!AUTHORING_EXAMPLES.some(e=>e.kind===$('#structuredKind').value&&JSON.stringify(e.value,null,2)===raw))reasons.push('structured authoring');
  if(voiceWorkPending)reasons.push('voice capture or transcript');
  if(signingSavePending||viewerActiveWrites||viewerActiveDeliveries||viewerActiveSends||upgradeBusy||repairBusy||draftManagerBusy||locationBusy||authoringPending||formStoragePending||submittingForms.size||submittingChoices.size||extensionSending.size)reasons.push('operation in progress');
  return reasons;
}
function viewerReload(){const reasons=viewerReloadBlockers();if(reasons.length)return reasons;location.reload();return [];}
function wireViewerUpdates(){
  const tool=document.createElement('button');tool.id='viewerUpdatesTools';tool.className='btn';tool.textContent=exText('Viewer updates','Aktualizacje przeglądarki tablic');$('#toolbarToolsPanel').append(tool);
  const notice=document.createElement('button');notice.id='viewerUpdateNotice';notice.className='btn';notice.style.display='none';notice.textContent=exText('Viewer update available','Dostępna aktualizacja');$('#toolbarTools').after(notice);
  let state={},busy=false,task=null,status=exText('Latest release unknown.','Najnowsze wydanie nieznane.'),dialog=null,storage=true;
  const render=()=>{
    notice.style.display=state.latest?.packageAvailable&&ViewerUpdates.newer(state.latest.version,VIEWER_VERSION)?'':'none';
    if(!dialog)return;
    dialog.querySelector('#viewerLatestVersion').textContent=exText('Last known stable release: ','Ostatnie znane stabilne wydanie: ')+(state.latest?.version||exText('unknown','nieznane'));
    dialog.querySelector('#viewerUpdateStatus').textContent=status+(state.lastSuccess?' '+exText('Last successful check: ','Ostatnie udane sprawdzenie: ')+new Date(state.lastSuccess).toLocaleString(): '');
    dialog.querySelector('#viewerCheckNow').disabled=busy;
    const auto=dialog.querySelector('#viewerUpdateAuto');auto.checked=state.auto!==false;auto.disabled=!storage;
    const download=dialog.querySelector('#viewerPackageDownload');download.hidden=!(state.latest?.packageAvailable);download.style.display=download.hidden?'none':'';
    if(!download.hidden)download.href=ViewerUpdates.links(state.latest.version).package;
  };
  async function check(manual=false){
    if(busy)return;busy=true;render();let attempt=Date.now(),claimed=false;
    try{
      state=await viewerUpdateState(s=>{if(!manual&&(s.auto===false||!ViewerUpdates.due(s.lastAttempt,attempt)))return s;claimed=true;return {...s,lastAttempt:attempt};});
    }catch{storage=false;if(!manual){busy=false;status=exText('Automatic checks unavailable; use Check now.','Automatyczne sprawdzanie niedostępne; użyj Sprawdź teraz.');render();return;}claimed=true;}
    if(!claimed){busy=false;render();return;}
    status=exText('Checking public release metadata…','Sprawdzanie publicznych informacji o wydaniu…');render();
    try{
      task=ViewerUpdates.request(window);const latest=await task.promise;
      const now=Date.now();state={...state,latest,lastSuccess:now};
      if(storage)try{state=await viewerUpdateState(s=>s.lastAttempt===attempt?{...s,latest,lastSuccess:now}:s);}catch{storage=false;}
      status=ViewerUpdates.newer(latest.version,VIEWER_VERSION)?(latest.packageAvailable?exText('Version ','Wersja ')+latest.version+exText(' available. Download and install manually.',' dostępna. Pobierz i zainstaluj ręcznie.'):exText('New release has no viewer package yet.','Nowe wydanie nie ma jeszcze pakietu.')):exText('No newer stable release.','Brak nowszego stabilnego wydania.');
    }catch{status=exText('Latest release unknown. Offline viewing still works.','Najnowsze wydanie nieznane. Możesz nadal pracować offline.');}
    finally{task=null;busy=false;render();}
  }
  tool.onclick=notice.onclick=()=>{
    if(dialog){dialog.showModal();return;}
    dialog=document.createElement('dialog');dialog.id='viewerUpdatesDialog';dialog.style='width:min(560px,90vw);max-height:85vh;overflow:auto;overflow-wrap:anywhere;box-sizing:border-box';
    const add=(tag,text,id)=>{const e=document.createElement(tag);e.textContent=text;if(id)e.id=id;dialog.append(e);return e;};
    add('h2',exText('Viewer updates','Aktualizacje przeglądarki tablic'));
    add('p',exText('Running viewer: ','Uruchomiona wersja: ')+VIEWER_VERSION);add('p','','viewerLatestVersion');
    add('p','', 'viewerUpdateStatus').setAttribute('role','status');
    const label=add('label',exText('Check daily while this viewer is open ','Sprawdzaj codziennie, gdy przeglądarka tablic jest otwarta ')),auto=document.createElement('input');auto.id='viewerUpdateAuto';auto.type='checkbox';label.append(auto);
    auto.onchange=async()=>{try{state=await viewerUpdateState(s=>({...s,auto:auto.checked}));if(!auto.checked)task?.cancel();}catch{storage=false;status=exText('Could not save update preference.','Nie udało się zapisać preferencji.');}render();};
    const checkButton=add('button',exText('Check now','Sprawdź teraz'),'viewerCheckNow');checkButton.className='btn';checkButton.onclick=()=>check(true);
    const download=add('a',exText('Download viewer package ZIP','Pobierz pakiet ZIP'),'viewerPackageDownload');download.target='_blank';download.rel='noopener noreferrer';download.style.margin='12px';
    const releases=add('a',exText('Official releases','Oficjalne wydania'),'viewerReleaseLink');releases.href=ViewerUpdates.releases+'/latest';releases.target='_blank';releases.rel='noopener noreferrer';
    add('h3',exText('Manual installation','Instalacja ręczna'));
    add('p',exText('Finish or explicitly discard unfinished work. Download the viewer package ZIP, extract it into a fresh folder, read UPDATE.md, then replace only the application files at your usual viewer location. Keep conversations and private signing data separate. For a Git checkout, use a separate extracted viewer instead of overwriting source files.','Dokończ lub świadomie odrzuć niezakończoną pracę. Pobierz pakiet ZIP, rozpakuj do nowego folderu, przeczytaj UPDATE.md i zastąp wyłącznie pliki aplikacji. Zachowaj rozmowy i prywatne dane podpisów. Dla repozytorium Git użyj osobno rozpakowanego pakietu.'));
    add('p',exText('Reopen or reload after copying. Verify the running version here; open tabs retain their old code. Restart optional helpers separately. The app does not install files or confirm that your download was installed. Shared folders update through their normal sync.','Po skopiowaniu otwórz ponownie lub przeładuj. Sprawdź wersję tutaj; otwarte karty zachowują stary kod. Uruchom ponownie opcjonalne pomocniki. Aplikacja nie instaluje plików ani nie potwierdza instalacji. Foldery współdzielone używają zwykłej synchronizacji.'));
    add('p',exText('Checks contact the fixed hosted checker and GitHub for public release metadata only. No board contents or signing keys are sent. Disable daily checks above to stay offline.','Sprawdzanie łączy się ze stałym serwisem i GitHub wyłącznie po publiczne informacje. Treść tablic i klucze podpisów nie są wysyłane. Wyłącz codzienne sprawdzanie, aby pracować offline.'));
    const result=add('p','','viewerReloadResult');result.setAttribute('role','status');
    const reload=add('button',exText('Reload installed viewer','Przeładuj zainstalowaną przeglądarkę'),'viewerReload');reload.className='btn';reload.onclick=()=>{const reasons=viewerReload();if(reasons.length)result.textContent=exText('Finish or discard unfinished work before reloading: ','Dokończ lub odrzuć pracę przed przeładowaniem: ')+reasons.join(', ');};
    const close=add('button',exText('Close','Zamknij'),'viewerUpdatesClose');close.className='btn';close.onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{dialog.remove();dialog=null;},{once:true});document.body.append(dialog);render();dialog.showModal();
  };
  viewerUpdateState().then(s=>{state=s;render();check();}).catch(()=>{storage=false;status=exText('Automatic checks unavailable; use Check now.','Automatyczne sprawdzanie niedostępne; użyj Sprawdź teraz.');render();});
  const tick=()=>{if(document.visibilityState==='visible'&&storage)check();};
  let interval=setInterval(tick,60000);window.addEventListener('pageshow',e=>{if(e.persisted){interval=setInterval(tick,60000);tick();}});document.addEventListener('visibilitychange',tick);
  window.addEventListener('pagehide',()=>{clearInterval(interval);task?.cancel();document.removeEventListener('visibilitychange',tick);},{once:true});
}
