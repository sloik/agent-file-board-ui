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
  assert.equal(picker.isMultiple(),false,'the composer unlocks one key file for the persona');
  await picker.setFiles(file);
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
  await room(page);
  await status(page,'needs-unlock',{emoji:'🔒',label:`Unlock ${maya}'s key to post`,detail:'This destination requires trusted signatures',action:`🔒 Unlock ${maya}'s key`,alt:null});
  await expect(page.locator('#signingRequires')).toHaveText('This destination requires trusted signatures.');
  // A new room typed into the options is a different destination.
  await page.fill('#cNewRoom','fresh-room');
  await status(page,'unsigned');
  await page.fill('#cNewRoom','');
  await status(page,'needs-unlock');
  const nobody=await page.evaluate(()=>Object.entries(B.signingParticipants).find(([,v])=>v.unregistered)?.[0]);
  assert.ok(nobody,'fixture has a participant without a registered key');
  await page.selectOption('#me',nobody);
  await status(page,'not-registered',{emoji:'🔒',action:'How to get a key'});
  await notice(page).locator('.signing-notice-action').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signing-setup-you');
  await closeSigning(page);
  await otherRoom(page);
  await status(page,'unsigned',{action:null});
});

test('composer unlock: the persona key unlocks in one step, approval follows, and the signed post verifies in Python',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  requireBoard(f);await refresh(f);await room(page);
  await status(page,'needs-unlock',{action:`🔒 Unlock ${maya}'s key`});
  await refused(page,'Signed from the composer',`${maya}'s key is locked in this tab`);
  await composerUnlock(page,owner.key);
  await status(page,'needs-approval',{emoji:'🔓',label:`Approve ${maya}'s key to post here`,action:'🔓 Approve the key'});
  assert.deepEqual(await catalog(page),[owner.participant]);
  assert.equal(await page.evaluate(()=>signingMode),'signed','unlocking for the persona needs no second step');
  await expect(page.locator('#cBody')).toHaveValue('Signed from the composer');
  // Approval is a separate decision; the button lands on the fingerprint of the persona's key.
  await notice(page).locator('.signing-notice-action').click();
  await expect(page.locator('#signingDialog')).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>[document.activeElement.id,document.querySelector('#signingParticipant').value]),['signingFingerprint',owner.participant]);
  await page.fill('#signingFingerprint',owner.fingerprint);await action(page,'Trust exact fingerprint');await closeSigning(page);
  await status(page,'signed',{emoji:'🔏',label:`Will be signed as ${maya}`,action:'🔒 Lock key',alt:null});
  await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');
  const path=await postedFile(f,'_signed-from-the-composer.txt'),raw=h.fs.readFileSync(h.path.join(f.proj,path),'utf8');
  assert.match(raw,/^FROM: human-owner-01$/m);assert.match(raw,/^SIGNATURE: /m);
  f.cli('signing','trust','--participant',owner.participant,'--profile',owner.profile,'--fingerprint',owner.fingerprint);
  const verdict=inspect(f,path);assert.equal(verdict.signature,'valid');assert.equal(verdict.eligibility,'eligible');
});

test('a key of another participant names its owner and offers to switch; the persona never changes silently',async t=>{
  const f=await boot(t),{page,owner,peer}=f,maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  page.on('dialog',dialog=>dialog.accept());
  await room(page);
  await status(page,'unsigned',{action:`🔒 Unlock ${maya}'s key to sign`});
  await composerUnlock(page,peer.key);
  await expect(notice(page).locator('.signing-notice-note')).toHaveText(`This key belongs to ${sam}, not ${maya}. It is unlocked in this tab, but messages are signed only as the persona in “I am”.`);
  const switcher=notice(page).locator('[data-signing-switch]');
  await expect(switcher).toHaveText(`Switch persona to ${sam}`);
  await expect(page.locator('#me')).toHaveValue(owner.participant);
  await status(page,'needs-unlock',{label:`Unlock ${maya}'s key to post`,detail:`Unlocked here: ${peer.participant}`,alt:'Post unsigned instead'});
  await refused(page,'Never as another key',`${maya}'s key is locked in this tab`);
  await switcher.click();
  await expect(page.locator('#me')).toHaveValue(peer.participant);
  await status(page,'signed',{label:`Will be signed as ${sam}`});
  await expect(notice(page).locator('.signing-notice-note')).toBeHidden();
  await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');
  const path=await postedFile(f,'_never-as-another-key.txt'),raw=h.fs.readFileSync(h.path.join(f.proj,path),'utf8');
  assert.match(raw,/^FROM: research-agent-01$/m,'the author and signer are the persona at send time');
  assert.equal(inspect(f,path).signature,'valid');
  // "Post unsigned instead" is a deliberate choice that locks the keys.
  await page.selectOption('#me',owner.participant);
  await status(page,'needs-unlock',{alt:'Post unsigned instead'});
  await notice(page).locator('.signing-notice-alt').click();
  await status(page,'unsigned');assert.deepEqual(await catalog(page),[]);
});

