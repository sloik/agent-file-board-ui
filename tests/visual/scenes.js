'use strict';
// SPEC-002-070: named, deterministic scenes of the viewer, a layout snapshot of fixed landmarks for each,
// and the pixel comparison used for the Linux baselines. Shared by tests/visual.test.js and generate.js.
const assert=require('node:assert/strict');
const {expect}=require('playwright/test');
const h=require('../lib/helpers');
const {importBoard}=require('../lib/signing-browser');
const {fixture:signingFixture}=require('../lib/signing-fixture');

const DIR=__dirname,LAYOUT_DIR=h.path.join(DIR,'layout'),PIXEL_DIR=h.path.join(DIR,'pixels','linux'),RESULTS=h.path.join(h.ROOT,'test-results','visual');
const AT=new Date('2026-10-20T10:00:00Z');
// Pixels: a channel differing by more than THRESHOLD counts the pixel; more than MAX_RATIO of the pixels fails.
const THRESHOLD=16,MAX_RATIO=0.001;
const CONTEXT={timezoneId:'UTC',locale:'en-US',reducedMotion:'reduce',colorScheme:'light',deviceScaleFactor:1};

// Landmarks: present, visible, box, look and label of each. `flow` marks elements whose position follows
// text laid out before them (header controls, menu lines, dialog paragraphs), so platform fonts move them further.
// Containers (`box`) record no label: their text is the sum of the landmarks inside them. `intrinsic` names a size
// that is a font fact, not layout: 'w' for a one-line shrink-to-content text run, 'h' for a block of wrapped
// message text. Its anchored edge, visibility and label are still compared; the Linux pixel baselines see the rest.
// (Whether a run is cut off is a font fact too: the topic title fits at 390px on macOS and is ellipsized on Linux.)
const LANDMARKS=[
 ['.top',{box:true}],['#menu'],['#folderName',{flow:true}],['#q',{flow:true}],['#verbar',{flow:true,intrinsic:'w'}],['#me',{flow:true}],['#reload',{flow:true}],
 ['#toolbarToolsToggle',{flow:true}],['#gear',{flow:true}],
 ['#keyNotice',{box:true}],['#keyNoticeText',{flow:true}],['#keyNoticeReview',{flow:true}],['#keyNoticeLater',{flow:true}],
 ['#toolbarToolsPanel',{flow:true,box:true}],['#vocabularyOpen',{flow:true}],['#presenceOpen',{flow:true}],['#signingTools',{flow:true}],['#reviewKeysTool',{flow:true}],
 ['#sidebarToggleTool',{flow:true}],['#toolbarVersion',{flow:true}],
 ['.side',{box:true}],['#sideHide'],['#sideScrim',{box:true}],['#tree .tree-root',{flow:true}],['#tree .posting',{flow:true}],['#tree .posting-mark',{flow:true}],
 ['.feed-head',{box:true}],['#title',{intrinsic:'w'}],['#topicMenuToggle'],['#topicMenuPanel',{box:true}],['#topicRename',{flow:true}],['#repairsOpen',{flow:true}],['#guidanceOpen',{flow:true}],
 ['.feed',{box:true}],['#feed article.msg:last-of-type',{flow:true,box:true,intrinsic:'h'}],
 ['#composer',{box:true}],['#replying'],['#composerTargetRow',{box:true}],['#composerTarget',{flow:true}],['#composerPin',{box:true}],['#composerTargetMenu',{box:true}],['#composerTargetList button',{flow:true}],
 ['#composerOptions',{box:true}],['#composerOptionsSummary',{flow:true}],['#cStatus',{flow:true}],['#composerAdvanced',{flow:true,box:true}],['#cWhere',{flow:true}],['#cNewThread',{flow:true}],
 ['#signingNotice',{box:true}],['#signingNotice .signing-notice-label',{flow:true,intrinsic:'w'}],['#signingNotice .signing-notice-action',{flow:true}],['#signingNotice .signing-notice-alt',{flow:true}],
 ['#cBody'],['#composerTargetChange',{flow:true}],['#send'],['#cInfo',{flow:true}],
 ['#signingDialog',{box:true}],['#signingPendingSummary',{flow:true}],['#signingParticipant',{flow:true}],['#signing-review h3',{flow:true}],['#signingFingerprint',{flow:true}],
 ['#signingCompare',{flow:true}],['#signingDialog [data-action="trust"]',{flow:true}],
];
const STYLES=['display','background-color','color','border-color','box-shadow','font-weight'];
// Release versions, key fingerprints and board ids change without the page changing: masked in pixels, normalized in labels.
const MASK=['#verbar','#toolbarVersion','#signingDialog code','#signingDialog .signing-fingerprint'];
const normalize=s=>s.replace(/\s+/g,' ').trim().replace(/\bv?\d+\.\d+\.\d+\b/g,'X.Y.Z')
 .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'<uuid>').replace(/\b[0-9a-f]{4}(?:[ :-]?[0-9a-f]{4}){3,}\b/gi,'<hex>').slice(0,120);

