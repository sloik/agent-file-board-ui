'use strict';
// SPEC-002-070: end-to-end journeys through the 3.3.5 UI, each the sequence a person does, asserting what they see
// and what lands in the board folder. Journeys 1, 2 (without the hover peek) and 4 also run in Firefox.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,firefox}=require('playwright');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
const V=require('./visual/scenes');
let browser,server,fox,foxError,foxReady;
before(async()=>{
 browser=await chromium.launch();server=await V.serve();
 // Started here, awaited by the first Firefox journey (they run last), so a slow launch overlaps Chromium work.
 foxReady=firefox.launch({timeout:30000}).then(b=>{fox=b;},e=>{foxError=e;});
});
after(async()=>{await foxReady;await browser?.close();await fox?.close();await server?.close();});
// On CI a Firefox that cannot start fails the journey; only a local machine may report it as skipped.
async function firefoxOrSkip(t){
 await foxReady;
 if(fox)return fox;
 if(process.env.CI)throw foxError;
 t.skip('Firefox cannot launch on this machine: '+String(foxError?.message||foxError).split('\n')[0]);return null;
}
async function boot(b,opts={}){const s=await h.openPage(b,{tree:h.readTree(V.exampleBoard()),dialog:'accept',...opts});await h.openBoardViaUi(s.page);return s;}
// On failure the message carries each page error's URL, stack and the navigation timeline around it.
const clean=log=>{assert.deepEqual(log.pageErrors,[],'page errors with their context:\n'+JSON.stringify(log.trace,null,1));assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);};
// The posted file, found by its text (not just its path, which can exist before its content is written).
async function posted(page,body){
 await expect.poll(()=>page.evaluate(body=>window.__fakefs.dump().some(f=>f.text.includes(body)),body),{timeout:10000,message:'message file written: '+body}).toBe(true);
 return page.evaluate(body=>window.__fakefs.dump().find(f=>f.text.includes(body)),body);
}
const sideWidth=page=>page.locator('#side').evaluate(el=>el.getBoundingClientRect().width);
const onScreen=async(page,sel)=>{const b=await page.locator(sel).boundingBox(),v=page.viewportSize();return !!b&&b.width>0&&b.x>=0&&b.y>=0&&b.x+b.width<=v.width+0.5&&b.y+b.height<=v.height+0.5;};

