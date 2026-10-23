'use strict';
// SPEC-002-061: the composer shows what happens to the message before sending, unlocks the key of
// the persona in "I am" directly, and signs only as that persona.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
const {importBoard,exportBoard,openSigning,action,closeSigning}=native;
const crypto=require('node:crypto');
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
const boot=t=>native.boot(t,browser,url);

function policy(f,signing){const file=h.path.join(f.proj,'.agent-board/config.json'),cfg=JSON.parse(h.fs.readFileSync(file));cfg.message_signing=signing;h.fs.writeFileSync(file,JSON.stringify(cfg));}
const requireBoard=f=>policy(f,{version:1,minimum:'trusted'});
const requireArchitecture=f=>policy(f,{version:1,minimum:'optional',scopes:{'rooms/architecture':{minimum:'trusted'}}});
async function refresh(f){await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
async function room(page,where='room:architecture',topic='Composer signing'){await page.selectOption('#cWhere',where);await page.selectOption('#cThread','');await page.fill('#cNewThread',topic);}
async function otherRoom(page){const where=await page.evaluate(()=>[...document.querySelector('#cWhere').options].map(o=>o.value).find(v=>v.startsWith('room:')&&v!=='room:architecture'));assert.ok(where,'fixture has a second room');await room(page,where);}
async function setting(page,id,value){await page.click('#gear');await page.selectOption(id,value);await page.click('#sClose');}
const notice=page=>page.locator('#signingNotice');
const name=(page,id)=>page.evaluate(id=>B.people[id].name,id);
const catalog=page=>page.evaluate(()=>signingProvider.catalog().map(p=>p.participant).sort());
async function status(page,id,{label,emoji,action:act,detail,alt}={}){
  await expect(notice(page)).toHaveAttribute('data-signing-status',id);
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveAttribute('role','status');
  if(label)await expect(notice(page).locator('.signing-notice-label')).toHaveText(label);
  if(emoji)await expect(notice(page).locator('.signing-notice-emoji')).toHaveText(emoji);
  if(detail)await expect(notice(page).locator('.signing-notice-text')).toContainText(detail);
  const button=notice(page).locator('.signing-notice-action'),other=notice(page).locator('.signing-notice-alt');
  if(act===null)await expect(button).toBeHidden();else if(act)await expect(button).toHaveText(act);
  if(alt===null)await expect(other).toBeHidden();else if(alt)await expect(other).toHaveText(alt);
}
// The action button itself opens the operating system file picker.
async function composerUnlock(page,file){
  const chooser=page.waitForEvent('filechooser');
  await notice(page).locator('.signing-notice-action').click();
  const picker=await chooser;
  assert.equal(picker.isMultiple(),true,'several key files may be chosen');
  assert.equal(await picker.element().getAttribute('accept'),null,'no restrictive file type: phones grey out .json key files');
  await picker.setFiles(file);
  await expect.poll(()=>page.evaluate(()=>{const i=document.querySelector('#signingComposerKey');return [i.value,i.files.length];})).toEqual(['',0]);
}
async function published(page,body){
  return page.evaluate(async body=>{
    async function contains(dir){
      for await(const [,handle] of dir.entries()){
        if(handle.kind==='directory'){if(await contains(handle))return true;}
        else if(handle.name.endsWith('.txt')&&(await (await handle.getFile()).text()).includes(body))return true;
      }
      return false;
    }
    return contains(await navigator.storage.getDirectory());
  },body);
}
// A refused send says what the status row says, keeps the draft and writes nothing.
async function refused(page,body,phrase){
  const before=await page.evaluate(()=>B.msgs.length);
  await page.fill('#cBody',body);await page.click('#send');
  await expect(page.locator('#toast')).toContainText(phrase);
  await expect(page.locator('#toast')).toHaveText(await notice(page).locator('.signing-notice-text').textContent());
  await expect(page.locator('#cBody')).toHaveValue(body);
  assert.equal(await page.evaluate(()=>B.msgs.length),before);
  assert.equal(await published(page,body),false,'a refused send writes no file and never falls back to unsigned');
}
async function postedFile(f,suffix){
  await exportBoard(f.page,f.proj);
  const dir=h.path.join(f.proj,'.agent-board/rooms/architecture'),file=h.fs.readdirSync(dir).find(name=>name.endsWith(suffix));
  assert.ok(file,'browser committed '+suffix);return '.agent-board/rooms/architecture/'+file;
}
const inspect=(f,path)=>JSON.parse(f.cli('signing','inspect','--message',path.replace(/^\.agent-board\//,'')));

test('the status is visible before sending and follows the destination and the persona',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  requireArchitecture(f);await refresh(f);
  await otherRoom(page);
  await status(page,'unsigned',{emoji:'📝',label:'Will post unsigned',detail:'This destination does not require signatures.',action:`🔒 Unlock ${maya}'s key to sign`,alt:null});
  await expect(notice(page).locator('.signing-notice-action')).toHaveClass(/signing-link/,'an optional offer is a link, not a prominent button');
  await room(page);
  await status(page,'needs-unlock',{emoji:'🔒',label:`Unlock ${maya}'s key to post`,detail:'This destination requires trusted signatures',action:`🔒 Unlock ${maya}'s key`,alt:'👤 Not yours? Choose another persona'});
  await expect(notice(page).locator('.signing-notice-action')).toHaveClass(/\bbtn\b/);
  await expect(notice(page).locator('.signing-notice-hint')).toHaveText('The key file must be on this device.');
  await expect(page.locator('#signingRequires')).toBeHidden('the status row already says the destination requires signatures');
  // The status sits directly above Send, so the persona that will sign is next to the button.
  assert.equal(await page.evaluate(()=>document.querySelector('#signingNotice').nextElementSibling.contains(document.querySelector('#send'))),true);
  await notice(page).locator('.signing-notice-alt').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'me','"Not yours?" leads to "I am"');
  await page.fill('#cNewRoom','fresh-room');
  await status(page,'unsigned');
  await page.fill('#cNewRoom','');
  await status(page,'needs-unlock');
  const nobody=await page.evaluate(()=>Object.entries(B.signingParticipants).find(([,v])=>v.unregistered)?.[0]);
  assert.ok(nobody,'fixture has a participant without a registered key');
  await page.selectOption('#me',nobody);
  await status(page,'not-registered',{emoji:'❔',action:'How to get a key'});
  await notice(page).locator('.signing-notice-action').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signing-setup-you');
  await closeSigning(page);
  await otherRoom(page);
  await status(page,'unsigned',{action:null});
});

test('composer unlock: one step for the persona, approval only through the fingerprint review, and the signed post verifies in Python',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  requireBoard(f);await refresh(f);await room(page);
  await status(page,'needs-unlock',{action:`🔒 Unlock ${maya}'s key`});
  await refused(page,'Signed from the composer',`${maya}'s key is locked in this tab`);
  await composerUnlock(page,owner.key);
  await status(page,'needs-approval',{emoji:'🔑',label:`Approve ${maya}'s key once on this device`,action:'🔑 Review and approve the key'});
  assert.deepEqual(await catalog(page),[owner.participant]);
  assert.equal(await page.evaluate(()=>signingMode),'signed','unlocking for the persona needs no second step');
  await expect(page.locator('#cBody')).toHaveValue('Signed from the composer');
  await notice(page).locator('.signing-notice-action').click();
  await expect(page.locator('#signingDialog')).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>[document.activeElement.id,document.querySelector('#signingParticipant').value,B.signingContext.state.pins]),['signingFingerprint',owner.participant,{}],'the button opens the review; it never approves');
  await page.fill('#signingFingerprint',owner.fingerprint);await action(page,'Trust exact fingerprint');await closeSigning(page);
  await status(page,'signed',{emoji:'🔏',label:`Will be signed as ${maya}`,action:`🔒 Lock ${maya}'s key`,alt:null});
  await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');
  const path=await postedFile(f,'_signed-from-the-composer.txt'),raw=h.fs.readFileSync(h.path.join(f.proj,path),'utf8');
  assert.match(raw,/^FROM: human-owner-01$/m);assert.match(raw,/^SIGNATURE: /m);
  f.cli('signing','trust','--participant',owner.participant,'--profile',owner.profile,'--fingerprint',owner.fingerprint);
  const verdict=inspect(f,path);assert.equal(verdict.signature,'valid');assert.equal(verdict.eligibility,'eligible');
  // Send follows the status: a required room with the persona's key unlocked and approved signs,
  // even when signing was switched off for optional rooms.
  await page.evaluate(()=>{signingMode='unsigned';updateSigningNotice();});
  await status(page,'signed');
  await page.selectOption('#cThread','');await page.fill('#cNewThread','Status decides');await page.fill('#cBody','Status decides signing');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');
  const second=await postedFile(f,'_status-decides-signing.txt');
  assert.match(h.fs.readFileSync(h.path.join(f.proj,second),'utf8'),/^SIGNATURE: /m);assert.equal(inspect(f,second).signature,'valid');
});

