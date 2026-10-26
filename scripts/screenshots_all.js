'use strict';
// Stop on a failed capture rather than leaving a partially refreshed gallery unnoticed.
const {spawnSync}=require('node:child_process');
for(const name of ['screenshots','screenshot_openui','screenshot_static_openui','screenshot_static_candidates','screenshot_forms','screenshot_workflows','screenshot_tools','screenshot_demo','screenshot_locations','screenshot_themes','screenshot_panels','screenshot_toolbar','screenshot_upgrade','screenshot_features','screenshot_signing']){
 console.log(`Capturing ${name}`);
 const result=spawnSync(process.execPath,[require('node:path').join(__dirname,name+'.js')],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
