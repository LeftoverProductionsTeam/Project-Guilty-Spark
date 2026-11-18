import {useEffect,useState} from 'react';
import {call,native} from '../api';
import type {Project} from '../types';
interface Snapshot {id:string;createdAt:string;reason:string;sha256:string;title:string;sceneObjects:number;tagEdits:number}
export default function ProjectSnapshots({project,readOnly,onBeforeSave,onRestore}:{project:Project;readOnly:boolean;onBeforeSave:()=>Promise<void>;onRestore:(snapshotId:string,sha256:string)=>Promise<void>}) {
  const [items,setItems]=useState<Snapshot[]>([]),[preview,setPreview]=useState<{info:Snapshot;project:Project}|null>(null);
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function refresh(){setItems(await call<Snapshot[]>('list_project_snapshots',{projectId:project.id}));}
  useEffect(()=>{setPreview(null);setConfirmed(false);if(native)void refresh().catch(e=>setError(String(e)));},[project.id]);
  async function action(f:()=>Promise<void>){setBusy(true);setError('');try{await f();await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <section className="surface gs-snapshots"><h3>Project snapshots</h3><p>Versioned copies of project edits; original maps stay in the managed library. Set this map’s automatic backup limit and review old automatic backups in Settings → Storage. Backup timing is in Games &amp; tools.</p>
    <button disabled={!native||readOnly||busy} onClick={()=>void action(async()=>{await onBeforeSave();await call('create_project_snapshot',{projectId:project.id,reason:'manual'});})}>Create snapshot now</button>
    {items.length===0&&<p>No project snapshots yet.</p>}
    <ul>{items.map(info=><li key={info.id}><span>{new Date(info.createdAt).toLocaleString()} · {info.reason} · {info.title}</span> <button className="small-button" disabled={busy} onClick={()=>void action(async()=>{setConfirmed(false);setPreview({info,project:await call<Project>('preview_project_snapshot',{projectId:project.id,snapshotId:info.id,sha256:info.sha256})});})}>Preview restore</button></li>)}</ul>
    {preview&&<div className="gs-restore-preview" role="region" aria-label="Snapshot restore preview"><h4>Restore “{preview.project.title}”</h4>
      <p>{preview.project.scene.length} scene objects · {preview.project.tagEdits.length} tag edits · {preview.project.quickForge?.geometry.length??0} QuickForge geometry elements · {preview.project.quickForge?.spawns.length??0} player starts.</p>
      <p>Spark backs up your current edits, then restores and saves this version. Undo returns to your previous edits.</p>
      {readOnly&&<p>Choose Edit here in Changes to restore this snapshot.</p>}
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I reviewed this snapshot and want to restore these edits.</label>
      <button disabled={readOnly||busy||!confirmed} onClick={()=>void action(async()=>{await onRestore(preview.info.id,preview.info.sha256);setPreview(null);setConfirmed(false);})}>Confirm restore</button>
      <button className="small-button" disabled={busy} onClick={()=>{setPreview(null);setConfirmed(false);}}>Cancel restore</button>
    </div>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
