import {useCallback,useEffect,useRef,useState} from 'react';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {call,native} from './api';
import type {Workspace} from './types';
export interface WorkspaceWindow {
  label:string;workspace:Workspace|null;project:string|null;section:string|null;
  title:string;dirty:boolean;writable:boolean;panel:string|null;current:boolean;
}
export interface SavedWorkspaceLayout {schemaVersion:1;windows:{main:boolean;view:{workspace:Workspace;project:string|null;section:string|null;dirty:boolean;documents:string[]};placement:{x:number;y:number;width:number;height:number};writable:boolean;panel:string|null;focusTag:number|null;sourceSha256:string|null}[]}
export function useWorkspaceWindows(view:{workspace:Workspace;project:string|null;section:string|null;dirty:boolean;documents:string[]},ready:boolean) {
  const [windows,setWindows]=useState<WorkspaceWindow[]>([]),[error,setError]=useState('');
  const alive=useRef(true),sequence=useRef(0);
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
  const focus=useCallback(async(label:string)=>{await call('focus_workspace_window',{label});await refresh();},[refresh]);
  return {windows,error,refresh,focus,label:native?getCurrentWindow().label:'browser'};
}