test('a key of another participant is named with its fingerprint; switching persona is always an explicit click',async t=>{
  const f=await boot(t),{page,owner,peer}=f,maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  page.on('dialog',dialog=>dialog.accept());
  await room(page);
  await status(page,'unsigned',{action:`🔒 Unlock ${maya}'s key to sign`});
  await composerUnlock(page,peer.key);
  await expect(notice(page).locator('.signing-notice-note')).toHaveText(`This key is registered to ${sam} (${peer.fingerprint}). It is not for ${maya}, so nothing is signed with it while “I am” is ${maya}.`);
  const switcher=notice(page).locator('.signing-notice-switch');
  await expect(switcher).toHaveText(`👤 Switch persona to ${sam}`);
  await expect(page.locator('#me')).toHaveValue(owner.participant);
  assert.equal(await page.evaluate(()=>signingMode),'unsigned','a key for someone else does not turn signing on');
  assert.equal(await page.evaluate(()=>document.querySelector('#signingNotice').outerHTML.includes('research-agent-01"')),false,'no persona-to-key mapping is written into the page');
  // Choosing the persona in "I am" directly: the key is unlocked, signing is still off, and the row offers to turn it on.
  await page.selectOption('#me',peer.participant);
  await status(page,'unsigned',{action:'🔏 Turn signing on',detail:`${sam}'s key is unlocked, but signing is off.`});
  await page.selectOption('#me',owner.participant);
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(page.locator('#me')).toHaveValue(peer.participant);
  await status(page,'signed',{label:`Will be signed as ${sam}`});
  await expect(notice(page).locator('.signing-notice-note')).toBeHidden();
  await page.fill('#cBody','Signed as the chosen persona');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');
  const path=await postedFile(f,'_signed-as-the-chosen-persona.txt'),raw=h.fs.readFileSync(h.path.join(f.proj,path),'utf8');
  assert.match(raw,/^FROM: research-agent-01$/m,'the author and signer are the persona at send time');
  assert.equal(inspect(f,path).signature,'valid');
  // Back to a persona whose key is locked: signing stays on, so nothing is sent unsigned without a choice.
  await page.selectOption('#me',owner.participant);
  await status(page,'needs-unlock',{alt:'Post unsigned instead'});
  await refused(page,'Never as another key',`${maya}'s key is locked in this tab`);
  page.removeAllListeners('dialog');
  page.once('dialog',dialog=>dialog.dismiss());
  await notice(page).locator('.signing-notice-alt').click();
  await status(page,'needs-unlock');assert.deepEqual(await catalog(page),[peer.participant],'dismissing the confirmation changes nothing');
  page.once('dialog',dialog=>{assert.match(dialog.message(),/Post without a signature\?/);dialog.accept();});
  await notice(page).locator('.signing-notice-alt').click();
  await status(page,'unsigned');assert.deepEqual(await catalog(page),[]);
});

