'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),h=require('./lib/helpers'),{demoFixture,topic}=require('./lib/demo');
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const palette=page=>page.evaluate(()=>{const s=getComputedStyle(document.body),r=getComputedStyle(document.documentElement);return [s.backgroundColor,s.color,r.colorScheme];});
const expected={light:['rgb(244, 245, 247)','rgb(28, 34, 48)','light'],dark:['rgb(17, 20, 24)','rgb(231, 234, 240)','dark'],dracula:['rgb(40, 42, 54)','rgb(248, 248, 242)','dark']};
for(const os of ['light','dark'])test(`explicit themes override ${os} OS; System responds live`,async()=>{
 const {ctx,page,log}=await h.openPage(browser,{colorScheme:os});
 assert.equal(await page.inputValue('#sTheme'),'system');assert.deepEqual(await palette(page),expected[os]);await page.click('#gear');
 for(const theme of ['light','dark','dracula']){
  await page.selectOption('#sTheme',theme);assert.deepEqual(await palette(page),expected[theme]);
  await page.emulateMedia({colorScheme:os==='light'?'dark':'light'});assert.deepEqual(await palette(page),expected[theme]);await page.emulateMedia({colorScheme:os});
 }
 await page.selectOption('#sTheme','system');await page.emulateMedia({colorScheme:os==='light'?'dark':'light'});assert.deepEqual(await palette(page),expected[os==='light'?'dark':'light']);
 assert.deepEqual(log.pageErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);await ctx.close();
});
test('Dracula persists through committed reload and Reset restores System',async()=>{
 const {ctx,page}=await h.openPage(browser,{colorScheme:'light'});await page.click('#gear');await page.selectOption('#sTheme','dracula');
 await h.reloadSettled(ctx,page,{setting:['theme','dracula']});assert.equal(await page.inputValue('#sTheme'),'dracula');assert.deepEqual(await palette(page),expected.dracula);
 await page.click('#gear');await page.click('#sReset');assert.equal(await page.inputValue('#sTheme'),'system');assert.deepEqual(await palette(page),expected.light);
 await h.reloadSettled(ctx,page,{setting:['theme','system']});assert.equal(await page.inputValue('#sTheme'),'system');await ctx.close();
});
test('unknown saved theme normalizes safely without rebuilding',async()=>{
 const {ctx,page}=await h.openPage(browser,{colorScheme:'dark'});
 // Exercise the same saved-settings pipeline with a preference from an unknown future version.
 await page.evaluate(()=>{S.theme='future-theme';saveSettings();});await h.reloadSettled(ctx,page,{setting:['theme','future-theme']});
 assert.equal(await page.inputValue('#sTheme'),'system');assert.deepEqual(await palette(page),expected.dark);await ctx.close();
});
test('packaged reports retain mounted state and composer drafts across every theme; Polish phone fits',async()=>{
 const demo=demoFixture();try{
 const {ctx,page,log}=await h.openPage(browser,{html:demo.html,tree:h.readTree(demo.project),clock:new Date('2026-10-19T12:00:00Z')});try{await h.openBoardViaUi(page);await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
 await topic(page,'T007');await page.getByRole('tab',{name:'Results',exact:true}).click();await page.locator('.report-filter input').fill('Browser');await page.fill('#cBody','Unsent theme draft');const before=await page.evaluate(()=>window.__fakefs.dump());
 await page.evaluate(()=>{window.themeReport=document.querySelector('.report-content');window.themeEditor=document.querySelector('#cBody');window.themeBuilds=window.__boardTest.stats.builds;window.themeEditor.setSelectionRange(3,7);});
 await page.click('#gear');for(const theme of ['light','dark','dracula','system']){
  await page.selectOption('#sTheme',theme);assert.equal(await page.inputValue('#cBody'),'Unsent theme draft');assert.equal(await page.locator('.report-filter input').inputValue(),'Browser');
  assert.equal(await page.evaluate(()=>window.themeReport===document.querySelector('.report-content')&&window.themeEditor===document.querySelector('#cBody')&&window.__boardTest.stats.builds===window.themeBuilds&&window.themeEditor.selectionStart===3&&window.themeEditor.selectionEnd===7),true);
 }
 await page.selectOption('#sTheme','dracula');await page.selectOption('#sLang','pl');await page.setViewportSize({width:375,height:1100});assert.equal(await page.locator('label[for=sTheme]').textContent(),'Motyw kolorystyczny');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#sTheme').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),true);
 assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before);
 await page.setViewportSize({width:1280,height:900});await page.click('#sClose');await page.selectOption('#me','human-owner-01');
 // Explicit respondent selection legitimately starts browser presence; snapshot its completed result before theme-only operations.
 await page.waitForFunction(()=>document.querySelector('#browserPresence').textContent.includes('Aktywna sesja przeglądarki'));
 await page.locator('.tcard[data-tk="room:reports|T011"]').click();
 const owner=page.locator('[data-form-field=owner] input');await owner.fill('Theme-safe form draft');
 const formBefore=await page.evaluate(()=>window.__fakefs.dump());
 await page.evaluate(()=>{window.themeForm=document.querySelector('.typed-form');});await page.click('#gear');
 for(const theme of ['light','dark','dracula','system']){await page.selectOption('#sTheme',theme);assert.equal(await owner.inputValue(),'Theme-safe form draft');assert.equal(await page.evaluate(()=>window.themeForm===document.querySelector('.typed-form')),true);}
 await page.selectOption('#sTheme','dracula');
 const readable=await page.locator('#sTheme').evaluate(el=>{const root=getComputedStyle(document.documentElement),s=getComputedStyle(el);return {muted:root.getPropertyValue('--muted').trim(),accent:root.getPropertyValue('--accent').trim(),buttonText:root.getPropertyValue('--on-accent').trim(),ink:s.color};});
 assert.equal(readable.muted,'#b3bbd8');assert.equal(readable.accent,'#bd93f9');assert.equal(readable.buttonText,'#282a36');assert.equal(readable.ink,'rgb(248, 248, 242)');
 assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),formBefore);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);assert.equal(log.requests.filter(u=>!u.startsWith('file:')).length,0);
 }finally{await ctx.close();}
 }finally{h.fs.rmSync(demo.tmp,{recursive:true,force:true});}
});
