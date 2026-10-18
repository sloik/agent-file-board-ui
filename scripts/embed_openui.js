"use strict";
// Build pinned production assets into the standalone file, without a CDN.
const fs=require("node:fs"),path=require("node:path"),esbuild=require("esbuild");
const root=path.resolve(__dirname,".."),file=path.join(root,"board.html");
const start="<!-- BEGIN BUNDLED OPENUI REPORTS -->",end="<!-- END BUNDLED OPENUI REPORTS -->";
const result=esbuild.buildSync({entryPoints:[path.join(__dirname,"openui-report.jsx")],bundle:true,write:false,minify:true,format:"iife",target:["es2022"],legalComments:"inline",define:{"process.env.NODE_ENV":'"production"'},metafile:true});
let source=result.outputFiles[0].text;
// This renderer has no navigation or tool components. Upstream retains unused
// prompt-generation copy in the runtime graph. Keep its examples offline, too.
// Match complete known copy, never network API identifiers or arbitrary URLs:
// the unchanged source/resource guard must still reject future network code.
for(const [from,to,count] of [
  ['@OpenUrl("https://example.com")','@OpenUrl("about:blank")',2],
  ['re-fetch a Query','reload a Query',1],
  ['before fetch resolves','before loading resolves',1]
]){
  if(source.split(from).length-1!==count) throw Error("Review upstream offline prompt copy before updating OpenUI: "+from);
  source=source.split(from).join(to);
}
source=source.replace(/<\/script/gi,"<\\/script").replace(/^[ \t]+$/gm,"");
const validation=fs.readFileSync(path.join(root,"scripts/static-report-validation.js"),"utf8");
const block=start+"\n<script>\n"+validation+"\n"+source+"\n</script>\n"+end;
const old=fs.readFileSync(file,"utf8");
const next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('<!-- END BUNDLED RICH LIBRARIES -->',()=> '<!-- END BUNDLED RICH LIBRARIES -->\n'+block);
if(process.argv.includes("--check")){
  if(old!==next){console.error("Embedded OpenUI differs from pinned source. Run npm run embed:openui.");process.exit(1);}
}else{
  fs.writeFileSync(file,next);
  console.log(`Embedded OpenUI report renderer: ${Buffer.byteLength(source)} bytes`);
}
