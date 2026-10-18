// Pinned offline board-report v1/v2 adapters. No tools or network actions.
import React from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {Renderer, defineComponent, createLibrary, useRenderNode} from "@openuidev/react-lang";
import {z} from "zod/v4";
import {ReportLabels,ReportTable,staticComponents,componentProgram} from "./static-components.jsx";

const Table=defineComponent({
  name:"Table", description:"A completed report table with plain text cells",
  props:z.object({title:z.string(),columns:z.array(z.string()),rows:z.array(z.array(z.string())),interactive:z.boolean().optional()}),
  component:({props:p})=><ReportTable {...p}/>
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
const catalogue=staticComponents(Table,BarChart);
const Report=defineComponent({
  name:"Report",description:"A completed Agent File Board report",
  props:z.object({title:z.string(),children:catalogue.nodes}),
  component:({props:p})=>{const render=useRenderNode();return <div className="report-content"><h3>{p.title}</h3>{p.children.map((child,i)=><React.Fragment key={i}>{render(child)}</React.Fragment>)}</div>;}
});
const library=createLibrary({components:[Report,...catalogue.components],root:"Report"});
const quote=v=>JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function program(report){
  const children=report.components.map(c=>componentProgram(c,report.version));
  return `root = Report(${quote(report.title)}, [${children.join(", ")}])`;
}
class Boundary extends React.Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.fail();}
  render(){return this.state.failed?null:this.props.children;}
}
window.BoardReportRenderer={
  mount(element,report,onFailure,labels){
    const root=createRoot(element), fail=()=>onFailure();
    let previous;
    const draw=words=>{
      const signature=JSON.stringify(words);
      if(signature===previous && previous!==undefined) return;
      previous=signature;
      flushSync(()=>root.render(<ReportLabels.Provider value={words || {filter:'Filter rows',chartData:'Chart data',label:'Label',pending:'Pending',current:'Current',complete:'Complete'}}><Boundary fail={fail}><Renderer response={program(report)} library={library} isStreaming={false} onError={errors=>{if(errors.length) fail();}} /></Boundary></ReportLabels.Provider>));
    };
    try{draw(labels);}catch(error){root.unmount();throw error;}
    const dispose=()=>root.unmount();
    dispose.updateLabels=draw;
    return dispose;
  }
};
