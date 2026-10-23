'use strict';
// SPEC-002-069: keys waiting for approval are counted on Signing and on the closed Tools menu, the review
// list names each key's state, a first-open notice leads to the review, and the sidebar has clearer controls.
// Approval itself stays the existing review flow with the pasted, independently confirmed fingerprint.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
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
// The fixture registers human-owner-01 and research-agent-01; implementation-agent-01 is in the registry without a key.
const third=f=>{f.third=f.register('implementation-agent-01');};
const boot=(t,prepare)=>native.boot(t,browser,url,prepare);
async function refresh(f){await importBoard(f.page,f.proj);await f.page.evaluate(()=>readFromHandle(true));}
async function reopen(page){await page.reload();await h.openBoardViaUi(page);}
const choose=(page,id,value)=>page.evaluate(([id,value])=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);
const pending=page=>page.evaluate(()=>signingPendingReview(B));
const badge=page=>page.locator('#signingTools .key-badge');
const notice=page=>page.locator('#keyNotice');
// AC1's observable count; a short timeout so the non-vacuity mutation fails quickly.
async function counted(page,n,{lang='en'}={}){
  const timeout=2000;
  if(!n){
    await expect(badge(page)).toBeHidden({timeout});
    assert.equal(await page.locator('#toolbarToolsToggle').getAttribute('data-pending-keys'),null,'no dot');
    await expect(page.locator('#toolbarToolsToggle')).toHaveAttribute('title',lang==='pl'?'Narzędzia':'Tools',{timeout});
    await expect(page.locator('#reviewKeysTool')).toBeHidden({timeout});
    return;
  }
  const label=lang==='pl'?`${n} ${n===1?'klucz':n<5?'klucze':'kluczy'} do sprawdzenia`:`${n} ${n===1?'key':'keys'} to review`;
  await expect(page.locator('#toolbarToolsToggle')).toHaveAttribute('data-pending-keys',String(n),{timeout});
  await expect(page.locator('#toolbarToolsToggle')).toHaveAttribute('title',(lang==='pl'?'Narzędzia':'Tools')+' - '+label,{timeout});
  await expect(badge(page)).toHaveAttribute('title',label,{timeout});
  await expect(page.locator('#signingTools .key-badge-count')).toHaveText(String(n),{timeout});
  await expect(page.locator('#reviewKeysTool')).toHaveText('🔑 '+(lang==='pl'?`Sprawdź klucze (${n})`:`Review keys (${n})`),{timeout});
  // The closed menu still shows it: the dot is drawn on the summary itself.
  if(!await page.locator('#toolbarTools').evaluate(el=>el.open)){
    const dot=await page.locator('#toolbarToolsToggle').evaluate(el=>{const s=getComputedStyle(el,'::before');return [s.content,s.position,parseFloat(s.width)];});
    assert.deepEqual(dot,['""','absolute',7],'dot on the closed Tools toggle');
  }
}
async function approve(page,identity){await openSigning(page);await trust(page,identity);await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');await closeSigning(page);}
const header=page=>page.evaluate(()=>{const top=document.querySelector('.top').getBoundingClientRect(),items=[...document.querySelectorAll('.top>*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).position!=='absolute';}).map(el=>el.getBoundingClientRect()),first=Math.min(...items.map(r=>r.bottom));return {height:top.height,rows:items.some(r=>r.top>=first)};});

test('AC1: three unapproved keys read 3 on Signing and on the closed Tools menu, then 2, then none, in English and Polish',async t=>{
  const f=await boot(t,third),{page}=f;
  await counted(page,3);
  await choose(page,'#sLang','pl');await counted(page,3,{lang:'pl'});await choose(page,'#sLang','en');
  await approve(page,f.owner);await counted(page,2);
  await choose(page,'#sLang','pl');await counted(page,2,{lang:'pl'});await choose(page,'#sLang','en');
  await approve(page,f.peer);await counted(page,1);
  await choose(page,'#sLang','pl');await counted(page,1,{lang:'pl'});await choose(page,'#sLang','en');
  await approve(page,f.third);await counted(page,0);await expect(notice(page)).toBeHidden();
  await choose(page,'#sLang','pl');await counted(page,0,{lang:'pl'});
  // Polish plural forms beyond what one board shows: 5, 12-14 and 22-24 included.
  assert.deepEqual(await page.evaluate(()=>[1,2,4,5,12,14,21,22,25].map(signingKeysToReview)),
    ['1 klucz do sprawdzenia','2 klucze do sprawdzenia','4 klucze do sprawdzenia','5 kluczy do sprawdzenia','12 kluczy do sprawdzenia','14 kluczy do sprawdzenia','21 kluczy do sprawdzenia','22 klucze do sprawdzenia','25 kluczy do sprawdzenia']);
  assert.deepEqual(await page.evaluate(()=>[1,2,5].map(n=>signingCount(n,'1 participant key is not approved on this device.',n+' participant keys are not approved on this device.','1 klucz uczestnika nie jest zatwierdzony na tym urządzeniu.',n+' klucze uczestników nie są zatwierdzone na tym urządzeniu.',n+' kluczy uczestników nie jest zatwierdzonych na tym urządzeniu.'))),
    ['1 klucz uczestnika nie jest zatwierdzony na tym urządzeniu.','2 klucze uczestników nie są zatwierdzone na tym urządzeniu.','5 kluczy uczestników nie jest zatwierdzonych na tym urządzeniu.']);
});

test('AC2: revoked, unregistered and error states are not counted; a changed key is counted and sorted first',async t=>{
  const f=await boot(t),{page}=f;
  // The pure helper on every state at once.
  assert.deepEqual(await page.evaluate(()=>signingPendingReview({people:{a:{name:'Zed'},x:{name:'Alice'},e:{name:'Mallory'}},
    signingParticipants:{a:{fingerprint:'fa'},x:{fingerprint:'fx'},b:{fingerprint:'fb',revoked:{reason:'lost'}},c:{unregistered:true},d:{error:'unreadable profile'},e:{fingerprint:'fe2'},z:{fingerprint:'fz'}},
    signingContext:{state:{pins:{e:'fe1',z:'fz'}}}})),['e','x','a']);
  // The same on a real board: approve the owner, rotate the owner's key, refresh.
  await approve(page,f.owner);assert.deepEqual(await pending(page),[f.peer.participant]);
  f.rotate();await refresh(f);
  await expect.poll(()=>pending(page)).toEqual([f.owner.participant,f.peer.participant]);
  assert.equal(await page.evaluate(id=>B.signingParticipants[id].changed,f.owner.participant),true);
  assert.equal(await page.evaluate(()=>B.signingParticipants['implementation-agent-01'].unregistered),true,'the unregistered participant is not counted');
  await counted(page,2);
  const names=await page.evaluate(()=>Object.fromEntries(Object.entries(B.people).map(([id,p])=>[id,p.name||id])));
  await openSigning(page);
  const options=await page.locator('#signingParticipant option').allTextContents();
  assert.equal(options[0],`${names[f.owner.participant]} (${f.owner.participant}) - key changed`);
  assert.equal(options[2],`${names['implementation-agent-01']} (implementation-agent-01) - no key`);
});

test('AC3: the review list names each state, puts keys needing review first; Signing opens as before and "Review keys (N)" opens the first pending key',async t=>{
  const f=await boot(t),{page}=f;
  const ids=await pending(page),names=await page.evaluate(()=>Object.fromEntries(Object.entries(B.people).map(([id,p])=>[id,p.name||id])));
  assert.deepEqual([...ids].sort(),[f.owner.participant,f.peer.participant].sort());
  assert.deepEqual(ids,[...ids].sort((a,b)=>names[a].localeCompare(names[b])),'sorted by display name');
  // Signing itself opens the dialog as before, at its top, so "Sign as me" is reached the usual way.
  await openSigning(page);
  assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollTop),0,'Signing opens at the top');
  await closeSigning(page);
  await h.openToolbarTool(page,'reviewKeysTool');await expect(page.locator('#signingDialog')).toBeVisible();
  await expect(page.locator('#signingParticipant')).toHaveValue(ids[0]);
  await expect(page.locator('#signingPendingSummary')).toHaveText('2 keys need review');
  assert.deepEqual(await page.locator('#signingParticipant option').allTextContents(),
    [...ids.map(id=>`${names[id]} (${id}) - needs review`),`${names['implementation-agent-01']} (implementation-agent-01) - no key`]);
  // The dialog opened on the review task: its heading is in view under the dialog header.
  const view=await page.locator('#signing-review h3').evaluate(el=>{const r=el.getBoundingClientRect(),d=document.querySelector('#signingDialog').getBoundingClientRect();return r.top>=d.top&&r.top<d.bottom;});
  assert.equal(view,true,'review task in view');
  // Approving still needs the pasted fingerprint; the list relabels without reordering.
  await page.fill('#signingFingerprint',f.owner.fingerprint.slice(0,-1));
  await page.locator('#signingDialog [data-action="trust"]').click();
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Fingerprint does not match');
  await trust(page,ids[0]===f.owner.participant?f.owner:f.peer);
  await expect(page.locator('#signingPendingSummary')).toHaveText('1 key needs review');
  await expect(page.locator('#signingParticipant option').first()).toHaveText(`${names[ids[0]]} (${ids[0]}) - approved`);
  await choose(page,'#sLang','pl');await expect(page.locator('#signingPendingSummary')).toHaveText('1 klucz wymaga sprawdzenia',{timeout:10000});
  await expect(page.locator('#signingParticipant option').first()).toHaveText(`${names[ids[0]]} (${ids[0]}) - zatwierdzony`,{timeout:10000});
  await choose(page,'#sLang','en');await closeSigning(page);
  await approve(page,ids[0]===f.owner.participant?f.peer:f.owner);
  await openSigning(page);await expect(page.locator('#signingPendingSummary')).toHaveText('All registered keys are approved on this device');
});

test('AC4: the first-open notice opens the review, "Not now" survives reload, a new or changed key shows it again',async t=>{
  const f=await boot(t),{page}=f;
  await expect(notice(page)).toBeVisible();await expect(page.locator('#keyNoticeText')).toHaveText('2 participant keys are not approved on this device.');
  const first=(await pending(page))[0];
  await page.click('#keyNoticeReview');await expect(page.locator('#signingDialog')).toBeVisible();
  await expect(page.locator('#signingParticipant')).toHaveValue(first);
  assert.deepEqual(await page.evaluate(()=>B.signingContext.state.pins),{},'opening the review approves nothing');
  await closeSigning(page);
  await page.click('#keyNoticeLater');await expect(notice(page)).toBeHidden();await counted(page,2);
  await reopen(page);await counted(page,2);await expect(notice(page)).toBeHidden();
  // A newly registered key shows the notice again.
  f.register('implementation-agent-01');await refresh(f);
  await expect(notice(page)).toBeVisible();await expect(page.locator('#keyNoticeText')).toHaveText('3 participant keys are not approved on this device.');
  await page.click('#keyNoticeLater');await expect(notice(page)).toBeHidden();
  // So does a changed one.
  f.rotate();await refresh(f);await expect(notice(page)).toBeVisible();
  await page.click('#keyNoticeLater');await reopen(page);await expect(notice(page)).toBeHidden();
  await choose(page,'#sLang','pl');await expect(badge(page)).toHaveAttribute('title','3 klucze do sprawdzenia');
});

test('AC4: with Storage reads and writes throwing the page loads, the notice shows and still dismisses',async t=>{
  const f=require('./lib/signing-fixture').fixture();t.after(f.clean);
  const ctx=await browser.newContext(),page=await ctx.newPage();t.after(()=>ctx.close());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();const fail=()=>{throw new DOMException('Storage denied','SecurityError');};Storage.prototype.getItem=fail;Storage.prototype.setItem=fail;});
  await page.goto(url);await importBoard(page,f.proj);await h.openBoardViaUi(page);
  await expect(notice(page)).toBeVisible();await counted(page,2);
  await page.click('#keyNoticeLater');await expect(notice(page)).toBeHidden();
  await page.evaluate(()=>readFromHandle(true));await expect(notice(page)).toBeHidden();
  assert.deepEqual(errors,[]);
});

test('AC5: no badge, dot or notice at N = 0; the count and the dismissal write are not vacuous',async t=>{
  const f=await boot(t),{page}=f;
  await approve(page,f.owner);await approve(page,f.peer);
  await counted(page,0);await expect(notice(page)).toBeHidden();
  await reopen(page);await counted(page,0);await expect(notice(page)).toBeHidden();
  // Mutation 1: a count that is always empty makes AC1 fail on a board with a pending key.
  f.register('implementation-agent-01');await refresh(f);await counted(page,1);
  await page.evaluate(()=>{window.signingPendingReview=()=>[];updateSigningNotice();});
  await assert.rejects(counted(page,1),'AC1 fails without the count');
  await reopen(page);await counted(page,1);
  // Mutation 2: skipping the dismissal write makes AC4's reload step fail.
  await expect(notice(page)).toBeVisible();
  await page.evaluate(()=>{window.signingKeyNoticeStore=()=>{};});
  await page.click('#keyNoticeLater');await expect(notice(page)).toBeHidden();
  await reopen(page);await expect(notice(page)).toBeVisible();
});

test('AC6/AC6b/AC7: the sidebar glyph and "Rooms", the « hide control, and the layout with badge and notice',async t=>{
  const f=await boot(t,third),{page}=f;
  const menu=page.locator('#menu'),fill=()=>page.locator('#menu .side-glyph-col').evaluate(el=>getComputedStyle(el).fill);
  assert.equal(await menu.locator('svg.side-glyph').count(),1);assert.doesNotMatch(await menu.textContent(),/☰/);
  await expect(menu).toHaveAttribute('aria-controls','side');await expect(menu).toHaveAttribute('title',/^Hide sidebar \((⌘|Ctrl\+)B\)$/);
  await expect(notice(page)).toBeVisible();await counted(page,3);
  for(const lang of ['en','pl']){
    await choose(page,'#sLang',lang);
    await expect(menu.locator('.menu-text')).toBeVisible();await expect(menu.locator('.menu-text')).toHaveText(lang==='pl'?'Pokoje':'Rooms');
    const g=await header(page);assert.ok(g.height<=52,lang+' header '+g.height);assert.equal(g.rows,false,lang+' one row');
    assert.deepEqual(await h.layoutViolations(page),[],lang+' 1280x800');
  }
  await choose(page,'#sLang','en');
  for(const [width,height] of [[900,500],[390,640]]){await page.setViewportSize({width,height});await expect(menu.locator('.menu-text')).toBeHidden();assert.equal(await menu.locator('svg.side-glyph').isVisible(),true);}
  await page.setViewportSize({width:1280,height:800});
  // Glyph and aria-expanded flip together.
  await expect(menu).toHaveAttribute('aria-expanded','true');assert.notEqual(await fill(),'none');
  const hide=page.locator('#sideHide'),inside=async()=>{const [b,row,side]=await Promise.all([hide.boundingBox(),page.locator('#side .side-head').boundingBox(),page.locator('#side').boundingBox()]);return !!b&&b.width>0&&b.x>=row.x&&b.x+b.width<=row.x+row.width+0.5&&b.y>=row.y-0.5&&b.y+b.height<=row.y+row.height+0.5&&b.x+b.width<=side.x+side.width;};
  assert.equal(await inside(),true,'« inside the sidebar heading row');
  await expect(hide).toHaveAttribute('aria-label','Hide sidebar');await expect(hide).toHaveAttribute('title',/^Hide sidebar \((⌘|Ctrl\+)B\)$/);
  await hide.click();await expect(menu).toHaveAttribute('aria-expanded','false');assert.equal(await fill(),'none');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'menu');assert.equal(await page.locator('#side').evaluate(el=>el.getBoundingClientRect().width),0);
  await reopen(page);await expect(menu).toHaveAttribute('aria-expanded','false');assert.equal(await page.locator('#side').evaluate(el=>el.getBoundingClientRect().width),0);
  assert.deepEqual(await h.layoutViolations(page),[],'sidebar hidden 1280x800');
  await menu.click();await expect(menu).toHaveAttribute('aria-expanded','true');assert.notEqual(await fill(),'none');assert.equal(await inside(),true);
  await page.setViewportSize({width:900,height:800});assert.equal(await inside(),true,'« at 900px');
  // The phone drawer.
  await page.setViewportSize({width:390,height:640});await expect(page.locator('#side')).toBeHidden();
  await menu.click();await expect(page.locator('#side')).toBeVisible();assert.equal(await inside(),true,'« in the drawer');
  await hide.click();await expect(page.locator('#side')).toBeHidden();await expect(menu).toHaveAttribute('aria-expanded','false');assert.equal(await page.evaluate(()=>document.activeElement.id),'menu');
  // AC7: the SPEC-002-068 layout holds with the badge and the notice, down to 320x360, in both languages.
  // The notice adds no violation and the layout is clean at every size (390px included since AC9).
  for(const lang of ['en','pl']){await choose(page,'#sLang',lang);
    for(const [width,height] of [[1280,800],[1280,460],[900,500],[640,800],[390,640],[390,560],[320,360]]){
      await page.setViewportSize({width,height});await expect(notice(page)).toBeVisible();
      const v=await h.layoutViolations(page);
      await page.evaluate(()=>document.querySelector('#keyNotice').classList.remove('show'));const without=await h.layoutViolations(page);
      await page.evaluate(()=>signingKeysSync());await expect(notice(page)).toBeVisible();
      assert.deepEqual(v,without,`${lang} ${width}x${height}: the notice adds a violation`);
      assert.deepEqual(v,[],`${lang} ${width}x${height}: ${v.join('; ')}`);
      const n=await notice(page).boundingBox();assert.ok(n.height<=40&&n.x>=0&&n.x+n.width<=width+0.5,`${lang} ${width}x${height} notice ${JSON.stringify(n)}`);
      for(const id of ['#keyNoticeReview','#keyNoticeLater']){const b=await page.locator(id).boundingBox();assert.ok(b&&b.x+b.width<=width+0.5,`${lang} ${width}x${height} ${id} on screen`);}
      if(width>600){const g=await header(page);assert.ok(g.height<=52,`${lang} ${width}x${height} header ${g.height}`);assert.equal(g.rows,false);}
    }}
});

