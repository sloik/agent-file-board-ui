'use strict';
// SPEC-002-071 AC10: every image a guide or the README shows exists, and every signing capture the
// screenshot script declares is used by a guide.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const h=require('./lib/helpers');
const {SHOTS}=require('../scripts/screenshot_signing');
const guides=h.fs.readdirSync(h.path.join(h.ROOT,'docs/guides')).filter(n=>n.endsWith('.md')).map(n=>h.path.join(h.ROOT,'docs/guides',n));
const docs=[...guides,h.path.join(h.ROOT,'README.md')];
// Markdown images and links to image files, and HTML <img src>; external URLs are not files here.
function images(file){
  const text=h.fs.readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,''),found=[];
  for(const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g))if(/\.(png|svg|jpe?g|gif|webp)(#.*)?$/i.test(m[1]))found.push(m[1]);
  for(const m of text.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi))found.push(m[1]);
  return found.filter(src=>!/^[a-z]+:/i.test(src)).map(src=>decodeURI(src.replace(/#.*$/,'')));
}

test('every image referenced by docs/guides/*.md and README.md exists',()=>{
  let count=0;
  for(const file of docs)for(const src of images(file)){
    count++;
    const target=h.path.resolve(h.path.dirname(file),src);
    assert.ok(h.fs.existsSync(target)&&h.fs.statSync(target).isFile(),`${h.path.relative(h.ROOT,file)} shows ${src}, which does not exist`);
  }
  assert.ok(count>50,'the guides were scanned');
});

test('every signing capture the screenshot script declares is shown by a guide',()=>{
  const shown=new Set(guides.flatMap(file=>images(file).map(src=>h.path.basename(src))));
  assert.ok(SHOTS.length>=14);
  for(const name of SHOTS)assert.ok(shown.has(name+'.png'),`${name}.png is referenced by a guide`);
  for(const name of SHOTS)assert.ok(h.fs.existsSync(h.path.join(h.ROOT,'docs/images',name+'.png')),`${name}.png exists`);
});

test('the guide quotes the exact request text that Copy what to send them produces',()=>{
  const c=vm.createContext({SigningContract:{Provider:class{}},exText:en=>en,B:{cfg:{project:{id:'team-board'}}}});
  vm.runInContext(h.fs.readFileSync(h.path.join(h.ROOT,'scripts/signing-ui.js'),'utf8')+';this.request=signingReviewRequest;',c);
  const expected=c.request({name:'Maya',id:'maya',board:'Team board',boardId:'0b6c2f4e-8d1a-4c57-9a63-2f1e5d7c9b10',fingerprint:'urn:ietf:params:oauth:jwk-thumbprint:sha-256:k7JiOo0Fsaj3XlqBrf_66p-MRiltMTxk8PF_J9PSx5c'});
  const doc=h.fs.readFileSync(h.path.join(h.ROOT,'docs/guides/signing.md'),'utf8').replace(/\s+/g,' ');
  assert.ok(doc.includes(expected),'docs/guides/signing.md quotes the current request text');
});
