'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),file=path.join(root,'board.html');
const examples=[['report-v1','report','report.json'],['report-v2','report','static-dashboard.json'],['report-v3','report','static-candidates.json'],['form-v2','form','form-question.json'],['form-v3','form','workflow-question.json']].map(([id,kind,name])=>({id,kind,value:JSON.parse(fs.readFileSync(path.join(root,'vendor/agent-file-board/examples/openui-report',name),'utf8'))}));
const start='/* BEGIN BUNDLED OFFLINE TOOLS */',end='/* END BUNDLED OFFLINE TOOLS */';
let content='const AUTHORING_EXAMPLES='+JSON.stringify(examples)+';\n'+['answer-review.js','authoring.js','draft-manager.js','authoring-drafts.js','form-builder.js'].map(name=>fs.readFileSync(path.join(__dirname,name),'utf8')).join('\n');
content=content.replace(/<\/script/gi,'<\\/script').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const old=fs.readFileSync(file,'utf8'),block=start+'\n'+content+'\n'+end,next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('/* ===== wiring ===== */',()=>block+'\n\n/* ===== wiring ===== */');
if(process.argv.includes('--check')){if(next!==old){console.error('Offline tools differ. Run npm run embed:tools.');process.exit(1);}}else fs.writeFileSync(file,next);
