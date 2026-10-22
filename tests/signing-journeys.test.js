'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
const boot=t=>native.boot(t,browser,url);
const control=(page,action)=>page.locator(`#signingDialog [data-action="${action}"]`);
const act=(page,action)=>native.action(page,action);
async function language(page,value){await page.click('#gear');await page.selectOption('#sLang',value);await page.click('#sClose');}
async function fits(page){
  const overflow=await page.locator('#signingDialog').evaluate(dialog=>{
    const bounds=dialog.getBoundingClientRect();return {dialog:dialog.scrollWidth>dialog.clientWidth,viewport:bounds.left<0||bounds.right>innerWidth+1,
      fields:[...dialog.querySelectorAll('input,select,button')].filter(el=>el.getClientRects().length).filter(el=>{const b=el.getBoundingClientRect();return b.left<bounds.left||b.right>bounds.right+1;}).map(el=>el.id||el.textContent)};
  });
  assert.deepEqual(overflow,{dialog:false,viewport:false,fields:[]},'task controls and long fingerprints fit the dialog');
}

test('signing is presented as distinct human tasks with visible form labels on desktop and phone, EN and PL',async t=>{
  const {page}=await boot(t);
  for(const lang of ['en','pl']){
    if(lang==='pl')await language(page,lang);
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:844});await native.openSigning(page);
      for(const id of ['check','review','own','advanced']){
        const section=page.locator(`#signing-${id}`);await expect(section).toBeVisible();
        if(id==='advanced')await expect(section.locator(':scope > summary')).not.toBeEmpty();
        else await expect(section.getByRole('heading')).not.toBeEmpty();
      }
      const labels=await page.locator('#signingDialog input,#signingDialog select').evaluateAll(fields=>fields.map(field=>({id:field.id,labels:[...field.labels||[]].map(label=>label.textContent.trim())})));
      assert.ok(labels.length>=4);for(const field of labels)assert.ok(field.labels.some(Boolean),`visible label for ${field.id}`);
      await fits(page);await native.closeSigning(page);
    }
  }
});

test('unlocking keys requires an explicit signer choice and Viewing as never chooses the signer',async t=>{
  const {page,owner,peer}=await boot(t);
  await native.openSigning(page);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles([owner.key,peer.key]);
  await act(page,'unlock');
  const select=page.getByLabel('Signing identity',{exact:true});
  await expect(select).toHaveValue('');
  assert.equal(await page.evaluate(()=>signingAs),'');
  assert.deepEqual((await page.evaluate(()=>signingProvider.catalog().map(item=>item.participant))).sort(),[owner.participant,peer.participant].sort());
  await native.closeSigning(page);
  await page.selectOption('#me',peer.participant);
  assert.equal(await page.evaluate(()=>signingAs),'');
  await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cTo',peer.participant);await page.selectOption('#cThread','');await page.fill('#cNewThread','Explicit signer required');await page.fill('#cBody','Do not silently select a signer');
  const before=await page.evaluate(()=>B.msgs.length);await page.click('#send');
  await expect(page.locator('#toast')).toContainText('Select an unlocked signing identity');
  await expect(page.locator('#cBody')).toHaveValue('Do not silently select a signer');assert.equal(await page.evaluate(()=>B.msgs.length),before);
  await native.openSigning(page);await select.selectOption(owner.participant);
  await expect(page.locator('#signing-own')).toContainText(owner.participant);
  await native.closeSigning(page);await page.selectOption('#me',peer.participant);
  assert.equal(await page.evaluate(()=>signingAs),owner.participant);
  await native.openSigning(page);await act(page,'lock');
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);assert.equal(await page.evaluate(()=>signingAs),'');
});

