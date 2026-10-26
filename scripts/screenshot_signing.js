'use strict';
// Actual native-browser signing UI with disposable fixture identities. Only the
// folder picker is substituted; signatures and key approval use production paths.
// The fixture is seeded, so fingerprints and the board ID repeat between runs.
const assert=require('node:assert/strict'),http=require('node:http');
const h=require('../tests/lib/helpers');
const signing=require('../tests/lib/signing-browser');
// Every capture this script writes to docs/images; tests check each is referenced by a guide.
const SHOTS=['signing-message','signing-review','signing-review-step1','signing-review-step2','signing-review-step3','signing-review-mismatch','signing-review-echo','signing-review-step4','signing-review-approved','signing-review-own-key','signing-my-fingerprint','signing-own','signing-composer','signing-phone',
  // SPEC-002-073: the Keys list on a board with a key in every state.
  'signing-keys','signing-keys-changed','signing-keys-revoked','signing-keys-remove','signing-keys-phone'];
async function main(){
  const browser=await h.launch(),cleanups=[];
  const server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin=`http://127.0.0.1:${server.address().port}`;
    const f=await signing.boot({after:fn=>cleanups.push(fn)},browser,origin+'/board.html',null,{seed:'docs'}),{page}=f;
    await f.ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    // The captures use tall viewports so a whole task fits in the dialog; lift the dialog shell's 960px
    // height cap for them (SPEC-002-075). Widths keep the shell's wide tier.
    const tall=p=>p.addStyleTag({content:':root{--dialog-wide-h:calc(100dvh - 48px)}'});
    await tall(page);
    const out=h.path.join(h.ROOT,'docs/images');h.fs.mkdirSync(out,{recursive:true});
    const written=[];
    const shot=async(locator,name)=>{assert.ok(SHOTS.includes(name),name);await locator.screenshot({path:h.path.join(out,name+'.png'),animations:'disabled'});written.push(name);};
    // A single step, widened to the left so its number (drawn outside the item) is in the picture.
    const stepShot=async(locator,name)=>{
      assert.ok(SHOTS.includes(name),name);await locator.scrollIntoViewIfNeeded();
      const box=await locator.boundingBox(),pad=8,left=36;
      await page.screenshot({path:h.path.join(out,name+'.png'),animations:'disabled',clip:{x:box.x-left,y:box.y-pad,width:box.width+left+pad,height:box.height+pad*2}});written.push(name);
    };
    await page.setViewportSize({width:1440,height:1080});
    const path=f.cli('post','--from',f.peer.participant,'--to',f.owner.participant,'--scope','room','--room','architecture','--thread','T001','--slug','signing-example','--body','Fictional signing example: please review the design. The signature checks these message bytes; key approval is your separate decision.','--signing-key-file',f.peer.key);
    await signing.importBoard(page,f.proj);await page.evaluate(()=>readFromHandle(true));
    await page.locator('.tcard[data-tk="room:architecture|T001"]').click();
    const article=page.locator(`article.msg[data-file="${h.path.basename(path)}"]`);
    await article.locator('.signing-facts summary').click();await article.scrollIntoViewIfNeeded();
    await shot(article,'signing-message');
    if(process.argv.includes('--message-only')){console.log('Captured actual message emoji states and explanations.');return;}
    // Guided review (SPEC-002-071), one capture per step. A tall viewport keeps each task whole.
    await page.setViewportSize({width:1100,height:1800});
    await signing.openSigning(page);
    const review=page.locator('#signing-review'),steps=page.locator('#signingReviewSteps > li'),field=page.locator('#signingFingerprint');
    await page.locator('[data-signing-task=review]').click();
    await signing.selectKey(page,f.peer.participant);
    await shot(review,'signing-review');
    await page.locator('.signing-find summary').click();
    await page.locator('#signingCopyRequest').click();
    await page.locator('#signing-review .signing-feedback').filter({hasText:'Copied.'}).waitFor();
    await stepShot(steps.nth(0),'signing-review-step1');
    // The value the owner sent arrives from outside the dialog.
    await page.evaluate(v=>navigator.clipboard.writeText(v+'\n'),f.peer.fingerprint);
    await page.locator('#signingPaste').click();
    await page.locator('#signingCompare[data-state="match"]').waitFor();
    await stepShot(steps.nth(1),'signing-review-step2');
    await stepShot(steps.nth(2),'signing-review-step3');
    await stepShot(steps.nth(3),'signing-review-step4');
    const fp=f.peer.fingerprint,i=fp.length-12;
    await field.fill(fp.slice(0,i)+(fp[i]==='A'?'B':'A')+fp.slice(i+1));
    await page.locator('#signingCompare[data-state="mismatch"]').waitFor();
    await shot(page.locator('#signingReviewSteps > li').nth(1).locator('xpath=..'),'signing-review-mismatch');
    // Echo: the board value copied inside the dialog and pasted back.
    await page.locator('#signing-review .signing-key-card code').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
    await page.keyboard.press('ControlOrMeta+C');
    await field.fill('');await field.focus();await page.keyboard.press('ControlOrMeta+V');
    await page.locator('#signingEcho').waitFor();
    await page.evaluate(()=>getSelection().removeAllRanges());
    await stepShot(steps.nth(3),'signing-review-echo');
    // The value matches the owner's own reply here, so the confirmation is honest.
    await page.locator('#signingEchoConfirm').check();
    await signing.action(page,'trust');
    await page.locator('#signing-review .signing-feedback').filter({hasText:'Exact key approved locally'}).waitFor();
    await shot(review,'signing-review-approved');
    await signing.closeSigning(page);
    // The owner's side: unlock, see and copy their own fingerprint, then check their own key.
    await signing.unlock(page,f.owner);await signing.openSigning(page);
    await page.locator('[data-signing-task=own]').click();
    await page.locator('#signingMyFingerprint').waitFor();
    await shot(page.locator('#signing-own'),'signing-own');
    await shot(page.locator('#signingMyFingerprint'),'signing-my-fingerprint');
    await page.locator('[data-signing-task=review]').click();
    await signing.selectKey(page,f.owner.participant);
    await page.locator('#signingCheckOwnKey').click();
    await page.locator('#signingCompare[data-state="match"]').waitFor();
    await stepShot(steps.nth(0).locator('xpath=..'),'signing-review-own-key');
    await signing.closeSigning(page);
    assert.equal(await page.locator('#signingNotice').getAttribute('data-signing-status'),'signed');
    await page.setViewportSize({width:1440,height:1080});
    await shot(page.locator('#composer'),'signing-composer');
    await signing.openSigning(page);
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-signing-task=check]').click();
    assert.equal(await page.locator('#signingDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
    await shot(page,'signing-phone');
    await signing.closeSigning(page);
    // Keys (SPEC-002-073) on a second board with a key in every state: three approved through the review,
    // then one of them replaced on the board.
    let ids;
    const k=await signing.boot({after:fn=>cleanups.push(fn)},browser,origin+'/board.html',f=>{ids=f.keys();},{seed:'docs'}),kp=k.page;
    await tall(kp);
    await kp.selectOption('#me',k.owner.participant);
    await signing.openSigning(kp);
    for(const identity of [k.owner,k.peer,ids['build-agent-02']])await signing.trust(kp,identity);
    await signing.closeSigning(kp);
    k.rotate('build-agent-02');await signing.importBoard(kp,k.proj);await kp.evaluate(()=>readFromHandle(true));
    await kp.click('#keyNoticeLater');
    const keyShot=async(locator,name)=>{assert.ok(SHOTS.includes(name),name);await locator.screenshot({path:h.path.join(out,name+'.png'),animations:'disabled'});written.push(name);};
    // Tall enough that the whole task fits in the dialog: an element capture shows only its visible part.
    await kp.setViewportSize({width:1100,height:2100});
    await signing.openSigning(kp);await kp.locator('[data-signing-task=review]').click();
    const keys=kp.locator('#signing-review');
    await keyShot(keys,'signing-keys');
    await signing.selectKey(kp,'build-agent-02');await kp.locator('#signingKeyDetail').evaluate(el=>{el.scrollTop=0;});
    await keyShot(kp.locator('#signingKeyDetail'),'signing-keys-changed');
    await signing.selectKey(kp,'edge-agent-05');
    await keyShot(kp.locator('#signingKeyDetail'),'signing-keys-revoked');
    await signing.selectKey(kp,k.peer.participant);
    await kp.locator('[data-action="remove-trust-ask"]').click();
    await keyShot(kp.locator('#signingKeyDetail .signing-key-remove'),'signing-keys-remove');
    await signing.closeSigning(kp);
    await kp.setViewportSize({width:390,height:844});
    await h.openToolbarTool(kp,'reviewKeysTool');
    await kp.locator('#signingKeyDetail').waitFor();
    await kp.locator('#signingKeys [aria-selected="true"]').evaluate(el=>el.scrollIntoView({block:'center'}));
    await keyShot(kp,'signing-keys-phone');
    assert.deepEqual(written.sort(),[...SHOTS].sort(),'every declared capture is written');
    console.log('Captured real message, the guided key review steps, own fingerprint and own-key check, own signing, composer status and phone layout. Fixture keys remain private and are deleted.');
  }finally{
    for(const cleanup of cleanups.reverse())await cleanup();
    await browser.close();await new Promise(resolve=>server.close(resolve));
  }
}
module.exports={SHOTS};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
