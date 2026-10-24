'use strict';
// SPEC-002-073: Tools -> Signing -> Keys. One row per participant with a status, a detail with the unchanged
// guided approval, Remove my approval with a session-only Undo, entry points, command-line equivalents.
// The board has a key in every state: changed, needs review, can't load, revoked retired and compromised,
// no key, approved, and the owner's own approved key.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
const {importBoard,openSigning,closeSigning,trust,selectKey,selectedKey,keyRows,action}=native;
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
const python=process.env.AFB_SIGNING_PYTHON||'python3';
const choose=(page,id,value)=>page.evaluate(([id,value])=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);
async function refresh(f){await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
const OWNER='human-owner-01',PEER='research-agent-01';
const STATES={'build-agent-02':'changed','ada-reviewer':'review','cache-agent-03':'error','docs-agent-04':'retired','edge-agent-05':'compromised','implementation-agent-01':'none',[OWNER]:'approved',[PEER]:'approved'};
const ORDER=['build-agent-02','ada-reviewer','cache-agent-03','docs-agent-04','edge-agent-05','implementation-agent-01',OWNER,PEER];
// The eight-state board: three keys approved here through the real review, then one of them rotated on the board.
async function keysBoard(t){
  let ids;
  const f=await native.boot(t,browser,url,f=>{ids=f.keys();});
  f.ids=ids;const {page}=f;
  await choose(page,'#me',OWNER);
  await openSigning(page);
  for(const identity of [f.owner,f.peer,ids['build-agent-02']])await trust(page,identity);
  await closeSigning(page);
  f.rotated=f.rotate('build-agent-02');await refresh(f);
  await expect.poll(()=>page.evaluate(()=>Object.keys(B.signingParticipants).map(id=>[id,signingKeyState(id)]))).toEqual(expect.arrayContaining(Object.entries(STATES)));
  return f;
}
const row=(page,id)=>page.locator(`#signingKeys [data-key-row="${id}"]`);
async function openKeys(page){await openSigning(page);await page.locator('[data-signing-task=review]').click();}

test('AC1/AC2: one row per participant with its status, grouped attention first; filter chips with counts; EN and PL',async t=>{
  const f=await keysBoard(t),{page}=f;
  await openKeys(page);
  assert.deepEqual(await page.locator('#signingKeys [data-key-row]').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),ORDER);
  assert.deepEqual(await page.locator('#signingKeys .signing-key-group').allTextContents(),['Key changed','Needs review',"Can't load key",'Revoked','No key','Approved']);
  assert.deepEqual(await keyRows(page),['Build agent (build-agent-02) - Key changed','Ada Novak (ada-reviewer) - Needs review',"Cache agent (cache-agent-03) - Can't load key",'Docs agent (docs-agent-04) - Revoked (retired)','Edge agent (edge-agent-05) - Revoked (compromised)',
    'implementation-agent-01 (implementation-agent-01) - No key','human-owner-01 (human-owner-01) - Approved on this browser','research-agent-01 (research-agent-01) - Approved on this browser']);
  const facts=await page.locator('#signingKeys [data-key-row]').evaluateAll(rows=>rows.map(r=>({id:r.dataset.keyRow,icon:r.querySelector('.signing-key-badge [aria-hidden]').textContent,
    idShown:r.querySelector('.signing-key-id')?.textContent||r.querySelector('.signing-key-name').textContent,role:r.querySelector('.signing-key-chip:not(.signing-key-you)')?.textContent||'',you:!!r.querySelector('.signing-key-you'),
    short:r.querySelector('.signing-key-short')?.textContent||'',title:r.querySelector('.signing-key-short')?.title||'',browser:r.querySelector('.signing-key-browser').textContent,
    action:r.querySelector('.signing-key-primary')?.textContent||'',note:r.querySelector('.signing-key-note')?.textContent||''})));
  const byId=Object.fromEntries(facts.map(x=>[x.id,x]));
  for(const x of facts)assert.equal(x.idShown,x.id,'the id is shown with the name');
  assert.deepEqual(facts.map(x=>x.icon),['⚠','●','⚠','⛔','⛔','○','✓','✓'],'an icon with every badge');
  assert.deepEqual(facts.map(x=>x.role),['agent','human','agent','agent','agent','agent','human','agent'],'role from participants.json');
  assert.deepEqual(facts.filter(x=>x.you).map(x=>x.id),[OWNER],'the own row carries You');
  assert.deepEqual(Object.fromEntries(facts.map(x=>[x.id,x.action||x.note])),{'build-agent-02':'Review again','ada-reviewer':'Review','cache-agent-03':'Retry','docs-agent-04':'Do not use','edge-agent-05':'Do not use',
    'implementation-agent-01':'Their messages show as unsigned',[OWNER]:'Show my fingerprint',[PEER]:'Details'});
  assert.deepEqual(Object.fromEntries(facts.map(x=>[x.id,x.browser])),{'build-agent-02':'This browser: A different key approved','ada-reviewer':'This browser: Not approved','cache-agent-03':'This browser: —','docs-agent-04':'This browser: Not approved',
    'edge-agent-05':'This browser: Not approved','implementation-agent-01':'This browser: —',[OWNER]:'This browser: Approved',[PEER]:'This browser: Approved'});
  // The short fingerprint is the first and last 6 characters after the prefix; the full value is its title.
  const fp=f.ids['ada-reviewer'].fingerprint,rest=fp.slice(45);
  assert.equal(byId['ada-reviewer'].short,rest.slice(0,6)+'…'+rest.slice(-6));assert.equal(byId['ada-reviewer'].title,fp);
  assert.equal(byId['implementation-agent-01'].short,'','no key, no fingerprint');
  await expect(page.locator('#signingPendingSummary')).toHaveText('3 of 8 need your attention · 2 approved on this browser');
  await expect(page.locator('#signingDialog [data-key-filter]')).toHaveText(['All 8','Needs attention 3','Approved 2','No key 1','Revoked 2']);
  // Filters.
  for(const [filter,ids] of [['attention',['build-agent-02','ada-reviewer','cache-agent-03']],['approved',[OWNER,PEER]],['none',['implementation-agent-01']],['revoked',['docs-agent-04','edge-agent-05']],['all',ORDER]]){
    await page.locator(`[data-key-filter="${filter}"]`).click();
    await expect(page.locator(`[data-key-filter="${filter}"]`)).toHaveAttribute('aria-pressed','true');
    assert.deepEqual(await page.locator('#signingKeys [data-key-row]:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),ids,filter);
    assert.deepEqual(await page.locator('#signingKeys .signing-key-group:not([hidden])').count(),new Set(ids.map(id=>({changed:0,review:1,error:2,retired:3,compromised:3,none:4,approved:5})[STATES[id]])).size,filter+': headers of empty groups hide');
  }
  // Polish.
  await choose(page,'#sLang','pl');
  await expect(page.locator('#signingPendingSummary')).toHaveText('3 z 8 wymagają Twojej uwagi · 2 zatwierdzone w tej przeglądarce',{timeout:10000});
  await expect.poll(()=>keyRows(page),{timeout:10000}).toEqual(['Build agent (build-agent-02) - Klucz zmieniony','Ada Novak (ada-reviewer) - Wymaga sprawdzenia','Cache agent (cache-agent-03) - Nie można wczytać klucza','Docs agent (docs-agent-04) - Unieważniony (wycofany)','Edge agent (edge-agent-05) - Unieważniony (przejęty)',
    'implementation-agent-01 (implementation-agent-01) - Brak klucza','human-owner-01 (human-owner-01) - Zatwierdzony w tej przeglądarce','research-agent-01 (research-agent-01) - Zatwierdzony w tej przeglądarce']);
  await expect(page.locator('#signingDialog [data-key-filter]')).toHaveText(['Wszystkie 8','Wymaga uwagi 3','Zatwierdzone 2','Brak klucza 1','Unieważnione 2']);
  await expect(row(page,'ada-reviewer').locator('.signing-key-primary')).toHaveText('Sprawdź');
  await expect(row(page,OWNER).locator('.signing-key-you')).toHaveText('Ty');
  // The task buttons are labelled when the dialog opens.
  await closeSigning(page);await openSigning(page);
  await expect(page.locator('#signingDialog [data-signing-task="review"]')).toHaveText('Klucze');
  await expect(page.locator('#signing-review h3')).toHaveText('2. Klucze');
  await choose(page,'#sLang','en');await closeSigning(page);await openSigning(page);
  await expect(page.locator('#signingDialog [data-signing-task="review"]')).toHaveText('Keys');
});

test('AC2: search appears from 8 participants and matches name and id; rows stay put after an action until reopen',async t=>{
  const f=await keysBoard(t),{page}=f;
  await openKeys(page);
  const search=page.locator('#signingKeySearch');
  await expect(search).toBeVisible();
  await search.fill('novak');
  assert.deepEqual(await page.locator('#signingKeys [data-key-row]:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),['ada-reviewer'],'by name');
  await search.fill('AGENT-0');
  assert.deepEqual(await page.locator('#signingKeys [data-key-row]:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),['build-agent-02','cache-agent-03','docs-agent-04','edge-agent-05','implementation-agent-01',PEER],'by id, any case');
  await search.fill('');
  // Approving Ada changes her row in place; it moves to Approved only when Keys is opened again.
  await trust(page,f.ids['ada-reviewer']);
  await expect(row(page,'ada-reviewer')).toHaveAttribute('data-key-state','approved');
  assert.deepEqual(await page.locator('#signingKeys [data-key-row]').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),ORDER,'no jumping rows');
  await closeSigning(page);await openKeys(page);
  assert.deepEqual(await page.locator('#signingKeys [data-key-row]').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),['build-agent-02','cache-agent-03','docs-agent-04','edge-agent-05','implementation-agent-01','ada-reviewer',OWNER,PEER],'re-sorted on reopen');
  await closeSigning(page);
  // Seven participants or fewer: no search field.
  const small=await native.boot(t,browser,url);await openKeys(small.page);
  assert.equal(await small.page.locator('#signingKeys [data-key-row]').count(),3);
  await expect(small.page.locator('#signingKeySearch')).toBeHidden();
});

// AC3, as a function so AC11 can show that each invariant can fail.
async function invariants(page){
  // A fresh dialog, so a replaced status function is what renders the rows.
  await closeSigning(page);await openKeys(page);
  for(const id of Object.keys(STATES)){
    await selectKey(page,id);
    const state=STATES[id],r=row(page,id),badge=r.locator('.signing-key-badge');
    const look=await badge.evaluate(el=>{const cs=getComputedStyle(el),ok=getComputedStyle(document.querySelector('#signingDialog')).getPropertyValue('--signing-ok').trim(),probe=document.createElement('span');probe.style.color=ok;document.body.append(probe);const okColor=getComputedStyle(probe).color;probe.remove();return {tone:el.dataset.tone,color:cs.color,border:cs.borderColor,okColor};});
    if(state==='changed'){
      assert.notEqual(look.tone,'ok',`${id}: a changed key has no success tone`);
      assert.ok(look.color!==look.okColor&&look.border!==look.okColor,`${id}: a changed key has no success colour: ${JSON.stringify(look)}`);
      assert.equal(await page.locator('#signingKeyDetail .signing-key-badge').getAttribute('data-tone'),look.tone,'the detail shows the same badge');
    }
    if(state==='retired'||state==='compromised'){
      assert.equal(await r.locator('button').count(),0,`${id}: a revoked row has no action button`);
      await expect(page.locator('#signingDialog [data-action="trust"]')).toBeHidden();
      assert.equal(await page.locator('#signingKeyDetail button:visible').evaluateAll(bs=>bs.filter(b=>/approv|zatwierd/i.test(b.textContent+' '+(b.dataset.action||'')+' '+(b.dataset.keyAction||''))).length),0,`${id}: no approve control in the detail`);
    }
  }
  // One approve control in the whole dialog, for the selected key only; row actions never approve.
  assert.equal(await page.locator('#signingDialog [data-action="trust"]').count(),1);
  assert.deepEqual([...new Set(await page.locator('#signingKeys [data-key-action]').evaluateAll(bs=>bs.map(b=>b.dataset.keyAction)))].sort(),['details','mine','retry','review']);
}
test('AC3: a changed key never looks approved, revoked keys offer no approval, nothing approves more than one key, Approve needs the comparison',async t=>{
  const f=await keysBoard(t),{page}=f;
  await openKeys(page);
  await invariants(page);
  for(const theme of ['dark','dracula']){await choose(page,'#sTheme',theme);await selectKey(page,'build-agent-02');
    const tones=await page.locator('#signingKeys .signing-key-badge').evaluateAll(bs=>bs.map(b=>[b.closest('[data-key-row]').dataset.keyRow,getComputedStyle(b).color]));
    const okRows=tones.filter(([id])=>STATES[id]==='approved').map(([,c])=>c),changed=tones.find(([id])=>id==='build-agent-02')[1];
    assert.ok(!okRows.includes(changed),`${theme}: the changed badge differs from the approved one`);}
  await choose(page,'#sTheme','light');
  // Approve stays the SPEC-002-071 comparison (and SPEC-002-072 echo confirmation).
  await selectKey(page,'ada-reviewer');
  const approve=page.locator('#signingDialog [data-action="trust"]'),fp=f.ids['ada-reviewer'].fingerprint;
  await expect(approve).toBeDisabled();
  await page.locator('#signingFingerprint').fill(f.peer.fingerprint);
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','mismatch');await expect(approve).toBeDisabled();
  await approve.evaluate(b=>{b.disabled=false;b.click();});
  await expect(page.locator('#signing-review .signing-feedback')).toHaveText('Fingerprint does not match verified current profile');
  // The value as the owner sent it, from outside this dialog: no echo, so the match alone enables Approve.
  await page.locator('#signingFingerprint').fill(fp);
  await expect(page.locator('#signingCompare')).toHaveAttribute('data-state','match');
  await expect(page.locator('#signingEcho')).toBeHidden();
  await expect(approve).toBeEnabled();
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))['ada-reviewer'],undefined,'nothing approved before the click');
  await approve.click();await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
  const pins=await page.evaluate(()=>B.signingContext.state.pins);
  assert.deepEqual(Object.keys(pins).sort(),['ada-reviewer','build-agent-02',OWNER,PEER].sort(),'one more key approved, none other changed');
  assert.equal(pins['build-agent-02'],f.ids['build-agent-02'].fingerprint,'the changed key keeps its old approval');
});

test('AC4: the detail per state: changed old/new, revocation, lineage, can\'t load, no key, Required in and the no-UUID warning',async t=>{
  const f=await keysBoard(t),{page}=f;
  f.cli('signing','require','--scope','rooms/architecture','--minimum','trusted');await refresh(f);
  await openKeys(page);
  // Key changed: old (approved) and new side by side, the first differing group marked in both.
  await selectKey(page,'build-agent-02');
  const changed=page.locator('#signingKeyChanged');
  await expect(changed).toBeVisible();
  const old=f.ids['build-agent-02'].fingerprint,now=f.rotated.fingerprint;
  await expect(changed.locator('dd').nth(0)).toHaveText(old);await expect(changed.locator('dd').nth(1)).toHaveText(now);
  let i=0;while(old[i]===now[i])i++;
  const group=fp=>{const groups=['urn:ietf:params:oauth:jwk-thumbprint:sha-256:',...fp.slice(45).match(/.{1,4}/g)];let at=0;for(const g of groups){if(i<at+g.length)return g;at+=g.length;}};
  await expect(changed.locator('.signing-fp-diff')).toHaveText([group(old),group(now)]);
  await expect(changed).toContainText('Ask Build agent, outside this board, whether they replaced their key. A replacement and a swapped key look the same until they confirm.');
  await expect(page.locator('#signingDialog [data-action="trust"]')).toHaveText('Approve replacement key');
  await expect(page.locator('#signingKeyLineage')).toHaveText(`Replaced …${old.slice(-8)} → current …${now.slice(-8)}`);
  await expect(page.locator('#signingReviewSteps')).toBeVisible();
  // Revoked: status and reason, no steps.
  for(const [id,label,reason] of [['docs-agent-04','Revoked (retired)','Replaced by a new laptop'],['edge-agent-05','Revoked (compromised)','Key file leaked']]){
    await selectKey(page,id);
    await expect(page.locator('#signingKeyRevocation')).toBeVisible();
    await expect(page.locator('#signingKeyRevocation strong')).toHaveText(label);
    await expect(page.locator('#signingKeyRevocation')).toContainText('Reason given: '+reason);
    await expect(page.locator('#signingReviewSteps')).toBeHidden();await expect(page.locator('#signingKeyChanged')).toBeHidden();
    await expect(page.locator('#signingKeyLineage')).toBeHidden();
  }
  // Can't load: the resolver's error and Retry, which is Refresh key details; still no approval.
  await selectKey(page,'cache-agent-03');
  await expect(page.locator('#signingKeyDetail .signing-key-card')).toContainText('required lifecycle evidence missing');
  await expect(page.locator('#signingReviewSteps')).toBeHidden();
  await row(page,'cache-agent-03').locator('[data-key-action="retry"]').click();
  await expect(page.locator('#signing-review .signing-feedback')).toHaveText(/required lifecycle evidence missing/);
  // No key.
  await selectKey(page,'implementation-agent-01');
  await expect(page.locator('#signingKeyDetail .signing-key-card')).toContainText('No signing key is registered for implementation-agent-01. Their messages show as unsigned.');
  await expect(page.locator('#signingReviewSteps')).toBeHidden();await expect(page.locator('#signingCopyFingerprint')).toBeHidden();
  // Approved: the steps fold to one line with Remove my approval.
  await selectKey(page,PEER);
  await expect(page.locator('#signingKeyApproved')).toHaveText('✓ Approved on this browser, for this board folder.');
  await expect(page.locator('#signingReviewSteps')).toBeHidden();
  await expect(page.locator('#signingDialog [data-action="remove-trust-ask"]')).toHaveText('Remove my approval');
  // Required in: the policy scopes.
  await expect(page.locator('#signingKeyRequired')).toContainText('Required in');
  await expect(page.locator('#signingKeyRequired')).toContainText('Approved signatures are required in: rooms/architecture.');
  await expect(page.locator('#signingKeyRequired .signing-key-warn')).toBeHidden();
  await expect(page.locator('#signingKeyDetail .signing-key-asof')).toContainText('Key details as of ');
  await closeSigning(page);
});
test('AC4: a board without an identity UUID warns that requirements cannot apply; no policy, no Required in',async t=>{
  const tmp=h.tmpDir('afb-keys-nouuid-'),proj=h.layoutExample(tmp);t.after(()=>h.fs.rmSync(tmp,{recursive:true,force:true}));
  const ctx=await browser.newContext(),page=await ctx.newPage();t.after(()=>ctx.close());
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});
  await page.goto(url);await importBoard(page,proj);await h.openBoardViaUi(page);
  assert.equal(await page.evaluate(()=>!!B.signingContext&&!B.signingContext.boardId),true,'a signing context without a board UUID');
  await openKeys(page);await selectKey(page,OWNER);
  await expect(page.locator('#signingKeyRequired .signing-key-warn')).toHaveText('This board has no identity UUID, so no room can require approved signatures yet. The board owner runs boardctl identity enable --path <board>.');
  await expect(page.locator('#signingKeyRequired > p').first()).toBeHidden();
  await closeSigning(page);
  // With a UUID and no requirement, Required in is omitted.
  const f=await native.boot(t,browser,url);await openKeys(f.page);await selectKey(f.page,PEER);
  await expect(f.page.locator('#signingKeyRequired')).toBeHidden();
  assert.deepEqual(errors,[]);
});