test('participant review rejects a mismatched fingerprint, explains approval and does not unlock a key',async t=>{
  const {page,peer}=await boot(t);await native.openSigning(page);
  await page.getByLabel('Trust participant',{exact:true}).selectOption(peer.participant);
  await act(page,'inspect-profile');
  await expect(page.locator('#signing-review')).toContainText(peer.fingerprint);
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(peer.fingerprint+'wrong');await act(page,'trust');
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Fingerprint does not match');
  await expect(page.locator(`[data-signing-participant="${peer.participant}"]`)).toContainText('Current key not approved by you');
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(peer.fingerprint);await act(page,'trust');
  await expect(page.locator(`[data-signing-participant="${peer.participant}"]`)).toContainText('Current key trusted by you');
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[],'approval never imports a private key');
  assert.equal(await page.evaluate(()=>signingAs),'');
  await act(page,'remove-trust');await expect(page.locator(`[data-signing-participant="${peer.participant}"]`)).toContainText('Current key not approved by you');
});

test('key-file errors stay with the signing task and leave the user in control',async t=>{
  const {page}=await boot(t);await native.openSigning(page);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles({name:'not-a-key.json',mimeType:'application/json',buffer:Buffer.from('{"not":"a private key"}')});
  await act(page,'unlock');
  await expect(page.locator('#signing-own .signing-feedback')).not.toBeEmpty();
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);assert.equal(await page.evaluate(()=>signingAs),'');
  await expect(control(page,'unlock')).toBeEnabled();await expect(page.getByLabel('Signing identity',{exact:true})).toHaveValue('');
});

test('read-only boards explain that signing a new message needs a writable folder',async t=>{
  const f=await boot(t),{page}=f;
  await page.reload();await page.setInputFiles('#fallback',f.proj);await expect(page.locator('#me')).toBeVisible();
  assert.equal(await page.evaluate(()=>baseHandle),null);
  await native.openSigning(page);await expect(page.locator('#signing-own')).toContainText(/writable|zapis/i);
  await fits(page);
});

test('a paused key read cannot unlock or report success after switching to another board',async t=>{
  const {page,owner}=await boot(t),other=require('./lib/signing-fixture').fixture();t.after(other.clean);
  await native.openSigning(page);await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles(owner.key);
  await page.getByLabel('Private signing keys (kept only in this tab)').evaluate(input=>{
    const file=input.files[0],read=file.arrayBuffer.bind(file);
    file.arrayBuffer=async()=>{window.signingReadStarted=true;await new Promise(resolve=>window.releaseSigningRead=resolve);return read();};
  });
  await control(page,'unlock').evaluate(button=>{
    const click=button.onclick;button.onclick=async function(...args){try{return await click.apply(this,args);}finally{window.oldSigningOperationFinished=true;}};
  });
  await control(page,'unlock').click();await expect(control(page,'unlock')).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.signingReadStarted)).toBe(true);
  await native.closeSigning(page);await native.importBoard(page,other.proj,'other-board');
  await page.evaluate(()=>{window.showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();return root.getDirectoryHandle('other-board');};});
  await h.openBoardViaUi(page);
  await native.openSigning(page);
  const before=await page.locator('#signing-own').innerText(),boardId=await page.evaluate(()=>B.signingContext.boardId);
  assert.equal(boardId,JSON.parse(h.fs.readFileSync(h.path.join(other.proj,'.agent-board/config.json'))).identity.boardId,'the picker opened the distinct second board');
  await page.evaluate(()=>releaseSigningRead());
  await expect.poll(()=>page.evaluate(()=>window.oldSigningOperationFinished)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>signingProvider.catalog().length)).toBe(0);
  await expect.poll(()=>page.locator('#signing-own').innerText()).toBe(before);
  assert.equal(await page.evaluate(()=>B.signingContext.boardId),boardId);assert.equal(await page.evaluate(()=>signingAs),'');
});