test('a key that belongs to nobody and an invalid file report clearly and change nothing',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  requireBoard(f);await refresh(f);await room(page);
  const mode=await page.evaluate(()=>signingMode);
  const stranger={...crypto.generateKeyPairSync('ed25519').privateKey.export({format:'jwk'})};
  await composerUnlock(page,{name:'stranger.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(stranger))});
  await expect(notice(page).locator('.signing-notice-note')).toHaveText('Not unlocked: This key belongs to nobody on this board. Nothing else changed.');
  await composerUnlock(page,{name:'not-a-key.json',mimeType:'application/json',buffer:Buffer.from('{"not":"a private key"}')});
  await expect(notice(page).locator('.signing-notice-note')).toContainText('Not unlocked:');
  await expect(notice(page).locator('.signing-notice-note')).toContainText('Nothing else changed.');
  assert.deepEqual(await catalog(page),[]);assert.equal(await page.evaluate(()=>signingMode),mode);
  await expect(page.locator('#me')).toHaveValue(owner.participant);
  await status(page,'needs-unlock',{label:`Unlock ${maya}'s key to post`});
});

test('switching to a persona whose key is locked shows the padlock and refuses to send, keeping the draft',async t=>{
  const f=await boot(t),{page,owner,peer}=f,maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  await room(page);await composerUnlock(page,owner.key);
  await status(page,'signed',{emoji:'🔏',label:`Will be signed as ${maya}`});
  await page.selectOption('#me',peer.participant);
  await status(page,'needs-unlock',{emoji:'🔒',label:`Unlock ${sam}'s key to post`,detail:`Unlocked here: ${maya}. Messages are signed only as the selected persona.`,action:`🔒 Unlock ${sam}'s key`,alt:'Post unsigned instead'});
  await refused(page,'Draft for the locked persona',`${sam}'s key is locked in this tab`);
  await page.selectOption('#me',owner.participant);
  await status(page,'signed',{label:`Will be signed as ${maya}`});
  await expect(page.locator('#cBody')).toHaveValue('Draft for the locked persona');
});

test('lock, returning to the tab and the 15-minute expiry update the status, and send rechecks',async t=>{
  const f=await boot(t),{page,owner,peer}=f,maya=await name(page,owner.participant);
  await room(page);await composerUnlock(page,[owner.key,peer.key]);
  // The provider locks every key at once, and the button says so when more than one is unlocked.
  await status(page,'signed',{action:'🔒 Lock all keys in this tab'});
  await notice(page).locator('.signing-notice-action').click();
  await status(page,'needs-unlock',{label:`Unlock ${maya}'s key to post`});
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#signingNotice .signing-notice-action')),true,'the button keeps focus');
  assert.deepEqual(await catalog(page),[]);
  await composerUnlock(page,owner.key);await status(page,'signed',{action:`🔒 Lock ${maya}'s key`});
  // Expiry happens silently inside the provider. Coming back to the tab rechecks at once.
  await page.evaluate(()=>{const now=performance.now.bind(performance);performance.now=()=>now()+901000;window.dispatchEvent(new Event('focus'));});
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock',{timeout:1000});
  await page.evaluate(()=>{performance.now=Performance.prototype.now.bind(performance);});
  // Without focus events, the 30-second tick catches it.
  await composerUnlock(page,owner.key);await status(page,'signed');
  await page.evaluate(()=>{const now=performance.now.bind(performance);performance.now=()=>now()+901000;});
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock',{timeout:35000});
  await refused(page,'After expiry',`${maya}'s key is locked in this tab`);
});

test('the status tick never moves the cursor or the focus in the message field',async t=>{
  const f=await boot(t),{page,owner}=f;
  await room(page);await composerUnlock(page,owner.key);await status(page,'signed');
  await page.click('#cBody');await page.keyboard.type('Typing while the key expires');
  await page.evaluate(()=>document.querySelector('#cBody').setSelectionRange(6,6));
  await page.evaluate(()=>{signingProvider.lock();signingTick();window.dispatchEvent(new Event('focus'));});
  await status(page,'needs-unlock');
  assert.deepEqual(await page.evaluate(()=>{const b=document.querySelector('#cBody');return [document.activeElement===b,b.selectionStart,b.selectionEnd,b.value];}),[true,6,6,'Typing while the key expires']);
  await page.keyboard.type('X');
  await expect(page.locator('#cBody')).toHaveValue('TypingX while the key expires');
});

test('a read-only upload says why unlocking is unavailable',async t=>{
  const f=await boot(t),{page}=f;
  requireArchitecture(f);
  await page.reload();await page.setInputFiles('#fallback',f.proj);await expect(page.locator('#me')).toBeVisible();await h.expandComposer(page);
  await otherRoom(page);
  await status(page,'unsigned',{action:null});
  await expect(notice(page).locator('.signing-notice-note')).toHaveText('Unlocking a key is unavailable because this folder is read-only. Open the board folder with write access to sign.');
  await room(page);
  await status(page,'read-only',{emoji:'⛔',label:'Cannot sign: read-only folder',detail:'this board is open read-only',action:'Open the writable folder',alt:null});
  await notice(page).locator('.signing-notice-action').click();
  await expect(page.locator('#locationsDialog')).toBeVisible();
});

test('phone width in Polish with a long persona name: emoji and short label, details on tap, actions of 44px above Send',async t=>{
  const f=await boot(t),{page,owner,peer}=f;
  requireBoard(f);await refresh(f);await room(page);
  await setting(page,'#sLang','pl');await page.setViewportSize({width:390,height:844});
  const maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  await status(page,'needs-unlock',{label:`Odblokuj klucz: ${maya}, aby wysłać`,action:`🔒 Odblokuj klucz: ${maya}`});
  await expect(notice(page).locator('.signing-notice-text')).toBeHidden();
  const more=notice(page).locator('.signing-notice-more');
  await expect(more).toHaveText('Szczegóły');await more.click();
  await expect(more).toHaveAttribute('aria-expanded','true');
  await expect(notice(page).locator('.signing-notice-text')).toBeVisible();
  await more.click();await expect(notice(page).locator('.signing-notice-text')).toBeHidden();
  await composerUnlock(page,peer.key);
  await expect(notice(page).locator('.signing-notice-note')).toContainText(`Ten klucz jest zarejestrowany dla: ${sam} (${peer.fingerprint}). Nie jest dla: ${maya}`);
  await expect(notice(page).locator('.signing-notice-switch')).toHaveText(`👤 Przełącz personę na: ${sam}`);
  // Collapsed, only the emoji, label, Details and the main action show; Send stays on screen.
  for (const part of ['.signing-notice-note','.signing-notice-switch','.signing-notice-alt','.signing-notice-hint']) await expect(notice(page).locator(part)).toBeHidden();
  await expect(notice(page).locator('.signing-notice-action')).toBeVisible();
  await expect(more).toHaveText('Szczegóły');
  // With the message options folded (the phone default), the message field and Send stay on screen.
  await page.locator('#composerOptions > summary').click();await expect(page.locator('#composerOptions')).toHaveJSProperty('open',false);
  await page.locator('#composer').evaluate(c=>c.scrollTop=c.scrollHeight);
  await expect(page.locator('#cBody')).toBeInViewport();await expect(page.locator('#send')).toBeInViewport({ratio:1});
  await page.locator('#composerOptions > summary').click();
  // Expanded, the note gets its own row: the label keeps its width instead of being squeezed beside it.
  await more.click();
  await expect(notice(page).locator('.signing-notice-note')).toBeVisible();await expect(notice(page).locator('.signing-notice-switch')).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>{const n=document.querySelector('#signingNotice'),head=n.querySelector('.signing-notice-head').getBoundingClientRect(),note=n.querySelector('.signing-notice-note').getBoundingClientRect();return [head.width>=innerWidth/2,note.top>=head.bottom-1];}),[true,true]);
  await more.click();
  // Every state, rendered with the longest Polish labels and a long persona name, fits the phone.
  const results=await page.evaluate(()=>{
    const long='Maksymilianna Konstantynopolitańczykiewiczówna-Szczebrzeszyńska',me=currentUser(),out=[];
    B.people[me].name=long;
    const base=over=>({hasContext:true,writable:true,required:true,mode:'signed',persona:me,names:{[me]:long},catalog:[],known:{},participants:{[me]:{fingerprint:'fp'}},pins:{},...over});
    const states=[base({error:'Private signing context changed in another tab; refresh and review'}),base({persona:''}),base({writable:false}),base({participants:{[me]:{unregistered:true}}}),base({catalog:[me],participants:{[me]:{fingerprint:'fp',revoked:{}}}}),
      base({known:{[me]:'old'}}),base(),base({catalog:[me],pins:{[me]:'old'}}),base({catalog:[me]}),base({catalog:[me],pins:{[me]:'fp'}}),base({required:false,mode:'unsigned'})];
    for(const s of states){
      const st=signingComposerStatus(s);updateSigningNotice(st);
      const n=document.querySelector('#signingNotice'),r=n.getBoundingClientRect(),send=document.querySelector('#send').getBoundingClientRect();
      const visible=[...n.querySelectorAll('button,.signing-notice-head,.signing-notice-note')].filter(el=>el.getClientRects().length);
      const head=n.querySelector('.signing-notice-head').getBoundingClientRect();
      out.push({id:st.id,wide:head.width>=innerWidth/2,overflow:document.documentElement.scrollWidth>innerWidth,inside:r.left>=0&&r.right<=innerWidth+1,
        outside:visible.filter(el=>{const b=el.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;}).map(el=>el.textContent),
        small:[...n.querySelectorAll('.signing-notice-actions button')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().height<44).map(el=>el.textContent),
        aboveSend:r.bottom<=send.top+1,label:n.querySelector('.signing-notice-label').textContent});
    }
    return out;
  });
  for(const r of results){
    assert.deepEqual({overflow:r.overflow,inside:r.inside,outside:r.outside,small:r.small,aboveSend:r.aboveSend,wide:r.wide},{overflow:false,inside:true,outside:[],small:[],aboveSend:true,wide:true},r.id+': '+r.label);
  }
  assert.equal(results.length,11);
});

