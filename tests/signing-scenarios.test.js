'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {expect} = require('playwright/test');
const h = require('./lib/helpers');
const {fixture} = require('./lib/signing-fixture');
let browser, server, url;
before(async () => {
  browser = await h.launch();
  server = http.createServer((req,res) => {
    if (req.url !== '/board.html') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(h.fs.readFileSync(h.BOARD_HTML));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  url = `http://127.0.0.1:${server.address().port}/board.html`;
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

// Only picker selection is substituted. All directory/file handles, Files,
// writable streams, commit semantics and IndexedDB records are Chromium-native.
async function importBoard(page, proj) {
  await page.evaluate(async tree => {
    async function sync(dir,node) {
      for await (const [name] of dir.entries()) if (!Object.hasOwn(node.children,name)) await dir.removeEntry(name,{recursive:true});
      for (const [name,child] of Object.entries(node.children)) {
        if (child.kind === 'directory') await sync(await dir.getDirectoryHandle(name,{create:true}),child);
        else { const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable(); await writer.write(child.text); await writer.close(); }
      }
    }
    const root=await navigator.storage.getDirectory();
    await sync(root,tree);
  },h.readTree(proj));
}
async function exportBoard(page, proj) {
  const tree = await page.evaluate(async () => {
    async function read(dir) {
      const children={};
      for await (const [name,handle] of dir.entries()) children[name]=handle.kind==='directory' ? await read(handle) : {kind:'file',text:await (await handle.getFile()).text()};
      return {kind:'directory',children};
    }
    return read(await navigator.storage.getDirectory());
  });
  // This is the owned disposable fixture, never a user-selected real directory.
  h.fs.rmSync(h.path.join(proj,'.agent-board'),{recursive:true,force:true});
  h.writeTree(tree,proj);
}
async function boot(t) {
  const f=fixture(); t.after(f.clean);
  const ctx=await browser.newContext(),page=await ctx.newPage();t.after(()=>ctx.close());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});
  await page.goto(url);await importBoard(page,f.proj);await h.openBoardViaUi(page);await h.expandComposer(page);
  assert.deepEqual(await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),board=await root.getDirectoryHandle('.agent-board'),file=await (await board.getFileHandle('config.json')).getFile();return [root instanceof FileSystemDirectoryHandle,file instanceof File,window.__fakefs===undefined];}),[true,true,true]);
  t.after(()=>assert.deepEqual(errors,[]));
  return {...f,ctx,page};
}
async function openSigning(page) { await h.openToolbarTool(page,'signingTools');await expect(page.locator('#signingDialog')).toBeVisible(); }
async function action(page,label) {const button=page.getByRole('button',{name:label,exact:true});await button.click();await expect(button).toBeEnabled();}
async function closeSigning(page) {await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('#signingDialog')).not.toBeVisible();}
async function unlock(page,identity) {
  await openSigning(page);await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles(identity.key);
  await action(page,'Unlock selected keys');await expect(page.locator('#signingDialog [role=status]')).toContainText('Automatic signing after unlock');
  await expect(page.locator('#signingDialog [role=status]')).toContainText('Signing as: '+identity.participant);
  await closeSigning(page);
}
async function trust(page,identity) {
  await page.getByLabel('Trust participant',{exact:true}).selectOption(identity.participant);
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(identity.fingerprint);
  await action(page,'Trust exact fingerprint');await expect(page.locator('#signingDialog [role=status]')).not.toContainText('Fingerprint does not match');
}
async function decision(page,path) {return page.evaluate(path=>B.byPath.get(path)?.signing,path.replace(/^\.agent-board\//,''));}
async function assertNotPublished(page,body) {
  const found=await page.evaluate(async body=>{
    async function contains(dir) {
      for await(const [,handle] of dir.entries()) {
        if(handle.kind==='directory'){if(await contains(handle))return true;}
        else if(handle.name.endsWith('.txt') && (await (await handle.getFile()).text()).includes(body))return true;
      }
      return false;
    }
    return contains(await navigator.storage.getDirectory());
  },body);
  assert.equal(found,false,'failed signing must not publish an unsigned fallback');
}

function inspect(f,path) {return JSON.parse(f.cli('signing','inspect','--message',path.replace(/^\.agent-board\//,'')));}
function cliTrust(f,identity) {f.cli('signing','trust','--participant',identity.participant,'--profile',identity.profile,'--fingerprint',identity.fingerprint);}
function requireSigning(f) {
  const path=h.path.join(f.proj,'.agent-board/config.json'),cfg=JSON.parse(h.fs.readFileSync(path));cfg.message_signing={version:1,minimum:'trusted'};h.fs.writeFileSync(path,JSON.stringify(cfg));
}
async function refresh(f) {await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
async function postBrowser(f,body='Native browser exact bytes 🐈') {
  await unlock(f.page,f.owner);await f.page.selectOption('#me',f.peer.participant);
  await f.page.selectOption('#cWhere','room:architecture');await f.page.selectOption('#cTo',f.peer.participant);
  await f.page.selectOption('#cThread','');await f.page.fill('#cNewThread','Native signing lifecycle');await f.page.fill('#cBody',body);await f.page.click('#send');
  await expect(f.page.locator('#cBody')).toHaveValue('');await exportBoard(f.page,f.proj);
  const messages=h.fs.readdirSync(h.path.join(f.proj,'.agent-board/rooms/architecture'));
  const file=messages.find(name=>name.endsWith('_native-browser-exact-bytes.txt'));
  assert.ok(file,'browser committed the expected message');return '.agent-board/rooms/architecture/'+file;
}

test('native browser streams: UI→CLI→UI replies, explicit trust/adoption and locked reload',async t=>{
  const f=await boot(t),{page}=f,root=await postBrowser(f);
  const raw=h.fs.readFileSync(h.path.join(f.proj,root),'utf8'),thread=raw.match(/^THREAD: (T\d+)/m)[1];
  assert.match(raw,/FROM: human-owner-01\nTO: research-agent-01\n/);assert.ok(raw.endsWith('Native browser exact bytes 🐈\n'));
  assert.equal(inspect(f,root).signature,'valid');
  requireSigning(f);cliTrust(f,f.owner);cliTrust(f,f.peer);f.cli('signing','adopt');
  const reply=f.cli('post','--from',f.peer.participant,'--to',f.owner.participant,'--scope','room','--room','architecture','--thread',thread,'--reply-to',h.path.basename(root),'--slug','cli-signed-reply','--body','CLI signed reply','--signing-key-file',f.peer.key);
  await refresh(f);assert.equal((await decision(page,reply)).signature,'valid');assert.equal((await decision(page,reply)).eligibility,'excluded');
  await openSigning(page);await page.getByLabel('Trust participant',{exact:true}).selectOption(f.peer.participant);
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(f.peer.fingerprint+'wrong');await action(page,'Trust exact fingerprint');
  await expect(page.locator('#signingDialog [role=status]')).toHaveText('Fingerprint does not match verified current profile');
  assert.equal((await decision(page,reply)).trust,'unfamiliar');
  await action(page,'Inspect current profile');assert.equal(JSON.parse(await page.locator('#signingDialog [role=status]').innerText()).fingerprint,f.peer.fingerprint);
  await trust(page,f.owner);await trust(page,f.peer);await action(page,'Adopt current policy floor');await closeSigning(page);
  for (const path of [root,reply]) {const result=await decision(page,path);assert.equal(result.signature,'valid');assert.equal(result.trust,'trusted');assert.equal(result.eligibility,'eligible');}
  await page.locator(`.tcard[data-tk="room:architecture|${thread}"]`).click();
  await page.locator(`article.msg[data-file="${h.path.basename(reply)}"] [data-reply]`).click();
  await page.fill('#cBody','Browser answers peer');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');await exportBoard(page,f.proj);
  const response=h.fs.readdirSync(h.path.join(f.proj,'.agent-board/rooms/architecture')).find(name=>name.endsWith('_browser-answers-peer.txt'));
  const responsePath='.agent-board/rooms/architecture/'+response;
  assert.equal(inspect(f,responsePath).eligibility,'eligible');assert.equal(inspect(f,responsePath).trust,'trusted');
  assert.ok(h.fs.readFileSync(h.path.join(f.proj,responsePath),'utf8').includes('REPLY-TO: '+h.path.basename(reply)+'\n'));
  await page.reload();await h.openBoardViaUi(page);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  assert.equal((await decision(page,reply)).eligibility,'eligible');
  await openSigning(page);await expect(page.locator('#signingDialog [role=status]')).toContainText('Unlocked identities: none');await closeSigning(page);
});

test('native lifecycle: dual rotation, new-key trust, compromise and persisted anti-stripping decisions',async t=>{
  const f=await boot(t),{page}=f,root=await postBrowser(f);
  requireSigning(f);cliTrust(f,f.owner);f.cli('signing','adopt');await refresh(f);
  await openSigning(page);await trust(page,f.owner);await action(page,'Adopt current policy floor');await closeSigning(page);
  assert.equal((await decision(page,root)).eligibility,'eligible');
  const rotated=f.rotate();assert.notEqual(rotated.fingerprint,f.owner.fingerprint);await refresh(f);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  const old=await decision(page,root);assert.equal(old.lifecycle,'superseded');assert.equal(old.eligibility,'excluded');
  const thread=h.fs.readFileSync(h.path.join(f.proj,root),'utf8').match(/^THREAD: (T\d+)/m)[1];
  await page.selectOption('#cThread',`room:architecture|${thread}`);
  await page.fill('#cBody','Old capability cannot publish');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('Old capability cannot publish');await expect(page.locator('#toast')).toHaveText('Write error: Trust the verified current fingerprint before posting');await assertNotPublished(page,'Old capability cannot publish');
  const proofArgs=['post','--from',rotated.participant,'--to','all','--scope','room','--room','architecture','--thread',thread,'--slug','rotated-proof','--body','Rotated key proof','--signing-key-file',rotated.key];
  assert.match(f.reject(...proofArgs),/requires a deliberately trusted current signer/);cliTrust(f,rotated);
  const proof=f.cli(...proofArgs);
  await refresh(f);assert.equal((await decision(page,proof)).trust,'unfamiliar');assert.equal((await decision(page,proof)).eligibility,'excluded');
  await openSigning(page);await trust(page,rotated);await closeSigning(page);
  assert.equal((await decision(page,proof)).eligibility,'eligible');assert.equal(inspect(f,proof).eligibility,'eligible');
  // Trust and possession are separate gates: trusting the new key cannot unlock it.
  await page.click('#send');await expect(page.locator('#toast')).toHaveText('Write error: unlock a registered signing identity');
  await expect(page.locator('#cBody')).toHaveValue('Old capability cannot publish');await assertNotPublished(page,'Old capability cannot publish');
  await unlock(page,rotated);
  f.cli('signing','revoke','--participant',rotated.participant,'--key-file',rotated.key,'--expect-profile',rotated.profile,'--status','compromised');await refresh(f);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  assert.equal((await decision(page,proof)).lifecycle,'compromised');assert.equal(inspect(f,proof).lifecycle,'compromised');
  const configPath=h.path.join(f.proj,'.agent-board/config.json'),config=JSON.parse(h.fs.readFileSync(configPath));delete config.message_signing;h.fs.writeFileSync(configPath,JSON.stringify(config));
  const registryPath=h.path.join(f.proj,'.agent-board/participants.json'),registry=JSON.parse(h.fs.readFileSync(registryPath));registry.participants.find(p=>p.id===rotated.participant).identity.events=[];h.fs.writeFileSync(registryPath,JSON.stringify(registry));
  h.fs.rmSync(h.path.join(f.proj,'.agent-board/identity/events'),{recursive:true,force:true});
  await refresh(f);await page.reload();await h.openBoardViaUi(page);
  for (const result of [await decision(page,proof),inspect(f,proof)]) {assert.equal(result.minimum,'trusted');assert.equal(result.lifecycle,'compromised');assert.equal(result.eligibility,'excluded');}
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  await openSigning(page);await action(page,'Inspect excluded messages');await closeSigning(page);
  await page.locator(`.tcard[data-tk="room:architecture|${thread}"]`).click();
  const article=page.locator(`article.msg[data-file="${h.path.basename(proof)}"]`);await expect(article).toContainText('Rotated key proof');
  assert.equal(await article.locator('[data-reply]:enabled').count(),0);
  assert.equal(await page.evaluate(path=>unread(B.byPath.get(path)),proof.replace(/^\.agent-board\//,'')),false);
});

test('reviewed voice draft is published through the ordinary signed native browser stream',async t=>{
  const f=await boot(t),{page}=f;
  await unlock(page,f.owner);await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cTo',f.peer.participant);await page.selectOption('#cThread','');await page.fill('#cNewThread','Voice signing');
  await page.evaluate(()=>{class R{static async available(){return 'available';}constructor(){window.voiceRecognition=this;}start(){}stop(){this.onend?.();}abort(){}}R.prototype.processLocally=false;window.SpeechRecognition=R;});
  await h.openToolbarTool(page,'voiceTools');await page.selectOption('#voiceProvider','browser');await page.click('#voiceStart');await expect(page.locator('#voiceStatus')).toContainText('Listening');
  await page.evaluate(()=>voiceRecognition.onresult({results:[Object.assign([{transcript:'Voice exact bytes 🐈'}],{isFinal:true})]}));await page.click('#voiceStop');await page.fill('#voiceReview','Reviewed voice exact bytes 🐈');await page.click('#voiceInsert');await expect(page.locator('#cBody')).toHaveValue('Reviewed voice exact bytes 🐈');
  await assertNotPublished(page,'Reviewed voice exact bytes 🐈');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');await exportBoard(page,f.proj);
  const room=h.path.join(f.proj,'.agent-board/rooms/architecture'),name=h.fs.readdirSync(room).find(name=>name.endsWith('_reviewed-voice-exact-bytes.txt'));assert.ok(name);const relative='.agent-board/rooms/architecture/'+name;assert.ok(h.fs.readFileSync(h.path.join(room,name),'utf8').endsWith('Reviewed voice exact bytes 🐈\n'));assert.equal(inspect(f,relative).signature,'valid');
});
