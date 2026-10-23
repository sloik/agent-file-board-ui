'use strict';
// AC3-AC5 in a real browser against boards built and observed by the canonical CLI.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
const {importBoard,openSigning,closeSigning,trust}=native;
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
const SCOPE='rooms/architecture';
const python=process.env.AFB_SIGNING_PYTHON||'python3';
const indicator=page=>page.locator('#historyOpen');
// The viewer's own optional daily update check is unrelated to this feature; everything else is foreign traffic.
const foreign=f=>f.requests.filter(u=>!u.startsWith(url)&&!/^https:\/\/(sloik\.github\.io\/agent-file-board-ui\/update-check\.html|api\.github\.com\/repos\/sloik\/agent-file-board-ui\/releases\/latest)/.test(u));
async function boot(t){
  const f=await native.boot(t,browser,url),requests=[];
  f.page.on('request',request=>requests.push(request.url()));
  f.requests=requests;
  return f;
}
const room=page=>page.click('button.fname[data-nav="room"][data-dir="architecture"]');
async function refresh(f){await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
function cliTrust(f,who){f.cli('signing','trust','--participant',who.participant,'--profile',who.profile,'--fingerprint',who.fingerprint);}
function observe(f,who=f.owner){return JSON.parse(f.cli('history','observe','--scope',SCOPE,'--from',who.participant,'--signing-key-file',who.key));}
function cliStatus(f){
  const r=spawnSync(python,[h.path.join(h.VENDOR,'boardctl.py'),'history','status','--scope',SCOPE,'--path',f.proj],{env:{...process.env,AGENT_FILE_BOARD_STATE_DIR:h.path.join(f.tmp,'private-state')},encoding:'utf8'});
  assert.ok(r.stdout.trim(),r.stderr);return JSON.parse(r.stdout);
}
const normalized=rows=>rows.map(r=>({path:r.path,observed:r.observed,source:r.source,needsAttention:r.needsAttention,neutral:r.neutral})).sort((a,b)=>a.path<b.path?-1:1);
const messageDir=f=>h.path.join(f.proj,'.agent-board',SCOPE);
const messages=f=>h.fs.readdirSync(messageDir(f)).filter(name=>name.endsWith('.txt')).sort();
async function openPanel(page){await indicator(page).click();await expect(page.locator('#historyDialog')).toBeVisible();}
async function closePanel(page){await page.locator('#historyDialog [data-action="close"]').click();await expect(page.locator('#historyDialog')).not.toBeVisible();}
async function panelFacts(page){return JSON.parse(await page.locator('#historyDialog [data-history-json]').textContent());}
async function panelRows(page){return normalized((await panelFacts(page)).entries);}
// Scope-level facts both clients must agree on (interoperability, design section 7).
function scopeFacts(scope){
  const inventories=Object.fromEntries(Object.entries(scope.inventories).map(([k,v])=>[k,Array.isArray(v)?v.length:v]));
  return {setUp:scope.setUp,bootstrap:scope.bootstrap,diagnostics:[...scope.diagnostics].sort(),needsAttention:scope.needsAttention,summary:scope.summary,coverage:scope.coverage,uncoveredPaths:scope.uncoveredPaths,windowComplete:scope.windowComplete,inventories};
}
async function assertAgrees(page,f,label){
  const {entries,...facts}=await panelFacts(page),cli=cliStatus(f).scopes[SCOPE];
  assert.deepEqual(facts,scopeFacts(cli),label+': scope facts');
  assert.deepEqual(normalized(entries),normalized(cli.entries),label+': entries');
}
async function panelText(page){return page.locator('#historyDialog').evaluate(el=>el.textContent);}
async function approve(f,who=f.owner){await openSigning(f.page);await trust(f.page,who);await closeSigning(f.page);}
async function kv(page){
  return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('agent-file-board-ui',1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv'),store=tx.objectStore('kv'),keys=store.getAllKeys(),values=store.getAll();
      tx.oncomplete=()=>{db.close();resolve(Object.fromEntries(keys.result.map((k,i)=>[k,JSON.stringify(values.result[i])])));};tx.onerror=()=>reject(tx.error);};}));
}
async function opfsPaths(page){
  return page.evaluate(async()=>{const out=[];async function walk(dir,prefix){for await(const [name,handle] of dir.entries()){if(handle.kind==='directory')await walk(handle,prefix+name+'/');else out.push(prefix+name);}}
    await walk(await navigator.storage.getDirectory(),'');return out.sort();});
}
const treePaths=f=>{const out=[];(function walk(dir,prefix){for(const name of h.fs.readdirSync(dir)){const p=h.path.join(dir,name);if(h.fs.statSync(p).isDirectory())walk(p,prefix+name+'/');else out.push(prefix+name);}})(f.proj,'');return out.sort();};