async function snapshot(page){
 const raw=await page.evaluate(({landmarks,styles})=>{
  const out={};
  for(const [sel,o] of landmarks){
   const el=document.querySelector(sel);
   if(!el){out[sel]={present:false};continue;}
   const cs=getComputedStyle(el),r=el.getBoundingClientRect();
   // Visible: rendered (checkVisibility also excludes the content of a closed <details>), and some of it
   // inside the viewport and every clipping (overflow) ancestor.
   let clip={l:0,t:0,r:innerWidth,b:innerHeight};
   for(let p=el.parentElement;p;p=p.parentElement){const ps=getComputedStyle(p);if(ps.overflowX==='visible'&&ps.overflowY==='visible')continue;
    const q=p.getBoundingClientRect();clip={l:Math.max(clip.l,q.left),t:Math.max(clip.t,q.top),r:Math.min(clip.r,q.right),b:Math.min(clip.b,q.bottom)};}
   const shown=Math.min(clip.r,r.right)-Math.max(clip.l,r.left)>0&&Math.min(clip.b,r.bottom)-Math.max(clip.t,r.top)>0;
   const visible=el.checkVisibility({opacityProperty:true,visibilityProperty:true,contentVisibilityAuto:true})&&r.width>0&&r.height>0&&shown;
   if(!visible){out[sel]={present:true,visible:false};continue;}
   const field=/^(INPUT|TEXTAREA)$/.test(el.tagName)?el.value:el.tagName==='SELECT'?(el.selectedOptions[0]?.textContent||''):null;
   out[sel]={present:true,visible:true,box:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
    style:Object.fromEntries(styles.map(p=>[p,cs.getPropertyValue(p)])),name:el.getAttribute('aria-label')||'',
    text:o?.box?null:field!==null?field:(el.innerText||''),textBearing:!!el.textContent.trim()||field!==null};
  }
  return out;
 },{landmarks:LANDMARKS,styles:STYLES});
 for(const v of Object.values(raw)){if(typeof v.text==='string')v.text=normalize(v.text);if(v.name)v.name=normalize(v.name);}
 return raw;
}

// Every difference beyond tolerance, each naming scene, element and property.
function compareLayout(scene,expected,actual){
 const out=[],flow=Object.fromEntries(LANDMARKS.map(([s,o])=>[s,!!o?.flow])),intrinsic=Object.fromEntries(LANDMARKS.map(([s,o])=>[s,o?.intrinsic||'']));
 for(const sel of new Set([...Object.keys(expected.elements),...Object.keys(actual.elements)])){
  const e=expected.elements[sel],a=actual.elements[sel],at=`${scene} ${sel}`;
  if(!e||!a){out.push(`${at}: landmark ${e?'missing from the page snapshot':'not in the baseline'}`);continue;}
  for(const k of ['present','visible'])if(e[k]!==a[k])out.push(`${at} ${k}: expected ${e[k]}, got ${a[k]}`);
  if(!e.visible||!a.visible)continue;
  // Position: 4px, or for flow elements 12% of the distance from the edge they are laid out from (at least 24px).
  // Either edge may hold: a right-aligned control whose label widens keeps its right edge.
  const tol=d=>flow[sel]?Math.max(24,Math.abs(d)*0.12):4;
  for(const [k,size,extent,edge] of [['x','w',expected.viewport.width,'right'],['y','h',expected.viewport.height,'bottom']]){
   const near=tol(e.box[k]),far=tol(extent-e.box[k]-e.box[size]);
   if(Math.abs(a.box[k]-e.box[k])>near&&Math.abs(a.box[k]+a.box[size]-e.box[k]-e.box[size])>far)
    out.push(`${at} box.${k}: expected ${e.box[k]}, got ${a.box[k]} (tolerance ${Math.round(near)}px; ${edge} edge ${Math.round(far)}px)`);
  }
  // Size: 4px; an element with text 12% or 24px, whichever is larger; an intrinsic size is not compared.
  for(const k of ['w','h'].filter(k=>k!==intrinsic[sel])){
   const t=e.textBearing||a.textBearing?Math.max(24,Math.abs(e.box[k])*0.12):4;
   if(Math.abs(e.box[k]-a.box[k])>t)out.push(`${at} box.${k}: expected ${e.box[k]}, got ${a.box[k]} (tolerance ${Math.round(t)}px)`);
  }
  for(const p of STYLES)if(e.style[p]!==a.style[p])out.push(`${at} ${p}: expected ${e.style[p]}, got ${a.style[p]}`);
  for(const k of ['name','text'])if(e[k]!==a[k])out.push(`${at} ${k}: expected ${JSON.stringify(e[k])}, got ${JSON.stringify(a[k])}`);
 }
 return out;
}