// AC5, as a function so AC11 can show it fails when Undo survives a reopen.
async function undoEndsWithDialog(page){
  await closeSigning(page);await openKeys(page);await selectKey(page,PEER);
  await expect(page.locator('#signingUndo'),'no Undo after reopening').toBeHidden({timeout:1500});
  await expect(page.locator('#signingDialog [data-action="undo-remove"]')).toBeDisabled({timeout:1500});
}
test('AC5: Remove my approval asks with its consequence, the row then needs review, Undo restores the exact pin only in this dialog session',async t=>{
  const f=await keysBoard(t),{page}=f;
  f.cli('signing','require','--scope','rooms/architecture','--minimum','trusted');await refresh(f);
  await openKeys(page);await selectKey(page,PEER);
  await page.locator('#signingDialog [data-action="remove-trust-ask"]').click();
  await expect(page.locator('#signingRemoveConfirm')).toHaveText(/^Remove\? Messages from research-agent-01 will show as not approved here and rooms that require approved signatures will refuse them\. Removing approval does not revoke their key\.RemoveKeep$/);
  // Keep changes nothing.
  await page.locator('#signingDialog [data-action="remove-keep"]').click();
  await expect(page.locator('#signingRemoveConfirm')).toBeHidden();
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))[PEER],f.peer.fingerprint);
  await action(page,'remove-trust');
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Local approval removed');
  await expect(row(page,PEER)).toHaveAttribute('data-key-state','review');
  await expect(row(page,PEER).locator('.signing-key-badge')).toContainText('Needs review');
  await expect(page.locator('#signingUndo')).toContainText('Approval removed — research-agent-01 now needs review.');
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))[PEER],undefined);
  await page.locator('#signingDialog [data-action="undo-remove"]').click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText("Approval of research-agent-01's key restored on this browser.");
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))[PEER],f.peer.fingerprint,'the exact fingerprint');
  assert.equal((await page.evaluate(async()=>(await signingGet(B.signingKey)).pins))[PEER],f.peer.fingerprint,'saved');
  await expect(row(page,PEER)).toHaveAttribute('data-key-state','approved');await expect(page.locator('#signingUndo')).toBeHidden();
  // Own key: the confirmation also warns about your own posts.
  await selectKey(page,OWNER);await page.locator('#signingDialog [data-action="remove-trust-ask"]').click();
  await expect(page.locator('#signingRemoveConfirm p')).toContainText('This is your own key: your posts in rooms that require approved signatures will be blocked until you approve it again.');
  await page.locator('#signingDialog [data-action="remove-keep"]').click();
  // Removed, then the dialog reopened: no Undo; the key needs a full review.
  await selectKey(page,PEER);await action(page,'remove-trust');await expect(page.locator('#signingUndo')).toBeVisible();
  await undoEndsWithDialog(page);
  await expect(page.locator('#signingReviewSteps')).toBeVisible();
  // Removing the approval of a changed key offers no Undo: the approved key is no longer the board's.
  await selectKey(page,'build-agent-02');await action(page,'remove-trust');
  await expect(row(page,'build-agent-02')).toHaveAttribute('data-key-state','review');
  await expect(page.locator('#signingUndo')).toBeHidden();await expect(page.locator('#signingDialog [data-action="undo-remove"]')).toBeDisabled();
  // A key replaced after the removal: Undo goes away, and the action itself still refuses.
  await selectKey(page,PEER);await page.locator('#signingFingerprint').fill(f.peer.fingerprint);await action(page,'trust');
  await action(page,'remove-trust');await expect(page.locator('#signingUndo')).toBeVisible();
  const rotated=f.rotate(PEER);await importBoard(page,f.proj);
  await expect.poll(async()=>{await page.evaluate(()=>readFromHandle(true));return page.evaluate(id=>B.signingParticipants[id].fingerprint,PEER);}).toBe(rotated.fingerprint);
  await expect(page.locator('#signingUndo')).toBeHidden({timeout:10000});
  await page.locator('#signingDialog [data-action="undo-remove"]').evaluate(b=>{b.disabled=false;b.click();});
  await expect(page.locator('#signing-review .signing-feedback')).toHaveText('The key changed since you removed the approval. Review it again.');
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))[PEER],undefined);
});

