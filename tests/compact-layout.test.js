'use strict';
// SPEC-002-068: the message field and Post always fit the window, the sidebar shows the destination,
// and #menu hides or shows the sidebar. Geometry comes from bounding boxes, never isVisible.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{expect}=require('playwright/test'),h=require('./lib/helpers');
let browser;before(async()=>browser=await h.launch());after(async()=>browser?.close());
const SIZES=[[1280,800],[1280,560],[1280,460],[900,500],[700,420],[640,800],[390,640],[390,560],[320,360]];
// The example board plus one open architecture topic (T004), as in the routing tests.
function fixture(){
 const project=h.layoutExample(h.tmpDir('afb-layout-')),room=h.path.join(project,'.agent-board','rooms','architecture');
 h.fs.writeFileSync(h.path.join(room,'2026-09-27_0900_human-owner-01_T004_api-v2.txt'),'FROM: human-owner-01\nTO: all\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T004-api-v2\nDATE: 2026-09-27 09:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nShould API v2 keep the old IDs?\n');
 return project;
}
async function boot(opts={}){const project=opts.project||fixture(),s=await h.openPage(browser,{tree:h.readTree(project),dialog:'accept',...opts});await h.openBoardViaUi(s.page);return {...s,project};}
const clean=log=>{assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);};
const messages=page=>page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt')));
const choose=(page,id,value)=>page.evaluate(([id,value])=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);
async function topicDraft(page){await page.selectOption('#me','human-owner-01');await h.openView(page,'room:product|T003');await page.fill('#cBody','Draft typed for the layout check');}
async function options(page,open){
 if(open)return h.expandComposer(page);
 if(await page.locator('#composerOptions').evaluate(el=>el.open))await page.locator('#composerOptions > summary').click();
}
async function fits(page,label){
 const v=await h.layoutViolations(page);assert.deepEqual(v,[],label+': '+v.join('; '));
}
// Restores the pre-SPEC-002-068 composer model: a flex column where nothing shrinks and the composer scrolls.
const OLD_COMPOSER='.feed-wrap{display:flex!important;flex-direction:column}.feed{flex:1;min-height:80px!important}.composer{flex:none!important;min-height:160px!important;max-height:65vh!important;overflow:auto!important}.composer .inner{display:flex!important;flex-direction:column;gap:8px}.composer-middle{overflow:visible!important}';
// ...and the pre-SPEC-002-068 chrome: a wrapping header with its reserved status line and a wrapping topic bar.
const OLD_CHROME='.top{flex-wrap:wrap!important;padding:10px 18px!important}.rstat{position:static!important;width:auto!important;height:18px!important;clip-path:none!important;flex:0 0 100%!important}.feed-head{flex-wrap:wrap!important;padding:12px 22px!important}';
const rowHidden=page=>page.locator('#composerTargetRow').evaluate(el=>el.getClientRects().length===0);
const marked=page=>page.evaluate(()=>[...document.querySelectorAll('#tree .posting')].map(el=>el.dataset.tk||el.querySelector('.fname')?.dataset.dir||'?'));

test('AC1/AC2: message field, Post, status and destination fit every window in both languages, all themes, options folded or open',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);
  for(const lang of ['en','pl'])for(const theme of ['light','dark','dracula']){
   await choose(page,'#sLang',lang);await choose(page,'#sTheme',theme);
   for(const open of [false,true]){
    await page.setViewportSize({width:1280,height:800});await options(page,open);
    for(const [width,height] of SIZES){await page.setViewportSize({width,height});await fits(page,`${lang}/${theme}/${open?'open':'folded'} ${width}x${height}`);}
   }
  }
  assert.equal(await page.inputValue('#cBody'),'Draft typed for the layout check');clean(log);
 }finally{await ctx.close();}
});

