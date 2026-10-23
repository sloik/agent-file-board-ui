'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const P=require('../scripts/source-presentation'),h=require('./lib/helpers');
const cases=JSON.parse(fs.readFileSync(path.join(h.VENDOR,'tests/fixtures/source-diffs.json'))),patch=cases[0].text;
test('portable unified parser preserves raw text and validates hunks, fragments and unsupported patches',()=>{
 for(const c of cases){const p=P.parseDiff(c.text);assert.equal(p.valid,c.valid,c.name);assert.equal(p.raw,c.text,c.name);if(c.valid){assert.equal(p.added,c.added,c.name);assert.equal(p.removed,c.removed,c.name);if(c.fragment)assert.equal(p.fragment,true,c.name);}}
 const p=P.parseDiff(patch);assert.deepEqual(p.rows.filter(r=>['context','removed','added'].includes(r.kind)).map(r=>[r.old,r.next]),[[1,1],[2,null],[null,2],[null,3]]);
});
test('split pairing pads unequal runs and does not invent source line numbers',()=>{
 const rows=P.splitRows(P.parseDiff(patch).rows).filter(r=>!r.meta);assert.equal(rows.length,3);assert.equal(rows[1].left.text,'    return 100');assert.equal(rows[1].right.text,'    # Last known reading');assert.equal(rows[2].left,null);assert.equal(rows[2].right.next,3);
 const fragment=P.parseDiff('-a\n+b\n+c\n');assert.ok(fragment.rows.every(r=>r.old===null&&r.next===null));assert.equal(P.splitRows(fragment.rows)[1].left,null);
});
test('parser has byte/line/range/order boundaries and language hints cannot resolve inherited properties',()=>{
 assert.equal(P.parseDiff('@@ -1 +1 @@\n-a\n+'+'x'.repeat(65536)).reason,'limit');
 assert.equal(P.parseDiff('-a\n'+Array.from({length:2001},()=>'+b\n').join('')).reason,'limit');
 assert.equal(P.parseDiff('@@ -5 +5 @@\n-a\n+b\n@@ -2 +2 @@\n-c\n+d\n').valid,false);
 for(const x of ['constructor','__proto__','toString'])assert.equal(typeof P.language(x),'string');
 assert.equal(P.language('python" onclick="bad'), '');assert.equal(P.language('js'),'javascript');assert.equal(P.filenameLanguage('src/device.py'),'python');
});
let browser;before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const filename='2026-10-20_1200_alpha-agent_T001_source-review.txt';
function fixture(body,type='text/markdown',extra={}){
 const root=fs.realpathSync(h.layoutShuffled(h.tmpDir('afb-source-'))),headers={FROM:'alpha-agent',TO:'all',SCOPE:'ROOM',ROOM:'general',THREAD:'T001-order-check',DATE:'2026-10-20 12:00',LANGUAGE:'en','REPLY-TO':'-',STATUS:'INFO','CONTENT-TYPE':type,...extra};
 fs.writeFileSync(path.join(root,'.agent-board/rooms/general',filename),Object.entries(headers).map(([k,v])=>k+': '+v).join('\n')+'\n---\n'+body+'\n');return root;
}
async function boot(body,type,extra){const root=fixture(body,type,extra),opened=await h.openPage(browser,{tree:h.readTree(root),dialog:'accept'});await h.openBoardViaUi(opened.page);const article=opened.page.locator('article[data-file="'+filename+'"]');assert.equal(await article.locator('.metadata-error').count(),0,'source fixture must have valid message metadata');return {...opened,root,article};}
const markdown='Source and recorded patch.\n\n```python\ndef battery():\n    return 90\n```\n\n```diff\n'+patch+'```';
test('real rich message highlights source and toggles unified/split/source without board writes or draft loss',async()=>{
 const {ctx,page,article,log}=await boot(markdown);try{
  const blocks=article.locator('.source-block'),diff=article.locator('.source-diff');assert.equal(await blocks.count(),2);assert.ok(await blocks.first().locator('.hljs-keyword').count()>0);assert.equal(await diff.locator('tr.source-removed').count(),1);assert.equal(await diff.locator('tr.source-added').count(),2);
  const before=await page.evaluate(()=>window.__fakefs.dump());await page.locator('#cBody').fill('Keep the composer draft');await page.locator('#cBody').evaluate(el=>el.setSelectionRange(3,8));
  await diff.getByRole('button',{name:'Side by side',exact:true}).click();assert.equal(await diff.locator('.source-split').count(),1);assert.equal(await diff.locator('.source-empty').count(),1);
  assert.equal(await page.locator('#cBody').inputValue(),'Keep the composer draft');assert.deepEqual(await page.locator('#cBody').evaluate(el=>[el.selectionStart,el.selectionEnd]),[3,8]);
  await diff.getByRole('button',{name:'Source',exact:true}).click();assert.equal(await diff.locator('pre code').textContent(),patch);
  await page.evaluate(()=>{window.__copied=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});await diff.getByRole('button',{name:'Copy source',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copied),patch);
  await page.locator('#reload').click();await diff.waitFor();assert.equal(await diff.getAttribute('data-source-view'),'source');assert.equal(await page.locator('#cBody').inputValue(),'Keep the composer draft');
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
 }finally{await ctx.close();}
});
test('HTML language hints are interpreted after sanitization without author controls, active source or file links',async()=>{
 const text='<section class="source-block btn" data-source-raw="bad"><button data-source-copy="true">Spoof</button></section><pre><code class="language-javascript" id="me" onclick="alert(1)">const value = &quot;&lt;img src=https://example.invalid/a onerror=alert(1)&gt;&quot;;</code></pre><pre><code class="language-constructor">file:///etc/passwd</code></pre>';
 const {ctx,page,article,log}=await boot(text,'text/html');try{
  assert.equal(await article.locator('.source-block').count(),2);assert.equal(await article.locator('[onclick],[id],img,script,.file-action').count(),0);assert.ok(await article.locator('.hljs-keyword').count()>0);assert.match(await article.locator('.source-block').first().locator('code').textContent(),/<img src=/);assert.equal(await article.locator('button').filter({hasText:'Spoof'}).count(),0);
  assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('direct component copy preserves CRLF and Unicode; malformed, binary and large patches stay fully readable',async()=>{
 const {ctx,page,log}=await boot('Plain body');try{
  const raw=cases.find(c=>c.name==='unicode-crlf').text;
  await page.evaluate(raw=>{window.__copied=null;Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}},configurable:true});const root=BoardSourcePresentation.create({kind:'diff',text:raw,language:''});root.id='source-fixture';document.querySelector('#feed').prepend(root);},raw);
  const root=page.locator('#source-fixture');await root.getByRole('button',{name:'Copy source',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copied),raw);
  for(const text of [cases.find(c=>c.name==='incomplete-count').text,cases.find(c=>c.name==='binary').text,'-a\n+'+'x'.repeat(70000)]){
   await page.evaluate(text=>{document.querySelector('#source-fixture').replaceWith(Object.assign(BoardSourcePresentation.create({kind:'diff',text,language:''}),{id:'source-fixture'}));},text);
   assert.equal(await root.getAttribute('data-source-view'),'source');assert.equal(await root.locator('pre code').textContent(),text);assert.match(await root.locator('[role=status]').textContent(),/unsupported, malformed|presentation limit/);
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));await root.getByRole('button',{name:'Copy source',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#source-fixture [role=status]').textContent.includes('Copy unavailable'));assert.equal(await root.locator('pre code').textContent(),'-a\n+'+'x'.repeat(70000));assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('existing report code blocks and Markdown share the same controls and highlight factory',async()=>{
 const report={library:'board-report',version:3,title:'Source report',components:[{type:'code-block',title:'device.py',code:'def battery():\n    return 90'},{type:'code-block',title:'Recorded patch',code:patch},{type:'markdown',title:'Markdown patch',text:'```diff\n'+patch+'```'}]};
 const {ctx,page,article,log}=await boot('Readable report summary.','text/plain',{UI:JSON.stringify(report)});try{
  await article.locator('.board-report .source-block').last().waitFor();assert.equal(await article.locator('.board-report .source-block').count(),3);assert.ok(await article.locator('.board-report .hljs-keyword').count()>0);assert.equal(await article.locator('.board-report .source-diff').count(),2);await article.locator('.board-report .source-diff').last().getByRole('button',{name:'Side by side',exact:true}).click();assert.equal(await article.locator('.source-split').count(),1);assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
test('SDK1.3 declarative and approved worker components render source and diffs through the common host',async()=>{
 const root=fixture('Readable source review.'),sample=path.join(h.VENDOR,'examples/extensions/source-review.afb-plugin.json'),py=(...args)=>{const r=cp.spawnSync('python3',[h.BOARDCTL,...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const artifact=JSON.parse(py('extensions','install',sample,'--path',root)).artifact,example=JSON.parse(JSON.parse(fs.readFileSync(sample)).files['example.json'].data),data=path.join(root,'data.json'),env=path.join(root,'envelope.json');fs.writeFileSync(data,JSON.stringify(example));fs.writeFileSync(env,py('extensions','envelope',artifact,'--path',root,'--contract','com.example.source-code/review','--data-file',data,'--renderer-package',artifact,'--renderer','source'));py('post','--path',root,'--from','alpha-agent','--to','all','--scope','room','--room','general','--thread','T001','--slug','extension-source','--body','Readable shared source presentation.','--extension-file',env);
 const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(root),dialog:'accept'});try{
  await h.openBoardViaUi(page);const component=page.locator('[data-extension-path]');assert.equal(await component.locator('.source-block').count(),2);assert.ok(await component.locator('.hljs-keyword').count()>0);await component.locator('select').first().selectOption({label:'Source and patch review 1.0.1 / source-worker'});assert.equal(await component.getAttribute('data-extension-state'),'unapproved');assert.equal(await component.locator('.source-block').count(),0);await component.getByRole('button',{name:'Review extension',exact:true}).click();await page.locator('#extensionsDialog').getByRole('button',{name:'Approve this exact package',exact:true}).click();await page.locator('#extensionsDialog').getByRole('button',{name:'Close',exact:true}).click();await component.locator('.source-block').last().waitFor();assert.equal(await component.locator('.source-block').count(),2);await component.locator('.source-diff').getByRole('button',{name:'Side by side',exact:true}).click();assert.equal(await component.locator('.source-split').count(),1);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
 }finally{await ctx.close();}
});
test('source presentation stays legible in all themes and on a Polish phone without page overflow',async()=>{
 const {ctx,page,article,log}=await boot(markdown);try{
  for(const theme of ['light','dark','dracula']){
   await page.locator('#gear').click();await page.selectOption('#sTheme',theme);await page.selectOption('#sLang','pl');await page.locator('#settingsClose').click();await page.setViewportSize({width:390,height:844});
   const diff=article.locator('.source-diff');await diff.getByRole('button',{name:'Obok siebie',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await diff.evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.ok(await diff.locator('.source-added').evaluateAll(els=>els.length===2&&els.every(el=>getComputedStyle(el).backgroundColor!=='rgba(0, 0, 0, 0)')));await diff.screenshot({path:'/tmp/afb-source-'+theme+'-phone.png'});
  }
  assert.deepEqual(log.pageErrors,[]);
 }finally{await ctx.close();}
});
