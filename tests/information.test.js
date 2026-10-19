'use strict';
const {test:nodeTest,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),h=require('./lib/helpers'),E=require('../scripts/extension-contract');
const test=(name,fn)=>nodeTest(name,{timeout:30000},fn);
const py=(...args)=>{const r=cp.spawnSync('python3',[h.BOARDCTL,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const write=(root,name,value)=>{const file=path.join(root,name);fs.writeFileSync(file,JSON.stringify(value));return file;};
async function fixture(mode='declarative'){
 const root=fs.realpathSync(h.layoutShuffled(h.tmpDir('afb-information-')));
 const pkg=JSON.parse(fs.readFileSync(path.join(h.VENDOR,'examples/extensions/approvals-declarative.afb-plugin.json')));
 pkg.version='1.3.0';pkg.capabilities.push('read-state');
 const r=pkg.ui.renderers[0];r.mode=mode;if(mode==='worker')r.entry='view.js';const content=mode==='worker'?"BoardExtension.define({render(data,state,context){return {type:'metric',label:'Shared reading',value:context.information.battery.latest.data.title};}});":JSON.stringify({type:'metric',label:'Shared reading',value:{contextPath:['information','battery','latest','data','title']}});
 pkg.files[r.entry]={encoding:'utf-8',data:content,sha256:await E.hash(E.bytes(content))};
 const packageFile=write(root,'package.json',pkg),artifact=JSON.parse(py('extensions','install',packageFile,'--path',root)).artifact;
 const created=JSON.parse(py('extension-state','create','--path',root,'--from','alpha-agent','--scope','room','--room','general','--label','Example source','--stale-after','300','--package',artifact,'--contract','com.example.approvals/request','--contract-version','1.0.0'));
 const data=write(root,'reading.json',{title:'Recorded 100'}),provenance=write(root,'provenance.json',{method:'command',description:'device-cli battery <img src=bad onerror=alert(1)>',collectedAt:'2026-10-19T10:00:02Z',evidence:'A claimed observation; never executable.'});
 const first=JSON.parse(py('extension-state','publish',created.artifact,'--path',root,'--from','alpha-agent','--expect','none','--data-file',data,'--observed-at','2026-10-19T10:00:00Z','--provenance-file',provenance));
 const information=JSON.parse(py('extension-state','information',created.artifact,'--path',root,'--id','battery'));
 information.items[0].target='extension-data';delete information.items[0].value;
 const info=write(root,'information.json',information),envelope=path.join(root,'envelope.json');
 fs.writeFileSync(envelope,py('extensions','envelope',artifact,'--path',root,'--contract','com.example.approvals/request','--contract-version','1.0.0','--data-file',data,'--renderer-package',artifact,'--renderer',r.id));
 const messages=[];
 for(const slug of ['first-reading','second-reading'])messages.push(py('post','--path',root,'--from','alpha-agent','--to','all','--scope','room','--room','general','--thread','T001','--slug',slug,'--body','Recorded 100; latest reading is optional local information.','--extension-file',envelope,'--information-file',info));
 return {root,artifact,created,first,messages,data,information,mode};
}
const publish=(f,title,expect=f.first.revision)=>{write(f.root,'reading.json',{title});return JSON.parse(py('extension-state','publish',f.created.artifact,'--path',f.root,'--from','alpha-agent','--expect',expect,'--data-file',f.data,'--observed-at','2026-10-19T10:05:00Z'));};
async function syncState(page,f){const base=path.join(f.root,'.agent-board/extensions/state'),rows=[];function scan(dir,rel){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name),r=rel+'/'+name;if(fs.statSync(p).isDirectory())scan(p,r);else rows.push({path:r,text:fs.readFileSync(p,'utf8')});}}scan(base,'.agent-board/extensions/state');await page.evaluate(async rows=>{for(const row of rows)await window.__fakefs.addFile(row.path,row.text);},rows);}
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser?.close();});
test('two declared references refresh together while recorded values and provenance remain immutable',async()=>{
 const f=await fixture(),original=f.messages.map(p=>fs.readFileSync(path.join(f.root,p),'utf8')),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(f.root),dialog:'accept'});
 try{await h.openBoardViaUi(page);await page.locator('[data-information-path]').first().waitFor();assert.equal(await page.locator('[data-information-path]').count(),2);
  await page.locator('[data-information-path] .information-provenance').first().locator('summary').click();
  const next=publish(f,'Latest 90');await syncState(page,f);await page.locator('#reload').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-information-path]')].every(n=>n.textContent.includes('Latest 90')));
  assert.equal(await page.locator('[data-extension-path]').filter({hasText:'Latest 90'}).count(),2);
  assert.equal(await page.locator('[data-information-path] .information-provenance').first().evaluate(n=>n.open),true);
  for(const card of await page.locator('[data-information-path]').all()){assert.match(await card.textContent(),/Recorded 100/);assert.match(await card.textContent(),/Stale reading/);assert.equal(await card.locator('img').count(),0);}
  assert.deepEqual(f.messages.map(p=>fs.readFileSync(path.join(f.root,p),'utf8')),original);
  py('extension-state','availability',f.created.artifact,'--path',f.root,'--from','alpha-agent','--expect',next.revision,'--state','disconnected');
  await syncState(page,f);await page.locator('#reload').click();await page.waitForFunction(()=>document.querySelector('[data-information-path]')?.textContent.includes('Source reported disconnected'));
  assert.match(await page.locator('[data-information-path]').first().textContent(),/10:05:00Z/);
  assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
 }finally{await ctx.close();}
});
test('plain messages carry independently sourced information without an extension package',async()=>{
 const root=fs.realpathSync(h.layoutShuffled(h.tmpDir())),information={version:1,items:[{id:'count',value:12,provenance:{method:'file',description:'/local/example.json'}},{id:'confirmed',value:false,provenance:{method:'user',description:'User reported this value.'}}]},file=write(root,'information.json',information);
 py('post','--path',root,'--from','alpha-agent','--to','all','--scope','room','--room','general','--thread','T001','--slug','plain-information','--body','Count 12; confirmation false.','--information-file',file);
 const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(root)});
 try{await h.openBoardViaUi(page);const card=page.locator('[data-information-path]');await card.waitFor();assert.equal(await card.locator('[data-information-id]').count(),2);assert.match(await card.textContent(),/false/);assert.equal(await card.locator('a').count(),0);assert.equal(await page.locator('[data-extension-path]').count(),0);py('validate','--path',root);assert.deepEqual(log.pageErrors,[]);}finally{await ctx.close();}
});
test('native and uploaded state readers reject malformed sibling revisions instead of selecting a partial winner',async()=>{
 const f=await fixture();publish(f,'Latest 90');const revisionDir=path.join(f.root,'.agent-board/extensions/state',f.created.artifact,'revisions');fs.writeFileSync(path.join(revisionDir,'bad.txt'),'{}');fs.writeFileSync(path.join(revisionDir,'.pending-leftover'),'x'.repeat(20000));
 for(const native of [true,false]){const {ctx,page,log}=await h.openPage(browser,native?{tree:h.readTree(f.root)}:{});try{if(native)await h.openBoardViaUi(page);else await page.setInputFiles('#fallback',f.root);const card=page.locator('[data-information-path]').first();await card.waitFor();assert.match(await card.textContent(),/Latest reading cannot be verified/);assert.match(await card.textContent(),/Recorded 100/);assert.doesNotMatch(await card.textContent(),/Latest 90/);assert.deepEqual(log.pageErrors,[]);}finally{await ctx.close();}}
});
test('native submit re-reads shared state and requires renewed review before writing',async()=>{
 const f=await fixture(),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(f.root),dialog:'accept'});
 try{await h.openBoardViaUi(page);const host=page.locator('[data-extension-path]').first();await host.locator('summary').click();await host.locator('textarea').fill('{"approved":true}');
  publish(f,'Latest 90');await syncState(page,f);
  await host.getByRole('button',{name:'Send reviewed reply',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-extension-path] [role=status]')?.textContent.includes('changed since review'));
  assert.equal(await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.text?.includes('EXTENSION-ANSWER:')).length),0);
  await page.locator('#reload').click();const refreshed=page.locator('[data-extension-path]').first();await refreshed.locator('summary').click();await refreshed.locator('textarea').fill('{"approved":true}');await refreshed.getByRole('button',{name:'Send reviewed reply',exact:true}).click();
  await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text?.includes('EXTENSION-ANSWER:')));
  const out=h.tmpDir();await h.dumpFakeFs(page,out);py('validate','--path',out);
  const reply=await page.evaluate(()=>window.__fakefs.dump().find(f=>f.text?.includes('EXTENSION-ANSWER:')).text),info=JSON.parse(reply.match(/^INFORMATION: (.*)$/m)[1]);assert.equal(info.review.bindings.length,1);assert.equal(info.review.bindings[0].status,'resolved');assert.equal(info.review.bindings[0].heads.length,1);
  assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('observation freshness expires even with board refresh disabled',async()=>{
 const f=await fixture(),{ctx,page,log}=await h.openPage(browser,{tree:h.readTree(f.root),clock:new Date('2026-10-19T10:04:59Z')});
 try{await h.openBoardViaUi(page);await page.locator('#gear').click();await page.uncheck('#rOn');await page.locator('#settingsClose').click();const card=page.locator('[data-information-path]').first();assert.match(await card.textContent(),/Within its freshness period/);const reads=await page.evaluate(()=>stats.autoRefreshes);await page.clock.runFor(31000);await page.waitForFunction(()=>document.querySelector('[data-information-path]')?.textContent.includes('Stale reading'));assert.equal(await page.evaluate(()=>stats.autoRefreshes),reads);assert.deepEqual(log.pageErrors,[]);}finally{await ctx.close();}
});
test('uploaded replies retain the exact reviewed shared heads in the downloaded message',async()=>{
 const f=await fixture(),next=publish(f,'Latest 90'),{ctx,page,log}=await h.openPage(browser,{dialog:'accept'});
 try{await page.setInputFiles('#fallback',f.root);const host=page.locator('[data-extension-path]').first();await host.locator('summary').click();await host.locator('textarea').fill('{"approved":true}');const pending=page.waitForEvent('download');await host.getByRole('button',{name:'Send reviewed reply',exact:true}).click();const download=await pending,raw=fs.readFileSync(await download.path()),info=JSON.parse(raw.toString().match(/^INFORMATION: (.*)$/m)[1]);assert.deepEqual(info.review.bindings[0].heads,[next.revision]);fs.writeFileSync(path.join(f.root,'.agent-board/rooms/general',download.suggestedFilename()),raw);py('validate','--path',f.root);
  const forged=download.suggestedFilename().replace('extension-answer','forged-answer');fs.writeFileSync(path.join(f.root,'.agent-board/rooms/general',forged),raw.toString().replace(/^INFORMATION: .*\n/m,''));await page.setInputFiles('#fallback',f.root);await page.waitForFunction(file=>window.__boardTest.getModel().msgs.some(m=>m.file===file&&m.metadataError),forged);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('uploaded copied boards give approved workers only declared context and retain recorded fallback when source is missing',async()=>{
 const f=await fixture('worker');publish(f,'Latest 90');const {ctx,page,log}=await h.openPage(browser,{dialog:'accept'});
 try{await page.setInputFiles('#fallback',f.root);await page.locator('[data-information-path]').first().waitFor();await page.locator('#extensionsOpen').click();await page.getByRole('button',{name:'Approve these exact code bytes',exact:true}).click();await page.locator('#extensionsDialog').getByRole('button',{name:'Close',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-extension-path]')?.textContent.includes('Latest 90'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/afb-information-phone-en.png'});await page.locator('#gear').click();await page.selectOption('#sLang','pl');await page.locator('#settingsClose').click();assert.match(await page.locator('[data-information-path]').first().textContent(),/Ostatni znany odczyt/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/afb-information-phone-pl.png'});
  fs.rmSync(path.join(f.root,'.agent-board/extensions/state'),{recursive:true});await page.setInputFiles('#fallback',f.root);await page.waitForFunction(()=>document.querySelector('[data-information-path]')?.textContent.includes('niedostępny w tej kopii'));
  assert.match(await page.locator('[data-information-path]').first().textContent(),/Recorded 100/);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
 }finally{await ctx.close();}
});
