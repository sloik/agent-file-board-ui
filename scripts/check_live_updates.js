'use strict';
// Explicit network qualification, separate from deterministic PR/main fixtures.
const {chromium,firefox}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{parseArgs}=require('node:util');
function options(args){
 const {values}=parseArgs({args,options:{root:{type:'string',default:path.resolve(__dirname,'..')},'expected-version':{type:'string'}}});
 if(values['expected-version']&&!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(values['expected-version']))throw Error('Expected a stable release version');
 return {...values};
}
function checkState(state,expected){
 assert.ok(state.lastSuccess>0,'Live release check did not succeed');
 assert.equal(state.latest.status,'ok');
 if(expected)assert.equal(state.latest.version,expected,'Live checker disagrees with the independent latest-release API');
}
async function main(args=process.argv.slice(2)){
 const config=options(args);
 for(const [name,engine]of Object.entries({chromium,firefox})){
  const browser=await engine.launch({timeout:30000});
  try{
   const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(pathToFileURL(path.resolve(config.root,'board.html')).href);
   await page.waitForFunction(()=>window.__boardTest&&document.body.inert===false);
   await page.evaluate(()=>window.__boardTest.ready);await page.click('#toolbarToolsToggle');await page.click('#viewerUpdatesTools');
   await page.waitForFunction(()=>!document.querySelector('#viewerCheckNow').disabled);
   const state=await page.evaluate(()=>window.__boardTest.viewerUpdateState());
   checkState(state,config['expected-version']);assert.deepEqual(errors,[]);
   assert.equal(await page.locator('iframe').count(),0);
   console.log(name+': deployed HTTPS checker returned stable release '+state.latest.version);
  }finally{await browser.close();}
 }
}
module.exports={options,checkState};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
