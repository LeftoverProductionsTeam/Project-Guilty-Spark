import {useLayoutEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import type {RuntimeId} from '../types';
import {runtimeNames} from '../runtimeWorkbench';
import {Notice} from './ui';
interface Exported {output:string;sha256:string;bytes:number;cacheVersion:number;runtimeId:RuntimeId;reused:boolean}
/** Explicit export uses the configured folder. It never installs or converts. */
export default function MapExport({projectId,buildId,runtimeId='mccSteam',onSave}:{projectId:string;buildId:string;runtimeId?:RuntimeId;onSave?:()=>Promise<void>}){
  const [runtime,setRuntime]=useState(runtimeId),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<Exported|null>(null);
  const generation=useRef(0);
  useLayoutEffect(()=>{generation.current++;setResult(null);setError('');setBusy(false);setRuntime(runtimeId);return()=>{generation.current++;};},[projectId,buildId,runtimeId]);
  async function exportMap(){
    const current=generation.current;setBusy(true);setError('');setResult(null);
    try{await onSave?.();if(current!==generation.current)return;const value=await call<Exported>('storage_export_map',{projectId,buildId,runtimeId:runtime});if(current===generation.current)setResult(value);}
    catch(reason){if(current===generation.current)setError(String(reason));}
    finally{if(current===generation.current)setBusy(false);}
  }
  return <details className="map-export"><summary>Export map…</summary>
    <div className="button-row"><select aria-label="Map export runtime" disabled={busy} value={runtime} onChange={e=>{setRuntime(e.target.value as RuntimeId);setResult(null);setError('');}}>
      {(['mccSteam','haloCustomEdition','openCe','chupathingyCe'] as RuntimeId[]).map(id=><option key={id} value={id}>{runtimeNames[id]}</option>)}
    </select><button disabled={!native||busy} onClick={()=>void exportMap()}>{busy?'Verifying export…':'Export to mods folder'}</button></div>
    <small>Uses Settings → Storage. Keeps the native filename and original files. Exporting does not convert or install a map.</small>
    {result&&<div role="status"><small>{result.reused?'Existing identical export verified.':'Native map exported and hash-verified.'}</small><code>{result.output}</code></div>}
    {error&&<Notice tone="error">{error}</Notice>}
  </details>;
}
