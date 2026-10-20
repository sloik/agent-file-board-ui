"use strict";
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const h=require('../tests/lib/helpers');
(async()=>{
  const tmp=h.tmpDir('upgrade-shot-'),proj=h.layoutExample(tmp),base=h.path.join(proj,'.agent-board');
  const out=h.tmpDir('upgrade-shot-result-');let browser;
  try{
    for(const rel of ['CONVENTION.md','GLOSSARY.md']) h.fs.writeFileSync(h.path.join(base,rel),execFileSync('git',['-C',h.VENDOR,'show',`v1.9.2:.agent-board/${rel}`]));
    browser=await h.launch();
    const {page,ctx,log}=await h.openPage(browser,{tree:h.readTree(proj),rootName:'Example project'});
    await h.openBoardViaUi(page);
    const before=await page.evaluate(()=>window.__fakefs.dump());
    await page.click('#upgradeOpen');
    await page.waitForFunction(()=>!document.querySelector('#upgradePreview').disabled);
    assert.equal(await page.isEnabled('#upgradeApply'),true);
    assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
    await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-upgrade.png')});
    await page.setViewportSize({width:375,height:812});
    await page.screenshot({path:h.path.join(h.ROOT,'docs/images/board-upgrade-phone.png')});
    assert.equal(await page.evaluate(()=>document.querySelector('#upgradeDialog').scrollWidth<=document.querySelector('#upgradeDialog').clientWidth),true);
    await page.click('#upgradeApply');
    await page.waitForFunction(()=>!document.querySelector('#upgradePreview').disabled);
    assert.match(await page.textContent('#upgradeResult'),/Updated selected board to v2\.10\.0/);
    const after=await h.dumpFakeFs(page,out);
    for(const file of before.filter(f=>f.path.endsWith('.txt'))) assert.deepEqual(after.find(f=>f.path===file.path),file);
    const validation=h.boardctl(['validate','--path',out]);assert.equal(validation.code,0,validation.err);
    assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
    assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
    await ctx.close();
    process.stdout.write('Upgrade desktop/phone screenshots and canonical round-trip verified.\n');
  }finally{if(browser) await browser.close();h.fs.rmSync(tmp,{recursive:true,force:true});h.fs.rmSync(out,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
