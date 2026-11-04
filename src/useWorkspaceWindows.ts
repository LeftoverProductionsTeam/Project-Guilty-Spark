import {useCallback,useEffect,useRef,useState} from 'react';
import {emit,listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {call,native} from './api';
import type {Workspace} from './types';
export interface WorkspaceWindow {
  label:string;workspace:Workspace|null;project:string|null;section:string|null;
  title:string;dirty:boolean;writable:boolean;panel:string|null;current:boolean;
}
export interface WorkspacePlace {project:string;sourceSha256:string|null;values:Record<string,unknown>}
export interface SavedWorkspaceWindow {main:boolean;view:{workspace:Workspace;project:string|null;section:string|null;dirty:boolean;documents:string[];places?:WorkspacePlace[]};placement:{x:number;y:number;width:number;height:number};maximized?:boolean;fullscreen?:boolean;ownedDocuments?:string[];writable:boolean;panel:string|null;focusTag:number|null;sourceSha256:string|null}
export interface SavedWorkspaceLayout {schemaVersion:1;windows:SavedWorkspaceWindow[]}
/** Pre-existing v1 profiles only recorded the active map's writer. */
export const wasLayoutWriter=(row:SavedWorkspaceWindow,id:string)=>!!row.ownedDocuments?.includes(id)||(row.writable&&row.view.project===id);
export function useWorkspaceWindows(view:{workspace:Workspace;project:string|null;section:string|null;dirty:boolean;documents:string[]},ready:boolean,capturePlaces:()=>WorkspacePlace[]) {
  const [windows,setWindows]=useState<WorkspaceWindow[]>([]),[error,setError]=useState('');
  const alive=useRef(true),sequence=useRef(0);
  const latest=useRef({view,capturePlaces});latest.current={view,capturePlaces};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
  const refresh=useCallback(async()=>{
    if(!native)return;
    const at=++sequence.current;
    try {const next=await call<WorkspaceWindow[]>('workspace_window_inventory');if(alive.current&&at===sequence.current){setWindows(next);setError('');}}
    catch(e){if(alive.current&&at===sequence.current)setError(String(e));}
  },[]);
  useEffect(()=>{if(!native||!ready)return;let disposed=false;
    const subscription=listen('spark:workspace-windows',()=>void refresh());
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    void refresh();
    return()=>{disposed=true;window.removeEventListener('focus',focus);void subscription.then(unlisten=>{if(disposed)unlisten();});};
  },[ready,refresh]);
  useEffect(()=>{if(!native||!ready)return;
    void call('update_workspace_view',{view}).then(refresh,e=>{if(alive.current)setError(String(e));});
  },[ready,view.workspace,view.project,view.section,view.dirty,view.documents.join('|'),refresh]);
  useEffect(()=>{
    if(!native||!ready)return;
    const subscription=listen<string>('spark:capture-layout',async event=>{
      if(!/^[0-9a-f-]{36}$/i.test(event.payload))return;
      try {
        window.dispatchEvent(new Event('gs:save-viewport-context'));
        window.dispatchEvent(new CustomEvent('guilty-spark-flush-map-view',{detail:latest.current.view.project}));
        await call('update_workspace_view',{view:{...latest.current.view,places:latest.current.capturePlaces()}});
        await emit('spark:layout-captured',{request:event.payload,label:getCurrentWindow().label});
      }catch(reason){setError(String(reason));}
    });
    return()=>{void subscription.then(stop=>stop());};
  },[ready]);
  const capture=useCallback(async()=>{
    const inventory=await call<WorkspaceWindow[]>('workspace_window_inventory'),pending=new Set(inventory.map(w=>w.label));
    const request=crypto.randomUUID();let stop=()=>{},timer:ReturnType<typeof setTimeout>|undefined;
    try {
      let complete=()=>{};
      stop=await listen<{request:string;label:string}>('spark:layout-captured',event=>{
        if(event.payload.request!==request)return;pending.delete(event.payload.label);if(!pending.size)complete();
      });
      const result=new Promise<void>((resolve,reject)=>{
        complete=resolve;timer=setTimeout(()=>reject(Error('A workspace is still loading. Wait for its view, then save the layout again.')),8000);
      });
      await emit('spark:capture-layout',request);await result;
    }finally{clearTimeout(timer);stop();}
  },[]);
  const focus=useCallback(async(label:string)=>{await call('focus_workspace_window',{label});await refresh();},[refresh]);
  return {windows,error,refresh,focus,capture,label:native?getCurrentWindow().label:'browser'};
}