// AC6c: the hidden sidebar peeks on hover. The example board needs no signing.
async function layoutBoard(opts={}){
  const project=h.layoutExample(h.tmpDir('afb-peek-')),s=await h.openPage(browser,{tree:h.readTree(project),dialog:'accept',...opts});
  await h.openBoardViaUi(s.page);return s;
}
const peekGeometry=page=>page.evaluate(()=>({side:document.querySelector('#side').getBoundingClientRect().toJSON(),feed:document.querySelector('.feed-wrap').getBoundingClientRect().left,sidew:parseFloat(getComputedStyle(document.querySelector('.side')).width),peek:document.body.classList.contains('side-peek'),scroll:document.documentElement.scrollWidth<=innerWidth}));
async function peeks(page){
  await page.mouse.move(3,400);await page.waitForTimeout(200);
  await expect.poll(async()=>(await peekGeometry(page)).side.width,{timeout:2000}).toBeGreaterThan(100);
}
test('AC6c: the hidden sidebar peeks on hover over the left edge or #menu, stays while used, closes on leave, pins on request',async()=>{
  const {ctx,page,log}=await layoutBoard();try{
    await h.openView(page,'room:product|T003');
    await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
    await page.mouse.move(800,400);await page.waitForTimeout(250);
    const before=await peekGeometry(page);assert.equal(before.side.width,0,'hidden, and clicking #menu did not peek');assert.equal(before.peek,false);
    await peeks(page);
    const g=await peekGeometry(page);
    assert.equal(g.peek,true);assert.ok(Math.abs(g.side.width-before.side.width-g.sidew)<=1&&g.side.x===0,'overlay at --sidew: '+JSON.stringify(g));assert.equal(g.feed,before.feed,'feed does not move');assert.equal(g.scroll,true,'no horizontal scroll');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#side')).position),'fixed');
    await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
    await expect(page.locator('#tree .posting')).toHaveCount(1);await expect(page.locator('#tree .posting')).toBeVisible();
    // Switch topics inside the peek; it stays open while the pointer is over it.
    await page.locator('.fname[data-dir="architecture"]').click();await expect(page.locator('#title')).toHaveText(/architecture/);
    await page.locator('.tcard[data-tk="room:product|T003"]').click();await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');
    await page.waitForTimeout(400);assert.equal((await peekGeometry(page)).peek,true,'still open after navigating');
    await expect(page.locator('#sideHide')).toHaveAttribute('aria-label','Keep sidebar open');
    // Leaving closes it within 600ms.
    await page.mouse.move(800,400);await expect.poll(async()=>(await peekGeometry(page)).side.width,{timeout:600}).toBe(0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('afb.sidebar')),'hidden');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
    // #menu also peeks; Escape closes.
    await page.locator('#menu').hover();await expect.poll(async()=>(await peekGeometry(page)).peek,{timeout:700}).toBe(true);
    await page.keyboard.press('Escape');assert.equal((await peekGeometry(page)).peek,false);
    // Keyboard never peeks.
    await page.mouse.move(800,400);await page.focus('#menu');await page.waitForTimeout(300);assert.equal((await peekGeometry(page)).peek,false);
    await h.reloadSettled(ctx,page,{local:['afb.sidebar','hidden'],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
    await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');assert.equal((await peekGeometry(page)).side.width,0);
    // Pin from inside the peek: shown normally and saved.
    await page.mouse.move(800,400);await peeks(page);await page.mouse.move(100,300);await page.click('#sideHide');
    await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');
    const pinned=await peekGeometry(page);assert.equal(pinned.peek,false);assert.ok(pinned.side.width>100&&pinned.feed>100,'in the layout: '+JSON.stringify(pinned));
    assert.equal(await page.evaluate(()=>localStorage.getItem('afb.sidebar')),'shown');await expect(page.locator('#sideHide')).toHaveAttribute('aria-label','Hide sidebar');
    assert.deepEqual(await h.layoutViolations(page),[]);
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();}
});

test('AC6c: no peek on touch devices or at 820px and below; non-vacuity: without the hover handler the first step fails',async()=>{
  {const {ctx,page,log}=await layoutBoard({context:{hasTouch:true,isMobile:true}});try{
    assert.equal(await page.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),false);
    if(await page.locator('#menu').getAttribute('aria-expanded')==='true')await page.click('#menu');
    await page.mouse.move(800,400);await page.mouse.move(3,400);await page.waitForTimeout(400);
    assert.equal((await peekGeometry(page)).side.width,0);await page.locator('#menu').hover();await page.waitForTimeout(400);assert.equal((await peekGeometry(page)).side.width,0);
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();}}
  {const {ctx,page,log}=await layoutBoard({viewport:{width:800,height:700}});try{
    await page.mouse.move(3,400);await page.waitForTimeout(400);assert.equal(await page.locator('#side').isVisible(),false,'the drawer stays closed');
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();}}
  {const {ctx,page,log}=await layoutBoard();try{
    await page.click('#menu');await page.mouse.move(800,400);await peeks(page);await page.mouse.move(800,400);await expect.poll(async()=>(await peekGeometry(page)).peek,{timeout:600}).toBe(false);
    await page.evaluate(()=>{window.sidebarPeekEnter=()=>{};});
    await assert.rejects(peeks(page),'AC6c fails without the hover handler');
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();}}
});

