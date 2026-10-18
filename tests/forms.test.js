'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers');
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const QUESTION=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,'examples/openui-report/form-question.json'),'utf8'));
const FILE='2026-10-18_1230_implementation-agent-01_T011_form.txt',AT=new Date('2026-10-18T12:00:00Z');
async function boot({question=QUESTION,upload=false,scope='room',ui,body='Synthetic release configuration. Submit typed fields and table changes as a new reply.'}={}){
 const tmp=h.tmpDir('afb-forms-'),project=h.layoutExample(tmp),dir=h.path.join(project,scope==='direct'?'.agent-board/direct/human-owner-01--implementation-agent-01':'.agent-board/rooms/reports');h.fs.mkdirSync(dir,{recursive:true});
 h.fs.writeFileSync(h.path.join(dir,FILE),`FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ${scope.toUpperCase()}\n${scope==='direct'?'DIRECT-PARTICIPANTS: human-owner-01, implementation-agent-01':'ROOM: reports'}\nTHREAD: T011-configure\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: DECISION-NEEDED\nQUESTION: ${JSON.stringify(question)}\n${ui?`UI: ${JSON.stringify(ui)}\n`:''}---\n${body}\n`);
 const session=await h.openPage(browser,{tree:upload?undefined:h.readTree(project),clock:AT});await session.page.clock.pauseAt(new Date(AT.getTime()+1000));
 if(upload)await session.page.setInputFiles('#fallback',project);else await h.openBoardViaUi(session.page);
 if(scope==='direct')await session.page.locator('.fname[data-nav=direct][data-dir="human-owner-01--implementation-agent-01"]').click();else await session.page.locator('.fname').filter({hasText:'reports'}).click();await session.page.waitForSelector(`article[data-file='${FILE}']`);return{...session,tmp,project};
}
const field=(page,id)=>page.locator(`[data-form-field='${id}']`);
test('shared form definitions and typed replies agree with the canonical validator',async()=>{
 for(const name of ['form-question.json','form-answer.json'])assert.deepEqual(h.fs.readFileSync(h.path.join(h.ROOT,'docs/examples/openui',name)),h.fs.readFileSync(h.path.join(h.VENDOR,'examples/openui-report',name)));
 const cases=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,'tests/fixtures/form-metadata.json'),'utf8')),{ctx,page}=await h.openPage(browser);
 const actual=await page.evaluate(cases=>cases.map(c=>{try{window.__boardTest.messageMetadata(c.headers,c.source);return true;}catch(e){return false;}}),cases);
 assert.deepEqual(actual,cases.map(c=>c.valid),cases.map((c,i)=>actual[i]!==c.valid?c.name:'').filter(Boolean).join(','));await ctx.close();
});
test('all form adapters render offline; invalid required input refuses and edits submit an immutable typed reply',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.waitForSelector('.typed-form');assert.equal(await page.locator('.form-field').count(),12);assert.equal(await page.locator('.form-error:not([hidden])').count(),0);
  const before=await page.evaluate(()=>window.__fakefs.dump());await page.locator('.form-buttons [type=submit]').click();assert.match(await page.locator('.form-result').innerText(),/highlighted/);assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await field(page,'owner').locator('input').fill('Demo owner');await field(page,'notes').locator('textarea').fill('Keep original source unchanged.');
  await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').fill('3');await field(page,'tasks').locator('[data-row=viewer][data-column=approved] input').check();
  await field(page,'checks').getByLabel('Browser tests').check();await field(page,'labels').getByRole('button',{name:'Needs review',exact:true}).click();
  await page.locator('.form-buttons [type=submit]').click();await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('ANSWER: {"version":2')));
  const after=await page.evaluate(()=>window.__fakefs.dump()),reply=after.find(f=>f.text.includes('ANSWER: {"version":2')),answer=JSON.parse(reply.text.match(/^ANSWER: (.*)$/m)[1]);
  assert.equal(answer.values.owner,'Demo owner');assert.equal(answer.values.budget,0);assert.deepEqual(answer.values.tasks.changes,[{row:'schema',column:'hours',value:3},{row:'viewer',column:'approved',value:true}]);assert.deepEqual(answer.values.checks,['unit','browser']);
  for(const original of before)assert.deepEqual(after.find(f=>f.path===original.path),original);
  const out=h.path.join(h.tmpDir(),'validated');await h.dumpFakeFs(page,out);const validated=h.boardctl(['validate','--path',out]);assert.equal(validated.code,0,validated.err);
  assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});

