"use strict";
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const h=require('./lib/helpers');
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const AT=new Date('2026-10-15T10:30:00Z');
async function boot(files={}){
  const proj=h.layoutExample(h.tmpDir());
  for(const [path,text] of Object.entries(files)){const file=h.path.join(proj,'.agent-board',path);h.fs.mkdirSync(h.path.dirname(file),{recursive:true});h.fs.writeFileSync(file,text);}
  const s=await h.openPage(browser,{tree:h.readTree(proj),clock:AT});await h.openBoardViaUi(s.page);return {...s,proj};
}
async function refresh(page){const n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click('#reload');await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);}
function message(label,extra='',body='Ordinary reply with an old topic label.'){
  return `FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: product\nTHREAD: ${label}\nDATE: 2026-10-15 12:31\nPOSTED-AT: 2026-10-15T10:31:00.000Z\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n${extra}---\n${body}\n`;
}
test('explicit full topic title survives later stale replies, refresh and reload',async()=>{
  const {ctx,page,proj,log}=await boot();
  await page.click(".tcard[data-tk='room:product|T003']");
  const title='API v2: keep IDs — do not rename';
  await page.fill('#topicTitle',title);await page.click('#setTitle');
  await page.waitForFunction(title=>document.querySelector('#title').textContent.endsWith(title),title);
  const sent=(await page.evaluate(()=>window.__fakefs.dump())).find(f=>f.text.includes('TOPIC-TITLE: '+title));assert.ok(sent);
  const stale='.agent-board/rooms/product/2026-10-15_1231_research-agent-01_T003_stale.txt';
  await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text),{path:stale,text:message('T003-obsolete-label')});
  await refresh(page);
  assert.equal(await page.textContent('#title'),'T003 · '+title);
  assert.equal(await page.textContent(".tcard[data-tk='room:product|T003'] .ttl"),title);
  assert.match(await page.textContent('#cThread option:checked'),/API v2: keep IDs/);
  await page.fill('#cBody','Continue without changing the purpose');await page.click('#send');
  await page.waitForFunction(()=>window.__boardTest.getModel().msgs.some(m=>m.body==='Continue without changing the purpose'));
  assert.equal(await page.textContent('#title'),'T003 · '+title);
  await h.reloadSettled(ctx,page,{lastDir:true});await page.waitForSelector('#feed article');
  assert.equal(await page.textContent('#title'),'T003 · '+title);
  const out=h.path.join(proj,'validated');await h.dumpFakeFs(page,out);const check=h.boardctl(['validate','--path',out]);assert.equal(check.code,0,check.err);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
