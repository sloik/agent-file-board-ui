// Data-only board-report v2 contract. Keep parity with canonical static_reports.py.
function validateStaticReport(report,version=2,extra=null){
  const require=(ok,message)=>{if(!ok) throw Error('UI v2: '+message);};
  const keys=(o,names)=>o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join(',')===names.split(' ').sort().join(',');
  const text=(v,n=200,multi=false)=>typeof v==='string' && !!v.trim() && [...v].length<=n && !(multi?/[\u0000-\u0008\u000b-\u001f\u007f\uD800-\uDFFF]/u:/[\u0000-\u001f\u007f\uD800-\uDFFF]/u).test(v);
  const strings=(a,n=200,max=50)=>Array.isArray(a) && a.length>=1 && a.length<=max && a.every(v=>text(v,n));
  const values=(a,n)=>Array.isArray(a) && a.length===n && a.every(v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1e12);
  const tones=['info','success','warning','danger'];
  require(keys(report,'library version title components') && report.library==='board-report' && report.version===version && text(report.title),'invalid report');
  let count=0;
  function children(items,depth){
    require(Array.isArray(items) && items.length>=1 && items.length<=16,'requires 1–16 children');
    for(const item of items) node(item,depth);
  }
  function node(c,depth){
    require(++count<=64 && depth<=4,'maximum 64 nodes and nesting depth 4');
    require(c && text(c.title),'invalid component title');
    const kind=c.type;
    require(typeof kind==='string','invalid component type');
    if(kind==='table'){
      require(keys(c,'type title columns rows') && strings(c.columns,200,8) && Array.isArray(c.rows) && c.rows.length>=1 && c.rows.length<=50 && c.rows.every(r=>strings(r,1000,8) && r.length===c.columns.length),'invalid table');
    }else if(kind==='bar-chart'){
      require(keys(c,'type title labels values') && strings(c.labels) && values(c.values,c.labels.length),'invalid bars');
    }else if(['line-chart','area-chart','grouped-bar-chart','stacked-bar-chart'].includes(kind)){
      require(keys(c,'type title labels series') && strings(c.labels) && Array.isArray(c.series) && c.series.length>=1 && c.series.length<=6,'invalid chart');
      require(c.series.every(s=>keys(s,'name values') && text(s.name) && values(s.values,c.labels.length)),'invalid chart series');
      require(new Set(c.series.map(s=>s.name)).size===c.series.length,'duplicate series name');
    }else if(kind==='metric'){
      require((keys(c,'type title value') || keys(c,'type title value detail')) && text(c.value) && (c.detail===undefined || text(c.detail,1000)),'invalid metric');
    }else if(['text','code-block','callout'].includes(kind)){
      const field=kind==='code-block'?'code':'text';
      require(keys(c,'type title '+field+(kind==='callout'?' tone':'')) && text(c[field],4000,kind==='code-block'),'invalid content');
      if(kind==='callout') require(tones.includes(c.tone),'invalid callout tone');
    }else if(kind==='tag'){
      require(keys(c,'type title tone') && tones.includes(c.tone),'invalid tag');
    }else if(kind==='separator'){
      require(keys(c,'type title'),'invalid separator');
    }else if(kind==='list'){
      require(keys(c,'type title items') && strings(c.items,1000),'invalid list');
    }else if(['card','stack'].includes(kind)){
      require(keys(c,'type title children'+(kind==='stack'?' direction':'')),'invalid container');
      if(kind==='stack') require(['row','column'].includes(c.direction),'invalid stack direction');
      children(c.children,depth+1);
    }else if(['tabs','accordion'].includes(kind)){
      require(keys(c,'type title items') && Array.isArray(c.items) && c.items.length>=1 && c.items.length<=8,'invalid sections');
      const ids=new Set();
      for(const item of c.items){
        require(keys(item,'id title children') && text(item.title) && typeof item.id==='string' && /^[a-z][a-z0-9-]{0,63}$/.test(item.id) && !ids.has(item.id),'invalid/duplicate section ID');
        ids.add(item.id);children(item.children,depth+1);
      }
    }else if(kind==='steps'){
      require(keys(c,'type title items') && Array.isArray(c.items) && c.items.length>=1 && c.items.length<=16,'invalid steps');
      for(const item of c.items) require(keys(item,'title text state') && text(item.title) && text(item.text,1000) && ['pending','current','complete'].includes(item.state),'invalid step');
    }else if(extra) extra(c,depth,children);
    else throw Error('UI v2: unknown component '+kind);
  }
  children(report.components,1);
  return report;
}
