'use strict';
// Actual native-browser signing UI with disposable fixture identities. Only the
// folder picker is substituted; signatures and key approval use production paths.
const assert=require('node:assert/strict'),http=require('node:http');
const h=require('../tests/lib/helpers');
const signing=require('../tests/lib/signing-browser');
async function main(){
  const browser=await h.launch(),cleanups=[];
  const server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const f=await signing.boot({after:fn=>cleanups.push(fn)},browser,`http://127.0.0.1:${server.address().port}/board.html`),{page}=f;
    const out=h.path.join(h.ROOT,'docs/images');h.fs.mkdirSync(out,{recursive:true});
    await page.setViewportSize({width:1440,height:1080});
    const path=f.cli('post','--from',f.peer.participant,'--to',f.owner.participant,'--scope','room','--room','architecture','--thread','T001','--slug','signing-example','--body','Fictional signing example: please review the design. The signature checks these message bytes; key approval is your separate decision.','--signing-key-file',f.peer.key);
    await signing.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));
    await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
    const article=page.locator(`article.msg[data-file="${h.path.basename(path)}"]`);
    await article.locator('.signing-facts summary').click();await article.scrollIntoViewIfNeeded();
    await article.screenshot({path:h.path.join(out,'signing-message.png'),animations:'disabled'});
    await signing.openSigning(page);
    await page.getByLabel('Trust participant',{exact:true}).selectOption(f.peer.participant);
    await page.locator('#signing-review').screenshot({path:h.path.join(out,'signing-review.png'),animations:'disabled'});
    await signing.trust(page,f.peer);
    await page.locator('#signing-review').screenshot({path:h.path.join(out,'signing-review-approved.png'),animations:'disabled'});
    await signing.closeSigning(page);await signing.unlock(page,f.owner);await signing.openSigning(page);
    await page.locator('#signing-own').screenshot({path:h.path.join(out,'signing-own.png'),animations:'disabled'});
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-signing-task=check]').click();
    assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
    await page.screenshot({path:h.path.join(out,'signing-phone.png'),animations:'disabled'});
    console.log('Captured real message, participant review before/after approval, own signing and phone layout. Fixture keys remain private and are deleted.');
  }finally{
    for(const cleanup of cleanups.reverse())await cleanup();
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
