'use strict';
// Fresh disposable identities; private keys and CLI trust never enter the board.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const h = require('./helpers');
const canonical = h.path.join(h.ROOT, 'vendor/agent-file-board');
const python = process.env.AFB_SIGNING_PYTHON || 'python3';
const setup = String.raw`
import sys,json,base64,hashlib,uuid,io,contextlib
from pathlib import Path
sys.path.insert(0,sys.argv[1])
import boardctl,signing_core as core,signing_commands as commands
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PrivateFormat,NoEncryption
root=Path(sys.argv[2]);private=root.parent;board=root/'.agent-board'
def ctl(*args):
 with contextlib.redirect_stdout(io.StringIO()):
  code=boardctl.main([*args,'--path',str(root)])
 assert code==0,args
def keyfile(name):
 key=Ed25519PrivateKey.generate();seed=key.private_bytes(Encoding.Raw,PrivateFormat.Raw,NoEncryption())
 jwk=dict(json.loads(core._private_descriptor(key))['key'],d=base64.urlsafe_b64encode(seed).decode().rstrip('='))
 path=private/(name+'.json');path.write_text(json.dumps(jwk));path.chmod(0o600);return key,path
def profile(person,key,previous):
 raw=core.sign_profile(json.dumps(person).encode(),board_id=board_id,previous=previous,private_key=key)
 digest=hashlib.sha256(raw).hexdigest();path=private/(digest+'.json');path.write_bytes(raw);return path,digest
def info(participant,path):
 head=commands.session(root).resolve(participant)['head'];return dict(participant=participant,key=str(path),profile=head.envelope_sha256,fingerprint=head.fingerprint)
if sys.argv[3]=='init':
 board_id=str(uuid.uuid4());ctl('identity','enable','--board-id',board_id)
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
else:
 participant='human-owner-01';old=commands.session(root).resolve(participant)['head'];board_id=json.loads((board/'config.json').read_bytes())['identity']['boardId']
 key,path=keyfile('rotated');person=json.loads(old.snapshot);person['name']='Rotated owner';source,digest=profile(person,key,old.envelope_sha256);event=private/'transition.json'
 ctl('signing','transition','--participant',participant,'--profile-file',str(source),'--sha256',digest,'--key-file',str(private/'owner.json'),'--new-key-file',str(path),'--output',str(event))
 ctl('signing','update','--participant',participant,'--profile-file',str(source),'--sha256',digest,'--expect-profile',old.envelope_sha256,'--event-file',str(event))
 result=info(participant,path)
print(json.dumps(result))
`;
function fixture() {
  const tmp = h.fs.realpathSync(h.tmpDir('afb-signing-scenarios-')), proj = h.layoutExample(tmp);
  const env = {...process.env, AGENT_FILE_BOARD_STATE_DIR: h.path.join(tmp, 'private-state')};
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
    rotate: () => JSON.parse(run(['-I','-c',setup,canonical,proj,'rotate'])),
    register: (participant) => JSON.parse(run(['-I','-c',setup,canonical,proj,'register',participant])),
    clean: () => h.fs.rmSync(tmp,{recursive:true,force:true})};
}
module.exports = {fixture};
