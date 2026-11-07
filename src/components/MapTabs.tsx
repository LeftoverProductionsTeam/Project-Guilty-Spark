import {hasKeyboardDialog,navigateComposite} from '../keyboardNavigation';
import { ChevronDown, CornerUpLeft, ExternalLink, Pin, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
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
  onReturn,
  onReorder,
}: {
  state: MapDocuments;
  disabled: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onWindow: (id: string) => Promise<boolean>;
  onReturn?: (id:string)=>void;
  onReorder?:(ids:string[])=>void;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  const menu=useRef<HTMLDetailsElement>(null),pendingFocus=useRef<string|null>(null);
  const [query,setQuery]=useState('');
  const [condensed,setCondensed]=useState(false);
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
  type TearPhase='dragging'|'ready'|'transferring'|'completed'|'failed';
  const drag=useRef<{id:string;pointer:number;x:number;y:number;element:HTMLButtonElement}|null>(null),suppressClick=useRef<string|null>(null),transferring=useRef(false),feedbackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [feedback,setFeedback]=useState<{id:string;title:string;x:number;y:number;phase:TearPhase}|null>(null);
  const resetPointer=()=>{const origin=drag.current;drag.current=null;const tab=origin?.element.closest('.map-tab');tab?.removeAttribute('data-detaching');tab?.removeAttribute('data-dragging');return origin;};
  const cancelPointer=()=>{const origin=resetPointer();if(!origin)return;suppressClick.current=origin.id;setFeedback(null);if(origin.element.hasPointerCapture(origin.pointer))origin.element.releasePointerCapture(origin.pointer);};
  const point=(x:number,y:number)=>({x:Math.max(8,Math.min(innerWidth-248,x+16)),y:Math.max((document.getElementById('gs-window-header')?.getBoundingClientRect().bottom??32)+10,Math.min(innerHeight-84,y+18))});
  const requestWindow=async(id:string,at?:{x:number;y:number})=>{
    if(disabled||transferring.current)return;const document=state.documents.find(doc=>doc.id===id);if(!document)return;
    transferring.current=true;resetPointer();if(feedbackTimer.current)clearTimeout(feedbackTimer.current);
    const bounds=tabs.current?.getBoundingClientRect(),location=at??point(bounds?.left??0,bounds?.bottom??32),title=document.history.current?.title??'Untitled map';
    setFeedback({id,title,...location,phase:'transferring'});
    let ok=false;try{ok=await onWindow(id);}catch{ok=false;}finally{transferring.current=false;}
    // The original tab stays until the existing native handoff acknowledges.
    // Failure leaves its document/history in place; App shows the native reason.
    setFeedback({id,title,...location,phase:ok?'completed':'failed'});
    feedbackTimer.current=setTimeout(()=>setFeedback(null),ok?220:2600);
  };
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopImmediatePropagation();cancelPointer();}};const blur=()=>cancelPointer();window.addEventListener('keydown',key,true);window.addEventListener('blur',blur);return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('blur',blur);if(feedbackTimer.current)clearTimeout(feedbackTimer.current);};},[]);
  useEffect(()=>{if(disabled&&drag.current)cancelPointer();},[disabled]);
  useLayoutEffect(()=>{
    const list=tabs.current;if(!list)return;
    const resize=()=>{const gap=parseFloat(getComputedStyle(list).columnGap)||3;setCondensed(state.documents.length*144+Math.max(0,state.documents.length-1)*gap>list.clientWidth);};
    resize();const observer=new ResizeObserver(resize);observer.observe(list);return()=>observer.disconnect();
  },[state.documents.length]);
  useLayoutEffect(() => {
    const list=tabs.current;if(!list)return;
    const reveal=()=>list.querySelector('[aria-selected="true"]')?.closest('.map-tab')?.scrollIntoView({block:'nearest',inline:'nearest'});
    reveal();const observer=new ResizeObserver(reveal);observer.observe(list);
    if(pendingFocus.current===state.activeId){pendingFocus.current=null;list.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();}
    return()=>observer.disconnect();
  }, [state.activeId,state.documents.length]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(disabled||event.defaultPrevented||event.isComposing||event.altKey||event.metaKey||!event.ctrlKey||hasKeyboardDialog())return;
      const forward=event.key==='PageDown'||event.key==='Tab'&&!event.shiftKey;
      const backward=event.key==='PageUp'||event.key==='Tab'&&event.shiftKey;
      if(!forward&&!backward||!state.documents.length)return;
      event.preventDefault();event.stopImmediatePropagation();
      const at=state.documents.findIndex(doc=>doc.id===state.activeId);
      const next=state.documents[(at+(backward?-1:1)+state.documents.length)%state.documents.length];
      pendingFocus.current=next.id;onSelect(next.id);
    };
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[state.activeId,state.documents,disabled,onSelect]);
  useLayoutEffect(()=>{if(context)contextRoot.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[context]);
  if (!state.documents.length) return null;
  return (
    <><div className="map-tab-bar" data-overflow={condensed?'dropdown':undefined} style={{width:Math.min(state.documents.length,8)*180+68+(onReturn?32:0)}}>
      <div ref={tabs} className="map-tabs" role="tablist" aria-label="Open maps">
        {state.documents.map((d) => (
          <div className={'map-tab' + (d.id === state.activeId ? ' active' : '')} hidden={condensed&&d.id!==state.activeId} key={d.id} data-map-tab-id={d.id} data-pinned={pinned.includes(d.id)||undefined} onContextMenu={e=>{e.preventDefault();setContext({id:d.id,x:Math.min(innerWidth-190,e.clientX),y:Math.min(innerHeight-130,e.clientY)});}}>
            <button
              role="tab"
              aria-label={d.history.current?.title??'Untitled map'}
              aria-description={d.history.dirty?'Unsaved changes':undefined}
              aria-selected={d.id === state.activeId}
              tabIndex={d.id === state.activeId ? 0 : -1}
              disabled={disabled}
              onClick={() => {if(suppressClick.current===d.id){suppressClick.current=null;return;}onSelect(d.id);}}
              onPointerDown={event=>{if(event.button!==0||disabled||transferring.current)return;suppressClick.current=null;if(feedbackTimer.current)clearTimeout(feedbackTimer.current);setFeedback(null);drag.current={id:d.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,element:event.currentTarget};event.currentTarget.setPointerCapture(event.pointerId);}}
              onPointerMove={event=>{const origin=drag.current,strip=tabs.current?.getBoundingClientRect();if(!origin||origin.pointer!==event.pointerId||!strip)return;
                if(Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<6)return;
                const ready=shouldDetachTab(origin,{x:event.clientX,y:event.clientY},strip),tab=event.currentTarget.closest<HTMLElement>('.map-tab');tab?.setAttribute('data-dragging','true');tab?.toggleAttribute('data-detaching',ready);
                setFeedback({id:d.id,title:d.history.current?.title??'Untitled map',...point(event.clientX,event.clientY),phase:ready?'ready':'dragging'});}}
              onPointerUp={event=>{const origin=resetPointer(),strip=tabs.current?.getBoundingClientRect();
                if(origin&&strip&&origin.pointer===event.pointerId&&!disabled){
                  if(shouldDetachTab(origin,{x:event.clientX,y:event.clientY},strip)){suppressClick.current=d.id;void requestWindow(d.id,point(event.clientX,event.clientY));}
                  else{setFeedback(null);}

                  if(!shouldDetachTab(origin,{x:event.clientX,y:event.clientY},strip)&&Math.abs(event.clientX-origin.x)>8&&event.clientY>=strip.top&&event.clientY<=strip.bottom){
                    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-map-tab-id]')?.dataset.mapTabId;
                    if(target&&target!==d.id&&pinned.includes(target)===pinned.includes(d.id)){const ids=state.documents.map(item=>item.id);ids.splice(ids.indexOf(d.id),1);ids.splice(ids.indexOf(target),0,d.id);suppressClick.current=d.id;onReorder?.(ids);}
                  }
                }}}
              onPointerCancel={cancelPointer}
              onLostPointerCapture={()=>{if(drag.current)cancelPointer();}}
              onKeyDown={(e) => {
                if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){
                  e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setContext({id:d.id,x:Math.min(innerWidth-190,rect.left),y:rect.bottom+4});return;
                }
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
                pendingFocus.current=state.documents[n].id;
                onSelect(state.documents[n].id);
              }}
              title={`${d.history.current?.title} · ${d.history.current?.source?.engine??'QuickForge source'} · ${d.history.current?.source?.scenarioPath ?? 'Editable source project'} · drag out to move to another window`}
            >
              {d.history.dirty && <span aria-label="Unsaved changes">● </span>}
              {pinned.includes(d.id)&&<Pin size={10} aria-label="Pinned tab"/>}
              <span className="map-tab-title">{d.history.current?.title}</span>
            </button>
            <button
              className="map-tab-action"
              title="Close map; choose Save, Discard or Cancel for unsaved changes"
              aria-label={'Close map ' + d.history.current?.title}
              disabled={disabled}
              onClick={() => onClose(d.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {context&&<div className="gs-tab-context" ref={contextRoot} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setContext(null);tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();}else navigateComposite(event);}} role="menu" aria-label="Map tab actions" style={{position:'fixed',left:Math.max(8,context.x),top:Math.max(8,context.y)}}>
        <button role="menuitem" disabled={disabled} onClick={()=>{pin(context.id);setContext(null);}}>{pinned.includes(context.id)?'Unpin tab':'Pin tab'}</button>
        <button role="menuitem" disabled={disabled} onClick={()=>{void requestWindow(context.id);setContext(null);}}>Move to another window</button>
        {onReturn&&<button role="menuitem" disabled={disabled} onClick={()=>{onReturn(context.id);setContext(null);}}>Return to original window</button>}
        <button role="menuitem" disabled={disabled} onClick={()=>{onClose(context.id);setContext(null);}}>Close map</button>
      </div>}
      {state.documents.length>1&&<details ref={menu} className="gs-map-switcher" onToggle={event=>{
        if(event.currentTarget.open){for(const other of document.querySelectorAll<HTMLDetailsElement>('.gs-panel-overflow[open],.gs-layout-menu[open],.gs-studio-menu[open]'))other.open=false;requestAnimationFrame(()=>menu.current?.querySelector('input')?.focus());}
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
            <button aria-label={'Open '+d.history.current?.title+' in another window'} title="Open in another window" disabled={disabled} onClick={()=>{if(menu.current)menu.current.open=false;void requestWindow(d.id);}}><ExternalLink size={13}/></button>
          </div>)}</div>
          {!matches.length&&<p role="status">No open maps match.</p>}
        </div>
      </details>}
      {onReturn&&state.activeId&&<button className="small-button" aria-label="Return map to workspace" disabled={disabled} title="Return this map and its in-memory editing history to the original Spark window" onClick={()=>onReturn(state.activeId!)}><CornerUpLeft size={14}/>Return</button>}
    </div>{feedback&&createPortal(<div className="gs-tab-tear-preview" data-tab-drag-phase={feedback.phase} role="status" aria-live="polite" style={{left:feedback.x,top:feedback.y}}><ExternalLink size={18}/><div><strong>{feedback.title}</strong><small>{feedback.phase==='ready'?'Release to open in another window':feedback.phase==='dragging'?'Pull outside the tab bar to make a window':feedback.phase==='transferring'?'Opening window and transferring the map…':feedback.phase==='completed'?'Window opened':"Couldn't finish the move. Your tab is retained."}</small></div></div>,document.body)}</>
  );
}
