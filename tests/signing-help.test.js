'use strict';
// SPEC-002-058: the composer names the exact missing signing condition with one next step,
// and the Signing dialog explains how signing works with offline diagrams.
// SPEC-002-061: the composer row is the always-visible signing status of the persona in "I am".
const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {expect} = require('playwright/test');
const h = require('./lib/helpers');
const native = require('./lib/signing-browser');
const {importBoard,openSigning,action,closeSigning,unlock,trust} = native;

let browser, server, url;
before(async () => {
  browser = await h.launch();
  server = http.createServer((req,res) => {
    if (req.url !== '/board.html') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(fs.readFileSync(h.BOARD_HTML));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  url = `http://127.0.0.1:${server.address().port}/board.html`;
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
const boot = t => native.boot(t,browser,url);

function module(pl=false) {
  const c = vm.createContext({exText:(en,polish)=>pl?polish:en});
  vm.runInContext(fs.readFileSync(path.join(h.ROOT,'scripts/signing-help.js'),'utf8')+';this.api={signingBlockInfo,signingDiagnose,signingMessageBlock,signingDiagrams,signingDiagramSvg,signingStandaloneSvg,signingRequirementList,signingRequirementText,SIGNING_BLOCK_ORDER,signingComposerStatus,SIGNING_COMPOSER_ORDER};',c);
  return c.api;
}
function requireSigning(f) {
  const file = path.join(f.proj,'.agent-board/config.json'), cfg = JSON.parse(fs.readFileSync(file));
  cfg.message_signing = {version:1,minimum:'trusted'}; fs.writeFileSync(file,JSON.stringify(cfg));
}
async function refresh(f) { await importBoard(f.page,f.proj); await f.page.evaluate(()=>readFromHandle(true)); }
async function setting(page,id,value) { await page.click('#gear'); await page.selectOption(id,value); await page.click('#sClose'); }
const notice = page => page.locator('#signingNotice');
async function room(page) { await page.selectOption('#cWhere','room:architecture'); await page.selectOption('#cThread',''); await page.fill('#cNewThread','Signing help topic'); }
const button = page => notice(page).locator('.signing-notice-action');
async function expectStatus(page,status,label,text) {
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveAttribute('data-signing-status',status);
  await expect(button(page)).toHaveText(label);
  if (text) await expect(notice(page).locator('.signing-notice-text')).toContainText(text);
}
const personName = (page,id) => page.evaluate(id=>B.people[id].name,id);
const openerState = page => page.evaluate(() => ({
  open: document.querySelector('#signingDialog')?.open,
  focus: document.activeElement?.id || document.activeElement?.textContent?.slice(0,40),
  participant: document.querySelector('#signingParticipant')?.value
}));

test('every blocked reason has a specific EN and PL message, one next step and a place in the decision flow', () => {
  const en = module(), pl = module(true);
  assert.deepEqual(Array.from(en.SIGNING_BLOCK_ORDER), ['no-board-id','board-id-changed','state-conflict','signing-unavailable','read-only','not-registered','no-key','key-rotated','key-revoked','key-changed','key-not-approved']);
  const seen = new Set(), flat = svg => svg.replace(/<\/text><text[^>]*>/g,' ').replace(/<[^>]+>/g,''), flowEn = flat(en.signingDiagramSvg('why')), flowPl = flat(pl.signingDiagramSvg('why'));
  for (const id of en.SIGNING_BLOCK_ORDER) {
    const a = en.signingBlockInfo(id,{s:'maya',err:'boom',required:true}), b = pl.signingBlockInfo(id,{s:'maya',err:'boom',required:true});
    assert.ok(a.message.length > 40 && a.label && ['check','review','own','howto','folder'].includes(a.task),id);
    assert.notEqual(a.message,b.message,id); assert.notEqual(a.label,b.label,id);
    assert.ok(!seen.has(a.message),'messages are distinct: '+id); seen.add(a.message);
    assert.doesNotMatch(a.message,/undefined|\{|\}/);
    assert.doesNotMatch(b.message,/undefined|\{|\}/);
  }
  // The decision flow shows each fix that the composer can offer (the signing-state ones with their own row).
  for (const id of ['no-board-id','read-only','no-key','key-rotated','key-revoked','key-changed','key-not-approved']) {
    assert.ok(flowEn.includes(en.signingBlockInfo(id,{s:'you'}).short),'EN flow mentions '+id);
    assert.ok(flowPl.includes(pl.signingBlockInfo(id,{s:'Ty'}).short),'PL flow mentions '+id);
  }
});

test('diagnosis follows the order in which posting is actually checked', () => {
  const {signingDiagnose:d} = module(), base = {hasContext:true,writable:true,required:true,mode:'unsigned',catalog:[],participants:{},pins:{},known:{}};
  const id = state => d({...base,...state})?.id ?? null;
  assert.equal(id({error:'signing policy requires a board UUID'}),'no-board-id');
  assert.equal(id({error:'board UUID changed; local signing trust/floor retained'}),'board-id-changed');
  assert.equal(id({error:'Private signing context changed in another tab; refresh and review'}),'state-conflict');
  assert.equal(id({error:'private signing history budget'}),'signing-unavailable');
  assert.equal(id({hasContext:false}),null);
  assert.equal(id({required:false}),null,'optional signing never blocks an unsigned post');
  assert.equal(id({required:false,mode:'signed',writable:false}),'read-only');
  assert.equal(id({writable:false}),'read-only');
  assert.equal(id({viewer:'nadia',participants:{nadia:{unregistered:true}}}),'not-registered');
  assert.equal(id({}),'no-key');
  // The signer is the persona in "I am": another unlocked key never stands in for it.
  assert.equal(id({mode:'signed',viewer:'a',catalog:['b'],participants:{a:{fingerprint:'x'}}}),'no-key');
  assert.equal(id({mode:'signed',viewer:'a',catalog:['a','b'],pins:{a:'x'},participants:{a:{fingerprint:'x'}}}),null);
  assert.equal(id({mode:'signed',signer:'a',catalog:[],known:{a:'old'},participants:{a:{fingerprint:'new'}}}),'key-rotated');
  assert.equal(id({mode:'signed',signer:'a',catalog:[],known:{a:'old'},participants:{a:{fingerprint:'old',revoked:'retired'}}}),'key-revoked');
  assert.equal(id({mode:'signed',signer:'a',catalog:[],known:{},participants:{a:{fingerprint:'x'}}}),'no-key','expired or never unlocked');
  assert.equal(id({mode:'signed',signer:'a',catalog:['a'],participants:{a:{fingerprint:'x',revoked:'retired'}}}),'key-revoked');
  assert.equal(id({mode:'signed',signer:'a',catalog:['a'],participants:{a:{fingerprint:'x'}}}),'key-not-approved','your own key must be approved too');
  assert.equal(id({mode:'signed',signer:'a',catalog:['a'],pins:{a:'old'},participants:{a:{fingerprint:'x'}}}),'key-changed');
  assert.equal(id({mode:'signed',signer:'a',catalog:['a'],pins:{a:'x'},participants:{a:{fingerprint:'x'}}}),null);
  assert.equal(id({required:false,mode:'signed',signer:'a',catalog:['a'],participants:{a:{fingerprint:'x'}}}),null,'approval is only needed where the room requires it');
});

test('a message that cannot drive actions explains why and offers a next step', () => {
  const {signingMessageBlock:b} = module(), pl = module(true).signingMessageBlock;
  const cases = [
    [{signing:{eligibility:'pending-verification',reason:'Outside verification window; use Verify older messages'}},/older than the newest 200/,'check'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'valid',lifecycle:'compromised'}},/reported compromised/,'review'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'invalid'}},/does not match the message/,'howto'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'stripped'}},/signature was removed/,'howto'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'unsigned',reason:'trusted signature required'}},/unsigned, and this room requires trusted signatures/,'howto'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'valid',lifecycle:'superseded'}},/older key of maya/,'review'],
    [{author:'maya',signing:{eligibility:'excluded',signature:'valid',trust:'unfamiliar'}},/not approved the key of maya/,'review']
  ];
  for (const [message,pattern,task] of cases) {
    const r = b(message); assert.match(r.message,pattern); assert.equal(r.task,task); assert.ok(r.label);
    assert.notEqual(pl(message).message,r.message);
  }
});

