'use strict';
// SPEC-002-070: how the page looks. Layout snapshots of fixed landmarks (every platform) and full-viewport
// pixel screenshots (Linux baselines from CI) for the scenes in tests/visual/scenes.js.
// AFB_UPDATE_SNAPSHOTS=1 rewrites the layout snapshots; nothing else ever writes them.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const h=require('./lib/helpers');
const V=require('./visual/scenes');

const UPDATE=process.env.AFB_UPDATE_SNAPSHOTS==='1';
const PIXELS=process.platform==='linux'||process.env.AFB_VISUAL_PIXELS==='1';
const PIXEL_SKIP=PIXELS?false:`pixel baselines are rendered on Linux CI only (fonts differ on ${process.platform}); set AFB_VISUAL_PIXELS=1 to compare anyway`;
const rel=file=>h.path.relative(h.ROOT,file);
let browser,server;
before(async()=>{browser=await h.launch();server=await V.serve();});
after(async()=>{await browser?.close();await server?.close();});

function keep(name,data){h.fs.mkdirSync(V.RESULTS,{recursive:true});const file=h.path.join(V.RESULTS,name);h.fs.writeFileSync(file,data);return rel(file);}

async function checkLayout(shot,page){
 const actual=await V.layoutOf(page,shot.name,shot.viewport),file=V.layoutFile(shot.name);
 if(UPDATE){h.fs.mkdirSync(V.LAYOUT_DIR,{recursive:true});h.fs.writeFileSync(file,V.serialize(actual));return;}
 if(!h.fs.existsSync(file)){const got=keep(shot.name+'.layout.json',V.serialize(actual));
  assert.fail(`Missing layout snapshot ${rel(file)} (this run wrote ${got}). Create it with AFB_UPDATE_SNAPSHOTS=1 node --test tests/visual.test.js and review it like code.`);}
 const expected=JSON.parse(h.fs.readFileSync(file,'utf8'));
 assert.deepEqual(actual.viewport,expected.viewport,shot.name+': viewport');
 const diff=V.compareLayout(shot.name,expected,actual);
 if(diff.length){const got=keep(shot.name+'.layout.json',V.serialize(actual));
  assert.fail(`Layout of ${shot.name} differs from ${rel(file)} (actual in ${got}):\n`+diff.join('\n'));}
}

async function checkPixels(shot,page){
 const actual=await V.screenshot(page),file=V.pixelFile(shot.name);
 if(!h.fs.existsSync(file)){const got=keep(shot.name+'.actual.png',actual);
  assert.fail(`Missing pixel baseline ${rel(file)} (this run wrote ${got}). Run the update_visual_baselines workflow on Linux CI and commit its PNGs after review.`);}
 const expected=h.fs.readFileSync(file),c=await V.comparePixels(browser,expected,actual),limit=Math.floor(c.total*V.MAX_RATIO);
 if(c.sizeMismatch||c.diff>limit){
  keep(shot.name+'.actual.png',actual);keep(shot.name+'.expected.png',expected);if(c.png)keep(shot.name+'.diff.png',Buffer.from(c.png,'base64'));
  assert.fail(`Pixels of ${shot.name}: ${c.sizeMismatch?'size '+c.sizeMismatch:`${c.diff} of ${c.total} pixels differ (limit ${limit}, channel threshold ${V.THRESHOLD})`}; actual, expected and diff PNGs in ${rel(V.RESULTS)}`);
 }
}

for(const group of V.GROUPS)test(`scene group ${group.name}`,async t=>{
 await V.run(browser,{url:server.url,groups:[group],onShot:async(shot,page)=>{
  await t.test(`layout ${shot.name}`,()=>checkLayout(shot,page));
  await t.test(`pixels ${shot.name}`,{skip:PIXEL_SKIP},()=>checkPixels(shot,page));
 }});
});

test('every committed snapshot and baseline belongs to a scene, and every scene has a layout snapshot',()=>{
 const names=dir=>h.fs.existsSync(dir)?h.fs.readdirSync(dir).filter(f=>f!=='README.md'):[];
 const layouts=names(V.LAYOUT_DIR),pixels=names(V.PIXEL_DIR);
 assert.deepEqual(layouts.filter(f=>!V.SCENES.includes(f.replace(/\.json$/,''))),[],'layout snapshots without a scene');
 assert.deepEqual(pixels.filter(f=>!V.SCENES.includes(f.replace(/\.png$/,''))),[],'pixel baselines without a scene');
 if(!UPDATE)assert.deepEqual(V.SCENES.filter(s=>!layouts.includes(s+'.json')),[],'scenes without a layout snapshot');
});

