import ToolEcosystem from './ToolEcosystem';
import {runtimeNames} from '../runtimeWorkbench';
import {useMapState} from '../mapSession';
import type {Project,Settings,RuntimeId} from '../types';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Command, Search, X } from 'lucide-react';
import type { Workspace } from '../types';
import type { WorkspaceFinderItem } from '../workspaceFinder';
import { filterWorkspaceFinder } from '../workspaceFinder';

export default function WorkspaceFinder({items,onNavigate,onClose,project=null,settings,onSettings}: {
  project?:Project|null;settings?:Settings;onSettings?:()=>void;
  items: readonly WorkspaceFinderItem[];
  onNavigate: (id:Workspace)=>void;
  onClose:()=>void;
}){
  const [query,setQuery]=useState('');
  const [runtime,setRuntime]=useMapState<RuntimeId>(project?.id??'global','hosting.runtime',project?.quickForge?.runtimeId??settings?.preferredHalo??'mccSteam');
  const [selected,setSelected]=useState(0);
  const field=useRef<HTMLInputElement>(null);
  const dialog=useRef<HTMLDivElement>(null);
  const titleId=useId();
  const results=filterWorkspaceFinder(items,query);
  const activeIndex=Math.max(0,Math.min(selected,Math.max(0,results.length-1)));
  const resultStatusId=useId();
  useEffect(()=>{
    const previous=document.activeElement;
    field.current?.focus();
    return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[]);
  useEffect(()=>{setSelected(0);},[query]);
  const closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();}
      if(e.key!=='Tab')return;
      const elements=[...dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')??[]];
      const first=elements[0],last=elements[elements.length-1];
      if(!first||!last){e.preventDefault();return;}
      if(e.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){e.preventDefault();last.focus();}
      if(!e.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){e.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKey,true);
    return()=>{document.removeEventListener('keydown',onKey,true);};
  },[]);
  const navigate=(id:Workspace)=>{onNavigate(id);onClose();};
  return <div className="gs-finder-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={dialog} className="gs-finder-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="gs-finder-top"><div className="gs-finder-title"><Command size={17}/><strong id={titleId}>Find tools & workspaces</strong></div><button className="icon-button" onClick={onClose} aria-label="Close workspace search"><X size={18}/></button></div>
      <div className="gs-finder-field"><Search size={19}/><input ref={field} aria-label="Search workspaces" aria-describedby={resultStatusId} aria-controls="gs-finder-results" placeholder="Search installed tools, setup, maps, tags…" value={query} onChange={event=>{setSelected(0);setQuery(event.target.value);}}
        onKeyDown={e=>{
          if(e.key==='ArrowDown'){e.preventDefault();setSelected(s=>Math.min(s+1,Math.max(0,results.length-1)));}
          else if(e.key==='ArrowUp'){e.preventDefault();setSelected(s=>Math.max(0,s-1));}
          else if(e.key==='Enter'&&results.length){e.preventDefault();navigate(results[activeIndex].id);}
        }}/><kbd>Esc</kbd></div>
      <span id={resultStatusId} className="gs-sr-only" role="status" aria-live="polite">{results.length} matching workspaces. {results.length ? `Selected: ${results[activeIndex].label}.` : 'Try a shorter query.'}</span>
      <div id="gs-finder-results" className="gs-finder-results" aria-label="Matching workspaces">
        {settings&&<><label>Halo runtime<select aria-label="Tool launcher runtime" value={runtime} onChange={e=>setRuntime(e.target.value as RuntimeId)}>{Object.entries(runtimeNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><ToolEcosystem project={project} settings={settings} runtime={runtime} search={query} onSettings={()=>{onClose();onSettings?.();}} onOpenWorkspace={target=>{onNavigate(target);onClose();}}/></>}
        {results.map((item,index)=><button key={item.id} className={activeIndex===index?'gs-finder-item active':'gs-finder-item'} aria-current={activeIndex===index?'true':undefined} onMouseEnter={()=>setSelected(index)} onClick={()=>navigate(item.id)}>
          <span><strong>{item.label}</strong><small>{item.help}</small></span><ArrowRight size={16}/>
        </button>)}
        {!results.length&&<div className="gs-finder-empty" role="status">No workspace matches. Try a simpler term such as “maps”, “tags”, or “build”.</div>}
      </div>
      <div className="gs-finder-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span>Local search only</span></div>
    </div>
  </div>;
}