test('AC3: the feed keeps 60px and scrolls by itself at 320x360',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.locator('.tree-root').click();await page.setViewportSize({width:320,height:360});
  const feed=await page.locator('#feed').evaluate(el=>({client:el.clientHeight,scroll:el.scrollHeight}));
  assert.ok(feed.client>=60,'feed height '+feed.client);assert.ok(feed.scroll>feed.client,'feed has more to scroll');
  await page.locator('#feed').evaluate(el=>el.scrollTop=0);await page.locator('#feed').hover();await page.mouse.wheel(0,200);
  await expect.poll(()=>page.locator('#feed').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0,'the page itself never scrolls');await fits(page,'320x360');clean(log);
 }finally{await ctx.close();}
});

test('AC4: a persisted 600px composer height still fits after reload and a shorter window',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.evaluate(()=>{S.composerH=600;saveSettings();});
  await h.reloadSettled(ctx,page,{setting:['composerH',600],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  await topicDraft(page);await fits(page,'1280x800 after reload');
  await page.setViewportSize({width:1280,height:460});await fits(page,'1280x460 after resize');
  assert.equal(await page.evaluate(()=>S.composerH),600,'the saved height is kept, only the display is clamped');clean(log);
 }finally{await ctx.close();}
});

test('AC5: the worst case at 320x360 in Polish keeps reply, pin, attachment, note, status and Post on screen',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','human-owner-01');
  await page.click('#structuredOpen');await page.selectOption('#structuredExample','report-v1');await page.click('#structuredLoad');await page.click('#structuredValidate');await page.waitForSelector('#structuredPreview .report-content');await page.click('#structuredAttach');
  // A reply in a closed topic adds the reply line and the "Topic closed" note; a draft then pins it while another topic is viewed.
  await page.evaluate(()=>{sel={scope:'room',dir:'architecture',thread:'room:architecture|T001'};rememberView();build();});
  const article=page.locator('article.msg').last();await article.hover();await article.locator('[data-reply]').click();
  await page.fill('#cBody','Worst case draft with every banner');await h.openView(page,'room:product|T003');
  await h.expandComposer(page);await choose(page,'#sLang','pl');await page.setViewportSize({width:320,height:360});
  for(const id of ['#replying','#composerPin','#composerTargetNote','#structuredAttachment','#signingNotice','#composerTargetRow'])assert.ok(await page.locator(id).evaluate(el=>el.getClientRects().length>0),id+' shown');
  await fits(page,'pl 320x360 worst case');clean(log);
 }finally{await ctx.close();}
});

test('AC6: the room name input belongs to the New room flow, not to Advanced',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);await h.expandComposer(page);
  await expect(page.locator('#cWhere')).toBeVisible();await expect(page.locator('#cNewRoom')).toBeHidden();
  await page.locator('#cNewRoom').evaluate(el=>{el.value='typed-room';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#cNewRoom')).toBeVisible();
  await page.locator('#cNewRoom').evaluate(el=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(page.locator('#cNewRoom')).toBeHidden();
  await h.startNewRoom(page);await expect(page.locator('#cNewRoom')).toBeVisible();await expect(page.locator('#cNewRoom')).toBeFocused();clean(log);
 }finally{await ctx.close();}
});

test('AC7: one header row from 601px wide and a one-line topic bar',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);
  for(const lang of ['en','pl']){await choose(page,'#sLang',lang);
   for(const width of [601,640,700,820,900,1099,1100,1280,1440])for(const height of [800,460]){
    await page.setViewportSize({width,height});
    const g=await page.evaluate(()=>{const top=document.querySelector('.top').getBoundingClientRect(),head=document.querySelector('.feed-head').getBoundingClientRect();
     const items=[...document.querySelectorAll('.top>*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).position!=='absolute';}).map(el=>el.getBoundingClientRect());
     const first=Math.min(...items.map(r=>r.bottom));return {top:top.height,head:head.height,rows:items.some(r=>r.top>=first),right:Math.max(...items.map(r=>r.right))};});
    const at=`${lang} ${width}x${height}`;assert.ok(g.top<=52,at+' header '+g.top);assert.ok(g.head<=36,at+' topic bar '+g.head);assert.equal(g.rows,false,at+' one row');assert.ok(g.right<=width,at+' header fits '+g.right);
    await fits(page,at);
   }}
  clean(log);
 }finally{await ctx.close();}
});