test('AC6: Review keys and the key notice open the keys needing attention; a message, the composer and Participants open one row',async t=>{
  const f=await keysBoard(t),{page}=f;
  for(const open of [()=>h.openToolbarTool(page,'reviewKeysTool'),async()=>{await expect(page.locator('#keyNotice')).toBeVisible();await page.click('#keyNoticeReview');}]){
    await open();await expect(page.locator('#signingDialog')).toBeVisible();
    await expect(page.locator('[data-key-filter="attention"]')).toHaveAttribute('aria-pressed','true');
    assert.equal(await selectedKey(page),'build-agent-02','the first key needing attention');
    await expect(page.locator('#signingKeyDetail')).toBeVisible();
    assert.deepEqual(await page.locator('#signingKeys [data-key-row]:not([hidden])').evaluateAll(rows=>rows.map(r=>r.dataset.keyRow)),['build-agent-02','ada-reviewer','cache-agent-03']);
    await closeSigning(page);
  }
  // Participants: the key chip opens that person's row and closes Participants.
  await h.openToolbarTool(page,'presenceOpen');
  const chip=page.locator(`#presenceList [data-presence-id="ada-reviewer"] [data-signing-open="review"]`);
  await expect(chip).toContainText('Needs review');
  await chip.click();
  await expect(page.locator('#presenceDialog')).toBeHidden();await expect(page.locator('#signingDialog')).toBeVisible();
  assert.equal(await selectedKey(page),'ada-reviewer');await expect(page.locator('#signingKeyDetail')).toBeVisible();
  await expect(page.locator('[data-key-filter="all"]')).toHaveAttribute('aria-pressed','true');
  await closeSigning(page);
  // A message's signing details: a signed message from a key not approved here.
  const path=f.cli('post','--from','ada-reviewer','--to','all','--scope','room','--room','architecture','--thread','T001','--slug','keys-entry','--body','Signed by Ada','--signing-key-file',f.ids['ada-reviewer'].key);
  await refresh(f);await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  const article=page.locator(`article.msg[data-file="${h.path.basename(path)}"]`);
  await article.locator('.signing-facts summary').click();
  await article.locator('.signing-review-key').click();
  await expect(page.locator('#signingDialog')).toBeVisible();
  assert.equal(await selectedKey(page),'ada-reviewer');await expect(page.locator('#signingKeyDetail')).toBeVisible();
  await closeSigning(page);
  // The composer's "Approve the key" opens the own row (SPEC-002-061 status): own key unlocked, not approved here.
  await openKeys(page);await selectKey(page,OWNER);await action(page,'remove-trust');await closeSigning(page);
  f.cli('signing','require','--board','--minimum','trusted');await refresh(f);
  await native.unlock(page,f.owner);
  await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cThread','');await page.fill('#cNewThread','Keys entry');
  await expect(page.locator('#signingNotice')).toHaveAttribute('data-signing-status','needs-approval');
  await page.locator('#signingNotice .signing-notice-action').click();
  await expect(page.locator('#signingDialog')).toBeVisible();
  assert.equal(await selectedKey(page),OWNER);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signingFingerprint','lands on the comparison, approves nothing');
  assert.equal((await page.evaluate(()=>B.signingContext.state.pins))[OWNER],undefined);
});

