'use strict';
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {expect} = require('playwright/test');
const h = require('./lib/helpers');
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

const native=require('./lib/signing-browser');
const {importBoard,exportBoard,openSigning,action,closeSigning,unlock,trust}=native;
const boot=t=>native.boot(t,browser,url);
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
  await unlock(f.page,f.owner);await expect(f.page.locator('#me')).toHaveValue(f.owner.participant);
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
  await openSigning(page);await page.locator('#signingParticipant').selectOption(f.peer.participant);
  await page.getByLabel('Independently verified fingerprint',{exact:true}).fill(f.peer.fingerprint+'wrong');await action(page,'Trust exact fingerprint');
  await expect(page.locator('#signing-review .signing-feedback')).toHaveText('Fingerprint does not match verified current profile');
  assert.equal((await decision(page,reply)).trust,'unfamiliar');
  await action(page,'Inspect current profile');await expect(page.locator('#signing-review')).toContainText(f.peer.fingerprint);
  await expect(page.locator(`[data-signing-participant="${f.peer.participant}"]`)).toContainText('Current key not approved by you');
  await trust(page,f.owner);await trust(page,f.peer);
  await expect(page.locator(`[data-signing-participant="${f.peer.participant}"]`)).toContainText('Current key trusted by you');
  await expect(page.locator(`[data-signing-participant="${f.peer.participant}"] code`)).toHaveText(f.peer.fingerprint);
  await action(page,'Adopt current policy floor');await closeSigning(page);
  for (const path of [root,reply]) {const result=await decision(page,path);assert.equal(result.signature,'valid');assert.equal(result.trust,'trusted');assert.equal(result.eligibility,'eligible');}
  await page.locator(`.tcard[data-tk="room:architecture|${thread}"]`).click();
  const signedMessage=page.locator(`article.msg[data-file="${h.path.basename(reply)}"]`);
  await expect(signedMessage.locator('[data-signing-state=signature-valid]')).toContainText('Signature verified');
  await expect(signedMessage.locator('[data-signing-state=key-trusted]')).toContainText('Signing key trusted by you');
  await signedMessage.locator('.signing-facts summary').click();
  await expect(signedMessage.locator('.signing-facts')).toContainText('neither proves the claims in the message are true');
  await page.locator(`article.msg[data-file="${h.path.basename(reply)}"] [data-reply]`).click();
  await page.fill('#cBody','Browser answers peer');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('');await exportBoard(page,f.proj);
  const response=h.fs.readdirSync(h.path.join(f.proj,'.agent-board/rooms/architecture')).find(name=>name.endsWith('_browser-answers-peer.txt'));
  const responsePath='.agent-board/rooms/architecture/'+response;
  assert.equal(inspect(f,responsePath).eligibility,'eligible');assert.equal(inspect(f,responsePath).trust,'trusted');
  assert.ok(h.fs.readFileSync(h.path.join(f.proj,responsePath),'utf8').includes('REPLY-TO: '+h.path.basename(reply)+'\n'));
  await page.reload();await h.openBoardViaUi(page);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  assert.equal((await decision(page,reply)).eligibility,'eligible');
  await openSigning(page);await expect(page.locator('#signingMode')).toContainText('Unsigned mode');assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);await closeSigning(page);
});

