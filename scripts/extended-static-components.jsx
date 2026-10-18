// Remaining pinned static capabilities. Data only; no network/tool/form actions.
import React,{useContext,useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useRenderNode} from '@openuidev/react-lang';
import {z} from 'zod/v4';
import {ReportLabels} from './report-labels.js';
import {SpecialtyChart} from './specialty-charts.jsx';
const ICON_PATHS={info:'M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'M4 12l5 5L20 5',warning:'M12 3 2 21h20L12 3 M12 9v5 M12 17h.01',error:'M5 5l14 14 M19 5 5 19 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',star:'m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z',heart:'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z',file:'M5 2h9l5 5v15H5Z M14 2v6h5 M8 12h8 M8 16h8',folder:'M2 5h8l2 3h10v13H2Z',chart:'M3 2v19h19 M7 16v-5 M12 16V5 M17 16V8',image:'M3 3h18v18H3Z M3 18l6-7 4 4 3-3 5 6 M8 7h.01',clock:'M12 6v6l4 3 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',user:'M8 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M3 22v-3c0-7 18-7 18 0v3'};
function IconGlyph({name}){return <svg className="report-icon-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[name]}/></svg>;}
function ImageFrame({src,alt,caption}){
 const [failed,setFailed]=useState(false),words=useContext(ReportLabels);
 return <figure className="report-image">{failed?<p className="report-image-error">{words.imageFailed}: {alt}</p>:<img src={src} alt={alt} decoding="async" onError={()=>setFailed(true)}/ >}{caption && <figcaption>{caption}</figcaption>}</figure>;
}
function Carousel({title,items}){
 const [index,setIndex]=useState(0),render=useRenderNode(),words=useContext(ReportLabels);
 const move=n=>setIndex((n+items.length)%items.length);
 return <section className="report-carousel"><h4>{title}</h4><div className="report-carousel-controls" tabIndex={0} role="region" aria-label={title} onKeyDown={e=>{
  if(e.target!==e.currentTarget && !e.target.hasAttribute('data-carousel-control')) return;
  const n=e.key==='ArrowLeft'?index-1:e.key==='ArrowRight'?index+1:e.key==='Home'?0:e.key==='End'?items.length-1:null;
  if(n!==null){e.preventDefault();move(n);}
 }}><button type="button" data-carousel-control onClick={()=>move(index-1)} disabled={items.length===1}>{words.previous}</button><span>{index+1} / {items.length}</span><button type="button" data-carousel-control onClick={()=>move(index+1)} disabled={items.length===1}>{words.next}</button></div>
 {items.map((item,i)=><div key={item.id} data-carousel-panel={item.id} hidden={i!==index}><h5>{item.title}</h5>{render(item.children)}</div>)}</section>;
}
function Modal({title,children}){
 const [open,setOpen]=useState(false),dialog=useRef(null),trigger=useRef(null),id=useId(),words=useContext(ReportLabels),render=useRenderNode();
 useEffect(()=>{const el=dialog.current;if(open && !el.open) el.showModal();else if(!open && el.open) el.close();},[open]);
 return <section className="report-modal-trigger"><button ref={trigger} type="button" onClick={()=>setOpen(true)}>{words.open}: {title}</button>{createPortal(<dialog ref={dialog} className="report-modal" aria-labelledby={id} onCancel={()=>setOpen(false)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false);}}} onClose={()=>{setOpen(false);trigger.current?.focus();}}><div className="report-modal-toolbar"><h4 id={id}>{title}</h4><button type="button" autoFocus onClick={()=>setOpen(false)}>{words.close}</button></div><div className="board-report">{render(children)}</div></dialog>,document.body)}</section>;
}
function Markdown({title,text}){
 const raw=window.marked.parse(text,{gfm:true,async:false}),inert=document.createElement('template');inert.innerHTML=raw;
 const html=window.DOMPurify.sanitize(inert.content,{ALLOWED_TAGS:['p','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','table','thead','tbody','tr','th','td','pre','code','strong','em','b','i','s','del','br','hr','kbd','sup','sub'],ALLOWED_ATTR:[],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_TRUSTED_TYPE:false});
 return <section className="report-markdown"><h4>{title}</h4><div dangerouslySetInnerHTML={{__html:html}}/></section>;
}
export function extendedComponents(component,nodes){
 const leaf=(name,render)=>component(name,{data:z.any()},({props:p})=>render(p.data));
 const Plot=leaf('SpecialtyChart',c=><SpecialtyChart data={c}/>);
 const Icon=leaf('StaticIcon',c=><section className={'report-icon-text '+(c.type==='icon'?'icon-only':'')}><IconGlyph name={c.name}/><div><h4>{c.title}</h4>{c.text && <p>{c.text}</p>}</div></section>);
 const Comparison=leaf('MetricComparison',c=>{const words=useContext(ReportLabels);return <section className="report-metric report-metric-comparison"><h4>{c.title}</h4><span className="report-previous">{words.from}: <s>{c.previous}</s></span><strong><span className="sr-only">{words.to}: </span>{c.value}</strong>{c.detail && <p>{c.detail}</p>}</section>;});
 const Tags=leaf('TagBlock',c=><section className="report-tag-block"><h4>{c.title}</h4>{c.items.map((item,i)=><span key={i} className={'report-tag tone-'+item.tone}>{item.text}</span>)}</section>);
 const Image=leaf('StaticImage',c=><section className="report-image-block"><h4>{c.title}</h4><ImageFrame {...c}/></section>);
 const Gallery=leaf('StaticImageGallery',c=><section><h4>{c.title}</h4><div className="report-image-gallery">{c.images.map((item,i)=><ImageFrame key={i} {...item}/>)}</div></section>);
 const ImageText=leaf('StaticImageText',c=><section><h4>{c.title}</h4><div className={'report-image-text '+c.size}><ImageFrame src={c.src} alt={c.alt}/><p>{c.text}</p></div></section>);
 const Md=leaf('StaticMarkdown',c=><Markdown title={c.title} text={c.text}/>);
 const Grid=component('StaticCardGrid',{title:z.string(),variant:z.string(),children:nodes},({props:p})=>{const render=useRenderNode();return <section><h4>{p.title}</h4><div className={'report-card-grid '+p.variant}>{render(p.children)}</div></section>;});
 const Slides=component('StaticCarousel',{title:z.string(),items:z.array(z.object({id:z.string(),title:z.string(),children:nodes}))},({props:p})=><Carousel {...p}/>);
 const Dialog=component('StaticModal',{title:z.string(),children:nodes},({props:p})=><Modal {...p}/>);
 return [Plot,Icon,Comparison,Tags,Image,Gallery,ImageText,Md,Grid,Slides,Dialog];
}
const quote=v=>JSON.stringify(v).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export function extendedProgram(c,children){
 if(['pie-chart','radial-chart','radar-chart','scatter-chart','single-stacked-bar-chart'].includes(c.type)) return `SpecialtyChart(${quote(c)})`;
 const names={'icon':'StaticIcon','icon-text':'StaticIcon','metric-comparison':'MetricComparison','tag-block':'TagBlock','image':'StaticImage','image-gallery':'StaticImageGallery','image-text':'StaticImageText','markdown':'StaticMarkdown'};
 if(names[c.type]) return `${names[c.type]}(${quote(c)})`;
 if(c.type==='card-grid') return `StaticCardGrid(${quote(c.title)}, ${quote(c.variant)}, ${children(c.children)})`;
 if(c.type==='modal') return `StaticModal(${quote(c.title)}, ${children(c.children)})`;
 if(c.type==='carousel') return `StaticCarousel(${quote(c.title)}, [${c.items.map(i=>`{id:${quote(i.id)},title:${quote(i.title)},children:${children(i.children)}}`).join(', ')}])`;
 throw Error('Unsupported report component');
}
