import { ChevronDown, CornerUpLeft, ExternalLink, PackageOpen, Pin, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MapDocuments } from '../mapDocuments';
import { shouldDetachTab } from '../tabDetach';
import {useMapState} from '../mapSession';
import {native} from '../api';
import {getCurrentWindow} from '@tauri-apps/api/window';
import './mapTabsMenu.css';
export default function MapTabs({
  state,
  disabled,
  onSelect,
  onClose,
  onWindow,
  onAssets,
  onReturn,
  onReorder,
}: {
  state: MapDocuments;
  disabled: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onWindow: (id: string) => void;
  onAssets: () => void;
  onReturn?: (id:string)=>void;
  onReorder?:(ids:string[])=>void;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  const menu=useRef<HTMLDetailsElement>(null),pendingFocus=useRef<string|null>(null);
  const [query,setQuery]=useState('');
  const [pinned,setPinned]=useMapState<string[]>(`global:window:${native?getCurrentWindow().label:'browser'}`,'tabs.pinned',[]);
  const [context,setContext]=useState<{id:string;x:number;y:number}|null>(null);
  const contextRoot=useRef<HTMLDivElement>(null);
  const pin=(id:string)=>{
    const next=pinned.includes(id)?pinned.filter(value=>value!==id):[...pinned,id];setPinned(next);
    onReorder?.([...state.documents.filter(d=>next.includes(d.id)),...state.documents.filter(d=>!next.includes(d.id))].map(d=>d.id));
  };
  const matches=state.documents.filter(d=>`${d.history.current?.title} ${d.history.current?.source?.engine??'QuickForge'}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false;if(contextRoot.current&&!contextRoot.current.contains(event.target as Node))setContext(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setContext(null);};
    window.addEventListener('pointerdown',outside);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',key);};
  },[]);
  const drag=useRef<{id:string;pointer:number;x:number;y:number}|null>(null),suppressClick=useRef<string|null>(null);
  useLayoutEffect(() => {
    const list=tabs.current;if(!list)return;
    const reveal=()=>list.querySelector('[aria-selected="true"]')?.closest('.map-tab')?.scrollIntoView({block:'nearest',inline:'nearest'});
    reveal();const observer=new ResizeObserver(reveal);observer.observe(list);
    if(pendingFocus.current===state.activeId){pendingFocus.current=null;list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();}
    return()=>observer.disconnect();
  }, [state.activeId,state.documents.length]);
  if (!state.documents.length) return null;
  return (
    <div className="map-tab-bar">
      <div ref={tabs} className="map-tabs" role="tablist" aria-label="Open maps">
        {state.documents.map((d) => (
          <div className={'map-tab' + (d.id === state.activeId ? ' active' : '')} key={d.id} data-map-tab-id={d.id} data-pinned={pinned.includes(d.id)||undefined} onContextMenu={e=>{e.preventDefault();setContext({id:d.id,x:Math.min(innerWidth-190,e.clientX),y:Math.min(innerHeight-130,e.clientY)});}}>
            <button
              role="tab"
              aria-selected={d.id === state.activeId}
              tabIndex={d.id === state.activeId ? 0 : -1}
              disabled={disabled}
              onClick={() => {if(suppressClick.current===d.id){suppressClick.current=null;return;}onSelect(d.id);}}
              onPointerDown={event=>{if(event.button!==0||disabled)return;drag.current={id:d.id,pointer:event.pointerId,x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}}
              onPointerMove={event=>{const origin=drag.current,strip=tabs.current?.getBoundingClientRect();if(!origin||origin.pointer!==event.pointerId||!strip)return;
                event.currentTarget.closest<HTMLElement>('.map-tab')?.toggleAttribute('data-detaching',shouldDetachTab(origin,{x:event.clientX,y:event.clientY},strip));}}
              onPointerUp={event=>{const origin=drag.current,strip=tabs.current?.getBoundingClientRect();drag.current=null;event.currentTarget.closest('.map-tab')?.removeAttribute('data-detaching');
                if(origin&&strip&&origin.pointer===event.pointerId){
                  if(shouldDetachTab(origin,{x:event.clientX,y:event.clientY},strip)){suppressClick.current=d.id;onWindow(d.id);}
                  else if(Math.abs(event.clientX-origin.x)>8&&event.clientY>=strip.top&&event.clientY<=strip.bottom){
                    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-map-tab-id]')?.dataset.mapTabId;
                    if(target&&target!==d.id&&pinned.includes(target)===pinned.includes(d.id)){const ids=state.documents.map(item=>item.id);ids.splice(ids.indexOf(d.id),1);ids.splice(ids.indexOf(target),0,d.id);suppressClick.current=d.id;onReorder?.(ids);}
                  }
                }}}
              onPointerCancel={event=>{drag.current=null;event.currentTarget.closest('.map-tab')?.removeAttribute('data-detaching');}}
              onKeyDown={(e) => {
                if(e.altKey&&e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)){
                  e.preventDefault();const ids=state.documents.map(item=>item.id),at=ids.indexOf(d.id),next=at+(e.key==='ArrowLeft'?-1:1);
                  if(next>=0&&next<ids.length&&pinned.includes(ids[next])===pinned.includes(d.id)){[ids[at],ids[next]]=[ids[next],ids[at]];onReorder?.(ids);}return;
                }
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const list = e.currentTarget.closest('[role=tablist]'),
                  i = state.documents.indexOf(d),
                  n =
                    e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? state.documents.length - 1
                        : (i + (e.key === 'ArrowRight' ? 1 : -1) + state.documents.length) %
                          state.documents.length;
                onSelect(state.documents[n].id);
                requestAnimationFrame(() =>
                  list?.querySelectorAll<HTMLButtonElement>('[role=tab]')[n]?.focus(),
                );
              }}
              title={`${d.history.current?.title} · ${d.history.current?.source?.engine??'QuickForge source'} · ${d.history.current?.source?.scenarioPath ?? 'Editable source project'} · drag out to move to another window`}
            >
              {d.history.dirty && <span aria-label="Unsaved changes">● </span>}
              {pinned.includes(d.id)&&<Pin size={10} aria-label="Pinned tab"/>}
              <span className="map-tab-title">{d.history.current?.title}</span>
            </button>
            <button
              className="map-tab-action"
              title="Save and close map tab"
              aria-label={'Save and close ' + d.history.current?.title}
              disabled={disabled}
              onClick={() => onClose(d.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {context&&<div className="gs-tab-context" ref={contextRoot} role="menu" aria-label="Map tab actions" style={{position:'fixed',left:Math.max(8,context.x),top:Math.max(8,context.y)}}>
        <button role="menuitem" disabled={disabled} onClick={()=>{pin(context.id);setContext(null);}}>{pinned.includes(context.id)?'Unpin tab':'Pin tab'}</button>
        <button role="menuitem" disabled={disabled} onClick={()=>{onWindow(context.id);setContext(null);}}>Move to another window</button>
        {onReturn&&<button role="menuitem" disabled={disabled} onClick={()=>{onReturn(context.id);setContext(null);}}>Return to original window</button>}
        <button role="menuitem" disabled={disabled} onClick={()=>{onClose(context.id);setContext(null);}}>Save and close map</button>
      </div>}
      {state.documents.length>1&&<details ref={menu} className="gs-map-switcher" onToggle={event=>{
        if(event.currentTarget.open){for(const other of document.querySelectorAll<HTMLDetailsElement>('.gs-panel-overflow[open],.gs-layout-menu[open]'))other.open=false;requestAnimationFrame(()=>menu.current?.querySelector('input')?.focus());}
      }} onKeyDown={event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector<HTMLElement>('summary')?.focus();return;}
        const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)')];
        if(!buttons.length)return;
        const input=event.target instanceof HTMLInputElement;
        if(event.key==='Enter'&&input){event.preventDefault();buttons[0].click();return;}
        if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||(input&&['Home','End'].includes(event.key)))return;
        event.preventDefault();event.stopPropagation();const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:at<0?(event.key==='ArrowUp'?buttons.length-1:0):(at+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }}>
        <summary aria-label="Choose open map" title="Switch maps by full name; search or open a map in another window" onClick={()=>{if(!menu.current?.open)setQuery('');}}>Maps <small>{state.documents.length}</small><ChevronDown size={11}/></summary>
        <div className="gs-map-switcher-popup" role="menu" aria-label="Open map switcher">
          <input type="search" aria-label="Search open maps" placeholder="Map name or runtime…" value={query} maxLength={160} onChange={event=>setQuery(event.target.value)}/>
          <div className="gs-map-switcher-list">{matches.map(d=><div key={d.id} className="gs-map-choice-row">
            <button role="menuitemradio" aria-label={d.history.current?.title} aria-checked={state.activeId===d.id} disabled={disabled} onClick={()=>{
              if(menu.current)menu.current.open=false;
              if(state.activeId===d.id)requestAnimationFrame(()=>tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
              else pendingFocus.current=d.id;
              onSelect(d.id);
            }}><strong>{d.history.dirty&&<span aria-label="Unsaved changes">● </span>}{d.history.current?.title}</strong><small>{d.history.current?.source?.engine??'QuickForge source'}</small></button>
            <button aria-label={'Open '+d.history.current?.title+' in another window'} title="Open in another window" disabled={disabled} onClick={()=>{if(menu.current)menu.current.open=false;onWindow(d.id);}}><ExternalLink size={13}/></button>
          </div>)}</div>
          {!matches.length&&<p role="status">No open maps match.</p>}
        </div>
      </details>}
      {onReturn&&state.activeId&&<button className="small-button" aria-label="Return map to workspace" disabled={disabled} title="Save this map and return its editing history to the Spark window that opened it" onClick={()=>onReturn(state.activeId!)}><CornerUpLeft size={14}/>Return</button>}
      <button className="small-button" title="Transfer assets between open maps" aria-label="Transfer assets" disabled={disabled} onClick={onAssets}>
        <PackageOpen size={14} /> Transfer assets
      </button>
    </div>
  );
}