// One shot: the once-a-second refresh tick has run (its status dot on #reload otherwise depends on timing),
// version text frozen (a release bump must not move or repaint anything), fonts loaded, two frames.
async function settle(page){
 await page.evaluate(async()=>{
  tick();
  for(const el of document.querySelectorAll('#verbar,#toolbarVersion'))
   for(const n of [...el.childNodes].filter(n=>n.nodeType===3))n.textContent=n.textContent.replace(/\d+\.\d+\.\d+/g,'9.9.9');
  await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 });
}
async function layoutOf(page,scene,viewport){await settle(page);return {scene,viewport,elements:await snapshot(page)};}
async function screenshot(page){
 await settle(page);
 return page.screenshot({animations:'disabled',caret:'hide',scale:'css',mask:MASK.map(s=>page.locator(s)),maskColor:'#ff00ff'});
}

// Pixel comparison in Chromium's canvas: no image library needed.
async function comparePixels(browser,expected,actual){
 const page=await browser.newPage();
 try{
  return await page.evaluate(async({a,b,threshold})=>{
   const load=async s=>{const img=new Image();img.src='data:image/png;base64,'+s;await img.decode();return img;};
   const [ea,ac]=await Promise.all([load(a),load(b)]);
   if(ea.width!==ac.width||ea.height!==ac.height)return {sizeMismatch:`${ea.width}x${ea.height} vs ${ac.width}x${ac.height}`,diff:ea.width*ea.height,total:ea.width*ea.height};
   const data=img=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);return x.getImageData(0,0,c.width,c.height);};
   const A=data(ea),B=data(ac),out=new ImageData(A.width,A.height);let diff=0;
   for(let i=0;i<A.data.length;i+=4){
    const d=Math.max(Math.abs(A.data[i]-B.data[i]),Math.abs(A.data[i+1]-B.data[i+1]),Math.abs(A.data[i+2]-B.data[i+2]),Math.abs(A.data[i+3]-B.data[i+3]));
    if(d>threshold){diff++;out.data.set([255,0,0,255],i);}
    else{const g=Math.round((A.data[i]+A.data[i+1]+A.data[i+2])/3*0.3+178);out.data.set([g,g,g,255],i);}
   }
   const c=document.createElement('canvas');c.width=A.width;c.height=A.height;c.getContext('2d').putImageData(out,0,0);
   return {diff,total:A.width*A.height,png:c.toDataURL('image/png').split(',')[1]};
  },{a:expected.toString('base64'),b:actual.toString('base64'),threshold:THRESHOLD});
 }finally{await page.close();}
}

