'use strict';
// SPEC-002-071: the review task guides the comparison in numbered steps. Approval stays a deliberate
// paste plus Approve; the board's own value is never a copy button, and pasting it back is flagged.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const vm=require('node:vm');
const native=require('./lib/signing-browser');
const {openSigning,closeSigning,unlock}=native;
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function boot(t,{clipboard=true}={}){
  const f=await native.boot(t,browser,url);
  if(clipboard)await f.ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(url).origin});
  return f;
}
const choose=(page,id,value)=>page.evaluate(([id,value])=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);
async function review(page,participant){
  await openSigning(page);
  await page.locator('#signingParticipant').selectOption(participant);
  await expect(page.locator('#signingReviewSteps')).toBeVisible();
}
const approve=page=>page.locator('#signingDialog [data-action="trust"]');
const clipboard=page=>page.evaluate(()=>navigator.clipboard.readText());
const python=process.env.AFB_SIGNING_PYTHON||'python3';
// One changed character in the middle of the key part, keeping the prefix.
const changed=fp=>{const i=fp.length-12;return fp.slice(0,i)+(fp[i]==='A'?'B':'A')+fp.slice(i+1);};
const groupAt=(fp,index)=>{const prefix='urn:ietf:params:oauth:jwk-thumbprint:sha-256:',groups=[prefix,...fp.slice(prefix.length).match(/.{1,4}/g)];let at=0;for(const g of groups){if(index<at+g.length)return g;at+=g.length;}return null;};

// AC4's observable states; a short timeout so the AC9 mutation fails quickly.
async function comparison(page,identity,timeout=5000){
  const field=page.locator('#signingFingerprint'),result=page.locator('#signingCompare'),name=identity.participant;
  await field.fill(identity.fingerprint);
  await expect(result).toHaveAttribute('data-state','match',{timeout});
  await expect(result).toHaveText('✓ Matches the key on this board',{timeout});
  await expect(approve(page)).toBeEnabled({timeout});
  await expect(approve(page)).toHaveText(`Approve ${name}'s key`,{timeout});
  const wrong=changed(identity.fingerprint),index=identity.fingerprint.length-12;
  await field.fill(wrong);
  await expect(result).toHaveAttribute('data-state','mismatch',{timeout});
  await expect(result).toContainText('✗ Does not match',{timeout});
  await expect(result).toContainText(`character ${index+1}`,{timeout});
  await expect(result.locator('.signing-fp-diff')).toHaveText([groupAt(identity.fingerprint,index),groupAt(wrong,index)],{timeout});
  await expect(approve(page)).toBeDisabled({timeout});
  await field.fill(identity.fingerprint.slice(0,-5));
  await expect(result).toHaveAttribute('data-state','partial',{timeout});
  await expect(result).toHaveText('Paste the full fingerprint, including the prefix',{timeout});
  await expect(approve(page)).toBeDisabled({timeout});
  await field.fill('');
  await expect(approve(page)).toBeDisabled({timeout});
}
// AC5: a value copied from the key card inside this dialog and pasted back is flagged.
async function echo(page,identity,timeout=5000){
  const field=page.locator('#signingFingerprint'),warning=page.locator('#signingEcho');
  await page.locator('#signing-review .signing-key-card code').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await page.keyboard.press('ControlOrMeta+C');
  await expect.poll(()=>clipboard(page),{timeout}).toBe(identity.fingerprint);
  await field.focus();await page.keyboard.press('ControlOrMeta+V');
  await expect(field).toHaveValue(identity.fingerprint,{timeout});
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match',{timeout});
  await expect(warning).toBeVisible({timeout});
  await expect(warning).toContainText(`This is the value shown on this board. Paste the one ${identity.participant} sent you from their own device.`,{timeout});
  await expect(approve(page)).toBeDisabled({timeout});
  await page.getByLabel(`I confirmed it with ${identity.participant} outside this board`).check();
  await expect(approve(page)).toBeEnabled({timeout});
}