async function journey1(b){
 const {ctx,page,log}=await boot(b);try{
  await page.selectOption('#me','human-owner-01');
  await page.locator('.tcard[data-tk="room:product|T003"]').click();
  await expect(page.locator('.tcard[data-tk="room:product|T003"]')).toHaveClass(/\bposting\b/);await expect(page.locator('#tree .posting')).toHaveCount(1);
  await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');
  await page.locator('#cBody').fill('Journey one: typed and posted');await page.click('#send');
  await expect(page.locator('#feed article.msg').last()).toContainText('Journey one: typed and posted');
  const file=await posted(page,'Journey one: typed and posted');
  assert.match(file.path,/^\.agent-board\/rooms\/product\/[^/]+\.txt$/);assert.match(file.text,/^THREAD: T003-language-policy$/m);assert.match(file.text,/^FROM: human-owner-01$/m);
  await expect(page.locator('#cBody')).toHaveValue('');clean(log);
 }finally{await ctx.close();}
}
async function journey2(b,{peek}){
 const {ctx,page,log}=await boot(b);try{
  await h.openView(page,'room:product|T003');
  await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');assert.equal(await sideWidth(page),0);
  await h.reloadSettled(ctx,page,{local:['afb.sidebar','hidden'],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');assert.equal(await sideWidth(page),0,'still hidden after reload');
  if(peek){
   await page.mouse.move(800,400);await page.mouse.move(3,400);await expect.poll(()=>sideWidth(page),{timeout:3000}).toBeGreaterThan(100);
   await page.locator('.fname[data-dir="architecture"]').click();await expect(page.locator('#title')).toHaveText('# architecture');
   await page.locator('.tcard[data-tk="room:product|T003"]').click();await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');
   assert.ok(await sideWidth(page)>100,'the peek stays open while used');
   await page.mouse.move(800,400);await expect.poll(()=>sideWidth(page),{timeout:2000}).toBe(0);
   await page.mouse.move(3,400);await expect.poll(()=>sideWidth(page),{timeout:3000}).toBeGreaterThan(100);
   await page.mouse.move(100,300);await page.click('#sideHide');
  }else await page.click('#menu');
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');
  await h.reloadSettled(ctx,page,{local:['afb.sidebar','shown'],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');assert.ok(await sideWidth(page)>100,'shown after reload');clean(log);
 }finally{await ctx.close();}
}
async function journey4(b){
 const {ctx,page,log}=await boot(b);try{
  await page.selectOption('#me','human-owner-01');await page.locator('#tree .tree-root').click();
  const article=page.locator('#feed article.msg').last(),source=await article.getAttribute('data-file');
  const original=await page.evaluate(name=>window.__fakefs.dump().find(f=>f.path.endsWith('/'+name)),source);
  const room=original.text.match(/^ROOM: (.+)$/m)[1],thread=original.text.match(/^THREAD: (.+)$/m)[1];
  await article.hover();await article.locator('[data-reply]').click();
  await expect(page.locator('#composerTargetRow')).toBeVisible();
  await expect(page.locator('#composerTarget')).toContainText(`# ${room} › ${thread.split('-')[0]}`);
  await page.locator('#cBody').fill('Journey four: reply from All messages');await page.click('#send');
  const file=await posted(page,'Journey four: reply from All messages');
  assert.equal(file.path.startsWith(`.agent-board/rooms/${room}/`),true,file.path);
  assert.match(file.text,new RegExp(`^THREAD: ${thread}$`,'m'));assert.match(file.text,new RegExp(`^REPLY-TO: ${source.replace(/\./g,'\\.')}$`,'m'));clean(log);
 }finally{await ctx.close();}
}

test('journey 1 (Chromium): pick a topic, the sidebar and title follow, type, Post, the message is in the feed and the topic folder',()=>journey1(browser));

test('journey 2 (Chromium): hide the sidebar, reload, peek and switch topics inside it, leave, pin, reload',()=>journey2(browser,{peek:true}));

test('journey 3 (Chromium): phone 390x640, open the drawer, pick a topic, the drawer closes, field and Post are on screen, Post',async()=>{
 const {ctx,page,log}=await boot(browser,{viewport:{width:390,height:640}});try{
  await page.selectOption('#me','human-owner-01');
  await expect(page.locator('#side')).toBeHidden();await page.click('#menu');await expect(page.locator('#side')).toBeVisible();
  await page.locator('.tcard[data-tk="room:product|T003"]').click();
  await expect(page.locator('#side')).toBeHidden();await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');
  assert.equal(await onScreen(page,'#cBody'),true,'message field on screen');assert.equal(await onScreen(page,'#send'),true,'Post on screen');
  assert.deepEqual(await h.layoutViolations(page),[]);
  await page.locator('#cBody').fill('Journey three: posted from a phone');await page.click('#send');
  const file=await posted(page,'Journey three: posted from a phone');assert.match(file.path,/^\.agent-board\/rooms\/product\//);assert.match(file.text,/^THREAD: T003-/m);
  await expect(page.locator('#feed article.msg').last()).toContainText('Journey three: posted from a phone');clean(log);
 }finally{await ctx.close();}
});

test('journey 4 (Chromium): reply from All messages, the chip row names the destination, Post lands in that topic',()=>journey4(browser));

test('journey 5 (Chromium): key notice, Review keys, paste the fingerprint, approve until none is left; Not now survives reload',async t=>{
 const f=await native.boot(t,browser,server.url),{page}=f,notice=page.locator('#keyNotice');
 const byId={[f.owner.participant]:f.owner,[f.peer.participant]:f.peer};
 await expect(notice).toBeVisible();await expect(page.locator('#keyNoticeText')).toHaveText('2 participant keys are not approved on this device.');
 for(const left of [1,0]){
  if(left===1)await page.click('#keyNoticeReview');else await h.openToolbarTool(page,'reviewKeysTool');
  await expect(page.locator('#signingDialog')).toBeVisible();
  // SPEC-002-073: Keys opens filtered to the keys needing attention with the first row open.
  const first=await native.selectedKey(page);
  assert.equal(first,await page.locator('#signingKeys [data-key-row]:not([hidden])').first().getAttribute('data-key-row'),'the first key needing review is selected');
  await expect(page.locator(`#signingKeys [data-key-row="${first}"] .signing-key-badge`)).toContainText('Needs review');
  await page.locator('#signingFingerprint').fill(byId[first].fingerprint);
  await native.action(page,'Trust exact fingerprint');
  await expect(page.locator('#signing-review .signing-feedback')).toContainText('Exact key approved locally');
  await expect(page.locator('#signingPendingSummary')).toHaveText(left?'1 of 3 needs your attention · 1 approved on this browser':'All keys reviewed · 2 approved on this browser');
  await native.closeSigning(page);
  if(left)await expect(page.locator('#keyNoticeText')).toHaveText('1 participant key is not approved on this device.');
  else await expect(notice).toBeHidden();
 }
 await expect(page.locator('#signingTools .key-badge')).toBeHidden();
 // A newly registered key brings the notice back; Not now keeps it away after a reload.
 f.register('implementation-agent-01');await native.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));
 await expect(notice).toBeVisible();await page.click('#keyNoticeLater');await expect(notice).toBeHidden();
 await page.reload();await h.openBoardViaUi(page);
 await expect(page.locator('#signingTools .key-badge-count')).toHaveText('1');await expect(notice).toBeHidden();
});

test('journey 6 (Chromium): on a signing board "Sign this message" names the missing key, then "Post unsigned instead" posts',async t=>{
 const f=await native.boot(t,browser,server.url),{page}=f,status=page.locator('#signingNotice');
 await page.click('#keyNoticeLater');
 await page.selectOption('#me','implementation-agent-01');await h.openView(page,'room:product|T003');
 await expect(status.locator('.signing-notice-label')).toHaveText('Will post unsigned');
 await status.locator('.signing-notice-action').click();
 await expect(status).toHaveAttribute('data-signing-status','not-registered');
 await expect(status.locator('.signing-notice-action')).toHaveText('How to get a key');
 await expect(status.locator('.signing-notice-alt')).toHaveText('Post unsigned instead');
 page.once('dialog',d=>d.accept());await status.locator('.signing-notice-alt').click();
 await expect(status.locator('.signing-notice-label')).toHaveText('Will post unsigned');
 await expect(status.locator('.signing-notice-action')).toHaveText('🔏 Sign this message');
 // The only participant without a key is an agent, so Post first asks to confirm posting as an agent.
 const asked=[];page.once('dialog',d=>{asked.push(d.message());return d.accept();});
 await page.locator('#cBody').fill('Journey six: posted unsigned');await page.click('#send');
 const last=page.locator('#feed article.msg').last();
 await expect(last).toContainText('Journey six: posted unsigned');await expect(last).toContainText('Unsigned message');
 assert.equal(asked.length,1,'one confirmation before posting as an agent');
});

test('journey 7 (Chromium): shrinking from 1280x800 to 320x360 with a draft and options open keeps the field, Post and the draft',async()=>{
 const {ctx,page,log}=await boot(browser);try{
  await V.topicDraft(page);await h.expandComposer(page);
  for(const [width,height] of [[1280,800],[1280,560],[1280,460],[900,500],[700,420],[640,800],[390,640],[390,560],[320,360]]){
   await page.setViewportSize({width,height});const at=`${width}x${height}`;
   assert.equal(await onScreen(page,'#cBody'),true,at+' message field on screen');assert.equal(await onScreen(page,'#send'),true,at+' Post on screen');
   assert.deepEqual(await h.layoutViolations(page),[],at);
   await expect(page.locator('#cBody')).toHaveValue('Draft typed for the visual baseline');
   assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),true,at+' options stay open');
  }
  clean(log);
 }finally{await ctx.close();}
});

test('journey 1 (Firefox)',async t=>{const b=await firefoxOrSkip(t);if(b)await journey1(b);});
test('journey 2 without peek (Firefox): hide, reload hidden, show, reload shown',async t=>{const b=await firefoxOrSkip(t);if(b)await journey2(b,{peek:false});});
test('journey 4 (Firefox)',async t=>{const b=await firefoxOrSkip(t);if(b)await journey4(b);});
