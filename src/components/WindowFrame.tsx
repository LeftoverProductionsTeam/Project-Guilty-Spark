import {useEffect,useState} from 'react';
import {getCurrentWindow} from '@tauri-apps/api/window';
type ResizeDirection=Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];
import type {PointerEvent} from 'react';
import {native} from '../api';
export async function dragWindow(event:PointerEvent<HTMLElement>){
  if(!native||event.button!==0||(event.target as HTMLElement).closest('button,a,input,select,textarea,[role="button"]'))return;
  await getCurrentWindow().startDragging();
}
export async function maximizeWindow(){if(native)await getCurrentWindow().toggleMaximize();}
export function WindowControls({notify,fullscreen=false,onExitFullscreen}:{notify:(message:string)=>void;fullscreen?:boolean;onExitFullscreen?:()=>Promise<void>}){
  const [maximized,setMaximized]=useState(false);
  useEffect(()=>{if(!native)return;let live=true;
    const update=async()=>{const value=await getCurrentWindow().isMaximized();if(live){setMaximized(value);document.documentElement.dataset.gsMaximized=String(value);}};
    void update().catch(()=>{});const stop=getCurrentWindow().onResized(()=>void update().catch(()=>{}));
    return()=>{live=false;void stop.then(fn=>fn());};},[]);
  if(!native)return null;
  const act=(action:()=>Promise<void>)=>void action().catch(e=>notify(`Window action unavailable: ${String(e)}`));
  return <div className="gs-window-controls" role="group" aria-label="Window controls">
    <button className="gs-window-button" aria-label="Minimize window" title="Minimize" onClick={()=>act(()=>getCurrentWindow().minimize())}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13h12"/></svg></button>
    <button className="gs-window-button" aria-label={fullscreen?'Exit fullscreen':maximized?'Restore window':'Maximize window'} title={fullscreen?'Exit fullscreen':maximized?'Restore':'Maximize'} onClick={()=>act(fullscreen&&onExitFullscreen?onExitFullscreen:maximizeWindow)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{maximized?<path d="M8 6h10v10M6 9h9v9H6Z"/>:<path d="M9 5H5v4m10-4h4v4M5 15v4h4m10-4v4h-4"/>}</svg></button>
    <button className="gs-window-button gs-window-close" aria-label="Close window" title="Save and close" onClick={()=>act(()=>getCurrentWindow().close())}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
  </div>;
}
export function ResizeEdges(){
  if(!native)return null;
  const edges:ResizeDirection[]=['North','South','East','West','NorthEast','NorthWest','SouthEast','SouthWest'];
  return <div className="gs-resize-edges" aria-hidden="true">{edges.map(edge=><div key={edge} className={`gs-resize-edge gs-resize-${edge}`} onPointerDown={event=>{
    if(event.button!==0)return;event.preventDefault();void getCurrentWindow().startResizeDragging(edge).catch(()=>{});
  }}/>)}</div>;
}
