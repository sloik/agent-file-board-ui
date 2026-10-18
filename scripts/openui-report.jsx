// The only OpenUI library allowed in board-report v1. No tools or actions.
import React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {Renderer, defineComponent, createLibrary, useRenderNode} from "@openuidev/react-lang";
import {z} from "zod/v4";

const Table=defineComponent({
  name:"Table", description:"A completed report table with plain text cells",
  props:z.object({title:z.string(),columns:z.array(z.string()),rows:z.array(z.array(z.string()))}),
  component:({props:p})=><section className="report-table"><h4>{p.title}</h4><div className="report-scroll" tabIndex={0} role="region" aria-label={p.title}><table><thead><tr>{p.columns.map((c,i)=><th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{p.rows.map((row,i)=><tr key={i}>{row.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div></section>
});
const BarChart=defineComponent({
  name:"BarChart",description:"A signed bar chart with visible numeric labels",
  props:z.object({title:z.string(),labels:z.array(z.string()),values:z.array(z.number())}),
  component:({props:p})=>{
    const max=Math.max(1,...p.values.map(Math.abs)), negative=p.values.some(v=>v<0);
    return <section className="report-chart"><h4>{p.title}</h4><ul aria-label={p.title}>{p.labels.map((label,i)=><li key={i}>
      <span className="report-label">{label}</span><span className={"report-track"+(negative?" signed":"")} aria-hidden="true"><span className="report-bar" style={{width:`${Math.abs(p.values[i])/max*(negative?50:100)}%`,left:negative?(p.values[i]<0?`${50-Math.abs(p.values[i])/max*50}%`:"50%"):"0"}} /></span><span className="report-value">{p.values[i]}</span>
    </li>)}</ul></section>;
  }
});
const Report=defineComponent({
  name:"Report",description:"A completed Agent File Board report",
  props:z.object({title:z.string(),children:z.array(z.union([Table.ref,BarChart.ref]))}),
  component:({props:p})=>{const render=useRenderNode();return <div className="report-content"><h3>{p.title}</h3>{p.children.map((child,i)=><React.Fragment key={i}>{render(child)}</React.Fragment>)}</div>;}
});
const library=createLibrary({components:[Report,Table,BarChart],root:"Report"});
const quote=v=>JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function program(report){
  const children=report.components.map(c=>c.type==="table"?`Table(${quote(c.title)}, ${quote(c.columns)}, ${quote(c.rows)})`:`BarChart(${quote(c.title)}, ${quote(c.labels)}, ${quote(c.values)})`);
  return `root = Report(${quote(report.title)}, [${children.join(", ")}])`;
}
class Boundary extends React.Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.fail();}
  render(){return this.state.failed?null:this.props.children;}
}
window.BoardReportRenderer={
  mount(element,report,onFailure){
    const root=createRoot(element), fail=()=>onFailure();
    try{
      flushSync(()=>root.render(<Boundary fail={fail}><Renderer response={program(report)} library={library} isStreaming={false} onError={errors=>{if(errors.length) fail();}} /></Boundary>));
    }catch(error){root.unmount();throw error;}
    return ()=>root.unmount();
  }
};
