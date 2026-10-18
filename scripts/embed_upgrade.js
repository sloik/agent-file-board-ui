"use strict";
// Embed trusted canonical metadata and the browser adapter; no runtime downloads.
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),file=path.join(root,"board.html");
const sourceArg=process.argv.indexOf("--source");
const canonical=sourceArg<0?path.join(root,"vendor/agent-file-board"):path.resolve(process.argv[sourceArg+1]);
const data=JSON.parse(fs.readFileSync(path.join(canonical,"upgrade-manifest.json"),"utf8"));
for(const row of data.files){
  const content=fs.readFileSync(path.join(canonical,".agent-board",row.path));
  if(content.toString("base64")!==row.content) throw Error("Canonical upgrade data stale: "+row.path);
}
const start="/* BEGIN BUNDLED BOARD UPGRADE */",end="/* END BUNDLED BOARD UPGRADE */";
const block=start+'\nconst UPGRADE_DATA=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob("'+Buffer.from(JSON.stringify(data)).toString("base64")+'"),c=>c.charCodeAt(0))));\n'+fs.readFileSync(path.join(root,"scripts/board-upgrade.js"),"utf8")+end;
const old=fs.readFileSync(file,"utf8");
const next=old.includes(start)?old.slice(0,old.indexOf(start))+block+old.slice(old.indexOf(end)+end.length):old.replace('/* ===== wiring ===== */',()=>block+'\n\n/* ===== wiring ===== */');
if(process.argv.includes("--check")){
  if(next!==old){console.error("Embedded upgrade data differs. Run npm run embed:upgrade.");process.exit(1);}
}else fs.writeFileSync(file,next);
