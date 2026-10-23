'use strict';
// Loads the browser room-history core next to the signing contract, exactly as the
// viewer bundles them, inside one disposable VM context.
const path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),esbuild=require('esbuild');
const bundle=(entry,globalName)=>esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../../scripts/'+entry)],bundle:true,write:false,format:'iife',globalName,target:'es2022'}).outputFiles[0].text;
const signing=bundle('signing-contract.js','SigningContract'),history=bundle('room-history.js','RoomHistory');
function load(){
 const subtle={};
 for(const name of ['digest','importKey','sign'])subtle[name]=crypto.webcrypto.subtle[name].bind(crypto.webcrypto.subtle);
 const sandbox={crypto:{subtle,getRandomValues:crypto.webcrypto.getRandomValues.bind(crypto.webcrypto)},performance:{now:()=>0},TextEncoder,TextDecoder,Uint8Array,btoa,atob,console};
 vm.createContext(sandbox);vm.runInContext(signing,sandbox);vm.runInContext(history,sandbox);
 return {C:sandbox.SigningContract,H:sandbox.RoomHistory,sandbox};
}
module.exports={load,sources:{signing,history}};
