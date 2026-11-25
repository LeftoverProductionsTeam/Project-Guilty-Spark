import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import type {RuntimeId} from '../types';
import {runtimeNames} from '../runtimeWorkbench';
import {Notice} from './ui';
interface Exported {output:string;sha256:string;bytes:number;cacheVersion:number;runtimeId:RuntimeId;reused:boolean;credits?:string;modeMetadata?:string;gameplayMode?:string}
interface Options {cacheVersion:number;runtimes:RuntimeId[]}
/** Explicit export uses the configured folder. It never installs or converts. */
export default function MapExport({projectId,buildId,runtimeId='mccSteam',onSave}:{projectId:string;buildId:string;runtimeId?:RuntimeId;onSave?:()=>Promise<void>}){
  const [runtime,setRuntime]=useState<RuntimeId|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Exported|null>(null);
  const [open,setOpen]=useState(false),[options,setOptions]=useState<Options|null>(null),[optionsError,setOptionsError]=useState('');
  const generation=useRef(0);
  useLayoutEffect(()=>{generation.current++;setResult(null);setError('');setBusy(false);setRuntime(null);setOptions(null);setOptionsError('');return()=>{generation.current++;};},[projectId,buildId,runtimeId]);
  useEffect(()=>{
    if(!native||!open)return;
    let active=true;
    setOptionsError('');
    void call<Options>('storage_map_export_options',{projectId,buildId}).then(value=>{
      if(!active)return;
      setOptions(value);
      setRuntime(current=>current&&value.runtimes.includes(current)?current:
        value.runtimes.includes(runtimeId)?runtimeId:value.runtimes[0]??null);
    }).catch(reason=>{if(active){setOptions(null);setRuntime(null);setOptionsError(String(reason));}});
    return()=>{active=false;};
  },[open,projectId,buildId,runtimeId]);
  async function exportMap(){
    if(!runtime||!options?.runtimes.includes(runtime)||busy)return;
    const current=generation.current;setBusy(true);setError('');setResult(null);
    try{await onSave?.();if(current!==generation.current)return;const value=await call<Exported>('storage_export_map',{projectId,buildId,runtimeId:runtime});if(current===generation.current)setResult(value);}
    catch(reason){if(current===generation.current)setError(String(reason));}
    finally{if(current===generation.current)setBusy(false);}
  }
  return <details className="map-export" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Export map…</summary>
    <div className="button-row"><select aria-label="Map export runtime" disabled={busy||!runtime} value={runtime??''} onChange={e=>{setRuntime(e.target.value as RuntimeId);setResult(null);setError('');}}>
      {!runtime&&<option value="">{!native?'Desktop export only':options||optionsError?'No export destination':'Checking map format…'}</option>}
      {options?.runtimes.map(id=><option key={id} value={id}>{runtimeNames[id]}</option>)}
    </select><button disabled={!native||busy||!runtime} onClick={()=>void exportMap()}>{busy?'Verifying export…':'Export to mods folder'}</button></div>
    {options&&(options.runtimes.length
      ?<small>Native cache {options.cacheVersion} · destinations match the cache format. Check runtime features before play.</small>
      :<Notice tone="info">Native cache {options.cacheVersion} has no compatible mod-folder destination. Build a compatible conversion to export.</Notice>)}
    {optionsError&&<Notice tone="error">{optionsError}</Notice>}
    <small>Uses Settings → Storage. Keeps the native filename and original files. Credits travel with the export. Record creator and permission details in Preservation record before sharing.</small>
    {result&&<div role="status"><small>{result.reused?'Existing identical export verified.':'Native map exported and hash-verified.'}</small><code>{result.output}</code>{result.modeMetadata && <><small>Game mode · {({zombieSurvival:'Zombie survival',extraction:'Extraction',firefight:'Firefight',campaign:'Campaign',multiplayer:'Multiplayer'} as Record<string,string>)[result.gameplayMode??'']??'Unclassified'}</small><code>{result.modeMetadata}</code></>}{result.credits && <><small>Map attribution and permissions</small><code>{result.credits}</code></>}</div>}
    {error&&<Notice tone="error">{error}</Notice>}
  </details>;
}
