'use strict';
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild'),root=path.resolve(__dirname,'..'),file=path.join(root,'board.html');
const result=esbuild.buildSync({entryPoints:[path.join(__dirname,'signing-contract.js')],bundle:true,write:false,format:'iife',globalName:'SigningContract',target:'es2022',minify:true,legalComments:'inline'});
const start='/* BEGIN BUNDLED SIGNING CONTRACT */',end='/* END BUNDLED SIGNING CONTRACT */',content=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'),block=start+'\n'+content+'\n'+end,old=fs.readFileSync(file,'utf8');
const next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('/* BEGIN BUNDLED OFFLINE TOOLS */',block+'\n\n/* BEGIN BUNDLED OFFLINE TOOLS */');
if(process.argv.includes('--check')){if(old!==next){console.error('Signing contract differs. Run node scripts/embed_signing.js');process.exit(1);}}else fs.writeFileSync(file,next);
