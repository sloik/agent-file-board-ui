// Keep shape/value parity with canonical form_contract.py. Data only.
(function(global){
 const icons=['info','check','warning','error','star','heart','file','folder','chart','image','clock','user'];
 const kinds=['input','textarea','select','radio-group','checkbox-group','chips','option-cards','date-picker','slider','switch-group','editable-table'];
 const optionKinds=['select','radio-group','checkbox-group','chips','option-cards','switch-group'];
 const require=(ok,msg)=>{if(!ok) throw Error('Form: '+msg);};
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const keys=(v,needed,optional='')=>object(v)&&needed.split(' ').filter(Boolean).every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>(needed+' '+optional).split(' ').includes(k));
 const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}(?![\s\S])/.test(v);
 const text=(v,n=200,multi=false)=>typeof v==='string'&&!!v.trim()&&[...v].length<=n&&!(multi?/[\u0000-\u0008\u000b-\u001f\u007f\uD800-\uDFFF]/u:/[\u0000-\u001f\u007f\uD800-\uDFFF]/u).test(v);
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e9;
 function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.length!==10)return false;const[y,m,d]=v.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0);return y>=1&&y<=9999&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];}
 const multiple=f=>['checkbox-group','switch-group'].includes(f.type)||(['chips','option-cards'].includes(f.type)&&f.multiple);
 function valueValid(f,v){
  const k=f.type;
  if(v===null)return !f.required&&!['checkbox-group','switch-group','slider','boolean'].includes(k)&&!(['chips','option-cards'].includes(k)&&f.multiple);
  if(k==='boolean')return typeof v==='boolean';
  if(['text','textarea'].includes(k)||(k==='input'&&f.dataType==='text'))return text(v,f.maxLength,k==='textarea');
  if(k==='number'||(k==='input'&&f.dataType==='number'))return number(v)&&v>=f.min&&v<=f.max;
  if(optionKinds.includes(k)){const allowed=new Set(f.options.map(o=>o.id));return multiple(f)?Array.isArray(v)&&(v.length>0||!f.required)&&v.every(i=>typeof i==='string'&&allowed.has(i))&&new Set(v).size===v.length:typeof v==='string'&&allowed.has(v);}
  if(k==='date-picker')return date(v)&&(f.min===undefined||v>=f.min)&&(f.max===undefined||v<=f.max);
  if(k==='slider'){if(!number(v)||v<f.min||v>f.max)return false;const position=(v-f.min)/f.step;return Math.abs(position-Math.round(position))<=1e-7;}
  return false;
 }
 function options(f,version=2){require(Array.isArray(f.options)&&f.options.length>=1&&f.options.length<=32,'options require 1–32 entries');for(const o of f.options)require(keys(o,'id label','description'+(version===3?' when':''))&&id(o.id)&&text(o.label)&&(o.description===undefined||text(o.description,1000)),'invalid option');require(new Set(f.options.map(o=>o.id)).size===f.options.length,'duplicate option ID');}
 function scalar(f,column=false,version=2){
  const k=f.type;let needed='',optional='';require((column?['text','number','select','boolean']:kinds.filter(k=>k!=='editable-table')).includes(k),'unknown field/column type');
  if(k==='input'){require(['text','number'].includes(f.dataType),'invalid input dataType');needed+=' dataType';}
  if(['text','textarea'].includes(k)||(k==='input'&&f.dataType==='text')){needed+=' maxLength';require(Number.isInteger(f.maxLength)&&f.maxLength>=1&&f.maxLength<=4000,'invalid maxLength');}
  if(k==='number'||k==='slider'||(k==='input'&&f.dataType==='number')){needed+=' min max';require(number(f.min)&&number(f.max)&&f.min<=f.max,'invalid number bounds');}
  if(k==='slider'){needed+=' step';require(number(f.step)&&f.step>0&&f.min<f.max,'invalid slider step');const count=(f.max-f.min)/f.step;require(count>=1&&count<=10000&&Math.abs(count-Math.round(count))<=1e-7,'slider must have 1–10000 integral steps');}
  if(optionKinds.includes(k)){needed+=' options';options(f,version);}
  if(['chips','option-cards'].includes(k)){needed+=' multiple';require(typeof f.multiple==='boolean','multiple must be boolean');}
  if(k==='date-picker'){optional+=' min max';require(['min','max'].every(key=>f[key]===undefined||date(f[key])),'invalid date bounds');require(f.min===undefined||f.max===undefined||f.min<=f.max,'inverted date bounds');}
  require(keys(f,'id type label required'+needed,'help'+optional+(column?'':' default'+(version===3?' visibleWhen':''))),'unknown/missing field properties');
  if(Object.hasOwn(f,'default'))require(valueValid(f,f.default),'invalid default value');
 }
 function question(q){
  require(keys(q,'version id type prompt fields buttons',q.version===3?'validations':'')&&[2,3].includes(q.version)&&q.type==='form'&&id(q.id)&&text(q.prompt,5000,true),'invalid question envelope');
  require(Array.isArray(q.fields)&&q.fields.length>=1&&q.fields.length<=24,'requires 1–24 fields');const ids=new Set();let cells=0;
  for(const f of q.fields){
   require(object(f)&&id(f.id)&&!ids.has(f.id)&&typeof f.type==='string'&&text(f.label)&&typeof f.required==='boolean'&&(f.help===undefined||text(f.help,1000)),'invalid/duplicate field');ids.add(f.id);
   if(f.type!=='editable-table'){scalar(f,false,q.version);continue;}
   require(keys(f,'id type label required columns rows','help'+(q.version===3?' visibleWhen rowOperations':''))&&Array.isArray(f.columns)&&f.columns.length>=1&&f.columns.length<=8&&Array.isArray(f.rows)&&f.rows.length>=(q.version===3&&f.rowOperations?0:1)&&f.rows.length<=50,'invalid editable table');const cols=new Set(),rows=new Set();
   for(const c of f.columns){require(object(c)&&id(c.id)&&!cols.has(c.id)&&typeof c.type==='string'&&text(c.label)&&typeof c.required==='boolean'&&(c.help===undefined||text(c.help,1000)),'invalid column');cols.add(c.id);scalar(c,true);}
   for(const r of f.rows){require(keys(r,'id values')&&id(r.id)&&!rows.has(r.id)&&object(r.values)&&Object.keys(r.values).length===cols.size&&[...cols].every(k=>Object.hasOwn(r.values,k)),'invalid row');rows.add(r.id);require(f.columns.every(c=>valueValid(c,r.values[c.id])),'invalid baseline cell');}
   let capacity=f.rows.length;if(Object.hasOwn(f,'rowOperations')){const p=f.rowOperations;require(keys(p,'add remove reorder minRows maxRows')&&['add','remove','reorder'].every(k=>typeof p[k]==='boolean')&&Number.isInteger(p.minRows)&&Number.isInteger(p.maxRows)&&p.minRows>=0&&p.minRows<=f.rows.length&&p.maxRows>=f.rows.length&&p.maxRows<=50,'invalid row operations');capacity=p.maxRows;}
   cells+=f.columns.length*capacity;require(cells<=400,'maximum 400 editable cells per form');
  }
  if(q.version===3)dependencies(q);
  require(Array.isArray(q.buttons)&&q.buttons.length>=1&&q.buttons.length<=2,'requires submit and optional reset');
  for(const b of q.buttons)require(keys(b,'id label action','icon')&&id(b.id)&&text(b.label)&&['submit','reset'].includes(b.action)&&(b.icon===undefined||icons.includes(b.icon)),'invalid button');
  require(new Set(q.buttons.map(b=>b.id)).size===q.buttons.length&&q.buttons.filter(b=>b.action==='submit').length===1&&q.buttons.filter(b=>b.action==='reset').length<=1,'duplicate buttons/actions');return q;
 }
 function answer(a,q){
  question(q);require(keys(a,'version question values')&&a.version===q.version&&a.question===q.id&&object(a.values)&&Object.keys(a.values).length===q.fields.length&&q.fields.every(f=>Object.hasOwn(a.values,f.id)),'answer must contain exactly the defined fields');
  for(const f of q.fields){const v=a.values[f.id];if(q.version===3&&!active(f,a.values)){require(v===null,'hidden field must be null');continue;}if(f.type!=='editable-table'){require(valueValid(q.version===3?available(f,a.values):f,v),'invalid answer field '+f.id);continue;}
   if(f.rowOperations){validateRows(v,f);continue;}
   require(keys(v,'changes')&&Array.isArray(v.changes)&&v.changes.length<=f.rows.length*f.columns.length&&(v.changes.length>0||!f.required),'invalid table changes');
   const rows=new Map(f.rows.map(r=>[r.id,r.values])),cols=new Map(f.columns.map(c=>[c.id,c])),seen=new Set();
   for(const c of v.changes){require(keys(c,'row column value')&&typeof c.row==='string'&&typeof c.column==='string'&&rows.has(c.row)&&cols.has(c.column),'unknown cell');const key=c.row+'|'+c.column;require(!seen.has(key),'duplicate cell');seen.add(key);require(valueValid(cols.get(c.column),c.value),'invalid changed cell');require(rows.get(c.row)[c.column]!==c.value,'unchanged cell in patch');}
  }if(q.version===3)require(!validationErrors(q,a.values).length,'cross-field validation failed');return a;
 }
 function initial(q){return Object.fromEntries(q.fields.map(f=>[f.id,f.type==='editable-table'?(f.rowOperations?{rows:Object.fromEntries(f.rows.map(r=>[r.id,{...r.values}])),order:f.rows.map(r=>r.id)}:Object.fromEntries(f.rows.map(r=>[r.id,{...r.values}]))):Object.hasOwn(f,'default')?structuredClone(f.default):multiple(f)?[]:f.type==='slider'?f.min:null]));}
 function scalarValue(f,raw){if(multiple(f))return raw;if(f.type==='boolean')return raw;const numeric=f.type==='number'||f.type==='slider'||(f.type==='input'&&f.dataType==='number');if(raw===null||raw===undefined||typeof raw==='string'&&!raw.trim())return null;if(numeric)return typeof raw==='number'?raw:/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)?Number(raw):NaN;return raw;}
 function tableRows(f,raw){return f.rowOperations?raw.order.map(id=>({id,values:raw.rows[id]})):f.rows.map(r=>({id:r.id,values:raw[r.id]}));}
 function values(q,draft){const result={};for(const f of q.fields){
  if(q.version===3&&!active(f,result)){result[f.id]=null;continue;}
  if(f.type!=='editable-table'){const field=q.version===3?available(f,result):f;let value=scalarValue(field,draft[f.id]);if(q.version===3&&optionKinds.includes(f.type)){const ids=new Set(field.options.map(o=>o.id));value=multiple(f)?value.filter(id=>ids.has(id)):ids.has(value)?value:null;}result[f.id]=value;continue;}
  const changes=[],rows=tableRows(f,draft[f.id]),baseline=new Map(f.rows.map(r=>[r.id,r.values])),present=new Set(rows.map(r=>r.id));
  for(const r of rows)if(baseline.has(r.id))for(const c of f.columns){const v=scalarValue(c,r.values[c.id]);if(v!==baseline.get(r.id)[c.id])changes.push({row:r.id,column:c.id,value:v});}
  result[f.id]=f.rowOperations?{changes,added:rows.filter(r=>!baseline.has(r.id)).map(r=>({id:r.id,values:Object.fromEntries(f.columns.map(c=>[c.id,scalarValue(c,r.values[c.id])]))})),removed:f.rows.filter(r=>!present.has(r.id)).map(r=>r.id),order:rows.map(r=>r.id)}:{changes};
 }return result;}
 const family=f=>multiple(f)||f.type==='editable-table'?null:f.type==='date-picker'?'date':f.type==='slider'||f.dataType==='number'?'number':'string';
 const active=(f,v)=>!f.visibleWhen||v[f.visibleWhen.field]===f.visibleWhen.equals;
 const available=(f,v)=>!optionKinds.includes(f.type)?f:{...f,options:f.options.filter(o=>!o.when||v[o.when.field]===o.when.equals)};
 function dependencies(q){
  const prior=new Map();function condition(c){require(keys(c,'field equals')&&prior.has(c.field),'condition must reference earlier scalar field');const f=prior.get(c.field);require(family(f)!==null&&c.equals!==null&&valueValid(f,c.equals),'invalid condition comparison');}
  for(const f of q.fields){if(Object.hasOwn(f,'visibleWhen'))condition(f.visibleWhen);for(const o of f.options||[])if(Object.hasOwn(o,'when'))condition(o.when);prior.set(f.id,f);}
  require(q.validations===undefined||Array.isArray(q.validations)&&q.validations.length<=24,'maximum 24 cross-field rules');
  for(const r of q.validations||[]){require(keys(r,'left op right message')&&prior.has(r.left)&&prior.has(r.right)&&r.left!==r.right&&['eq','ne','lt','lte','gt','gte'].includes(r.op)&&text(r.message,1000),'invalid cross-field rule');const a=family(prior.get(r.left)),b=family(prior.get(r.right));require(a!==null&&a===b&&(['eq','ne'].includes(r.op)||['number','date'].includes(a)),'incompatible comparison fields');}
 }
 function validationErrors(q,v){return(q.validations||[]).filter(r=>{const a=v[r.left],b=v[r.right];if(a===null||b===null)return false;return!({eq:()=>a===b,ne:()=>a!==b,lt:()=>a<b,lte:()=>a<=b,gt:()=>a>b,gte:()=>a>=b}[r.op]());}).map(r=>r.message);}
 function validateRows(v,f){
  const p=f.rowOperations,base=new Map(f.rows.map(r=>[r.id,r.values])),cols=new Map(f.columns.map(c=>[c.id,c]));
  require(keys(v,'changes added removed order')&&Object.values(v).every(Array.isArray)&&v.added.length<=50&&v.removed.length<=50&&v.order.length<=50&&v.changes.length<=400,'invalid structural table reply');
  require(v.removed.every(r=>typeof r==='string'&&base.has(r))&&new Set(v.removed).size===v.removed.length,'unknown/duplicate removed row');require(p.remove||!v.removed.length,'row removal disabled');require(p.add||!v.added.length,'row addition disabled');
  const removed=new Set(v.removed),added=new Map();for(const r of v.added){require(keys(r,'id values')&&id(r.id)&&!base.has(r.id)&&!added.has(r.id)&&object(r.values)&&Object.keys(r.values).length===cols.size&&[...cols.keys()].every(k=>Object.hasOwn(r.values,k)),'invalid added row');require(f.columns.every(c=>valueValid(c,r.values[c.id])),'invalid added cell');added.set(r.id,r.values);}
  const expected=f.rows.filter(r=>!removed.has(r.id)).map(r=>r.id).concat([...added.keys()]);require(v.order.every(r=>typeof r==='string')&&v.order.length===expected.length&&new Set(v.order).size===expected.length&&v.order.every(r=>expected.includes(r)),'order must contain exactly final rows');require(expected.length>=p.minRows&&expected.length<=p.maxRows,'row count outside bounds');require(p.reorder||JSON.stringify(v.order)===JSON.stringify(expected),'row reordering disabled');
  const seen=new Set();for(const c of v.changes){require(keys(c,'row column value')&&base.has(c.row)&&!removed.has(c.row)&&cols.has(c.column),'unknown/removed changed cell');const pair=c.row+'|'+c.column;require(!seen.has(pair),'duplicate changed cell');seen.add(pair);require(valueValid(cols.get(c.column),c.value)&&base.get(c.row)[c.column]!==c.value,'invalid/no-op changed cell');}
  require(!f.required||v.changes.length||v.added.length||removed.size||JSON.stringify(v.order)!==JSON.stringify(f.rows.map(r=>r.id)),'required table needs an edit');
 }
 function fieldValid(f,v,values,version){if(version===3&&!active(f,values))return v===null;if(f.type!=='editable-table')return valueValid(version===3?available(f,values):f,v);try{const copy={...f};delete copy.visibleWhen;answer({version,question:'field-check',values:{[f.id]:v}},{version,id:'field-check',type:'form',prompt:'Check',fields:[copy],buttons:[{id:'submit',label:'Submit',action:'submit'}]});return true;}catch{return false;}}
 function restore(q,raw){
  // Stored drafts may be incomplete, but never contain unknown fields/rows/cells
  // or unbounded values. Validate before a renderer dereferences them.
  const base=initial(q);if(!object(raw)||Object.keys(raw).length!==q.fields.length||new TextEncoder().encode(JSON.stringify(raw)).length>262144)return null;
  const atom=v=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&[...v].length<=4000;
  for(const f of q.fields){const v=raw[f.id];if(f.type==='editable-table'){
   let rows;if(f.rowOperations){if(!keys(v,'rows order')||!object(v.rows)||!Array.isArray(v.order)||v.order.length>f.rowOperations.maxRows||new Set(v.order).size!==v.order.length||Object.keys(v.rows).length!==v.order.length||!v.order.every(r=>id(r)&&Object.hasOwn(v.rows,r)))return null;rows=v.rows;}else{if(!object(v)||Object.keys(v).length!==f.rows.length||!f.rows.every(r=>Object.hasOwn(v,r.id)))return null;rows=v;}
   for(const row of Object.values(rows))if(!object(row)||Object.keys(row).length!==f.columns.length||!f.columns.every(c=>Object.hasOwn(row,c.id)&&atom(row[c.id])))return null;
  }else if(multiple(f)){if(!Array.isArray(v)||v.length>32||!v.every(id)||new Set(v).size!==v.length)return null;}else if(!atom(v))return null;
  }return structuredClone(raw);
 }
 global.BoardFormContract={question,answer,valueValid,multiple,initial,values,scalarValue,tableRows,active,available,validationErrors,fieldValid,restore};
})(globalThis);
