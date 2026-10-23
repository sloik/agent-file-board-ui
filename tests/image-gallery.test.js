"use strict";
// SPEC-002-057: every report image opens an enlarged viewer that browses all images of the message.
const {test,before,after}=require("node:test"),assert=require("node:assert/strict");
const h=require("./lib/helpers");
let browser;
before(async()=>{browser=await h.launch();});after(async()=>{await browser.close();});
const AT=new Date("2026-10-18T10:30:00Z"),FILE="2026-10-18_1230_implementation-agent-01_T004_report.txt";
const CANDIDATES=JSON.parse(h.fs.readFileSync(h.path.join(h.VENDOR,"examples/openui-report/static-candidates.json"),"utf8"));
const SRC=CANDIDATES.components.find(c=>c.type==="image").src;
const img=(title,alt,caption)=>({type:"image",title,src:SRC,alt,...(caption?{caption}:{})});
// One report whose eight images use every image-bearing component, including a hidden carousel panel and a modal.
function galleryUi(){
  const pick=type=>structuredClone(CANDIDATES.components.find(c=>c.type===type&&(type!=="card-grid"||c.variant==="visual")));
  const carousel=pick("carousel"),modal=pick("modal");
  carousel.items[1].children.push(img("Hidden slide","Carousel hidden image"));
  modal.children.push(img("Modal evidence","Modal image","Inside the modal"));
  return {library:"board-report",version:3,title:"Gallery report",components:[pick("image"),pick("image-gallery"),pick("image-text"),pick("card-grid"),carousel,modal]};
}
// Test oracle independent of the DOM: images in document order, with the modal at its trigger position.
function expectedAlts(node,out=[]){
  if(Array.isArray(node)) node.forEach(n=>expectedAlts(n,out));
  else if(node&&typeof node==="object"){
    if(node.type==="image"||node.type==="image-text") out.push(node.alt);
    if(node.type==="image-gallery") node.images.forEach(i=>out.push(i.alt));
    expectedAlts(node.children||node.items||[],out);
  }
  return out;
}
function message(ui){
  return `FROM: implementation-agent-01\nTO: human-owner-01\nSCOPE: ROOM\nROOM: reports\nTHREAD: T004-release\nDATE: 2026-10-18 12:30\nLANGUAGE: en\nREPLY-TO: -\nSTATUS: INFO\nUI: ${JSON.stringify(ui)}\n---\nImages for review.\n`;
}
async function boot({ui=galleryUi(),upload=false,viewport}={}){
  const tmp=h.tmpDir(),proj=h.layoutExample(tmp),dir=h.path.join(proj,".agent-board/rooms/reports");h.fs.mkdirSync(dir);
  h.fs.writeFileSync(h.path.join(dir,FILE),message(ui));
  const session=await h.openPage(browser,{tree:upload?undefined:h.readTree(proj),clock:AT});
  await session.page.clock.pauseAt(new Date("2026-10-18T10:30:01Z"));
  if(viewport) await session.page.setViewportSize(viewport);
  if(upload) await session.page.setInputFiles("#fallback",proj);else await h.openBoardViaUi(session.page);
  await session.page.waitForSelector(`article[data-file='${FILE}'] button[data-report-image]`);
  return {...session,tmp,proj};
}
const article=page=>page.locator(`article[data-file='${FILE}']`);
const viewer=page=>page.locator("dialog.report-image-viewer");
const shown=async page=>[await viewer(page).locator(".report-image-large").getAttribute("alt"),(await viewer(page).locator(".report-image-counter").textContent())];
const active=page=>page.evaluate(()=>document.activeElement?.getAttribute("aria-label")||document.activeElement?.textContent);
async function clean(session){
  const {ctx,page,log}=session;
  assert.equal(log.requests.filter(url=>!url.startsWith("file:")).length,0);assert.deepEqual(log.pageErrors,[]);assert.deepEqual(log.consoleErrors,[]);
  await ctx.close();
}

