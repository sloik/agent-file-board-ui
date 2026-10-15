"use strict";
const {test,before,after}=require("node:test");
const assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});
after(async()=>{await browser.close();});
const statuses=["INFO","QUESTION","REQUEST","REPLY","DECISION-NEEDED","DONE","CLOSED"];
async function boot(scheme){
  const proj=h.layoutExample(h.tmpDir()),dir=h.path.join(proj,".agent-board/rooms/status-check");h.fs.mkdirSync(dir,{recursive:true});
  for(const [i,status] of statuses.entries())h.fs.writeFileSync(h.path.join(dir,`2026-10-15_120${i}_research-agent-01_T009_status-${i}.txt`),`FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: status-check\nTHREAD: T009-status-check\nDATE: 2026-10-15 12:0${i}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: ${status}\n---\nStatus example ${status}\n`);
  const s=await h.openPage(browser,{tree:h.readTree(proj),colorScheme:scheme,clock:new Date("2026-10-15T10:30:00Z")});await h.openBoardViaUi(s.page);await s.page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));return s;
}
for(const scheme of ["light","dark"])test(`composer and chat share status colors in ${scheme} mode`,async()=>{
  const {ctx,page,log}=await boot(scheme);const colors={};
  await page.fill("#cBody","Keep this draft");
  for(const status of statuses){
    await page.selectOption("#cStatus",status);
    const result=await page.evaluate(status=>{
      const badge=document.querySelector("#cStatusPreview"),chat=document.querySelector(`.msg .chip.status.s-${status}`),field=document.querySelector("#cBody"),composer=document.querySelector("#composer");
      const read=el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderColor];};
      return {badge:read(badge),chat:read(chat),fieldBackground:getComputedStyle(field).backgroundColor,fieldBorder:getComputedStyle(field).borderColor,tone:getComputedStyle(composer).getPropertyValue("--status-bg"),text:badge.textContent};
    },status);
    assert.deepEqual(result.badge,result.chat,status);assert.equal(result.fieldBorder,result.badge[2],status);assert.equal(result.text,status);
    colors[status]=result.fieldBackground;
    assert.equal(await page.inputValue("#cBody"),"Keep this draft");
  }
  assert.equal(colors.INFO,colors.REPLY);assert.equal(colors.DONE,colors.CLOSED);assert.equal(colors.QUESTION,colors.REQUEST);
  assert.equal(new Set([colors.INFO,colors.QUESTION,colors.DONE,colors["DECISION-NEEDED"]]).size,4);
  // The same palette also follows a live system-theme switch.
  await page.emulateMedia({colorScheme:scheme==="light"?"dark":"light"});
  assert.notEqual(await page.locator("#cBody").evaluate(el=>getComputedStyle(el).backgroundColor),colors.CLOSED);
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
test("polling preserves the selected status, tint, capsule and draft",async()=>{
  const {ctx,page}=await boot("light");await page.selectOption("#cStatus","QUESTION");await page.fill("#cBody","Draft question");
  const tint=await page.locator("#cBody").evaluate(el=>getComputedStyle(el).backgroundColor),builds=await page.evaluate(()=>window.__boardTest.stats.builds);
  await page.clock.runFor(61000);await page.waitForFunction(n=>window.__boardTest.stats.builds>n,builds);
  assert.equal(await page.inputValue("#cStatus"),"QUESTION");assert.equal(await page.textContent("#cStatusPreview"),"QUESTION");assert.equal(await page.inputValue("#cBody"),"Draft question");
  assert.equal(await page.locator("#cBody").evaluate(el=>getComputedStyle(el).backgroundColor),tint);await ctx.close();
});
