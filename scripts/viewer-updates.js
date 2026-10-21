/* Public release metadata only. The parent and custom workers keep connect-src 'none'. */
const ViewerUpdates=(()=>{
  const endpoint='https://sloik.github.io/agent-file-board-ui/update-check.html';
  const releases='https://github.com/sloik/agent-file-board-ui/releases';
  const day=86400000;
  const version=v=>typeof v==='string'&&/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(v)?v.split('.').map(Number):null;
  function newer(a,b){const x=version(a),y=version(b);if(!x||!y)return false;for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
  const due=(last,now)=>!Number.isFinite(last)||last<=0||last>now||now-last>=day;
  function valid(m,channel){
    if(!m||typeof m!=='object'||Array.isArray(m)||m.protocol!==1||m.channel!==channel)return false;
    let size;try{size=JSON.stringify(m).length;}catch{return false;}if(size>4096)return false;
    const keys=Object.keys(m).sort().join(',');
    if(m.status==='error')return keys==='channel,protocol,status';
    return keys==='channel,packageAvailable,protocol,releaseId,status,version'&&m.status==='ok'&&!!version(m.version)&&Number.isSafeInteger(m.releaseId)&&m.releaseId>0&&typeof m.packageAvailable==='boolean';
  }
  function stored(raw){
    const s=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},out={};
    if(typeof s.auto==='boolean')out.auto=s.auto;
    for(const key of ['lastAttempt','lastSuccess'])if(Number.isSafeInteger(s[key])&&s[key]>0&&s[key]<=8640000000000000)out[key]=s[key];
    if(s.latest?.status==='ok'&&valid(s.latest,s.latest.channel))out.latest=s.latest;
    return out;
  }
  function links(v){if(!version(v))throw Error('Invalid release version');return {release:releases+'/tag/v'+v,package:releases+'/download/v'+v+'/agent-file-board-viewer.zip'};}
  function request(win,timeout=12000){
    let cancel=()=>{};
    const promise=new Promise((resolve,reject)=>{
      const origin=new URL(endpoint).origin;
      if(win.location.origin===origin){reject(Error('Use the offline viewer to check updates.'));return;}
      const channel=win.crypto.randomUUID(),frame=win.document.createElement('iframe');
      frame.hidden=true;frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.referrerPolicy='no-referrer';frame.title='Public viewer release check';
      let timer,finished=false;
      const finish=(error,value)=>{if(finished)return;finished=true;win.clearTimeout(timer);win.removeEventListener('message',receive);win.removeEventListener('pagehide',cancel);frame.remove();error?reject(error):resolve(value);};
      cancel=()=>finish(Error('Update check cancelled'));
      const receive=e=>{if(e.origin!==origin||e.source!==frame.contentWindow||!valid(e.data,channel))return;finish(e.data.status==='ok'?null:Error('Latest release unknown'),e.data);};
      win.addEventListener('message',receive);win.addEventListener('pagehide',cancel,{once:true});timer=win.setTimeout(()=>finish(Error('Latest release unknown: checker unavailable')),timeout);
      frame.src=endpoint+'#'+channel;win.document.body.append(frame);
    });
    return {promise,cancel};
  }
  return {endpoint,releases,day,version,newer,due,valid,stored,links,request};
})();
if(typeof module!=='undefined')module.exports=ViewerUpdates;
