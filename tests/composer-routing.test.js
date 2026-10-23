'use strict';
// SPEC-002-064: the composer posts where the reader is looking; a draft never silently retargets.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{expect}=require('playwright/test'),h=require('./lib/helpers');
let browser;before(async()=>browser=await h.launch());after(async()=>browser?.close());
const PAIR='implementation-agent-01--research-agent-01';
// The example board plus one open architecture topic (T004); architecture T001 and the direct T002 are CLOSED.
function fixture(){
 const project=h.layoutExample(h.tmpDir('afb-routing-')),room=h.path.join(project,'.agent-board','rooms','architecture');
 h.fs.writeFileSync(h.path.join(room,'2026-09-27_0900_human-owner-01_T004_api-v2.txt'),'FROM: human-owner-01\nTO: all\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T004-api-v2\nDATE: 2026-09-27 09:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nShould API v2 keep the old IDs?\n');
 return project;
}
async function boot(opts={}){const project=opts.project||fixture(),s=await h.openPage(browser,{tree:h.readTree(project),dialog:'accept',...opts});await h.openBoardViaUi(s.page);return {...s,project};}
const clean=log=>{assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);};
const chip=page=>page.locator('#composerTarget').evaluate(el=>el.textContent.replace(/\s+/g,' ').trim());
const target=page=>page.evaluate(()=>composerTarget());
const messages=page=>page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt')));
const navigate=(page,view)=>page.evaluate(view=>{sel=view;rememberView();build();},view);

test('view to target matrix: thread, room, direct conversation and All messages (AC1-AC4, AC9)',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','implementation-agent-01');
  // All messages: no implicit destination, Send disabled, chip prompts.
  assert.equal(await page.evaluate(()=>sel.scope),null);
  assert.equal((await target(page)).scope,null);assert.match(await chip(page),/Choose where to post/);await expect(page.locator('#send')).toBeDisabled();
  for(const id of ['#cWhere','#cThread','#cTo'])assert.equal(await page.locator(id).isVisible(),false,id+' hidden by default');
  // Thread view: that thread.
  await h.openView(page,'room:architecture|T004');
  assert.deepEqual(await page.evaluate(()=>[composerTarget().scope,composerTarget().thread]),['room','room:architecture|T004']);
  assert.match(await chip(page),/Posting to: # architecture › T004/);await expect(page.locator('#send')).toBeEnabled();await expect(page.locator('#composerTo')).toHaveText('to all');
  // Room view: a new topic, never the newest thread; Send without a topic name is refused.
  await h.openView(page,'architecture');
  const room=await target(page);assert.equal(room.scope,'room');assert.equal(room.dir,'architecture');assert.equal(room.thread,'');
  assert.match(await chip(page),/# architecture › New topic/);await expect(page.locator('#cNewThread')).toBeVisible();
  const before=await messages(page);await page.fill('#cBody','No topic yet');await page.click('#send');
  await expect(page.locator('#toast')).toHaveText('Give the new thread a name');assert.deepEqual(await messages(page),before);await page.fill('#cBody','');
  // Direct conversation: its most recent topic; TO is the other member and not offered.
  await h.openView(page,PAIR);
  const dm=await target(page);assert.equal(dm.scope,'direct');assert.equal(dm.thread,'direct:'+PAIR+'|T002');assert.equal(dm.to,'research-agent-01');
  await expect(page.locator('#composerTo')).toBeHidden();assert.match(await chip(page),/✉ research-agent-01 › T002/);
  // Back to All messages: no target; a reply supplies one.
  await page.locator('.tree-root').click();assert.equal((await target(page)).scope,null);await expect(page.locator('#send')).toBeDisabled();
  const article=page.locator('article.msg').last();await article.hover();await article.locator('[data-reply]').click();
  const reply=await target(page);assert.ok(reply.scope&&reply.thread,'a reply supplies the destination');assert.match(await chip(page),/^Replying in /);await expect(page.locator('#send')).toBeEnabled();
  // Advanced keeps the same select IDs (AC9).
  await page.click('#composerTarget');await page.locator('#composerTargetList button',{hasText:'Advanced…'}).click();
  for(const id of ['#cWhere','#cThread','#cTo'])await expect(page.locator(id)).toBeVisible();
  assert.equal(await page.inputValue('#cThread'),reply.thread);clean(log);
 }finally{await ctx.close();}
});