test('polling, locale, navigation and respondent changes preserve isolated drafts and reset defaults',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.waitForSelector('.typed-form');await field(page,'owner').locator('input').fill('Owner draft');await field(page,'notes').locator('textarea').fill('Keep caret selection');await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').fill('2.5');
  await field(page,'notes').locator('textarea').focus();await field(page,'notes').locator('textarea').evaluate(el=>el.setSelectionRange(2,7));const builds=await page.evaluate(()=>window.__boardTest.stats.builds);await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.equal(await field(page,'owner').locator('input').inputValue(),'Owner draft');assert.deepEqual(await field(page,'notes').locator('textarea').evaluate(el=>[el===document.activeElement,el.selectionStart,el.selectionEnd]),[true,2,7]);assert.equal(await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').inputValue(),'2.5');
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.form-hint')?.textContent.includes('Pola wymagane'));assert.equal(await field(page,'owner').locator('input').inputValue(),'Owner draft');
  await page.locator('.fname').filter({hasText:'product'}).click();assert.equal(await page.locator('.typed-form').count(),0);await page.locator('.fname').filter({hasText:'reports'}).click();await page.waitForSelector('.typed-form');assert.equal(await field(page,'owner').locator('input').inputValue(),'Owner draft');
  await page.selectOption('#me','research-agent-01');await page.waitForFunction(()=>document.querySelector('[data-form-field=owner] input')?.value==='');await field(page,'owner').locator('input').fill('Agent draft');await page.selectOption('#me','human-owner-01');await page.waitForFunction(()=>document.querySelector('[data-form-field=owner] input')?.value==='Owner draft');
  await page.getByRole('button',{name:'Reset form',exact:true}).click();assert.equal(await field(page,'owner').locator('input').inputValue(),'');assert.equal(await field(page,'budget').locator('input').inputValue(),'0');assert.equal(await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').inputValue(),'0');assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});
test('read-only form replies download typed values and cell patches that the CLI validates',async()=>{
 const {ctx,page,project,log}=await boot({upload:true});try{
  await page.waitForSelector('.typed-form');await field(page,'owner').locator('input').fill('Uploaded demo owner');await field(page,'environment').locator('select').selectOption('production');await field(page,'rollout').getByLabel('Full release').check();await field(page,'plan').getByRole('button',{name:/Quick/}).click();await field(page,'due').locator('input').fill('2026-11-01');await field(page,'percent').locator('input').focus();await page.keyboard.press('End');await field(page,'switches').getByRole('switch',{name:'Notify reviewers'}).uncheck();await field(page,'tasks').locator('[data-row=schema][data-column=state] select').selectOption('done');
  const pending=page.waitForEvent('download');await page.locator('.form-buttons [type=submit]').click();const download=await pending,text=h.fs.readFileSync(await download.path(),'utf8'),a=JSON.parse(text.match(/^ANSWER: (.*)$/m)[1]);assert.equal(a.values.percent,100);assert.equal(a.values.environment,'production');assert.equal(a.values.plan,'quick');assert.deepEqual(a.values.switches,[]);assert.equal(a.values.due,'2026-11-01');
  const out=h.path.join(h.tmpDir(),'uploaded');h.fs.cpSync(project,out,{recursive:true});h.fs.writeFileSync(h.path.join(out,'.agent-board/rooms/reports',download.suggestedFilename()),text);const validated=h.boardctl(['validate','--path',out]);assert.equal(validated.code,0,validated.err);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});
test('invalid cells, failed writes and changed sources retain drafts and publish nothing',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.waitForSelector('.typed-form');await field(page,'owner').locator('input').fill('Safe owner');const before=await page.evaluate(()=>window.__fakefs.dump());
  await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').fill('-1');await page.locator('.form-buttons [type=submit]').click();assert.match(await page.locator('.form-result').innerText(),/highlighted/);assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await field(page,'tasks').locator('[data-row=schema][data-column=hours] input').fill('3');
  await page.evaluate(async()=>{const root=await window.showDirectoryPicker(),board=await root.getDirectoryHandle('.agent-board'),rooms=await board.getDirectoryHandle('rooms'),dir=await rooms.getDirectoryHandle('reports'),proto=Object.getPrototypeOf(await dir.getFileHandle('2026-10-18_1230_implementation-agent-01_T011_form.txt'));window.restoreFormWriter=proto.createWritable;proto.createWritable=async()=>{throw new DOMException('Denied fixture','NotAllowedError');};});
  await page.locator('.form-buttons [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.form-result')?.textContent.includes('Denied fixture'));assert.equal(await field(page,'owner').locator('input').inputValue(),'Safe owner');assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
  await page.evaluate(async file=>{const root=await window.showDirectoryPicker(),board=await root.getDirectoryHandle('.agent-board'),rooms=await board.getDirectoryHandle('rooms'),dir=await rooms.getDirectoryHandle('reports');Object.getPrototypeOf(await dir.getFileHandle(file)).createWritable=window.restoreFormWriter;const path='.agent-board/rooms/reports/'+file;await window.__fakefs.addFile(path,window.__fakefs.read(path).replace('Configure a fictional release','Changed source definition'));},FILE);
  await page.locator('.form-buttons [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.form-result')?.textContent.includes('changed'));assert.equal(await field(page,'owner').locator('input').inputValue(),'Safe owner');assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>/^ANSWER:/m.test(f.text)).length,before.filter(f=>/^ANSWER:/m.test(f.text)).length);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('literal authored strings stay inert; missing bodies and malformed definitions have no controls',async()=>{
 const q=structuredClone(QUESTION);q.prompt='<script>window.attack=1</script> Literal prompt';q.fields[0].label='<img src="https://example.invalid" onerror="window.attack=2">';q.fields[2].default='"), Query("run", {}); root = Html("<script>")';
 const safe=await boot({question:q});await safe.page.waitForSelector('.typed-form');assert.equal(await safe.page.locator('.typed-form img,.typed-form script').count(),0);assert.equal(await safe.page.evaluate(()=>window.attack),undefined);assert.equal(safe.log.requests.filter(u=>!u.startsWith('file:')).length,0);assert.deepEqual(safe.log.pageErrors,[]);await safe.ctx.close();
 for(const config of [{question:{...QUESTION,fields:[{...QUESTION.fields[0],type:'html'}]}},{body:' '}]){const s=await boot(config);assert.equal(await s.page.locator('.typed-form,.choice-form').count(),0);assert.equal(await s.page.locator('.metadata-error').count(),1);await s.ctx.close();}
});
test('form table scrolling contains phone width in both themes',async()=>{
 const {ctx,page,log}=await boot();try{await page.waitForSelector('.typed-form');for(const theme of ['light','dark'])for(const width of [1280,375]){await page.emulateMedia({colorScheme:theme});await page.setViewportSize({width,height:1500});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.form-error:not([hidden])').count(),0);}assert.deepEqual(log.pageErrors,[]);}finally{await ctx.close();}
});

test('board identity separates drafts even when message paths and definitions match',async()=>{
 const seed=await boot();await seed.ctx.close();const tree=h.readTree(seed.project),{ctx,page,log}=await h.openPage(browser,{tree:{kind:'directory',children:{one:structuredClone(tree),two:structuredClone(tree)}},clock:AT});try{
  await page.evaluate(async()=>{const root=await window.showDirectoryPicker();let at=0;window.showDirectoryPicker=()=>root.getDirectoryHandle(['one','two'][at++%2]);});
  await h.openBoardViaUi(page);await page.locator('.fname').filter({hasText:'reports'}).click();await page.waitForSelector('.typed-form');await field(page,'owner').locator('input').fill('Board one draft');
  await page.click('#open');await page.locator('.fname').filter({hasText:'reports'}).click();await page.waitForSelector('.typed-form');assert.equal(await field(page,'owner').locator('input').inputValue(),'');await field(page,'owner').locator('input').fill('Board two draft');
  await page.click('#open');await page.locator('.fname').filter({hasText:'reports'}).click();await page.waitForSelector('.typed-form');assert.equal(await field(page,'owner').locator('input').inputValue(),'Board one draft');assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('agent confirmation and rapid repeated submit cannot publish duplicate typed replies',async()=>{
 const {ctx,page,log}=await boot();try{
  await page.waitForSelector('.typed-form');await page.selectOption('#me','research-agent-01');await page.waitForFunction(()=>!document.querySelector('.typed-form fieldset').disabled);await field(page,'owner').locator('input').fill('Agent draft');const before=await page.evaluate(()=>window.__fakefs.dump());
  page.once('dialog',d=>d.dismiss());await page.locator('.form-buttons [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('.form-buttons [type=submit]').disabled);assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.equal(await field(page,'owner').locator('input').inputValue(),'Agent draft');
  page.once('dialog',d=>d.accept());await page.locator('.typed-form').evaluate(el=>{el.requestSubmit();el.requestSubmit();});await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('ANSWER: {"version":2')));
  assert.equal((await page.evaluate(()=>window.__fakefs.dump())).filter(f=>f.text.includes('ANSWER: {"version":2')).length,1);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('UTF-8 answer byte limit refuses an otherwise valid oversized form without losing text',async()=>{
 const q={...QUESTION,fields:Array.from({length:18},(_,i)=>({id:'note'+i,type:'textarea',label:'Note '+i,required:false,maxLength:4000}))};const {ctx,page}=await boot({question:q});try{
  await page.waitForSelector('.typed-form');const before=await page.evaluate(()=>window.__fakefs.dump());for(let i=0;i<17;i++)await field(page,'note'+i).locator('textarea').fill('x'.repeat(4000));await page.locator('.form-buttons [type=submit]').click();assert.match(await page.locator('.form-result').innerText(),/64 KiB/);assert.equal((await field(page,'note0').locator('textarea').inputValue()).length,4000);assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
 }finally{await ctx.close();}
});

test('failed message cleanup preserves committed bytes and unproven replacement handles',async()=>{
 const {ctx,page}=await boot();try{
  const result=await page.evaluate(async()=>{
   const root=await window.showDirectoryPicker(),base=await root.getDirectoryHandle('.agent-board'),rooms=await base.getDirectoryHandle('rooms'),dir=await rooms.getDirectoryHandle('reports'),source=await dir.getFileHandle('2026-10-18_1230_implementation-agent-01_T011_form.txt'),proto=Object.getPrototypeOf(source),original=proto.createWritable;
   proto.createWritable=async function(){const path=this.__path.join('/');return{write:async()=>{await window.__fakefs.addFile(path,'Other writer committed bytes');throw Error('Interrupted fixture');},close:async()=>{},abort:async()=>{}};};
   try{await window.__boardTest.writeNewFile('rooms/reports/2026-10-18_1400_human-owner-01_T011_foreign.txt','Own bytes');}catch(e){}finally{proto.createWritable=original;}
   return window.__fakefs.read('.agent-board/rooms/reports/2026-10-18_1400_human-owner-01_T011_foreign.txt');
  });assert.equal(result,'Other writer committed bytes');
 }finally{await ctx.close();}
});

test('typed direct replies honor participants and remain in the original pair/topic',async()=>{
 const {ctx,page,log}=await boot({scope:'direct'});try{
  await page.waitForSelector('.typed-form');await page.selectOption('#me','research-agent-01');assert.equal(await page.locator('.form-buttons [type=submit]:enabled').count(),0);await page.selectOption('#me','human-owner-01');await page.waitForSelector('.typed-form');await field(page,'owner').locator('input').fill('Direct demo owner');await page.locator('.form-buttons [type=submit]').click();await page.waitForFunction(()=>window.__fakefs.dump().some(f=>f.text.includes('ANSWER: {"version":2')));
  const reply=(await page.evaluate(()=>window.__fakefs.dump())).find(f=>f.text.includes('ANSWER: {"version":2'));assert.match(reply.path,/direct\/human-owner-01--implementation-agent-01\//);assert.match(reply.text,/SCOPE: DIRECT\nDIRECT-PARTICIPANTS: human-owner-01, implementation-agent-01\nTHREAD: T011-/);const out=h.path.join(h.tmpDir(),'direct');await h.dumpFakeFs(page,out);const validation=h.boardctl(['validate','--path',out]);assert.equal(validation.code,0,validation.err);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('forms and static reports coexist without losing drafts or modal state during polling',async()=>{
 const ui={library:'board-report',version:3,title:'Evidence',components:[{type:'modal',title:'Supporting note',children:[{type:'text',title:'Note',text:'Embedded static evidence.'}]}]};const {ctx,page,log}=await boot({ui});try{
  await page.waitForSelector('.typed-form');await page.waitForSelector('.report-modal-trigger');await field(page,'owner').locator('input').fill('Combined draft');await page.locator('.report-modal-trigger>button').click();await page.locator('dialog.report-modal').waitFor({state:'visible'});const builds=await page.evaluate(()=>window.__boardTest.stats.builds);await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);assert.equal(await page.locator('dialog.report-modal').evaluate(el=>el.open),true);await page.keyboard.press('Escape');await page.locator('dialog.report-modal').waitFor({state:'hidden'});assert.equal(await field(page,'owner').locator('input').inputValue(),'Combined draft');assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
 }finally{await ctx.close();}
});
