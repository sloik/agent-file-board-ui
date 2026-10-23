'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),h=require('./lib/helpers'),U=require('../scripts/viewer-updates');
test('the extracted application package opens multiple board snapshots and checks updates without changing their files',async t=>{
 const tmp=h.tmpDir('afb-package-smoke-');t.after(()=>h.fs.rmSync(tmp,{recursive:true,force:true}));
 const zip=h.path.join(tmp,'viewer.zip'),extracted=h.path.join(tmp,'app');
 for(const args of [['scripts/build_viewer_package.py','--output',zip],['-m','zipfile','-e',zip,extracted]]){const r=cp.spawnSync('python3',args,{cwd:h.ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 const html=h.path.join(extracted,'agent-file-board-viewer/board.html'),first=h.layoutExample(h.path.join(tmp,'one')),second=h.layoutShuffled(h.path.join(tmp,'two'));
 const snapshots=[first,second].map(p=>JSON.stringify(h.readTree(p)));
 const browser=await h.launch();t.after(()=>browser.close());const {ctx,page,log}=await h.openPage(browser,{html});t.after(()=>ctx.close());
 await ctx.route(U.endpoint,r=>r.fulfill({contentType:'text/html',body:h.fs.readFileSync(h.path.join(h.ROOT,'site/update-check.html'),'utf8')}));
 await ctx.route('https://api.github.com/repos/sloik/agent-file-board-ui/releases/latest',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({id:123,draft:false,prerelease:false,tag_name:'v3.3.3',html_url:U.links('3.3.3').release,assets:[]})}));
 for(const project of [first,second]){await page.setInputFiles('#fallback',project);await page.waitForFunction(()=>window.__boardTest.getModel()!==null);await page.waitForSelector('article.msg');await h.openToolbarTool(page,'viewerUpdatesTools');await page.click('#viewerCheckNow');await page.waitForFunction(()=>!document.querySelector('#viewerCheckNow').disabled);assert.match(await page.locator('#viewerUpdateStatus').textContent(),/no viewer package/);assert.equal(await page.locator('#viewerPackageDownload').isVisible(),false);await page.click('#viewerUpdatesClose');}
 assert.deepEqual([first,second].map(p=>JSON.stringify(h.readTree(p))),snapshots);assert.deepEqual(log.pageErrors,[]);
 assert.equal(await page.evaluate(()=>window.__boardTest.VIEWER_VERSION),require('../package.json').version);
});
