function wireVoiceInput(){
  const button=document.createElement('button');button.id='voiceTools';button.className='btn';button.textContent=exText('Voice input','Wprowadzanie głosowe');$('#toolbarToolsPanel').append(button);
  button.onclick=()=>{
    const dialog=document.createElement('dialog');dialog.id='voiceDialog';dialog.style='width:min(560px,90vw);max-height:85vh;overflow:auto';
    const heading=document.createElement('h2');heading.textContent=exText('Voice input','Wprowadzanie głosowe');dialog.append(heading);
    const help=document.createElement('p');help.textContent=exText('Native dictation: close this window, focus the message draft and use your system dictation shortcut (Mac: configured Dictation key; Windows: Win+H). System dictation may use online services. Voice text still needs review and Send.','Dyktowanie systemowe: zamknij okno, wybierz szkic i użyj skrótu dyktowania (Mac: skonfigurowany klawisz; Windows: Win+H). Usługa może działać online. Sprawdź tekst i wybierz Wyślij.');dialog.append(help);
    const field=(label,id,tag='input')=>{const wrap=document.createElement('label');wrap.style='display:block;margin:10px 0';wrap.textContent=label+' ';const el=document.createElement(tag);el.id=id;wrap.append(el);dialog.append(wrap);return el;};
    const provider=field(exText('Provider','Dostawca'),'voiceProvider','select');
    for(const [value,label]of [['native',exText('System dictation guidance','Dyktowanie systemowe')],['browser',exText('On-device browser speech','Rozpoznawanie w przeglądarce na urządzeniu')],['local',exText('Local transcription helper','Lokalna transkrypcja')]]){const o=document.createElement('option');o.value=value;o.textContent=label;provider.append(o);}
    const language=field(exText('Language','Język'),'voiceLanguage');language.value=S.lang==='pl'?'pl-PL':'en-US';
    const url=field(exText('Helper URL','Adres pomocnika'),'voiceUrl');url.value='http://127.0.0.1:8769/';
    const token=field(exText('Helper session token (tab memory only)','Token sesji pomocnika (tylko pamięć karty)'),'voiceToken');token.type='password';token.autocomplete='off';
    const info=document.createElement('p');info.textContent=exText('Local setup: run scripts/voice_helper.py with a whisper.cpp executable and model. Paste its session token here. Audio stays in that local helper; no cloud fallback.','Uruchom scripts/voice_helper.py z programem i modelem whisper.cpp. Wklej token sesji. Dźwięk pozostaje w lokalnym pomocniku; brak zastępczej usługi w chmurze.');dialog.append(info);
    const status=document.createElement('p');status.id='voiceStatus';status.setAttribute('role','status');dialog.append(status);
    const interim=document.createElement('p');interim.id='voiceInterim';dialog.append(interim);
    const review=field(exText('Review transcript','Sprawdź transkrypcję'),'voiceReview','textarea');review.rows=5;review.style='width:100%;box-sizing:border-box';review.maxLength=VoiceInput.limit;
    const row=document.createElement('div');row.style='display:flex;flex-wrap:wrap;gap:8px';dialog.append(row);
    const add=(id,en,pl,fn)=>{const b=document.createElement('button');b.className='btn';b.id=id;b.textContent=exText(en,pl);b.onclick=fn;row.append(b);return b;};
    let stop=()=>{},selection;
    const context=()=>JSON.stringify([boardStorageId,dirHandle!==null,S.me,signingMode,signingAs,signingDraftStamp(),replyTo]);
    const session=new VoiceInput.Session(context,s=>{
      status.textContent=s.state==='listening'?exText('Listening… Stop to review.','Słucham… Zatrzymaj, aby sprawdzić.'):s.state==='review'?exText('Review, then insert into the draft.','Sprawdź i wstaw do szkicu.'):s.reason||exText('Ready','Gotowe');
      if(s.state==='listening'){review.value=s.text;interim.textContent=s.interim;}else interim.textContent='';
      if(s.state==='idle')review.value='';
      if(start){start.disabled=s.state==='listening';stopButton.disabled=s.state!=='listening';insert.disabled=s.state!=='review';provider.disabled=language.disabled=url.disabled=token.disabled=s.state==='listening';review.readOnly=s.state!=='review';}
    });
    let start,stopButton,insert;
    start=add('voiceStart','Start','Rozpocznij',async()=>{
      if(provider.value==='native'){status.textContent=help.textContent;return;}
      selection=[$('#cBody').selectionStart,$('#cBody').selectionEnd];const id=session.begin();
      try{stop=provider.value==='browser'?await VoiceInput.browserStart(window,language.value,session,id):VoiceInput.localStart(window,url.value,token.value,language.value,session,id);}
      catch(error){if(session.valid(id))session.cancel(error.message);}
    });
    stopButton=add('voiceStop','Stop','Zatrzymaj',()=>{try{stop?.();status.textContent=exText('Finishing transcription…','Kończenie transkrypcji…');}catch(error){session.cancel(error.message);}});
    add('voiceCancel','Cancel capture','Anuluj nagrywanie',()=>session.cancel());
    insert=add('voiceInsert','Insert into draft','Wstaw do szkicu',()=>{const text=session.insert(review.value);if(text===null)return;const body=$('#cBody');body.setRangeText(text,selection[0],selection[1],'end');body.dispatchEvent(new Event('input',{bubbles:true}));dialog.close();body.focus();});
    add('voiceInstall','Install browser language pack','Zainstaluj pakiet językowy',async()=>{
      if(provider.value!=='browser')return;session.cancel();const id=session.id;
      try{const available=await VoiceInput.browserStatus(window,language.value);if(available==='unavailable')throw Error('No on-device pack for this language.');const R=window.SpeechRecognition;if(typeof R.install!=='function')throw Error('Language-pack installation unavailable.');status.textContent='Installing language pack…';const ok=await R.install({langs:[language.value],processLocally:true});if(dialog.open&&id===session.id)status.textContent=ok?'Language pack ready.':'Language pack installation failed.';}catch(error){if(id===session.id)status.textContent=error.message;}
    });
    add('voiceClose','Close','Zamknij',()=>dialog.close());
    const update=()=>{session.cancel(exText('Ready','Gotowe'));url.parentElement.hidden=token.parentElement.hidden=info.hidden=provider.value!=='local';};provider.onchange=update;language.oninput=()=>session.cancel();
    const check=()=>{if(['listening','review'].includes(session.state))session.valid(session.id);};
    document.addEventListener('input',check);document.addEventListener('change',check);
    const timer=setInterval(check,200);
    const dispose=()=>{session.cancel();token.value='';clearInterval(timer);document.removeEventListener('input',check);document.removeEventListener('change',check);window.removeEventListener('pagehide',dispose);dialog.remove();};
    dialog.addEventListener('close',dispose,{once:true});window.addEventListener('pagehide',dispose,{once:true});
    document.body.append(dialog);update();dialog.showModal();
  };
}