// AC9: on a signing board with an unlock offer the composer status row keeps its label on one line
// and wraps the offer below it, so the message field and Post fit every SPEC-002-068 AC1 size.
const AC1_SIZES=[[1280,800],[1280,560],[1280,460],[900,500],[700,420],[640,800],[390,640],[390,560],[320,360]];
async function statusFits(page){
  const out=[];
  for(const lang of ['en','pl']){await choose(page,'#sLang',lang);
    for(const open of [true,false]){
      await page.setViewportSize({width:1280,height:800});
      if(await page.locator('#composerOptions').evaluate(el=>el.open)!==open)await page.locator('#composerOptions > summary').click();
      for(const [width,height] of AC1_SIZES){
        await page.setViewportSize({width,height});const at=`${lang} ${open?'open':'folded'} ${width}x${height}`;
        for(const v of await h.layoutViolations(page))out.push(at+': '+v);
        const label=await page.locator('#signingNotice .signing-notice-label').evaluate(el=>{const r=el.getBoundingClientRect(),line=parseFloat(getComputedStyle(el).lineHeight)||20;return {h:r.height,w:r.width,line};});
        if(label.h>label.line*1.5||label.w<60)out.push(at+': label squeezed '+JSON.stringify(label));
      }
    }
  }
  await choose(page,'#sLang','en');return out;
}
test('AC9: the signing status row with an unlock offer fits every window; non-vacuity: the 3.3.4 row does not',async t=>{
  const f=await boot(t),{page}=f;
  await expect(page.locator('#signingNotice')).toHaveAttribute('data-signing-status','unsigned');
  await expect(page.locator('#signingNotice .signing-notice-action')).toContainText('Unlock');
  assert.deepEqual(await statusFits(page),[]);
  // At 390x640 the label has its own line and the long unlock offer and Details wrap below it.
  await page.setViewportSize({width:390,height:640});
  const rows=await page.evaluate(()=>{const n=document.querySelector('#signingNotice'),r=s=>n.querySelector(s).getBoundingClientRect(),a=n.querySelector('.signing-notice-action');return {head:r('.signing-notice-head'),action:r('.signing-notice-action'),more:r('.signing-notice-more'),height:n.getBoundingClientRect().height,title:a.title,text:a.textContent};});
  assert.ok(rows.action.top>=rows.head.bottom-1&&rows.more.top>=rows.head.bottom-1,'offer and Details below the label: '+JSON.stringify(rows));
  assert.ok(rows.height<=140,'status row height '+rows.height);assert.equal(rows.title,rows.text,'the offer carries its text as a tooltip');
  // Restoring the 3.3.4 rules (a label column that may shrink to nothing, wrapping word by word) brings the overflow back.
  await page.addStyleTag({content:'.signing-notice[data-signing-status=unsigned]:not(.expanded) .signing-notice-head{min-width:0!important}.signing-notice[data-signing-status=unsigned]:not(.expanded) .signing-notice-label{white-space:normal!important}'});
  await page.setViewportSize({width:390,height:640});
  assert.notDeepEqual(await h.layoutViolations(page),[],'the old row overflows at 390x640');
});
