'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers');
let browser;before(async()=>browser=await h.launch());after(async()=>browser.close());
async function boot(project=h.layoutExample(h.tmpDir('afb-compact-'))){const s=await h.openPage(browser,{tree:h.readTree(project),dialog:'accept'});await h.openBoardViaUi(s.page);return {...s,project};}
const clean=log=>{assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);};
const messages=page=>page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt')));
async function setting(page,id,value=true){await page.click('#gear');await page.locator('#'+id).setChecked(value);await page.click('#sClose');}
const fold=page=>page.locator('#composerOptions > summary');

test('compact options preserve routing, draft, reply and attachment through keyboard collapse and refresh',async()=>{
 const {ctx,page,log}=await boot();try{
  assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false);assert.equal(await page.locator('#cWhere').isVisible(),false);assert.equal(await page.locator('#cBody').isVisible(),true);assert.equal(await page.locator('#send').isVisible(),true);assert.equal(await page.locator('#composerTarget').isVisible(),true);
  const before=await messages(page);await page.fill('#cBody','Keep this unposted draft');
  const article=page.locator('article.msg').first();await article.hover();await article.locator('[data-reply]').click();const reply=await page.locator('#replyName').innerText();
  await page.click('#structuredOpen');await page.selectOption('#structuredExample','report-v1');await page.click('#structuredLoad');await page.click('#structuredValidate');await page.waitForSelector('#structuredPreview .report-content');await page.click('#structuredAttach');assert.equal(await page.locator('#structuredAttachment').isVisible(),true);
  await fold(page).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),true);assert.equal(await page.locator('#cWhere').isVisible(),false,'routing stays under Advanced');
  await page.locator('#composerAdvanced > summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#cWhere').isVisible(),true);
  await page.selectOption('#cWhere','room:architecture');await h.startNewRoom(page);await page.fill('#cNewRoom','New Review Room');await page.selectOption('#cTo','human-owner-01');await page.selectOption('#cStatus','REQUEST');await page.selectOption('#cContentType','text/markdown');await page.selectOption('#cLang','pl');await page.selectOption('#cThread','');await page.fill('#cNewThread','A focused review');
  await fold(page).focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false);
  const route=await page.locator('#composerTarget').textContent(),to=await page.locator('#composerTo').textContent(),options=await page.locator('#composerOptionsSummary').textContent();
  for(const text of ['new-review-room','A focused review'])assert.ok(route.includes(text),text);assert.ok(to.includes('human-owner-01'),to);for(const text of ['Markdown','pl'])assert.ok(options.includes(text),text);
  assert.equal(await page.locator('#cNewRoom').isVisible(),true,'a typed room name stays visible with the options collapsed');assert.equal(await page.locator('#cNewThread').isVisible(),true);
  assert.equal(await page.locator('#cStatusPreview').innerText(),'REQUEST');assert.equal(await page.inputValue('#cBody'),'Keep this unposted draft');assert.equal(await page.locator('#replyName').innerText(),reply);assert.equal(await page.locator('#structuredAttachment').isVisible(),true);
  await page.locator('#cBody').evaluate(el=>el.setSelectionRange(2,8));const n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click('#reload');await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  assert.equal(await page.inputValue('#cBody'),'Keep this unposted draft');assert.deepEqual(await page.locator('#cBody').evaluate(el=>[el.selectionStart,el.selectionEnd]),[2,8]);assert.equal(await page.locator('#composerTarget').textContent(),route);assert.equal(await page.locator('#composerTo').textContent(),to);assert.equal(await page.locator('#composerOptionsSummary').textContent(),options);assert.equal(await page.locator('#replyName').innerText(),reply);assert.equal(await page.locator('#structuredAttachment').isVisible(),true);
  assert.deepEqual(await messages(page),before);await h.reloadSettled(ctx,page,{setting:['composerOptionsOpen',false],lastDir:true});assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false);clean(log);
 }finally{await ctx.close();}
});

test('a basic message posts from the collapsed composer through the normal immutable writer',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.selectOption('#me','human-owner-01');await h.openView(page,'room:product|T003');const before=await messages(page);await page.fill('#cBody','Posted with compact message controls');await page.click('#send');await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('Posted with compact message controls')));
  const after=await messages(page);assert.equal(after.length,before.length+1);for(const f of before)assert.deepEqual(after.find(x=>x.path===f.path),f);assert.equal(await page.locator('#composerOptions').evaluate(el=>el.open),false);
  assert.match(after.find(f=>f.text.includes('Posted with compact message controls')).text,/^THREAD: T003-/m);
  const out=h.tmpDir('afb-compact-posted-');await h.dumpFakeFs(page,out);const v=h.boardctl(['validate','--path',out]);assert.equal(v.code,0,v.err);clean(log);
 }finally{await ctx.close();}
});