// The canonical parser of the pinned boardctl: exit 0 for a command it accepts, 2 for an unknown command or flag.
function parses(args){
  const r=spawnSync(python,['-I','-c','import sys;sys.path.insert(0,sys.argv[1]);import boardctl;boardctl.parser().parse_args(sys.argv[2:])',h.VENDOR,...args],{encoding:'utf8'});
  return r.status===0?'':r.stderr.trim().split('\n').at(-1);
}
test('AC7: the Command line disclosure shows commands of the pinned canonical boardctl, filled with the participant and profile hash',async t=>{
  const f=await keysBoard(t),{page}=f;
  await openKeys(page);
  const seen=new Set();
  for(const id of Object.keys(STATES)){
    await selectKey(page,id);
    const cli=page.locator('#signingKeyCli');await cli.locator('summary').click();
    const commands=await cli.locator('pre code').allTextContents();
    assert.ok(commands.length>=2,id);
    for(const command of commands){
      assert.match(command,/^boardctl /);
      const args=command.slice(9).split(' ').map(a=>a==='<board>'?f.proj:a.replace(/^<[^>]+>$/,'placeholder').replace(/^rooms\/<room>$/,'rooms/architecture'));
      assert.equal(parses(args),'',`${id}: ${command}`);
      assert.ok(command.includes(id),`${id}: the participant is filled in: ${command}`);
      assert.ok(!/--fingerprint urn:/.test(command),'the fingerprint is never filled in');
      seen.add(command.split(' ').slice(1,3).join(' '));
    }
    const profile=await page.evaluate(id=>B.signingParticipants[id].profile||'',id);
    if(profile&&!['retired','compromised'].includes(STATES[id]))assert.ok(commands.some(c=>c.includes('--profile '+profile)||c.includes('--expect-profile '+profile)),`${id}: the known profile hash is filled in`);
    await cli.locator('summary').click();
  }
  assert.deepEqual([...seen].sort(),['identity import','identity inspect','signing check','signing keygen','signing profile','signing revoke','signing transition','signing trust','signing untrust','signing update']);
  // The flags exist in the source of the pinned canonical CLI, and the approve commands run there.
  const source=h.fs.readFileSync(h.path.join(h.VENDOR,'signing_commands.py'),'utf8');
  for(const flag of ['--participant','--fingerprint','--profile','--expect-profile','--key-file','--new-key-file','--event-file','--profile-file','--sha256','--status','--from','--scope'])assert.ok(source.includes(`"${flag}"`),flag);
  // Non-vacuity of the parser check: a missing required flag and an unknown command are refused.
  assert.match(parses(['signing','trust','--path',f.proj,'--participant',PEER,'--fingerprint','x']),/required: --profile/);
  assert.match(parses(['signing','approve','--path',f.proj]),/invalid choice/);
});

