/* Stable viewer-local identity slots; status colors never participate. */
const ParticipantColors=(()=>{
 const neutral='var(--p-unknown)';
 function preferred(id){let hash=2166136261;for(const char of id){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0)%8;}
 function css(slot){
  if(slot<8)return 'var(--p'+slot+')';
  // A permutation of a million RGB grid points avoids HSL rounding collisions.
  // Light uses40..139, Dark140..239; reserve the one intersecting base color.
  const point=((slot-8)*618033+410638)%1000000;
  const channels=[point%100,Math.floor(point/100)%100,Math.floor(point/10000)];
  const light=channels.map(n=>n+40),dark=channels.map(n=>n+140);
  if(light[0]===91&&light[1]===107&&light[2]===42)light[0]=39;
  return `light-dark(rgb(${light.join(' ')}), rgb(${dark.join(' ')}))`;
 }
 function create(saved=[],changed=()=>{}){
  const slots=new Map(),used=new Set();let next=8;
  if(Array.isArray(saved))for(const entry of saved){
   if(!Array.isArray(entry)||entry.length!==2)continue;const [id,slot]=entry;
   if(typeof id!=='string'||!id||id==='unknown'||slots.has(id)||!Number.isSafeInteger(slot)||slot<0||slot>1000000||used.has(slot))continue;
   slots.set(id,slot);used.add(slot);
  }
  const snapshot=()=>[...slots];
  function assign(ids){let added=false;
   for(const id of [...new Set(ids)].filter(id=>typeof id==='string'&&id&&id!=='unknown').sort()){
    if(slots.has(id))continue;let slot=preferred(id),found=false;
    for(let i=0;i<8;i++){const candidate=(slot+i)%8;if(!used.has(candidate)){slot=candidate;found=true;break;}}
    if(!found){while(used.has(next))next++;slot=next++;}
    slots.set(id,slot);used.add(slot);added=true;
   }
   if(added)changed(snapshot());
  }
  return {assign,snapshot,color(id){if(!id||id==='unknown')return neutral;assign([id]);return css(slots.get(id));}};
 }
 return {create,preferred,css};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=ParticipantColors;
