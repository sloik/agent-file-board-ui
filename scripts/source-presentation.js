'use strict';
// One offline, read-only presentation for source text and ordinary unified patches.
const hljs=require('highlight.js/lib/core');
for(const [name,grammar] of [
 ['javascript',require('highlight.js/lib/languages/javascript')],['typescript',require('highlight.js/lib/languages/typescript')],
 ['python',require('highlight.js/lib/languages/python')],['bash',require('highlight.js/lib/languages/bash')],
 ['json',require('highlight.js/lib/languages/json')],['yaml',require('highlight.js/lib/languages/yaml')],
 ['xml',require('highlight.js/lib/languages/xml')],['css',require('highlight.js/lib/languages/css')],
 ['java',require('highlight.js/lib/languages/java')],['cpp',require('highlight.js/lib/languages/cpp')],
 ['csharp',require('highlight.js/lib/languages/csharp')],['go',require('highlight.js/lib/languages/go')],
 ['rust',require('highlight.js/lib/languages/rust')],['swift',require('highlight.js/lib/languages/swift')],
 ['markdown',require('highlight.js/lib/languages/markdown')]
])hljs.registerLanguage(name,grammar);
const LIMITS=Object.freeze({bytes:65536,lines:2000,highlight:16384,line:4096,blocks:64});
const aliases={js:'javascript',jsx:'javascript',ts:'typescript',tsx:'typescript',py:'python',sh:'bash',shell:'bash',yml:'yaml',html:'xml',htm:'xml',svg:'xml',cs:'csharp',c:'cpp',cc:'cpp',h:'cpp',hpp:'cpp',rs:'rust',md:'markdown',patch:'diff',udiff:'diff',txt:'text',plaintext:'text'};
function language(value){const name=String(value||'').trim().split(/\s+/)[0].toLowerCase();return /^[a-z0-9_+#.-]{1,40}$/.test(name)?Object.hasOwn(aliases,name)?aliases[name]:name:'';}
function filenameLanguage(title){const match=/\.([a-z0-9+#]+)$/i.exec(String(title||''));return match?language(match[1]):'';}
const bytes=value=>new TextEncoder().encode(value).length;
function parseDiff(raw){
 const fail=reason=>({valid:false,reason,raw});
 if(typeof raw!=='string')return fail('text');
 if(bytes(raw)>LIMITS.bytes)return fail('limit');
 const lines=raw.split(/\r\n|\n|\r/);if(lines.at(-1)==='')lines.pop();
 if(lines.length>LIMITS.lines)return fail('limit');
 if(lines.some(line=>/^[+-]/.test(line))&&lines.every(line=>/^[ +-]/.test(line)||line==='\\ No newline at end of file')&&!lines.some(line=>/^(?:--- |\+\+\+ )/.test(line))){
  const rows=[];let previous=false;for(const line of lines){
   if(line==='\\ No newline at end of file'){if(!previous)return fail('marker');rows.push({kind:'marker',text:line});previous=false;}
   else{rows.push({kind:line[0]==='+'?'added':line[0]==='-'?'removed':'context',text:line.slice(1),old:null,next:null});previous=true;}
  }
  return {valid:true,fragment:true,raw,rows,added:rows.filter(r=>r.kind==='added').length,removed:rows.filter(r=>r.kind==='removed').length};
 }
 let old=0,next=0,left=0,right=0,hunk=null,sawHunk=false,previous=null,pendingHeader=false;
 const rows=[],ends=new WeakMap();let file={old:'',next:'',language:''};
 const complete=()=>!hunk||(left===0&&right===0);
 for(const line of lines){
  if(line==='\\ No newline at end of file'){
   if(!previous||!['context','removed','added'].includes(previous.kind))return fail('marker');
   rows.push({kind:'marker',text:line,file});previous=null;continue;
  }
  if(hunk&&!complete()){
   let row;
   if(line[0]===' '&&left>0&&right>0){row={kind:'context',text:line.slice(1),old:old++,next:next++};left--;right--;}
   else if(line[0]==='-'&&left>0){row={kind:'removed',text:line.slice(1),old:old++,next:null};left--;}
   else if(line[0]==='+'&&right>0){row={kind:'added',text:line.slice(1),old:null,next:next++};right--;}
   else return fail('counts');
   row.file=file;rows.push(row);previous=row;continue;
  }
  const match=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(line);
  if(match){
   if(pendingHeader)return fail('headers');
   if(!complete())return fail('counts');
   const values=[Number(match[1]),Number(match[2]??1),Number(match[3]),Number(match[4]??1)];
   if(values.some(n=>!Number.isSafeInteger(n)||n<0||n>2147483647))return fail('range');
   [old,left,next,right]=values;if((old===0&&left!==0)||(next===0&&right!==0))return fail('range');
   const end=ends.get(file);if(end&&(old<end.old||next<end.next))return fail('order');
   if(old+left>2147483647||next+right>2147483647)return fail('range');
   ends.set(file,{old:old+left,next:next+right});
   hunk=line;sawHunk=true;previous=null;rows.push({kind:'hunk',text:line,file});continue;
  }
  if(/^@@@|^diff --(?:cc|combined)\b|^GIT binary patch$|^Binary files /.test(line))return fail('unsupported');
  if(pendingHeader&&!line.startsWith('+++ '))return fail('headers');
  if(line.startsWith('diff --git ')){file={old:'',next:'',language:''};rows.push({kind:'meta',text:line,file});hunk=null;previous=null;continue;}
  if(line.startsWith('--- ')){pendingHeader=true;file={old:line.slice(4).split('\t')[0],next:'',language:''};rows.push({kind:'meta',text:line,file});hunk=null;previous=null;continue;}
  if(line.startsWith('+++ ')){if(!pendingHeader)return fail('headers');pendingHeader=false;file.next=line.slice(4).split('\t')[0];file.language=filenameLanguage(file.next.replace(/"$/,''))||filenameLanguage(file.old.replace(/"$/,''));rows.push({kind:'meta',text:line,file});hunk=null;previous=null;continue;}
  if(/^(?:index |(?:old|new|deleted file|new file) mode |(?:dis)?similarity index |(?:rename|copy) (?:from|to) )/.test(line)||line===''){
   if(line!==''&&ends.has(file))return fail('format');
   rows.push({kind:'meta',text:line,file});hunk=null;previous=null;continue;
  }
  return fail('format');
 }
 if(pendingHeader)return fail('headers');
 if(!complete())return fail('counts');
 if(!sawHunk)return fail('no-hunks');
 return {valid:true,raw,rows,added:rows.filter(r=>r.kind==='added').length,removed:rows.filter(r=>r.kind==='removed').length};
}
function splitRows(rows){
 const out=[];let removed=[],added=[];
 const flush=()=>{for(let i=0;i<Math.max(removed.length,added.length);i++)out.push({left:removed[i]||null,right:added[i]||null});removed=[];added=[];};
 for(const row of rows){
  if(row.kind==='removed')removed.push(row);else if(row.kind==='added')added.push(row);
  else{flush();out.push(row.kind==='context'?{left:row,right:row}:{meta:row});}
 }flush();return out;
}
const words=()=>document.documentElement.lang==='pl'?{
 code:'Kod',diff:'Różnice',unified:'Łącznie',split:'Obok siebie',source:'Źródło',copy:'Kopiuj źródło',copied:'Skopiowano',unavailable:'Kopiowanie niedostępne — zaznacz źródło poniżej.',fallback:'Pokazano surowe źródło: format nieobsługiwany, niepoprawny lub przekracza limit widoku.',fragment:'Fragment różnic — nie podano numerów linii.',plain:'Zbyt duży blok do kolorowania — pokazano zwykły tekst.',old:'Przed',next:'Po'
}:{code:'Code',diff:'Diff',unified:'Unified',split:'Side by side',source:'Source',copy:'Copy source',copied:'Copied',unavailable:'Copy unavailable — select the source below.',fallback:'Showing raw source: unsupported, malformed or beyond the presentation limit.',fragment:'Diff fragment — line numbers were not provided.',plain:'Beyond the highlighting limit — showing plain text.',old:'Before',next:'After'};
const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
function encode(raw){let binary='';for(const b of new TextEncoder().encode(raw))binary+=String.fromCharCode(b);return btoa(binary);}
function decode(raw){return new TextDecoder().decode(Uint8Array.from(atob(raw),c=>c.charCodeAt(0)));}
function paint(code,text,hint,budget){
 const name=language(hint),size=bytes(text);
 if(!hljs.getLanguage(name)||size>LIMITS.highlight||text.split(/\r\n|\n|\r/).some(line=>line.length>LIMITS.line)||size>budget.left){code.textContent=text;return;}
 budget.left-=size;
 try{
  const html=hljs.highlight(text,{language:name,ignoreIllegals:true}).value;
  code.innerHTML=DOMPurify.sanitize(html,{ALLOWED_TAGS:['span'],ALLOWED_ATTR:['class'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false});
 }catch{code.textContent=text;}
}
function sourceView(root,raw,hint,budget){const pre=element('pre','source-pre'),code=element('code');paint(code,raw,hint,budget);pre.tabIndex=0;pre.append(code);root.append(pre);}
function diffTable(parsed,view,hint,budget){
 const table=element('table','source-diff-table '+(view==='split'?'source-split':'source-unified'));
 const caption=element('caption','source-caption',view==='split'?words().old+' / '+words().next:words().unified);table.append(caption);
 const tbody=document.createElement('tbody');table.append(tbody);
 const number=(tr,n)=>{const cell=element('td','source-number',n==null?'':String(n));cell.setAttribute('aria-hidden','true');tr.append(cell);};
 const content=(tr,row,empty=false)=>{
  const cell=element('td','source-line'+(row?' source-'+row.kind:' source-empty'));
  const sign=element('span','source-sign',row?.kind==='added'?'+':row?.kind==='removed'?'-':' ');sign.setAttribute('aria-hidden','true');
  const code=element('code');if(row&&!empty)paint(code,row.text,hint||row.file?.language,budget);cell.append(sign,code);tr.append(cell);
 };
 const meta=row=>{const tr=element('tr','source-'+row.kind),cell=element('td','',row.text);cell.colSpan=view==='split'?4:3;tr.append(cell);tbody.append(tr);};
 if(view==='split')for(const row of splitRows(parsed.rows)){
  if(row.meta){meta(row.meta);continue;}
  const tr=document.createElement('tr');number(tr,row.left?.old);content(tr,row.left);number(tr,row.right?.next);content(tr,row.right);tbody.append(tr);
 }else for(const row of parsed.rows){
  if(!['context','removed','added'].includes(row.kind)){meta(row);continue;}
  const tr=element('tr','source-'+row.kind);number(tr,row.old);number(tr,row.next);content(tr,row);tbody.append(tr);
 }
 return table;
}
let preferredView='unified';
function display(root,view){
 const raw=decode(root.dataset.sourceRaw),hint=root.dataset.sourceLanguage||'',kind=root.dataset.sourceKind,body=root.querySelector('.source-content'),status=root.querySelector('.source-status');
 const budget={left:65536};body.replaceChildren();status.textContent='';
 if(kind==='diff'&&view!=='source'){
  const parsed=parseDiff(raw);
  if(parsed.valid){if(parsed.fragment)status.textContent=words().fragment;const scroll=element('div','source-scroll');scroll.tabIndex=0;scroll.append(diffTable(parsed,view,hint,budget));body.append(scroll);}
  else{status.textContent=words().fallback;view='source';sourceView(body,raw,'',budget);}
 }else{
  sourceView(body,raw,kind==='diff'?'':hint,budget);
  if(kind==='code'&&(bytes(raw)>LIMITS.highlight||raw.split(/\r\n|\n|\r/).some(line=>line.length>LIMITS.line)))status.textContent=words().plain;
 }
 root.dataset.sourceView=view;
 for(const b of root.querySelectorAll('[data-source-view]'))b.setAttribute('aria-pressed',String(b.dataset.sourceView===view));
}
function create(options){
 const raw=String(options.text??''),hint=language(options.language),kind=options.kind==='diff'||['diff','patch'].includes(hint)||options.detectDiff&&/^(?:diff --git |--- )/.test(raw)?'diff':'code';
 const root=element('section','source-block source-'+kind);root.dataset.sourceRaw=encode(raw);root.dataset.sourceLanguage=kind==='diff'&&hint==='diff'?'':hint;root.dataset.sourceKind=kind;
 const header=element('div','source-toolbar'),title=element(options.title?'h4':'strong','source-title',options.title||(kind==='diff'?words().diff:hint||words().code));header.append(title);
 for(const view of kind==='diff'?['unified','split','source']:[]){const button=element('button','source-button',words()[view]);button.type='button';button.dataset.sourceView=view;header.append(button);}
 const copy=element('button','source-button',words().copy);copy.type='button';copy.dataset.sourceCopy='true';header.append(copy);
 const status=element('p','source-status');status.setAttribute('role','status');const body=element('div','source-content');root.append(header,status,body);
 display(root,kind==='diff'?preferredView:'source');return root;
}
function prepare(container){
 for(const node of container.querySelectorAll('[class]')){
  if(node.tagName==='CODE'&&node.parentElement?.tagName==='PRE'){
   const match=/(?:^|\s)language-([^\s]+)/.exec(node.getAttribute('class')||'');if(match)node.dataset.sourceLanguage=language(match[1]);
  }
  node.removeAttribute('class');
 }
 return container;
}
function enhance(container){
 let count=0;for(const code of [...container.querySelectorAll('pre > code')]){
  if(code.closest('.source-block')||++count>LIMITS.blocks)continue;
  code.parentElement.replaceWith(create({text:code.textContent,language:code.dataset.sourceLanguage||''}));
 }return container;
}
if(typeof document!=='undefined')document.addEventListener('click',async event=>{
 const button=event.target.closest?.('button[data-source-view],button[data-source-copy]'),root=button?.closest('.source-block');if(!root)return;
 if(button.dataset.sourceView){preferredView=button.dataset.sourceView;display(root,preferredView);return;}
 try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(decode(root.dataset.sourceRaw));root.querySelector('.source-status').textContent=words().copied;}
 catch{display(root,'source');root.querySelector('.source-status').textContent=words().unavailable;}
});
module.exports={LIMITS,language,filenameLanguage,parseDiff,splitRows,create,prepare,enhance};