// The pure helpers, loaded the way signing-clarity loads this file (no contract, no DOM).
function api(pl=false){
  const c=vm.createContext({SigningContract:{Provider:class{}},exText:(en,polish)=>pl?polish:en,B:{cfg:{project:{id:'demo'}}}});
  vm.runInContext(h.fs.readFileSync(h.path.join(h.ROOT,'scripts/signing-ui.js'),'utf8')+';this.api={signingFingerprintCompare,signingFingerprintGroups,signingFingerprintEcho,signingReviewApprovable,signingFingerprintShort,signingReviewRequest,signingOwnFingerprintCommand};',c);
  return c.api;
}
test('comparison, grouping, echo and request helpers',()=>{
  const a=api(),P='urn:ietf:params:oauth:jwk-thumbprint:sha-256:',fp=P+'abcdEFGHijklMNOPqrstUVWXyz0123456789-_ABCDE';
  assert.deepEqual({...a.signingFingerprintCompare(fp,fp)},{state:'match'});
  assert.deepEqual({...a.signingFingerprintCompare(fp,'')},{state:'partial'});
  assert.deepEqual({...a.signingFingerprintCompare(fp,fp.slice(0,-3))},{state:'partial'},'cut off at the end');
  assert.deepEqual({...a.signingFingerprintCompare(fp,fp.slice(P.length))},{state:'partial'},'missing prefix');
  assert.deepEqual({...a.signingFingerprintCompare(fp,fp.replace('MNOP','MNoP'))},{state:'mismatch',index:fp.indexOf('MNOP')+2});
  assert.deepEqual({...a.signingFingerprintCompare(fp,fp+'x')},{state:'mismatch',index:fp.length});
  assert.deepEqual({...a.signingFingerprintCompare('',fp)},{state:'none'});
  assert.deepEqual([...a.signingFingerprintGroups(fp)],[P,'abcd','EFGH','ijkl','MNOP','qrst','UVWX','yz01','2345','6789','-_AB','CDE']);
  assert.equal(a.signingFingerprintGroups(fp).join(''),fp);
  assert.equal(a.signingFingerprintEcho(new Set([fp]),fp,fp),true);
  assert.equal(a.signingFingerprintEcho(new Set(['Name'+fp+'state']),fp,fp),true,'a larger selection holding the board value');
  assert.equal(a.signingFingerprintEcho(new Set(),fp,fp),false);
  assert.equal(a.signingFingerprintEcho(new Set([fp]),'',fp),false);
  assert.equal(a.signingReviewApprovable(fp,fp,false,false),true);
  assert.equal(a.signingReviewApprovable(fp,fp,true,false),false);
  assert.equal(a.signingReviewApprovable(fp,fp,true,true),true);
  assert.equal(a.signingReviewApprovable(fp,fp.slice(0,-1),false,true),false);
  assert.equal(a.signingFingerprintShort(fp),P+'…'+fp.slice(-8));
  for(const lang of [false,true]){
    const r=api(lang).signingReviewRequest({name:'Maya',id:'maya',board:'Demo',boardId:'b-1',fingerprint:fp});
    assert.ok(r.includes('Maya')&&r.includes('Demo')&&r.includes('b-1')&&r.includes(fp.slice(-8)));
    assert.ok(!r.includes(fp),'never the full value');
  }
  assert.equal(a.signingOwnFingerprintCommand('maya'),'boardctl signing check --path <board> --from maya --scope rooms/<room> --signing-key-file ~/private/afb/demo/maya.json');
});

