"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const color=locator=>locator.evaluate(el=>getComputedStyle(el).color);

test("mentions and participant hints match chat colors through themes and registry refresh",async()=>{
  const tree=h.readTree(h.layoutExample(h.tmpDir()));
  const rooms=tree.children['.agent-board'].children.rooms.children;
  rooms.mentions={kind:'directory',children:Object.fromEntries(['text/plain','text/markdown','text/html'].map((type,i)=>[
    `2026-10-15_140${i}_research-agent-01_T020_mention-${i}.txt`,{kind:'file',text:`FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: mentions\nTHREAD: T020-mentions\nDATE: 2026-10-15 14:0${i}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\nCONTENT-TYPE: ${type}\n---\n${type==='text/html'?'<p>Ask <strong>@human-owner-01</strong>, (@implementation-agent-01) and @RESEARCH-AGENT-01; @nobody. Email x@human-owner-01. <code>@human-owner-01</code></p>':'Ask @human-owner-01, (@implementation-agent-01) and @RESEARCH-AGENT-01; @nobody. Email x@human-owner-01. `@human-owner-01`'}\n`}
  ]))};
  const {ctx,page,log}=await h.openPage(browser,{tree});
  await h.openBoardViaUi(page);await h.expandComposer(page);
  const mentions=page.locator("article[data-author='research-agent-01'][data-file*='_mention-'] .mention");
  const verify=async()=>{
    for(const id of ['human-owner-01','implementation-agent-01','research-agent-01']){
      const expected=await color(page.locator(`article[data-author='${id}'] .who`).first());
      const rendered=mentions.locator(`xpath=self::*[@data-party='${id}']`);
      assert.equal(await rendered.count(),3);
      for(const mention of await rendered.all()) assert.equal(await color(mention),expected);
      await page.fill('#cBody','@'+id.slice(0,7));
      const hint=page.locator(`#bodySuggestions button[data-party='${id}']`);
      assert.equal(await hint.count(),1);assert.equal(await color(hint),expected);
      await page.press('#cBody','ArrowDown');
      assert.equal(await color(hint),expected,'keyboard-selected hint retains identity color');
      await page.press('#cBody','Enter');assert.equal(await page.inputValue('#cBody'),'@'+id+' ');
      await page.fill('#cToSearch',id);
      assert.equal(await color(page.locator(`#cToSuggestions button[data-party='${id}']`)),expected);
      // SPEC-002-064: the chip's recipient picker uses the same identity colors (the sender is not offered).
      if(id!==await page.inputValue('#me')){
        await h.openView(page,'mentions');await page.click('#composerTo');await page.fill('#composerTargetSearch',id);
        assert.equal(await color(page.locator(`#composerTargetList button[data-party='${id}']`)),expected);await page.keyboard.press('Escape');await page.locator('.tree-root').click();
      }
    }
    assert.equal(await mentions.count(),12,'three identities and one unknown per format; code and email stay literal');
    assert.equal(await page.locator("article[data-file*='_mention-'] code .mention").count(),0);
    assert.equal(await mentions.locator('xpath=self::*[not(@data-party)]').count(),3);
  };
  await verify();await page.emulateMedia({colorScheme:'dark'});await verify();
  await page.evaluate(()=>{
    const path='.agent-board/participants.json',reg=JSON.parse(window.__fakefs.read(path));
    reg.participants.reverse();reg.participants.unshift({id:'aaa-new-agent',kind:'agent'});
    window.__fakefs.addFile(path,JSON.stringify(reg));
  });
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.click('#reload');await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);
  await verify();assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
