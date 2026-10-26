// Offline adapters for the pinned OpenUI catalogue. All inputs are validated data.
import React, {useContext,useId,useState,useRef,useLayoutEffect} from 'react';
import {defineComponent,useRenderNode} from '@openuidev/react-lang';
import {z} from 'zod/v4';
import {ReportLabels} from './report-labels.js';
export {ReportLabels,DEFAULT_REPORT_LABELS} from './report-labels.js';
import {extendedComponents,extendedProgram} from './extended-static-components.jsx';


export function ReportTable({title,columns,rows,interactive=false}){
  const labels=useContext(ReportLabels);
  const [filter,setFilter]=useState(''),[sort,setSort]=useState(null);
  const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
  const visible=rows.filter(row=>row.some(cell=>cell.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))).map((row,index)=>({row,index}));
  if(sort) visible.sort((a,b)=>collator.compare(a.row[sort.column],b.row[sort.column])*sort.direction || a.index-b.index);
  return <section className="report-table"><h4>{title}</h4>{interactive && <label className="report-filter">{labels.filter} <input type="search" value={filter} onChange={e=>setFilter(e.target.value)} /><span>{visible.length} / {rows.length}</span></label>}
    <div className="report-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr>{columns.map((c,i)=><th key={i} scope="col" aria-sort={!interactive?undefined:sort?.column===i?(sort.direction===1?'ascending':'descending'):'none'}>{interactive?<button type="button" onClick={()=>setSort({column:i,direction:sort?.column===i?-sort.direction:1})}>{c}<span aria-hidden="true"> {sort?.column===i?(sort.direction===1?'↑':'↓'):'↕'}</span></button>:c}</th>)}</tr></thead><tbody>{visible.map(({row,index})=><tr key={index}>{row.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div></section>;
}

function SeriesPlot({title,labels,series,kind}){
  const words=useContext(ReportLabels);
  const stacked=kind==='stacked-bar-chart',bars=stacked || kind==='grouped-bar-chart';
  const extents=labels.flatMap((_,i)=>stacked?[series.reduce((n,s)=>n+Math.max(0,s.values[i]),0),series.reduce((n,s)=>n+Math.min(0,s.values[i]),0)]:series.map(s=>s.values[i]));
  const min=Math.min(0,...extents),max=Math.max(0,...extents),range=max-min || 1;
  const y=v=>200-(v-min)/range*170,step=550/labels.length,x=i=>55+(i+.5)*step;
  const ticks=[...new Set([min,0,max])],labelIndices=[...new Set([0,Math.floor((labels.length-1)/2),labels.length-1])];
  const positives=labels.map(()=>0),negatives=labels.map(()=>0);
  return <section className="report-series-chart" data-chart-kind={kind}><h4>{title}</h4><ul className="report-legend">{series.map((s,i)=><li key={s.name}><span className={'report-swatch series-'+i}/>{s.name}</li>)}</ul>
    <div className="report-plot" tabIndex={0} role="region" aria-label={title}><svg viewBox="0 0 640 240" role="img" aria-label={title}>
      {ticks.map(v=><g key={v}><line x1="55" x2="605" y1={y(v)} y2={y(v)} className="report-gridline"/><text x="50" y={y(v)+4} textAnchor="end">{new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(v)}</text></g>)}
      {series.map((s,j)=>{
        const points=s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
        return <g key={s.name} className={'series-'+j}>{bars?s.values.map((v,i)=>{
          const start=stacked?(v>=0?positives[i]:negatives[i]):0;
          if(stacked){if(v>=0) positives[i]+=v;else negatives[i]+=v;}
          const width=step*.75/(stacked?1:series.length),left=x(i)-step*.375+(stacked?0:j*width);
          return <rect key={i} x={left} y={Math.min(y(start),y(start+v))} width={width*.92} height={Math.abs(y(start+v)-y(start))}><title>{labels[i]}: {s.name} = {v}</title></rect>;
        }):<>{kind==='area-chart' && <polygon className="report-area" points={`${x(0)},${y(0)} ${points} ${x(labels.length-1)},${y(0)}`}/>}<polyline points={points} fill="none" strokeWidth="2.5"/>{s.values.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="3"><title>{labels[i]}: {s.name} = {v}</title></circle>)}</>}</g>;
      })}
      {labelIndices.map(i=><text key={i} x={x(i)} y="225" textAnchor="middle">{labels[i].length>20?labels[i].slice(0,19)+'…':labels[i]}</text>)}
    </svg></div>
    <details className="report-chart-data"><summary>{words.chartData}</summary><div className="report-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr><th scope="col">{words.label}</th>{series.map(s=><th scope="col" key={s.name}>{s.name}</th>)}</tr></thead><tbody>{labels.map((label,i)=><tr key={i}><th scope="row">{label}</th>{series.map(s=><td key={s.name}>{s.values[i]}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}

function Sections({title,items,accordion=false}){
  const render=useRenderNode(),prefix=useId(),[active,setActive]=useState(items[0].id);
  return <section className={accordion?'report-accordion':'report-tabs'}><h4>{title}</h4>{accordion?items.map(item=><details key={item.id}><summary>{item.title}</summary><div>{render(item.children)}</div></details>):<>
    <div role="tablist" aria-label={title}>{items.map((item,i)=><button key={item.id} type="button" id={prefix+'-tab-'+item.id} role="tab" aria-selected={active===item.id} aria-controls={prefix+'-panel-'+item.id} tabIndex={active===item.id?0:-1} onClick={()=>setActive(item.id)} onKeyDown={e=>{
      const n=e.key==='ArrowRight'?(i+1)%items.length:e.key==='ArrowLeft'?(i+items.length-1)%items.length:e.key==='Home'?0:e.key==='End'?items.length-1:-1;
      if(n>=0){e.preventDefault();setActive(items[n].id);e.currentTarget.parentNode.children[n].focus();}
    }}>{item.title}</button>)}</div>
    {items.map(item=><div key={item.id} role="tabpanel" tabIndex={0} id={prefix+'-panel-'+item.id} aria-labelledby={prefix+'-tab-'+item.id} hidden={active!==item.id}>{render(item.children)}</div>)}
  </>}</section>;
}