test('AC1: the review task shows four numbered steps with the way the owner finds the fingerprint, in English and Polish',async t=>{
  const f=await boot(t),{page,peer}=f;await review(page,peer.participant);
  const steps=page.locator('#signingReviewSteps > li > strong');
  await expect(steps).toHaveText(['Get their fingerprint from them.','Paste what they sent you.','Compare.','Approve.']);
  await expect(page.locator('#signingReviewSteps > li').first()).toContainText(`Ask ${peer.participant} to send you their fingerprint through a channel you already trust: in person, a phone call, or a chat app you already use with them. Not this board.`);
  await expect(page.locator('label[for="signingFingerprint"]')).toContainText(`Fingerprint ${peer.participant} sent you`);
  await expect(approve(page)).toHaveText(`Approve ${peer.participant}'s key`);
  await page.locator('.signing-find summary').click();
  await expect(page.locator('.signing-find summary')).toHaveText(`How ${peer.participant} finds it`);
  await expect(page.locator('.signing-find')).toContainText('Tools → Signing → Sign as me → Copy my fingerprint');
  const command=await page.locator('.signing-find code').textContent();
  assert.match(command,new RegExp(`^boardctl signing check --path <board> --from ${peer.participant} --scope rooms/<room> --signing-key-file ~/private/afb/example-project/${peer.participant}\\.json$`));
  // The command exists in the pinned canonical boardctl, and its key file row prints that file's fingerprint.
  const source=h.fs.readFileSync(h.path.join(h.VENDOR,'signing_commands.py'),'utf8');
  assert.match(source,/for name in \([^)]*"check"[^)]*\):/,'boardctl signing check exists');
  assert.match(source,/if name == "check":[\s\S]*?--signing-key-file/,'signing check takes --signing-key-file');
  const args=command.replace('<board>',f.proj).replace('rooms/<room>','rooms/architecture').replace(`~/private/afb/example-project/${peer.participant}.json`,peer.key).split(' ').slice(1);
  const run=spawnSync(python,[h.path.join(h.VENDOR,'boardctl.py'),...args],{encoding:'utf8',env:{...process.env,AGENT_FILE_BOARD_STATE_DIR:h.path.join(f.tmp,'private-state')}});
  assert.equal(run.status,0,run.stderr);
  const row=JSON.parse(run.stdout).checklist.find(r=>r.item==='key file matches current profile');
  assert.equal(row.detail,`key file fingerprint ${peer.fingerprint}`);
  await expect(page.locator('.signing-find')).toContainText('key file matches current profile');
  await choose(page,'#sLang','pl');
  await expect(steps).toHaveText(['Poproś o odcisk klucza.','Wklej otrzymany odcisk.','Porównaj.','Zatwierdź.'],{timeout:10000});
  await expect(page.locator('#signingReviewSteps > li').first()).toContainText(`Poproś uczestnika ${peer.participant} o odcisk klucza. Niech prześle go kanałem, któremu już ufasz`);
  await expect(page.locator('.signing-find summary')).toHaveText(`Gdzie ${peer.participant} go znajdzie`);
  await expect(page.locator('.signing-find')).toContainText('Narzędzia → Podpisy → Podpisuj jako ja → Kopiuj mój odcisk');
  await expect(page.locator('.signing-find code')).toHaveText(`boardctl signing check --path <tablica> --from ${peer.participant} --scope rooms/<pokój> --signing-key-file ~/private/afb/example-project/${peer.participant}.json`);
  await expect(page.locator('label[for="signingFingerprint"]')).toContainText(`Odcisk przesłany przez: ${peer.participant}`);
  await expect(approve(page)).toHaveText(`Zatwierdź klucz: ${peer.participant}`);
  await expect(page.locator('#signingCopyRequest')).toHaveText('Kopiuj tekst do wysłania');
  await expect(page.locator('#signingPaste')).toHaveText('Wklej');
  await page.locator('#signingFingerprint').fill(peer.fingerprint);
  await expect(page.locator('#signingCompare')).toHaveText('✓ Zgadza się z kluczem na tej tablicy');
  await page.locator('#signingFingerprint').fill(peer.fingerprint.slice(0,-1));
  await expect(page.locator('#signingCompare')).toHaveText('Wklej cały odcisk, łącznie z prefiksem');
  await choose(page,'#sLang','en');
  // The board value is shown, never offered as a copy button.
  assert.deepEqual(await page.locator('#signing-review button').evaluateAll(bs=>bs.map(b=>b.dataset.action).filter(a=>/copy/.test(a))),['copy-request']);
});

test('AC2: Copy what to send them puts a request with the board, the participant and only a shortened fingerprint on the clipboard',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  await page.locator('#signingCopyRequest').click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText(`Copied. Send it to ${peer.participant}`);
  const sent=await clipboard(page),boardId=await page.evaluate(()=>B.signingContext.boardId);
  assert.match(sent,/Example project/);assert.ok(sent.includes(boardId),'board ID');
  assert.ok(sent.includes(`Hi ${peer.participant},`),'participant');
  assert.ok(sent.includes('urn:ietf:params:oauth:jwk-thumbprint:sha-256:…'+peer.fingerprint.slice(-8)),'prefix and last 8 characters');
  assert.ok(!sent.includes(peer.fingerprint),'never the full fingerprint');
  assert.ok(!sent.includes(peer.fingerprint.slice(-9)),'no more than the last 8 characters');
  assert.match(sent,/Sign as me → Copy my fingerprint/);assert.match(sent,/boardctl signing check/);
});

