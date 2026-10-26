'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const body=fs.readFileSync(require('node:path').join(__dirname,'../board.html'),'utf8').match(/function colorOf\(id\)\{[\s\S]*?(?=\nfunction iconOf)/)[0];
const P=require('../scripts/participant-colors');
const ids=Array.from({length:40},(_,i)=>'participant-'+String(i).padStart(3,'0'));
test('actual participant color resolver never reuses a color across a 40-person board',()=>{
 const state=P.create();state.assign(ids);
 const color=vm.runInNewContext(body+';colorOf',{participantColorState:()=>state});
 const colors=ids.map(color);
 assert.equal(new Set(colors).size,ids.length,'every participant needs a unique color, including IDs sharing the old hash slot');
});

test('colliding preferred slots are resolved without changing previously assigned identities',()=>{
 const collision=ids.filter(id=>P.preferred(id)===P.preferred(ids[0]));assert.ok(collision.length>1);
 const state=P.create();state.assign(collision);assert.equal(new Set(collision.map(state.color)).size,collision.length);
 const before=state.snapshot();state.assign([...ids].reverse());
 for(const [id,slot] of before)assert.equal(state.color(id),P.css(slot));
 state.assign([ids[0]]);state.assign(ids);assert.deepEqual(P.create(state.snapshot()).snapshot(),state.snapshot());
 for(const id of ids)assert.equal(P.create(state.snapshot()).color(id),state.color(id));
 assert.deepEqual(P.create().color('unknown'),'var(--p-unknown)');assert.equal(P.create().color(''),'var(--p-unknown)');
 assert.deepEqual(P.create().snapshot(),[]);
});
test('large groups have unique colors and fresh allocation does not depend on registry order',()=>{
 const many=Array.from({length:512},(_,i)=>'agent-'+i),a=P.create(),b=P.create();a.assign(many);b.assign([...many].reverse());
 assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(new Set(many.map(a.color)).size,many.length);
});
test('invalid or duplicate saved assignments cannot make participants share a slot',()=>{
 const state=P.create([['a',1],['b',1],['a',2],['x',-1],['unknown',3],['z','4'],null,['bad',Infinity],['__proto__',4]]);
 state.assign(['a','b','x','z','bad','__proto__']);const saved=state.snapshot();
 assert.equal(new Set(saved.map(x=>x[1])).size,saved.length);assert.equal(state.color('a'),P.css(1));assert.equal(state.color('__proto__'),P.css(4));
});

const h=require('./lib/helpers');
test('40 rendered participants have unique bubble colors in every theme and retain them on refresh/reload',async()=>{
 const browser=await h.launch(),tree=h.readTree(h.layoutShuffled(h.tmpDir('afb-party-colors-'))),base=tree.children['.agent-board'];
 base.children['participants.json'].text=JSON.stringify({version:1,participants:ids.map((id,i)=>({id,kind:i===0?'human':'agent'}))});
 base.children.rooms.children.general.children=Object.fromEntries(ids.map((id,i)=>[
  `2026-10-20_1200_${id}_T001_color-${i}.txt`,{kind:'file',text:`FROM: ${id}\nTO: all\nSCOPE: ROOM\nROOM: general\nTHREAD: T001-order-check\nDATE: 2026-10-20 12:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: ${['INFO','QUESTION','DONE'][i%3]}\n---\nColor for @${id}.\n`}
 ]));
 const {ctx,page,log}=await h.openPage(browser,{tree});
 try{
  await h.openBoardViaUi(page);await page.mouse.move(0,0);
  const messagesBefore=await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt')));
  const snapshot=()=>page.locator('#feed article.msg').evaluateAll(els=>Object.fromEntries(els.map(el=>{const s=getComputedStyle(el);return [el.dataset.author,{ink:getComputedStyle(el.querySelector('.who')).color,background:s.backgroundColor,border:s.borderColor,mention:getComputedStyle(el.querySelector('.mention')).color}];})));
  async function theme(name){await page.click('#gear');await page.selectOption('#sTheme',name);await page.click('#sClose');await page.mouse.move(0,0);}
  const byTheme={};
  for(const name of ['light','dark','dracula']){
   await theme(name);const colors=byTheme[name]=await snapshot();assert.equal(Object.keys(colors).length,40);
   for(const key of ['ink','background','border'])assert.equal(new Set(Object.values(colors).map(c=>c[key])).size,40,name+' '+key+' must distinguish every participant');
   for(const id of ids){assert.equal(colors[id].mention,colors[id].ink);assert.equal(await page.locator(`#me option[value="${id}"]`).evaluate(el=>getComputedStyle(el).color),colors[id].ink);}
   const stress=await page.evaluate(()=>{
    const ids=Array.from({length:512},(_,i)=>'stress-'+i),state=ParticipantColors.create();state.assign(ids);
    const values=ids.map(id=>{const el=document.createElement('article');el.className='msg';el.style.setProperty('--c',state.color(id));const who=document.createElement('span');who.className='who';el.append(who);document.body.append(el);const s=getComputedStyle(el),row=[getComputedStyle(who).color,s.backgroundColor,s.borderColor];el.remove();return row;});
    return [0,1,2].map(i=>new Set(values.map(row=>row[i])).size);
   });
   assert.deepEqual(stress,[512,512,512],name+' generated colors stay distinct after browser RGB conversion');
   await page.selectOption('#me',ids[39]);assert.equal(await page.locator('.me').evaluate(el=>getComputedStyle(el,'::before').backgroundColor),colors[ids[39]].ink);
  }
  assert.deepEqual(byTheme.dracula,byTheme.dark,'Dracula preserves Dark identity colors');
  await page.evaluate(async()=>{const path='.agent-board/participants.json',reg=JSON.parse(window.__fakefs.read(path));reg.participants.reverse();reg.participants.unshift({id:'aaa-new-participant',kind:'agent'});await window.__fakefs.addFile(path,JSON.stringify(reg));});
  const n=await page.evaluate(()=>window.__boardTest.stats.builds);await page.click('#reload');await page.waitForFunction(n=>window.__boardTest.stats.builds>n,n);assert.deepEqual(await snapshot(),byTheme.dracula);
  await page.evaluate(()=>settingsWrite);await h.reloadSettled(ctx,page,{lastDir:true});await page.waitForSelector('#feed article.msg');assert.deepEqual(await snapshot(),byTheme.dracula);
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.path.endsWith('.txt'))),messagesBefore);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.requests.filter(u=>/^https?:/.test(u)),[]);
 }finally{await ctx.close();await browser.close();}
});