test('Sign as me: numbered steps, persona defaults to "I am", and changing it changes "I am"',async t=>{
  const f=await boot(t),{page,owner,peer}=f;
  await openSigning(page);
  const own=page.locator('#signing-own'),persona=page.getByLabel('Persona to sign as',{exact:true});
  await expect(persona).toHaveValue(owner.participant);
  await expect(own.locator('label[for="signingPersona"]')).toContainText('Step 1. Persona');
  await expect(own.locator('label[for="signingKeyFiles"]')).toContainText('Step 2. Private key file of this persona — stays in this tab');
  await expect(own.locator('[data-action="unlock"]')).toHaveText('🔒 Step 3. Unlock the key');
  await expect(own.locator('[data-action="lock"]')).toHaveText('🔒 Lock all keys');
  await expect(own).toContainText('Unlocking needs two things: the persona you sign as and that persona\'s private key file. The file stays in this tab.');
  await expect(page.locator('#signingDialog')).not.toContainText('Choose who to sign as');
  await expect(page.locator('#signingDialog')).not.toContainText('viewing identity is separate');
  assert.equal(await page.locator('#signingIdentity').count(),0,'there is no separate signer choice');
  await persona.selectOption(peer.participant);
  await expect(page.locator('#me')).toHaveValue(peer.participant);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles(owner.key);
  await action(page,'Unlock selected keys');
  await expect(own.locator('.signing-feedback')).toContainText(`This key belongs to ${await name(page,owner.participant)}, not ${await name(page,peer.participant)}.`);
  await expect(page.locator('#me')).toHaveValue(peer.participant,'unlocking never changes the persona');
  await persona.selectOption(owner.participant);
  await expect(page.locator('#me')).toHaveValue(owner.participant);
  await expect(page.locator('#signingMode')).toContainText(`Signing new messages as: ${await name(page,owner.participant)} (${owner.participant})`);
  await closeSigning(page);
  await status(page,'signed');
});