test('a draft pins the destination: whitespace or voice counts, banner offers post here or keep (AC5, AC11)',async()=>{
 const {ctx,page,log}=await boot();try{
  await h.openView(page,'room:architecture|T004');
  // Without a draft, navigation retargets silently.
  await h.openView(page,'room:product|T003');assert.equal((await target(page)).thread,'room:product|T003');await expect(page.locator('#composerPin')).toBeHidden();
  // Whitespace-only body is a draft (notificationHasDraft uses length).
  await page.fill('#cBody','   ');
  const notices=await page.evaluate(()=>{window.__signingCalls=0;const original=updateSigningNotice;window.updateSigningNotice=(...a)=>{window.__signingCalls++;return original(...a);};return window.__signingCalls;});
  await h.openView(page,'room:architecture|T004');
  assert.equal((await target(page)).thread,'room:product|T003','navigation with a draft keeps the destination');
  await expect(page.locator('#composerPin')).toBeVisible();await expect(page.locator('#composerPin')).toContainText('Draft for # product › T003');
  assert.equal(await page.evaluate(()=>document.querySelector('#composer').hasAttribute('data-pinned')),true);
  await page.click('#composerPinKeep');await expect(page.locator('#composerPin')).toBeHidden();assert.equal((await target(page)).thread,'room:product|T003');assert.equal(await page.inputValue('#cBody'),'   ');
  await h.openView(page,'architecture');await expect(page.locator('#composerPin')).toBeVisible();
  // Post here instead retargets explicitly and recomputes the signing notice for the new destination.
  const calls=await page.evaluate(()=>window.__signingCalls);
  await page.click('#composerPinHere');const here=await target(page);assert.equal(here.dir,'architecture');assert.equal(here.thread,'');
  assert.ok(await page.evaluate(()=>window.__signingCalls)>calls,'signing notice recomputed on retarget');assert.ok(calls>=notices);
  await expect(page.locator('#composerPin')).toBeHidden();assert.equal(await page.inputValue('#cBody'),'   ');
  // A topic name alone is a draft too.
  await page.fill('#cBody','');await page.fill('#cNewThread','Pending topic');await h.openView(page,'room:product|T003');
  assert.equal((await target(page)).dir,'architecture');await expect(page.locator('#composerPin')).toBeVisible();
  // Returning to the destination's own view clears the banner.
  await h.openView(page,'architecture');await expect(page.locator('#composerPin')).toBeHidden();
  await page.fill('#cNewThread','');
  // An active voice session pins the destination even with an empty body.
  await page.evaluate(()=>{voiceWorkPending=true;});await navigate(page,{scope:'room',dir:'product',thread:'room:product|T003'});
  assert.equal((await target(page)).dir,'architecture','voice capture keeps the destination');await expect(page.locator('#composerPin')).toBeVisible();
  await page.evaluate(()=>{voiceWorkPending=false;});await navigate(page,{scope:'room',dir:'product',thread:null});
  assert.equal((await target(page)).dir,'product','without a draft navigation follows again');clean(log);
 }finally{await ctx.close();}
});

test('after a send the composer follows the view again; a closed topic warns and offers a new topic (AC5, AC13)',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','human-owner-01');await page.click('[data-closed="room:architecture"]');await h.openView(page,'room:architecture|T001');
  await expect(page.locator('#composerTargetNote')).toBeVisible();await expect(page.locator('#composerTargetNote')).toContainText('Topic closed');await expect(page.locator('#send')).toBeEnabled();
  await page.locator('#composerTargetNote button',{hasText:'New topic here'}).click();
  assert.deepEqual(await page.evaluate(()=>[composerTarget().dir,composerTarget().thread]),['architecture','']);await expect(page.locator('#cNewThread')).toBeFocused();
  await page.fill('#cNewThread','Follow-up after close');await page.fill('#cBody','Posted from a closed topic view');await page.click('#send');
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('Posted from a closed topic view')));
  await expect(page.locator('#cBody')).toHaveValue('');
  assert.equal((await target(page)).thread,'room:architecture|T001','the composer re-follows the visible thread');clean(log);
 }finally{await ctx.close();}
});