test('browser session lifecycle is quiet by default and announcements require explicit opt in',async()=>{
 const {ctx,page,log}=await boot();try{
  const before=await messages(page);await page.selectOption('#me','human-owner-01');await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Browser session active'));
  await page.selectOption('#me','research-agent-01');await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.path.includes('/presence/human-owner-01/')&&JSON.parse(f.text).status==='released'));
  assert.deepEqual(await messages(page),before);
  await setting(page,'presenceAnnouncements');await page.selectOption('#me','human-owner-01');await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Browser session active'));await page.selectOption('#me','research-agent-01');await page.waitForFunction(()=>window.__fakefs.dump().filter(f=>f.path.includes('_session-release-')).length===1);
  const notices=(await messages(page)).filter(f=>/_session-(?:start|release)-/.test(f.path));assert.equal(notices.length,2);await page.click('#reload');assert.doesNotMatch(await page.locator('#feed').innerText(),/Session (?:start|release): identifier human-owner-01/);
  await setting(page,'showPresenceNotices');assert.match(await page.locator('#feed').innerText(),/Session start: identifier human-owner-01/);assert.match(await page.locator('#feed').innerText(),/Session release: identifier human-owner-01/);clean(log);
 }finally{await ctx.close();}
});

test('historical routine notices stay inspectable through search or explicit topic while material handoffs remain visible',async()=>{
 const project=h.layoutExample(h.tmpDir('afb-historical-presence-')),id='research-agent-01',run=args=>{const r=h.boardctl(args);assert.equal(r.code,0,r.err);return r;};
 run(['session','start',id,'--path',project,'--session','history-session','--summary','Routine arrival','--runtime','test','--announce']);run(['session','release',id,'--path',project,'--session','history-session','--summary','Routine goodbye','--announce']);run(['post','--path',project,'--from',id,'--to','all','--scope','room','--room','general','--thread','T001','--slug','material-handoff','--body','Material handoff: review remains assigned to the reviewer.']);
 run(['session','start',id,'--path',project,'--session','targeted-session','--summary','Coordination needed: '+ 'Context '.repeat(400)+' Need @human-owner-01 to coordinate the handoff','--runtime','test','--announce']);run(['session','release',id,'--path',project,'--session','targeted-session','--summary','No assignment accepted']);
 const {ctx,page,log}=await boot(project);try{
  const before=await messages(page);assert.doesNotMatch(await page.locator('#feed').innerText(),/Routine arrival|Routine goodbye/);assert.match(await page.locator('#feed').innerText(),/Coordination needed:/);assert.match(await page.locator('#feed').innerText(),/Material handoff:/);
  await page.fill('#q','Session start: identifier');await page.waitForFunction(()=>document.querySelector('#feed').textContent.includes('Session start: identifier'));await page.fill('#q','');await page.waitForFunction(()=>!document.querySelector('#feed').textContent.includes('Routine arrival'));
  await page.locator('.tcard[data-tk="room:general|T000"]').click();assert.match(await page.locator('#feed').innerText(),/Session start: identifier/);assert.match(await page.locator('#feed').innerText(),/Session release: identifier/);
  assert.deepEqual(await messages(page),before);clean(log);
 }finally{await ctx.close();}
});

test('compact and expanded composers fit phone layouts in both languages and all themes',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.setViewportSize({width:390,height:844});await page.fill('#cBody','Retained phone draft');
  for(const theme of ['light','dark','dracula'])for(const lang of ['en','pl']){
   await page.click('#gear');await page.selectOption('#sTheme',theme);await page.selectOption('#sLang',lang);await page.click('#sClose');
   const closed=await page.locator('#composer').boundingBox();assert.ok(closed.height<=260,theme+'/'+lang+' compact height');assert.equal(await page.locator('#signingNotice .signing-notice-action').isVisible(),true,theme+'/'+lang+' the offer to sign stays on the compact status line (SPEC-002-065)');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:'/tmp/afb-composer-'+theme+'-'+lang+'-phone.png'});
   await page.locator('#feed').evaluate(el=>el.scrollTop=el.scrollHeight);await fold(page).click();assert.ok(await page.locator('#feed').evaluate(el=>el.scrollHeight-el.scrollTop-el.clientHeight<2),'expanding retains the live edge');const opened=await page.locator('#composer').boundingBox();assert.ok(opened.height>closed.height+30);assert.equal(await page.locator('#cBody').isVisible(),true);assert.equal(await page.locator('#send').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await fold(page).click();assert.equal(await page.inputValue('#cBody'),'Retained phone draft');
  }clean(log);
 }finally{await ctx.close();}
});

