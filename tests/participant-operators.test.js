"use strict";
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const h=require('./lib/helpers');
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
function fixture(){
  const root=h.layoutShuffled(h.tmpDir());
  const path=h.path.join(root,'.agent-board/participants.json');
  const reg=JSON.parse(h.fs.readFileSync(path,'utf8'));
  reg.participants[0].operator='bravo-human';
  reg.participants.push({id:'second-agent',kind:'agent',operator:'bravo-human'});
  reg.participants.push({id:'unlinked-agent',kind:'agent'});
  h.fs.writeFileSync(path,JSON.stringify(reg));
  return {root,reg};
}
test('native operator claims use stable IDs and refresh without changing identity or hiding messages',async()=>{
  const {root,reg}=fixture();
  const {ctx,page,log}=await h.openPage(browser,{tree:h.readTree(root)});
  try{
    await h.openBoardViaUi(page);
    await page.selectOption('#me','alpha-agent');
    const count=await page.locator('.msg').count();
    await h.openToolbarTool(page,'presenceOpen');
    for(const id of ['alpha-agent','second-agent']) assert.match(await page.locator(`[data-presence-id="${id}"] .participant-operator`).textContent(),/Operator claimed by this agent: bravo-human.*no verified human consent/);
    assert.equal(await page.locator('[data-presence-id="unlinked-agent"] .participant-operator').count(),0);
    reg.participants=reg.participants.filter(p=>p.id!=='bravo-human');
    await page.evaluate(reg=>window.__fakefs.addFile('.agent-board/participants.json',JSON.stringify(reg)),reg);
    await page.click('#presenceClose');
    const builds=await page.evaluate(()=>window.__boardTest.stats.builds);
    await page.click('#reload');
    await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
    await h.openToolbarTool(page,'presenceOpen');
    assert.match(await page.locator('[data-presence-id="alpha-agent"] .participant-operator').textContent(),/association unknown/);
    assert.equal(await page.locator('.msg').count(),count);
    assert.equal(await page.inputValue('#me'),'alpha-agent');
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();h.fs.rmSync(root,{recursive:true,force:true});}
});
test('upload diagnostics are inert, localized and fit a narrow participant dialog',async()=>{
  const {root,reg}=fixture();
  reg.participants[0].operator='<img src=x onerror=alert(1)>';
  reg.participants[1].operator='alpha-agent'; // humans cannot claim an operator
  reg.participants.push(...[null,{},[],42,'second-agent','missing-human'].map((operator,i)=>({id:`bad-agent-${i}`,kind:'agent',operator})));
  h.fs.writeFileSync(h.path.join(root,'.agent-board/participants.json'),JSON.stringify(reg));
  const {ctx,page,log}=await h.openPage(browser);
  try{
    await page.setInputFiles('#fallback',root);await page.waitForSelector('.msg');
    await page.click('#gear');await page.selectOption('#sLang','pl');await page.click('#sClose');
    await page.setViewportSize({width:375,height:812});
    await h.openToolbarTool(page,'presenceOpen');
    assert.equal(await page.locator('.participant-operator').count(),9);
    assert.equal(await page.locator('#presenceDialog img').count(),0);
    assert.match(await page.locator('[data-presence-id="alpha-agent"]').textContent(),/Nieznane powiązanie z operatorem/);
    assert.match(await page.locator('[data-presence-id="second-agent"]').textContent(),/Operator wskazany przez agenta: bravo-human/);
    assert.equal(await page.locator('#presenceDialog').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(log.pageErrors,[]);
  }finally{await ctx.close();h.fs.rmSync(root,{recursive:true,force:true});}
});