test('AC3/AC4/AC5: untrusted recording creates nothing, approval learns, memory survives reload, and a missing message shows after the shared recording is also gone',async t=>{
  const f=await boot(t),{page,owner}=f;
  await room(page);
  await expect(indicator(page)).toBeVisible();
  await expect(indicator(page)).toContainText('Missing-message check: Not set up');
  const before=treePaths(f);
  observe(f);await refresh(f);
  await expect(indicator(page)).toContainText('Not set up');
  await openPanel(page);
  await expect(page.locator('#historyDialog')).toContainText('Not set up: no observations yet');
  await expect(page.locator('#historyDialog [data-history-inventory="unpinned-signer"]')).toContainText('Recordings from signers you have not approved (not used): 1');
  await expect(page.locator('#historyDialog .history-command')).toContainText(`boardctl history observe --scope ${SCOPE} --from YOUR-PARTICIPANT-ID`);
  await assertAgrees(page,f,'before approval (neither client trusts the signer)');
  await closePanel(page);
  await approve(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
  assert.equal(await indicator(page).getAttribute('data-tier'),'neutral'.replace('neutral','ok'));
  await openPanel(page);
  await expect(page.locator('#historyDialog .history-summary')).toHaveText('4 expected, 4 available, 0 not covered (seen from this folder only)');
  await expect(page.locator('#historyDialog')).toContainText('anything removed before this browser first checked cannot be detected');
  await closePanel(page);
  assert.equal(await page.evaluate(()=>B.history.persistent),true,'native board memory is persistent');
  assert.ok(Object.keys(await kv(page)).some(key=>key.startsWith('history-state:')),'checkpoint is stored with local approvals');
  // Survives a page reload: no approval or observation is repeated.
  await page.reload();await h.openBoardViaUi(page);await room(page);
  await expect(indicator(page)).toContainText('4 of 4 available');
  // The CLI learns the same recording, then the shared recording and one message disappear.
  cliTrust(f,owner);assert.equal(cliStatus(f).scopes[SCOPE].coverage.available,4);
  const gone=messages(f)[0];
  h.fs.rmSync(h.path.join(messageDir(f),gone));h.fs.rmSync(h.path.join(f.proj,'.agent-board/history'),{recursive:true});
  await refresh(f);
  await expect(indicator(page)).toContainText('3 of 4 available · 1 not found here');
  assert.equal(await indicator(page).getAttribute('data-tier'),'neutral');
  await openPanel(page);
  const row=page.locator(`#historyDialog [data-history-path="${SCOPE}/${gone}"]`);
  await expect(row).toHaveAttribute('data-history-observed','message-unavailable');
  await expect(row).toHaveAttribute('data-history-source','pinned-current');
  await expect(row).toContainText('Not found here since');await expect(row).toContainText('it may still be syncing');
  const text=await panelText(page);
  assert.doesNotMatch(text,/deleted|usunię|usunie|skasow|🔒|🔓/i,'wording never accuses and shows no padlock');
  await assertAgrees(page,f,'after removal');
  await closePanel(page);
  // Display only: the viewer wrote nothing, asked nothing of the network and left eligibility alone.
  assert.deepEqual(await opfsPaths(page),treePaths(f),'the board folder is exactly what the CLI left');
  assert.deepEqual(foreign(f),[]);
  assert.equal(await page.evaluate(()=>B.msgs.every(m=>m.signing?.eligibility==='eligible')),true);
  assert.notEqual(before.length,0);
});

test('AC4: a changed message is a short warning, conflicting records are not hidden, and the CLI agrees',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);observe(f);await refresh(f);await room(page);await approve(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
  const target=h.path.join(messageDir(f),messages(f)[1]);
  h.fs.appendFileSync(target,'edited\n');await refresh(f);
  await expect(indicator(page)).toContainText('1 changed or in conflict');
  assert.equal(await indicator(page).getAttribute('data-tier'),'warning');
  await openPanel(page);
  const row=page.locator('#historyDialog [data-history-observed="changed"]');
  await expect(row).toHaveAttribute('data-history-tier','warning');await expect(row).toContainText('Changed since it was recorded');
  assert.doesNotMatch(await panelText(page),/tamper|forged|deleted/i);
  await assertAgrees(page,f,'agreement with the canonical CLI');
  assert.equal(cliStatus(f).scopes[SCOPE].needsAttention,1);
  await closePanel(page);
});