test('committed documentation diagrams are generated from the same source as the in-app diagrams', () => {
  const api = module();
  for (const key of ['keys','sign','required','why']) {
    const file = path.join(h.ROOT,'docs/images/signing-help',`${key}.svg`);
    assert.equal(fs.readFileSync(file,'utf8'),api.signingStandaloneSvg(key)+'\n',`${key}.svg is current; run node scripts/build_signing_diagrams.js`);
    const svg = api.signingStandaloneSvg(key);
    assert.match(svg,/prefers-color-scheme:dark/);assert.match(svg,/<title id="sg-/);assert.doesNotMatch(svg,/<script|href=|https?:\/\/(?!www\.w3\.org)/);
  }
});

test('docs troubleshooting table repeats the in-app wording for every blocked reason', () => {
  const api = module(), doc = fs.readFileSync(path.join(h.ROOT,'docs/guides/signing.md'),'utf8').replace(/\u2019/g,"'").replace(/\s+/g,' ');
  for (const id of api.SIGNING_BLOCK_ORDER) {
    const info = api.signingBlockInfo(id,{s:'Maya',err:'the reason shown',required:true});
    assert.ok(doc.includes(info.message.replace(/\s+/g,' ')),`docs quote the message for ${id}`);
    assert.ok(doc.includes(info.label),`docs name the button for ${id}`);
  }
  for (const m of [{signing:{eligibility:'pending-verification',reason:'Outside verification window'}},{author:'Maya',signing:{eligibility:'excluded',signature:'unsigned'}},{author:'Maya',signing:{eligibility:'excluded',signature:'invalid'}},{author:'Maya',signing:{eligibility:'excluded',signature:'valid',trust:'unfamiliar'}}]) {
    const block = api.signingMessageBlock(m);
    assert.ok(doc.includes(block.message),'docs quote: '+block.message); assert.ok(doc.includes(block.label),block.label);
  }
  for (const key of ['keys','sign','required','why']) assert.ok(doc.includes(`../images/signing-help/${key}.svg`),key);
  assert.match(doc,/requires a deliberately trusted current signer/);
  assert.match(doc,/boardctl identity enable/);
});

test('docs list every composer status with its in-app label and button', () => {
  const api = module(), doc = fs.readFileSync(path.join(h.ROOT,'docs/guides/signing.md'),'utf8').replace(/\u2019/g,"'").replace(/\s+/g,' ');
  const base = over => ({hasContext:true,writable:true,required:false,mode:'unsigned',persona:'maya',name:'Maya',catalog:[],known:{},participants:{maya:{fingerprint:'fp'}},pins:{},...over});
  const cases = [base({error:'boom'}),base({writable:false,required:true}),base({required:true,participants:{maya:{unregistered:true}}}),base({required:true,catalog:['maya'],participants:{maya:{fingerprint:'fp',revoked:{}}}}),
    base({mode:'signed',known:{maya:'old'}}),base({required:true}),base({required:true,mode:'signed',catalog:['maya']}),base({mode:'signed',catalog:['maya']}),base()];
  assert.deepEqual(cases.map(c=>api.signingComposerStatus(c).id),Array.from(api.SIGNING_COMPOSER_ORDER));
  for (const status of cases.map(c=>api.signingComposerStatus(c))) {
    assert.ok(doc.includes(`${status.emoji} ${status.label}`),'docs show the status '+status.id);
    if (status.action) assert.ok(doc.includes(status.action.label),'docs name the button for '+status.id);
  }
  assert.doesNotMatch(doc,/Choose who to sign as|Viewing as/);
});

test('Nadia: a required room walks from a locked key to a successful signed post, one named step at a time', async t => {
  const f = await boot(t), {page} = f, nadia = await personName(page,f.owner.participant);
  requireSigning(f); await refresh(f); await room(page);
  await expectStatus(page,'needs-unlock',`🔒 Unlock ${nadia}'s key`,`This destination requires trusted signatures, and ${nadia}'s key is locked in this tab.`);
  const before = await page.evaluate(()=>B.msgs.length);
  await page.fill('#cBody','Hello from Nadia'); await page.click('#send');
  await expect(page.locator('#toast')).toContainText(`${nadia}'s key is locked in this tab`);
  assert.equal(await page.inputValue('#cBody'),'Hello from Nadia'); assert.equal(await page.evaluate(()=>B.msgs.length),before);
  // The button opens the key-file picker directly; the key binds to the persona in one step.
  const chooser = page.waitForEvent('filechooser'); await button(page).click(); await (await chooser).setFiles(f.owner.key);
  await expectStatus(page,'needs-approval','🔓 Approve the key',`${nadia}'s key is not approved on this device yet. Even your own key is approved once here`);
  await button(page).click();
  assert.deepEqual(await openerState(page),{open:true,focus:'signingFingerprint',participant:f.owner.participant});
  await page.fill('#signingFingerprint',f.owner.fingerprint); await action(page,'Trust exact fingerprint');
  await closeSigning(page);
  await expectStatus(page,'signed','🔒 Lock key','Your key is unlocked and approved for this destination.');
  await page.click('#send'); await expect(page.locator('#cBody')).toHaveValue('');
});

test('Kai: rotation, a needed re-approval and a revocation each name the exact cause', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f); await refresh(f); await room(page);
  await unlock(page,f.owner); await openSigning(page); await trust(page,f.owner); await closeSigning(page);
  await expect(notice(page)).toHaveAttribute('data-signing-status','signed');
  const rotated = f.rotate(); await refresh(f);
  const kai = await personName(page,f.owner.participant);
  await expectStatus(page,'key-rotated','🔒 Unlock the new key',`${kai}'s signing key was replaced (rotated)`);
  await page.fill('#cBody','Agent post after rotation'); await page.click('#send');
  await expect(page.locator('#toast')).toContainText('signing key was replaced (rotated)');
  await unlock(page,rotated);
  await expectStatus(page,'needs-approval','🔓 Approve the new key','You approved an earlier key');
  await openSigning(page); await trust(page,rotated); await closeSigning(page); await expect(notice(page)).toHaveAttribute('data-signing-status','signed');
  f.cli('signing','revoke','--participant',rotated.participant,'--key-file',rotated.key,'--expect-profile',rotated.profile,'--status','compromised');
  await refresh(f);
  await expectStatus(page,'key-revoked','Review the key','is revoked or retired and cannot sign new messages');
  await button(page).click();
  assert.deepEqual(await openerState(page),{open:true,focus:'signingFingerprint',participant:rotated.participant});
});