test("mouse opens an enlarged, sensibly sized view; buttons wrap around; counter, close button, backdrop and Escape work; focus returns",async()=>{
  const s=await boot(),{page}=s,alts=expectedAlts(galleryUi().components);
  assert.equal(alts.length,8);
  const before=await page.evaluate(()=>window.__fakefs.dump());
  const origin=article(page).locator("button[data-report-image]").nth(1);   // second image of the gallery
  await origin.click();await viewer(page).waitFor({state:"visible"});
  assert.deepEqual(await shown(page),[alts[1],"2 / 8"]);
  assert.equal(await viewer(page).evaluate(el=>el.open&&el.matches(":modal")),true);
  assert.match(await viewer(page).locator(".report-image-title").textContent(),/Two embedded variations/);
  const size=await viewer(page).locator(".report-image-large").evaluate(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height,nw:el.naturalWidth,vw:innerWidth,vh:innerHeight}));
  assert.equal(size.nw,240);assert.ok(size.w>240&&size.w<=480.5,`enlarged but capped at 2x: ${size.w}`);assert.ok(size.w<=size.vw&&size.h<=size.vh);
  await viewer(page).getByRole("button",{name:"Next",exact:true}).click();assert.deepEqual(await shown(page),[alts[2],"3 / 8"]);
  await viewer(page).getByRole("button",{name:"Previous",exact:true}).click();await viewer(page).getByRole("button",{name:"Previous",exact:true}).click();
  assert.deepEqual(await shown(page),[alts[0],"1 / 8"]);
  await viewer(page).getByRole("button",{name:"Previous",exact:true}).click();assert.deepEqual(await shown(page),[alts[7],"8 / 8"],"previous wraps to the last image");
  await viewer(page).getByRole("button",{name:"Next",exact:true}).click();assert.deepEqual(await shown(page),[alts[0],"1 / 8"],"next wraps to the first image");
  await page.keyboard.press("ArrowRight");assert.deepEqual(await shown(page),[alts[1],"2 / 8"]);
  await page.keyboard.press("ArrowLeft");await page.keyboard.press("ArrowLeft");assert.deepEqual(await shown(page),[alts[7],"8 / 8"]);
  // Close button: focus returns to the image that opened the viewer, not the one last shown.
  await viewer(page).getByRole("button",{name:"Close",exact:true}).click();await viewer(page).waitFor({state:"detached"});
  assert.equal(await origin.evaluate(el=>el===document.activeElement),true);
  await origin.click();await viewer(page).waitFor({state:"visible"});await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  assert.equal(await origin.evaluate(el=>el===document.activeElement),true);
  await origin.click();await viewer(page).waitFor({state:"visible"});await page.mouse.click(4,4);await viewer(page).waitFor({state:"detached"});
  assert.equal(await origin.evaluate(el=>el===document.activeElement),true);
  // Clicking inside the panel must not close it.
  await origin.click();await viewer(page).locator(".report-image-large").click();assert.equal(await viewer(page).isVisible(),true);await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(()=>window.__fakefs.dump()),before,"viewing changes no board file");
  await clean(s);
});

test("keyboard opens with Enter and Space, keeps focus inside while open and returns it on close",async()=>{
  const s=await boot(),{page}=s,buttons=article(page).locator("button[data-report-image]");
  await buttons.first().focus();await page.keyboard.press("Enter");await viewer(page).waitFor({state:"visible"});
  assert.equal(await page.evaluate(()=>document.activeElement.className),"report-image-close");
  const seen=new Set();
  for(let i=0;i<8;i++){await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>!!document.activeElement.closest("dialog.report-image-viewer")),true);seen.add(await active(page));}
  for(let i=0;i<8;i++){await page.keyboard.press("Shift+Tab");assert.equal(await page.evaluate(()=>!!document.activeElement.closest("dialog.report-image-viewer")),true);}
  assert.deepEqual([...seen].sort(),["Close","Next","Previous"]);
  await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  assert.equal(await buttons.first().evaluate(el=>el===document.activeElement),true);
  await buttons.nth(3).focus();await page.keyboard.press("Space");await viewer(page).waitFor({state:"visible"});
  assert.equal((await shown(page))[1],"4 / 8");await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  assert.equal(await buttons.nth(3).evaluate(el=>el===document.activeElement),true);
  await clean(s);
});

