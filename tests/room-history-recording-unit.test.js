'use strict';
// SPEC-002-063: the viewer's room_history parser and config.json edits against canonical
// history_recording.py / signing_usability.py (shared fixture, byte-for-byte CLI parity).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const h=require('./lib/helpers');
const {load}=require('./lib/history-unit');
const {fixture}=require('./lib/signing-fixture');
const {C,H}=load();
const python=process.env.AFB_SIGNING_PYTHON||'python3';
const shared=JSON.parse(h.fs.readFileSync(h.path.join(__dirname,'fixtures/room-history-setting.json'),'utf8'));
// The viewer parses config.json for room history with the bundle's own parser (number kinds).
const parse=text=>H.parseConfig(new TextEncoder().encode(text));

function configText(c){
  const base=JSON.stringify(shared.config).slice(0,-1);
  if(c.scopes!==undefined)return base+',"room_history":{"version":1,"scopes":{'+Array.from({length:c.scopes},(_,i)=>`"rooms/r${i}":{}`).join(',')+'}}}';
  return c.raw===null?base+'}':base+',"room_history":'+c.raw+'}';
}
function viewer(text){
  try{const s=H.setting(parse(text));return {valid:true,normalized:JSON.parse(JSON.stringify(s))};}
  catch(error){assert.ok(error instanceof H.HistoryError,error.message);assert.equal(error.code,'unreadable');assert.match(error.message,/^room_history setting unavailable: /);return {valid:false};}
}
const canonical=String.raw`
import sys,json
sys.path.insert(0,sys.argv[1])
import history_recording
out=[]
for text in json.loads(sys.stdin.read()):
  try: out.append({"valid":True,"normalized":history_recording.setting(json.loads(text))})
  except ValueError as exc:
    assert str(exc).startswith("room_history setting unavailable: "),exc
    out.append({"valid":False})
print(json.dumps(out))`;