test('Marta: a required policy without a board UUID is named, and the button shows the owner steps', async t => {
  const strip = f => {
    const file = path.join(f.proj,'.agent-board/config.json'), cfg = JSON.parse(fs.readFileSync(file));
    delete cfg.identity; cfg.message_signing = {version:1,minimum:'trusted'}; fs.writeFileSync(file,JSON.stringify(cfg));
  };
  const f = await native.boot(t,browser,url,strip), {page} = f;
  await room(page);
  await expectStatus(page,'unavailable','Show the board owner steps','has no identity UUID');
  await button(page).click();
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signing-setup-owner');
  await expect(page.locator('#signing-setup-owner')).toBeInViewport();
  await closeSigning(page);
});

test('removing the UUID of a board you already opened is reported as a changed identity', async t => {
  const f = await boot(t), {page} = f, file = path.join(f.proj,'.agent-board/config.json');
  const cfg = JSON.parse(fs.readFileSync(file)); delete cfg.identity; cfg.message_signing = {version:1,minimum:'trusted'}; fs.writeFileSync(file,JSON.stringify(cfg));
  await refresh(f); await room(page);
  await expectStatus(page,'unavailable','Show the board owner steps','identity UUID changed or was removed');
});

test('read-only upload in a required room offers the writable folder', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f);
  await page.reload(); await page.setInputFiles('#fallback',f.proj); await expect(page.locator('#me')).toBeVisible();
  await room(page);
  await expectStatus(page,'read-only','Open the writable folder','this board is open read-only');
  await button(page).click();
  await expect(page.locator('#locationsDialog')).toBeVisible();
});