test('AC8: keyboard reaches Post from the draft, and the topic and Tools menus open with Enter',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);await page.focus('#cBody');
  for(let i=0;i<3&&await page.evaluate(()=>document.activeElement.id)!=='send';i++)await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'send');
  await page.locator('#topicMenuToggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#topicMenu').evaluate(el=>el.open),true);
  const items=[];for(let i=0;i<3;i++){await page.keyboard.press('Tab');items.push(await page.evaluate(()=>document.activeElement.id));}
  assert.deepEqual(items,['topicRename','repairsOpen','guidanceOpen']);
  await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');await expect(page.locator('#topicTitle')).toBeFocused();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#topicMenu').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'topicMenuToggle');
  await page.locator('#toolbarToolsToggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'vocabularyOpen');
  await expect(page.locator('#sidebarToggleTool')).toBeVisible();await expect(page.locator('#sidebarToggleTool kbd')).toHaveText(/B$/);
  // The version line shows in the toolbar on wide windows and as the last Tools line otherwise.
  await expect(page.locator('#verbar')).toBeVisible();await expect(page.locator('#toolbarVersion')).toBeHidden();await page.keyboard.press('Escape');
  await page.setViewportSize({width:900,height:800});await page.click('#toolbarToolsToggle');await expect(page.locator('#verbar')).toBeHidden();
  await expect(page.locator('#toolbarVersion')).toBeVisible();assert.equal(await page.locator('#toolbarToolsPanel > :last-child').getAttribute('id'),'toolbarVersion');
  await expect(page.locator('#toolbarVersion')).toHaveText(await page.locator('#verbar').textContent());await page.keyboard.press('Escape');clean(log);
 }finally{await ctx.close();}
});

// With the compact header and topic bar the old composer rules alone still fit 1280x460 and 390x640 (measured),
// so the composer-only mutation is shown failing where the composer itself overflows (320x360), and the old
// composer with the old chrome at 390x640 and 700x420. At 1280x460 neither mutation overflows any more.
test('AC9 (non-vacuity): restoring the old composer model, or the old layout, makes AC1 fail with options open',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);await h.expandComposer(page);
  for(const [width,height,css] of [[320,360,OLD_COMPOSER],[700,420,OLD_COMPOSER+OLD_CHROME],[390,640,OLD_COMPOSER+OLD_CHROME]]){
   const at=`${width}x${height}${css===OLD_COMPOSER?' composer':' layout'}`;
   await page.setViewportSize({width,height});await fits(page,at+' as shipped');
   await page.evaluate(css=>{const style=document.createElement('style');style.id='oldLayout';style.textContent=css;document.head.append(style);},css);
   const broken=await h.layoutViolations(page);assert.ok(broken.length>0,at+': the old model must fail AC1');
   await page.evaluate(()=>document.querySelector('#oldLayout').remove());await fits(page,at+' restored');
  }clean(log);
 }finally{await ctx.close();}
});