// ---- Scene setups ----
const choose=(page,id,value)=>page.evaluate(([id,value])=>{const el=document.querySelector(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},[id,value]);
// The example board plus one open architecture topic (T004), as in tests/compact-layout.test.js.
function exampleBoard(){
 const project=h.layoutExample(h.tmpDir('afb-visual-')),room=h.path.join(project,'.agent-board','rooms','architecture');
 h.fs.writeFileSync(h.path.join(room,'2026-09-27_0900_human-owner-01_T004_api-v2.txt'),'FROM: human-owner-01\nTO: all\nSCOPE: ROOM\nROOM: architecture\nTHREAD: T004-api-v2\nDATE: 2026-09-27 09:00\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\n---\nShould API v2 keep the old IDs?\n');
 return project;
}
// The shortcut label follows navigator.platform; pin it so macOS and Linux render the same page.
const PLATFORM=()=>{Object.defineProperty(Navigator.prototype,'platform',{configurable:true,get:()=>'Linux x86_64'});};
async function bootExample(browser,{viewport={width:1280,height:800},html}={}){
 const project=exampleBoard();
 const s=await h.openPage(browser,{html,tree:h.readTree(project),dialog:'accept',viewport,fixedTime:AT,init:[PLATFORM],context:{...CONTEXT,viewport}});
 await h.openBoardViaUi(s.page);
 return {...s,cleanup:()=>h.fs.rmSync(h.path.dirname(project),{recursive:true,force:true})};
}
// Signing scenes run on the native OPFS path over http, like tests/key-approval-visibility.test.js, but in a
// context with the scene options (the shared signing boot uses a bare context).
async function bootSigning(browser,url){
 // Seeded keys and board ID (SPEC-002-071): a pasted fingerprint in the review scenes renders the same every run.
 const f=signingFixture({seed:'visual'});f.register('implementation-agent-01');
 const ctx=await browser.newContext({...CONTEXT,viewport:{width:1280,height:800}}),page=await ctx.newPage(),log={pageErrors:[]};
 page.on('pageerror',e=>log.pageErrors.push(e.message));
 await page.clock.setFixedTime(AT);
 await page.addInitScript(()=>{window.showDirectoryPicker=()=>navigator.storage.getDirectory();});await page.addInitScript(PLATFORM);
 await page.goto(url);await importBoard(page,f.proj);await h.openBoardViaUi(page);
 return {ctx,page,log,cleanup:f.clean};
}
// The pointer rests on the topic title, away from hover effects on messages and the sidebar edge.
async function rest(page){
 const box=await page.locator('#title').boundingBox();
 await page.mouse.move(box?box.x+Math.min(20,box.width/2):page.viewportSize().width/2,box?box.y+box.height/2:20);
}
async function topicDraft(page){await page.selectOption('#me','human-owner-01');await h.openView(page,'room:product|T003');await page.fill('#cBody','Draft typed for the visual baseline');}
async function peek(page){
 await page.mouse.move(800,400);await page.mouse.move(3,400);
 await expect.poll(()=>page.evaluate(()=>document.body.classList.contains('side-peek')&&document.querySelector('#side').getBoundingClientRect().width>100),{timeout:3000}).toBe(true);
 await page.mouse.move(60,200);
}
// Types a value derived from the selected participant's board fingerprint and shows the comparison.
async function reviewValue(page,derive){
 const fp=await page.evaluate(()=>B.signingParticipants[document.querySelector('#signingParticipant').value].fingerprint);
 await page.locator('#signingFingerprint').fill(derive(fp));
 await page.locator('#signingFingerprint').blur();
 await page.locator('#signingCompare').evaluate(el=>el.scrollIntoView({block:'center'}));
}
const S=(name,width=1280,height=800)=>({name,viewport:{width,height}});
const COMPOSER_SIZES=name=>[S(name),S(name+'-1280x460',1280,460),S(name+'-390x640',390,640),S(name+'-320x360',320,360)];
// Each group boots once; its shots follow in order (a later shot may resize or add one step).
const GROUPS=[
 {name:'topic',setup:topicDraft,shots:COMPOSER_SIZES('topic')},
 {name:'topic-dark',setup:async p=>{await topicDraft(p);await choose(p,'#sTheme','dark');},shots:[S('topic-dark')]},
 {name:'topic-dracula',setup:async p=>{await topicDraft(p);await choose(p,'#sTheme','dracula');},shots:[S('topic-dracula')]},
 {name:'topic-pl',setup:async p=>{await topicDraft(p);await choose(p,'#sLang','pl');},shots:[S('topic-pl')]},
 {name:'all-messages',setup:async p=>{await p.selectOption('#me','human-owner-01');await p.locator('#tree .tree-root').click();},shots:[S('all-messages')]},
 {name:'room-new-topic',setup:async p=>{await p.selectOption('#me','human-owner-01');await h.openView(p,'architecture');},shots:[S('room-new-topic')]},
 {name:'direct',setup:async p=>{await p.selectOption('#me','research-agent-01');await p.click('[data-closed="direct:implementation-agent-01--research-agent-01"]');await h.openView(p,'direct:implementation-agent-01--research-agent-01|T002');},shots:[S('direct')]},
 {name:'sidebar-hidden',setup:async p=>{await topicDraft(p);await p.click('#menu');await expect(p.locator('#menu')).toHaveAttribute('aria-expanded','false');},shots:[S('sidebar-hidden')]},
 {name:'hover-peek',setup:async p=>{await topicDraft(p);await p.click('#menu');await peek(p);},pointer:'keep',shots:[S('hover-peek')]},
 {name:'phone-drawer',viewport:{width:390,height:640},setup:async p=>{await p.selectOption('#me','human-owner-01');await p.click('#menu');await expect(p.locator('#side')).toBeVisible();},pointer:'keep',shots:[S('phone-drawer',390,640)]},
 {name:'tools-menu',setup:async p=>{await topicDraft(p);await p.click('#toolbarToolsToggle');await expect(p.locator('#toolbarToolsPanel')).toBeVisible();},pointer:'keep',shots:[S('tools-menu')]},
 {name:'topic-menu',setup:async p=>{await topicDraft(p);await h.openTopicMenu(p);await expect(p.locator('#topicMenuPanel')).toBeVisible();},pointer:'keep',shots:[S('topic-menu')]},
 {name:'destination-popover',setup:async p=>{await topicDraft(p);await h.openDestination(p);},pointer:'keep',shots:COMPOSER_SIZES('destination-popover')},
 {name:'message-options',setup:async p=>{await topicDraft(p);await h.expandComposer(p);},shots:COMPOSER_SIZES('message-options')},
 {name:'signing',signing:true,setup:async p=>{await expect(p.locator('#keyNotice')).toBeVisible();await expect(p.locator('#keyNoticeText')).toHaveText('3 participant keys are not approved on this device.');},shots:[
  S('key-notice'),
  {...S('key-notice-pl'),step:async p=>{await choose(p,'#sLang','pl');await expect(p.locator('#keyNoticeReview')).not.toHaveText('Review keys');}},
  {...S('signing-review'),step:async p=>{await choose(p,'#sLang','en');await p.click('#keyNoticeReview');await expect(p.locator('#signingDialog')).toBeVisible();await expect(p.locator('#signingPendingSummary')).toHaveText('3 keys need review');}},
  // SPEC-002-071: the guided review with the participant's value pasted, then with one character changed.
  {...S('signing-review-match'),step:async p=>{await reviewValue(p,fp=>fp);await expect(p.locator('#signingCompare')).toHaveAttribute('data-state','match');}},
  {...S('signing-review-mismatch'),step:async p=>{await reviewValue(p,fp=>{const i=fp.length-12;return fp.slice(0,i)+(fp[i]==='A'?'B':'A')+fp.slice(i+1);});await expect(p.locator('#signingCompare')).toHaveAttribute('data-state','mismatch');}},
  {...S('signing-composer'),step:async p=>{await p.locator('#signingDialog [data-action="close"]').click();await expect(p.locator('#signingDialog')).toBeHidden();
   await p.click('#keyNoticeLater');await expect(p.locator('#keyNotice')).toBeHidden();await topicDraft(p);
   await expect(p.locator('#signingNotice')).toHaveAttribute('data-signing-status','unsigned');await expect(p.locator('#signingNotice .signing-notice-action')).toContainText('Unlock');}},
  ...COMPOSER_SIZES('signing-composer').slice(1)]},
];
const SCENES=GROUPS.flatMap(g=>g.shots.map(s=>s.name));

// Runs every group (or the named ones), calling onShot(shot, page) after each shot's step and viewport.
async function run(browser,{url,groups=GROUPS,onShot}){
 for(const group of groups){
  const s=group.signing?await bootSigning(browser,url):await bootExample(browser,{viewport:group.viewport});
  try{
   await group.setup(s.page);
   for(const shot of group.shots){
    if(shot.step)await shot.step(s.page);
    await s.page.setViewportSize(shot.viewport);
    if(group.pointer!=='keep')await rest(s.page);
    await onShot(shot,s.page,group);
   }
   assert.deepEqual(s.log.pageErrors,[],group.name+': page errors');
  }finally{await s.ctx.close();s.cleanup();}
 }
}
// The signing scenes need a secure context (OPFS): board.html over a loopback http server.
async function serve(){
 const http=require('node:http');
 const server=http.createServer((req,res)=>{if(req.url!=='/board.html'){res.writeHead(404).end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(h.fs.readFileSync(h.BOARD_HTML));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:`http://127.0.0.1:${server.address().port}/board.html`,close:()=>new Promise(resolve=>server.close(resolve))};
}
const layoutFile=(name,dir=LAYOUT_DIR)=>h.path.join(dir,name+'.json');
const pixelFile=(name,dir=PIXEL_DIR)=>h.path.join(dir,name+'.png');
// One landmark per line, so a reviewed baseline diff shows exactly which elements changed.
const serialize=snap=>`{"scene":${JSON.stringify(snap.scene)},"viewport":${JSON.stringify(snap.viewport)},"elements":{\n`+
 Object.entries(snap.elements).map(([sel,v])=>` ${JSON.stringify(sel)}:${JSON.stringify(v)}`).join(',\n')+'\n}}\n';

module.exports={AT,GROUPS,SCENES,LANDMARKS,STYLES,THRESHOLD,MAX_RATIO,LAYOUT_DIR,PIXEL_DIR,RESULTS,
 run,serve,layoutOf,screenshot,compareLayout,comparePixels,layoutFile,pixelFile,serialize,topicDraft,exampleBoard,bootExample,rest,settle};
