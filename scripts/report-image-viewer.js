// Enlarged view for report images that already passed validation. Local DOM only:
// no network, storage, board writes or message access; opens a native modal dialog.
const owners=new WeakMap(),dialogs=new WeakMap();
let view=null;
// A report modal is portaled out of its message; link it back so its images join the same gallery.
export function registerReportDialog(dialog,section){owners.set(dialog,section);dialogs.set(section,dialog);}
function reportRoot(el){
  let node=el;
  for(;;){const dialog=node.closest('dialog.report-modal'),owner=dialog&&owners.get(dialog);if(!owner) break;node=owner;}
  return node.closest('.board-report');
}
function collect(root){
  const out=[];
  for(const el of root.querySelectorAll('[data-report-image],.report-modal-trigger')){
    if(el.hasAttribute('data-report-image')) out.push(el);
    else{const dialog=dialogs.get(el);if(dialog) out.push(...dialog.querySelectorAll('[data-report-image]'));}
  }
  return out;
}
function make(tag,className,text){const el=document.createElement(tag);el.className=className;if(text!==undefined) el.textContent=text;return el;}
export function closeImageViewer(restore=true){
  if(!view) return;
  const current=view;view=null;
  if(current.dialog.open) current.dialog.close();
  current.dialog.remove();
  if(restore && current.origin.isConnected) current.origin.focus();
}
// An image leaving the page (route change, decode failure) must not leave a stale viewer behind.
export function detachImageViewer(button){if(view && button && view.buttons.includes(button)) closeImageViewer(false);}
export function openImageViewer(origin,words){
  closeImageViewer(false);
  const root=reportRoot(origin),buttons=root?collect(root):[origin];
  if(!buttons.includes(origin)) buttons.push(origin);
  let index=buttons.indexOf(origin);
  const dialog=make('dialog','report-image-viewer'),panel=make('div','report-image-panel'),bar=make('div','report-image-bar');
  const title=make('h4','report-image-title'),closeButton=make('button','report-image-close',words.close);
  closeButton.type='button';bar.append(title,closeButton);
  const figure=make('figure','report-image-stage'),img=make('img','report-image-large'),caption=make('figcaption','report-image-caption'),alt=make('p','report-image-alt');
  img.decoding='async';img.addEventListener('load',()=>img.style.setProperty('--nw',String(img.naturalWidth)));
  caption.append(alt);figure.append(img,caption);
  const nav=make('div','report-image-nav'),previous=make('button','',words.previous),next=make('button','',words.next),counter=make('span','report-image-counter');
  previous.type=next.type='button';counter.setAttribute('aria-live','polite');nav.append(previous,counter,next);nav.hidden=buttons.length<2;
  panel.append(bar,figure,nav);dialog.append(panel);dialog.setAttribute('aria-label',words.imageViewer);
  const draw=()=>{
    const button=buttons[index],source=button.querySelector('img'),text=button.dataset.imageCaption||'';
    img.alt=source.alt;img.src=source.currentSrc||source.src;
    title.textContent=button.dataset.imageTitle||source.alt;title.hidden=!title.textContent;
    alt.textContent=text?text+' — '+source.alt:source.alt;
    counter.textContent=(index+1)+' / '+buttons.length;
  };
  const go=step=>{if(buttons.length<2) return;index=(index+step+buttons.length)%buttons.length;draw();};
  closeButton.addEventListener('click',()=>closeImageViewer());
  previous.addEventListener('click',()=>go(-1));next.addEventListener('click',()=>go(1));
  dialog.addEventListener('click',e=>{if(e.target===dialog) closeImageViewer();});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeImageViewer();});
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeImageViewer();}
    else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(e.key==='ArrowLeft'?-1:1);}
    else if(e.key==='Tab'){
      const list=[...dialog.querySelectorAll('button')].filter(b=>!b.disabled && b.getClientRects().length),first=list[0],last=list[list.length-1];
      if(!list.includes(document.activeElement) || (e.shiftKey && document.activeElement===first)){e.preventDefault();(e.shiftKey?last:first).focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  let startX=null,startY=0;
  panel.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){startX=e.clientX;startY=e.clientY;}});
  panel.addEventListener('pointercancel',()=>{startX=null;});
  panel.addEventListener('pointerup',e=>{
    if(startX===null) return;
    const dx=e.clientX-startX,dy=e.clientY-startY;startX=null;
    if(Math.abs(dx)>=40 && Math.abs(dx)>Math.abs(dy)*1.5) go(dx<0?1:-1);
  });
  view={dialog,origin,buttons};
  draw();document.body.append(dialog);dialog.showModal();closeButton.focus();
}
