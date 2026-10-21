/* Deliberately receives no board context. Only anonymous public release metadata. */
(async()=>{
  const channel=location.hash.slice(1);
  if(!/^[a-f0-9-]{36}$/.test(channel)||parent===window)return;
  const result={protocol:1,channel,status:'error'};
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),10000);
  try{
    const response=await fetch('https://api.github.com/repos/sloik/agent-file-board-ui/releases/latest',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:control.signal});
    if(!response.ok)throw Error('Release unavailable');
    const reader=response.body.getReader();let size=0,chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('Release too large');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const r=JSON.parse(new TextDecoder().decode(bytes));
    if(!/^v(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(r.tag_name)||!Number.isSafeInteger(r.id)||r.id<=0||r.draft!==false||r.prerelease!==false||r.html_url!=='https://github.com/sloik/agent-file-board-ui/releases/tag/'+r.tag_name||!Array.isArray(r.assets)||r.assets.length>100)throw Error('Invalid release');
    Object.assign(result,{status:'ok',version:r.tag_name.slice(1),releaseId:r.id,packageAvailable:r.assets.some(a=>a.name==='agent-file-board-viewer.zip'&&a.state==='uploaded'&&a.browser_download_url==='https://github.com/sloik/agent-file-board-ui/releases/download/'+r.tag_name+'/agent-file-board-viewer.zip')});
  }catch{}finally{clearTimeout(timer);parent.postMessage(result,'*');}
})();
