// Version3 resource and shape rules; keep parity with extended_static_reports.py.
function staticPngPixels(value){
  const require=ok=>{if(!ok) throw Error('UI v3: invalid embedded PNG (64KiB, 1024px maximum)');};
  require(typeof value==='string' && value.startsWith('data:image/png;base64,'));
  const encoded=value.slice(22);
  require(encoded.length>=1 && encoded.length<=87384 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded));
  let binary;try{binary=atob(encoded);}catch(e){require(false);}
  require(btoa(binary)===encoded && binary.length<=65536);
  const data=Uint8Array.from(binary,c=>c.charCodeAt(0)),view=new DataView(data.buffer);
  require(data.length>=8 && [137,80,78,71,13,10,26,10].every((v,i)=>data[i]===v));
  const crc=(start,end)=>{let n=0xffffffff;for(let i=start;i<end;i++){n^=data[i];for(let j=0;j<8;j++) n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
  let pos=8,pixels=0,idat=false,idatClosed=false,idatBytes=0,palette=false,color=0,bits=0;
  while(pos<data.length){
    require(pos+12<=data.length);
    const size=view.getUint32(pos),kind=String.fromCharCode(...data.slice(pos+4,pos+8)),end=pos+12+size;
    require(end<=data.length && /^[A-Za-z]{4}$/.test(kind) && /^[A-Z]$/.test(kind[2]));
    require(crc(pos+4,end-4)===view.getUint32(end-4));
    require(!['acTL','fcTL','fdAT'].includes(kind) && (kind.charCodeAt(0)>=97 || ['IHDR','PLTE','IDAT','IEND'].includes(kind)));
    if(pos===8){
      require(kind==='IHDR' && size===13);
      const width=view.getUint32(pos+8),height=view.getUint32(pos+12);bits=data[pos+16];color=data[pos+17];
      require(width>=1 && width<=1024 && height>=1 && height<=1024);
      require(({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]}[color]||[]).includes(bits) && data[pos+18]===0 && data[pos+19]===0 && [0,1].includes(data[pos+20]));
      pixels=width*height;
    }else require(kind!=='IHDR');
    if(kind==='PLTE'){require(!palette && !idat && ![0,4].includes(color) && size%3===0 && size>=3 && size<=768);if(color===3) require(size/3<=2**bits);palette=true;}
    if(kind==='IDAT'){require(!idatClosed && (color!==3 || palette));idat=true;idatBytes+=size;}else if(idat) idatClosed=true;
    if(kind==='IEND'){require(size===0 && idat && idatBytes>0 && end===data.length);return pixels;}
    pos=end;
  }
  require(false);
}
function staticV3Extension(){
  const require=(ok,msg)=>{if(!ok) throw Error('UI v3: '+msg);};
  const keys=(o,names,optional='')=>o && typeof o==='object' && !Array.isArray(o) && names.split(' ').every(k=>Object.hasOwn(o,k)) && Object.keys(o).every(k=>(names+' '+optional).split(' ').includes(k));
  const text=(v,n=200,multi=false)=>typeof v==='string' && !!v.trim() && [...v].length<=n && !(multi?/[\u0000-\u0008\u000b-\u001f\u007f\uD800-\uDFFF]/u:/[\u0000-\u001f\u007f\uD800-\uDFFF]/u).test(v);
  const number=v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1e12;
  const strings=a=>Array.isArray(a) && a.length>=1 && a.length<=50 && a.every(v=>text(v));
  const numbers=(a,n,positive=false)=>Array.isArray(a) && a.length===n && a.every(v=>number(v) && (!positive || v>=0));
  const icons=['info','check','warning','error','star','heart','file','folder','chart','image','clock','user'],tones=['info','success','warning','danger'];
  let pixels=0,modalDepth=0;
  function image(obj){
    require(keys(obj,'src alt','caption') && text(obj.alt) && (obj.caption===undefined || text(obj.caption,1000)),'invalid image description');
    pixels+=staticPngPixels(obj.src);require(pixels<=4194304,'total image pixels exceed 4194304');
  }
  return function(c,depth,children){
    const kind=c.type;
    if(['pie-chart','radial-chart','single-stacked-bar-chart'].includes(kind)){
      require(keys(c,'type title labels values'+(kind==='pie-chart'?' variant':'')) && strings(c.labels) && numbers(c.values,c.labels.length,true),'invalid nonnegative chart');
      if(kind==='pie-chart') require(['pie','donut'].includes(c.variant),'invalid pie variant');
    }else if(kind==='radar-chart'){
      require(keys(c,'type title labels series') && strings(c.labels) && c.labels.length>=3 && Array.isArray(c.series) && c.series.length>=1 && c.series.length<=6,'invalid radar');
      require(c.series.every(s=>keys(s,'name values') && text(s.name) && numbers(s.values,c.labels.length,true)),'invalid radar series');
      require(new Set(c.series.map(s=>s.name)).size===c.series.length,'duplicate radar series');
    }else if(kind==='scatter-chart'){
      require(keys(c,'type title xLabel yLabel datasets') && text(c.xLabel) && text(c.yLabel) && Array.isArray(c.datasets) && c.datasets.length>=1 && c.datasets.length<=6,'invalid scatter');
      for(const s of c.datasets){require(keys(s,'name points') && text(s.name) && Array.isArray(s.points) && s.points.length>=1 && s.points.length<=50,'invalid scatter dataset');require(s.points.every(p=>keys(p,'x y','z') && number(p.x) && number(p.y) && (p.z===undefined || (number(p.z) && p.z>=0))),'invalid scatter point');}
      require(new Set(c.datasets.map(s=>s.name)).size===c.datasets.length,'duplicate scatter series');
    }else if(['icon','icon-text'].includes(kind)){
      require(keys(c,'type title name'+(kind==='icon-text'?' text':'')) && icons.includes(c.name),'invalid icon');
      if(kind==='icon-text') require(text(c.text,1000),'invalid icon text');
    }else if(kind==='metric-comparison'){
      require(keys(c,'type title value previous','detail') && text(c.value) && text(c.previous) && (c.detail===undefined || text(c.detail,1000)),'invalid metric comparison');
    }else if(kind==='tag-block'){
      require(keys(c,'type title items') && Array.isArray(c.items) && c.items.length>=1 && c.items.length<=32 && c.items.every(i=>keys(i,'text tone') && text(i.text) && tones.includes(i.tone)),'invalid tag block');
    }else if(kind==='markdown'){
      require(keys(c,'type title text') && text(c.text,4000,true),'invalid Markdown');
    }else if(kind==='image'){
      require(keys(c,'type title src alt','caption'),'invalid image');
      image(Object.fromEntries(Object.entries(c).filter(([k])=>!['type','title'].includes(k))));
    }else if(kind==='image-text'){
      require(keys(c,'type title src alt text size') && text(c.text,1000) && ['small','large'].includes(c.size),'invalid image text');image({src:c.src,alt:c.alt});
    }else if(kind==='image-gallery'){
      require(keys(c,'type title images') && Array.isArray(c.images) && c.images.length>=1 && c.images.length<=8,'invalid image gallery');c.images.forEach(image);
    }else if(kind==='card-grid'){
      require(keys(c,'type title variant children') && ['snippet','context','composite','visual'].includes(c.variant),'invalid card grid');
      require(Array.isArray(c.children) && c.children.every(n=>n && n.type==='card'),'card grid requires cards');
      if(c.variant==='visual') require(c.children.every(n=>Array.isArray(n.children) && n.children[0]?.type==='image'),'visual cards require leading image');
      children(c.children,depth+1);
    }else if(kind==='carousel'){
      require(keys(c,'type title items') && Array.isArray(c.items) && c.items.length>=1 && c.items.length<=8,'invalid carousel');
      const ids=new Set();for(const i of c.items){require(keys(i,'id title children') && text(i.title) && typeof i.id==='string' && /^[a-z][a-z0-9-]{0,63}$/.test(i.id) && !ids.has(i.id),'invalid carousel item');ids.add(i.id);children(i.children,depth+1);}
    }else if(kind==='modal'){
      require(keys(c,'type title children') && modalDepth===0,'invalid or nested modal');modalDepth++;try{children(c.children,depth+1);}finally{modalDepth--;}
    }else throw Error('UI v3: unknown component '+kind);
  };
}