test('AC3: Paste fills the field from the clipboard without whitespace; with clipboard reading denied it shows the keyboard hint',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  const fp=peer.fingerprint,spaced=` ${fp.slice(0,30)}\n${fp.slice(30,50)} \t${fp.slice(50)}\n`;
  await page.evaluate(v=>navigator.clipboard.writeText(v),spaced);
  await page.locator('#signingPaste').click();
  await expect(page.locator('#signingFingerprint')).toHaveValue(fp);
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(page.locator('#signingEcho')).toBeHidden();
  // A keyboard paste is cleaned the same way.
  await page.locator('#signingFingerprint').fill('');
  await page.locator('#signingFingerprint').focus();await page.keyboard.press('ControlOrMeta+V');
  await expect(page.locator('#signingFingerprint')).toHaveValue(fp);
  await closeSigning(page);
  const denied=await boot(t,{clipboard:false});await review(denied.page,denied.peer.participant);
  await denied.page.locator('#signingPaste').click();
  await expect(denied.page.locator('#signingPasteHint')).toHaveText('Press Cmd+V / Ctrl+V in the field');
  await expect(denied.page.locator('#signingFingerprint')).toBeFocused();
  await expect(denied.page.locator('#signingFingerprint')).toHaveValue('');
  // native.boot asserts at teardown that no page error occurred.
});

test('AC4: match enables Approve with the participant name; one changed character marks the differing group; a cut-off value stays neutral',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  await comparison(page,peer);
  assert.deepEqual(await page.evaluate(()=>B.signingContext.state.pins),{},'comparing approves nothing');
});

test('AC5: pasting the board value copied inside the dialog warns and needs the confirmation; a value from outside does not',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  await echo(page,peer);
  await page.locator('#signingFingerprint').fill(changed(peer.fingerprint));
  await expect(page.locator('#signingEcho')).toBeHidden();
  await expect(page.locator('#signingEchoConfirm')).not.toBeChecked();
  await closeSigning(page);
  // A new dialog session; the value arrives on the clipboard from outside the dialog.
  await review(page,peer.participant);
  await page.evaluate(v=>navigator.clipboard.writeText(v),peer.fingerprint);
  await page.locator('#signingPaste').click();
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(page.locator('#signingEcho')).toBeHidden();
  await expect(approve(page)).toBeEnabled();
  await approve(page).click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
});

test('AC5: the echo confirmation is checked again by the approval itself',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  await echo(page,peer);
  await page.locator('#signingEchoConfirm').uncheck();
  // Even a forced click on the disabled button refuses: the action rechecks the guard.
  await approve(page).evaluate(b=>{b.disabled=false;b.click();});
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('This is the value shown on this board');
  assert.deepEqual(await page.evaluate(()=>B.signingContext.state.pins),{});
});

test('AC6: after unlocking, Sign as me shows and copies the fingerprint derived from the key file',async t=>{
  const f=await boot(t),{page,owner}=f;
  await openSigning(page);await expect(page.locator('#signingMyFingerprint')).toBeHidden();await closeSigning(page);
  await unlock(page,owner);await openSigning(page);
  const mine=page.locator('#signingMyFingerprint');
  await expect(mine).toBeVisible();
  await expect(mine.locator('strong')).toHaveText('Your key fingerprint');
  const fromFile=JSON.parse(f.cli('signing','check','--from',owner.participant,'--scope','rooms/architecture','--signing-key-file',owner.key)).checklist.find(r=>r.item==='key file matches current profile').detail.replace('key file fingerprint ','');
  await expect(mine.locator('code')).toHaveText(fromFile);
  assert.deepEqual(await mine.locator('code span').allTextContents(),['urn:ietf:params:oauth:jwk-thumbprint:sha-256:',...fromFile.slice(45).match(/.{1,4}/g)],'groups of 4 after the prefix');
  await mine.locator('[data-action="copy-my-fingerprint"]').click();
  await expect.poll(()=>clipboard(page)).toBe(fromFile);
  await expect(page.locator('#signing-own .signing-feedback')).toContainText('Your fingerprint is copied');
  // Copying it is not an echo of the board when the owner then checks their own key.
  await page.locator('[data-signing-task=review]').click();
  await page.locator('#signingParticipant').selectOption(owner.participant);
  await page.locator('#signingPaste').click();
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(page.locator('#signingEcho')).toBeHidden();
  await page.locator('[data-action="lock"]').click();
  await expect(mine).toBeHidden();
});