test('native lifecycle: dual rotation, new-key trust, compromise and persisted anti-stripping decisions',async t=>{
  const f=await boot(t),{page}=f,root=await postBrowser(f);
  requireSigning(f);cliTrust(f,f.owner);f.cli('signing','adopt');await refresh(f);
  await openSigning(page);await trust(page,f.owner);await action(page,'Adopt current policy floor');await closeSigning(page);
  assert.equal((await decision(page,root)).eligibility,'eligible');
  const rotated=f.rotate();assert.notEqual(rotated.fingerprint,f.owner.fingerprint);await refresh(f);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[]);
  const old=await decision(page,root);assert.equal(old.lifecycle,'superseded');assert.equal(old.eligibility,'excluded');
  await openSigning(page);await page.locator('#signingParticipant').selectOption(f.owner.participant);await expect(page.locator(`[data-signing-participant="${f.owner.participant}"]`)).toContainText('Key changed — review needed');await closeSigning(page);
  const thread=h.fs.readFileSync(h.path.join(f.proj,root),'utf8').match(/^THREAD: (T\d+)/m)[1];
  await page.selectOption('#cThread',`room:architecture|${thread}`);
  await page.fill('#cBody','Old capability cannot publish');await page.click('#send');await expect(page.locator('#cBody')).toHaveValue('Old capability cannot publish');await expect(page.locator('#toast')).toHaveText("Rotated owner's signing key was replaced (rotated), so the key unlocked in this tab no longer matches the board. Unlock the new private key. Messages signed with the old key stay blocked in required rooms.");await assertNotPublished(page,'Old capability cannot publish');
  const proofArgs=['post','--from',rotated.participant,'--to','all','--scope','room','--room','architecture','--thread',thread,'--slug','rotated-proof','--body','Rotated key proof','--signing-key-file',rotated.key];
  assert.match(f.reject(...proofArgs),/requires a deliberately trusted current signer/);cliTrust(f,rotated);
  const proof=f.cli(...proofArgs);
  await refresh(f);assert.equal((await decision(page,proof)).trust,'unfamiliar');assert.equal((await decision(page,proof)).eligibility,'excluded');
  await openSigning(page);await trust(page,rotated);await closeSigning(page);
  assert.equal((await decision(page,proof)).eligibility,'eligible');assert.equal(inspect(f,proof).eligibility,'eligible');
  // Trust and possession are separate gates: trusting the new key cannot unlock it.
  await page.click('#send');await expect(page.locator('#toast')).toHaveText("Rotated owner's signing key was replaced (rotated), so the key unlocked in this tab no longer matches the board. Unlock the new private key. Messages signed with the old key stay blocked in required rooms.");
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
  await expect(article.locator('[data-signing-state=key-compromised]')).toContainText('Signing key compromised');
  await expect(article.locator('[data-signing-state=blocked]')).toContainText('Blocked by signing rules');
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

test('first acceptance is inside the signed native answer; exclusion blocks it without promoting history',async t=>{
 const f=await boot(t),{page}=f;cliTrust(f,f.peer);cliTrust(f,f.owner);requireSigning(f);
 const definition=h.path.join(f.tmp,'acceptance-question.json');h.fs.writeFileSync(definition,JSON.stringify({id:'decision',type:'single',prompt:'Choose first',options:[{id:'ship',label:'Ship'},{id:'hold',label:'Hold'}]}));
 const q=f.cli('post','--from',f.peer.participant,'--to',f.owner.participant,'--scope','room','--room','architecture','--thread','T080','--slug','acceptance-question','--question-file',definition,'--body','Readable signed question.','--signing-key-file',f.peer.key);
 await refresh(f);await openSigning(page);await trust(page,f.peer);await trust(page,f.owner);await closeSigning(page);await unlock(page,f.owner);
 await page.locator('.fname').filter({hasText:'architecture'}).click();const article=page.locator(`article[data-file="${h.path.basename(q)}"]`);
 await article.locator('input[value=ship]').check();await article.locator('[type=submit]').click();await expect(article.locator('[data-answer-status=accepted]')).toBeVisible();
 await exportBoard(page,f.proj);const room=h.path.join(f.proj,'.agent-board/rooms/architecture'),answerName=h.fs.readdirSync(room).find(name=>name.includes('_answer-decision.txt'));assert.ok(answerName);
 const raw=h.fs.readFileSync(h.path.join(room,answerName),'utf8');assert.match(raw,/^ANSWER-STATE:/m);assert.equal(inspect(f,'.agent-board/rooms/architecture/'+answerName).signature,'valid');
 const acceptance=JSON.parse(f.cli('answers','inspect','--question',q.replace(/^\.agent-board\//,'')));assert.equal(acceptance.status,'accepted');assert.equal(acceptance.winner.file,answerName);
 const history=h.path.join(f.tmp,'history-answer.json');h.fs.writeFileSync(history,'{"question":"decision","selected":["hold"]}');f.cli('post','--from',f.peer.participant,'--to',f.owner.participant,'--scope','room','--room','architecture','--thread','T080','--slug','history','--reply-to',h.path.basename(q),'--answer-file',history,'--body','Later history.','--signing-key-file',f.peer.key);
 await refresh(f);await expect(article.locator('.canonical-answer')).toContainText('Ship');
 await openSigning(page);await page.locator('#signingParticipant').selectOption(f.owner.participant);await action(page,'Remove trust');await closeSigning(page);
 await expect(article.locator('[data-answer-status=blocked]')).toBeVisible();assert.equal(await article.locator('[data-answer-status=accepted]').count(),0);
});

test('verifying older signed evidence immediately refreshes the accepted-answer component',async t=>{
 const f=await boot(t),{page}=f;cliTrust(f,f.peer);cliTrust(f,f.owner);requireSigning(f);
 const question=h.path.join(f.tmp,'old-question.json'),answer=h.path.join(f.tmp,'old-answer.json');h.fs.writeFileSync(question,JSON.stringify({id:'old-decision',type:'single',prompt:'Choose old evidence',options:[{id:'ship',label:'Ship'},{id:'hold',label:'Hold'}]}));h.fs.writeFileSync(answer,'{"question":"old-decision","selected":["ship"]}');
 const common=['--scope','room','--room','architecture','--thread','T081','--body','Readable old evidence.'];
 const source=f.cli('post',...common,'--from',f.peer.participant,'--to',f.owner.participant,'--slug','old-question','--question-file',question,'--signing-key-file',f.peer.key);
 f.cli('post',...common,'--from',f.owner.participant,'--to',f.peer.participant,'--slug','old-answer','--reply-to',h.path.basename(source),'--answer-file',answer,'--signing-key-file',f.owner.key);
 const dir=h.path.join(f.proj,'.agent-board/rooms/architecture');for(let i=0;i<201;i++)h.fs.writeFileSync(h.path.join(dir,`2099-01-01_0000_${f.peer.participant}_T090_filler-${i}.txt`),`FROM: ${f.peer.participant}\nTO: all\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T090-fillers\nDATE: 2099-01-01 00:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nSynthetic later evidence ${i}.\n`);
 await refresh(f);await openSigning(page);await trust(page,f.peer);await trust(page,f.owner);
 const path=source.replace(/^\.agent-board\//,'');assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,path),'pending-verification');
 await action(page,'Verify older messages');assert.equal(await page.evaluate(path=>B.byPath.get(path).acceptance.status,path),'accepted');await closeSigning(page);
 await page.locator('.tcard[data-tk="room:architecture|T081"]').click();await expect(page.locator('article').filter({has:page.locator('[data-answer-status=accepted]')})).toContainText('Ship');
});


test('unsigned messages and current-key approval are readable on a phone in both languages',async t=>{
  const {page,owner}=await boot(t);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.signing-facts summary').filter({hasText:'Unsigned message'}).first()).toBeVisible();
  await openSigning(page);
  await page.locator('#signingParticipant').selectOption(owner.participant);
  await expect(page.locator(`[data-signing-participant="${owner.participant}"]`)).toContainText('Current key not approved by you');
  assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true,'fingerprints and explanation fit the dialog');
  await closeSigning(page);
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  await expect(page.locator('.signing-facts summary').filter({hasText:'Wiadomość bez podpisu'}).first()).toBeVisible();
  await openSigning(page);
  await page.locator('#signingParticipant').selectOption(owner.participant);
  await expect(page.locator(`[data-signing-participant="${owner.participant}"]`)).toContainText('Nie zatwierdzono bieżącego klucza');
  assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
});
