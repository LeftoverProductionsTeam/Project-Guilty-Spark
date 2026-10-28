import {useEffect,useState} from 'react';
import {call} from '../api';
import type {OpenProject,Project} from '../types';
export default function HaloTextures({project,onConnected,onBeforeConnect,notify}:{project:Project;
  onConnected?: (open:OpenProject)=>Promise<void>;onBeforeConnect?:()=>Promise<void>;notify:(message:string)=>void}) {
  const [path,setPath]=useState(''),[candidates,setCandidates]=useState<{path:string;reason:string}[]>([]);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const classic=!!project.source&&[6,7,609].includes(project.source.cacheVersion);
  useEffect(()=>{let live=true;setPath('');setMessage('');
    if(classic)void call<{path:string;reason:string}[]>('bitmap_resource_candidates',{projectId:project.id})
      .then(value=>{if(live)setCandidates(value);}).catch(()=>{if(live)setCandidates([]);});
    return ()=>{live=false;};},[project.id,classic]);
  async function connect(mode:'file'|'folder'|'path',selected?:string) {
    setBusy(true);setMessage('Checking the source and resource index…');
    try {
      await onBeforeConnect?.();
      const result=await call<OpenProject|null>('connect_halo_textures',{projectId:project.id,mode,path:selected??path});
      if(result){await onConnected?.(result);setMessage('Halo Textures connected. Load material previews above.');notify('Halo Textures verified and connected to this map.');}
      else setMessage('Selection canceled.');
    }catch(error){setMessage(String(error));}finally{setBusy(false);}
  }
  return <section className="gs-texture-connection" aria-label="Halo Textures">
    <h3>Halo Textures</h3>
    <p>Shared images used by some Halo maps. Choose the original resource file that belongs to this map. Self-contained maps load their own images.</p>
    {classic?<>
      <div className="analysis-actions"><button disabled={busy} onClick={()=>void connect('file')}>Locate Halo Textures</button>
        <button disabled={busy} className="small-button" onClick={()=>void connect('folder')}>Choose resource folder</button></div>
      {candidates.length>0&&<details><summary>Found {candidates.length} possible resource files</summary>{candidates.map(c=><div key={c.path}><p>{c.reason}<br/><code className="path-text">{c.path}</code></p><button disabled={busy} className="small-button" onClick={()=>void connect('path',c.path)}>Verify and connect this file</button></div>)}</details>}
      <details><summary>Paste a resource path</summary><label>bitmaps.map or its folder<input aria-label="Halo Textures path" value={path} onChange={e=>setPath(e.target.value)} placeholder="C:\Games\Halo\maps\bitmaps.map"/></label><button disabled={busy||!path.trim()} onClick={()=>void connect('path')}>Verify Halo Textures</button></details>
      <small>{project.source?.resourceSha256?.['bitmaps.map']?'A resource file is pinned to this project. Each image must also pass the exact path and range checks.':'A resource file is only needed for external images.'}</small>
    </>:<p>MCC Halo 1 uses its installed .imeta and .ipak texture resources. Spark verifies and connects these automatically when you open an MCC map. Extracted local images can also be matched in the material inspector.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