test('a viewer identity with no registered key is told to ask the board owner', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f); await refresh(f); await room(page);
  const nobody = await page.evaluate(()=>Object.entries(B.signingParticipants).find(([,v])=>v.unregistered)?.[0]);
  assert.ok(nobody,'fixture has a participant without a registered key');
  await page.selectOption('#me',nobody);
  await expectStatus(page,'not-registered','How to get a key','has no signing key registered on this board');
  await button(page).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signing-setup-you');
});

test('unavailable signing and tab conflicts are classified, not shown as raw failures', async t => {
  const {page} = await boot(t);
  for (const [error,reason,text] of [['Private signing context changed in another tab; refresh and review','state-conflict','another tab changed your local signing records'],['private signing history budget','signing-unavailable','signing could not be checked for this board (private signing history budget)']]) {
    await page.evaluate(error=>{B.signingError=error;updateSigningNotice();},error);
    await expectStatus(page,'unavailable',reason==='state-conflict'?'Open Signing and check':'Open Signing',text);
  }
});

test('received messages that cannot drive actions say why and link to the matching help', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f); await refresh(f);
  await page.evaluate(()=>{signingInspect=true;build({background:true,preserveComposer:true});});
  const block = page.locator('#feed .signing-exclusion').first();
  await expect(block).toContainText('Blocked: this message is unsigned, and this room requires trusted signatures.');
  await block.locator('button').click();
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',true);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'signing-fig-required');
});

