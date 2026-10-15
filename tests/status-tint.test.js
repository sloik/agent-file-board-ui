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
  for(const [i,status] of statuses.entries()){
    const tid='T'+String(9+i).padStart(3,'0');
    h.fs.writeFileSync(h.path.join(dir,`2026-10-15_120${i}_research-agent-01_${tid}_status-${i}.txt`),`FROM: research-agent-01\nTO: all\nSCOPE: ROOM\nROOM: status-check\nTHREAD: ${tid}-status-check\nDATE: 2026-10-15 12:0${i}\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: ${status}\n---\nStatus example ${status}\n`);
  }
  const s=await h.openPage(browser,{tree:h.readTree(proj),colorScheme:scheme,clock:new Date("2026-10-15T10:30:00Z")});await h.openBoardViaUi(s.page);await s.page.clock.pauseAt(new Date("2026-10-15T10:30:01Z"));return s;
}
function contrast(a,b){
  const luminance=color=>{
    const rgb=color.match(/[\d.]+/g).slice(0,3).map(n=>Number(n)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  };
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
for(const scheme of ["light","dark"])test(`composer and chat share status colors in ${scheme} mode`,async()=>{
  const {ctx,page,log}=await boot(scheme);const colors={},palettes=[];
  await page.click("[data-closed=\"room:status-check\"]");
  await page.fill("#cBody","Keep this draft");
  for(const status of statuses){
    await page.selectOption("#cStatus",status);
    const result=await page.evaluate(status=>{
      const badge=document.querySelector("#cStatusPreview"),chat=document.querySelector(`.msg .chip.status.s-${status}`),field=document.querySelector("#cBody"),composer=document.querySelector("#composer");
      const read=el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderColor];};
      return {badge:read(badge),chat:read(chat),fieldBackground:getComputedStyle(field).backgroundColor,fieldBorder:getComputedStyle(field).borderColor,tone:getComputedStyle(composer).getPropertyValue("--status-bg"),text:badge.textContent,dot:getComputedStyle(document.querySelector(`.tcard .sdot.s-${status}`)).backgroundColor};
    },status);
    assert.deepEqual(result.badge,result.chat,status);assert.equal(result.fieldBorder,result.badge[2],status);assert.equal(result.text,status);
    colors[status]=result.fieldBackground;palettes.push(result.badge);
    assert.equal(result.dot,result.badge[1],status+" sidebar dot matches pill ink");
    assert.ok(contrast(result.badge[0],result.badge[1])>=4.5,status+" pill text contrast");
    assert.equal(await page.inputValue("#cBody"),"Keep this draft");
  }
  assert.equal(new Set(Object.values(colors)).size,7,"every status has a distinct composer tint");
  for(const channel of [0,1,2]) assert.equal(new Set(palettes.map(p=>p[channel])).size,7,"pill backgrounds, text and borders are individually distinct");
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

for(const scheme of ["light","dark"])test(`speech bubbles keep sender colors across statuses and composer changes in ${scheme} mode`,async()=>{
  const {ctx,page,log}=await boot(scheme);
  await page.mouse.move(0,0);
  const snapshot=()=>page.locator("#feed .msg").evaluateAll(els=>els.map(el=>{
    const s=getComputedStyle(el);return {author:el.dataset.author,background:s.backgroundColor,border:s.borderColor,width:s.borderWidth,shadow:s.boxShadow,status:el.querySelector('.chip.status').textContent,pill:getComputedStyle(el.querySelector('.chip.status')).backgroundColor};
  }));
  const initial=await snapshot(),research=initial.filter(m=>m.author==='research-agent-01' && statuses.includes(m.status));
  for(const status of statuses) assert.ok(research.some(m=>m.status===status));
  assert.equal(new Set(research.map(m=>m.background)).size,1,'sender background is independent of status');
  assert.equal(new Set(research.map(m=>m.border)).size,1,'sender border is independent of status');
  assert.ok(research.every(m=>parseFloat(m.width)>=2),'sender border is visible');
  assert.equal(new Set(research.map(m=>m.pill)).size,7,'every status pill has its own color');
  const implementation=initial.find(m=>m.author==='implementation-agent-01');
  assert.notEqual(implementation.background,research[0].background,'different senders have different bubble colors');
  assert.notEqual(implementation.border,research[0].border);
  for(const status of statuses){
    await page.selectOption('#cStatus',status);
    assert.deepEqual(await snapshot(),initial,'composer status does not recolor published bubbles');
  }
  // Changing who reads a message changes attention outlines, never the sender tint.
  await page.selectOption('#me','implementation-agent-01');
  const changed=await snapshot();
  assert.deepEqual(changed.map(({shadow,...m})=>m),initial.map(({shadow,...m})=>m));
  const rings=await page.locator('.msg.to-me').evaluateAll(els=>els.map(el=>{
    const probe=document.createElement('span');probe.style.boxShadow='0 0 0 2px color-mix(in srgb, currentColor 55%, transparent)';probe.style.color=getComputedStyle(el.querySelector('.who')).color;el.appendChild(probe);
    const result=[getComputedStyle(el).boxShadow,getComputedStyle(probe).boxShadow];probe.remove();return result;
  }));
  assert.ok(rings.length);for(const [actual,expected] of rings) assert.equal(actual,expected,'attention outline follows sender color');
  assert.deepEqual(log.pageErrors,[]);await ctx.close();
});