// Non-vacuity: test-only CSS mutations of the topic scene must fail the comparisons with a readable message.
test('non-vacuity: a recoloured .posting border, #send moved 20px and a hidden #sideHide fail the layout comparison',{skip:UPDATE&&'snapshots are being rewritten'},async()=>{
 const shot=V.GROUPS.find(g=>g.name==='topic').shots[0],expected=JSON.parse(h.fs.readFileSync(V.layoutFile(shot.name),'utf8'));
 const s=await V.bootExample(browser);
 try{
  await V.topicDraft(s.page);await V.rest(s.page);
  assert.deepEqual(V.compareLayout(shot.name,expected,await V.layoutOf(s.page,shot.name,shot.viewport)),[],'the unmutated scene matches');
  for(const [css,want] of [
   ['.tcard.posting{box-shadow:inset 4px 0 0 rgb(220,38,38),0 0 0 2px rgb(220,38,38)!important}',/^topic #tree \.posting box-shadow: expected .+, got .*rgb\(220, 38, 38\)/],
   ['#send{translate:-20px 0!important}',/^topic #send box\.x: expected \d+, got \d+ \(tolerance 4px; right edge 4px\)$/],
   ['#sideHide{display:none!important}',/^topic #sideHide visible: expected true, got false$/],
  ]){
   const tag=await s.page.addStyleTag({content:css});
   const diff=V.compareLayout(shot.name,expected,await V.layoutOf(s.page,shot.name,shot.viewport));
   assert.ok(diff.some(line=>want.test(line)),`${css} must fail with ${want}; got:\n${diff.join('\n')}`);
   await tag.evaluate(el=>el.remove());
  }
  assert.deepEqual(V.compareLayout(shot.name,expected,await V.layoutOf(s.page,shot.name,shot.viewport)),[],'restored');
 }finally{await s.ctx.close();s.cleanup();}
});

test('non-vacuity: a 1px shift of the page fails the pixel comparison',async()=>{
 const s=await V.bootExample(browser);
 try{
  await V.topicDraft(s.page);await V.rest(s.page);
  const file=V.pixelFile('topic'),baseline=PIXELS&&h.fs.existsSync(file)?h.fs.readFileSync(file):await V.screenshot(s.page);
  const same=await V.comparePixels(browser,baseline,await V.screenshot(s.page));
  assert.ok(same.diff<=Math.floor(same.total*V.MAX_RATIO),`the unmutated scene matches (${same.diff} pixels differ)`);
  await s.page.addStyleTag({content:'body{translate:1px 0}'});
  const shifted=await V.comparePixels(browser,baseline,await V.screenshot(s.page)),limit=Math.floor(shifted.total*V.MAX_RATIO);
  assert.ok(shifted.diff>limit,`a 1px shift must exceed the limit: ${shifted.diff} of ${shifted.total} pixels differ, limit ${limit}`);
 }finally{await s.ctx.close();s.cleanup();}
});

// A release bump changes only the version text, which is normalized in labels and masked in pixels.
test('a viewer version bump changes neither the layout snapshot nor the pixels of a scene',{skip:UPDATE&&'snapshots are being rewritten'},async()=>{
 const html=h.fs.readFileSync(h.BOARD_HTML,'utf8'),version=require('../package.json').version,literal=JSON.stringify(version);
 // A later patch release with a wider number (3.3.6 -> 3.3.17): same minor, so no compatibility notice appears.
 const [major,minor,patch]=version.split('.').map(Number),bump=`${major}.${minor}.${patch+11}`;
 assert.equal(html.split(literal).length,2,'the viewer version literal exists once');
 const file=h.path.join(h.tmpDir('afb-visual-bump-'),'board.html');h.fs.writeFileSync(file,html.replace(literal,JSON.stringify(bump)));
 const shot=V.GROUPS.find(g=>g.name==='topic').shots[0],expected=JSON.parse(h.fs.readFileSync(V.layoutFile(shot.name),'utf8'));
 const capture=async opts=>{const s=await V.bootExample(browser,opts);try{
  await V.topicDraft(s.page);await V.rest(s.page);
  return {text:await s.page.locator('#verbar').textContent(),layout:await V.layoutOf(s.page,shot.name,shot.viewport),png:await V.screenshot(s.page)};
 }finally{await s.ctx.close();s.cleanup();}};
 const real=await capture({}),bumped=await capture({html:file});
 assert.ok(bumped.text.includes(bump),'the bumped copy shows '+bump);assert.ok(!real.text.includes(bump));
 assert.deepEqual(V.compareLayout(shot.name,expected,bumped.layout),[]);
 const c=await V.comparePixels(browser,real.png,bumped.png);assert.equal(c.diff,0,`${c.diff} pixels differ after a version bump`);
});
