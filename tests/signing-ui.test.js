'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),h=require('./lib/helpers');
const signingBrowser=require('./lib/signing-browser');
let browser;before(async()=>{browser=await h.launch();});after(async()=>browser.close());
const python=process.env.AFB_SIGNING_PYTHON||'python3',canonical=h.path.resolve(__dirname,'../vendor/agent-file-board');
function fixture(){const tmp=h.tmpDir(),proj=h.layoutExample(tmp),r=spawnSync(python,['-c',`
import sys,json,base64,hashlib
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import boardctl,signing_core as c
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
root=Path(sys.argv[2]); board=root/'.agent-board'
seed=bytes.fromhex(json.loads((Path(sys.argv[1])/'tests/fixtures/signing-core/profiles.json').read_bytes())['seed_hex']);key=Ed25519PrivateKey.from_private_bytes(seed)
boardctl.main(['identity','enable','--board-id','8e651ae2-d9db-4f4f-9bf4-a46ff66838bd','--path',str(root)])
reg=json.loads((board/'participants.json').read_bytes()); person=next(p for p in reg['participants'] if p['id']=='human-owner-01')
raw=c.sign_profile(json.dumps(person).encode(),board_id='8e651ae2-d9db-4f4f-9bf4-a46ff66838bd',previous=None,private_key=key)
path=root.parent/'profile.json';path.write_bytes(raw)
assert boardctl.main(['identity','import','human-owner-01','--profile-file',str(path),'--sha256',hashlib.sha256(raw).hexdigest(),'--path',str(root)])==0
jwk=json.loads(c._private_descriptor(key))['key'];jwk['d']=base64.urlsafe_b64encode(seed).decode().rstrip('=');(root.parent/'synthetic-key.json').write_text(json.dumps(jwk))
`,canonical,proj],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return {tmp,proj,key:h.path.join(tmp,'synthetic-key.json')};}
async function boot(){const f=fixture(),s=await h.openPage(browser,{tree:h.readTree(f.proj)});await h.openBoardViaUi(s.page);await h.expandComposer(s.page);return {...f,...s};}
async function unlock(page,key){
 assert.equal(await page.evaluate(async()=>{try{await B.signingContext.resolve('human-owner-01');return 'ok';}catch(e){return e.stack;}}),'ok');
 await signingBrowser.unlock(page,{key,participant:'human-owner-01'});
 assert.equal(await page.evaluate(()=>signingProvider.catalog().length),1);
 assert.equal(await page.inputValue('#me'),'human-owner-01');
 assert.equal(await page.evaluate(()=>document.querySelector('#signingNotice').dataset.signingStatus),'signed');
}
test('actual file UI signs as the selected persona and refuses a persona without an unlocked key; Python independently verifies exact published bytes',async()=>{
 const {page,ctx,tmp,key}=await boot();await unlock(page,key);await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cThread','');await page.fill('#cNewThread','Browser signed');
 await page.selectOption('#me','research-agent-01');await page.fill('#cBody','Never under another persona');await page.click('#send');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes("has no signing key"));
 assert.equal(await page.inputValue('#cBody'),'Never under another persona');assert.equal(await page.evaluate(()=>window.__fakefs.dump().some(f=>f.text?.includes('Never under another persona'))),false);
 await page.selectOption('#me','human-owner-01');await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cThread','');await page.fill('#cNewThread','Browser signed');await page.fill('#cBody','Exact browser bytes 🐈');await page.click('#send');
 await page.waitForFunction(()=>document.querySelector('#cBody').value==='',null,{timeout:5000}).catch(async e=>{throw Error(await page.locator('#toast').innerText());});const out=h.path.join(tmp,'written');h.fs.mkdirSync(out);const files=await h.dumpFakeFs(page,out),msg=files.find(f=>f.path.endsWith('_exact-browser-bytes.txt'));assert.match(msg.text,/FROM: human-owner-01/);assert.match(msg.text,/SIGNATURE: /);assert.equal(files.filter(f=>f.path.includes('/.signatures/')).length,1);
 const r=spawnSync(python,[h.path.join(canonical,'boardctl.py'),'signing','inspect','--path',out,'--message',msg.path.replace('.agent-board/','')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).signature,'valid');assert.equal(JSON.parse(r.stdout).eligibility,'eligible');
 await page.evaluate(async msg=>{await window.__fakefs.addFile(msg.path,msg.text.replace('Exact browser bytes','Tampered browser bytes'));await readFromHandle(true);},msg);
 assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.eligibility,msg.path.replace('.agent-board/','')),'excluded');
 await page.evaluate(async msg=>{await window.__fakefs.addFile(msg.path,msg.text.replace(/^SIGNATURE: .*\n/m,''));await readFromHandle(true);},msg);
 assert.equal(await page.evaluate(path=>B.byPath.get(path).signing.signature,msg.path.replace('.agent-board/','')),'stripped');
 await ctx.close();
});
test('locking blocks signed-mode post and preserves draft; no unsigned fallback',async()=>{
 const {page,ctx,key}=await boot();await unlock(page,key);await page.evaluate(()=>signingProvider.lock());await page.fill('#cBody','Preserve this draft');await page.click('#send');assert.equal(await page.inputValue('#cBody'),'Preserve this draft');assert.equal(await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.text?.includes('Preserve this draft')).length),0);await ctx.close();
});
test('draft edits during async signing refuse publication and preserve the newer draft',async()=>{
 const {page,ctx,key}=await boot();await unlock(page,key);await page.fill('#cBody','Initial draft');await page.evaluate(()=>{const original=signingProvider.sign.bind(signingProvider);signingProvider.sign=async(...args)=>{const result=await original(...args);document.querySelector('#cBody').value='Newer draft';return result;};});await page.click('#send');await page.waitForFunction(()=>document.querySelector('#cBody').value==='Newer draft');assert.equal(await page.evaluate(()=>window.__fakefs.dump().filter(f=>f.text?.includes('Initial draft')).length),0);assert.equal(await page.inputValue('#cBody'),'Newer draft');await ctx.close();
});
test('adopted required policy survives shared removal and excludes unsigned work from actions',async()=>{
 const {page,ctx}=await boot();await page.evaluate(async()=>{const path='.agent-board/config.json',cfg=JSON.parse(window.__fakefs.read(path));cfg.message_signing={version:1,minimum:'trusted'};await window.__fakefs.addFile(path,JSON.stringify(cfg));await readFromHandle(true);B.signingContext.state.floor=SigningContract.mergeFloor(B.signingContext.floor,B.signingContext.shared,B.signingContext.config);await signingSave(B);delete cfg.message_signing;await window.__fakefs.addFile(path,JSON.stringify(cfg));await readFromHandle(true);});
 assert.equal(await page.locator('#feed article.msg').count(),0);await page.evaluate(()=>{signingInspect=true;build({background:true,preserveComposer:true});});assert.ok(await page.locator('#feed article.msg').count()>0);assert.equal(await page.locator('#feed [data-reply]:enabled').count(),0);assert.equal(await page.evaluate(()=>B.msgs.some(m=>unread(m))),false);await ctx.close();
});
for(const phase of ['writer acquisition','write'])test('lock during '+phase+' refuses commit after awaited filesystem operations',async()=>{
 const {page,ctx,key}=await boot();await unlock(page,key);await page.fill('#cBody','Lock during write');
 await page.evaluate(async phase=>{const proto=Object.getPrototypeOf(await baseHandle.getFileHandle('config.json')),original=proto.createWritable;proto.createWritable=async function(...args){const writer=await original.apply(this,args);if(this.name.endsWith('_lock-during-write.txt')){if(phase==='writer acquisition')signingProvider.lock();else{const write=writer.write;writer.write=async(...data)=>{await write(...data);signingProvider.lock();};}}return writer;};},phase);
 await page.click('#send');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('context changed'));
 assert.equal(await page.inputValue('#cBody'),'Lock during write');assert.equal(await page.evaluate(()=>window.__fakefs.dump().some(f=>f.path.endsWith('_lock-during-write.txt'))),false);await ctx.close();
});
test('two tabs cannot overwrite adopted floors or restore removed trust, and stale publication is refused',async()=>{
 const {page,ctx,key}=await boot();await unlock(page,key);
 const info=await page.evaluate(async()=>{const c=B.signingContext;c.state.pins['human-owner-01']=(await c.resolve('human-owner-01')).head.fingerprint;await signingSave(B);const msg=composeMessage({sender:'human-owner-01',to:'all',scope:'room',room:'architecture',tid:'T001',threadLabel:'T001-schema',slug:'cas-trial',status:'INFO',body:'CAS trial'});window.__pendingPacket=await signingDelivery(msg);return {key:B.signingKey,config:c.config,registry:c.registry,state:c.state,expected:B.signingExpected};});
 const peer=await ctx.newPage();await peer.goto(h.pathToFileURL(h.BOARD_HTML).href);await peer.waitForFunction(()=>window.__boardTest);
 await peer.evaluate(info=>{window.__peerModel={signingKey:info.key,signingExpected:info.expected,signingContext:new SigningContract.Context(info.config,info.registry,async()=>null,info.state),msgs:[]};},info);
 await page.evaluate(async()=>{B.signingContext.state.floor={version:1,minimum:'trusted',scopes:{}};delete B.signingContext.state.pins['human-owner-01'];await signingSave(B);});
 const conflict=await peer.evaluate(async()=>{try{await signingSave(window.__peerModel);return 'accepted';}catch(e){return e.message;}});assert.match(conflict,/changed in another tab/);
 const persisted=await peer.evaluate(key=>signingGet(key),info.key);assert.equal(persisted.floor.minimum,'trusted');assert.equal(persisted.pins['human-owner-01'],undefined);
 const refusal=await page.evaluate(async()=>{try{await window.__pendingPacket.guard();return 'accepted';}catch(e){return e.message;}});assert.match(refusal,/Private signing context changed/);await ctx.close();
});
test('reply checks the reviewed snapshot rather than accepting a newly changed disk baseline',async()=>{
 const {page,ctx,key}=await boot();await unlock(page,key);await page.evaluate(async()=>{const m=B.msgs.find(m=>m.scope==='room'&&m.dir==='architecture'&&m.author==='implementation-agent-01');startReply(m);document.querySelector('#cBody').value='Review unchanged source first';const old=await rawBytes(m.source.file);await window.__fakefs.addFile('.agent-board/'+m.path,SigningContract.text(old)+'Changed after review.\n');});await page.click('#send');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Reply source changed'));assert.equal(await page.inputValue('#cBody'),'Review unchanged source first');assert.equal(await page.evaluate(()=>window.__fakefs.dump().some(f=>f.text?.includes('Review unchanged source first'))),false);await ctx.close();
});