test("image-text, visual card, carousel and modal images join one gallery in document order",async()=>{
  const s=await boot(),{page}=s,alts=expectedAlts(galleryUi().components),report=article(page);
  const domOrder=await report.locator("button[data-report-image]").evaluateAll(list=>list.map(b=>b.querySelector("img").alt));
  assert.deepEqual(domOrder,alts.slice(0,7),"seven images in the message, the eighth lives in the modal");
  // image-text (index 3)
  await report.locator(".report-image-text button[data-report-image]").click();assert.deepEqual(await shown(page),[alts[3],"4 / 8"]);await page.keyboard.press("Escape");
  // visual card grid (indices 4 and 5)
  await report.locator(".report-card-grid.visual button[data-report-image]").nth(1).click();assert.deepEqual(await shown(page),[alts[5],"6 / 8"]);await page.keyboard.press("Escape");
  // carousel: the image is in a hidden panel until selected; its own Next control keeps working
  const carousel=report.locator(".report-carousel");
  await carousel.getByRole("button",{name:"Next",exact:true}).click();
  assert.equal(await carousel.locator("[data-carousel-panel=context]").isVisible(),true);
  const slide=carousel.locator("[data-carousel-panel=context] button[data-report-image]");await slide.click();
  assert.deepEqual(await shown(page),[alts[6],"7 / 8"]);await page.keyboard.press("ArrowRight");assert.deepEqual(await shown(page),[alts[7],"8 / 8"],"modal image follows the carousel image");
  await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  assert.equal(await slide.evaluate(el=>el===document.activeElement),true);
  assert.equal(await carousel.locator("[data-carousel-panel=context]").isVisible(),true,"carousel selection unchanged");
  // modal: image opens the viewer above the open modal; closing returns focus to that image and keeps the modal open
  await report.locator(".report-modal-trigger>button").click();const modal=page.locator("dialog.report-modal");await modal.waitFor({state:"visible"});
  const inModal=modal.locator("button[data-report-image]");await inModal.click();
  assert.deepEqual(await shown(page),[alts[7],"8 / 8"]);
  await viewer(page).getByRole("button",{name:"Next",exact:true}).click();assert.deepEqual(await shown(page),[alts[0],"1 / 8"]);
  await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  assert.equal(await modal.evaluate(el=>el.open),true,"Escape closes only the viewer");
  assert.equal(await inModal.evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press("Escape");await modal.waitFor({state:"hidden"});
  // Route change while the viewer is open disposes it like any report portal.
  await report.locator("button[data-report-image]").first().click();await viewer(page).waitFor({state:"visible"});
  await page.evaluate(()=>[...document.querySelectorAll(".fname")].find(el=>el.textContent.includes("product")).click());
  await page.waitForFunction(()=>!document.querySelector("dialog.report-image-viewer"));
  await clean(s);
});

test("a single image shows no navigation or counter and ignores arrow keys",async()=>{
  const ui={library:"board-report",version:3,title:"One image",components:[img("Only picture","The only picture","Caption text")]};
  const s=await boot({ui}),{page}=s;
  await article(page).locator("button[data-report-image]").click();await viewer(page).waitFor({state:"visible"});
  assert.equal(await viewer(page).locator(".report-image-nav").isVisible(),false);
  assert.equal(await viewer(page).getByRole("button",{name:"Next"}).first().isVisible(),false);
  assert.equal(await viewer(page).locator(".report-image-counter").isVisible(),false);
  assert.equal(await viewer(page).locator("button:visible").count(),1);
  const text=await viewer(page).innerText();assert.match(text,/Only picture/);assert.match(text,/Caption text/);assert.match(text,/The only picture/);
  await page.keyboard.press("ArrowRight");await page.keyboard.press("ArrowLeft");assert.equal(await viewer(page).locator(".report-image-large").getAttribute("alt"),"The only picture");
  await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  await clean(s);
});

test("phone width fits the viewport in light and dark, supports swipe, and keeps the page free of horizontal overflow",async()=>{
  const s=await boot({viewport:{width:375,height:700}}),{page}=s,alts=expectedAlts(galleryUi().components);
  const fits=()=>viewer(page).locator(".report-image-panel").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
  await article(page).locator("button[data-report-image]").nth(1).click();await viewer(page).waitFor({state:"visible"});
  const colors=[];
  for(const scheme of ["light","dark"]){
    await page.emulateMedia({colorScheme:scheme});
    assert.equal(await fits(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const name of ["Previous","Next","Close"]) assert.equal(await viewer(page).getByRole("button",{name,exact:true}).isVisible(),true);
    colors.push(await viewer(page).locator(".report-image-panel").evaluate(el=>getComputedStyle(el).backgroundColor));
  }
  assert.notEqual(colors[0],colors[1]);
  const swipe=(from,to,type="touch")=>page.locator("dialog.report-image-viewer .report-image-panel").evaluate((el,[a,b,t])=>{
    const fire=(name,x)=>el.dispatchEvent(new PointerEvent(name,{bubbles:true,pointerType:t,pointerId:7,clientX:x,clientY:300}));
    fire("pointerdown",a);fire("pointerup",b);
  },[from,to,type]);
  await swipe(250,80);assert.deepEqual(await shown(page),[alts[2],"3 / 8"],"swipe left shows the next image");
  await swipe(80,250);assert.deepEqual(await shown(page),[alts[1],"2 / 8"],"swipe right shows the previous image");
  await swipe(200,190);assert.deepEqual(await shown(page),[alts[1],"2 / 8"],"short movement is a tap, not a swipe");
  await swipe(250,80,"mouse");assert.deepEqual(await shown(page),[alts[1],"2 / 8"],"mouse drags do not navigate");
  await page.keyboard.press("Escape");
  await clean(s);
});

test("Polish labels in a read-only upload; viewer text follows the language",async()=>{
  const s=await boot({upload:true}),{page}=s;
  await page.click("#gear");await page.selectOption("#sLang","pl");await page.keyboard.press("Escape");
  const first=article(page).locator("button[data-report-image]").first();
  await page.waitForFunction(()=>document.querySelector("button[data-report-image]").getAttribute("aria-label").startsWith("Powiększ obraz"));
  assert.match(await first.getAttribute("aria-label"),/^Powiększ obraz: /);
  await first.click();await viewer(page).waitFor({state:"visible"});
  assert.equal(await viewer(page).getAttribute("aria-label"),"Podgląd obrazu");
  for(const name of ["Poprzedni","Następny","Zamknij"]) assert.equal(await viewer(page).getByRole("button",{name,exact:true}).count(),1);
  await viewer(page).getByRole("button",{name:"Następny",exact:true}).click();assert.equal((await shown(page))[1],"2 / 8");
  await viewer(page).getByRole("button",{name:"Zamknij",exact:true}).click();await viewer(page).waitFor({state:"detached"});
  assert.equal(await first.evaluate(el=>el===document.activeElement),true);
  await clean(s);
});

test("viewer uses theme colors in every theme without layout overflow",async()=>{
  const s=await boot(),{page}=s;
  await article(page).locator("button[data-report-image]").first().click();await viewer(page).waitFor({state:"visible"});await page.keyboard.press("Escape");
  const seen=new Set();
  for(const theme of ["light","dark","dracula"]){
    await page.evaluate(t=>document.documentElement.setAttribute("data-theme",t),theme);
    await article(page).locator("button[data-report-image]").first().click();await viewer(page).waitFor({state:"visible"});
    const style=await viewer(page).locator(".report-image-panel").evaluate(el=>({bg:getComputedStyle(el).backgroundColor,ink:getComputedStyle(el).color}));
    assert.notEqual(style.bg,style.ink);assert.notEqual(style.bg,"rgba(0, 0, 0, 0)");seen.add(style.bg);
    await page.keyboard.press("Escape");await viewer(page).waitFor({state:"detached"});
  }
  assert.ok(seen.size>=2,"theme colors reach the viewer");
  await clean(s);
});
