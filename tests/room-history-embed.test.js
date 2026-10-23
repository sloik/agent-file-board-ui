'use strict';
// The Missing-message check is bundled into board.html; the embed must match its sources.
const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path');
test('embedded room history matches its sources and is self-contained',()=>{
 const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/embed_history.js'),'--check'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
