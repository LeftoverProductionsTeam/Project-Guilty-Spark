import PagedSurface from './PagedSurface';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AppWindow,ChevronDown,ExternalLink,Search,X} from 'lucide-react';
import {workspaceCatalog,workspaceLabel} from '../workspaceCatalog';
import type {MapDocuments} from '../mapDocuments';
import type {Workspace,JobEvent,LibraryEntry} from '../types';
import {call,native} from '../api';
import {baboonSessionEvent,type BaboonDashboard,type BaboonPoll} from '../baboon';
import type {ToolProcessView} from '../runtimeWorkbench';
import type {WorkflowRoute} from '../workflowHistory';
import type {WorkspaceWindow} from '../useWorkspaceWindows';
import {shouldDetachTab} from '../tabDetach';
import './openWork.css';

export default function OpenWork({workspace,documents,entries,windows,recent,error,jobs,onNavigate,onSelect,onRecent,onFocus,onRefresh,onWindow}:{
  workspace:Workspace;documents:MapDocuments;windows:WorkspaceWindow[];recent:WorkflowRoute[];error:string;
  jobs:JobEvent[];
  entries:LibraryEntry[];
  onNavigate:(route:Workspace)=>void;onSelect:(id:string)=>void;onRecent:(route:WorkflowRoute)=>void;
  onFocus:(label:string)=>void;onRefresh:()=>void;onWindow:(workspace:Workspace,another?:boolean)=>void;
}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');
  const [handoff,setHandoff]=useState<{projectId:string;tag:string;status:string}|null>(null),[processes,setProcesses]=useState<ToolProcessView[]>([]);
  const handoffCache=useRef(new Map<string,{at:number;value:typeof handoff}>());
  const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null);
  const drag=useRef<{pointer:number;x:number;y:number}|null>(null),suppressClick=useRef(false);
  const close=()=>{setOpen(false);button.current?.focus();};
  // Focus before paint. A deferred animation-frame callback could steal focus
  // after the user had already moved to the last control with the keyboard.
  useLayoutEffect(()=>{if(open)search.current?.focus();},[open]);
  useEffect(()=>{if(open)onRefresh();},[open]);
  useEffect(()=>{
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    const reveal=(event:Event)=>setOpen(value=>(event as CustomEvent).detail?.open===true?true:!value);
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&open){event.preventDefault();event.stopImmediatePropagation();close();}
      if(event.key==='Tab'&&open){
        const controls=[...root.current?.querySelectorAll<HTMLElement>('.gs-open-work-popup button:not(:disabled),.gs-open-work-popup input,.gs-open-work-popup select')??[]].filter(e=>e.getClientRects().length&&!e.closest('[inert]'));
        const target=event.shiftKey&&document.activeElement===controls[0]?controls.at(-1):!event.shiftKey&&document.activeElement===controls.at(-1)?controls[0]:null;
        if(target){event.preventDefault();target.focus();}
      }
      if((event.ctrlKey||event.metaKey)&&event.shiftKey&&!event.altKey&&event.code==='KeyP'){event.preventDefault();event.stopImmediatePropagation();setOpen(value=>!value);}
    };
    window.addEventListener('pointerdown',dismiss);window.addEventListener('keydown',key,true);window.addEventListener('gs:open-work',reveal);
    return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('keydown',key,true);window.removeEventListener('gs:open-work',reveal);};
  },[open]);
  useEffect(()=>{
    if(!native||!open)return;let alive=true;
    // Reuse the native handoff/process records on demand. Opening this menu
    // neither launches a tool nor installs a second background polling loop.
    const refresh=async()=>{
      const id=documents.activeId;setHandoff(null);
      const running=await call<ToolProcessView[]>('runtime_tool_processes').catch(()=>[]);
      if(alive)setProcesses(running.filter(p=>p.status==='running'||p.exitCode!==null&&p.exitCode!==0));
      if(!id||!windows.some(w=>w.current&&w.writable&&w.project===id))return;
      const cached=handoffCache.current.get(id);
      if(cached&&Date.now()-cached.at<30000){if(alive)setHandoff(cached.value);return;}
      const report=await call<BaboonDashboard>('baboon_report',{projectId:id}).catch(()=>null);
      if(!alive)return;
      if(!report?.sessionId){handoffCache.current.set(id,{at:Date.now(),value:null});return;}
      const poll=await call<BaboonPoll>('baboon_poll',{projectId:id,sessionId:report.sessionId}).catch(()=>null);
      if(alive&&poll){const value={projectId:id,tag:poll.tag,status:poll.integrity?.invalidFiles?'Invalid save · review required':poll.running?'Native editor open':poll.changes.changedFiles?'Saved changes · reconcile':'Saved handoff · review or resume'};handoffCache.current.set(id,{at:Date.now(),value});if(handoffCache.current.size>12)handoffCache.current.delete(handoffCache.current.keys().next().value!);setHandoff(value);}
    };
    const changed=()=>{if(documents.activeId)handoffCache.current.delete(documents.activeId);void refresh();};
    void refresh();window.addEventListener(baboonSessionEvent,changed);window.addEventListener('guilty-spark-native-source-changed',changed);
    return()=>{alive=false;window.removeEventListener(baboonSessionEvent,changed);window.removeEventListener('guilty-spark-native-source-changed',changed);};
  },[open,documents.activeId]);
  const title=(id:string|null)=>documents.documents.find(d=>d.id===id)?.history.current?.title??entries.find(e=>e.id===id)?.title;
  const match=(text:string)=>text.toLowerCase().includes(query.toLowerCase());
  const latestJobs=useMemo(()=>{const latest=new Map<string,JobEvent>();for(const job of jobs)latest.set(job.jobId,job);return [...latest.values()].reverse();},[jobs]);
  const running=latestJobs.filter(job=>job.progress<100&&!['failed','blocked','cancelled','canceled','completed','validated'].includes(job.phase));
  const failed=latestJobs.filter(job=>job.severity==='error'||['failed','blocked'].includes(job.phase)).slice(0,3);
  const choose=(action:()=>void)=>{setOpen(false);action();};
  return <div className="gs-open-work" ref={root}>
    <button ref={button} aria-label="Open work and workspace windows" aria-expanded={open} title={`${workspaceLabel(workspace)} · drag out for another workspace window; click for Open work (Ctrl+Shift+P)`}
      onPointerDown={event=>{if(event.button!==0)return;drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>{const start=drag.current;if(start?.pointer===event.pointerId)root.current?.toggleAttribute('data-detaching',shouldDetachTab(start,{x:event.clientX,y:event.clientY},event.currentTarget.getBoundingClientRect()));}}
      onPointerUp={event=>{const start=drag.current;drag.current=null;root.current?.removeAttribute('data-detaching');if(start?.pointer===event.pointerId&&shouldDetachTab(start,{x:event.clientX,y:event.clientY},event.currentTarget.getBoundingClientRect())){suppressClick.current=true;setOpen(false);onWindow(workspace,true);}}}
      onPointerCancel={()=>{drag.current=null;root.current?.removeAttribute('data-detaching');}}
      onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}setOpen(value=>!value);}}><AppWindow size={14}/><span>Work</span>{!!running.length&&<small aria-label={`${running.length} running task${running.length===1?'':'s'}`}>●</small>}<ChevronDown size={10}/></button>
    {open&&<section className="gs-open-work-popup" role="dialog" aria-label="Open work">
      <header><strong>Open work</strong><button aria-label="Close open work" onClick={close}><X size={14}/></button></header>
      <label className="gs-open-work-search"><Search size={14}/><input ref={search} type="search" placeholder="Map, workspace or window…" aria-label="Search open work" value={query} maxLength={160} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="gs-role-choice"><label>Workspace in this window<select aria-label="Workspace in this window" value={workspace} onChange={e=>choose(()=>onNavigate(e.target.value as Workspace))}>{workspaceCatalog.filter(item=>item.id!=='interface').map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button aria-label="Open workspace in another window" title="Focus this workspace's existing window, or open a new view" onClick={()=>choose(()=>onWindow(workspace))}><ExternalLink size={14}/></button></div>
      <PagedSurface name="open-work" label="Open work" maxHeight={420} reserveBottom={55}><div className="gs-open-work-groups">
        {(handoff||processes.length>0)&&<section aria-label="External tool handoffs"><h3>External tools</h3>{handoff&&<button className="gs-work-row" onClick={()=>choose(()=>onRecent({workspace:'tags',projectId:handoff.projectId,settingsTab:'tools'}))}><span><strong>{title(handoff.projectId)??'Source handoff'} · {handoff.tag}</strong><small>{handoff.status}</small></span><small>Review</small></button>}{processes.map(p=><button className="gs-work-row" key={p.id} onClick={()=>choose(()=>onRecent({workspace:'build',projectId:p.projectId,settingsTab:'tools'}))}><span><strong>{title(p.projectId)??'Native tool'} · {p.actionId}</strong><small>{p.status==='running'?'Running':`Exited · ${p.exitCode}`} · {p.detail}</small></span></button>)}</section>}
        {!!running.length&&<section aria-label="Running tasks"><h3>Running tasks</h3>{running.map(job=><button className="gs-work-row" key={job.jobId} onClick={()=>choose(()=>onRecent({workspace:'build',projectId:job.projectId,settingsTab:'tools'}))}><span><strong>{documents.documents.find(d=>d.id===job.projectId)?.history.current?.title??'Build snapshot'}</strong><small>{job.phase} · {job.message}</small></span><small>{job.progress>0?`${Math.round(job.progress)}%`:'Running'}</small></button>)}</section>}
        {!!failed.length&&<section aria-label="Tasks needing attention"><h3>Needs attention</h3>{failed.map(job=><button className="gs-work-row" key={job.jobId} onClick={()=>choose(()=>onRecent({workspace:'build',projectId:job.projectId,settingsTab:'tools'}))}><span><strong>{job.phase}</strong><small>{job.message}</small></span></button>)}</section>}
        {!!windows.length&&<section aria-label="Spark windows"><h3>Windows · {windows.length}</h3>{windows.filter(w=>match(`${w.title} ${w.workspace?workspaceLabel(w.workspace):''}`)).map(w=><button key={w.label} className="gs-work-row" aria-label={`Focus ${w.title} · ${w.workspace?workspaceLabel(w.workspace):'Starting'}`} onClick={()=>choose(()=>onFocus(w.label))}><AppWindow size={14}/><span><strong>{w.title}{w.dirty?' ●':''}</strong><small>{w.workspace?workspaceLabel(w.workspace):'Starting'}{w.panel?` · ${w.panel}`:''}{w.project?` · ${w.writable?'Editing':'Following'}`:''}</small></span><small>{w.current?'Here':'Focus'}</small></button>)}</section>}
        {!!documents.documents.length&&<section aria-label="Open maps in this window"><h3>Maps here · {documents.documents.length}</h3>{documents.documents.filter(d=>match(`${d.history.current?.title} ${d.history.current?.source?.engine??''}`)).map(d=><button key={d.id} className="gs-work-row" onClick={()=>choose(()=>onSelect(d.id))}><span><strong>{d.history.current?.title}{d.history.dirty?' ●':''}</strong><small>{d.history.current?.source?.engine??'QuickForge source'}{d.history.current?.builds?.length?' · build history available':''}</small></span><small>{d.id===documents.activeId?'Active':'Return'}</small></button>)}</section>}
        {!!recent.length&&<section aria-label="Recent places"><h3>Recent places</h3>{recent.filter(r=>match(`${workspaceLabel(r.workspace)} ${title(r.projectId)??''}`)).slice(0,12).map((r,i)=><button className="gs-work-row" disabled={!!r.projectId&&!title(r.projectId)} key={`${r.projectId}:${r.workspace}:${i}`} onClick={()=>choose(()=>onRecent(r))}><span><strong>{workspaceLabel(r.workspace)}</strong><small>{r.projectId?title(r.projectId)??'Map unavailable':r.workspace==='settings'?r.settingsTab:r.workspace==='learning'?r.learningSection:'Studio'}</small></span><small>{r.projectId&&!documents.documents.some(d=>d.id===r.projectId)?title(r.projectId)?'Reopen':'Unavailable':'Return'}</small></button>)}</section>}
        {error&&<p role="alert">{error}</p>}
      </div></PagedSurface>
      <footer><button onClick={()=>choose(()=>onWindow(workspace,true))}>Open another view</button><small>Navigation keeps source Undo separate.</small></footer>
    </section>}
  </div>;
}
