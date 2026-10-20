'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const E=require('../scripts/extension-contract');
const canonical=path.join(__dirname,'../vendor/agent-file-board');
const cases=JSON.parse(fs.readFileSync(path.join(canonical,'tests/fixtures/extension-lifecycle-parity.json')));
function fixture(c){
 const p=JSON.parse(fs.readFileSync(path.join(canonical,'examples/extensions/example-approvals.afb-plugin.json')));
 p.capabilities=c.capabilities;
 p.compatibility.api={range:c.api};
 if(c.exclude)p.compatibility.api.exclude=c.exclude;
 if(c.renderers!==false){
  const code="BoardExtension.define({render(){return {type:'text',text:'Baseline'};}});";
  p.files['view.js']={encoding:'utf-8',data:code,sha256:require('node:crypto').createHash('sha256').update(code).digest('hex')};
  const r={id:'live',mode:c.mode||'worker',entry:'view.js',contracts:[{id:'com.example.approvals/request',versions:{range:'1.0.0'}}]};
  if(Object.hasOwn(c,'refresh'))r.refresh=c.refresh;
  p.ui={renderers:[r]};
 }
 return JSON.stringify(p);
}
test('SDK1.2 refresh declarations and legacy API compatibility agree with Python',async()=>{
 const raws=cases.map(fixture);
 const python=cp.spawnSync('python3',['-c',[
  'import json,sys',
  'import extension_packages as E',
  'out=[]',
  'for raw in json.load(sys.stdin):',
  ' try:',
  '  d=E.decode_package(raw.encode())',
  '  out.append({"valid":True,"compatible":E.api_compatible(d["package"])})',
  ' except ValueError:',
  '  out.append({"valid":False})',
  'print(json.dumps(out))'
 ].join('\n')],{cwd:canonical,input:JSON.stringify(raws),encoding:'utf8'});
 assert.equal(python.status,0,python.stderr);
 const expectedPython=JSON.parse(python.stdout);
 for(let i=0;i<cases.length;i++){
  const c=cases[i];let actual;
  try{const d=await E.decode(raws[i]);actual={valid:true,compatible:E.compatible(d,'2.6.1')};}
  catch{actual={valid:false};}
  const expected=c.valid?{valid:true,compatible:c.compatible}:{valid:false};
  assert.deepEqual(actual,expected,c.name);
  assert.deepEqual(actual,expectedPython[i],c.name+' Python parity');
 }
});
test('portable lifecycle examples retain exact artifact hashes and both renderer modes',async()=>{
 for(const mode of ['worker','declarative']){
  const raw=fs.readFileSync(path.join(canonical,'examples/extensions/lifecycle-'+mode+'.afb-plugin.json'));
  const d=await E.decode(raw);
  assert.equal(d.artifact,await E.hash(raw));
  assert.equal(E.compatible(d,'2.6.1'),true);
  assert.deepEqual(d.package.capabilities,['render','refresh']);
  assert.equal(d.package.ui.renderers[0].mode,mode);
  assert.deepEqual(d.package.ui.renderers[0].refresh,E.parse('{"intervalSeconds":30}'));
 }
});
