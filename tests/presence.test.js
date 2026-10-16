"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const AT=new Date('2026-10-15T10:30:00Z');
const ID='research-agent-01';
const lease=(overrides={})=>({version:1,participant:ID,session:'session-one',status:'active',started_at:AT.toISOString(),heartbeat_at:AT.toISOString(),expires_at:'2026-10-15T10:31:00.000Z',runtime:'test-agent',summary:'Implement the parser; can help review tests.',...overrides});
function fixture(records={}){
  const proj=h.layoutExample(h.tmpDir());
  for(const [path,value] of Object.entries(records)){
    const file=h.path.join(proj,'.agent-board/presence',path);h.fs.mkdirSync(h.path.dirname(file),{recursive:true});
    h.fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value));
  }
  return proj;
}
async function open(proj){
  const s=await h.openPage(browser,{tree:h.readTree(proj),clock:AT});await h.openBoardViaUi(s.page);return s;
}
async function refresh(page){
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click('#reload');
  await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
}
const marker=(page,id=ID)=>page.locator(`.msg-head > [data-presence-party='${id}']`).first();

test('active sessions expire without refreshing or disturbing the editor; picking an agent identity does not attach it',async()=>{
  const proj=fixture({[`${ID}/session-one.json`]:lease()});
  const {ctx,page,log}=await open(proj);
  assert.match(await marker(page).getAttribute('class'),/presence-active/);
  assert.equal(await marker(page).textContent(),'●');
  assert.equal(await marker(page,'implementation-agent-01').textContent(),'👻');
  await page.click('#presenceOpen');
  const row=page.locator(`[data-presence-id='${ID}']`);
  assert.match(await row.textContent(),/session-one.*test-agent/s);
  assert.match(await row.textContent(),/Implement the parser; can help review tests/);
  assert.match(await page.textContent('#presenceDialog'),/not a verified connection/);
  await page.click('#presenceClose');
  await page.selectOption('#me','implementation-agent-01');
  assert.equal(await marker(page,'implementation-agent-01').textContent(),'👻');
  await page.click('#gear');await page.uncheck('#rOn');await page.click('#sClose');
  await page.fill('#cBody','Preserve this draft');await page.evaluate(()=>document.querySelector('#cBody').setSelectionRange(3,7));
  await page.evaluate(()=>window.originalMessage=document.querySelector('.msg'));
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);
  assert.equal(await marker(page).textContent(),'👻');
  assert.equal(await page.evaluate(()=>window.originalMessage===document.querySelector('.msg')),true);
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.builds),n);
  assert.deepEqual(await page.evaluate(()=>({id:document.activeElement.id,start:document.querySelector('#cBody').selectionStart,end:document.querySelector('#cBody').selectionEnd})),{id:'cBody',start:3,end:7});
  assert.equal(await page.inputValue('#cBody'),'Preserve this draft');
  assert.match(await page.locator(`#me option[value='${ID}']`).textContent(),/👻/);
  await page.fill('#cBody','@research');assert.equal(await page.locator(`#bodySuggestions [data-presence-party='${ID}']`).textContent(),'👻');
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('malformed leases are unknown, simultaneous live leases conflict, and notices never imply presence',async()=>{
  const records={
    [`${ID}/session-one.json`]:lease(),[`${ID}/session-two.json`]:lease({session:'session-two',summary:'<img src=x onerror=alert(1)> Review requests'}),
    'implementation-agent-01/session-bad.json':'{"version":1,"participant":"wrong"}',
    'human-owner-01/session-released.json':lease({participant:'human-owner-01',session:'session-released',status:'released',expires_at:AT.toISOString()})
  };
  const {ctx,page,log}=await open(fixture(records));
  assert.match(await marker(page).getAttribute('class'),/presence-conflict/);
  assert.match(await marker(page,'implementation-agent-01').getAttribute('class'),/presence-unknown/);
  assert.equal(await marker(page,'human-owner-01').textContent(),'👻');
  await page.click('#presenceOpen');
  assert.equal(await page.locator('#presenceDialog img').count(),0);
  assert.match(await page.textContent('#presenceDialog'),/<img src=x onerror=alert\(1\)>/);
  assert.match(await page.textContent('#presenceDialog'),/could not be read or validated/);
  await page.click('#presenceClose');
  await page.evaluate(id=>window.__fakefs.addFile(`.agent-board/presence/${id}/session-two.json`,JSON.stringify({version:1,participant:id,session:'session-two',status:'released',started_at:'2026-10-15T10:30:00.000Z',heartbeat_at:'2026-10-15T10:30:00.000Z',expires_at:'2026-10-15T10:30:00.000Z',runtime:'test-agent',summary:'Released; parser work is handed off.'})),ID);
  await refresh(page);assert.match(await marker(page).getAttribute('class'),/presence-active/);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('folder uploads include presence and clearly identify the snapshot as non-live',async()=>{
  const proj=fixture({[`${ID}/session-one.json`]:lease()});
  const {ctx,page,log}=await h.openPage(browser,{clock:AT});
  await page.setInputFiles('#fallback',proj);await page.waitForSelector('.msg');
  assert.match(await marker(page).getAttribute('class'),/presence-active/);
  await page.click('#presenceOpen');assert.match(await page.textContent('#presenceSnapshot'),/not live/);
  await page.setViewportSize({width:375,height:812});
  assert.ok((await page.locator('#presenceDialog').boundingBox()).width<=375);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.clock.runFor(61000);
  assert.match(await page.locator(`[data-presence-id='${ID}']`).textContent(),/Ghost/);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('only exact atomic-write temporary names are ignored; malformed and unreadable lease data stays unknown',async()=>{
  const proj=fixture({[`${ID}/session-one.json`]:lease(),[`${ID}/.tmp-${'a'.repeat(32)}`]:'partial'});
  const {ctx,page,log}=await open(proj);
  assert.match(await marker(page).getAttribute('class'),/presence-active/);
  await page.evaluate(id=>window.__fakefs.addFile(`.agent-board/presence/${id}/.tmp-malformed.json`,'{}'),ID);
  await refresh(page);assert.match(await marker(page).getAttribute('class'),/presence-unknown/);
  await page.evaluate(id=>window.__fakefs.removeFile(`.agent-board/presence/${id}/.tmp-malformed.json`),ID);
  await page.evaluate(async id=>{
    const root=await window.showDirectoryPicker(),board=await root.getDirectoryHandle('.agent-board'),presence=await board.getDirectoryHandle('presence'),person=await presence.getDirectoryHandle(id),file=await person.getFileHandle('session-one.json');
    const proto=Object.getPrototypeOf(file),original=proto.getFile;
    proto.getFile=async function(){if(this.name==='session-one.json') throw new DOMException('Read denied','NotAllowedError');return original.call(this);};
  },ID);
  await refresh(page);assert.match(await marker(page).getAttribute('class'),/presence-unknown/);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('canonical CLI start and release records are rendered and historical messages remain valid',async()=>{
  const proj=fixture();
  const start=h.boardctl(['session','start',ID,'--path',proj,'--session','session-integration','--summary','Implement parser; need a schema review.','--runtime','test-cli','--at',AT.toISOString()]);
  assert.equal(start.code,0,start.err);
  const {ctx,page,log}=await open(proj);
  assert.match(await marker(page).getAttribute('class'),/presence-active/);
  assert.match(await page.textContent('#feed'),/Session start: identifier research-agent-01/);
  const release=h.boardctl(['session','release',ID,'--path',proj,'--session','session-integration','--summary','Parser complete; review is still needed.','--at','2026-10-15T10:30:10Z']);
  assert.equal(release.code,0,release.err);
  for(const item of h.fs.readdirSync(h.path.join(proj,'.agent-board/presence',ID))) {
    const path=`.agent-board/presence/${ID}/${item}`;await page.evaluate(({path,text})=>window.__fakefs.addFile(path,text),{path,text:h.fs.readFileSync(h.path.join(proj,path),'utf8')});
  }
  await refresh(page);assert.equal(await marker(page).textContent(),'👻');
  assert.equal(h.boardctl(['validate','--path',proj]).code,0);
  assert.equal(await page.locator(`article[data-author='${ID}']`).count()>0,true);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('unregistered presence directories and stray root files make absence uncertain for every identity',async()=>{
  for(const records of [{'stray.json':'{}'},{'not-registered/session-one.json':lease({participant:'not-registered'})}]){
    const {ctx,page}=await open(fixture(records));
    for(const id of [ID,'implementation-agent-01','human-owner-01']) assert.match(await marker(page,id).getAttribute('class'),/presence-unknown/);
    await ctx.close();
  }
});

const HUMAN='human-owner-01';
const humanRecords=page=>page.evaluate(id=>window.__fakefs.dump().filter(f=>f.path.startsWith(`.agent-board/presence/${id}/`)).map(f=>JSON.parse(f.text)),HUMAN);
async function selectHuman(page){
  await page.selectOption('#me',HUMAN);
  await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Browser session active'));
}
test('explicit human selection starts a valid browser lease, renews with refresh off, and releases on agent selection',async()=>{
  const {ctx,page,log}=await open(fixture());
  assert.equal((await humanRecords(page)).length,0,'default inferred sender must not claim an identity');
  await selectHuman(page);
  const [first]=await humanRecords(page);
  assert.equal(first.participant,HUMAN);assert.equal(first.runtime,'agent-file-board-ui browser');
  assert.equal(Date.parse(first.expires_at)-Date.parse(first.heartbeat_at),900000);
  await page.click('#gear');await page.uncheck('#rOn');await page.click('#sClose');
  await page.fill('#cBody','Keep my draft');await page.evaluate(()=>document.querySelector('#cBody').setSelectionRange(2,5));
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);
  await page.waitForFunction(id=>JSON.parse(window.__fakefs.dump().find(f=>f.path.includes(`/presence/${id}/`)).text).heartbeat_at>'2026-10-15T10:30:00.000Z',HUMAN);
  assert.equal((await humanRecords(page))[0].session,first.session);
  assert.equal(await page.evaluate(()=>window.__boardTest.stats.builds),builds);
  assert.equal(await page.inputValue('#cBody'),'Keep my draft');
  assert.deepEqual(await page.evaluate(()=>[document.activeElement.id,document.querySelector('#cBody').selectionStart,document.querySelector('#cBody').selectionEnd]),['cBody',2,5]);
  await page.selectOption('#me',ID);
  await page.waitForFunction(id=>JSON.parse(window.__fakefs.dump().find(f=>f.path.includes(`/presence/${id}/`)).text).status==='released',HUMAN);
  await page.waitForSelector(`.msg-head > [data-presence-party='${HUMAN}'].presence-ghost`);
  assert.equal(await marker(page,HUMAN).textContent(),'👻');
  const dump=await page.evaluate(()=>window.__fakefs.dump());
  assert.equal(dump.filter(f=>f.path.includes('session-start-')).length,1);
  assert.equal(dump.filter(f=>f.path.includes('session-release-')).length,1);
  assert.equal(dump.some(f=>f.path.startsWith(`.agent-board/presence/${ID}/`)),false);
  const disk=h.tmpDir();await h.dumpFakeFs(page,disk);
  const valid=h.boardctl(['validate','--path',disk]);assert.equal(valid.code,0,valid.err+valid.out);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('browser observes an occupied human identity without taking over or renewing its lease',async()=>{
  const other=lease({participant:HUMAN,session:'session-other',runtime:'another-browser'});
  const {ctx,page}=await open(fixture({[`${HUMAN}/session-other.json`]:other}));
  await page.selectOption('#me',HUMAN);
  await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('another session'));
  assert.deepEqual((await humanRecords(page)).map(r=>r.session),['session-other']);
  assert.equal((await humanRecords(page))[0].heartbeat_at,other.heartbeat_at);
  await page.clock.runFor(61000);
  await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Browser session active'));
  const records=await humanRecords(page);assert.equal(records.length,2);
  assert.equal(records.find(r=>r.session==='session-other').status,'active','foreign history remains untouched');
  assert.equal(records.filter(r=>Date.parse(r.expires_at)>AT.getTime()+61000).length,1);
  await ctx.close();
});

test('read-only uploads never attach humans; invalid presence is surfaced without writing',async()=>{
  const proj=fixture();const {ctx,page}=await h.openPage(browser,{clock:AT});
  await page.setInputFiles('#fallback',proj);await page.waitForSelector('.msg');
  await page.selectOption('#me',HUMAN);await page.clock.runFor(61000);
  assert.equal(await page.evaluate(()=>document.querySelector('#browserPresence').hidden),true);await ctx.close();
  const s=await open(fixture({[`${HUMAN}/session-bad.json`]:'{}'}));
  await s.page.selectOption('#me',HUMAN);
  await s.page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('retry'));
  assert.equal((await humanRecords(s.page)).length,1);
  assert.match(await s.page.getAttribute('#browserPresence','title'),/Invalid or unreadable/);
  await s.ctx.close();
});

test('browser write failures are visible, retry recovers, and changing to an uploaded board releases only the owned session',async()=>{
  const proj=fixture(), {ctx,page,log}=await open(proj);
  await page.evaluate(async()=>{
    const root=await window.showDirectoryPicker(), file=await root.getFileHandle('probe',{create:true}), proto=Object.getPrototypeOf(file);
    window.originalWritable=proto.createWritable;
    proto.createWritable=async function(){if(this.__path.includes('presence')) throw new Error('Permission denied for presence');return window.originalWritable.call(this);};
  });
  await page.selectOption('#me',HUMAN);
  await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('retry'));
  assert.match(await page.getAttribute('#browserPresence','title'),/Permission denied/);
  assert.equal((await humanRecords(page)).length,0,'failed creation leaves no malformed lease');
  await page.evaluate(async()=>{
    window.__fakefs.removeFile('probe');
    const root=await window.showDirectoryPicker(), file=await root.getFileHandle('probe',{create:true});
    Object.getPrototypeOf(file).createWritable=window.originalWritable;window.__fakefs.removeFile('probe');
  });
  await page.click('#presenceOpen');
  await page.click('#browserPresence');
  await page.click('#presenceClose');
  await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Browser session active'));
  const [active]=await humanRecords(page);assert.equal(active.status,'active');
  await page.setInputFiles('#fallback',proj);
  await page.waitForFunction(()=>document.querySelector('#cInfo').textContent.includes('Read-only'));
  const [released]=await humanRecords(page);assert.equal(released.session,active.session);assert.equal(released.status,'released');
  assert.equal(await page.evaluate(()=>document.querySelector('#browserPresence').hidden),true);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('fresh directory-handle wrappers on refresh keep the same browser session and do not repeat notices',async()=>{
  const {ctx,page}=await open(fixture());await selectHuman(page);
  const [first]=await humanRecords(page);
  for(let i=0;i<3;i++){ await refresh(page);await page.clock.runFor(61000); }
  await page.waitForFunction(id=>JSON.parse(window.__fakefs.dump().find(f=>f.path.includes(`/presence/${id}/`)).text).heartbeat_at>'2026-10-15T10:32:00.000Z',HUMAN);
  const records=await humanRecords(page);assert.equal(records.length,1);assert.equal(records[0].session,first.session);
  const files=await page.evaluate(()=>window.__fakefs.dump());
  assert.equal(files.filter(f=>f.path.includes('session-start-')).length,1);
  assert.equal(files.filter(f=>f.path.includes('session-release-')).length,0);
  await ctx.close();
});

test('lost write access to the old board does not block opening a read-only board',async()=>{
  const proj=fixture(), {ctx,page,log}=await open(proj);await selectHuman(page);
  const [before]=await humanRecords(page);
  await page.evaluate(async()=>{
    const root=await window.showDirectoryPicker(), board=await root.getDirectoryHandle('.agent-board'), presence=await board.getDirectoryHandle('presence'), person=await presence.getDirectoryHandle('human-owner-01'), file=await person.getFileHandle(window.__fakefs.dump().find(f=>f.path.includes('/presence/')).path.split('/').pop());
    const proto=Object.getPrototypeOf(file), original=proto.createWritable;
    proto.createWritable=async function(){if(this.__path.includes('presence')) throw Error('Old board is read-only now');return original.call(this);};
  });
  await page.setInputFiles('#fallback',proj);
  await page.waitForFunction(()=>document.querySelector('#cInfo').textContent.includes('Read-only'));
  assert.equal((await humanRecords(page))[0].expires_at,before.expires_at);
  assert.match(await page.textContent('#toast'),/Could not release.*lease will expire/);
  assert.equal(await page.evaluate(()=>document.querySelector('#browserPresence').hidden),true);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

test('a slow refresh started before human registration cannot restore a stale ghost badge',async()=>{
  const {ctx,page}=await open(fixture());
  await page.evaluate(async()=>{
    const root=await window.showDirectoryPicker(), board=await root.getDirectoryHandle('.agent-board'), cfg=await board.getFileHandle('config.json'), proto=Object.getPrototypeOf(cfg), original=proto.getFile;
    proto.getFile=async function(){
      if(!window.pausedMessage && this.__path.includes('rooms') && this.name.endsWith('.txt')){
        window.pausedMessage=true;await new Promise(resolve=>window.resumeMessage=resolve);
      }
      return original.call(this);
    };
  });
  const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.click('#reload');await page.waitForFunction(()=>window.pausedMessage);
  await selectHuman(page);
  assert.match(await marker(page,HUMAN).getAttribute('class'),/presence-active/);
  await page.evaluate(()=>window.resumeMessage());
  await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.match(await marker(page,HUMAN).getAttribute('class'),/presence-active/);
  assert.match(await page.textContent('#browserPresence'),/Browser session active/);
  assert.equal((await humanRecords(page)).filter(r=>r.status==='active').length,1);
  const nextBuild=await page.evaluate(()=>{window.pausedMessage=false;return window.__boardTest.stats.builds;});
  await page.click('#reload');await page.waitForFunction(()=>window.pausedMessage);
  await page.selectOption('#me',ID);
  await page.waitForFunction(id=>JSON.parse(window.__fakefs.dump().find(f=>f.path.includes(`/presence/${id}/`)).text).status==='released',HUMAN);
  await page.evaluate(()=>window.resumeMessage());
  await page.waitForFunction(n=>window.__boardTest.stats.builds>n,nextBuild);
  assert.match(await marker(page,HUMAN).getAttribute('class'),/presence-ghost/);
  await ctx.close();
});

test('a CLI agent post without attachment warns and the viewer explains the missing board session',async()=>{
  const proj=fixture();
  const posted=h.boardctl(['post','--path',proj,'--from',ID,'--to','all','--scope','room','--room','general','--thread','T004','--slug','on-demand-check','--status','INFO','--body','An on-demand post does not attach its author.']);
  assert.equal(posted.code,0,posted.err);
  assert.equal(posted.out.trim().split('\n').length,1);
  assert.match(posted.err,/board presence is ghost/);
  assert.equal(h.fs.existsSync(h.path.join(proj,'.agent-board/presence')),false);
  const {ctx,page,log}=await open(proj);
  assert.equal(await marker(page).getAttribute('title'),'Ghost · no active board session');
  await page.click('#presenceOpen');
  assert.match(await page.textContent('#presenceDialog'),/boardctl session start or board-loop session-start/);
  assert.match(await page.textContent('#presenceDialog'),/Posting alone does not attach or renew/);
  assert.match(await page.locator(`[data-presence-id='${ID}']`).textContent(),/Ghost · no active board session/);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});

for(const upload of [false,true])test(`Finder metadata is ignored in ${upload?'uploaded snapshots':'native reads and human presence writes'}`,async()=>{
  const proj=fixture({[`${ID}/session-one.json`]:lease()});
  for(const rel of ['.DS_Store','presence/.DS_Store',`presence/${ID}/.DS_Store`,'presence/human-owner-01/.DS_Store','repairs/.DS_Store','rooms/product/topics/.DS_Store']){
    const p=h.path.join(proj,'.agent-board',rel);h.fs.mkdirSync(h.path.dirname(p),{recursive:true});h.fs.writeFileSync(p,Buffer.from([255,0,1]));
  }
  const s=upload?await h.openPage(browser,{clock:AT}):await open(proj);
  const {page,ctx,log}=s;
  if(upload){await page.setInputFiles('#fallback',proj);await page.waitForSelector('#feed article');}
  assert.match(await marker(page).getAttribute('class'),/presence-active/);
  assert.equal(await page.evaluate(()=>window.__boardTest.getModel().presence.errors.size),0);
  if(!upload){
    await selectHuman(page);
    await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.path.includes('/presence/human-owner-01/')&&f.path.endsWith('.json')));
    assert.match(await marker(page,HUMAN).getAttribute('class'),/presence-active/);
    await refresh(page);assert.match(await marker(page).getAttribute('class'),/presence-active/);
  }
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