test('a persona switch during sending is refused after signing and at the final write guard, keeping the draft',async t=>{
  const f=await boot(t),{page,owner,peer}=f;
  page.on('dialog',dialog=>dialog.accept());
  await openSigning(page);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles([owner.key,peer.key]);
  await action(page,'Unlock selected keys');await closeSigning(page);
  assert.deepEqual(await catalog(page),[owner.participant,peer.participant].sort(),'both keys are unlocked, so only the persona check can refuse');
  await room(page);await status(page,'signed');
  // S.me changes directly, so neither the draft stamp nor the provider epoch moves.
  await page.fill('#cBody','Switched while signing');
  await page.evaluate(id=>{const original=signingProvider.sign.bind(signingProvider);signingProvider.sign=async(...args)=>{const result=await original(...args);S.me=id;signingProvider.sign=original;return result;};},peer.participant);
  await page.click('#send');
  await expect(page.locator('#toast')).toContainText('Board, draft or signer changed');
  await expect(page.locator('#cBody')).toHaveValue('Switched while signing');
  assert.equal(await published(page,'Switched while signing'),false);
  await page.evaluate(id=>{S.me=id;},owner.participant);
  await page.fill('#cBody','Switched at write');
  await page.evaluate(async id=>{
    const proto=Object.getPrototypeOf(await baseHandle.getFileHandle('config.json')),original=proto.createWritable;
    proto.createWritable=async function(...args){const writer=await original.apply(this,args);if(this.name.endsWith('_switched-at-write.txt')){const write=writer.write;writer.write=async(...data)=>{await write.apply(writer,data);S.me=id;};}return writer;};
  },peer.participant);
  await page.click('#send');
  await expect(page.locator('#toast')).toContainText('Posting context changed');
  await expect(page.locator('#cBody')).toHaveValue('Switched at write');
  assert.equal(await published(page,'Switched at write'),false);
});