test('AC7: Check with my key file matches the unlocked own key; a different key file yields a mismatch and unlocks nothing',async t=>{
  const {page,owner,peer}=await boot(t);
  await unlock(page,owner);await review(page,owner.participant);
  await expect(page.locator('#signingOwnCheck')).toBeVisible();
  await expect(page.locator('#signingOwnCheck')).toContainText('Your key file is on this device, so it can confirm the board lists your key.');
  await page.locator('#signingCheckOwnKey').click();
  await expect(page.locator('#signingFingerprint')).toHaveValue(owner.fingerprint);
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Your key file matches the key this board lists for you');
  await expect(approve(page)).toBeEnabled();
  assert.deepEqual(await page.evaluate(()=>B.signingContext.state.pins),{},'the user still approves');
  await approve(page).click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
  // Not offered for someone else's key.
  await page.locator('#signingParticipant').selectOption(peer.participant);
  await expect(page.locator('#signingOwnCheck')).toBeHidden();
  await closeSigning(page);

  const other=await boot(t),p2=other.page;
  await choose(p2,'#me',other.owner.participant);await review(p2,other.owner.participant);
  const chooser=p2.waitForEvent('filechooser');
  await p2.locator('#signingCheckOwnKey').click();
  await (await chooser).setFiles(other.peer.key);
  await expect(p2.locator('#signingCompare')).toHaveAttribute('data-state','mismatch');
  await expect(p2.locator('#signing-review .signing-feedback')).toContainText('Your key file does not match the key this board lists for you');
  await expect(approve(p2)).toBeDisabled();
  assert.deepEqual(await p2.evaluate(()=>signingProvider.catalog()),[],'a different key file is not unlocked');
  // The right file, while locked: the existing unlock runs first, then the comparison matches.
  const again=p2.waitForEvent('filechooser');
  await p2.locator('#signingCheckOwnKey').click();
  await (await again).setFiles(other.owner.key);
  await expect(p2.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(approve(p2)).toBeEnabled();
  assert.deepEqual(await p2.evaluate(()=>signingProvider.catalog().map(p=>p.participant)),[other.owner.participant]);
});

test('AC8: approving after the guided steps keeps the pins, counts and composer status of the existing flow',async t=>{
  const {page,owner,peer}=await boot(t);
  await review(page,peer.participant);
  await expect(page.locator('#signingPendingSummary')).toHaveText('2 keys need review');
  await page.locator('#signingFingerprint').fill(peer.fingerprint);await approve(page).click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
  await expect(page.locator('#signingPendingSummary')).toHaveText('1 key needs review');
  await expect(page.locator(`[data-signing-participant="${peer.participant}"]`)).toContainText('Current key trusted by you');
  assert.deepEqual(await page.evaluate(()=>B.signingContext.state.pins),{[peer.participant]:peer.fingerprint});
  await expect(page.locator('#signingTools .key-badge-count')).toHaveText('1');
  await expect(page.locator('#signingFingerprint')).toHaveValue(peer.fingerprint);
  await closeSigning(page);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[],'approval unlocks nothing');
  assert.equal(await page.evaluate(()=>signingMode),'unsigned');
  await choose(page,'#me',owner.participant);
  await expect(page.locator('#signingNotice')).toHaveAttribute('data-signing-status','unsigned');
});

test('AC9: non-vacuity: a comparison that always matches fails AC4, a skipped echo check fails AC5',async t=>{
  const {page,peer}=await boot(t);await review(page,peer.participant);
  await page.evaluate(()=>{window.realCompare=signingFingerprintCompare;signingFingerprintCompare=()=>({state:'match'});});
  await assert.rejects(comparison(page,peer,1500),/Expected: "mismatch"/,'always-match comparison must fail AC4 at the mismatch');
  await page.evaluate(()=>{signingFingerprintCompare=window.realCompare;});
  await page.locator('#signingFingerprint').fill('');
  await comparison(page,peer);
  await closeSigning(page);await review(page,peer.participant);
  await page.evaluate(()=>{window.realEcho=signingFingerprintEcho;signingFingerprintEcho=()=>false;});
  await assert.rejects(echo(page,peer,1500),/toBeVisible[\s\S]*#signingEcho/,'a skipped echo check must fail AC5 at the warning');
  await page.evaluate(()=>{signingFingerprintEcho=window.realEcho;});
  await closeSigning(page);await review(page,peer.participant);
  await echo(page,peer);
});

test('phone width: the guided steps and a mismatch fit 390 pixels without horizontal scrolling',async t=>{
  const {page,peer}=await boot(t);await page.setViewportSize({width:390,height:640});
  await review(page,peer.participant);
  await page.locator('#signingFingerprint').fill(changed(peer.fingerprint));
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','mismatch');
  await page.locator('.signing-find summary').click();
  assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true,'no horizontal scroll');
  const overflow=await page.locator('#signing-review').evaluate(s=>{const box=s.getBoundingClientRect();return [...s.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>box.right+1;}).map(el=>el.className||el.tagName);});
  assert.deepEqual(overflow,[]);
});