test('AC1/AC4: a compromise revocation keeps a missing message visible and needing attention',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);observe(f);await refresh(f);await room(page);await approve(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
  assert.equal(cliStatus(f).scopes[SCOPE].coverage.available,4);
  h.fs.rmSync(h.path.join(messageDir(f),messages(f)[0]));h.fs.rmSync(h.path.join(f.proj,'.agent-board/history'),{recursive:true});
  f.cli('signing','revoke','--participant',owner.participant,'--key-file',owner.key,'--expect-profile',owner.profile,'--status','compromised');
  await refresh(f);
  await expect(indicator(page)).toContainText('1 not found here');
  assert.equal(await indicator(page).getAttribute('data-tier'),'warning');
  await openPanel(page);
  const row=page.locator('#historyDialog [data-history-observed="message-unavailable"]');
  await expect(row).toHaveAttribute('data-history-source','revoked');
  await expect(row).toContainText('recorded by a signer you no longer trust');
  await assertAgrees(page,f,'agreement with the canonical CLI');
  await closePanel(page);
});

test('AC3: a board UUID change refuses instead of resetting, and the stored memory is not rewritten',async t=>{
  const f=await boot(t),{page,owner}=f;
  observe(f);await refresh(f);await room(page);await approve(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
  const before=await kv(page),key=Object.keys(before).find(k=>k.startsWith('history-state:'));assert.ok(key);
  const configPath=h.path.join(f.proj,'.agent-board/config.json'),config=JSON.parse(h.fs.readFileSync(configPath)),original=config.identity.boardId;
  config.identity.boardId='11111111-2222-4333-8444-555555555555';h.fs.writeFileSync(configPath,JSON.stringify(config));
  await refresh(f);
  await expect(indicator(page)).toContainText('unavailable');
  await openPanel(page);await expect(page.locator('#historyDialog')).toContainText('This check is unavailable');await expect(page.locator('#historyDialog')).toContainText('board UUID changed');
  await closePanel(page);
  assert.equal((await kv(page))[key],before[key],'refusal leaves the stored checkpoint byte for byte unchanged');
  config.identity.boardId=original;h.fs.writeFileSync(configPath,JSON.stringify(config));await refresh(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
});

test('AC3/AC5: a read-only upload keeps its memory for the session only and writes nothing',async t=>{
  const f=await boot(t),{owner}=f;
  observe(f);h.fs.rmSync(h.path.join(messageDir(f),messages(f)[2]));
  // A fresh browser context has no native board, so every stored key below belongs to the upload.
  const ctx=await browser.newContext(),page=await ctx.newPage(),requests=[],errors=[];t.after(()=>ctx.close());
  await ctx.addInitScript(()=>{const r=indexedDB.open('agent-file-board-ui',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({auto:false},'viewer-updates-v1');tx.oncomplete=()=>db.close();};});
  page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.setInputFiles('#fallback',f.proj);
  await page.waitForFunction(()=>B?.history);await room(page);
  await expect(indicator(page)).toContainText('Not set up');
  await openSigning(page);await trust(page,owner);await closeSigning(page);
  await expect(indicator(page)).toContainText('3 of 4 available');
  await expect(indicator(page)).toContainText('1 not found here');
  assert.equal(await page.evaluate(()=>B.history.persistent),false);
  assert.equal(await page.evaluate(()=>B.signingKey),null);
  assert.deepEqual(Object.keys(await kv(page)).filter(key=>/history-state|signing-state/.test(key)),[],'nothing about this upload is persisted');
  await openPanel(page);await expect(page.locator('#historyDialog')).toContainText('Remembered only until this page is closed');await closePanel(page);
  // The same board opened again in this session keeps the session memory even after its shared recording and another message are gone.
  h.fs.rmSync(h.path.join(f.proj,'.agent-board/history'),{recursive:true});h.fs.rmSync(h.path.join(messageDir(f),messages(f)[0]));
  await page.setInputFiles('#fallback',f.proj);await page.waitForFunction(scope=>B?.history?.report?.scopes?.[scope]?.coverage.expected===4,SCOPE);await room(page);
  await expect(indicator(page)).toContainText('2 of 4 available · 2 not found here');
  await openPanel(page);
  await expect(page.locator('#historyDialog [data-history-observed="message-unavailable"]').first()).toHaveAttribute('data-history-source','unpinned');
  await expect(page.locator('#historyDialog')).toContainText('recorded by a signer you no longer trust');
  await closePanel(page);
  assert.deepEqual(Object.keys(await kv(page)).filter(key=>/history-state|signing-state/.test(key)),[]);
  assert.deepEqual(requests.filter(u=>!u.startsWith(url)),[]);assert.deepEqual(errors,[]);
});

test('AC3/AC4: a flood of recordings leaves remembered coverage intact and reports observations not yet checked, like the CLI',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);observe(f);await refresh(f);await room(page);await approve(f);
  await expect(indicator(page)).toContainText('4 of 4 available');
  assert.equal(cliStatus(f).scopes[SCOPE].coverage.available,4);
  const folder=h.path.join(f.proj,'.agent-board/history',SCOPE);
  for(let i=0;i<205;i++){const raw=Buffer.from('junk '+i);h.fs.writeFileSync(h.path.join(folder,require('node:crypto').createHash('sha256').update(raw).digest('hex')+'.json'),raw);}
  await refresh(f);
  await expect(indicator(page)).toContainText('4 of 4 available · 5 observations not yet checked');
  assert.equal(await indicator(page).getAttribute('data-tier'),'neutral');
  await openPanel(page);
  await expect(page.locator('#historyDialog')).toContainText('5 observations not yet checked');
  await assertAgrees(page,f,'incomplete window');
  await closePanel(page);
  await refresh(f);await expect(indicator(page)).toContainText('4 of 4 available');
  await expect(indicator(page)).not.toContainText('not yet checked');
});

