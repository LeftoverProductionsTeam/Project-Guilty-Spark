import {useEffect,useState} from 'react';
import {call,native} from '../api';
import type {OpenProject,Project} from '../types';
interface Snapshot {id:string;createdAt:string;reason:string;sha256:string;title:string;sceneObjects:number;tagEdits:number}
export default function ProjectSnapshots({project,onBeforeSave,onRestore}:{project:Project;onBeforeSave:()=>Promise<void>;onRestore:(p:OpenProject)=>Promise<void>}) {
  const [items,setItems]=useState<Snapshot[]>([]),[preview,setPreview]=useState<{info:Snapshot;project:Project}|null>(null);
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function refresh(){setItems(await call<Snapshot[]>('list_project_snapshots',{projectId:project.id}));}
  useEffect(()=>{setPreview(null);setConfirmed(false);if(native)void refresh().catch(e=>setError(String(e)));},[project.id]);
  async function action(f:()=>Promise<void>){setBusy(true);setError('');try{await f();await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="surface gs-snapshots"><h3>Project snapshots</h3><p>Versioned copies of your project edits. The original map and asset files stay in the managed library. Periodic snapshots default to every 10 minutes; interval and retention are in Settings.</p>
    <button disabled={!native||busy} onClick={()=>void action(async()=>{await onBeforeSave();await call('create_project_snapshot',{projectId:project.id,reason:'manual'});})}>Create snapshot now</button>
    {items.length===0&&<p>No project snapshots yet.</p>}
    <ul>{items.map(info=><li key={info.id}><span>{new Date(info.createdAt).toLocaleString()} · {info.reason} · {info.title}</span> <button className="small-button" disabled={busy} onClick={()=>void action(async()=>{setConfirmed(false);setPreview({info,project:await call<Project>('preview_project_snapshot',{projectId:project.id,snapshotId:info.id,sha256:info.sha256})});})}>Preview restore</button></li>)}</ul>
    {preview&&<div className="gs-restore-preview" role="region" aria-label="Snapshot restore preview"><h4>Restore “{preview.project.title}”</h4>
      <p>{preview.project.scene.length} scene objects · {preview.project.tagEdits.length} tag edits · {preview.project.quickForge?.geometry.length??0} QuickForge geometry elements · {preview.project.quickForge?.spawns.length??0} player starts.</p>
      <p>Restoring replaces the current project edits. Spark first snapshots the current saved state; source maps are never replaced.</p>
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed this snapshot and want to restore these edits.</label>
      <button disabled={busy||!confirmed} onClick={()=>void action(async()=>{await onBeforeSave();const open=await call<OpenProject>('restore_project_snapshot',{projectId:project.id,snapshotId:preview.info.id,sha256:preview.info.sha256,confirmed});await onRestore(open);setPreview(null);setConfirmed(false);})}>Confirm restore</button>
      <button className="small-button" onClick={()=>{setPreview(null);setConfirmed(false);}}>Cancel restore</button>
    </div>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
