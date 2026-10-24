'use strict';
// Fresh disposable identities; private keys and CLI trust never enter the board.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const h = require('./helpers');
const canonical = h.path.join(h.ROOT, 'vendor/agent-file-board');
const python = process.env.AFB_SIGNING_PYTHON || 'python3';
const setup = String.raw`
import sys,os,json,base64,hashlib,uuid,io,contextlib
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import boardctl,signing_core as core,signing_commands as commands
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PrivateFormat,NoEncryption
root=Path(sys.argv[2]);private=root.parent;board=root/'.agent-board'
# Screenshots pass a seed so fingerprints and the board ID repeat between runs; tests use fresh keys.
seed=os.environ.get('AFB_FIXTURE_SEED','')
def ctl(*args):
 with contextlib.redirect_stdout(io.StringIO()):
  code=boardctl.main([*args,'--path',str(root)])
 assert code==0,args
def keyfile(name):
 key=Ed25519PrivateKey.from_private_bytes(hashlib.sha256((seed+':'+name).encode()).digest()) if seed else Ed25519PrivateKey.generate()
 raw=key.private_bytes(Encoding.Raw,PrivateFormat.Raw,NoEncryption())
 jwk=dict(json.loads(core._private_descriptor(key))['key'],d=base64.urlsafe_b64encode(raw).decode().rstrip('='))
 path=private/(name+'.json');path.write_text(json.dumps(jwk));path.chmod(0o600);return key,path
def profile(person,key,previous):
 raw=core.sign_profile(json.dumps(person).encode(),board_id=board_id,previous=previous,private_key=key)
 digest=hashlib.sha256(raw).hexdigest();path=private/(digest+'.json');path.write_bytes(raw);return path,digest
def info(participant,path):
 head=commands.session(root).resolve(participant)['head'];return dict(participant=participant,key=str(path),profile=head.envelope_sha256,fingerprint=head.fingerprint)
if sys.argv[3]=='init':
 board_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'afb-fixture:'+seed) if seed else uuid.uuid4());ctl('identity','enable','--board-id',board_id)
 result={}
 for name,participant in [('owner','human-owner-01'),('peer','research-agent-01')]:
  key,path=keyfile(name);reg=json.loads((board/'participants.json').read_bytes());person=next(p for p in reg['participants'] if p['id']==participant)
  source,digest=profile(person,key,None);ctl('identity','import',participant,'--profile-file',str(source),'--sha256',digest)
  result[name]=info(participant,path)
elif sys.argv[3]=='register':
 participant=sys.argv[4];board_id=json.loads((board/'config.json').read_bytes())['identity']['boardId']
 key,path=keyfile(participant);reg=json.loads((board/'participants.json').read_bytes());person=next(p for p in reg['participants'] if p['id']==participant)
 source,digest=profile(person,key,None);ctl('identity','import',participant,'--profile-file',str(source),'--sha256',digest)
 result=info(participant,path)
elif sys.argv[3]=='keys':
 # SPEC-002-073: five more participants so the board has a key in every state. Names are the owner's edit of
 # participants.json; keys, profiles, imports and revocations are the canonical commands.
 board_id=json.loads((board/'config.json').read_bytes())['identity']['boardId'];result={}
 for participant,kind,name in [('ada-reviewer','human','Ada Novak'),('build-agent-02','agent','Build agent'),('cache-agent-03','agent','Cache agent'),('docs-agent-04','agent','Docs agent'),('edge-agent-05','agent','Edge agent')]:
  ctl('join',participant,'--kind',kind,'--language','en')
  reg=json.loads((board/'participants.json').read_bytes());person=next(p for p in reg['participants'] if p['id']==participant);person['name']=name
  (board/'participants.json').write_text(json.dumps(reg,indent=2)+'\n')
  key,path=keyfile(participant);source,digest=profile(person,key,None);ctl('identity','import',participant,'--profile-file',str(source),'--sha256',digest)
  result[participant]=info(participant,path)
 for participant,status,reason in [('docs-agent-04','retired','Replaced by a new laptop'),('edge-agent-05','compromised','Key file leaked')]:
  ctl('signing','revoke','--participant',participant,'--key-file',result[participant]['key'],'--expect-profile',result[participant]['profile'],'--status',status,'--reason',reason)
 # Last: a profile the board lists but no longer holds, so that one key cannot be loaded.
 (board/'identity'/'profiles'/(result['cache-agent-03']['profile']+'.json')).unlink()
else:
 participant=sys.argv[4] if len(sys.argv)>4 else 'human-owner-01';old=commands.session(root).resolve(participant)['head'];board_id=json.loads((board/'config.json').read_bytes())['identity']['boardId']
 owner=participant=='human-owner-01';key,path=keyfile('rotated' if owner else participant+'-rotated');person=json.loads(old.snapshot)
 if owner:person['name']='Rotated owner'
 source,digest=profile(person,key,old.envelope_sha256);event=private/(participant+'-transition.json')
 ctl('signing','transition','--participant',participant,'--profile-file',str(source),'--sha256',digest,'--key-file',str(private/({'human-owner-01':'owner','research-agent-01':'peer'}.get(participant,participant)+'.json')),'--new-key-file',str(path),'--output',str(event))
 ctl('signing','update','--participant',participant,'--profile-file',str(source),'--sha256',digest,'--expect-profile',old.envelope_sha256,'--event-file',str(event))
 result=info(participant,path)
print(json.dumps(result))
`;
function fixture({seed = ''} = {}) {
  const tmp = h.fs.realpathSync(h.tmpDir('afb-signing-scenarios-')), proj = h.layoutExample(tmp);
  const env = {...process.env, AGENT_FILE_BOARD_STATE_DIR: h.path.join(tmp, 'private-state'), AFB_FIXTURE_SEED: seed};
  const run = (args, expected = 0) => {
    const r = spawnSync(python, args, {env, encoding:'utf8'});
    assert.equal(r.status, expected, r.stderr || r.stdout);
    return (expected === 0 ? r.stdout : r.stderr).trim();
  };
  let identities;
  try { identities = JSON.parse(run(['-I','-c',setup,canonical,proj,'init'])); }
  catch (error) { h.fs.rmSync(tmp,{recursive:true,force:true}); throw error; }
  return {tmp,proj,...identities,
    cli: (...args) => run([h.path.join(canonical,'boardctl.py'),...args,'--path',proj]),
    reject: (...args) => run([h.path.join(canonical,'boardctl.py'),...args,'--path',proj],2),
    rotate: (participant) => JSON.parse(run(['-I','-c',setup,canonical,proj,'rotate',...(participant?[participant]:[])])),
    // SPEC-002-073: every key state at once (see the 'keys' step); returns the identities by participant id.
    keys: () => JSON.parse(run(['-I','-c',setup,canonical,proj,'keys'])),
    register: (participant) => JSON.parse(run(['-I','-c',setup,canonical,proj,'register',participant])),
    clean: () => h.fs.rmSync(tmp,{recursive:true,force:true})};
}
module.exports = {fixture};
