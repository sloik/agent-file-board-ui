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

test('active sessions expire without refreshing or disturbing the editor; picking an identity does not attach it',async()=>{
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
