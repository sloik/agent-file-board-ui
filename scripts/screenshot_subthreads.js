'use strict';
// SPEC-002-080 AC5 (was SPEC-002-078): sub-thread captures from the downloadable demo (architecture T017), for
// docs/guides/SUBTHREADS.md, docs/FEATURES.md and the README. The real viewer, headless, on a temporary copy of the
// demo's fictional board held in the in-memory test folder; no user folders and no network (every non-file request is
// aborted and counted). It writes only docs/images/subthreads/*.png, relative to the repository.
// Run: node scripts/screenshot_subthreads.js
const h=require('../tests/lib/helpers'),{demoFixture}=require('../tests/lib/demo'),assert=require('node:assert/strict');
const OUT=h.path.join(h.ROOT,'docs','images','subthreads');
const SHOTS=['pane-wide','pane-phone','list','strip-question','resolved','flat-view','pane-dark','pane-dracula','promote-dialog','promoted-topic'];
async function main(){
 const demo=demoFixture(),browser=await h.launch();h.fs.mkdirSync(OUT,{recursive:true});const written=[];
 try{
  const {ctx,page,log}=await h.openPage(browser,{html:demo.html,dialog:'accept',tree:h.readTree(demo.project),clock:new Date('2026-10-18T11:05:00Z')});
  const blocked=[];await ctx.route(/^(?!file:)/,route=>{blocked.push(route.request().url());return route.abort();});
  const shot=async(name,target=page)=>{assert.ok(SHOTS.includes(name),name);const path=h.path.join(OUT,name+'.png');await target.screenshot({path});written.push(name);};
  const messages=()=>page.evaluate(()=>window.__fakefs.dump().filter(f=>/\/(rooms|direct)\//.test(f.path)));
  const theme=value=>page.evaluate(v=>{const el=document.querySelector('#sTheme');el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  await page.setViewportSize({width:1440,height:900});await h.openBoardViaUi(page);await page.selectOption('#me','human-owner-01');const before=await messages();
  await page.locator('.tcard[data-tk="room:architecture|T017"]').click();await page.locator('#feed .sub-strip').first().waitFor();await page.locator('#feed').evaluate(e=>e.scrollTop=0);
  const storage=page.locator('#feed article',{has:page.locator('.sub-strip.sub-question')}),queue=page.locator('#feed article',{has:page.locator('.sub-strip.sub-resolved')});
  // The root's strip with "Question for you" (the open sub-thread asks human-owner-01 a question).
  await expect(storage.locator('.sub-cap'),'Question for you');await shot('strip-question',storage);
  // The Sub-threads list in the topic bar: active, then resolved.
  await page.click('#subMenuToggle');await page.locator('#subMenuPanel').waitFor();await shot('list');await page.click('#subMenuToggle');
  // Wide window: the topic beside the pane, with a draft in the pane's own composer.
  await storage.locator('.sub-strip').click();await page.locator('#subPane').waitFor();assert.equal(await page.locator('#subFeed article.msg').count(),3);
  await page.fill('#subBody','Keep 90 days of history.');await shot('pane-wide');
  await theme('dark');await shot('pane-dark');await theme('dracula');await shot('pane-dracula');await theme('light');
  // A resolved sub-thread: the banner names the outcome; Reopen replaces Resolve.
  await page.click('#subClose');await queue.locator('.sub-strip').click();await page.locator('#subBanner:not([hidden])').waitFor();
  assert.match(await page.locator('#subBanner').textContent(),/Outcome: keep the fictional file queue/);await shot('resolved');await page.click('#subClose');
  // Flat view: the members back in the topic, in posting order.
  await page.evaluate(()=>document.querySelector('#flatViewToggle').click());
  await page.locator('#feed article.msg',{hasText:'Two fictional candidates'}).waitFor();await shot('flat-view');
  await page.evaluate(()=>document.querySelector('#flatViewToggle').click());await page.locator('#feed article.msg',{hasText:'Two fictional candidates'}).waitFor({state:'detached'});
  // Phone: the pane fills the screen with Back.
  await page.setViewportSize({width:390,height:760});await storage.locator('.sub-strip').click();await page.locator('#subPane').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await shot('pane-phone');
  await page.click('#subBack');await page.setViewportSize({width:1440,height:900});
  assert.deepEqual(await messages(),before,'no capture so far wrote a message (the draft is not posted)');
  // Promote to topic: the dialog, then the new topic's "Continued from a sub-thread". Two writes, to the temporary copy only.
  await storage.locator('.sub-strip').click();await page.locator('#subPane').waitFor();
  await page.click('#subPaneMenuToggle');await page.click('#subPromote');await page.fill('#subAskInput','Storage engine decision');await shot('promote-dialog');
  await page.click('#subAskOk');await page.locator('#feed .sub-promoted').waitFor();await page.evaluate(()=>document.querySelector('#toast').classList.remove('show'));await page.waitForFunction(()=>getComputedStyle(document.querySelector('#toast')).opacity==='0');await shot('promoted-topic');
  const after=await messages(),added=after.filter(f=>!before.some(b=>b.path===f.path));
  assert.equal(added.length,2,'Promote wrote the new topic and the resolving message');for(const b of before)assert.deepEqual(after.find(f=>f.path===b.path),b,'nothing was modified or deleted');
  assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.deepEqual(blocked,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);
  assert.deepEqual(written.sort(),[...SHOTS].sort());await ctx.close();
  console.log(`${written.length} sub-thread captures in docs/images/subthreads/; zero network; Promote wrote only to the temporary demo copy.`);
 }finally{await browser.close();h.fs.rmSync(demo.tmp,{recursive:true,force:true});}
}
async function expect(locator,text){await locator.waitFor();assert.equal((await locator.textContent()).trim(),text);}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={SHOTS};
