'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),file=path.join(root,'board.html');
const start='/* BEGIN BUNDLED FORM TRANSPORT */',end='/* END BUNDLED FORM TRANSPORT */',block=start+'\n'+fs.readFileSync(path.join(root,'scripts/answer-state.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'scripts/form-board.js'),'utf8')+end;
const old=fs.readFileSync(file,'utf8'),next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('/* ===== wiring ===== */',()=>block+'\n\n/* ===== wiring ===== */');
if(process.argv.includes('--check')){if(next!==old){console.error('Embedded form transport differs. Run npm run embed:forms.');process.exit(1);}}else fs.writeFileSync(file,next);
