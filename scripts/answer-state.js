/* Shared append-only answer acceptance. No timestamps or local persistence. */
const AnswerState=(()=>{
 const require=(ok,message)=>{if(!ok)throw Error('ANSWER-STATE: '+message);};
 const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.split(',').sort().join(',');
 const ref=r=>{require(exact(r,'file,sha256')&&typeof r.file==='string'&&r.file===r.file.trim()&&/^[a-zA-Z0-9_-]+\.txt$/.test(r.file)&&r.file.length<=255&&typeof r.sha256==='string'&&r.sha256.length===64&&/^[a-f0-9]{64}$/.test(r.sha256),'invalid immutable reference');return r;};
 const key=r=>JSON.stringify([r.file,r.sha256]);
 const reference=r=>({file:r.file,sha256:r.sha256});
 function validate(s){
  require(exact(s,'version,questionDigest,parents,winner')&&s.version===1&&typeof s.questionDigest==='string'&&s.questionDigest.length===64&&/^[a-f0-9]{64}$/.test(s.questionDigest),'invalid version/question digest');
  require(Array.isArray(s.parents)&&s.parents.length<=32,'parent limit');s.parents.forEach(ref);
  require(new Set(s.parents.map(key)).size===s.parents.length,'duplicate parent');
  if(s.winner!==null)ref(s.winner);else require(s.parents.length===0,'self claim cannot resolve parents');return s;
 }
 function metadata(h,source,parse=JSON.parse){
  if(h['ANSWER-STATE']===undefined)return null;
  require(typeof h['ANSWER-STATE']==='string'&&new TextEncoder().encode(h['ANSWER-STATE']).length<=16384,'metadata byte limit');
  const s=validate(parse(h['ANSWER-STATE']));
  require(source?.QUESTION!==undefined&&source.ANSWER===undefined&&h.QUESTION===undefined,'missing question source');
  require(typeof h['REPLY-TO']==='string'&&h['REPLY-TO']===h['REPLY-TO'].trim()&&/^[a-zA-Z0-9_-]+\.txt$/.test(h['REPLY-TO']),'invalid question filename');
  require(h.SCOPE===source.SCOPE&&h.THREAD?.split('-')[0]===source.THREAD?.split('-')[0]&&h.ROOM===source.ROOM&&h['DIRECT-PARTICIPANTS']===source['DIRECT-PARTICIPANTS'],'routing differs');
  if(s.winner===null)require(h.ANSWER!==undefined,'self claim requires an answer');
  else require(h.ANSWER===undefined&&h.FROM===source.FROM,'only question author may explicitly accept/resolve');
  return s;
 }
 function resolve(questionDigest,records,author){
  const result={status:'none',winner:null,heads:[],choices:[],history:[],reason:''};
  try{
   require(records.length<=4096,'record limit');const byId=new Map();
   for(const r of records){ref(reference(r));require(!byId.has(key(r)),'duplicate record identity');byId.set(key(r),r);if(r.answer&&r.eligible)result.history.push(reference(r));}
   const nodes=records.filter(r=>r.state);result.history.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
   if(!nodes.length){result.status=result.history.length?'legacy':'none';return result;}
   const memo=new Map(),levels=new Map(),visiting=new Set(),parents=new Set();
   function visit(r,depth=0){
    const id=key(r);if(memo.has(id)){require(depth+levels.get(id)<=128,'cyclic/deep acceptance history');return memo.get(id);}
    require(depth<=128&&!visiting.has(id),'cyclic/deep acceptance history');visiting.add(id);
    const s=validate(r.state);require(s.questionDigest===questionDigest,'question bytes changed');
    require(r.eligible,'acceptance evidence is unavailable or signing-excluded');
    let winner,height=0;
    if(s.winner===null){require(r.answer&&s.parents.length===0,'invalid self claim');winner=reference(r);}
    else{
     require(r.author===author&&!r.answer,'unauthorized explicit acceptance');
     const target=byId.get(key(s.winner));require(target?.answer&&target.eligible,'accepted answer is missing or signing-excluded');
     winner=reference(target);
     const inherited=[];
     for(const p of s.parents){const parent=byId.get(key(p));require(parent?.state,'missing immutable parent');parents.add(key(p));inherited.push(visit(parent,depth+1));height=Math.max(height,1+levels.get(key(p)));}
     require(!s.parents.length||inherited.some(w=>key(w)===key(winner)),'resolution must retain a claimed winner');
    }
    visiting.delete(id);levels.set(id,height);memo.set(id,winner);return winner;
   }
   for(const r of nodes)visit(r);
   const heads=nodes.filter(r=>!parents.has(key(r)));require(heads.length&&heads.length<=32,'head limit');
   result.heads=heads.map(reference).sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
   result.choices=[...new Map(heads.map(r=>{const w=memo.get(key(r));return [key(w),w];})).values()].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
   result.status=result.choices.length===1?'accepted':'conflict';if(result.status==='accepted')result.winner=result.choices[0];return result;
  }catch(e){result.status='blocked';result.winner=null;result.reason=e.message;return result;}
 }
 return {validate,metadata,resolve,key,reference};
})();
if(typeof module!=='undefined')module.exports=AnswerState;