test('an idle signing dialog can review and approve a key after an ordinary same-board refresh',async t=>{
  const {page,peer}=await boot(t);await native.openSigning(page);
  await page.getByLabel('Trust participant',{exact:true}).selectOption(peer.participant);
  const fingerprint=page.getByLabel('Independently verified fingerprint',{exact:true}),input=await fingerprint.elementHandle(),participant=await page.locator('#signingParticipant').elementHandle();
  await fingerprint.fill(peer.fingerprint);await fingerprint.focus();
  assert.equal(await page.evaluate(async()=>{const previous=B;await readFromHandle(true);return previous!==B;}),true,'the refresh replaces the model while retaining this board');
  await expect(fingerprint).toHaveValue(peer.fingerprint);await expect(fingerprint).toBeFocused();
  assert.equal(await input.evaluate(el=>el===document.querySelector('#signingFingerprint')),true);
  assert.equal(await participant.evaluate(el=>el===document.querySelector('#signingParticipant')),true);
  await act(page,'inspect-profile');await expect(page.locator('#signing-review')).toContainText(peer.fingerprint);
  await expect(page.locator('#signing-review .signing-feedback')).not.toContainText('Reopen Signing');
  await expect(fingerprint).toHaveValue(peer.fingerprint);
  await act(page,'trust');await expect(page.locator(`[data-signing-participant="${peer.participant}"]`)).toContainText('Current key trusted by you');
  assert.equal(await page.evaluate(id=>B.signingContext.state.pins[id],peer.participant),peer.fingerprint);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[],'same-board refresh and key approval do not unlock private keys');
  assert.equal(await page.evaluate(()=>signingAs),'');
});

test('closing the dialog during private key import cancels the pending unlock',async t=>{
  const {page,owner}=await boot(t);await native.openSigning(page);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles(owner.key);
  const mode=await page.evaluate(()=>signingMode);
  await page.evaluate(()=>{
    const original=crypto.subtle.importKey.bind(crypto.subtle);
    crypto.subtle.importKey=async(...args)=>{
      if(args[0]==='jwk'&&args[4]?.includes('sign')){
        window.privateSigningImportPending=true;
        await new Promise(resolve=>window.releasePrivateSigningImport=resolve);
      }
      return original(...args);
    };
  });
  await control(page,'unlock').evaluate(button=>{
    const click=button.onclick;button.onclick=async function(...args){try{return await click.apply(this,args);}finally{window.closedSigningOperationFinished=true;}};
  });
  await control(page,'unlock').click();await expect.poll(()=>page.evaluate(()=>window.privateSigningImportPending)).toBe(true);
  await native.closeSigning(page);await page.evaluate(()=>releasePrivateSigningImport());
  await expect.poll(()=>page.evaluate(()=>window.closedSigningOperationFinished)).toBe(true);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);assert.equal(await page.evaluate(()=>signingAs),'');
  assert.equal(await page.evaluate(()=>signingMode),mode,'a canceled unlock does not enable signed mode');
  await native.openSigning(page);await expect(page.getByLabel('Signing identity',{exact:true})).toHaveValue('');
});

test('read-only exact-key approval and removal immediately reverify message eligibility and visible trust',async t=>{
  const f=await boot(t),{page,peer}=f;
  const configPath=h.path.join(f.proj,'.agent-board/config.json'),config=JSON.parse(h.fs.readFileSync(configPath));
  config.message_signing={version:1,minimum:'trusted'};h.fs.writeFileSync(configPath,JSON.stringify(config));
  f.cli('signing','trust','--participant',peer.participant,'--profile',peer.profile,'--fingerprint',peer.fingerprint);
  const path=f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','readonly-approved-key','--body','Read-only exact-key approval example','--signing-key-file',peer.key).replace(/^\.agent-board\//,'');
  await page.reload();await page.setInputFiles('#fallback',f.proj);await expect(page.locator('#me')).toBeVisible();
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.signature,path),'valid');
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,path),'excluded');
  await native.openSigning(page);await native.trust(page,peer);
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.trust,path),'trusted');
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,path),'eligible');
  await native.closeSigning(page);await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  await expect(page.locator(`article[data-file="${h.path.basename(path)}"] .signing-facts summary`)).toContainText('Signing key trusted by you');
  await native.openSigning(page);await page.getByLabel('Trust participant',{exact:true}).selectOption(peer.participant);await act(page,'remove-trust');
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.trust,path),'unfamiliar');
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,path),'excluded');
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[],'approval and re-verification never unlock a private key');
  assert.equal(await page.evaluate(()=>B.signingKey),null,'uploaded approvals are session-only');
});