test('the composer status keeps its button during refresh ticks and returns focus after the dialog closes', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f); await refresh(f); await room(page);
  const nobody = await page.evaluate(()=>Object.entries(B.signingParticipants).find(([,v])=>v.unregistered)?.[0]);
  await page.selectOption('#me',nobody); await expect(notice(page)).toHaveAttribute('data-signing-status','not-registered');
  await button(page).focus();
  await page.evaluate(()=>{window.__noticeButton=document.querySelector('#signingNotice .signing-notice-action');});
  await page.evaluate(async()=>{await readFromHandle(true);build({background:true,preserveComposer:true});updateComposerInfo();signingTick();});
  assert.equal(await page.evaluate(()=>window.__noticeButton.isConnected&&document.activeElement===window.__noticeButton),true,'refresh must not rebuild the focused button');
  await page.keyboard.press('Enter');
  await expect(page.locator('#signingDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#signingDialog')).not.toBeVisible();
  assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#signingNotice .signing-notice-action')),true,'focus returns to the status button');
});

test('the status fits a phone, in Polish, with a long message', async t => {
  const f = await boot(t), {page} = f;
  requireSigning(f); await refresh(f); await room(page);
  await setting(page,'#sLang','pl'); await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{signingMode='signed';updateSigningNotice();});
  assert.equal(await notice(page).getAttribute('data-signing-status'),'needs-unlock');
  const geometry = await page.evaluate(()=>{const n=document.querySelector('#signingNotice'),b=n.querySelector('.signing-notice-action').getBoundingClientRect(),r=n.getBoundingClientRect();return {over:document.documentElement.scrollWidth>innerWidth,inside:b.left>=r.left-1&&b.right<=r.right+1&&r.right<=innerWidth+1&&r.left>=0,text:n.querySelector('.signing-notice-text').textContent};});
  assert.deepEqual([geometry.over,geometry.inside],[false,true]);
  assert.match(geometry.text,/Ten cel wymaga zaufanych podpisów, a klucz \(.+\) jest zablokowany w tej karcie/);
});