test('AC6: room_history parsing agrees with canonical history_recording.setting on a shared fixture',()=>{
  const texts=shared.cases.map(configText);
  const r=spawnSync(python,['-I','-c',canonical,h.VENDOR],{input:JSON.stringify(texts),encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const cli=JSON.parse(r.stdout);
  shared.cases.forEach((c,i)=>{
    const mine=viewer(texts[i]);
    assert.equal(mine.valid,c.valid,c.name+': expected validity');
    assert.deepEqual(mine,cli[i],c.name+': viewer and canonical agree');
  });
});

test('AC1/AC2: records and describe follow the declared setting; a malformed setting is reported, never thrown',()=>{
  const good=parse(configText(shared.cases[1])),redundant=parse(configText(shared.cases[3]));
  assert.equal(H.records(good,'rooms/a','T005'),true);
  assert.equal(H.records(good,'direct/aaa--bbb','T001'),true);
  assert.equal(H.records(good,'direct/aaa--bbb','T002'),false);
  assert.equal(H.records(parse(configText(shared.cases[0])),'rooms/a','T001'),false);
  assert.deepEqual(JSON.parse(JSON.stringify(H.describe(good,'rooms/a'))),{record:'on-post'});
  assert.deepEqual(JSON.parse(JSON.stringify(H.describe(good,'direct/aaa--bbb'))),{threads:['T001'],record:'on-post'});
  assert.deepEqual(JSON.parse(JSON.stringify(H.describe(redundant,'rooms/a'))),{record:'on-post'});
  assert.equal(H.describe(good,'rooms/other'),null);
  const bad=parse(configText({raw:'{"version": 2}'}));
  assert.deepEqual(JSON.parse(JSON.stringify(H.describe(bad,'rooms/a'))),{unreadable:'room_history setting unavailable: unsupported schema'});
  assert.throws(()=>H.records(bad,'rooms/a','T001'),/unsupported schema/);
  // The signing contract still ignores the key: the shared policy is exactly as before.
  const withSetting=C.parse(new TextEncoder().encode(configText(shared.cases[1]))),context=new C.Context(withSetting,{participants:[]},async()=>null);
  assert.equal(context.minimum('rooms/a/x.txt','T001'),'optional');
});

test('AC6: the viewer cannot silently change number formats or key order it cannot reproduce',()=>{
  for(const text of ['{"version": 1, "ratio": 1.0}','{"version": 1, "nested": {"x": [1, 2.5]}}','{"version": 1, "map": {"10": 1, "a": 2}}']){
    const original=parse(text),{config}=H.declare(Object.assign(original,{identity:{boardId:'00000000-0000-4000-8000-000000000000'}}),'rooms/a',null,true);
    assert.throws(()=>H.encodeConfig(config,original),e=>e.code==='encoding',text);
  }
  const original=parse('{"version": 1, "identity": {"boardId": "00000000-0000-4000-8000-000000000000"}, "name": "zażółć \\u0001 \\u2028"}');
  const {config}=H.declare(original,'rooms/a',null,true);
  assert.equal(H.encodeConfig(config,original),'{\n  "version": 1,\n  "identity": {\n    "boardId": "00000000-0000-4000-8000-000000000000"\n  },\n  "name": "zażółć \\u0001  ",\n  "room_history": {\n    "version": 1,\n    "scopes": {\n      "rooms/a": {\n        "record": "on-post"\n      }\n    }\n  }\n}\n');
});

test('AC3/AC5/AC6: every config.json edit is byte-identical to the canonical CLI, and refusals match',t=>{
  const f=fixture();t.after(f.clean);
  const file=h.path.join(f.proj,'.agent-board/config.json'),pair='direct/implementation-agent-01--research-agent-01';
  let bytes=h.fs.readFileSync(file,'utf8');
  const edit=(...edits)=>{
    const original=parse(bytes);let config=original,changed=false;
    for(const e of edits){const r=e(config);if(r.changed){config=r.config;changed=true;}}
    return changed?H.encodeConfig(config,original):bytes;
  };
  const same=(label,...edits)=>{bytes=edit(...edits);assert.equal(h.fs.readFileSync(file,'utf8'),bytes,label);};
  const refused=(label,code,cli,...edits)=>{
    const before=h.fs.readFileSync(file,'utf8');
    assert.match(f.reject(...cli),/./,label+': CLI refuses');
    assert.throws(()=>edit(...edits),e=>e.code===code,label+': viewer refuses');
    assert.equal(h.fs.readFileSync(file,'utf8'),before,label+': nothing written');
  };
  f.cli('history','policy','--scope','rooms/general','--record','on-post');
  same('record a room',c=>H.declare(c,'rooms/general',null,true));
  assert.equal(JSON.parse(f.cli('history','policy','--scope','rooms/general','--record','on-post')).changed,false);
  assert.equal(H.declare(parse(bytes),'rooms/general',null,true).changed,false,'unchanged policy is not a change');
  f.cli('signing','require','--scope','rooms/product','--thread','T002','--minimum','trusted');
  same('require trusted for one thread',c=>H.requireSigning(c,'rooms/product','T002','trusted'));
  f.cli('history','policy','--scope',pair,'--thread','T001','--record','on-post');
  same('record one direct thread',c=>H.declare(c,pair,'T001',true));
  refused('thread off under a recording room','room-records',['history','policy','--scope','rooms/general','--thread','T004','--record','off','--weaken'],c=>H.declare(c,'rooms/general','T004',false,true));
  refused('recording off needs --weaken','weaken',['history','policy','--scope','rooms/general','--record','off'],c=>H.declare(c,'rooms/general',null,false));
  f.cli('history','policy','--scope','rooms/general','--record','off','--weaken');
  same('recording off with --weaken',c=>H.declare(c,'rooms/general',null,false,true));
  refused('lowering trusted needs --weaken','weaken',['signing','require','--scope','rooms/product','--thread','T002','--minimum','optional'],c=>H.requireSigning(c,'rooms/product','T002','optional'));
  f.cli('signing','require','--scope','rooms/product','--thread','T002','--minimum','optional','--weaken');
  same('lower trusted with --weaken',c=>H.requireSigning(c,'rooms/product','T002','optional',true));
  refused('tightening above an explicit optional entry','signing-conflict',['signing','require','--scope','rooms/product','--minimum','trusted'],c=>H.requireSigning(c,'rooms/product',null,'trusted'));
  assert.equal(H.requireSigning(parse(bytes),'rooms/quiet',null,'optional').changed,false,'optional on an undeclared scope writes nothing, as in the CLI');
  // What `post --new-room --require-signing trusted --record-history` writes, in the CLI's order.
  f.cli('signing','require','--scope','rooms/fresh','--minimum','trusted');
  f.cli('history','policy','--scope','rooms/fresh','--record','on-post');
  same('creation-time declaration for a new room',c=>H.requireSigning(c,'rooms/fresh',null,'trusted'),c=>H.declare(c,'rooms/fresh',null,true));
  f.cli('signing','require','--scope',pair,'--thread','T007','--minimum','trusted');
  f.cli('history','policy','--scope',pair,'--thread','T007','--record','on-post');
  same('creation-time declaration for a new topic',c=>H.requireSigning(c,pair,'T007','trusted'),c=>H.declare(c,pair,'T007',true));
  // A malformed setting cannot be edited by either client.
  const broken=JSON.parse(bytes);broken.room_history={version:1,scopes:{'rooms/general':{record:'always'}}};
  bytes=JSON.stringify(broken,null,2)+'\n';h.fs.writeFileSync(file,bytes);
  refused('malformed setting','unreadable',['history','policy','--scope','rooms/general','--record','on-post'],c=>H.declare(c,'rooms/general',null,true));
});
