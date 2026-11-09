import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { readMapSession, writeMapSession } from '../mapSession';
import {useWorkspaceActivity} from './WorkspaceActivity';
/** Remember each tool's scroll position without retaining hidden WebGL canvases. */
export default function WorkspaceSession({
  id,
  workspace,
  children,
}: {
  id: string;
  workspace: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const {active}=useWorkspaceActivity();
  useEffect(() => {
    const host = root.current;
    if (!host || !active) return;
    const key = `scroll.${workspace}`,
      positions = {...readMapSession<Record<string, [number, number]>>(id, key, {})};
    let frame=0,timer:ReturnType<typeof setTimeout>|undefined;
    const touched=new WeakMap<HTMLElement,string>();
    const observed=new WeakSet<Element>();
    const targets = () =>
      [host.closest('main'), ...host.querySelectorAll<HTMLElement>('*')].filter(
        (e): e is HTMLElement => e instanceof HTMLElement && e.clientHeight>0 &&
          (!!e.dataset.scrollId || (/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+4) || (/auto|scroll/.test(getComputedStyle(e).overflowX)&&e.scrollWidth>e.clientWidth+4)),
      );
    const name = (e: HTMLElement, index: number) =>
      e.tagName === 'MAIN' ? 'main' : e.dataset.scrollId||e.id||`${e.tagName}:${e.className}:${index}`;
    const snapshot=()=>targets().forEach((e,index)=>{const id=name(e,index);if(touched.get(e)===id)positions[id]=[e.scrollTop,e.scrollLeft];});
    const flush=()=>{
      if(timer!==undefined)clearTimeout(timer);
      timer=undefined;
      // Retained views can already be parked outside main during effect cleanup.
      // Keep the last live scroll event instead of replacing it with an empty set.
      snapshot();
      writeMapSession(id,key,positions);
    };
    const restore=()=>{
      frame=0;
      targets().forEach((e,index)=>{
        if(!observed.has(e)){observed.add(e);resize.observe(e);if(e.firstElementChild)resize.observe(e.firstElementChild);}
        const id=name(e,index),p=positions[id]??(e.dataset.scrollId?[0,0]:undefined);
        if(touched.get(e)!==id&&Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)){
          e.scrollTop=p[0];e.scrollLeft=p[1];
        }
      });
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(restore);};
    const resize=new ResizeObserver(schedule);
    const mutation=new MutationObserver(schedule);
    mutation.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
    const interact=(event:Event)=>{
      const target=event.target;if(!(target instanceof Node))return;
      targets().forEach((e,index)=>{if(e.contains(target)||(e.dataset.scrollId&&e.parentElement?.contains(target)))touched.set(e,name(e,index));});
    };
    const scroll=()=>{
      snapshot();if(timer!==undefined)clearTimeout(timer);timer=setTimeout(flush,150);
    };
    for(const event of ['wheel','pointerdown','keydown','focusin','guilty-spark-focus-control'])host.addEventListener(event,interact,true);
    host.addEventListener('scroll',scroll,true);
    window.addEventListener('gs:save-viewport-context',flush);
    window.addEventListener('pagehide',flush);
    schedule();
    return()=>{
      cancelAnimationFrame(frame);resize.disconnect();mutation.disconnect();
      for(const event of ['wheel','pointerdown','keydown','focusin','guilty-spark-focus-control'])host.removeEventListener(event,interact,true);
      host.removeEventListener('scroll',scroll,true);
      window.removeEventListener('gs:save-viewport-context',flush);window.removeEventListener('pagehide',flush);
      flush();
    };
  }, [id, workspace,active]);

  return (
    <div ref={root} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
