import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {native} from '../api';
import {useMapState} from '../mapSession';
import {surfacePages} from '../surfacePages';
import './pagedSurface.css';

function materialized(node:HTMLElement){
 for(let parent=node.parentElement;parent;parent=parent.parentElement){
  if(parent.hidden)return false;
  if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(node))return false;
 }
 return true;
}
const atomic='button,a[href],input,select,textarea,summary,label,fieldset,.field-row,.setting-row,tr,[draggable="true"]';
function controlRange(node:HTMLElement,content:HTMLElement,height:number){
 const bounds=content.getBoundingClientRect();let rect=node.getBoundingClientRect(),top=rect.top,bottom=rect.bottom;
 for(let parent=node.parentElement;parent&&parent!==content;parent=parent.parentElement)if(parent.matches(atomic)){
  rect=parent.getBoundingClientRect();if(rect.height<=height+.5){top=Math.min(top,rect.top);bottom=Math.max(bottom,rect.bottom);}
 }
 return {top:top-bounds.top,bottom:bottom-bounds.top};
}
/** A view over the existing mounted controls, never a second document or editor.
 * Explicit pages replace wheel/scrollbar navigation. Inputs and Undo stay owned
 * by their original components, and off-page controls are inert, not discarded. */
export default function PagedSurface({children,label,name,scope='global',fill=false,maxHeight=440,reserveBottom=12,className=''}:{children:ReactNode;label:string;name:string;scope?:string;fill?:boolean;maxHeight?:number;reserveBottom?:number;className?:string}){
 const host=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null),viewport=useRef<HTMLDivElement>(null);
 const windowId=native?getCurrentWindow().label:'browser';
 const [selected,setSelected]=useMapState<number>((scope+':window:'+windowId).slice(0,128),'surface.'+name,0);
 const [query,setQuery]=useState('');
 const [layout,setLayout]=useState({height:180,offsets:[0],total:0,visibility:''});
 const page=Math.max(0,Math.min(Number.isFinite(selected)?Math.floor(selected):0,layout.offsets.length-1)),offset=layout.offsets[page]??0;
 const original=useRef(new Map<HTMLElement,{inert:boolean;hidden:string|null}>());
 useLayoutEffect(()=>{
  const root=host.current,content=body.current,view=viewport.current;if(!root||!content||!view)return;
  let frame=0;
  const measure=()=>{
   frame=0;const rect=view.getBoundingClientRect(),outer=root.getBoundingClientRect();
   if(!rect.width||!outer.height)return;
   const bounds=content.getBoundingClientRect();
   const nodes=[...content.querySelectorAll<HTMLElement>(atomic)];
   const ranges=nodes.filter(materialized).map(node=>{const r=node.getBoundingClientRect();return {top:r.top-bounds.top,bottom:r.bottom-bounds.top,width:r.width};}).filter(r=>r.width>0);
   const total=Math.ceil(ranges.reduce((n,r)=>Math.max(n,r.bottom),Math.max(content.scrollHeight,bounds.height)));
   const visibility=nodes.map(node=>materialized(node)?'1':'0').join('');
   const room=Math.max(40,Math.floor(fill?outer.bottom-rect.top:Math.min(maxHeight,window.innerHeight-rect.top-reserveBottom)));
   const height=Math.max(40,Math.min(total||room,room-(total>room?28:0)));
   const offsets=surfacePages(total,height,ranges);
   setLayout(old=>old.height===height&&old.total===total&&old.visibility===visibility&&JSON.stringify(old.offsets)===JSON.stringify(offsets)&&nodes.every(node=>original.current.has(node))?old:{height,offsets,total,visibility});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const resize=new ResizeObserver(schedule);resize.observe(root);resize.observe(content);
  const mutation=new MutationObserver(schedule);mutation.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','aria-expanded']});
  const toggle=(event:Event)=>{if(event.target instanceof HTMLDetailsElement&&event.target.contains(root))schedule();};
  document.addEventListener('toggle',toggle,true);window.addEventListener('resize',schedule);schedule();
  return()=>{cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();document.removeEventListener('toggle',toggle,true);window.removeEventListener('resize',schedule);};
 },[fill,maxHeight,reserveBottom,name,scope]);
 useLayoutEffect(()=>{
  const content=body.current;if(!content)return;const bounds=content.getBoundingClientRect();
  for(const [node,before]of original.current)if(!content.contains(node)){node.removeAttribute('data-gs-offpage');node.inert=before.inert;if(before.hidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',before.hidden);original.current.delete(node);}
  for(const node of content.querySelectorAll<HTMLElement>(atomic)){
   if(!original.current.has(node))original.current.set(node,{inert:node.inert,hidden:node.getAttribute('aria-hidden')});
   const r=node.getBoundingClientRect(),top=r.top-bounds.top,bottom=r.bottom-bounds.top;
   const off=materialized(node)&&r.height<=layout.height+.5&&(top<offset-.5||bottom>offset+layout.height+.5);
   node.toggleAttribute('data-gs-offpage',off);node.inert=off||original.current.get(node)!.inert;
   if(off)node.setAttribute('aria-hidden','true');else{const hidden=original.current.get(node)!.hidden;if(hidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',hidden);}
  }
 },[offset,layout]);
 useEffect(()=>()=>{for(const [node,before]of original.current){node.removeAttribute('data-gs-offpage');node.inert=before.inert;if(before.hidden===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',before.hidden);}original.current.clear();},[]);
 useEffect(()=>{
  const content=body.current;if(!content)return;
  const reveal=(event:Event)=>{const node=event.target;if(!(node instanceof HTMLElement)||!content.contains(node))return;
   event.stopPropagation();const range=controlRange(node,content,layout.height);
   const at=layout.offsets.findIndex(offset=>range.top>=offset-.5&&range.bottom<=offset+layout.height+.5);
   if(at>=0){
    const before=document.activeElement;setSelected(at);
    // A visible command needs no deferred focus. An older reveal must not
    // steal Enter from a submenu the user has already entered.
    if(at!==page||node.inert)requestAnimationFrame(()=>{if(document.activeElement===before&&node.isConnected&&!node.inert)node.focus();});
   }
  };
  content.addEventListener('guilty-spark-focus-control',reveal);return()=>content.removeEventListener('guilty-spark-focus-control',reveal);
 },[layout,setSelected,page]);
 const choose=(next:number)=>setSelected(Math.max(0,Math.min(Number.isFinite(next)?Math.floor(next):0,layout.offsets.length-1)));
 function find(value:string){
  setQuery(value);if(!value.trim()||!body.current)return;const root=body.current,bounds=root.getBoundingClientRect();
  const node=[...root.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary')].find(node=>(node.getAttribute('aria-label')??node.closest('label')?.textContent??node.textContent??node.getAttribute('title')??'').toLocaleLowerCase().includes(value.toLocaleLowerCase()));
  if(node){const {top,bottom}=controlRange(node,root,layout.height);const page=layout.offsets.findIndex(at=>top>=at-.5&&bottom<=at+layout.height+.5);if(page>=0)choose(page);}
 }
 return <div ref={host} className={'gs-paged-surface '+className} data-fill={fill||undefined} data-surface={name} data-page={page+1} data-pages={layout.offsets.length} onKeyDownCapture={event=>{if(event.altKey&&['PageDown','PageUp'].includes(event.key)){event.preventDefault();event.stopPropagation();choose(page+(event.key==='PageDown'?1:-1));}}}>
  <div ref={viewport} className="gs-page-viewport" style={{height:layout.height}}><div ref={body} className="gs-page-body" style={{transform:'translateY(-'+offset+'px)'}}>{children}</div></div>
  {layout.offsets.length>1&&<nav className="gs-surface-pages" aria-label={label+' pages'}>
   <input type="search" aria-label={'Find in '+label} placeholder="Find controls…" value={query} onChange={event=>find(event.target.value)}/>
   <button type="button" aria-label={'Previous page of '+label} title="Previous page · Alt+PageUp" disabled={page===0} onClick={()=>choose(page-1)}><ChevronLeft size={13}/></button>
   <label>Page <input aria-label={'Page of '+label} type="number" min={1} max={layout.offsets.length} value={page+1} onChange={event=>{if(event.target.value)choose(Number(event.target.value)-1);}}/> / {layout.offsets.length}</label>
   <button type="button" aria-label={'Next page of '+label} title="Next page · Alt+PageDown" disabled={page===layout.offsets.length-1} onClick={()=>choose(page+1)}><ChevronRight size={13}/></button>
  </nav>}
 </div>;
}