// AC8: dialog geometry on top of the SPEC-002-068 page checks.
async function keysGeometry(page){
  return page.evaluate(()=>{
    const d=document.querySelector('#signingDialog'),section=document.querySelector('#signing-review').getBoundingClientRect(),detail=document.querySelector('#signingKeyDetail'),list=document.querySelector('#signingKeys');
    const selected=list.querySelector('[data-key-row][aria-selected="true"]');
    const spill=[...document.querySelectorAll('#signing-review *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&!el.closest('.signing-key-filters>*')&&(r.right>section.right+1||r.left<section.left-1);}).map(el=>el.className||el.tagName);
    const small=[...document.querySelectorAll('#signing-review button')].filter(b=>b.getClientRects().length&&!b.closest('.signing-key-filters')&&b.getBoundingClientRect().height<40).map(b=>b.textContent);
    const chips=document.querySelector('.signing-key-filters');
    return {scroll:d.scrollWidth>d.clientWidth,spill,small,chips:getComputedStyle(chips).overflowX,chipsFit:chips.getBoundingClientRect().right<=section.right+1,
      accordion:detail.parentElement===list&&detail.previousElementSibling===selected,beside:detail.parentElement!==list&&detail.getBoundingClientRect().left>=list.getBoundingClientRect().right,open:!detail.hidden};
  });
}
test('AC8: 1280x800, 900x500, 390x640 and 320x360 with every state: no layout violation, master/detail from 900px, an accordion below',async t=>{
  const f=await keysBoard(t),{page}=f;
  for(const [width,height] of [[1280,800],[900,500],[390,640],[320,360]]){
    await page.setViewportSize({width,height});
    await h.openToolbarTool(page,'reviewKeysTool');await expect(page.locator('#signingDialog')).toBeVisible();
    await page.locator('[data-key-filter="all"]').click();
    for(const id of ORDER){
      await selectKey(page,id);const at=`${width}x${height} ${id}`;
      assert.deepEqual(await h.layoutViolations(page),[],at);
      const g=await keysGeometry(page);
      assert.deepEqual({scroll:g.scroll,spill:g.spill,small:g.small,chips:g.chips,chipsFit:g.chipsFit,open:g.open},{scroll:false,spill:[],small:[],chips:'auto',chipsFit:true,open:true},at);
      assert.equal(width>=900?g.beside:g.accordion,true,at+(width>=900?': detail beside the list':': detail under its row'));
    }
    await closeSigning(page);
  }
});

test('AC9: keyboard: chips with arrows, rows with Up/Down/Home/End and Enter, Esc folds the detail first; focus after Approve and Remove',async t=>{
  const f=await keysBoard(t),{page}=f;
  const focused=()=>page.evaluate(()=>document.activeElement?.dataset?.keyRow||document.activeElement?.dataset?.keyFilter||document.activeElement?.id||'');
  await openKeys(page);
  await page.locator('[data-key-filter="all"]').focus();
  await page.keyboard.press('ArrowRight');assert.equal(await focused(),'attention');
  await page.keyboard.press('ArrowRight');assert.equal(await focused(),'approved');
  await page.keyboard.press('ArrowLeft');assert.equal(await focused(),'attention');
  await page.keyboard.press('Enter');await expect(page.locator('[data-key-filter="attention"]')).toHaveAttribute('aria-pressed','true');
  assert.equal(await page.locator('[data-key-filter]').evaluateAll(bs=>bs.filter(b=>b.tabIndex===0).length),1,'one chip in the tab order');
  await page.locator('[data-key-filter="all"]').click();
  // One row is the tab stop; arrows, Home and End move focus without opening anything.
  assert.equal(await page.locator('#signingKeys [data-key-row][tabindex="0"]').count(),1);
  await page.locator('#signingKeys [data-key-row][tabindex="0"]').focus();assert.equal(await focused(),ORDER[0]);
  await page.keyboard.press('ArrowDown');assert.equal(await focused(),ORDER[1]);
  await page.keyboard.press('End');assert.equal(await focused(),ORDER.at(-1));
  await page.keyboard.press('ArrowUp');assert.equal(await focused(),ORDER.at(-2));
  await page.keyboard.press('Home');assert.equal(await focused(),ORDER[0]);
  await expect(page.locator('#signingKeyDetail')).toBeHidden();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  assert.equal(await selectedKey(page),ORDER[1]);await expect(page.locator('#signingKeyDetail')).toBeVisible();
  // Esc folds the open detail and returns to its row; a second Esc closes the dialog.
  await page.locator('#signingFingerprint').focus();await page.keyboard.press('Escape');
  await expect(page.locator('#signingKeyDetail')).toBeHidden();await expect(page.locator('#signingDialog')).toBeVisible();
  assert.equal(await focused(),ORDER[1]);
  await page.keyboard.press('Escape');await expect(page.locator('#signingDialog')).toBeHidden();
  // After Approve, focus moves to the next key needing attention; rows do not move.
  await openKeys(page);await selectKey(page,'ada-reviewer');
  await page.locator('#signingFingerprint').fill(f.ids['ada-reviewer'].fingerprint);await page.locator('#signingDialog [data-action="trust"]').click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
  await expect.poll(focused).toBe('cache-agent-03');
  // After Remove, focus stays on the row.
  await selectKey(page,PEER);await action(page,'remove-trust');
  await expect.poll(focused).toBe(PEER);
});

test('AC11: non-vacuity: an Approve button on a revoked row, success styling on a changed row and Undo after reopening each fail',async t=>{
  const f=await keysBoard(t),{page}=f;
  await openKeys(page);await invariants(page);
  await page.evaluate(()=>{window.realAction=signingKeyAction;signingKeyAction=(state,own,text)=>state==='retired'||state==='compromised'?{kind:'review',label:'Approve'}:window.realAction(state,own,text);});
  await assert.rejects(invariants(page),/a revoked row has no action button/,'an Approve control on a revoked row must fail AC3');
  await page.evaluate(()=>{signingKeyAction=window.realAction;});
  await page.evaluate(()=>{window.realBadge=signingKeyBadge;signingKeyBadge=(state,text)=>state==='changed'?{...window.realBadge('approved',text),label:'Key changed'}:window.realBadge(state,text);});
  await assert.rejects(invariants(page),/a changed key has no success (tone|colour)/,'success styling on a changed row must fail AC3');
  await page.evaluate(()=>{signingKeyBadge=window.realBadge;});
  await invariants(page);
  // Undo that ignores the dialog session.
  await selectKey(page,PEER);await action(page,'remove-trust');await expect(page.locator('#signingUndo')).toBeVisible();
  await page.evaluate(()=>{window.realUndo=signingUndoFor;signingUndoFor=id=>signingUndo.get(id)?.fingerprint||null;});
  await assert.rejects(undoEndsWithDialog(page),/no Undo after reopening/,'Undo after reopening must fail AC5');
  await page.evaluate(()=>{signingUndoFor=window.realUndo;});
  await undoEndsWithDialog(page);
});
