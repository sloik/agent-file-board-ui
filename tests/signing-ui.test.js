'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),h=require('./lib/helpers');
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
async function unlock(page,key){assert.equal(await page.evaluate(async()=>{try{await B.signingContext.resolve('human-owner-01');return 'ok';}catch(e){return e.stack;}}),'ok');await page.evaluate(()=>signingDialog());await page.locator('#signingDialog input[type=file]').setInputFiles(key);await page.getByRole('button',{name:'Unlock selected keys',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#signingDialog button').disabled);assert.equal(await page.evaluate(()=>signingProvider.catalog().length),1,await page.locator('#signingDialog').innerText());await page.getByRole('button',{name:'Close',exact:true}).click();}
test('actual file UI unlock auto-signs with distinct viewing identity; Python independently verifies exact published bytes',async()=>{
 const {page,ctx,tmp,key}=await boot();await unlock(page,key);await page.selectOption('#me','research-agent-01');await page.selectOption('#cWhere','room:architecture');await page.selectOption('#cThread','');await page.fill('#cNewThread','Browser signed');await page.fill('#cBody','Exact browser bytes 🐈');await page.click('#send');
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
