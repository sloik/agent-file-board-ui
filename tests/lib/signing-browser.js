'use strict';
const assert=require('node:assert/strict');
const {expect}=require('playwright/test');
const h=require('./helpers');
const {fixture}=require('./signing-fixture');
// Only picker selection is substituted. All directory/file handles, Files,
// writable streams, commit semantics and IndexedDB records are Chromium-native.
async function importBoard(page, proj, directoryName = null) {
  await page.evaluate(async ({tree,directoryName}) => {
    async function sync(dir,node) {
      for await (const [name] of dir.entries()) if (!Object.hasOwn(node.children,name)) await dir.removeEntry(name,{recursive:true});
      for (const [name,child] of Object.entries(node.children)) {
        if (child.kind === 'directory') await sync(await dir.getDirectoryHandle(name,{create:true}),child);
        else { const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable(); await writer.write(child.text); await writer.close(); }
      }
    }
    const root=await navigator.storage.getDirectory();
    const target=directoryName?await root.getDirectoryHandle(directoryName,{create:true}):root;
    await sync(target,tree);
  },{tree:h.readTree(proj),directoryName});
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
async function boot(t, browser, url, prepare = null, fixtureOptions = {}) {
  const f=fixture(fixtureOptions); t.after(f.clean); if(prepare)prepare(f);
  const ctx=await browser.newContext(),page=await ctx.newPage();t.after(()=>ctx.close());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});
  await page.goto(url);await importBoard(page,f.proj);await h.openBoardViaUi(page);await h.expandComposer(page);
  assert.deepEqual(await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),board=await root.getDirectoryHandle('.agent-board'),file=await (await board.getFileHandle('config.json')).getFile();return [root instanceof FileSystemDirectoryHandle,file instanceof File,window.__fakefs===undefined];}),[true,true,true]);
  t.after(()=>assert.deepEqual(errors,[]));
  return {...f,ctx,page};
}
async function openSigning(page) { await h.openToolbarTool(page,'signingTools');await expect(page.locator('#signingDialog')).toBeVisible(); }
const actions={'Unlock selected keys':'unlock','Lock':'lock','Use unsigned mode':'unsigned','Inspect current profile':'inspect-profile','Trust exact fingerprint':'trust','Remove trust':'remove-trust','Adopt current policy floor':'policy-floor','Inspect excluded messages':'inspect-excluded','Verify older messages':'verify-older'};
async function action(page,label) {
  const name=actions[label]||label,button=page.locator(`#signingDialog [data-action="${name}"]`);
  // SPEC-002-073: removing an approval asks first; the write is the confirmation's Remove (still "remove-trust").
  if(name==='remove-trust'&&!await button.isVisible())await page.locator('#signingDialog [data-action="remove-trust-ask"]').click();
  if(!await button.isVisible()){
    const details=button.locator('xpath=ancestor::details[1]');
    if(await details.count())await details.locator(':scope > summary').click();
  }
  await button.click();
  await expect(page.locator('#signingDialog .signing-feedback').filter({hasText:/^(Working…|Pracuję…)$/})).toHaveCount(0);
}
async function closeSigning(page) {
  await page.locator('#signingDialog [data-action="close"]').click();
  await expect(page.locator('#signingDialog')).not.toBeVisible();
}
// The signer is the persona in "I am" (SPEC-002-061): step 1 chooses it, step 2 the key file, step 3 unlocks.
async function unlock(page,identity) {
  await openSigning(page);
  await page.getByLabel('Persona to sign as',{exact:true}).selectOption(identity.participant);
  await expect(page.locator('#me')).toHaveValue(identity.participant);
  await page.getByLabel('Private signing keys (kept only in this tab)').setInputFiles(identity.key);
  await action(page,'Unlock selected keys');
  await expect(page.locator('#signing-own .signing-feedback')).toContainText('Unlocked. New messages are signed as');
  await expect(page.locator('#signingMode')).toContainText(`(${identity.participant})`);
  await closeSigning(page);
}
// SPEC-002-073: the Keys list replaced the participant select; choosing a participant opens their row.
// A row hidden by the current filter is reached through "All"; an open row is left as it is.
async function selectKey(page,id) {
  const row=page.locator(`#signingKeys [data-key-row="${id}"]`),detail=page.locator('#signingKeyDetail');
  if(!await row.isVisible())await page.locator('#signingDialog [data-key-filter="all"]').click();
  if(await row.getAttribute('aria-selected')!=='true'||!await detail.isVisible())await row.locator('.signing-key-name').click();
  await expect(row).toHaveAttribute('aria-selected','true');await expect(detail).toBeVisible();
}
const selectedKey=page=>page.locator('#signingKeys [data-key-row][aria-selected="true"]').getAttribute('data-key-row');
// The rows in list order as "Name (id) - badge" (what the select's options said, now the row's badge).
const keyRows=page=>page.locator('#signingKeys [data-key-row]').evaluateAll(rows=>rows.map(r=>`${r.querySelector('.signing-key-name').textContent} (${r.dataset.keyRow}) - ${r.querySelector('.signing-key-badge span:last-child').textContent}`));
async function trust(page,identity) {
  await selectKey(page,identity.participant);
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(identity.fingerprint);
  await action(page,'Trust exact fingerprint');await expect(page.locator('#signing-review .signing-feedback')).not.toContainText('Fingerprint does not match');
}

module.exports={boot,importBoard,exportBoard,openSigning,action,closeSigning,unlock,trust,selectKey,selectedKey,keyRows};
