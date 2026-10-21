/* Voice produces a reviewed draft, never an authenticated message. */
const VoiceInput = (() => {
  const limit = 32000;
  class Session {
    constructor(context, changed = () => {}) { this.context=context; this.changed=changed; this.id=0; this.state='idle'; this.text=''; this.interim=''; }
    begin() { this.cancel(); this.snapshot=this.context(); this.state='listening'; this.text=''; this.interim=''; this.changed(this); return this.id; }
    valid(id) { if(id!==this.id)return false; if(this.snapshot!==this.context()){this.cancel('Draft or destination changed; start again.');return false;}return true; }
    result(id, text, interim='') { if(!this.valid(id)||this.state!=='listening')return; if(typeof text!=='string'||typeof interim!=='string'||text.length+interim.length>limit){this.cancel('Transcript is too long.');return;} this.text=text;this.interim=interim;this.changed(this); }
    finish(id) { if(this.valid(id)&&this.state==='listening'){this.state='review';this.interim='';this.release();this.changed(this);} }
    insert(text) { if(!this.valid(this.id)||this.state!=='review'||typeof text!=='string'||!text.trim()||text.length>limit)return null;this.state='inserted';this.id++;this.release();this.changed(this);return text; }
    release() { const dispose=this.dispose;this.dispose=null;try{dispose?.();}catch{} }
    cancel(reason='Cancelled') { this.id++;this.state='idle';this.release();this.text='';this.interim='';this.reason=reason;this.changed(this); }
  }
  async function browserStatus(env, language) {
    const R=env.SpeechRecognition;
    if(!R||!('processLocally' in R.prototype)||typeof R.available!=='function')throw Error('On-device speech is unavailable in this browser. Use native dictation or the local helper.');
    return R.available({langs:[language],processLocally:true});
  }
  async function browserStart(env, language, session, id) {
    if(await browserStatus(env,language)!=='available')throw Error('On-device language pack unavailable. Install it explicitly, or choose another provider.');
    if(!session.valid(id)||session.state!=='listening')return;
    const recognition=new env.SpeechRecognition();
    recognition.processLocally=true;recognition.lang=language;recognition.continuous=true;recognition.interimResults=true;
    session.dispose=()=>{recognition.onresult=recognition.onend=recognition.onerror=null;recognition.abort();};
    recognition.onresult=event=>{let final='',interim='';for(let i=0;i<event.results.length;i++){const r=event.results[i];if(r.isFinal)final+=r[0].transcript+' ';else interim+=r[0].transcript+' ';}session.result(id,final.trim(),interim.trim());};
    recognition.onerror=event=>{if(session.valid(id))session.cancel('Speech error: '+event.error);};
    recognition.onend=()=>session.finish(id);
    recognition.start();
    return ()=>recognition.stop();
  }
  function localStart(env, url, token, language, session, id) {
    const target=new URL(url);
    if(target.protocol!=='http:'||target.hostname!=='127.0.0.1'||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw Error('Use http://127.0.0.1:PORT/ for the local helper.');
    if(!/^[a-f0-9]{64}$/.test(token))throw Error('Paste the local helper’s 64-character session token.');
    const channel=env.crypto.randomUUID();
    target.hash=new URLSearchParams({token,channel,language,opener:env.location.protocol==='file:'?'null':env.location.origin}).toString();
    // Opening a separate local page keeps the board’s connect-src none policy intact.
    const popup=env.open(target.href,'_blank','popup,width=600,height=560');
    if(!popup)throw Error('Allow the local helper window to open, then start again.');
    const receive=event=>{
      if(event.origin!==target.origin||event.source!==popup||event.data?.channel!==channel||!session.valid(id))return;
      if(event.data.type==='transcript'){session.result(id,event.data.text);session.finish(id);}
      else if(event.data.type==='error')session.cancel('Local transcription failed. Check the helper window.');
    };
    env.addEventListener('message',receive);
    const timer=env.setInterval(()=>{if(!session.valid(id))return;if(popup.closed)session.cancel('Helper window closed.');},250);
    session.dispose=()=>{env.clearInterval(timer);env.removeEventListener('message',receive);popup.close();};
    return ()=>popup.postMessage({channel,type:'stop'},target.origin);
  }
  return {Session,browserStatus,browserStart,localStart,limit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=VoiceInput;
