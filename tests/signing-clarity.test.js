'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(pl=false){const c=vm.createContext({SigningContract:{Provider:class{}},exText:(en,polish)=>pl?polish:en,esc:s=>String(s).replaceAll('<','&lt;')});vm.runInContext(fs.readFileSync(require.resolve('../scripts/signing-ui.js'),'utf8'),c);return c;}
test('signature result, local approval and exclusion remain separate readable facts',()=>{
  const a=api();
  assert.match(a.signingMessageSummary({signing:{signature:'valid',trust:'unfamiliar',eligibility:'eligible'}}),/Signature verified · Signing key not approved by you$/);
  assert.match(a.signingMessageSummary({signing:{signature:'valid',trust:'trusted',lifecycle:'compromised',eligibility:'excluded'}}),/Signature verified · Signing key trusted by you · Signing key compromised · Blocked by signing rules/);
  for(const [signature,label] of Object.entries({unsigned:'Unsigned message',invalid:'Invalid signature',stripped:'Signature removed',unavailable:'Signature not verified yet'})) assert.ok(a.signingMessageSummary({signing:{signature}}).startsWith(label));
  assert.match(a.signingMessageSummary({signing:{signature:'unavailable',eligibility:'pending-verification'}}),/Waiting for verification — inspection only/);
  assert.match(a.signingMessageSummary({signing:{signature:'valid',lifecycle:'retired'}}),/Signing key retired/);
  assert.match(a.signingMessageSummary({signing:{signature:'valid',lifecycle:'superseded'}}),/Older signing key/);
  assert.equal(a.signingMessageSummary({}),'Signature not checked');
});
test('participant approval describes the current exact key, with revocation taking precedence',()=>{
  const a=api(),summary=f=>a.signingParticipantSummary('alice',{signingParticipants:{alice:f}});
  assert.equal(summary({fingerprint:'a',trusted:true}),'Current key trusted by you');
  assert.equal(summary({fingerprint:'b',changed:true}),'Key changed — review needed');
  assert.equal(summary({fingerprint:'a'}),'Current key not approved by you');
  assert.equal(summary({fingerprint:'a',trusted:true,revoked:'retired'}),'Current key revoked — do not use');
  assert.equal(summary({error:'missing'}),'Current key unavailable');
  assert.equal(summary({unregistered:true}),'No signing key registered');
});
test('message explanation includes exact signing fingerprint, limits and escaped diagnostics',()=>{
  const a=api(),html=a.signingMessageHtml({signing:{signature:'valid',fingerprint:'abc123',reason:'<bad>'}});
  assert.match(html,/neither proves the claims in the message are true/);assert.match(html,/<code>abc123<\/code>/);assert.match(html,/&lt;bad>/);assert.match(html,/verify older messages/);
  assert.match(api(true).signingMessageSummary({signing:{signature:'unsigned'}}),/Wiadomość bez podpisu/);
  assert.match(api(true).signingMessageHtml({}),/Twoje lokalne zatwierdzenie/);
});


test('emoji states preserve independent integrity, approval and blocking explanations',()=>{
  const a=api();
  const facts=a.signingMessageFacts({signing:{signature:'valid',trust:'trusted',lifecycle:'compromised',eligibility:'excluded'}});
  assert.deepEqual(Array.from(facts,f=>f.id),['signature-valid','key-trusted','key-compromised','blocked']);
  assert.deepEqual(Array.from(facts,f=>f.emoji),['✅','🔑','🚨','⛔']);
  assert.match(facts.find(f=>f.id==='blocked').explanation,/verified signature alone does not remove this block/);
  const unfamiliar=a.signingMessageFacts({signing:{signature:'valid',trust:'unfamiliar',eligibility:'eligible'}});
  assert.deepEqual(Array.from(unfamiliar,f=>f.id),['signature-valid','key-unfamiliar']);
  assert.match(unfamiliar[1].explanation,/Optional board rules may still allow actions/);
  for(const signature of ['unsigned','invalid','stripped','unavailable','unknown']){
    const rows=a.signingMessageFacts({signing:{signature,trust:'trusted'}});
    assert.equal(rows.some(f=>f.id==='key-trusted'),false,'approval must not imply a verified signature');
    assert.equal(rows.some(f=>f.emoji==='✅'),false);
    assert.ok(rows[0].explanation.length>30);
  }
  for(const lifecycle of ['superseded','retired','compromised'])assert.ok(a.signingMessageFacts({signing:{lifecycle}}).some(f=>f.id==='key-'+lifecycle));
  const html=a.signingMessageHtml({signing:{signature:'unavailable',eligibility:'pending-verification'}});
  assert.match(html,/title="Signature not verified yet:/);assert.match(html,/aria-hidden="true">⏳/);assert.match(html,/signing-state-explanations/);
  assert.match(api(true).signingMessageFacts({signing:{signature:'valid'}})[0].explanation,/Bajty wiadomości/);
});