test('older title-change files remain authoritative and ordinary message subjects never rename the initial title',async()=>{
  const {ctx,page}=await boot({
    'rooms/product/2026-10-15_1230_research-agent-01_T003_topic-title-stable-guidance.txt':message('T003-stable-guidance').replace('10:31:00.000Z','10:30:00.000Z'),
    'rooms/product/2026-10-15_1231_research-agent-01_T003_stale.txt':message('T003-stale')
  });
  await page.click(".tcard[data-tk='room:product|T003']");assert.equal(await page.textContent('#title'),'T003 · Stable guidance');
  await ctx.close();
  const s=await boot({'rooms/product/2026-10-15_1231_research-agent-01_T003_stale.txt':message('T003-stale')});
  await s.page.click(".tcard[data-tk='room:product|T003']");assert.match(await s.page.textContent('#title'),/Language policy/);await s.ctx.close();
});
test('room and topic Markdown guidance render safely without renaming, and posting guidance follows the composer destination',async()=>{
  const {ctx,page,log}=await boot({
    'rooms/product/GUIDANCE.md':'# Product purpose\n\nPost **decisions** here.\n\n| Kind | Action |\n|---|---|\n|Question|Ask owner|\n\n<img src="https://example.invalid/no" onerror="alert(1)">',
    'rooms/product/topics/T003.md':'# Keep language decisions here\n\n- Parent\n  - Child guidance',
    'rooms/architecture/GUIDANCE.md':'# Architecture only\n\nKeep schema review in this room.'
  });
  await page.click(".tcard[data-tk='room:product|T003']");const original=await page.textContent('#title');
  await page.click('#guidanceOpen');
  await page.waitForSelector('#guidanceDocs h1');
  assert.equal(await page.locator('#guidanceDocs h1').count(),2);assert.equal(await page.locator('#guidanceDocs table tbody tr').count(),1);
  assert.match(await page.textContent('#guidanceDocs ul ul'),/Child guidance/);assert.equal(await page.locator('#guidanceDocs img').count(),0);
  assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);
  await page.setViewportSize({width:375,height:812});assert.ok((await page.locator('#guidanceDialog').boundingBox()).width<=375);
  await page.click('#guidanceClose');assert.equal(await page.textContent('#title'),original);
  await page.setViewportSize({width:1280,height:800});await page.selectOption('#cWhere','room:architecture');
  await page.fill('#cBody','Preserve my different destination draft');await page.click('#composeGuidance');
  assert.match(await page.textContent('#guidanceTitle'),/architecture/);assert.match(await page.textContent('#guidanceDocs'),/Architecture only/);
  await page.click('#guidanceClose');assert.equal(await page.inputValue('#cBody'),'Preserve my different destination draft');assert.equal(await page.textContent('#title'),original);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
test('uploaded guidance detects invalid UTF8; missing files are optional and separate from read errors',async()=>{
  const proj=h.layoutExample(h.tmpDir()),path=h.path.join(proj,'.agent-board/rooms/product/GUIDANCE.md');h.fs.writeFileSync(path,Buffer.from([0xff,0xfe,0xff]));
  const {ctx,page}=await h.openPage(browser);await page.setInputFiles('#fallback',proj);await page.waitForSelector('#feed article');
  await page.click(".tcard[data-tk='room:product|T003']");await page.click('#guidanceOpen');
  await page.waitForSelector('#guidanceDocs .metadata-error');
  assert.equal(await page.locator('#guidanceDocs .metadata-error').count(),1);assert.match(await page.textContent('#guidanceDocs'),/No optional guidance file here/);
  await ctx.close();
});

test('guidance bodies load on demand; wrong-kind files remain errors rather than missing',async()=>{
  const proj=h.layoutExample(h.tmpDir());
  const base=h.path.join(proj,'.agent-board/rooms/product');
  h.fs.writeFileSync(h.path.join(base,'GUIDANCE.md'),'# Read only on demand');
  h.fs.writeFileSync(h.path.join(base,'topics'),'Not a directory');
  const {ctx,page}=await h.openPage(browser,{tree:h.readTree(proj)});
  await page.evaluate(async()=>{
    window.guideReads=0;
    const root=await window.showDirectoryPicker(),board=await root.getDirectoryHandle('.agent-board'),rooms=await board.getDirectoryHandle('rooms'),room=await rooms.getDirectoryHandle('product'),file=await room.getFileHandle('GUIDANCE.md');
    const proto=Object.getPrototypeOf(file),original=proto.getFile;
    proto.getFile=async function(){const result=await original.call(this);if(this.name==='GUIDANCE.md'){const text=result.text;result.text=async()=>{window.guideReads++;return text();};}return result;};
  });
  await h.openBoardViaUi(page);assert.equal(await page.evaluate(()=>window.guideReads),0);
  await page.click(".tcard[data-tk='room:product|T003']");await page.click('#guidanceOpen');await page.waitForSelector('#guidanceDocs h1');
  assert.equal(await page.evaluate(()=>window.guideReads),1);
  assert.equal(await page.locator('#guidanceDocs .metadata-error').count(),1);
  assert.doesNotMatch(await page.textContent('#guidanceDocs'),/No optional guidance/);
  await page.click('#guidanceClose');await page.click('#guidanceOpen');assert.equal(await page.evaluate(()=>window.guideReads),1);
  await ctx.close();
  const other=h.layoutExample(h.tmpDir());h.fs.mkdirSync(h.path.join(other,'.agent-board/rooms/product/GUIDANCE.md'));
  const s=await h.openPage(browser,{tree:h.readTree(other)});await h.openBoardViaUi(s.page);
  await s.page.click(".tcard[data-tk='room:product|T003']");await s.page.click('#guidanceOpen');assert.equal(await s.page.locator('#guidanceDocs .metadata-error').count(),1);await s.ctx.close();
});

test('explicit title metadata wins even when body resembles a receipt; direct guidance requires a pair member',async()=>{
  const pair='implementation-agent-01--research-agent-01';
  const {ctx,page}=await boot({
    'rooms/product/2026-10-15_1231_research-agent-01_T003_title.txt':message('T003-purpose','TOPIC-TITLE: Stable purpose\n','Read receipt only: explicit title metadata still applies.'),
    [`direct/${pair}/GUIDANCE.md`]:'# Members only guidance\n\nReview pending schemas.'
  });
  await page.click(".tcard[data-tk='room:product|T003']");assert.equal(await page.textContent('#title'),'T003 · Stable purpose');
  await page.click(`.fname[data-nav='direct'][data-dir='${pair}']`);await page.click('#guidanceOpen');
  assert.equal(await page.locator('#guidanceDocs .metadata-error').count(),1);assert.doesNotMatch(await page.textContent('#guidanceDocs'),/Members only/);
  await page.click('#guidanceClose');await page.selectOption('#me','implementation-agent-01');await page.click('#guidanceOpen');
  await page.waitForSelector('#guidanceDocs h1');assert.match(await page.textContent('#guidanceDocs'),/Members only guidance/);await ctx.close();
});

test('guidance explains the convention and links original room/topic files to both editors',async()=>{
  const {ctx,page,log}=await boot({'rooms/product/GUIDANCE.md':'# Room rules','rooms/product/topics/T003.md':'# Topic rules'});
  await page.click(".tcard[data-tk='room:product|T003']");await page.click('#guidanceOpen');await page.waitForSelector('#guidanceDocs h1');
  assert.match(await page.textContent('#guidanceDialog'),/before posting or accepting work/);
  assert.match(await page.textContent('#guidanceDialog'),/boardctl guidance/);
  assert.match(await page.textContent('#guidanceDialog'),/do not override the board convention/);
  assert.equal(await page.locator('#guidanceDocs [href]').count(),0);
  const root="/Users/Someone/Board #1 % 🦊/.agent-board";
  await page.fill('#guidanceFolder',root);
  for(const path of ['rooms/product/GUIDANCE.md','rooms/product/topics/T003.md']){
    const section=page.locator(`[data-guidance-path='${path}']`),encoded=(root+'/'+path).split('/').map(encodeURIComponent).join('/');
    assert.equal(await section.getByRole('link',{name:'Open',exact:true}).getAttribute('href'),'agent-file-board://open'+encoded);
    assert.equal(await section.getByRole('link',{name:'Open in VS Code',exact:true}).getAttribute('href'),'vscode://file'+encoded);
  }
  await page.click('#guidanceClose');await page.click('#guidanceOpen');assert.equal(await page.inputValue('#guidanceFolder'),root);
  await page.fill('#guidanceFolder','../another-board');assert.equal(await page.locator('#guidanceDocs [href]').count(),0);
  await page.setViewportSize({width:375,height:812});assert.ok((await page.locator('#guidanceDialog').boundingBox()).width<=375);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('editor links handle Windows paths, reject traversal and stay unavailable for missing files or other direct participants',async()=>{
  const {ctx,page}=await boot({'direct/implementation-agent-01--research-agent-01/GUIDANCE.md':'# Pair rules'});
  await page.click(".fname[data-nav='direct'][data-dir='implementation-agent-01--research-agent-01']");await page.click('#guidanceOpen');
  await page.fill('#guidanceFolder','/Users/Someone/.agent-board');assert.equal(await page.locator('#guidanceDocs [href]').count(),0);
  await page.click('#guidanceClose');await page.selectOption('#me','implementation-agent-01');await page.click('#guidanceOpen');await page.waitForSelector('#guidanceDocs h1');
  assert.equal(await page.locator('#guidanceDocs [href]').count(),2);
  const result=await page.evaluate(()=>({
    windows:window.__boardTest.guidanceEditorUrls('C:\\Boards\\My board\\.agent-board','rooms/general/GUIDANCE.md'),
    invalid:['relative/path','/tmp/../secret','/tmp/./board','//server/share','/tmp/\u0000'].map(root=>window.__boardTest.guidanceEditorUrls(root,'rooms/general/GUIDANCE.md')),
    trailingSpace:window.__boardTest.guidanceEditorUrls("/tmp/board ","rooms/general/GUIDANCE.md"),
    posix:window.__boardTest.guidanceEditorUrls("/Users/me/Board\\Archive/.agent-board","rooms/general/GUIDANCE.md"),
    badFile:window.__boardTest.guidanceEditorUrls('/tmp/board','rooms/general/run.sh')
  }));
  assert.equal(result.windows.vscode,'vscode://file/C%3A/Boards/My%20board/.agent-board/rooms/general/GUIDANCE.md');assert.equal(result.trailingSpace.open,'agent-file-board://open/tmp/board%20/rooms/general/GUIDANCE.md');assert.equal(result.posix.vscode,'vscode://file/Users/me/Board%5CArchive/.agent-board/rooms/general/GUIDANCE.md');assert.deepEqual(result.invalid,[null,null,null,null,null]);assert.equal(result.badFile,null);
  await ctx.close();
});

test('missing guidance offers create actions and switches to open after an empty file appears',async()=>{
  const {ctx,page,log}=await boot();
  await page.click(".tcard[data-tk='room:product|T003']");await page.click('#guidanceOpen');await page.fill('#guidanceFolder','/Users/Someone/Board #1/.agent-board');
  const root='/Users/Someone/Board%20%231/.agent-board/';
  for(const path of ['rooms/product/GUIDANCE.md','rooms/product/topics/T003.md']){
    const section=page.locator(`[data-guidance-path='${path}']`);
    assert.equal(await section.getByRole('link',{name:'Create a file',exact:true}).getAttribute('href'),'agent-file-board://create'+root+path);
    assert.equal(await section.getByRole('link',{name:'Create in VS Code',exact:true}).getAttribute('href'),'agent-file-board://create-vscode'+root+path);
  }
  assert.match(await page.textContent('#guidanceDialog'),/templates\/room-guidance.md/);
  await page.evaluate(()=>window.__fakefs.addFile('.agent-board/rooms/product/GUIDANCE.md',''));
  await page.click('#guidanceClose');await refresh(page);await page.click('#guidanceOpen');
  assert.equal(await page.locator("[data-guidance-path='rooms/product/GUIDANCE.md']").getByRole('link',{name:'Open',exact:true}).count(),1);
  assert.equal(await page.locator("[data-guidance-path='rooms/product/topics/T003.md']").getByRole('link',{name:'Create a file',exact:true}).count(),1);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
