'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {options,checkState}=require('../scripts/check_live_updates');
test('live checker accepts a downloaded application root and exact stable API version',()=>{
 assert.deepEqual(options(['--root','downloaded-viewer','--expected-version','2.11.4']),{root:'downloaded-viewer','expected-version':'2.11.4'});
 checkState({lastSuccess:1,latest:{status:'ok',version:'2.11.4'}},'2.11.4');
});
test('live checker refuses API disagreement, stale failures and invalid expected versions',()=>{
 for(const version of ['2.11.4-rc1','02.11.4','v2.11.4','2.11'])assert.throws(()=>options(['--expected-version',version]));
 assert.throws(()=>checkState({lastSuccess:1,latest:{status:'ok',version:'2.11.3'}},'2.11.4'));
 assert.throws(()=>checkState({lastSuccess:0,latest:{status:'ok',version:'2.11.4'}},'2.11.4'));
 assert.throws(()=>checkState({lastSuccess:1,latest:{status:'unavailable',version:'2.11.4'}},'2.11.4'));
});