test('secondary tools collapse into a keyboard menu that fits phones and restores focus after dialogs',async()=>{
 const {ctx,page,log}=await boot();try{
  assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),false);assert.equal(await page.locator('#vocabularyOpen').isVisible(),false);assert.equal(await page.locator('#structuredOpen').isVisible(),true);assert.equal(await page.locator('#notificationsOpen').isVisible(),true);
  await page.fill('#cBody','Keep writing while tools are closed');const before=await messages(page);
  await page.locator('#toolbarToolsToggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'vocabularyOpen');await page.keyboard.press('Enter');assert.equal(await page.locator('#vocabulary').evaluate(el=>el.open),true);assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),false);
  await page.click('#vocabularyClose');assert.equal(await page.evaluate(()=>document.activeElement.id),'toolbarToolsToggle');assert.equal(await page.inputValue('#cBody'),'Keep writing while tools are closed');
  await page.setViewportSize({width:390,height:844});await page.click('#toolbarToolsToggle');const box=await page.locator('#toolbarToolsPanel').boundingBox();assert.ok(box.x>=8&&box.x+box.width<=382&&box.y>=8&&box.y+box.height<=836);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'toolbarToolsToggle');
  await page.click('#toolbarToolsToggle');await page.click('#cBody');assert.equal(await page.locator('#toolbarTools').evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'cBody');
  assert.deepEqual(await messages(page),before);clean(log);
 }finally{await ctx.close();}
});


test('expanded options use shorter bounded routing groups on desktop tablet and phone',async()=>{
 const {ctx,page,log}=await boot();try{
  const before=await messages(page);await h.openView(page,'room:product|T003');await h.expandComposer(page);await page.fill('#cBody','Keep draft while arranging options');
  await page.locator('#cThread option:checked').evaluate(el=>el.textContent='T003 · '+ 'A long topic title '.repeat(20));
  for(const [width,oldHeight] of [[1280,107],[820,142],[390,340]]){
   await page.setViewportSize({width,height:900});
   const bounds=await page.locator('#composerOptions .ctx').evaluate(el=>{
    const r=el.getBoundingClientRect();return {height:el.scrollHeight,overflow:el.scrollWidth>el.clientWidth,fields:[...el.querySelectorAll('input,select,button')].filter(x=>getComputedStyle(x).display!=='none').map(x=>{const b=x.getBoundingClientRect();return {id:x.id,left:b.left-r.left,right:b.right-r.left,width:b.width};}),width:r.width};
   });
   assert.ok(bounds.height<oldHeight,width+' options are shorter than the previous layout: '+bounds.height+' vs '+oldHeight);assert.equal(bounds.overflow,false);
   for(const f of bounds.fields){assert.ok(f.width>20&&f.left>=-1&&f.right<=bounds.width+1,width+' bounded field '+f.id);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#cBody').isVisible(),true);assert.equal(await page.locator('#send').isVisible(),true);
   // SPEC-002-068: the topic view names the destination, so the chip row is hidden and Change sits next to Post.
   assert.equal(await page.locator('#composerTargetRow').isHidden(),true);const change=await page.locator('#composerTargetChange').boundingBox();assert.ok(change.x>=0&&change.x+change.width<=width,width+' change destination within bounds');
   await page.screenshot({path:'/tmp/afb-dense-options-'+width+'.png'});
  }
  await page.selectOption('#cThread','');assert.equal(await page.locator('#cNewThread').isVisible(),true);assert.equal(await page.locator('#cNewThread').evaluate(el=>el.closest('#composerTargetFields')!==null),true,'the topic name sits with the destination, not in Advanced');await page.fill('#cNewThread','Compact new topic');
  assert.equal(await page.inputValue('#cBody'),'Keep draft while arranging options');assert.deepEqual(await messages(page),before);clean(log);
 }finally{await ctx.close();}
});
