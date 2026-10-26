// Static SVG plots with complete embedded data tables; no third-party chart runtime.
import React,{useContext} from 'react';
import {ReportLabels} from './report-labels.js';
const fmt=v=>new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1}).format(v);
const theta=i=>i*Math.PI*2-Math.PI/2;
const xy=(angle,r,cx=180,cy=125)=>[cx+Math.cos(angle)*r,cy+Math.sin(angle)*r];
function DataTable({columns,rows}){
 const words=useContext(ReportLabels);
 return <details className="report-chart-data"><summary>{words.chartData}</summary><div className="report-scroll" tabIndex={0} role="region" aria-label={words.chartData}><table><thead><tr>{columns.map((c,i)=><th scope="col" key={i}>{c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div></details>;
}
function Legend({names}){return <ul className="report-legend">{names.map((name,i)=><li key={i}><span className={'report-swatch series-'+(i%6)}/>{name}</li>)}</ul>;}
function Parts({data:c}){
 const words=useContext(ReportLabels),total=c.values.reduce((a,b)=>a+b,0),max=Math.max(1,...c.values);
 let start=0;
 return <>
  {c.type==='radial-chart'?<svg viewBox="0 0 640 280" role="img" aria-label={c.title}>{c.labels.map((label,i)=>{
   const radius=108-i*(84/Math.max(1,c.labels.length)),circ=2*Math.PI*radius,ratio=c.values[i]/max;
   return <g key={i}><circle cx="180" cy="135" r={radius} className="report-radial-track" fill="none" strokeWidth={Math.max(1,60/c.labels.length)}/><circle cx="180" cy="135" r={radius} className={'report-radial-value series-'+(i%6)} fill="none" strokeWidth={Math.max(1,60/c.labels.length)} strokeDasharray={`${ratio*circ} ${circ}`} transform="rotate(-90 180 135)"><title>{label}: {c.values[i]}</title></circle></g>;
  })}</svg>:c.type==='single-stacked-bar-chart'?<svg viewBox="0 0 640 95" role="img" aria-label={c.title}>{c.values.map((v,i)=>{const x=20+(total?start/total*600:0),w=total?v/total*600:0;start+=v;return <rect key={i} x={x} y="15" width={w} height="50" className={'series-'+(i%6)}><title>{c.labels[i]}: {v}</title></rect>;})}{!total && <text x="20" y="45">{words.noData}</text>}</svg>:<svg viewBox="0 0 640 280" role="img" aria-label={c.title}>{c.values.map((v,i)=>{
   const ratio=total?v/total:0,angle=theta(start/(total||1)),end=theta((start+v)/(total||1)),a=xy(angle,105),b=xy(end,105);start+=v;
   if(!ratio) return null;
   return c.variant==='donut'?<circle key={i} cx="180" cy="125" r="82" fill="none" strokeWidth="42" strokeDasharray={`${ratio*2*Math.PI*82} ${2*Math.PI*82}`} strokeDashoffset={-(start-v)/(total||1)*2*Math.PI*82} transform="rotate(-90 180 125)" className={'report-ring series-'+(i%6)}><title>{c.labels[i]}: {v}</title></circle>:ratio===1?<circle key={i} cx="180" cy="125" r="105" className={'series-'+(i%6)}><title>{c.labels[i]}: {v}</title></circle>:<path key={i} d={`M180,125 L${a.join(',')} A105,105 0 ${ratio>.5?1:0},1 ${b.join(',')} Z`} className={'series-'+(i%6)}><title>{c.labels[i]}: {v}</title></path>;
  })}{!total && <text x="75" y="125">{words.noData}</text>}</svg>}
  <Legend names={c.labels}/><DataTable columns={[words.label,words.value]} rows={c.labels.map((label,i)=>[label,c.values[i]])}/>
 </>;
}
function Radar({data:c}){
 const words=useContext(ReportLabels);
 const maximum=Math.max(1,...c.series.flatMap(s=>s.values)),position=(i,v)=>xy(theta(i/c.labels.length),v/maximum*93,300,135);
 return <><svg viewBox="0 0 640 280" role="img" aria-label={c.title}>
  {[.25,.5,.75,1].map(n=><polygon key={n} className="report-radar-grid" points={c.labels.map((_,i)=>position(i,maximum*n).join(',')).join(' ')}/>)}
  {c.labels.map((label,i)=>{const p=position(i,maximum),t=xy(theta(i/c.labels.length),116,300,135);return <g key={i}><line x1="300" y1="135" x2={p[0]} y2={p[1]} className="report-gridline"/><text x={t[0]} y={t[1]} textAnchor="middle">{label.length>20?label.slice(0,19)+'…':label}</text></g>;})}
  {c.series.map((s,j)=><g key={j} className={'series-'+j}><polygon className="report-radar-shape" points={s.values.map((v,i)=>position(i,v).join(',')).join(' ')}/>{s.values.map((v,i)=>{const p=position(i,v);return <circle key={i} cx={p[0]} cy={p[1]} r="3"><title>{c.labels[i]}: {s.name} = {v}</title></circle>;})}</g>)}
  <text x="570" y="20" textAnchor="end">{fmt(maximum)}</text>
 </svg><Legend names={c.series.map(s=>s.name)}/><DataTable columns={[words.label,...c.series.map(s=>s.name)]} rows={c.labels.map((label,i)=>[label,...c.series.map(s=>s.values[i])])}/></>;
}
function Scatter({data:c}){
 const words=useContext(ReportLabels);
 const points=c.datasets.flatMap(s=>s.points),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
 const maxZ=Math.max(1,...points.map(p=>p.z||0));
 const x=v=>minX===maxX?330:60+(v-minX)/(maxX-minX)*530,y=v=>minY===maxY?125:215-(v-minY)/(maxY-minY)*180;
 return <><svg viewBox="0 0 640 280" role="img" aria-label={c.title}>
  <line x1="60" x2="590" y1="215" y2="215" className="report-gridline"/><line x1="60" x2="60" y1="35" y2="215" className="report-gridline"/>
  <text x="60" y="234">{fmt(minX)}</text><text x="590" y="234" textAnchor="end">{fmt(maxX)}</text><text x="53" y="215" textAnchor="end">{fmt(minY)}</text><text x="53" y="35" textAnchor="end">{fmt(maxY)}</text>
  <text x="325" y="260" textAnchor="middle">{c.xLabel}</text><text transform="translate(16 125) rotate(-90)" textAnchor="middle">{c.yLabel}</text>
  {c.datasets.map((s,j)=><g key={j} className={'series-'+j}>{s.points.map((p,i)=><circle key={i} cx={x(p.x)} cy={y(p.y)} r={p.z===undefined?4:3+Math.sqrt(p.z/maxZ)*9}><title>{s.name}: {c.xLabel} = {p.x}, {c.yLabel} = {p.y}{p.z===undefined?'':`, z = ${p.z}`}</title></circle>)}</g>)}
 </svg><Legend names={c.datasets.map(s=>s.name)}/><DataTable columns={[words.series,c.xLabel,c.yLabel,'z']} rows={c.datasets.flatMap(s=>s.points.map(p=>[s.name,p.x,p.y,p.z===undefined?'—':p.z]))}/></>;
}
export function SpecialtyChart({data}){return <section className="report-series-chart report-specialty" data-chart-kind={data.type}><h4>{data.title}</h4><div className="report-plot" tabIndex={0} role="region" aria-label={data.title}>{data.type==='scatter-chart'?<Scatter data={data}/>:data.type==='radar-chart'?<Radar data={data}/>:<Parts data={data}/>}</div></section>;}
