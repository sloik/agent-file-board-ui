'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {expect}=require('playwright/test'),h=require('./lib/helpers'),native=require('./lib/signing-browser');
let browser,server,url;
before(async()=>{
  browser=await h.launch();server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}/board.html`;
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});

test('real message emoji badges explain verification and approval on hover and through keyboard/touch details',async t=>{
  const f=await native.boot(t,browser,url),{page,peer}=f;
  await expect(page.locator('[data-signing-state=signature-unsigned]').first()).toContainText('📄');
  const path=f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','emoji-status','--body','Real signed message badge example','--signing-key-file',peer.key);
  await native.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  const article=page.locator(`article[data-file="${h.path.basename(path)}"]`),summary=article.locator('.signing-facts summary'),details=article.locator('.signing-facts');
  const verified=article.locator('[data-signing-state=signature-valid]'),unapproved=article.locator('[data-signing-state=key-unfamiliar]');
  await verified.hover();await expect(verified).toHaveAttribute('title',/message bytes match the signing key/);
  await expect(verified).toContainText('✅');await expect(verified.locator('[aria-hidden=true]')).toHaveText('✅');
  await unapproved.hover();await expect(unapproved).toHaveAttribute('title',/Compare its full fingerprint independently/);
  await expect(unapproved).toContainText('❓');
  await summary.focus();await summary.press('Enter');await expect(details).toHaveAttribute('open','');
  await expect(details.locator('dd')).toContainText([/does not establish your approval/,/Optional board rules may still allow actions/]);
  await summary.press('Space');await expect(details).not.toHaveAttribute('open','');
  await native.openSigning(page);await native.trust(page,peer);await native.closeSigning(page);
  await expect(article.locator('[data-signing-state=key-trusted]')).toContainText('🔑');await expect(article.locator('[data-signing-state=key-unfamiliar]')).toHaveCount(0);
  await expect(article.locator('[data-signing-state=key-trusted]')).toHaveAttribute('title',/this browser for this board location/);
  await page.setViewportSize({width:390,height:844});await summary.click();
  await expect(details.locator('.signing-state-explanations')).toBeVisible();
  assert.equal(await article.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'emoji and long state labels wrap on a phone');
  await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
  await expect(verified).toHaveAttribute('title',/Bajty wiadomości zgadzają się/);
  await summary.click();await expect(details.locator('.signing-state-explanations')).toContainText('Zatwierdzenie jest lokalne');
  assert.equal(await article.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.deepEqual(await page.evaluate(()=>signingProvider.catalog()),[],'reading badges and approving public keys do not unlock private signing');
});

test('a revoked key keeps integrity and approval separate from the blocked message state',async t=>{
  const f=await native.boot(t,browser,url),{page,peer}=f;
  const path=f.cli('post','--from',peer.participant,'--to','all','--scope','room','--room','architecture','--thread','T001','--slug','blocked-emoji','--body','A real signed message from a subsequently compromised key','--signing-key-file',peer.key);
  await native.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));await native.openSigning(page);await native.trust(page,peer);await native.closeSigning(page);
  f.cli('signing','revoke','--participant',peer.participant,'--key-file',peer.key,'--expect-profile',peer.profile,'--status','compromised');
  await native.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));
  await native.openSigning(page);await native.action(page,'Inspect excluded messages');await native.closeSigning(page);
  await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
  const article=page.locator(`article[data-file="${h.path.basename(path)}"]`);
  await expect(article.locator('[data-signing-state=signature-valid]')).toContainText('✅');
  await expect(article.locator('[data-signing-state=key-compromised]')).toContainText('🚨');
  const blocked=article.locator('[data-signing-state=blocked]');await blocked.hover();
  await expect(blocked).toContainText('⛔');await expect(blocked).toHaveAttribute('title',/verified signature alone does not remove this block/);
  assert.equal(await article.locator('[data-reply]:enabled').count(),0);
  assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,path.replace(/^\.agent-board\//,'')),'excluded');
});