test('AC10/AC17: a topic view hides the chip row; Change opens the popover and another topic shows the row and receives the post',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);
  assert.equal(await rowHidden(page),true,'chip row hidden when the destination is the view');assert.equal(await page.locator('#composerTarget').count(),1);
  assert.match(await page.locator('#composerTarget').textContent(),/# product\s›\sT003/,'the hidden chip still names the destination');
  // Non-vacuity: forcing the row visible makes the same check fail.
  await page.evaluate(()=>{const style=document.createElement('style');style.id='forceRow';style.textContent='#composerTargetRow[hidden]{display:flex!important}';document.head.append(style);});
  assert.equal(await rowHidden(page),false,'the check sees a forced row');await page.evaluate(()=>document.querySelector('#forceRow').remove());
  const before=await messages(page);
  await page.click('#composerTargetChange');await expect(page.locator('#composerTargetMenu')).toBeVisible();await expect(page.locator('#composerTargetChange')).toHaveAttribute('aria-expanded','true');
  await page.locator('#composerTargetList button',{hasText:'architecture › T004'}).click();
  await expect(page.locator('#composerTargetMenu')).toBeHidden();assert.equal(await rowHidden(page),false,'another topic shows the chip row');
  await expect(page.locator('#composerTarget')).toContainText(/# architecture\s›\sT004/);assert.deepEqual(await marked(page),['room:architecture|T004']);
  await page.click('#send');await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('Draft typed for the layout check')));
  const posted=(await messages(page)).find(f=>f.text.includes('Draft typed for the layout check'));assert.equal(posted.path.startsWith('.agent-board/rooms/architecture/'),true,posted.path);assert.match(posted.text,/^THREAD: T004-/m);
  assert.equal((await messages(page)).length,before.length+1);clean(log);
 }finally{await ctx.close();}
});

test('AC11: the chip row returns for a draft pin, a reply from All messages, New room, New topic, a new direct message and no destination',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','human-owner-01');
  // No destination: All messages, Post disabled and #cInfo says why.
  assert.equal(await rowHidden(page),false);await expect(page.locator('#send')).toBeDisabled();await expect(page.locator('#cInfo')).toContainText('Choose where to post');
  assert.equal(await page.locator('#composer').getAttribute('data-target'),'none');
  // Reply from All messages.
  const article=page.locator('article.msg').last();await article.hover();await article.locator('[data-reply]').click();assert.equal(await rowHidden(page),false,'reply from All messages');
  await page.click('#replyClear');await page.fill('#cBody','');
  // Draft pin.
  await h.openView(page,'room:product|T003');assert.equal(await rowHidden(page),true);await page.fill('#cBody','Pinned draft');await h.openView(page,'room:architecture|T004');
  await expect(page.locator('#composerPin')).toBeVisible();assert.equal(await rowHidden(page),false,'draft pin');
  await page.click('#composerPinHere');assert.equal(await rowHidden(page),true,'post here makes the destination the view again');
  // New topic, New room.
  await h.openDestination(page);await page.locator('#composerTargetList button',{hasText:'New topic here…'}).click();assert.equal(await rowHidden(page),false,'new topic from a topic view');
  await h.openView(page,'room:architecture|T004');await h.startNewRoom(page);assert.equal(await rowHidden(page),false,'new room');
  // Message a participant without an existing conversation.
  await page.fill('#cBody','');await h.openView(page,'room:architecture|T004');await h.openDestination(page);
  await page.locator('#composerTargetList button',{hasText:'Message a participant…'}).click();await page.locator('#composerTargetList button',{hasText:'research-agent-01'}).click();
  await expect.poll(()=>page.evaluate(()=>composerTarget().scope)).toBe('newdirect');assert.equal(await rowHidden(page),false,'new direct message');clean(log);
 }finally{await ctx.close();}
});

test('AC12/AC17: exactly one sidebar entry marks the destination and #title names it, after each view switch',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','research-agent-01');
  await h.openView(page,'room:product|T003');
  assert.deepEqual(await marked(page),['room:product|T003']);await expect(page.locator('.tcard.posting .posting-mark')).toHaveText('posting here');
  await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');assert.equal(await page.locator('#title').getAttribute('title'),'# product › T003 Language policy');
  await h.openView(page,'architecture');assert.deepEqual(await marked(page),['architecture']);await expect(page.locator('.frow.posting .posting-mark')).toHaveText('new topic in #architecture');await expect(page.locator('#title')).toHaveText('# architecture');
  await page.click('[data-closed="direct:implementation-agent-01--research-agent-01"]');await h.openView(page,'direct:implementation-agent-01--research-agent-01|T002');
  assert.deepEqual(await marked(page),['direct:implementation-agent-01--research-agent-01|T002']);await expect(page.locator('#title')).toContainText('✉ implementation-agent-01 › T002');
  // A rebuild keeps exactly one mark; collapsing the folder moves it to the conversation row.
  await page.click('#reload');await expect.poll(()=>marked(page)).toEqual(['direct:implementation-agent-01--research-agent-01|T002']);
  await page.click('[data-fold="direct:implementation-agent-01--research-agent-01"]');await expect.poll(()=>marked(page)).toEqual(['implementation-agent-01--research-agent-01']);
  // Non-vacuity: without the marker the same check fails.
  await page.evaluate(()=>{window.composerMarkSidebar=()=>{};for(const el of document.querySelectorAll('#tree .posting'))el.classList.remove('posting');build({preserveComposer:true});});
  assert.deepEqual(await marked(page),[],'the check sees a missing marker');clean(log);
 }finally{await ctx.close();}
});