test('message a participant: existing pair opens it, a new pair writes direct/<sorted pair>/ and appears after the file (AC6, AC12)',async()=>{
 const {ctx,page,log,project}=await boot();try{
  await page.selectOption('#me','research-agent-01');
  // Popover entry: the existing pair navigates to its conversation.
  await page.click('#composerTarget');await page.locator('#composerTargetList button',{hasText:'Message a participant…'}).click();
  await page.locator('#composerTargetList button',{hasText:'implementation-agent-01'}).click();
  assert.deepEqual(await page.evaluate(()=>[sel.scope,sel.dir]),['direct',PAIR]);assert.equal((await target(page)).scope,'direct');
  // A persona outside the pair cannot send and is offered a switch.
  await page.selectOption('#me','human-owner-01');
  await expect(page.locator('#send')).toBeDisabled();await expect(page.locator('#composerTargetNote')).toContainText('You (human-owner-01) are not in this conversation');
  await page.locator('#composerTargetNote button',{hasText:'Switch to research-agent-01'}).click();
  assert.equal(await page.inputValue('#me'),'research-agent-01');await expect(page.locator('#send')).toBeEnabled();
  // Sidebar "+" entry: a new pair targets newdirect; nothing appears in the sidebar yet.
  await page.selectOption('#me','human-owner-01');await page.locator('.direct-new').click();await expect(page.locator('#composerTargetMenu')).toBeVisible();
  await page.locator('#composerTargetList button',{hasText:'research-agent-01'}).click();
  const fresh=await target(page);assert.equal(fresh.scope,'newdirect');assert.equal(fresh.dir,'human-owner-01--research-agent-01');
  await expect(page.locator('#composerTo')).toBeHidden();assert.match(await chip(page),/✉ research-agent-01 › New topic/);
  assert.equal(await page.locator('.fname[data-dir="human-owner-01--research-agent-01"]').count(),0,'no phantom sidebar entry');
  // A topic is required; it is pre-filled from the first line of the draft and stays editable.
  await page.fill('#cBody','Quick question about the schema\nmore detail');
  assert.equal(await page.inputValue('#cNewThread'),'quick-question-about-the-schema');
  await page.fill('#cNewThread','');await page.click('#send');await expect(page.locator('#toast')).toHaveText('Give the new thread a name');
  await page.fill('#cNewThread','Schema question');await page.click('#send');
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.path.startsWith('.agent-board/direct/human-owner-01--research-agent-01/')));
  const file=(await messages(page)).find(f=>f.path.startsWith('.agent-board/direct/human-owner-01--research-agent-01/'));
  assert.match(file.text,/^FROM: human-owner-01$/m);assert.match(file.text,/^TO: research-agent-01$/m);assert.match(file.text,/^SCOPE: DIRECT$/m);assert.match(file.text,/^THREAD: T\d+-schema-question$/m);
  await expect(page.locator('.fname[data-dir="human-owner-01--research-agent-01"]')).toBeVisible();
  assert.deepEqual(await page.evaluate(()=>[sel.scope,sel.dir]),['direct','human-owner-01--research-agent-01']);assert.equal((await target(page)).scope,'direct');
  // Participants dialog entry, and the board validates.
  await h.openToolbarTool(page,'presenceOpen');await expect(page.locator('.presence-message[data-message-participant="human-owner-01"]')).toHaveCount(0);
  await page.locator('.presence-message[data-message-participant="implementation-agent-01"]').click();await expect(page.locator('#presenceDialog')).toBeHidden();
  assert.equal((await target(page)).scope,'newdirect');assert.equal((await target(page)).to,'implementation-agent-01');
  const out=h.tmpDir('afb-routing-dm-');await h.dumpFakeFs(page,out);const v=h.boardctl(['validate','--path',h.path.join(out)]);assert.equal(v.code,0,v.err+v.out);clean(log);
 }finally{await ctx.close();}
});

test('legacy boards offer no direct-message entry points (AC7)',async()=>{
 const dir=h.path.join(__dirname,'fixtures','legacy-board');
 const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(dir),rootName:'legacy-board'});try{
  await h.openBoardViaUi(page);
  await expect(page.locator('.direct-new')).toHaveCount(0);
  await page.click('#composerTarget');await expect(page.locator('#composerTargetList')).not.toContainText('Message a participant');await page.keyboard.press('Escape');
  await h.openToolbarTool(page,'presenceOpen');await expect(page.locator('.presence-message')).toHaveCount(0);
  assert.equal(await page.evaluate(()=>[...document.querySelector('#cWhere').options].some(o=>o.value==='newdirect'||o.value.startsWith('direct:'))),false);clean(log);
 }finally{await ctx.close();}
});