async function helpOpen(page) {
  await openSigning(page);
  await page.locator('[data-signing-task="howto"]').click();
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',true);
}
async function figuresFit(page) {
  return page.locator('#signing-howto svg.signing-diagram').evaluateAll(svgs => svgs.map(svg => {
    const view = svg.viewBox.baseVal, rects = [...svg.querySelectorAll('rect')].map(r => ({x:r.x.baseVal.value,y:r.y.baseVal.value,w:r.width.baseVal.value,h:r.height.baseVal.value}));
    const stray = [];
    for (const text of svg.querySelectorAll('text')) {
      const b = text.getBBox(), cls = text.getAttribute('class') || '';
      if (b.x < 0 || b.x + b.width > view.width + .5 || b.y < 0 || b.y + b.height > view.height + .5) stray.push('outside:' + text.textContent);
      const box = rects.find(r => b.y >= r.y - 1 && b.y + b.height <= r.y + r.h + 1 && b.x >= r.x - 1 && b.x < r.x + r.w);
      if (box && b.x + b.width > box.x + box.w - 3 && !/sg-head|sg-n/.test(cls)) stray.push('overflow:' + text.textContent);
    }
    return {id:svg.getAttribute('aria-labelledby'),stray,texts:svg.querySelectorAll('text').length,title:svg.querySelector('title').textContent.length > 5,desc:svg.querySelector('desc').textContent.length > 5,width:Math.round(svg.getBoundingClientRect().width)};
  }));
}
for (const [lang,width] of [['en',1280],['en',390],['pl',1280],['pl',390]]) {
  test(`"How signing works" opens with four offline diagrams that fit: ${lang} at ${width}px`, async t => {
    const f = await boot(t), {page} = f, requests = [];
    page.on('request', r => { // The viewer's own daily update check is unrelated to the help; anything else would be new.
      if (!/^(data|blob|about):/.test(r.url()) && r.url() !== url && !/^https:\/\/api\.github\.com\/repos\/sloik\/agent-file-board-ui\/releases\/latest$/.test(r.url())) requests.push(r.url()); });
    if (lang === 'pl') await setting(page,'#sLang','pl');
    await page.setViewportSize({width,height:844}); requests.length = 0; await helpOpen(page);
    const fits = await figuresFit(page);
    assert.equal(fits.length,4);
    for (const fit of fits) { assert.deepEqual(fit.stray,[],fit.id); assert.ok(fit.texts >= 5 && fit.title && fit.desc); assert.ok(fit.width <= Math.min(width,560)); }
    const overflow = await page.locator('#signingDialog').evaluate(d => d.scrollWidth > d.clientWidth);
    assert.equal(overflow,false);
    await expect(page.locator('#signing-howto h4').first()).toBeVisible();
    const headings = await page.locator('#signing-howto figure h4').allTextContents();
    assert.deepEqual(headings, lang === 'en'
      ? ["Your own key versus approving someone else's key",'What happens when you sign, and when others check','Why a required room refuses some messages',"Why can't I post?"]
      : ['Własny klucz a zatwierdzanie cudzego klucza','Co dzieje się przy podpisywaniu i sprawdzaniu','Dlaczego pokój z wymogiem odrzuca część wiadomości','Dlaczego nie mogę wysłać wiadomości?']);
    assert.deepEqual(requests,[],'help makes no network requests');
  });
}

