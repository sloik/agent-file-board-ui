"use strict";
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const h=require('./lib/helpers');
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
async function render(text,type='text/plain'){
  const s=await h.openPage(browser);
  await s.page.evaluate(({text,type})=>{
    const body=document.createElement('div');body.id='file-test';body.innerHTML=window.__boardTest.formatBody(text,'',type);document.body.append(body);
  },{text,type});return s;
}
test('plain inline paths and Markdown/HTML file links have encoded open and parent-folder actions',async()=>{
  const path="/Users/ed/My folder/plan ' # % 🦊.md";
  for(const [text,type] of [[`Read \`${path}\`. Also \`/Users/ed/My folder/\`. It's literal: \`npm test\`.`, 'text/plain'],[`[Review plan](file://${encodeURI(path).replace(/#/g,'%23')})`,'text/markdown'],[`<a href="file://${encodeURI(path).replace(/#/g,'%23')}"><strong>Review plan</strong></a>`,'text/html']]){
    const {ctx,page,log}=await render(text,type),body=page.locator('#file-test');
    const links=await body.locator('.file-action').evaluateAll(els=>els.map(a=>[a.textContent,a.getAttribute('href')]));
    const encoded=path.split('/').map(encodeURIComponent).join('/');
    assert.deepEqual(links.slice(0,2),[['Open','agent-file-board://file-open'+encoded],['Open containing folder','agent-file-board://file-folder'+encoded]]);
    assert.equal(links.length,type==='text/plain'?4:2);
    assert.equal(await body.locator('a[href^="file:"]').count(),0);
    assert.deepEqual(log.pageErrors,[]);await ctx.close();
  }
});
test('remote hosts, traversal, controls, malformed escapes and injected native actions stay inert',async()=>{
  const refs=['file://server/etc/passwd','file:///tmp/../etc/passwd','file:///tmp/%2e%2e/etc/passwd','file:///tmp/%00x','file:///tmp/%ZZ','file:///tmp/a?command=open','file:///tmp/a#fragment','//server/share','/tmp/../file'];
  const html=refs.map(x=>`<a href="${x}">bad</a>`).join('')+'<a href="agent-file-board://file-open/tmp/a" class="file-action" data-reply="attack" onclick="alert(1)">Injected</a><a href="javascript:alert(1)">JS</a><a href="https://example.com">Web</a>';
  const {ctx,page}=await render(html,'text/html');
  assert.equal(await page.locator('#file-test .file-action').count(),0);
  assert.deepEqual(await page.locator('#file-test a[href]').evaluateAll(els=>els.map(a=>a.getAttribute('href'))),['https://example.com']);
  assert.equal(await page.locator('#file-test [onclick],#file-test [data-reply]').count(),0);await ctx.close();
});
test('fenced examples stay literal and inline code inside web links is not nested with actions',async()=>{
  const {ctx,page}=await render('```md\n[file](file:///tmp/example.md)\n/tmp/example.md\n```\n\n[inline `/tmp/example.md`](https://example.com)','text/markdown');
  assert.equal(await page.locator('#file-test .file-action').count(),0);
  assert.match(await page.locator('#file-test pre').innerText(),/file:\/\/\/tmp/);await ctx.close();
});

test('bare file URIs work in real messages without opening resources or overflowing a phone',async()=>{
  const proj=h.layoutExample(h.tmpDir()),file='2026-10-16_1230_implementation-agent-01_T099_files.txt';
  const path=h.path.join(proj,'.agent-board/rooms/product',file);
  h.fs.writeFileSync(path,'FROM: implementation-agent-01\nTO: all\nSCOPE: ROOM\nROOM: product\nTHREAD: T099-files\nDATE: 2026-10-16 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nRead file:///Users/ed/My%20folder/report.md. Then `/Users/ed/'+ 'long-folder/'.repeat(20)+'`.\n');
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(proj)});await h.openBoardViaUi(page);
  const article=page.locator(`article[data-file="${file}"]`);await article.waitFor();
  assert.equal(await article.locator('.file-action').count(),4);
  assert.equal(await article.locator('.file-action').first().getAttribute('href'),'agent-file-board://file-open/Users/ed/My%20folder/report.md');
  await page.setViewportSize({width:375,height:812});
  assert.ok(await article.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.equal(log.requests.filter(url=>!url.startsWith('file:')).length,0);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
test('HTML preformatted local links cannot retain active file URIs',async()=>{
  const {ctx,page}=await render('<pre><a href="file:///tmp/example.md">example</a></pre>','text/html');
  assert.equal(await page.locator('#file-test a[href],#file-test .file-action').count(),0);await ctx.close();
});
