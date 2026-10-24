'use strict';
// SPEC-002-075: every tool dialog uses one shell: one size system (wide, compact, full-screen phone sheet),
// a pinned header with the title and Close top-right, an optional pinned footer with the dialog's own
// actions and never a Close. Each dialog is opened from its real entry point.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {expect}=require('playwright/test');
const h=require('./lib/helpers');
const native=require('./lib/signing-browser');
let browser,server,url;
before(async()=>{
  browser=await h.launch();
  server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

// Returns every way an open dialog breaks the shell (empty when it conforms), so a mutation can prove it fails.
// tier: 'wide' | 'compact'; below 601px wide or 481px tall every dialog is a full-screen sheet.
function shellViolations(page,id,close,tier='wide'){
  return page.evaluate(async ({id,close,tier})=>{
    const out=[],d=document.getElementById(id);
    if(!d||!d.open)return [`#${id} is not open`];
    const W=innerWidth,H=innerHeight,phone=W<=600||H<=480,near=(a,b,tol=2)=>Math.abs(a-b)<=tol;
    if(!d.classList.contains('afb-dialog'))out.push(`#${id} lacks .afb-dialog`);
    if(d.style.width||d.style.maxWidth||d.style.minWidth)out.push(`#${id} has an inline width`);
    const r=d.getBoundingClientRect();
    if(phone){
      if(!near(r.left,0,1)||!near(r.top,0,1)||!near(r.width,W,1)||!near(r.height,H,1))out.push(`#${id} is not a full-screen sheet: ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${W}x${H}`);
    }else{
      const want=tier==='compact'?Math.min(560,W-32):Math.min(1200,W-48);
      if(!near(r.width,want))out.push(`#${id} width ${r.width.toFixed(1)}, expected ${tier} ${want}`);
      if(tier==='wide'&&r.height>Math.min(0.88*H,960)+2)out.push(`#${id} height ${r.height.toFixed(1)} over ${tier} maximum`);
    }
    const head=d.querySelector(':scope>.afb-dialog-head');
    if(!head)return [...out,`#${id} has no .afb-dialog-head`];
    const button=document.getElementById(close);
    if(!button)return [...out,`#${close} missing`];
    if(!head.contains(button))out.push(`#${close} is not in the header`);
    for(const foot of d.querySelectorAll('.afb-dialog-foot'))if(foot.contains(button))out.push(`#${close} is in a footer`);
    // No other Close anywhere in the dialog: the header Close is the only one.
    const label=button.textContent.trim();
    for(const other of d.querySelectorAll('button'))if(other!==button&&other.textContent.trim()===label&&other.getClientRects().length)out.push(`#${id} has a second "${label}" outside the header`);
    // Close is the right-most header control and sits on the title row.
    const b=button.getBoundingClientRect(),title=head.querySelector('h2')?.getBoundingClientRect();
    for(const c of head.querySelectorAll('button,a,input,select,summary')){
      if(c===button||!c.getClientRects().length)continue;
      const x=c.getBoundingClientRect();if(x.right>b.right+1)out.push(`#${id} header control "${c.textContent.trim()||c.id}" is right of Close`);
    }
    if(title&&(b.bottom<title.top||b.top>title.bottom))out.push(`#${close} is not on the title row`);
    const pinned=()=>{const now=d.getBoundingClientRect(),hr=head.getBoundingClientRect(),br=button.getBoundingClientRect(),hit=document.elementFromPoint(br.left+br.width/2,br.top+br.height/2);
      return {top:hr.top-now.top,inside:br.top>=now.top-0.5&&br.bottom<=now.bottom+0.5&&br.top>=-0.5&&br.bottom<=H+0.5,hit:!!hit&&button.contains(hit)};};
    const atTop=pinned();
    if(atTop.top<-0.5||atTop.top>2)out.push(`#${id} header starts ${atTop.top.toFixed(1)}px below the dialog top`);
    if(!atTop.inside||!atTop.hit)out.push(`#${close} not visible and clickable`);
    // Long content: the header must stay at the top after the dialog body scrolls to its end.
    const spacer=document.createElement('div');spacer.style.height='3000px';spacer.dataset.shellSpacer='';
    const foot=d.querySelector(':scope>.afb-dialog-foot');d.insertBefore(spacer,foot||null);
    const keep=d.scrollTop;d.scrollTop=d.scrollHeight;
    await new Promise(requestAnimationFrame);
    if(d.scrollTop<100)out.push(`#${id} does not scroll its content`);
    const scrolled=pinned();
    if(scrolled.top<-0.5||scrolled.top>2)out.push(`#${id} header left the top after scrolling (${scrolled.top.toFixed(1)}px)`);
    if(!scrolled.inside||!scrolled.hit)out.push(`#${close} not clickable after scrolling`);
    if(foot){const fr=foot.getBoundingClientRect(),now=d.getBoundingClientRect();if(fr.bottom<now.bottom-2||fr.bottom>now.bottom+0.5)out.push(`#${id} footer not pinned to the bottom`);}
    spacer.remove();d.scrollTop=keep;
    if(d.scrollWidth>d.clientWidth+1)out.push(`#${id} scrolls horizontally (${d.scrollWidth}>${d.clientWidth})`);
    if(document.documentElement.scrollWidth>W)out.push(`page scrolls horizontally (${document.documentElement.scrollWidth}>${W})`);
    return out;
  },{id,close,tier});
}

const sidebar=async page=>{if(!await page.locator('button.fname[data-nav="room"][data-dir="architecture"]').isVisible()){await page.click('#menu');await expect(page.locator('#side')).toBeVisible();}};
const room=async page=>{await sidebar(page);await page.click('button.fname[data-nav="room"][data-dir="architecture"]');if(await page.locator('#side.open').count())await page.keyboard.press('Escape');};
const roomMenu=async page=>{
  await sidebar(page);
  await page.click('[data-notification-menu="room"][data-notification-key="architecture"]');await page.click('#sidebarHistorySettings');
};
const versionLine=async page=>{if(await page.locator('#verbar').isVisible())await page.click('#verbar');else await h.openToolbarTool(page,'toolbarVersion');};
const versionOpener=async page=>await page.locator('#verbar').isVisible()?'verbar':'toolbarToolsToggle';
// [dialog id, Close id, tier, open from the real entry point, id focused after Close (the opener)]
const tool=id=>async page=>h.openToolbarTool(page,id);
const DIALOGS=[
  ['vocabulary','vocabularyClose','wide',tool('vocabularyOpen'),'toolbarToolsToggle'],
  ['presenceDialog','presenceClose','wide',tool('presenceOpen'),'toolbarToolsToggle'],
  ['draftsDialog','draftsClose','wide',tool('draftsOpen'),'toolbarToolsToggle'],
  ['extensionsDialog','extensionsClose','wide',tool('extensionsOpen'),'toolbarToolsToggle'],
  ['extensionDiagnosticsDialog','extensionDiagnosticsClose','wide',async page=>{await h.openToolbarTool(page,'extensionsOpen');await page.locator('#extensionsDialog').getByRole('button',{name:'Diagnostics',exact:true}).click();},'toolbarToolsToggle'],
  ['voiceDialog','voiceClose','wide',tool('voiceTools'),'toolbarToolsToggle'],
  ['viewerUpdatesDialog','viewerUpdatesClose','wide',tool('viewerUpdatesTools'),'toolbarToolsToggle'],
  ['signingDialog','signingClose','wide',tool('signingTools'),'toolbarToolsToggle'],
  ['upgradeDialog','upgradeClose','wide',versionLine,versionOpener],
  ['structuredDialog','structuredClose','wide',async page=>{if(await page.locator('#structuredOpen').isVisible())await page.click('#structuredOpen');else await h.openToolbarTool(page,'structuredOpen');},async page=>await page.locator('#structuredOpen').isVisible()?'structuredOpen':'toolbarToolsToggle'],
  ['notificationsDialog','notificationsClose','wide',async page=>{if(await page.locator('#notificationsOpen').isVisible())await page.click('#notificationsOpen');else await h.openToolbarTool(page,'notificationsOpen');},'notificationsOpen'],
  ['locationsDialog','locationsClose','wide',async page=>{await page.click('#folderName');await page.waitForFunction(()=>document.querySelector('#locationsList').getAttribute('aria-busy')==='false');},'folderName'],
  ['repairDialog','repairClose','wide',page=>h.topicAction(page,'repairsOpen'),'repairsOpen'],
  ['guidanceDialog','guidanceClose','wide',page=>h.topicAction(page,'guidanceOpen'),'guidanceOpen'],
  ['historyDialog','historyClose','wide',page=>h.topicAction(page,'historyOpen'),'historyOpen'],
  ['historySettingsDialog','historySettingsClose','wide',roomMenu,'room-menu'],
  ['historyReviewDialog','historyReviewClose','compact',async page=>{await roomMenu(page);await page.locator('#historySettingRecord').check();await page.locator('#historySettingsDialog [data-action="apply"]').click();},'historySettingsApply'],
];

async function checkAll(t,viewport){
  const f=await native.boot(t,browser,url),{page}=f;
  await page.setViewportSize(viewport);await room(page);
  const seen=[];
  for(const [id,close,tier,open,opener] of DIALOGS){
    const expected=typeof opener==='function'?await opener(page):opener;
    await open(page);await expect(page.locator('#'+id)).toBeVisible();
    const at=`${viewport.width}x${viewport.height} #${id}`;seen.push(id);
    assert.deepEqual(await shellViolations(page,id,close,tier),[],at);
    if(viewport.width<=600)assert.deepEqual(await h.layoutViolations(page),[],at+' layout');
    await page.click('#'+close);await expect(page.locator('#'+id)).toBeHidden();
    if(id==='historyReviewDialog'){
      // Close answers "no", like Cancel: nothing is written and the settings say so; focus is back on Review change.
      await expect(page.locator('#historySettingsDialog .history-settings-result')).toHaveText('Not changed.');
      assert.equal(await page.evaluate(()=>document.activeElement?.dataset.action),'apply',at+' focus returns to Review change');
      await page.click('#historySettingsClose');await expect(page.locator('#historySettingsDialog')).toBeHidden();
    }else if(expected==='room-menu')assert.equal(await page.evaluate(()=>document.activeElement?.dataset.notificationKey),'architecture',at+' focus returns to the room menu');
    else assert.equal(await page.evaluate(()=>document.activeElement?.id),expected,at+' focus returns to the opener');
    // A phone drawer opened for the room menu stays out of the next dialog's way.
    if(await page.locator('#side.open').count())await page.keyboard.press('Escape');
  }
  assert.equal(seen.length,17,'all 17 dialogs checked');
  assert.deepEqual(await h.layoutViolations(page),[],`${viewport.width}x${viewport.height} after every dialog closed`);
  return f;
}

test('AC1/AC5: every dialog at 1280x800 is wide, pins its header with Close right-most, keeps footers Close-free and returns focus',async t=>{
  const {page}=await checkAll(t,{width:1280,height:800});
  // Esc still closes, and Keys' own Escape (fold the detail first) is untouched: Esc with no detail open closes the dialog.
  await h.openToolbarTool(page,'vocabularyOpen');await page.keyboard.press('Escape');await expect(page.locator('#vocabulary')).toBeHidden();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'toolbarToolsToggle');
});

test('AC2: at 390x640 every dialog is a full-screen sheet with its header and Close in view and no horizontal scroll',async t=>{
  await checkAll(t,{width:390,height:640});
});

test('AC4: Keys at 1280x800 gets at least 1100px for the list and the detail together, beside each other',async t=>{
  const f=await native.boot(t,browser,url),{page}=f;
  await page.setViewportSize({width:1280,height:800});
  await native.openSigning(page);await page.locator('[data-signing-task=review]').click();
  await native.selectKey(page,await page.locator('#signingKeys [data-key-row]').first().getAttribute('data-key-row'));
  const g=await page.evaluate(()=>{const layout=document.querySelector('.signing-keys-layout').getBoundingClientRect(),list=document.querySelector('#signingKeys').getBoundingClientRect(),detail=document.querySelector('#signingKeyDetail').getBoundingClientRect();
    return {layout:layout.width,span:detail.right-list.left,beside:detail.left>=list.right,list:list.width,detail:detail.width};});
  assert.ok(g.layout>=1100&&g.span>=1100,'Keys content width '+JSON.stringify(g));
  assert.equal(g.beside,true,'detail beside the list');
  assert.deepEqual(await shellViolations(page,'signingDialog','signingClose'),[]);
});

// AC3: the shell is the only CSS that sizes these dialogs. Returns every other rule that does.
const SHELL_DIALOGS=DIALOGS.map(([id])=>id);
function cssWidthRules(html){
  // The page's own style elements start a line; "<style" inside bundled scripts does not.
  const css=[...html.matchAll(/^<style>\n([\s\S]*?)^<\/style>$/gm)].map(m=>m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
  const out=[],subject=new RegExp(`(^|[\\s>+~,(])(dialog|#(${SHELL_DIALOGS.join('|')})|\\.extensions-dialog)(?=$|[.:\\[#\\s,)])`);
  // Flat walk over rules; @media blocks are unwrapped so their rules are seen too.
  for(const m of css.replace(/@media[^{]*\{/g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    const selectors=m[1].trim(),body=m[2];
    if(!/(^|;|\s)(width|max-width|min-width)\s*:/.test(body))continue;
    for(const sel of selectors.split(',').map(s=>s.trim())){
      // The element a selector styles is its last compound; descendants of a dialog do not count.
      const last=sel.split(/\s*[\s>+~]\s*/).pop();
      if(/\.afb-dialog/.test(last))continue;
      // OpenUI report modals and the image viewer are message content, not tool dialogs (outside this spec).
      if(/report-modal|report-image-viewer/.test(last))continue;
      if(subject.test(' '+last))out.push(sel+' {'+body.trim().slice(0,80)+'}');
    }
  }
  // Script-built dialogs must not size themselves inline either.
  for(const name of h.fs.readdirSync(h.path.join(h.ROOT,'scripts')).filter(n=>n.endsWith('.js')&&!n.startsWith('screenshot'))){
    const src=h.fs.readFileSync(h.path.join(h.ROOT,'scripts',name),'utf8');
    for(const m of src.matchAll(/dialog\.style(?:\.(?:width|maxWidth|minWidth)\s*=|\s*=\s*['"][^'"]*width)/g))out.push(name+': '+m[0]);
  }
  return out;
}
test('AC3/AC6: no CSS rule outside the shell sets a width on a tool dialog; restoring an old rule is caught',()=>{
  const html=h.fs.readFileSync(h.BOARD_HTML,'utf8');
  assert.deepEqual(cssWidthRules(html),[]);
  assert.doesNotMatch(html,/#signingDialog\{width:min\(1040px/,'the 1040px signing width is gone');
  // Non-vacuity: the old base rule and the old signing rule are each reported.
  const base=html.replace('<style>\n','<style>\ndialog{width:min(800px,calc(100vw - 32px));max-height:80vh}\n');
  assert.deepEqual(cssWidthRules(base),['dialog {width:min(800px,calc(100vw - 32px));max-height:80vh}']);
  const signing=html.replace('<style>\n','<style>\n@media(min-width:1px){#signingDialog{width:min(1040px,calc(100vw - 32px))}}\n');
  assert.equal(cssWidthRules(signing).length,1);
  const tools=html.replace('<style>\n','<style>\n#presenceDialog,#notificationsDialog .x{max-width:800px}\n');
  assert.deepEqual(cssWidthRules(tools),['#presenceDialog {max-width:800px}']);
});

test('AC6: moving a Close into the body or footer, or restoring an 800px width, fails the shell check',async t=>{
  const proj=h.layoutExample(h.tmpDir());
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(proj)});t.after(()=>ctx.close());
  await h.openBoardViaUi(page);
  await h.openToolbarTool(page,'vocabularyOpen');
  assert.deepEqual(await shellViolations(page,'vocabulary','vocabularyClose'),[]);
  await page.evaluate(()=>{const d=document.getElementById('vocabulary');d.append(document.getElementById('vocabularyClose'));});
  assert.ok((await shellViolations(page,'vocabulary','vocabularyClose')).includes('#vocabularyClose is not in the header'));
  await page.evaluate(()=>{const d=document.getElementById('vocabulary'),foot=document.createElement('div');foot.className='afb-dialog-foot';foot.append(document.getElementById('vocabularyClose'));d.append(foot);});
  const inFoot=await shellViolations(page,'vocabulary','vocabularyClose');
  assert.ok(inFoot.includes('#vocabularyClose is in a footer')&&inFoot.includes('#vocabularyClose is not in the header'),inFoot.join('; '));
  await page.evaluate(()=>{const d=document.getElementById('vocabulary');d.querySelector('.afb-dialog-head').append(document.getElementById('vocabularyClose'));d.querySelector('.afb-dialog-foot').remove();});
  assert.deepEqual(await shellViolations(page,'vocabulary','vocabularyClose'),[]);
  await page.addStyleTag({content:'#vocabulary{width:min(800px,calc(100vw - 32px))}'});
  assert.ok((await shellViolations(page,'vocabulary','vocabularyClose')).some(v=>/width 800\.0, expected wide 1200/.test(v)));
  // A second Close left in the body (the old bottom Close) is caught too.
  await page.evaluate(()=>{const b=document.createElement('button');b.className='btn';b.textContent=document.getElementById('vocabularyClose').textContent;document.getElementById('vocabulary').append(b);});
  assert.ok((await shellViolations(page,'vocabulary','vocabularyClose')).some(v=>v.includes('second "Close"')));
  assert.deepEqual(log.pageErrors,[]);
});

// Settings stays a resizable popover (not a modal), but follows the same header/footer rule: one Close
// at the top right (#sClose, which was Done), only Feedback and Reset at the bottom.
test('Settings: Close is the right-most header control, the footer has no Close, and focus returns to the gear',async t=>{
  const proj=h.layoutExample(h.tmpDir());
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(proj)});t.after(()=>ctx.close());
  await h.openBoardViaUi(page);
  for(const viewport of [{width:1280,height:800},{width:390,height:640}]){
    await page.setViewportSize(viewport);await page.click('#gear');await expect(page.locator('#settings')).toBeVisible();
    const g=await page.evaluate(()=>{const head=document.querySelector('#settings .afb-dialog-head'),foot=document.querySelector('#settings .afb-dialog-foot'),close=document.getElementById('sClose'),b=close.getBoundingClientRect();
      return {inHead:head.contains(close),rightMost:[...head.querySelectorAll('button,a')].every(c=>c===close||c.getBoundingClientRect().right<=b.right+1),
        footClose:[...foot.querySelectorAll('button,a')].some(c=>c===close||/^(Close|Zamknij|Done|Gotowe)$/.test(c.textContent.trim())),label:close.textContent.trim(),
        onScreen:b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth};});
    assert.deepEqual(g,{inHead:true,rightMost:true,footClose:false,label:'Close',onScreen:true},`${viewport.width}x${viewport.height}`);
    await page.click('#sClose');await expect(page.locator('#settings')).toBeHidden();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'gear');
  }
  assert.deepEqual(log.pageErrors,[]);
});