test('AC4: Polish, phone width and every theme keep the panel readable with keyboard focus returning to the indicator',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);observe(f);await refresh(f);await room(page);await approve(f);
  h.fs.appendFileSync(h.path.join(messageDir(f),messages(f)[1]),'edited\n');h.fs.rmSync(h.path.join(messageDir(f),messages(f)[0]));await refresh(f);
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  await expect(indicator(page)).toContainText('Kontrola brakujących wiadomości');
  for(const theme of ['light','dark','dracula'])for(const width of [1280,375]){
    await page.click('#gear');await page.selectOption('#sTheme',theme);await page.click('#sClose');
    await page.setViewportSize({width,height:800});
    await expect(indicator(page)).toBeVisible();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page scroll behind the indicator');
    await indicator(page).focus();await page.keyboard.press('Enter');
    await expect(page.locator('#historyDialog')).toBeVisible();
    const fit=await page.locator('#historyDialog').evaluate(dialog=>{const b=dialog.getBoundingClientRect();return {dialog:dialog.scrollWidth>dialog.clientWidth,viewport:b.left<0||b.right>innerWidth+1};});
    assert.deepEqual(fit,{dialog:false,viewport:false});
    const rows=await page.locator('#historyDialog .history-row').evaluateAll(els=>els.map(el=>{
      const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
      const s=getComputedStyle(el),a=lum(rgb(s.color)),b=lum(rgb(s.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
    assert.ok(rows.length>=2);for(const ratio of rows)assert.ok(ratio>=4.5,`row contrast ${ratio} in ${theme} at ${width}px`);
    const text=await panelText(page);
    assert.match(text,/Zmieniona od czasu zapisania/);assert.match(text,/Nie znaleziono tutaj od/);assert.match(text,/Czego to nie chroni/);
    assert.doesNotMatch(text,/usuni|usuń|skasow|🔒/i);
    await page.keyboard.press('Escape');
    await expect(page.locator('#historyDialog')).not.toBeVisible();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'historyOpen','focus returns to the indicator');
  }
});

test('AC4: the English panel explains what this does not protect offline and the room indicator never touches unread state',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);observe(f);await refresh(f);await room(page);await approve(f);
  const unread=()=>page.evaluate(()=>JSON.stringify([seen,[...document.querySelectorAll('.badge')].map(el=>el.textContent)]));
  const before=await unread();
  h.fs.rmSync(h.path.join(messageDir(f),messages(f)[0]));await refresh(f);
  await openPanel(page);
  const limits=page.locator('#historyLimits');await limits.locator('summary').click();
  for(const line of ['only detects','one signer','before this browser first checked','saved memory is lost','false "not found" reports','does not hide anything'])await expect(limits).toContainText(line);
  await closePanel(page);
  assert.equal(await unread(),before,'no unread or badge effect');
  assert.equal(await page.locator('#toast.show').count(),0,'no notification');
  assert.deepEqual(foreign(f),[]);
});
