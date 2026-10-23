'use strict';
// Real released UI, fictional disposable boards; no user folders or network services.
const assert=require('node:assert/strict'),cp=require('node:child_process');
const h=require('../tests/lib/helpers');
const OUT=h.path.join(h.ROOT,'docs/images'),AT=new Date('2026-10-20T22:00:00Z');
const roots=[];
const write=(root,name,value)=>{const file=h.path.join(root,name);h.fs.writeFileSync(file,JSON.stringify(value));return file;};
const py=(...args)=>{
 let r;
 if(args[0]==='extension-state'){
  // Freeze only producer time in the disposable CLI fixture, matching page.clock.
  const bootstrap=`import pathlib,runpy,sys,datetime
entry=sys.argv.pop(1)
sys.path.insert(0,str(pathlib.Path(entry).resolve().parent))
import extension_state
class Frozen(datetime.datetime):
 @classmethod
 def now(cls,tz=None):
  value=datetime.datetime.fromisoformat('2026-10-20T22:00:00+00:00')
  return value.astimezone(tz) if tz else value.replace(tzinfo=None)
extension_state.datetime=Frozen
runpy.run_path(entry,run_name='__main__')`;
  const result=cp.spawnSync('python3',['-I','-c',bootstrap,h.BOARDCTL,...args],{encoding:'utf8'});
  r={code:result.status,out:result.stdout,err:result.stderr};
 }else r=h.boardctl(args);
 assert.equal(r.code,0,r.err);return r.out.trim();
};
function small(){const root=h.fs.realpathSync(h.layoutShuffled(h.tmpDir('afb-docs-')));roots.push(h.path.dirname(root));return root;}
async function capture(page,name){await page.screenshot({path:h.path.join(OUT,name+'.png'),animations:'disabled'});console.log(name);}
function clean(log){assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.deepEqual(log.requests.filter(u=>! /^(file|data|blob):/.test(u)),[]);}
async function settings(page,lang='en',theme='light'){await page.click('#gear');await page.selectOption('#sLang',lang);await page.selectOption('#sTheme',theme);await page.click('#sClose');}
async function open(browser,root){const s=await h.openPage(browser,{tree:h.readTree(root),clock:AT,dialog:'accept'});await s.page.setViewportSize({width:1440,height:1000});await h.openBoardViaUi(s.page);return s;}
async function refresh(page){const n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click('#reload');await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);await page.evaluate(async()=>{await notificationState?.loading;await notificationWrites;await notificationState?.scan;});}
async function peopleAndNotifications(browser){
 const root=h.layoutExample(h.tmpDir('afb-docs-'));roots.push(h.path.dirname(root));
 const file=h.path.join(root,'.agent-board/participants.json'),reg=JSON.parse(h.fs.readFileSync(file));
 reg.participants.find(p=>p.id==='research-agent-01').operator='human-owner-01';h.fs.writeFileSync(file,JSON.stringify(reg));
 py('post','--path',root,'--from','research-agent-01','--to','all','--scope','room','--room','reports','--thread','T018','--slug','local-files','--at',AT.toISOString(),'--content-type','text/markdown','--body','## Local file references\n\nReview the fictional report at `/Users/you/Board demo/report.md` or open its folder `/Users/you/Board demo/`. These controls open local originals only after an explicit click.');
 const {ctx,page,log}=await open(browser,root);
 try{
  await page.selectOption('#me','human-owner-01');
  await page.click('[data-closed="room:architecture"]');
  await page.click('.tcard[data-tk="room:architecture|T001"]');
  await page.fill('#cBody','I can review the schema today. Please link the validation evidence.');
  await capture(page,'board-composer-compact');
  await h.expandComposer(page);await capture(page,'board-composer-options');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#composerOptions > summary').click();await capture(page,'board-composer-compact-phone');
  await page.setViewportSize({width:1440,height:1000});await page.fill('#cBody','');
  await h.openToolbarTool(page,'presenceOpen');await capture(page,'board-operators');await page.click('#presenceClose');
  await page.click('[data-notification-menu="room"][data-notification-key="architecture"]');await capture(page,'board-sidebar-follow');
  await page.keyboard.press('Escape');await page.click('#notificationsOpen');
  await page.selectOption('#notification-room','architecture');await page.locator('#notificationsScopes .notification-scope').first().getByRole('button').click();
  await page.evaluate(async()=>{await notificationWrites;});await page.click('#notificationsClose');
  await page.evaluate(async()=>{
   const source=B.msgs.find(m=>m.scope==='room'&&m.dir==='architecture'&&m.author==='implementation-agent-01');
   const text=Object.entries({...source.h,DATE:'2026-10-20 12:01','REPLY-TO':'-',STATUS:'REQUEST'}).map(([k,v])=>k+': '+v).join('\n')+'\n---\nThe schema review is ready. Can you check the validation evidence?\n';
   await window.__fakefs.addFile('.agent-board/rooms/architecture/2026-10-20_1201_implementation-agent-01_T001_review-ready.txt',text);
  });
  await refresh(page);await page.click('#notificationsOpen');await page.locator('.notification-entry').waitFor();await capture(page,'board-notifications');
  await page.locator('.notification-entry').getByRole('button',{name:'Quick reply',exact:true}).click();await capture(page,'board-notification-reply');
  await settingsAfterDialog();
  async function settingsAfterDialog(){if(await page.locator('#notificationsDialog').isVisible())await page.click('#notificationsClose');await settings(page,'pl','dracula');await page.setViewportSize({width:390,height:844});await page.click('#notificationsOpen');assert.equal(await page.locator('#notificationsDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await page.locator('.notification-entry').scrollIntoViewIfNeeded();await capture(page,'board-notifications-phone');await page.click('#notificationsClose');}
  await page.setViewportSize({width:1440,height:1000});await settings(page);await page.click('.tcard[data-tk="room:reports|T018"]');await capture(page,'board-file-actions');
  clean(log);
 }finally{await ctx.close();}
}
async function extensions(browser){
 const root=small(),sample=name=>h.path.join(h.VENDOR,'examples/extensions',name+'.afb-plugin.json');
 const artifact=JSON.parse(py('extensions','install',sample('approvals-declarative'),'--path',root)).artifact;
 py('extensions','install',sample('lifecycle-worker'),'--path',root);
 const data=write(root,'data.json',{title:'Review the local purchase request'}),env=h.path.join(root,'envelope.json');
 h.fs.writeFileSync(env,py('extensions','envelope',artifact,'--path',root,'--contract','com.example.approvals/request','--data-file',data,'--renderer-package',artifact,'--renderer','request'));
 py('post','--path',root,'--from','alpha-agent','--to','all','--scope','room','--room','general','--thread','T001','--slug','review','--at',AT.toISOString(),'--body','Please review this fictional purchase. The readable request remains available if the custom component cannot run.','--extension-file',env);
 const {ctx,page,log}=await open(browser,root),component=page.locator('[data-extension-path]');
 try{
  await component.locator('input[type=checkbox]').waitFor();await component.scrollIntoViewIfNeeded();await capture(page,'board-extensions-component');
  await component.locator('select').selectOption({label:'Lifecycle example — worker 1.0.0 / live'});
  await component.getByRole('button',{name:'Review extension',exact:true}).waitFor();await capture(page,'board-extension-review');
  await component.getByRole('button',{name:'Review extension',exact:true}).click();await capture(page,'board-extensions-manager');
  await page.getByRole('button',{name:'Approve this exact package',exact:true}).click();await page.locator('#extensionsDialog').getByRole('button',{name:'Close',exact:true}).click();
  await component.getByRole('button',{name:'Refresh component',exact:true}).waitFor();await capture(page,'board-extension-refresh');
  await component.getByRole('button',{name:'Refresh component',exact:true}).click();
  await component.getByRole('button',{name:'Diagnostics',exact:true}).click();await page.locator('#extensionDiagnosticsDialog pre').waitFor();await capture(page,'board-extension-diagnostics');
  await page.locator('#extensionDiagnosticsDialog').getByRole('button',{name:'Close',exact:true}).click();
  await settings(page,'en','dark');await page.setViewportSize({width:390,height:844});await component.scrollIntoViewIfNeeded();await capture(page,'board-extension-refresh-phone');clean(log);
 }finally{await ctx.close();}
}
async function information(browser){
 const root=small();const pkg=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,'examples/extensions/approvals-declarative.afb-plugin.json')));pkg.version='1.3.0';pkg.capabilities.push('read-state');
 const artifact=JSON.parse(py('extensions','install',write(root,'package.json',pkg),'--path',root)).artifact;
 const state=JSON.parse(py('extension-state','create','--path',root,'--from','alpha-agent','--scope','room','--room','general','--label','Fictional device battery','--stale-after','300','--package',artifact,'--contract','com.example.approvals/request','--contract-version','1.0.0'));
 const data=write(root,'reading.json',{title:'Battery 100%'}),provenance=write(root,'provenance.json',{method:'command',description:'device-cli battery (fictional example; not executed by the viewer)',collectedAt:'2026-10-20T21:58:00Z'});
 const first=JSON.parse(py('extension-state','publish',state.artifact,'--path',root,'--from','alpha-agent','--expect','none','--data-file',data,'--observed-at','2026-10-20T21:58:00Z','--provenance-file',provenance));
 const info=JSON.parse(py('extension-state','information',state.artifact,'--path',root,'--id','battery'));info.items[0].target='extension-data';delete info.items[0].value;
 const env=h.path.join(root,'envelope.json');h.fs.writeFileSync(env,py('extensions','envelope',artifact,'--path',root,'--contract','com.example.approvals/request','--data-file',data,'--renderer-package',artifact,'--renderer','request'));
 py('post','--path',root,'--from','alpha-agent','--to','all','--scope','room','--room','general','--thread','T001','--slug','battery','--at',AT.toISOString(),'--body','Battery was 100% when this message was written. Latest local observations can change independently.','--extension-file',env,'--information-file',write(root,'information.json',info));
 write(root,'reading.json',{title:'Battery 90%'});
 const second=JSON.parse(py('extension-state','publish',state.artifact,'--path',root,'--from','alpha-agent','--expect',first.revision,'--data-file',data,'--observed-at','2026-10-20T21:59:00Z','--provenance-file',provenance));
 const {ctx,page,log}=await open(browser,root);
 try{await page.locator('[data-extension-path]').waitFor();await page.locator('[data-extension-path]').scrollIntoViewIfNeeded();assert.match(await page.locator('[data-information-path]').textContent(),/Battery 100%[\s\S]*Battery 90%/);await page.locator('[data-information-path]').screenshot({path:h.path.join(OUT,'board-shared-information.png')});await page.setViewportSize({width:390,height:844});await page.locator('[data-information-path]').screenshot({path:h.path.join(OUT,'board-shared-information-phone.png')});clean(log);}finally{await ctx.close();}
 py('extension-state','availability',state.artifact,'--path',root,'--from','alpha-agent','--expect',second.revision,'--state','disconnected','--reason','Fictional device disconnected; last known reading retained.');
 const offline=await open(browser,root);
 try{
  const card=offline.page.locator('[data-information-path]');await card.waitFor();assert.match(await card.textContent(),/disconnected/i);assert.match(await card.textContent(),/Battery 90%/);
  await card.screenshot({path:h.path.join(OUT,'board-shared-information-disconnected.png')});clean(offline.log);
 }finally{await offline.ctx.close();}
}
(async()=>{const browser=await h.launch();try{h.fs.mkdirSync(OUT,{recursive:true});await peopleAndNotifications(browser);await extensions(browser);await information(browser);}finally{await browser.close();for(const root of roots)h.fs.rmSync(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