test('an invalid key file reports a clear error and changes nothing',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  requireBoard(f);await refresh(f);await room(page);
  const mode=await page.evaluate(()=>signingMode);
  await composerUnlock(page,{name:'not-a-key.json',mimeType:'application/json',buffer:Buffer.from('{"not":"a private key"}')});
  await expect(notice(page).locator('.signing-notice-note')).toContainText(`This file did not unlock ${maya}'s key:`);
  await expect(notice(page).locator('.signing-notice-note')).toContainText('Nothing changed.');
  assert.deepEqual(await catalog(page),[]);assert.equal(await page.evaluate(()=>signingMode),mode);
  await expect(page.locator('#me')).toHaveValue(owner.participant);
  await status(page,'needs-unlock');
});

test('switching to a persona whose key is locked shows the padlock and refuses to send, keeping the draft',async t=>{
  const f=await boot(t),{page,owner,peer}=f,maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  await room(page);await composerUnlock(page,owner.key);
  await status(page,'signed',{emoji:'🔏',label:`Will be signed as ${maya}`});
  await page.selectOption('#me',peer.participant);
  await status(page,'needs-unlock',{emoji:'🔒',label:`Unlock ${sam}'s key to post`,detail:`Unlocked here: ${owner.participant}. Messages are signed only as the selected persona.`,action:`🔒 Unlock ${sam}'s key`});
  await refused(page,'Draft for the locked persona',`${sam}'s key is locked in this tab`);
  await page.selectOption('#me',owner.participant);
  await status(page,'signed',{label:`Will be signed as ${maya}`});
  await expect(page.locator('#cBody')).toHaveValue('Draft for the locked persona');
});

test('lock and the 15-minute expiry update the status within the tick, and send rechecks',async t=>{
  const f=await boot(t),{page,owner}=f,maya=await name(page,owner.participant);
  await room(page);await composerUnlock(page,owner.key);await status(page,'signed');
  await notice(page).locator('.signing-notice-action').click();
  await status(page,'needs-unlock',{label:`Unlock ${maya}'s key to post`});
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#signingNotice .signing-notice-action')),true,'the button keeps focus');
  assert.deepEqual(await catalog(page),[]);
  await composerUnlock(page,owner.key);await status(page,'signed');
  // Expiry happens silently inside the provider; nothing but the composer's own tick looks.
  await page.evaluate(()=>{const now=performance.now.bind(performance);performance.now=()=>now()+901000;});
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock',{timeout:35000});
  await refused(page,'After expiry',`${maya}'s key is locked in this tab`);
});

test('a read-only upload says why unlocking is unavailable',async t=>{
  const f=await boot(t),{page}=f;
  requireArchitecture(f);
  await page.reload();await page.setInputFiles('#fallback',f.proj);await expect(page.locator('#me')).toBeVisible();await h.expandComposer(page);
  await otherRoom(page);
  await status(page,'unsigned',{action:null});
  await expect(notice(page).locator('.signing-notice-note')).toHaveText('Unlocking a key is unavailable because this folder is read-only. Open the board folder with write access to sign.');
  await room(page);
  await status(page,'read-only',{emoji:'🔒',label:'Cannot sign: read-only folder',detail:'this board is open read-only',action:'Open the writable folder',alt:null});
  await notice(page).locator('.signing-notice-action').click();
  await expect(page.locator('#locationsDialog')).toBeVisible();
});

test('Polish at phone width: the status, its note and its buttons fit without horizontal overflow',async t=>{
  const f=await boot(t),{page,owner,peer}=f;
  requireBoard(f);await refresh(f);await room(page);
  await setting(page,'#sLang','pl');await page.setViewportSize({width:390,height:844});
  const maya=await name(page,owner.participant),sam=await name(page,peer.participant);
  await status(page,'needs-unlock',{label:`Odblokuj klucz (${maya}), aby wysłać`,action:`🔒 Odblokuj klucz: ${maya}`});
  await composerUnlock(page,peer.key);
  await expect(notice(page).locator('.signing-notice-note')).toContainText(`Ten klucz należy do: ${sam}, nie do: ${maya}.`);
  await expect(notice(page).locator('[data-signing-switch]')).toHaveText(`Przełącz personę na: ${sam}`);
  const geometry=await page.evaluate(()=>{
    const n=document.querySelector('#signingNotice'),r=n.getBoundingClientRect();
    const outside=[...n.querySelectorAll('button,.signing-notice-body')].filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1;}).map(el=>el.textContent);
    return {overflow:document.documentElement.scrollWidth>innerWidth,inside:r.left>=0&&r.right<=innerWidth+1,outside};
  });
  assert.deepEqual(geometry,{overflow:false,inside:true,outside:[]});
});

test('Sign as me: numbered steps, persona defaults to "I am", and changing it changes "I am"',async t=>{
  const f=await boot(t),{page,owner,peer}=f;
  await openSigning(page);
  const own=page.locator('#signing-own'),persona=page.getByLabel('Persona to sign as',{exact:true});
  await expect(persona).toHaveValue(owner.participant);
  await expect(own.locator('label[for="signingPersona"]')).toContainText('Step 1. Persona');
  await expect(own.locator('label[for="signingKeyFiles"]')).toContainText('Step 2. Private key file of this persona — stays in this tab');
  await expect(own.locator('[data-action="unlock"]')).toHaveText('🔒 Step 3. Unlock the key');
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