test('diagrams follow light, dark and dracula themes with readable contrast', async t => {
  const f = await boot(t), {page} = f, seen = {};
  const luminance = rgb => { const [r,g,b] = rgb.match(/\d+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const contrast = (a,b) => { const [x,y] = [luminance(a),luminance(b)].sort((p,q) => q - p); return (x + .05) / (y + .05); };
  for (const theme of ['light','dark','dracula']) {
    await setting(page,'#sTheme',theme); await page.setViewportSize({width:390,height:844}); await helpOpen(page);
    const colors = await page.evaluate(() => {
      const out = {};
      for (const cls of ['sg-box','sg-ok','sg-warn']) {
        const rect = document.querySelector('#signing-howto svg rect.' + cls + (cls === 'sg-box' ? ':not(.sg-ok):not(.sg-warn):not(.sg-secret)' : '')), text = rect.nextElementSibling;
        out[cls] = {fill:getComputedStyle(rect).fill,ink:getComputedStyle(text).fill};
      }
      out.page = getComputedStyle(document.querySelector('#signingDialog')).backgroundColor;
      return out;
    });
    seen[theme] = colors;
    for (const cls of ['sg-box','sg-ok','sg-warn']) assert.ok(contrast(colors[cls].fill,colors[cls].ink) >= 4.5,`${theme} ${cls} text contrast ${JSON.stringify(colors[cls])}`);
    assert.ok((await figuresFit(page)).every(x => x.stray.length === 0));
    await closeSigning(page);
  }
  assert.notEqual(seen.light['sg-box'].fill,seen.dark['sg-box'].fill);
  assert.notEqual(seen.light['sg-box'].ink,seen.dark['sg-box'].ink);
});

test('help copy: each task says why, where things are stored and what is safe to share; the help is keyboard reachable', async t => {
  const {page} = await boot(t);
  await openSigning(page);
  for (const id of ['check','review','own']) {
    const plain = page.locator(`#signing-${id} .signing-plain`);
    await expect(plain).toContainText('Why'); await expect(plain).toContainText('Stored'); await expect(plain).toContainText('Safe to share');
  }
  await expect(page.locator('#signing-own .signing-plain')).toContainText('never saved, uploaded or put in the board folder');
  await expect(page.locator('#signing-review .signing-plain')).toContainText('not written to the board and not sent to anyone');
  // Keyboard: the help summary opens with Enter and Escape still closes the dialog.
  await page.locator('[data-signing-task="howto"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');
  await page.keyboard.press('Enter');
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',false);
  await page.keyboard.press('Space');
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',true);
  await page.keyboard.press('Escape'); await expect(page.locator('#signingDialog')).not.toBeVisible();
});

test('requirements are listed, the guide opens offline, and disabled controls say why', async t => {
  const f = await boot(t), {page} = f;
  const api = module();
  assert.equal(api.signingRequirementText(api.signingRequirementList([{minimum:'optional',scopes:{'rooms/release':{minimum:'trusted',threads:{T002:{minimum:'trusted'}}}}}])),'Trusted signatures are required in: rooms/release, rooms/release / T002.');
  const cfgFile = path.join(f.proj,'.agent-board/config.json'), cfg = JSON.parse(fs.readFileSync(cfgFile));
  cfg.message_signing = {version:1,minimum:'optional',scopes:{'rooms/architecture':{minimum:'trusted'}}}; fs.writeFileSync(cfgFile,JSON.stringify(cfg));
  await refresh(f); await room(page);
  await expect(page.locator('#signingRequires')).toHaveText('This destination requires trusted signatures.');
  await page.selectOption('#cWhere',{index:0}); // another destination may not require it
  await openSigning(page);
  await expect(page.locator('#signingRequirements')).toHaveText('Trusted signatures are required in: rooms/architecture.');
  assert.equal(await page.locator('#signingDialog a[href^="http"]').count(),0,'no external link in the signing dialog');
  await page.locator('#signingDialog [data-action="guide"]').click();
  await expect(page.locator('#signing-howto')).toHaveJSProperty('open',true);
  await closeSigning(page);
  // Read-only: Unlock is off and says so; the advice is the writable folder, never "unlock".
  await page.evaluate(()=>{});
  await page.reload(); await page.setInputFiles('#fallback',f.proj); await expect(page.locator('#me')).toBeVisible();
  await openSigning(page);
  await expect(page.locator('#signingUnlockNote')).toContainText('Unlock is off because this folder is read-only');
  await expect(page.locator('#signingDialog [data-action="unlock"]')).toBeDisabled();
  await closeSigning(page);
  // An excluded message explains the disabled Reply.
  await page.evaluate(()=>{signingInspect=true;build({background:true,preserveComposer:true});});
  const reply = page.locator('#feed button[data-reply][disabled]').first();
  assert.ok(await reply.count() > 0, 'fixture has an excluded message with a disabled Reply');
  await expect(reply).toHaveAttribute('title',/Blocked|Not checked/);
});