function SourceCode({title,code}){
 const ref=useRef(null),labels=useContext(ReportLabels);
 useLayoutEffect(()=>{
  const node=window.BoardSourcePresentation.create({title,text:code,language:window.BoardSourcePresentation.filenameLanguage(title),detectDiff:true});
  node.querySelector('pre')?.classList.add('report-code');ref.current.replaceChildren(node);
 },[title,code,labels]);
 return <div ref={ref}/>;
}

export function staticComponents(Table,BarChart){
  const component=(name,props,renderer)=>defineComponent({name,description:'Offline board report '+name,props:z.object(props),component:renderer});
  const title=z.string(),content=z.string();
  const Metric=component('Metric',{title,value:content,detail:content.optional()},({props:p})=><section className="report-metric"><h4>{p.title}</h4><strong>{p.value}</strong>{p.detail && <p>{p.detail}</p>}</section>);
  const Callout=component('Callout',{title,text:content,tone:content},({props:p})=><section className={'report-callout tone-'+p.tone}><h4>{p.title}</h4><p>{p.text}</p></section>);
  const Tag=component('Tag',{title,tone:content},({props:p})=><span className={'report-tag tone-'+p.tone}>{p.title}</span>);
  const Text=component('ReportText',{title,text:content},({props:p})=><section><h4>{p.title}</h4><p>{p.text}</p></section>);
  const Code=component('CodeBlock',{title,code:content},({props:p})=><SourceCode {...p}/>);
  const List=component('ReportList',{title,items:z.array(content)},({props:p})=><section><h4>{p.title}</h4><ul>{p.items.map((v,i)=><li key={i}>{v}</li>)}</ul></section>);
  const Separator=component('Separator',{title},({props:p})=><hr aria-label={p.title}/>);
  const Chart=component('SeriesChart',{title,labels:z.array(content),series:z.array(z.object({name:content,values:z.array(z.number())})),kind:content},({props:p})=><SeriesPlot {...p}/>);
  let all;
  const nodes=z.array(z.lazy(()=>z.union(all.map(c=>c.ref))));
  const Card=component('ReportCard',{title,children:nodes},({props:p})=>{const render=useRenderNode();return <section className="report-card"><h4>{p.title}</h4>{render(p.children)}</section>;});
  const Stack=component('ReportStack',{title,direction:content,children:nodes},({props:p})=>{const render=useRenderNode();return <section><h4>{p.title}</h4><div className={'report-stack '+p.direction}>{render(p.children)}</div></section>;});
  const sections={title,items:z.array(z.object({id:content,title,children:nodes}))};
  const Tabs=component('ReportTabs',sections,({props:p})=><Sections {...p}/>);
  const Accordion=component('ReportAccordion',sections,({props:p})=><Sections {...p} accordion/>);
  const Steps=component('ReportSteps',{title,items:z.array(z.object({title,text:content,state:content}))},({props:p})=>{const words=useContext(ReportLabels);return <section><h4>{p.title}</h4><ol className="report-steps">{p.items.map((item,i)=><li key={i} data-state={item.state}><span className="report-step-state">{words[item.state]}</span><strong>{item.title}</strong><p>{item.text}</p></li>)}</ol></section>;});
  all=[Table,BarChart,Metric,Callout,Tag,Text,Code,List,Separator,Chart,Card,Stack,Tabs,Accordion,Steps];
  all.push(...extendedComponents(component,nodes));
  return {components:all,nodes};
}

const quote=v=>JSON.stringify(v).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function componentProgram(c,version){
  const call=(name,...args)=>`${name}(${args.map(quote).join(', ')})`;
  const children=items=>'['+items.map(n=>componentProgram(n,version)).join(', ')+']';
  switch(c.type){
    case 'table':return call('Table',c.title,c.columns,c.rows,version>=2);
    case 'bar-chart':return call('BarChart',c.title,c.labels,c.values);
    case 'metric':return call('Metric',c.title,c.value,...(c.detail===undefined?[]:[c.detail]));
    case 'callout':return call('Callout',c.title,c.text,c.tone);
    case 'tag':return call('Tag',c.title,c.tone);
    case 'text':return call('ReportText',c.title,c.text);
    case 'code-block':return call('CodeBlock',c.title,c.code);
    case 'list':return call('ReportList',c.title,c.items);
    case 'separator':return call('Separator',c.title);
    case 'steps':return call('ReportSteps',c.title,c.items);
    case 'card':return `ReportCard(${quote(c.title)}, ${children(c.children)})`;
    case 'stack':return `ReportStack(${quote(c.title)}, ${quote(c.direction)}, ${children(c.children)})`;
    case 'tabs':case 'accordion':return `Report${c.type==='tabs'?'Tabs':'Accordion'}(${quote(c.title)}, [${c.items.map(i=>`{id:${quote(i.id)},title:${quote(i.title)},children:${children(i.children)}}`).join(', ')}])`;
    case 'line-chart':case 'area-chart':case 'grouped-bar-chart':case 'stacked-bar-chart':return call('SeriesChart',c.title,c.labels,c.series,c.type);
    default:return extendedProgram(c,children);
  }
}
