'use strict';
// SPEC-002-070: renders every scene and writes its layout snapshot and/or pixel baseline.
//   node tests/visual/generate.js                     layout snapshots (tests/visual/layout) and, on Linux, pixels
//   node tests/visual/generate.js --layout|--pixels   only one kind
//   node tests/visual/generate.js --out DIR           write both kinds under DIR instead (any platform)
//   node tests/visual/generate.js --check-determinism render twice and fail on any layout or pixel difference
// Pixel baselines are committed only from Linux CI (the update_visual_baselines workflow input).
const h=require('../lib/helpers');
const V=require('./scenes');

const args=process.argv.slice(2),flag=f=>args.includes(f),value=f=>{const i=args.indexOf(f);return i>=0?args[i+1]:null;};
const only=value('--scene');

async function render(browser,url,{layoutDir,pixelDir}){
 const groups=only?V.GROUPS.filter(g=>g.shots.some(s=>s.name===only)):V.GROUPS;
 if(!groups.length)throw new Error('No scene named '+only);
 if(layoutDir)h.fs.mkdirSync(layoutDir,{recursive:true});if(pixelDir)h.fs.mkdirSync(pixelDir,{recursive:true});
 await V.run(browser,{url,groups,onShot:async(shot,page)=>{
  if(layoutDir)h.fs.writeFileSync(V.layoutFile(shot.name,layoutDir),V.serialize(await V.layoutOf(page,shot.name,shot.viewport)));
  if(pixelDir)h.fs.writeFileSync(V.pixelFile(shot.name,pixelDir),await V.screenshot(page));
  console.log(shot.name);
 }});
}

async function determinism(browser,url,pixels){
 const runs=[1,2].map(()=>{const d=h.tmpDir('afb-visual-run-');return {dir:d,layoutDir:h.path.join(d,'layout'),pixelDir:pixels?h.path.join(d,'pixels'):null};});
 for(const r of runs)await render(browser,url,r);
 const out=[];
 for(const name of V.SCENES){
  const [a,b]=runs.map(r=>h.fs.readFileSync(V.layoutFile(name,r.layoutDir),'utf8'));
  if(a!==b)out.push(name+': layout snapshots differ between runs');
  if(pixels){
   const [pa,pb]=runs.map(r=>h.fs.readFileSync(V.pixelFile(name,r.pixelDir)));
   const c=await V.comparePixels(browser,pa,pb);if(c.diff)out.push(`${name}: ${c.diff} pixels differ between runs`);
  }
 }
 for(const r of runs)h.fs.rmSync(r.dir,{recursive:true,force:true});
 if(out.length)throw new Error('Not deterministic:\n'+out.join('\n'));
 console.log(`Deterministic: ${V.SCENES.length} scenes rendered twice, identical layout${pixels?' and zero pixel difference':''}.`);
}

(async()=>{
 const linux=process.platform==='linux',out=value('--out');
 const wantLayout=flag('--layout')||!flag('--pixels'),wantPixels=flag('--pixels')||(!flag('--layout')&&(linux||!!out));
 if(wantPixels&&!linux&&!out&&!flag('--check-determinism'))throw new Error('Pixel baselines come from Linux CI (workflow input update_visual_baselines); pass --out DIR to render them elsewhere.');
 const browser=await h.launch(),server=await V.serve();
 try{
  if(flag('--check-determinism'))return await determinism(browser,server.url,wantPixels);
  await render(browser,server.url,{layoutDir:wantLayout?(out?h.path.join(out,'layout'):V.LAYOUT_DIR):null,pixelDir:wantPixels?(out?h.path.join(out,'pixels'):V.PIXEL_DIR):null});
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e.stack||e.message||e);process.exitCode=1;});
