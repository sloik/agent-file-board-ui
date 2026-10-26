"use strict";
// Keep the downloadable viewer self-contained. Never fetch libraries at runtime.
const fs=require("node:fs"),path=require("node:path"),esbuild=require('esbuild');
const root=path.resolve(__dirname,".."), file=path.join(root,"board.html");
const start="<!-- BEGIN BUNDLED RICH LIBRARIES -->",end="<!-- END BUNDLED RICH LIBRARIES -->";
const libs=["dompurify/dist/purify.min.js","marked/lib/marked.umd.js"];
const shared=esbuild.buildSync({entryPoints:[path.join(root,'scripts/source-presentation.js')],bundle:true,write:false,minify:true,format:'iife',globalName:'BoardSourcePresentation',target:['es2022'],legalComments:'inline'}).outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const block=start+"\n"+libs.map(rel=>{
  const source=fs.readFileSync(path.join(root,"node_modules",rel),"utf8").replace(/^\/\/# sourceMappingURL=.*$/gm,"").replace(/<\/script/gi,"<\\/script");
  return "<script>\n"+source+"\n</script>";
}).join("\n")+'\n<style>\n'+fs.readFileSync(path.join(root,'scripts/source-presentation.css'),'utf8')+'\n</style>\n<script>\n'+shared+'\n</script>\n'+end;
const old=fs.readFileSync(file,"utf8");
const next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('<script>\n"use strict";',block+'\n<script>\n"use strict";');
if(process.argv.includes("--check")){
  if(old!==next){console.error("Embedded rich libraries differ from pinned dependencies. Run npm run embed:rich.");process.exit(1);}
}else fs.writeFileSync(file,next);
