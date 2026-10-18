// Trusted offline form component, rendered by the pinned OpenUI runtime.
import React,{useContext,useId,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Renderer,defineComponent,createLibrary} from '@openuidev/react-lang';
import {z} from 'zod/v4';
import {IconGlyph} from './extended-static-components.jsx';
const Environment=React.createContext(null),contract=()=>window.BoardFormContract;
function OfflineForm({question:q}){
 const env=useContext(Environment),words=env.words,uid=useId(),form=useRef(null);
 const [draft,setDraft]=useState(()=>structuredClone(env.draft||contract().initial(q))),[touched,setTouched]=useState({}),[attempted,setAttempted]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState('');
 const change=(id,value)=>{const next={...draft,[id]:value};setDraft(next);env.onDraft(next);setResult('');};
 const cellChange=(f,row,col,value)=>change(f.id,{...draft[f.id],[row]:{...draft[f.id][row],[col]:value}});
 const values=contract().values(q,draft),marked=id=>attempted||touched[id];
 const scalarOk=(f,raw)=>contract().valueValid(f,contract().scalarValue(f,raw));
 const invalid=f=>f.type==='editable-table'?f.rows.some(r=>f.columns.some(c=>!scalarOk(c,draft[f.id][r.id][c.id])))||(f.required&&!values[f.id].changes.length):!contract().valueValid(f,values[f.id]);
 function constraint(f){return ['text','textarea'].includes(f.type)||(f.type==='input'&&f.dataType==='text')?`${words.maxLength}: ${f.maxLength}`:f.min!==undefined||f.max!==undefined?`${words.range}: ${f.min??'…'} – ${f.max??'…'}${f.step===undefined?'':`; ${words.step}: ${f.step}`}`:'';}
 function scalar(f,raw,onChange,id,label=f.label){
  const type=f.type==='input'?f.dataType:f.type,common={id,'aria-label':label,'aria-invalid':!scalarOk(f,raw),'aria-describedby':id+'-hint',required:f.required};
  if(type==='boolean')return <input {...common} type="checkbox" checked={raw===true} onChange={e=>onChange(e.target.checked)}/>;
  if(type==='select')return <select {...common} value={raw??''} onChange={e=>onChange(e.target.value||null)}><option value="">{words.choose}</option>{f.options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select>;
  if(type==='textarea')return <textarea {...common} rows={3} value={raw??''} onChange={e=>onChange(e.target.value)}/>;
  if(type==='slider')return <><input {...common} type="range" min={f.min} max={f.max} step={f.step} value={raw??f.min} onChange={e=>onChange(Number(e.target.value))}/><output htmlFor={id}>{raw??f.min}</output></>;
  return <input {...common} type={type==='date-picker'?'date':type==='number'?'number':'text'} min={f.min} max={f.max} step={type==='number'?'any':undefined} value={raw??''} onChange={e=>onChange(e.target.value)}/>;
 }
 function control(f){
  const id=uid+'-'+f.id,raw=draft[f.id];
  if(f.type==='editable-table')return <div className="form-table-scroll" role="region" tabIndex={0} aria-label={f.label}><table><thead><tr><th scope="col">{words.row}</th>{f.columns.map(c=><th scope="col" key={c.id}>{c.label}{c.required?' *':''}</th>)}</tr></thead><tbody>{f.rows.map(r=><tr key={r.id}><th scope="row">{r.id}</th>{f.columns.map(c=>{const cellId=id+'-'+r.id+'-'+c.id,ok=scalarOk(c,raw[r.id][c.id]);return <td key={c.id} data-row={r.id} data-column={c.id}>{scalar(c,raw[r.id][c.id],v=>cellChange(f,r.id,c.id,v),cellId,r.id+': '+c.label)}<small id={cellId+'-hint'}>{constraint(c)}</small><span className={"form-field-error "+(marked(f.id)&&!ok?"":"form-error-space")} aria-hidden={!(marked(f.id)&&!ok)}>{words.invalid}</span></td>;})}</tr>)}</tbody></table><p>{words.changedCells}: {values[f.id].changes.length}</p></div>;
  if(['radio-group','checkbox-group','switch-group','chips','option-cards'].includes(f.type)){
   const multi=contract().multiple(f),selected=o=>multi?raw.includes(o.id):raw===o.id;
   const select=o=>{const next=multi?f.options.filter(i=>i.id===o.id?!selected(o):selected(i)).map(i=>i.id):selected(o)&&['chips','option-cards'].includes(f.type)?null:o.id;change(f.id,next);};
   return <div className={'form-options '+f.type}>{f.options.map(o=>['chips','option-cards'].includes(f.type)?<button type="button" key={o.id} aria-pressed={selected(o)} aria-invalid={!contract().valueValid(f,values[f.id])} onClick={()=>select(o)}><strong>{o.label}</strong>{o.description&&<span>{o.description}</span>}</button>:<label key={o.id}><input type={multi?'checkbox':'radio'} role={f.type==='switch-group'?'switch':undefined} name={id} aria-invalid={!contract().valueValid(f,values[f.id])} checked={selected(o)} onChange={()=>select(o)}/><span>{o.label}{o.description&&<small>{o.description}</small>}</span></label>)}</div>;
  }
  return scalar(f,raw,v=>change(f.id,v),id);
 }
 async function submit(e){
  e.preventDefault();if(busy||env.busy||!env.eligible)return;setAttempted(true);setResult('');
  const answer={version:2,question:q.id,values};
  try{contract().answer(answer,q);if(new TextEncoder().encode(JSON.stringify(answer)).length>65536)throw Error(words.tooLarge);}catch(e){setResult(e.message===words.tooLarge?words.tooLarge:words.invalidForm);form.current?.querySelector('[aria-invalid=true]')?.focus();return;}
  setBusy(true);try{const sent=await env.onSubmit(answer);if(sent)setResult(sent);}catch(e){setResult(e.message);}finally{setBusy(false);}
 }
 return <form ref={form} noValidate className="typed-form" onSubmit={submit}><fieldset disabled={busy||env.busy||!env.eligible}><legend>{q.prompt}</legend><p className="form-hint">{words.hint}</p>{q.fields.map(f=><fieldset key={f.id} className="form-field" data-form-field={f.id} onBlur={()=>setTouched(v=>({...v,[f.id]:true}))}><legend>{f.label}{f.required?' *':''}</legend>{f.help&&<p>{f.help}</p>}{control(f)}<small id={uid+'-'+f.id+'-hint'}>{constraint(f)}</small><p className={"form-field-error "+(marked(f.id)&&invalid(f)?"":"form-error-space")} aria-hidden={!(marked(f.id)&&invalid(f))}>{words.invalid}</p></fieldset>)}<div className="form-buttons">{q.buttons.map(b=><button key={b.id} type={b.action==='submit'?'submit':'button'} onClick={b.action==='reset'?()=>{const next=contract().initial(q);setDraft(next);env.onDraft(next);setTouched({});setAttempted(false);setResult('');}:undefined}>{b.icon&&<IconGlyph name={b.icon}/ >}{b.label}</button>)}</div></fieldset><p className="form-result" role="status">{result}</p></form>;
}
const Form=defineComponent({name:'BoardForm',description:'Bounded offline typed form',props:z.object({data:z.any()}),component:({props})=><OfflineForm question={props.data}/>});
const library=createLibrary({components:[Form],root:'BoardForm'});
class Boundary extends React.Component{state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(){this.props.fail();}render(){return this.state.failed?null:this.props.children;}}
export const BoardFormRenderer={mount(element,question,options,onFailure){
 const root=createRoot(element),response='root = BoardForm('+JSON.stringify(question).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+')';
 const draw=env=>flushSync(()=>root.render(<Environment.Provider value={env}><Boundary fail={onFailure}><Renderer response={response} library={library} isStreaming={false} onError={errors=>{if(errors.length)onFailure();}}/></Boundary></Environment.Provider>));
 try{draw(options);}catch(e){root.unmount();throw e;}const dispose=()=>root.unmount();dispose.update=draw;return dispose;
}};
