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
 function options(f){require(Array.isArray(f.options)&&f.options.length>=1&&f.options.length<=32,'options require 1–32 entries');for(const o of f.options)require(keys(o,'id label','description')&&id(o.id)&&text(o.label)&&(o.description===undefined||text(o.description,1000)),'invalid option');require(new Set(f.options.map(o=>o.id)).size===f.options.length,'duplicate option ID');}
 function scalar(f,column=false){
  const k=f.type;let needed='',optional='';require((column?['text','number','select','boolean']:kinds.filter(k=>k!=='editable-table')).includes(k),'unknown field/column type');
  if(k==='input'){require(['text','number'].includes(f.dataType),'invalid input dataType');needed+=' dataType';}
  if(['text','textarea'].includes(k)||(k==='input'&&f.dataType==='text')){needed+=' maxLength';require(Number.isInteger(f.maxLength)&&f.maxLength>=1&&f.maxLength<=4000,'invalid maxLength');}
  if(k==='number'||k==='slider'||(k==='input'&&f.dataType==='number')){needed+=' min max';require(number(f.min)&&number(f.max)&&f.min<=f.max,'invalid number bounds');}
  if(k==='slider'){needed+=' step';require(number(f.step)&&f.step>0&&f.min<f.max,'invalid slider step');const count=(f.max-f.min)/f.step;require(count>=1&&count<=10000&&Math.abs(count-Math.round(count))<=1e-7,'slider must have 1–10000 integral steps');}
  if(optionKinds.includes(k)){needed+=' options';options(f);}
  if(['chips','option-cards'].includes(k)){needed+=' multiple';require(typeof f.multiple==='boolean','multiple must be boolean');}
  if(k==='date-picker'){optional+=' min max';require(['min','max'].every(key=>f[key]===undefined||date(f[key])),'invalid date bounds');require(f.min===undefined||f.max===undefined||f.min<=f.max,'inverted date bounds');}
  require(keys(f,'id type label required'+needed,'help'+optional+(column?'':' default')),'unknown/missing field properties');
  if(Object.hasOwn(f,'default'))require(valueValid(f,f.default),'invalid default value');
 }
 function question(q){
  require(keys(q,'version id type prompt fields buttons')&&q.version===2&&q.type==='form'&&id(q.id)&&text(q.prompt,5000,true),'invalid question envelope');
  require(Array.isArray(q.fields)&&q.fields.length>=1&&q.fields.length<=24,'requires 1–24 fields');const ids=new Set();let cells=0;
  for(const f of q.fields){
   require(object(f)&&id(f.id)&&!ids.has(f.id)&&typeof f.type==='string'&&text(f.label)&&typeof f.required==='boolean'&&(f.help===undefined||text(f.help,1000)),'invalid/duplicate field');ids.add(f.id);
   if(f.type!=='editable-table'){scalar(f);continue;}
   require(keys(f,'id type label required columns rows','help')&&Array.isArray(f.columns)&&f.columns.length>=1&&f.columns.length<=8&&Array.isArray(f.rows)&&f.rows.length>=1&&f.rows.length<=50,'invalid editable table');const cols=new Set(),rows=new Set();
   for(const c of f.columns){require(object(c)&&id(c.id)&&!cols.has(c.id)&&typeof c.type==='string'&&text(c.label)&&typeof c.required==='boolean'&&(c.help===undefined||text(c.help,1000)),'invalid column');cols.add(c.id);scalar(c,true);}
   for(const r of f.rows){require(keys(r,'id values')&&id(r.id)&&!rows.has(r.id)&&object(r.values)&&Object.keys(r.values).length===cols.size&&[...cols].every(k=>Object.hasOwn(r.values,k)),'invalid row');rows.add(r.id);require(f.columns.every(c=>valueValid(c,r.values[c.id])),'invalid baseline cell');}
   cells+=f.columns.length*f.rows.length;require(cells<=400,'maximum 400 editable cells per form');
  }
  require(Array.isArray(q.buttons)&&q.buttons.length>=1&&q.buttons.length<=2,'requires submit and optional reset');
  for(const b of q.buttons)require(keys(b,'id label action','icon')&&id(b.id)&&text(b.label)&&['submit','reset'].includes(b.action)&&(b.icon===undefined||icons.includes(b.icon)),'invalid button');
  require(new Set(q.buttons.map(b=>b.id)).size===q.buttons.length&&q.buttons.filter(b=>b.action==='submit').length===1&&q.buttons.filter(b=>b.action==='reset').length<=1,'duplicate buttons/actions');return q;
 }
 function answer(a,q){
  question(q);require(keys(a,'version question values')&&a.version===2&&a.question===q.id&&object(a.values)&&Object.keys(a.values).length===q.fields.length&&q.fields.every(f=>Object.hasOwn(a.values,f.id)),'answer must contain exactly the defined fields');
  for(const f of q.fields){const v=a.values[f.id];if(f.type!=='editable-table'){require(valueValid(f,v),'invalid answer field '+f.id);continue;}
   require(keys(v,'changes')&&Array.isArray(v.changes)&&v.changes.length<=f.rows.length*f.columns.length&&(v.changes.length>0||!f.required),'invalid table changes');
   const rows=new Map(f.rows.map(r=>[r.id,r.values])),cols=new Map(f.columns.map(c=>[c.id,c])),seen=new Set();
   for(const c of v.changes){require(keys(c,'row column value')&&typeof c.row==='string'&&typeof c.column==='string'&&rows.has(c.row)&&cols.has(c.column),'unknown cell');const key=c.row+'|'+c.column;require(!seen.has(key),'duplicate cell');seen.add(key);require(valueValid(cols.get(c.column),c.value),'invalid changed cell');require(rows.get(c.row)[c.column]!==c.value,'unchanged cell in patch');}
  }return a;
 }
 function initial(q){return Object.fromEntries(q.fields.map(f=>[f.id,f.type==='editable-table'?Object.fromEntries(f.rows.map(r=>[r.id,{...r.values}])):Object.hasOwn(f,'default')?structuredClone(f.default):multiple(f)?[]:f.type==='slider'?f.min:null]));}
 function scalarValue(f,raw){if(multiple(f))return raw;if(f.type==='boolean')return raw;const numeric=f.type==='number'||f.type==='slider'||(f.type==='input'&&f.dataType==='number');if(raw===null||raw===undefined||typeof raw==='string'&&!raw.trim())return null;if(numeric)return typeof raw==='number'?raw:/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)?Number(raw):NaN;return raw;}
 function values(q,draft){const result={};for(const f of q.fields){if(f.type!=='editable-table'){result[f.id]=scalarValue(f,draft[f.id]);continue;}const changes=[];for(const r of f.rows)for(const c of f.columns){const v=scalarValue(c,draft[f.id][r.id][c.id]);if(v!==r.values[c.id])changes.push({row:r.id,column:c.id,value:v});}result[f.id]={changes};}return result;}
 global.BoardFormContract={question,answer,valueValid,multiple,initial,values,scalarValue};
})(globalThis);