test('room TO defaults to all, accepts several participants, reply pre-fills and cancel restores all (AC8)',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','human-owner-01');await h.openView(page,'room:architecture|T004');
  await expect(page.locator('#composerTo')).toHaveText('to all');
  await page.click('#composerTo');await page.locator('#composerTargetList button',{hasText:'research-agent-01'}).click();await page.locator('#composerTargetList button',{hasText:'implementation-agent-01'}).click();
  await expect(page.locator('#composerTargetMenu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#composerTo')).toBeFocused();
  assert.equal(await page.inputValue('#cTo'),'research-agent-01,implementation-agent-01');await expect(page.locator('#composerTo')).toHaveText('to research-agent-01, implementation-agent-01');
  await page.fill('#cBody','Two reviewers please');await page.click('#send');
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('Two reviewers please')));
  const posted=(await messages(page)).find(f=>f.text.includes('Two reviewers please'));assert.match(posted.text,/^TO: research-agent-01, implementation-agent-01$/m);
  await expect(page.locator('#composerTo')).toHaveText('to research-agent-01, implementation-agent-01');
  const out=h.tmpDir('afb-routing-to-');await h.dumpFakeFs(page,out);const v=h.boardctl(['validate','--path',out]);assert.equal(v.code,0,v.err+v.out);
  const other=page.locator('article.msg',{hasText:'Should API v2 keep the old IDs?'});await other.hover();await other.locator('[data-reply]').click();
  assert.equal(await page.inputValue('#cTo'),'human-owner-01');await expect(page.locator('#composerTo')).toHaveText('to human-owner-01');
  await page.click('#replyClear');assert.equal(await page.inputValue('#cTo'),'all');assert.equal((await target(page)).thread,'room:architecture|T004','cancel keeps the destination');clean(log);
 }finally{await ctx.close();}
});

test('keyboard: Enter opens the chip, arrows and Enter pick, Escape returns focus (AC15)',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.locator('#composerTarget').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#composerTargetMenu')).toBeVisible();await expect(page.locator('#composerTargetSearch')).toBeFocused();await expect(page.locator('#composerTarget')).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(page.locator('#composerTargetMenu')).toBeHidden();await expect(page.locator('#composerTarget')).toBeFocused();
  await page.keyboard.press('Space');await expect(page.locator('#composerTargetSearch')).toBeFocused();
  await page.keyboard.type('product');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  const picked=await page.locator('#composerTargetList button.sel').innerText();assert.match(picked,/product › T003/);
  await page.keyboard.press('Enter');await expect(page.locator('#composerTargetMenu')).toBeHidden();await expect(page.locator('#composerTarget')).toBeFocused();
  assert.equal((await target(page)).thread,'room:product|T003');assert.equal(await page.evaluate(()=>sel.scope),null,'picking a destination does not navigate');clean(log);
 }finally{await ctx.close();}
});

test('phone 390px: one-line chip, bottom-sheet popover, Polish strings, no horizontal scroll (AC14)',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.setViewportSize({width:390,height:844});
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#settingsClose');
  await page.evaluate(()=>{sel={scope:'room',dir:'architecture',thread:'room:architecture|T004'};rememberView();build();});
  await page.evaluate(()=>{const th=threadsOf()['room:architecture|T004'];th.title='A very long topic title that must not wrap the destination chip onto a second line';updateComposerSummary();});
  const box=await page.locator('#composerTarget').boundingBox(),line=await page.locator('#composerTarget').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)*2.2);
  assert.ok(box.height<=line,'one line chip: '+box.height);assert.ok(box.x>=0&&box.x+box.width<=390);
  assert.match(await chip(page),/^Wysyłasz do: # architecture › T004 .*Zmień$/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Both chips stay inside the viewport and the recipient chip is never clipped.
  for(const id of ['#composerTarget','#composerTo']){const b=await page.locator(id).boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390&&b.y>=0&&b.y+b.height<=844,id+' within the viewport: '+JSON.stringify(b));}
  await expect(page.locator('#composerTo')).toHaveText('do wszystkich');
  assert.equal(await page.locator('#composerTo').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'recipient chip text is not clipped');
  await page.click('#composerTarget');const sheet=await page.locator('#composerTargetMenu').boundingBox();
  assert.ok(Math.abs(sheet.y+sheet.height-844)<=1&&sheet.x===0&&Math.abs(sheet.width-390)<=1,'bottom sheet '+JSON.stringify(sheet));assert.ok(sheet.height<=844*.7+1);
  const row=await page.locator('#composerTargetList button').first().boundingBox();assert.ok(row.height>=44,'44px rows');
  await expect(page.locator('#composerTargetList')).toContainText('Napisz do uczestnika…');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/private/tmp/afb-ui-routing-shots/phone-pl-sheet.png'});
  await page.keyboard.press('Escape');await page.screenshot({path:'/private/tmp/afb-ui-routing-shots/phone-pl-chip.png'});clean(log);
 }finally{await ctx.close();}
});
