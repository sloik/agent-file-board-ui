'use strict';
// Exercise the same ZIP users download, including its bundled viewer.
const h=require('./helpers'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
function demoFixture(){
 const tmp=h.tmpDir('afb-demo-browser-'),zip=h.path.join(tmp,'demo.zip');
 try{
  for(const args of [[h.path.join(h.ROOT,'scripts/build_demo.py'),'--root',h.ROOT,'--output',zip],['-m','zipfile','-e',zip,tmp]]){
   const result=spawnSync('python3',args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);
  }
  const packagePath=h.path.join(tmp,'agent-file-board-demo');
  return {tmp,packagePath,project:h.path.join(packagePath,'demo-board'),html:h.path.join(packagePath,'board.html'),manifest:JSON.parse(h.fs.readFileSync(h.path.join(packagePath,'demo-manifest.json'),'utf8'))};
 }catch(e){h.fs.rmSync(tmp,{recursive:true,force:true});throw e;}
}
async function topic(page,id,room='reports'){
 await page.locator(`.tcard[data-tk='room:${room}|${id}']`).click();
 await page.waitForSelector('.report-content');
}
module.exports={demoFixture,topic};
