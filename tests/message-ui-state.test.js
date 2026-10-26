'use strict';
// SPEC-002-060: reader disclosure state for chat messages survives refreshes and reloads.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {expect}=require('playwright/test'),h=require('./lib/helpers'),native=require('./lib/signing-browser');
let browser,server,url;
before(async()=>{
  browser=await h.launch();server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

const STORE='agent-file-board.message-ui.';
async function signedBoard(t){
  const f=await native.boot(t,browser,url),{page,peer}=f;
  const signed=f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','ui-state','--body','Signed message whose details a reader expands','--signing-key-file',peer.key);
  const long=f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','long-body','--body','Long body. '.repeat(120));
  await native.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));
  await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  return {...f,signed:h.path.basename(signed),long:h.path.basename(long)};
}
const facts=(page,file)=>page.locator(`article[data-file="${file}"] .signing-facts`);
const refresh=page=>page.evaluate(()=>readFromHandle(true));
async function storedSoon(ctx,page,predicate){
  // localStorage commits asynchronously across pages; observe it from a second page before reloading.
  const probe=await ctx.newPage();
  try{await probe.goto(page.url());await expect.poll(()=>probe.evaluate(([prefix,source])=>{
    const rows=Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(localStorage.getItem(k)));
    return new Function('rows','return ('+source+')(rows)')(rows);
  },[STORE,predicate.toString()]),{timeout:5000}).toBe(true);}finally{await probe.close();}
}

test('expanded signing details stay open across a board refresh (the reported bug)',async t=>{
  const {page,signed}=await signedBoard(t);
  await facts(page,signed).locator('summary').click();
  await expect(facts(page,signed)).toHaveAttribute('open','');
  await refresh(page);await refresh(page);
  await expect(facts(page,signed)).toHaveAttribute('open','');
  // Collapsing is a choice too and survives the next refresh.
  await facts(page,signed).locator('summary').click();
  await expect(facts(page,signed)).not.toHaveAttribute('open','');
  await refresh(page);
  await expect(facts(page,signed)).not.toHaveAttribute('open','');
});

test('expanded details and "Show all" survive a page reload of the same board, and untouched messages keep defaults',async t=>{
  const {page,ctx,signed,long}=await signedBoard(t);
  await facts(page,signed).locator('summary').click();
  const longMsg=page.locator(`article[data-file="${long}"]`);
  await longMsg.locator('[data-more]').click();
  await expect(longMsg.locator('.body')).not.toHaveClass(/clamp/);
  await storedSoon(ctx,page,rows=>rows.some(r=>JSON.stringify(r).includes('signing-facts')&&JSON.stringify(r).includes('|more')));
  await page.reload();await h.openBoardViaUi(page);
  await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  await expect(facts(page,signed)).toHaveAttribute('open','');
  await expect(page.locator(`article[data-file="${long}"] .body`)).not.toHaveClass(/clamp/);
  // A message the reader never touched keeps its default (collapsed) signing details.
  await expect(facts(page,long)).not.toHaveAttribute('open','');
  const raw=await page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>localStorage.getItem(k)).join(''),STORE);
  assert.ok(!raw.includes('Signed message whose details'),'only keys and open flags are stored, never message text');
});

test('read-only uploads keep disclosure state for the session only and never write storage',async t=>{
  const f=await native.boot(t,browser,url),{peer}=f;
  const signed=h.path.basename(f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','upload','--body','Uploaded signed message','--signing-key-file',peer.key));
  const ctx=await browser.newContext(),page=await ctx.newPage();t.after(()=>ctx.close());
  await page.goto(url);
  const before=await page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length,STORE);
  await page.setInputFiles('#fallback',f.proj);
  await page.waitForFunction(()=>window.__boardTest.getModel()!==null,null,{timeout:5000});
  await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  await facts(page,signed).locator('summary').click();
  await page.evaluate(()=>render());
  await expect(facts(page,signed)).toHaveAttribute('open','');
  assert.equal(await page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length,STORE),before);
});
