'use strict';
// Writes (or with --check verifies) docs/images/signing-help/*.svg from the same source as the in-app diagrams.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'docs/images/signing-help');
const context=vm.createContext({exText:en=>en});
vm.runInContext(fs.readFileSync(path.join(__dirname,'signing-help.js'),'utf8')+';this.signingStandaloneSvg=signingStandaloneSvg;',context);
const keys=['keys','sign','required','why'];let stale=false;
fs.mkdirSync(dir,{recursive:true});
for(const key of keys){
  const file=path.join(dir,key+'.svg'),next=context.signingStandaloneSvg(key)+'\n';
  if(process.argv.includes('--check')){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==next){console.error('Signing diagram differs: '+key+'. Run node scripts/build_signing_diagrams.js');stale=true;}}
  else fs.writeFileSync(file,next);
}
if(stale)process.exit(1);
