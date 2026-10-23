'use strict';
// SPEC-002-063 in a real browser against boards built by the canonical CLI: automatic room
// history is shown, declared at creation from the composer and changed from the room menu.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {spawnSync}=require('node:child_process');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
const {importBoard,exportBoard,openSigning,closeSigning,trust,unlock}=native;
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
const python=process.env.AFB_SIGNING_PYTHON||'python3';
const SHOTS=process.env.AFB_HISTORY_SHOTS||'';
async function shot(page,name){if(SHOTS){h.fs.mkdirSync(SHOTS,{recursive:true});await page.screenshot({path:h.path.join(SHOTS,name)});}}
const boot=t=>native.boot(t,browser,url);
async function refresh(f){await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
const cliTrust=(f,who)=>f.cli('signing','trust','--participant',who.participant,'--profile',who.profile,'--fingerprint',who.fingerprint);
function cliStatus(f,scope,stateDir=null){
  const r=spawnSync(python,[h.path.join(h.VENDOR,'boardctl.py'),'history','status','--scope',scope,'--path',f.proj],{env:{...process.env,AGENT_FILE_BOARD_STATE_DIR:stateDir||h.path.join(f.tmp,'private-state')},encoding:'utf8'});
  assert.ok(r.stdout.trim(),r.stderr);return JSON.parse(r.stdout).scopes[scope];
}
// The CLI with another private state directory: a second reader on its own device.
function cliAt(f,stateDir,...args){
  const r=spawnSync(python,[h.path.join(h.VENDOR,'boardctl.py'),...args,'--path',f.proj],{env:{...process.env,AGENT_FILE_BOARD_STATE_DIR:stateDir},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return r.stdout;
}
function cliPost(f,who,room,thread,slug,...extra){
  const r=spawnSync(python,[h.path.join(h.VENDOR,'boardctl.py'),'post','--path',f.proj,'--from',who.participant,'--to','all','--scope','room','--room',room,'--thread',thread,'--slug',slug,'--body','Synthetic '+slug,'--signing-key-file',who.key,...extra],{env:{...process.env,AGENT_FILE_BOARD_STATE_DIR:h.path.join(f.tmp,'private-state')},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);return r.stderr;
}
const configFile=f=>h.path.join(f.proj,'.agent-board/config.json');
const opfsConfig=page=>page.evaluate(async()=>(await (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.agent-board')).getFileHandle('config.json')).getFile()).text());
async function writeOpfsConfig(page,text){await page.evaluate(async text=>{const board=await (await navigator.storage.getDirectory()).getDirectoryHandle('.agent-board'),w=await (await board.getFileHandle('config.json')).createWritable();await w.write(text);await w.close();},text);}
const panel=page=>page.locator('#historyDialog');
async function openPanel(page){await h.topicAction(page,'historyOpen');await expect(panel(page)).toBeVisible();}
async function closePanel(page){await panel(page).locator('[data-action="close"]').click();await expect(panel(page)).not.toBeVisible();}
async function facts(page){return JSON.parse(await panel(page).locator('[data-history-json]').textContent());}
const cliFacts=scope=>({recordedBy:scope.recordedBy,...(scope.recording?{recording:scope.recording}:{}),...(scope.trustHint?{trustHint:{participants:scope.trustHint.participants}}:{})});
async function agrees(page,cli,label){const {recordedBy,recording,trustHint}=await facts(page);assert.deepEqual(JSON.parse(JSON.stringify({recordedBy,...(recording?{recording}:{}),...(trustHint?{trustHint}:{})})),cliFacts(cli),label);}
const openRoom=(page,dir)=>page.click(`button.fname[data-nav="room"][data-dir="${dir}"]`);
const name=(page,id)=>page.evaluate(id=>B.people[id].name,id);
const notice=page=>page.locator('#signingNotice');
async function approve(page,who){await openSigning(page);await trust(page,who);await closeSigning(page);}
async function review(page){const d=page.locator('#historyReviewDialog');await expect(d).toBeVisible();return d;}

// SPEC-002-064: the creation options are folded under a small disclosure next to the name fields.
async function openCreateOptions(page){const fold=page.locator('#historyCreate .history-create-fold');if(!await fold.evaluate(el=>el.open))await fold.locator('summary').click();}
test('AC1/AC2/AC6: a room the CLI created with recording shows its setting, who recorded and whose key to approve, like history status',async t=>{
  const f=await boot(t),{page,owner}=f;
  cliTrust(f,owner);
  const err=cliPost(f,owner,'releases','T050','open','--new-room','--record-history');
  assert.match(err,/history: recorded rooms\/releases as human-owner-01/);
  cliPost(f,owner,'releases','T050','second');
  // A second recorder whose key the viewer will not approve.
  const {peer}=f;cliTrust(f,peer);
  assert.match(cliPost(f,peer,'releases','T050','peer-note'),/history: recorded rooms\/releases as research-agent-01/);
  await refresh(f);await openRoom(page,'releases');
  const owner_=await name(page,owner.participant),peer_=await name(page,peer.participant);
  assert.equal(await page.evaluate(()=>B.msgs.filter(m=>m.dir==='releases').every(m=>m.signing.eligibility==='eligible')),true,'signing verdicts are unaffected');
  await expect(page.locator('#historyOpen')).toContainText('Not set up');
  await openPanel(page);
  await expect(panel(page).locator('[data-history-recording="room"]')).toHaveText('Records automatically on signed posts');
  const hint=panel(page).locator(`[data-history-trust-hint="${owner.participant}"]`);
  await expect(hint).toContainText(`Records by ${owner_} count here only after you approve ${owner_}'s key.`);
  await expect(panel(page).locator(`[data-history-trust-hint="${peer.participant}"]`)).toContainText(`Records by ${peer_} count here only after you approve ${peer_}'s key.`);
  await expect(panel(page).locator('.history-recorded-by')).toHaveCount(0);
  await agrees(page,cliStatus(f,'rooms/releases',h.path.join(f.tmp,'fresh-reader')),'a reader that approved nobody');
  await hint.getByRole('button',{name:`Review ${owner_}'s fingerprint`}).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('#signingDialog')).toBeVisible();
  await expect(page.getByLabel('Trust participant',{exact:true})).toHaveValue(owner.participant);
  await trust(page,owner);await closeSigning(page);
  await expect(page.locator('#historyOpen')).toContainText('available');
  await openPanel(page);
  await expect(panel(page).locator('.history-recorded-by')).toHaveText(`Recorded by ${owner_} (approved key)`);
  await expect(panel(page).locator('[data-history-trust-hint]')).toHaveCount(1);
  await expect(panel(page).locator(`[data-history-trust-hint="${peer.participant}"]`)).toBeVisible();
  const ownerOnly=h.path.join(f.tmp,'owner-reader');
  cliAt(f,ownerOnly,'signing','trust','--participant',owner.participant,'--profile',owner.profile,'--fingerprint',owner.fingerprint);
  await agrees(page,cliStatus(f,'rooms/releases',ownerOnly),'a reader that approved one of two recorders');
  await shot(page,'desktop-light-history-recorded-by.png');
  await closePanel(page);
  // Approving the second recorder lists both, each with its key status.
  await approve(page,peer);
  await openPanel(page);
  await expect(panel(page).locator('.history-recorded-by')).toHaveText(`Recorded by ${owner_} (approved key), ${peer_} (approved key)`);
  await expect(panel(page).locator('[data-history-trust-hint]')).toHaveCount(0);
  await agrees(page,cliStatus(f,'rooms/releases'),'a reader that approved both recorders');
  await closePanel(page);
  // A thread-only declaration names its topics.
  f.cli('history','policy','--scope','rooms/architecture','--thread','T001','--record','on-post');
  await refresh(f);await openRoom(page,'architecture');await openPanel(page);
  await expect(panel(page).locator('[data-history-recording="threads"]')).toHaveText('Records automatically on signed posts in topics T001');
  await agrees(page,cliStatus(f,'rooms/architecture'),'thread declaration');
  await closePanel(page);
});

test('AC1: a malformed room_history never breaks the board and is reported in the history panel, like the CLI',async t=>{
  const f=await boot(t),{page}=f;
  await openRoom(page,'architecture');
  const verdicts=()=>page.evaluate(()=>JSON.stringify(B.msgs.map(m=>[m.path,m.signing])));
  const before=await verdicts(),count=await page.evaluate(()=>B.msgs.length);
  const cfg=JSON.parse(h.fs.readFileSync(configFile(f),'utf8'));cfg.room_history={version:2};h.fs.writeFileSync(configFile(f),JSON.stringify(cfg,null,2)+'\n');
  await refresh(f);
  assert.equal(await page.evaluate(()=>B.msgs.length),count);
  assert.equal(await verdicts(),before,'messages open and verify exactly as before');
  await openPanel(page);
  await expect(panel(page).locator('[data-history-recording="unreadable"]')).toContainText('cannot be read: room_history setting unavailable: unsupported schema');
  await agrees(page,cliStatus(f,'rooms/architecture'),'unreadable setting');
  await closePanel(page);
  // The room menu refuses to edit it, exactly as `history policy` does.
  await page.click('[data-notification-menu="room"][data-notification-key="architecture"]');await page.click('#sidebarHistorySettings');
  const d=page.locator('#historySettingsDialog');
  await expect(d).toContainText('cannot be edited safely');
  await expect(d.locator('#historySettingRecord')).toBeDisabled();
});

test('AC3/AC4: a new room declared from the composer writes the CLI policy before the first signed message; existing rooms are refused',async t=>{
  const f=await boot(t),{page,owner}=f;
  await page.selectOption('#me',owner.participant);await approve(page,owner);
  // SPEC-002-064: the chip's "New room…" shows the room and topic name inputs with these options below them.
  await h.startNewRoom(page);
  await expect(page.locator('#cNewRoom')).toBeFocused();await page.fill('#cNewRoom','launch');await page.fill('#cNewThread','Launch plan');
  const box=page.locator('#historyCreate');
  await expect(box).toBeVisible();await expect(box).toContainText('New room settings');
  await expect(page.locator('#cRequireTrusted')).not.toBeChecked();await expect(page.locator('#cRecordHistory')).not.toBeChecked();
  await expect(notice(page)).toHaveAttribute('data-signing-status','unsigned');
  await openCreateOptions(page);await page.check('#cRequireTrusted');
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock');
  await page.uncheck('#cRequireTrusted');
  await expect(notice(page)).toHaveAttribute('data-signing-status','unsigned');
  // Unsigned: refused before writing anything, draft kept.
  const original=await opfsConfig(page);
  await page.check('#cRecordHistory');await page.fill('#cBody','Opening the launch room');await page.click('#send');
  await expect(page.locator('#toast')).toContainText('needs this first message to be signed');
  assert.equal(await opfsConfig(page),original);await expect(page.locator('#cBody')).toHaveValue('Opening the launch room');
  await unlock(page,owner);
  await page.check('#cRequireTrusted');
  await expect(notice(page)).toHaveAttribute('data-signing-status','signed');
  await expect(page.locator('#toast.show')).toHaveCount(0,{timeout:10000});
  await shot(page,'desktop-composer-new-room-options.png');
  // Cancelling the review writes nothing and keeps the draft.
  await page.click('#send');
  let d=await review(page);await d.locator('[data-action="cancel"]').click();
  await expect(page.locator('#toast')).toContainText('the setting was not confirmed');
  assert.equal(await opfsConfig(page),original);
  await page.click('#send');d=await review(page);
  await expect(d.locator('[data-history-diff]')).toContainText('+ "room_history": {');
  await expect(d.locator('[data-history-diff]')).toContainText('"rooms/launch": {');
  const reviewed=await d.locator('[data-history-after]').textContent();
  await d.locator('[data-action="confirm"]').click();
  await expect(page.locator('#historyComposerNote')).toContainText('Not recorded by this viewer: record with boardctl history observe --scope rooms/launch --from human-owner-01');
  await expect(page.locator('#historyComposerNote')).toContainText('or post from the CLI');
  await exportBoard(page,f.proj);
  const raw=h.fs.readFileSync(configFile(f),'utf8'),cfg=JSON.parse(raw);
  assert.equal(raw,reviewed,'exactly the reviewed bytes');
  assert.deepEqual(cfg.message_signing.scopes['rooms/launch'],{minimum:'trusted'});
  assert.deepEqual(cfg.room_history,{version:1,scopes:{'rooms/launch':{record:'on-post'}}});
  const dir=h.path.join(f.proj,'.agent-board/rooms/launch'),files=h.fs.readdirSync(dir).filter(n=>n.endsWith('.txt'));
  assert.equal(files.length,1);
  assert.match(h.fs.readFileSync(h.path.join(dir,files[0]),'utf8'),/^SIGNATURE: /m,'the first message is signed');
  assert.equal(await page.evaluate(()=>B.signingContext.minimum('rooms/launch/x.txt','T001')),'trusted','the viewer now requires trusted signatures there');
  const status=cliStatus(f,'rooms/launch');
  assert.deepEqual(status.recording,{record:'on-post'});assert.equal(status.setUp,false,'the viewer recorded nothing');
  // The note stays until the destination changes.
  await page.selectOption('#cWhere','room:product');
  await expect(page.locator('#historyComposerNote')).toBeHidden();
  // The next signed CLI post records the whole room, including the viewer's message.
  cliTrust(f,owner);
  assert.match(cliPost(f,owner,'launch','T090','cli-follow-up'),/history: recorded rooms\/launch/);
  await refresh(f);await openRoom(page,'launch');
  await expect(page.locator('#historyOpen')).toContainText('2 of 2 available');
  // Composing into a recording room says before sending that this viewer cannot record.
  await page.selectOption('#cWhere','room:launch');
  await expect(page.locator('#historyComposerNote')).toContainText('rooms/launch records history automatically, but this viewer cannot record');
  // An existing room is refused and pointed at the room menu; nothing is written.
  const now=await opfsConfig(page);
  await h.startNewRoom(page);await page.fill('#cNewThread','Again');await page.fill('#cNewRoom','architecture');await openCreateOptions(page);await page.check('#cRecordHistory');await page.fill('#cBody','Not a new room');await page.click('#send');
  await expect(page.locator('#toast')).toContainText('Room architecture already has messages');
  await expect(page.locator('#toast')).toContainText('room menu');
  assert.equal(await opfsConfig(page),now);
  await expect(page.locator('#cBody')).toHaveValue('Not a new room');
});

test('AC3: a new topic declares only that topic, under the number the message is posted with',async t=>{
  const f=await boot(t),{page,owner}=f;
  await page.selectOption('#me',owner.participant);await approve(page,owner);await unlock(page,owner);
  // SPEC-002-064: the room view targets a new topic; after the post the composer re-follows that view and keeps the note.
  await page.locator('.fname[data-dir="product"]').click();await page.fill('#cNewThread','Signed topic');
  await expect(page.locator('#historyCreate')).toContainText('New topic settings');
  const tid=await page.evaluate(()=>nextThreadId());
  await openCreateOptions(page);await page.check('#cRecordHistory');await page.fill('#cBody','A recorded topic');await page.click('#send');
  const d=await review(page);await expect(d).toContainText(`rooms/product ${tid} will record room history`);
  await d.locator('[data-action="confirm"]').click();
  await expect(page.locator('#historyComposerNote')).toContainText('Not recorded by this viewer');
  await exportBoard(page,f.proj);
  const cfg=JSON.parse(h.fs.readFileSync(configFile(f),'utf8'));
  assert.deepEqual(cfg.room_history,{version:1,scopes:{'rooms/product':{threads:{[tid]:{record:'on-post'}}}}});
  assert.equal(cfg.message_signing,undefined,'only the ticked option is written');
  const posted=h.fs.readdirSync(h.path.join(f.proj,'.agent-board/rooms/product')).filter(n=>n.includes('_'+tid+'_'));
  assert.equal(posted.length,1,'the message uses the declared topic number');
  // Every viewer post into the recording topic says so, not only the composer's (here: a topic title).
  await page.click(`.tcard[data-tk='room:product|${tid}']`);
  await expect(page.locator('#toast.show')).toHaveCount(0,{timeout:10000});
  const posts=()=>page.evaluate(tid=>B.msgs.filter(m=>m.dir==='product'&&m.tid===tid).length,tid);
  assert.equal(await posts(),1);
  await h.renameTopic(page,'Recorded topic');
  await expect.poll(posts).toBe(2);
  await expect(page.locator('#toast')).toContainText(`Not recorded by this viewer: record with boardctl history observe --scope rooms/product --from ${owner.participant}`);
  await exportBoard(page,f.proj);
  assert.equal(h.fs.readdirSync(h.path.join(f.proj,'.agent-board/rooms/product')).filter(n=>n.includes('_'+tid+'_')).length,2,'the title message was posted');
  // A post into another topic of that room is not a recording scope: no note.
  const otherKey=await page.evaluate(tid=>[...document.querySelector('#cThread').options].map(o=>o.value).find(v=>v&&threadsOf()[v].tid!==tid),tid);
  await page.selectOption('#cThread',otherKey);
  const other=await page.evaluate(()=>threadsOf()[document.querySelector('#cThread').value].tid);
  assert.notEqual(other,tid);
  await expect(page.locator('#historyComposerNote')).toBeHidden();
});

test('AC5/AC6: the room menu changes an existing room with review, extra confirmation to weaken, and refuses a concurrent change or a busy CLI writer',async t=>{
  const f=await boot(t),{page}=f;
  const menu=async(kind='room',key='architecture')=>{await page.click(`[data-notification-menu="${kind}"][data-notification-key="${key}"]`);await page.click('#sidebarHistorySettings');const d=page.locator('#historySettingsDialog');await expect(d).toBeVisible();return d;};
  let d=await menu();
  await expect(d).toContainText('rooms/architecture');
  await d.locator('#historySettingRecord').check();await d.locator('[data-action="apply"]').click();
  let r=await review(page);
  await expect(r.locator('#historyWeakenConfirm')).toHaveCount(0);
  await r.locator('[data-action="confirm"]').click();
  await expect(d.locator('.history-settings-result')).toHaveText('Saved in config.json.');
  await d.locator('[data-action="close"]').click();
  await exportBoard(page,f.proj);
  assert.deepEqual(JSON.parse(h.fs.readFileSync(configFile(f),'utf8')).room_history,{version:1,scopes:{'rooms/architecture':{record:'on-post'}}});
  assert.deepEqual(cliStatus(f,'rooms/architecture').recording,{record:'on-post'},'the CLI reads what the viewer wrote');
  // A topic under a recording room cannot stop recording on its own.
  await page.locator('.folder').filter({has:page.locator('.fname[data-dir="architecture"]')}).locator('[data-closed]').click();
  d=await menu('thread','room:architecture|T001');
  await expect(d.locator('#historySettingRecord')).toBeChecked();await expect(d.locator('#historySettingRecord')).toBeDisabled();
  await expect(d).toContainText('The whole room records');
  await d.locator('[data-action="close"]').click();
  // Turning recording off is a weakening: the write stays disabled until it is confirmed.
  d=await menu();
  await d.locator('#historySettingRecord').uncheck();await d.locator('[data-action="apply"]').click();
  r=await review(page);
  await expect(r.locator('#historyWeakenConfirm')).toBeVisible();
  await expect(r).toContainText('Existing records and private checkpoints stay');
  await expect(r.locator('[data-action="confirm"]')).toBeDisabled();
  await r.locator('#historyWeakenConfirm').check();
  await expect(r.locator('[data-action="confirm"]')).toBeEnabled();
  await r.locator('[data-action="confirm"]').click();
  await expect(d.locator('.history-settings-result')).toHaveText('Saved in config.json.');
  assert.deepEqual(JSON.parse(await opfsConfig(page)).room_history,{version:1,scopes:{}});
  await d.locator('[data-action="close"]').click();
  // Requiring trusted signatures, then lowering it, mirrors `signing require` and `--weaken`.
  d=await menu();
  await d.locator('#historySettingRequire').check();await d.locator('[data-action="apply"]').click();
  r=await review(page);await r.locator('[data-action="confirm"]').click();
  await expect(d.locator('.history-settings-result')).toHaveText('Saved in config.json.');
  assert.deepEqual(JSON.parse(await opfsConfig(page)).message_signing.scopes['rooms/architecture'],{minimum:'trusted'});
  await d.locator('[data-action="close"]').click();
  await page.selectOption('#cWhere','room:architecture');
  await expect(notice(page)).toHaveAttribute('data-signing-status',/needs-|key-|not-registered/);
  d=await menu();
  await d.locator('#historySettingRequire').uncheck();await d.locator('[data-action="apply"]').click();
  r=await review(page);
  await expect(r).toContainText('Lowering a requirement lets unsigned messages in again');
  await expect(r.locator('[data-action="confirm"]')).toBeDisabled();
  await r.locator('[data-action="cancel"]').click();
  await expect(d.locator('.history-settings-result')).toHaveText('Not changed.');
  // A concurrent change between review and confirmation is refused and left alone.
  await d.locator('#historySettingRequire').check();await d.locator('#historySettingRecord').check();await d.locator('[data-action="apply"]').click();
  r=await review(page);
  const changed=(await opfsConfig(page)).replace('"time_zone"','"note": "edited elsewhere",\n  "time_zone"');
  await writeOpfsConfig(page,changed);
  await r.locator('[data-action="confirm"]').click();
  await expect(d.locator('.history-settings-result')).toContainText('config.json changed since you reviewed it; nothing was written');
  assert.equal(await opfsConfig(page),changed);
  // A CLI writer's lock is respected, never taken.
  await page.evaluate(async()=>{await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.agent-board')).getDirectoryHandle('.identity-write-lock',{create:true});});
  await page.evaluate(()=>readFromHandle(true));
  await d.locator('[data-action="apply"]').click();
  r=await review(page);await r.locator('[data-action="confirm"]').click();
  await expect(d.locator('.history-settings-result')).toContainText('Another board writer is busy');
  assert.equal(await opfsConfig(page),changed);
  assert.equal(await page.evaluate(async()=>{try{await (await (await navigator.storage.getDirectory()).getDirectoryHandle('.agent-board')).getDirectoryHandle('.identity-write-lock');return true;}catch{return false;}}),true,'the lock is left in place');
});

test('AC3/AC5: Polish at phone width keeps the composer options and the room settings readable',async t=>{
  const f=await boot(t),{page,owner}=f;
  await page.selectOption('#me',owner.participant);await approve(page,owner);
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  await page.setViewportSize({width:375,height:800});
  await h.startNewRoom(page,'Nowy pokój…');
  await page.fill('#cNewRoom','start');await page.fill('#cNewThread','Start');
  const box=page.locator('#historyCreate');
  await expect(box).toContainText('Ustawienia nowego pokoju');
  await expect(box).toContainText('Wymagaj zaufanych podpisów');await expect(box).toContainText('Automatycznie zapisuj historię pokoju');
  await openCreateOptions(page);await page.check('#cRequireTrusted');
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock');
  const fits=sel=>page.locator(sel).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;});
  assert.equal(await fits('#historyCreate'),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal page scroll');
  await page.locator('#historyCreate').scrollIntoViewIfNeeded();
  await shot(page,'phone-pl-composer-new-room.png');
  await page.click('#menu');
  await page.click('[data-notification-menu="room"][data-notification-key="architecture"]');
  await expect(page.locator('#sidebarHistorySettings')).toHaveText('Historia i podpisy pokoju…');
  await page.click('#sidebarHistorySettings');
  const d=page.locator('#historySettingsDialog');
  await expect(d).toContainText('Automatycznie zapisuj historię pokoju');
  assert.equal(await fits('#historySettingsDialog'),true);
  await d.locator('#historySettingRecord').check();await d.locator('[data-action="apply"]').click();
  const r=await review(page);
  await expect(r).toContainText('Sprawdź zmianę w config.json');
  assert.equal(await fits('#historyReviewDialog'),true);
  await shot(page,'phone-pl-review-config.png');
  await r.locator('[data-action="cancel"]').click();
  await shot(page,'phone-pl-room-settings.png');
});

test('SPEC-002-064: creation options follow the composer target, start unticked and reset on every target change',async t=>{
  const f=await boot(t),{page,owner}=f;
  await page.selectOption('#me',owner.participant);await approve(page,owner);
  const box=page.locator('#historyCreate');
  // A plain room view targets a new topic: the folded options appear, unticked.
  await page.locator('.fname[data-dir="architecture"]').click();
  await expect(box).toBeVisible();await expect(box).toContainText('New topic settings');
  assert.equal(await box.locator('.history-create-fold').evaluate(el=>el.open),false,'folded by default');
  await expect(page.locator('#cRecordHistory')).not.toBeChecked();
  assert.equal(await box.evaluate(el=>el.parentElement.id),'composerTargetFields','with the inline name fields, not in Advanced');
  await openCreateOptions(page);await page.check('#cRequireTrusted');await page.check('#cRecordHistory');
  await expect(notice(page)).toHaveAttribute('data-signing-status','needs-unlock');
  // Room A new topic -> room B new topic: a different destination, so the ticks are cleared and signing recomputed.
  const other=await page.evaluate(()=>B.rooms.find(r=>r!=='architecture'));
  await page.locator(`.fname[data-dir="${other}"]`).click();
  await expect(box).toBeVisible();await expect(page.locator('#cRequireTrusted')).not.toBeChecked();await expect(page.locator('#cRecordHistory')).not.toBeChecked();
  await expect(notice(page)).not.toHaveAttribute('data-signing-status','needs-unlock');
  // An existing topic hides them; "New topic here" brings them back; "New room…" switches to room settings.
  const topic=await page.evaluate(other=>Object.values(threadsOf()).find(x=>x.dir===other)?.key,other);
  if(topic){await page.evaluate(key=>setComposerTarget({scope:'room',dir:threadsOf()[key].dir,thread:key}),topic);await expect(box).toBeHidden();
    await h.openDestination(page);await page.locator('#composerTargetList button',{hasText:'New topic here…'}).click();await expect(box).toBeVisible();await expect(box).toContainText('New topic settings');}
  await openCreateOptions(page);await page.check('#cRecordHistory');
  await h.startNewRoom(page);
  await page.fill('#cNewRoom','fresh-room');await expect(box).toContainText('New room settings');await expect(page.locator('#cRecordHistory')).not.toBeChecked();
});
