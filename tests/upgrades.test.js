"use strict";
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const h=require('./lib/helpers');
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
function oldBoard(version='1.9.2'){
  const tmp=h.tmpDir('upgrade-'),proj=h.layoutExample(tmp),base=h.path.join(proj,'.agent-board');
  for(const rel of ['CONVENTION.md','GLOSSARY.md','components/board-report-v1.schema.json','components/board-report-v2.schema.json','components/board-report-v3.schema.json','components/form-question-v2.schema.json','components/form-answer-v2.schema.json','components/form-question-v3.schema.json','components/form-answer-v3.schema.json']){
    const dest=h.path.join(base,rel);
    let bytes;
    try{bytes=execFileSync('git',['-C',h.VENDOR,'show',`v${version}:.agent-board/${rel}`],{stdio:['ignore','pipe','ignore']});}catch(e){h.fs.rmSync(dest,{force:true});continue;}
    h.fs.mkdirSync(h.path.dirname(dest),{recursive:true});h.fs.writeFileSync(dest,bytes);
  }
  h.fs.mkdirSync(h.path.join(base,'rooms/general'),{recursive:true});
  h.fs.writeFileSync(h.path.join(base,'rooms/general/GUIDANCE.md'),'Keep custom instructions\r\n');
  return {tmp,proj,tree:h.readTree(proj)};
}
async function open(version){
  const fixture=oldBoard(version),s=await h.openPage(browser,{tree:fixture.tree});
  await h.openBoardViaUi(s.page);return {...fixture,...s};
}
async function preview(page){
  await page.click('#verbar');
  await page.waitForFunction(()=>!document.querySelector('#upgradePreview').disabled);
}
async function settled(page){
  await page.waitForFunction(()=>!document.querySelector('#upgradePreview').disabled);
  await page.evaluate(()=>window.__fakefs.settled);
}
test('native upgrades preview and preserve all unmanaged bytes, with exact backups and zero network',async()=>{
  for(const version of ['1.9.2','2.0.0','2.0.1','2.1.0','2.2.0','2.3.0','2.4.0','2.5.0','2.5.1','2.6.0']){
    const s=await open(version),{page,ctx,log}=s;
    const before=await page.evaluate(()=>window.__fakefs.dump());
    if(version==='1.9.2'){
      await page.click('#upgradeOpen');
      await settled(page);
    }else await preview(page);
    assert.match(await page.textContent('#upgradeDialog'),/Refreshing Chrome does not upgrade/);
    assert.equal(await page.isEnabled('#upgradeApply'),true);
    assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before,'preview is read-only');
    await page.click('#upgradeApply');await settled(page);
    assert.match(await page.textContent('#upgradeResult'),/Updated selected board to v2\.6\.1/);
    assert.equal(await page.isVisible('#verwarn'),false);
    assert.match(await page.textContent('#verbar'),/Board v2\.6\.1/);
    const after=await page.evaluate(()=>window.__fakefs.dump());
    const managed=['CONVENTION.md','GLOSSARY.md','components/board-report-v1.schema.json','components/board-report-v2.schema.json','components/board-report-v3.schema.json','components/form-question-v2.schema.json','components/form-answer-v2.schema.json','components/form-question-v3.schema.json','components/form-answer-v3.schema.json'].map(r=>'.agent-board/'+r);
    for(const file of before) if(!managed.includes(file.path)) assert.deepEqual(after.find(f=>f.path===file.path),file);
    const snapshot=after.find(f=>/upgrade-backups\/[a-f0-9]+\/snapshot.json$/.test(f.path));
    assert.ok(snapshot);
    const plan=JSON.parse(snapshot.text).plan,backup=snapshot.path.replace(/snapshot.json$/,'');
    for(const row of plan.files.filter(r=>r.action!=='keep')){
      if(row.before!==null) assert.equal(after.find(f=>f.path===backup+row.path).text,before.find(f=>f.path==='.agent-board/'+row.path).text);
      else assert.equal(after.find(f=>f.path===backup+row.path),undefined);
    }
    assert.ok(after.some(f=>f.path===backup+'complete.json'));
    const out=h.tmpDir('upgraded-');await h.dumpFakeFs(page,out);
    assert.equal(h.boardctl(['validate','--path',out]).code,0);
    assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
    assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
    await page.click('#upgradePreview');await settled(page);
    assert.match(await page.textContent('#upgradeResult'),/already matches/);
    assert.equal(await page.isEnabled('#upgradeApply'),false);
    await ctx.close();h.fs.rmSync(s.tmp,{recursive:true,force:true});h.fs.rmSync(out,{recursive:true,force:true});
  }
});
test('custom metadata and newer or unknown versions explain manual recovery and block apply',async()=>{
  for(const change of ['GLOSSARY.md','components/board-report-v1.schema.json','components/board-report-v2.schema.json','components/board-report-v3.schema.json','components/form-question-v2.schema.json','components/form-answer-v2.schema.json','components/form-question-v3.schema.json','components/form-answer-v3.schema.json','newer','unknown']){
    const {page,ctx}=await open('2.0.0');
    await page.evaluate(async change=>{
      const rel=change==='newer'||change==='unknown'?'CONVENTION.md':change,path='.agent-board/'+rel;
      const old=window.__fakefs.read(path);
      await window.__fakefs.addFile(path,change==='newer'?old.replace('Version: 2.0.0','Version: 3.0.0'):change==='unknown'?old.replace('Version: 2.0.0','Version: mystery'):old+'\nCustom metadata');
    },change);
    const before=await page.evaluate(()=>window.__fakefs.dump());
    await preview(page);
    assert.equal(await page.isEnabled('#upgradeApply'),false);
    assert.match(await page.textContent('#upgradeResult'),change==='newer'?/newer.*downgrades/:/manual|unsupported/);
    assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
    await ctx.close();
  }
});
test('changed metadata after preview refuses without backup or overwrite',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(()=>window.__fakefs.addFile('.agent-board/GLOSSARY.md','New custom version'));
  const before=await page.evaluate(()=>window.__fakefs.dump());
  await page.click('#upgradeApply');await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/changed.*Preview again/);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await ctx.close();
});
test('switching board invalidates preview',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(()=>window.__boardTest.loadFiles([{path:'CONVENTION.md',text:'Version: 2.0.0'}],[]));
  // Uploading another board clears the native handle through the real input path.
  const other=oldBoard('2.0.0');
  await page.locator('#fallback').setInputFiles(other.proj);
  await page.waitForFunction(()=>document.querySelector('#folderName').textContent.toLowerCase().includes('read-only'));
  const before=await page.evaluate(()=>window.__fakefs.dump());
  await page.click('#upgradeApply');await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/changed.*Preview again/);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await ctx.close();
});
test('denied write permission cannot claim success or change metadata',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(async()=>{
    const root=await showDirectoryPicker();
    Object.getPrototypeOf(root).requestPermission=async()=> 'denied';
  });
  const before=await page.evaluate(()=>window.__fakefs.dump());
  await page.click('#upgradeApply');await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/permission was denied/);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await ctx.close();
});
test('partial write failure preserves old convention and original backup; repeated apply stays disabled',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(async()=>{
    const root=await showDirectoryPicker(),base=await root.getDirectoryHandle('.agent-board');
    const proto=Object.getPrototypeOf(await base.getFileHandle('CONVENTION.md')),orig=proto.createWritable;
    proto.createWritable=function(){
      if(this.__path.join('/')==='.agent-board/components/board-report-v1.schema.json') throw Error('Simulated disk full');
      return orig.call(this);
    };
  });
  const old=await page.evaluate(()=>window.__fakefs.read('.agent-board/CONVENTION.md'));
  await page.click('#upgradeApply');await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/Update incomplete.*Simulated disk full.*Backup/);
  assert.equal(await page.evaluate(()=>window.__fakefs.read('.agent-board/CONVENTION.md')),old);
  assert.equal(await page.isEnabled('#upgradeApply'),false);
  const backups=await page.evaluate(()=>window.__fakefs.dump().filter(r=>r.path.includes('upgrade-backups/')));
  assert.ok(backups.some(r=>r.path.endsWith('CONVENTION.md')&&r.text===old));
  assert.ok(backups.some(r=>r.path.endsWith('snapshot.json')));
  assert.equal(backups.some(r=>r.path.endsWith('complete.json')),false);
  await ctx.close();
});
test('uploaded board gets read-only explanation and CLI instructions',async()=>{
  const {proj}=oldBoard(),{page,ctx}=await h.openPage(browser);
  await page.locator('#fallback').setInputFiles(proj);
  await page.waitForFunction(()=>window.__boardTest.getModel());
  await page.click('#verbar');
  assert.match(await page.textContent('#upgradeResult'),/Direct update needs.*writable/);
  assert.match(await page.textContent('#upgradeCommands'),/--apply --expect/);
  assert.equal(await page.isEnabled('#upgradeApply'),false);
  await ctx.close();
});
test('a normal folder refresh retains the same selected-board preview',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(()=>{window.__preUpgradeModel=window.__boardTest.getModel();document.querySelector('#reload').click();});
  await page.waitForFunction(()=>window.__boardTest.getModel()!==window.__preUpgradeModel);
  await page.click('#upgradeApply');await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/Updated selected board to v2\.6\.1/);
  await ctx.close();
});
test('rapid repeated update clicks publish one backup and one completion',async()=>{
  const {page,ctx}=await open();await preview(page);
  await page.evaluate(()=>{const button=document.querySelector('#upgradeApply');button.click();button.click();button.onclick();});
  await settled(page);
  assert.match(await page.textContent('#upgradeResult'),/Updated selected board to v2\.6\.1/);
  const files=await page.evaluate(()=>window.__fakefs.dump());
  assert.equal(files.filter(f=>/upgrade-backups\/[^/]+\/snapshot.json$/.test(f.path)).length,1);
  assert.equal(files.filter(f=>/upgrade-backups\/[^/]+\/complete.json$/.test(f.path)).length,1);
  await ctx.close();
});
test('upgrade writer rejects protected files and traversal paths',async()=>{
  const {page,ctx}=await h.openPage(browser);
  const results=await page.evaluate(async()=>{
    const paths=['config.json','participants.json','rooms/general/message.txt','../CONVENTION.md','components/../../CONVENTION.md','upgrade-backups/../CONVENTION.md','upgrade-backups/'+ 'a'.repeat(32)+'/config.json'];
    return Promise.all(paths.map(async path=>{try{await upgradeWrite(null,path,'forbidden');return false;}catch(e){return /path/i.test(e.message);}}));
  });
  assert.deepEqual(results,Array(7).fill(true));
  await ctx.close();
});