test('AC13/AC16: #menu hides the sidebar, keeps Tab out of it, survives reload, and the layout and title still hold',async()=>{
 const {ctx,page,log}=await boot();try{
  await topicDraft(page);await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#menu')).toHaveAttribute('aria-controls','side');
  await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');await expect(page.locator('#menu')).toHaveAttribute('aria-label','Show sidebar');
  const geometry=()=>page.evaluate(()=>({side:document.querySelector('#side').getBoundingClientRect().width,feed:document.querySelector('.feed-wrap').getBoundingClientRect().left}));
  const g=await geometry();assert.equal(g.side,0);assert.ok(g.feed<=8,'feed left '+g.feed);
  await page.focus('#menu');for(let i=0;i<25;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#side')),false,'Tab never lands in the hidden sidebar');}
  await fits(page,'sidebar hidden 1280x800');await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');
  await h.reloadSettled(ctx,page,{local:['afb.sidebar','hidden'],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  assert.deepEqual(await geometry(),g,'reload keeps the sidebar hidden');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
  await page.keyboard.press('Control+b');await expect.poll(async()=>(await geometry()).side).toBeGreaterThan(100);await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');
  assert.equal(await page.evaluate(()=>localStorage.getItem('afb.sidebar')),'shown');clean(log);
 }finally{await ctx.close();}
});

test('AC13: with Storage reads and writes throwing the page loads and the toggle still works',async()=>{
 const project=fixture(),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(project),dialog:'accept'});try{
  await page.addInitScript(()=>{const fail=()=>{throw new DOMException('Storage denied','SecurityError');};Storage.prototype.getItem=fail;Storage.prototype.setItem=fail;});
  await page.reload();await page.evaluate(async()=>{await window.__fakefs?.ready;await window.__boardTest?.ready;});await h.openBoardViaUi(page);
  await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');assert.equal(await page.locator('#side').evaluate(el=>el.getBoundingClientRect().width),0);
  await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');clean(log);
 }finally{await ctx.close();}
});

test('AC14: with nothing saved the sidebar starts hidden on narrow or short windows and shown at 1280x800',async()=>{
 for(const [width,height,shown] of [[900,500,false],[1280,460,false],[1280,800,true]]){
  const {ctx,page,log}=await boot({viewport:{width,height}});try{
   await expect(page.locator('#menu')).toHaveAttribute('aria-expanded',String(shown));
   assert.equal(await page.locator('#side').evaluate(el=>el.getBoundingClientRect().width>0),shown,`${width}x${height}`);clean(log);
  }finally{await ctx.close();}
 }
});

test('AC15: the phone drawer starts closed, opens under the header, closes on Escape and after picking a topic',async()=>{
 const {ctx,page,log}=await boot({viewport:{width:390,height:640}});try{
  await expect(page.locator('#side')).toBeHidden();await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
  await page.click('#menu');await expect(page.locator('#side')).toBeVisible();await expect(page.locator('#sideScrim')).toBeVisible();
  const at=await page.evaluate(()=>[document.querySelector('#side').getBoundingClientRect().top,document.querySelector('.top').getBoundingClientRect().bottom]);
  assert.ok(Math.abs(at[0]-at[1])<=1,'drawer top '+at.join(' vs '));
  await page.keyboard.press('Escape');await expect(page.locator('#side')).toBeHidden();assert.equal(await page.evaluate(()=>document.activeElement.id),'menu');
  await page.click('#menu');await page.locator('#sideScrim').click({position:{x:370,y:400}});await expect(page.locator('#side')).toBeHidden();
  await page.click('#menu');await page.locator('.tcard[data-tk="room:product|T003"]').click();
  await expect(page.locator('#side')).toBeHidden();await expect(page.locator('#title')).toHaveText('# product › T003 Language policy');assert.equal(await page.evaluate(()=>document.activeElement.id),'menu');clean(log);
 }finally{await ctx.close();}
});

test('AC17 (non-vacuity): without the persistence write the reload step of AC13 fails',async()=>{
 const html=h.fs.readFileSync(h.BOARD_HTML,'utf8'),write='try{localStorage.setItem(SIDEBAR_KEY,sidebarChoice);}catch(e){}',mutated=html.replace(write,'');
 assert.equal(html.split(write).length,2,'the persistence write exists once');assert.notEqual(mutated,html);
 const file=h.path.join(h.tmpDir('afb-layout-mutant-'),'board.html');h.fs.writeFileSync(file,mutated);
 const project=fixture(),{ctx,page,log}=await h.openPage(browser,{html:file,tree:h.readTree(project),dialog:'accept'});try{
  await h.openBoardViaUi(page);await page.click('#menu');await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','false');
  await h.reloadSettled(ctx,page,{lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  await expect(page.locator('#menu')).toHaveAttribute('aria-expanded','true');clean(log);
 }finally{await ctx.close();}
});

test('options load folded in a short window without overwriting the saved choice, and open again on request',async()=>{
 const {ctx,page,log}=await boot();try{
  await h.expandComposer(page);assert.equal(await page.evaluate(()=>S.composerOptionsOpen),true);
  await page.setViewportSize({width:1280,height:600});await h.reloadSettled(ctx,page,{setting:['composerOptionsOpen',true],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false,'folded at 600px tall');assert.equal(await page.evaluate(()=>S.composerOptionsOpen),true,'saved preference kept');
  await page.evaluate(()=>{S.threadOrder='newest';saveSettings();});assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false,'another setting does not reopen it');
  await page.locator('#composerOptions > summary').click();assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),true);
  await page.evaluate(()=>{S.threadOrder='stable';saveSettings();});assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),true,'an explicit open stays open');
  await page.setViewportSize({width:1280,height:800});await h.reloadSettled(ctx,page,{setting:['composerOptionsOpen',true],lastDir:true});await page.waitForFunction(()=>window.__boardTest.getModel()!==null);
  assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),true,'a tall window restores the saved choice');clean(log);
 }finally{await ctx.close();}
});

test('phones: the search is a button that expands over the bar; "/" opens it; icons keep their names',async()=>{
 const {ctx,page,log}=await boot({viewport:{width:390,height:844}});try{
  const box=()=>page.locator('.top .search').boundingBox();
  assert.ok((await box()).width<=40,'collapsed search');
  await page.locator('#q').click();assert.ok((await box()).width>=300,'expanded over the bar');await page.keyboard.type('schema');
  await expect.poll(()=>page.locator('#feed').innerText()).toMatch(/schema/i);await page.locator('#cBody').click();assert.ok((await box()).width<=40,'collapses again, query kept');assert.equal(await page.inputValue('#q'),'schema');
  await page.keyboard.press('Tab');await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('/');await expect(page.locator('#q')).toBeFocused();assert.ok((await box()).width>=300);
  for(const id of ['structuredOpen','notificationsOpen']){const b=page.locator('#'+id);assert.ok((await b.textContent()).trim().length>0,id+' keeps its text');assert.equal(await b.getAttribute('title'),(await b.textContent()).trim());}
  await fits(page,'390x844');clean(log);
 }finally{await ctx.close();}
});
