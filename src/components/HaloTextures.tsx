import {useEffect,useRef,useState} from 'react';
import {call} from '../api';
import {textureResourceScope} from '../textureResourceScope';
import type {OpenProject,Project} from '../types';
interface Candidate {path:string;reason:string;sha256?:string|null;error?:string|null;coverage?:{
  verifiedImages:number;missingOrMismatchedImages:number;unsupportedImages:number;internalImages:number;
}|null}
interface CandidateReview {projectId:string;sourceSha256:string;candidates:Candidate[]}
export default function HaloTextures({project,onConnected,onBeforeConnect,notify}:{project:Project;
  onConnected?: (open:OpenProject)=>Promise<void>;onBeforeConnect?:()=>Promise<void>;notify:(message:string)=>void}) {
  const [path,setPath]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]);
  const [busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[message,setMessage]=useState('');
  const classic=!!project.source&&[6,7,609].includes(project.source.cacheVersion);
  const context=project.id+':'+textureResourceScope(project.source),current=useRef(context);
  current.current=context;
  useEffect(()=>{let live=true;setPath('');setMessage('');setCandidates([]);setReviewed(false);setBusy(false);
    if(classic)void call<Candidate[]>('bitmap_resource_candidates',{projectId:project.id})
      .then(value=>{if(live)setCandidates(value);}).catch(()=>{if(live)setCandidates([]);});
    return ()=>{live=false;};},[context,classic]);
  async function review() {
    const started=current.current;
    setBusy(true);setMessage('Checking exact image indexes in found resource files…');
    try {
      const result=await call<CandidateReview>('review_bitmap_resource_candidates',{projectId:project.id});
      if(current.current!==started)return;
      if(result.projectId!==project.id||result.sourceSha256!==project.source?.sha256)throw Error('Source changed during the resource check. Check again.');
      setCandidates(result.candidates);setReviewed(true);
      setMessage('Checked per image. Partial resources leave missing or unsupported images visible.');
    }catch(error){if(current.current===started)setMessage(String(error));}
    finally{if(current.current===started)setBusy(false);}
  }
  async function connect(mode:'file'|'folder'|'path',selected?:string) {
    const started=current.current;
    setBusy(true);setMessage('Checking the source and resource index…');
    try {
      await onBeforeConnect?.();
      if(current.current!==started)return;
      const result=await call<OpenProject|null>('connect_halo_textures',{projectId:project.id,mode,path:selected??path});
      if(current.current!==started)return;
      if(result){await onConnected?.(result);setMessage('Checked resource connected. Missing images remain in texture diagnostics.');notify('Halo texture resources connected; each image is checked separately.');}
      else setMessage('Selection canceled.');
    }catch(error){if(current.current===started)setMessage(String(error));}
    finally{if(current.current===started)setBusy(false);}
  }
  return <section className="gs-texture-connection" aria-label="Halo Textures">
    <h3>Halo Textures</h3>
    <p>Embedded images load from the map. External images need a matching resource index and byte range.</p>
    {classic?<>
      <div className="analysis-actions"><button disabled={busy} onClick={()=>void connect('file')}>Locate Halo Textures</button>
        <button disabled={busy} className="small-button" onClick={()=>void connect('folder')}>Choose resource folder</button></div>
      <details><summary>Found resources · {candidates.length}</summary>
        <button disabled={busy||!candidates.length} className="small-button" onClick={()=>void review()}>{reviewed?'Recheck image coverage':'Check image coverage'}</button>
        <div className="gs-texture-candidates">{candidates.map(c=><article key={c.path}>
          <strong>{c.reason}</strong><code className="path-text">{c.path}</code>
          {c.coverage?<p className="gs-texture-coverage">{c.coverage.verifiedImages} verified · {c.coverage.missingOrMismatchedImages} missing / mismatched · {c.coverage.unsupportedImages} unsupported · {c.coverage.internalImages} embedded</p>:reviewed&&<p role="note">No verified external images. {c.error}</p>}
          <button disabled={busy||(reviewed&&!c.coverage)} className="small-button" onClick={()=>void connect('path',c.path)}>{c.coverage&&(c.coverage.missingOrMismatchedImages>0||c.coverage.unsupportedImages>0)?'Connect partial resources':'Verify and connect'}</button>
        </article>)}</div>
      </details>
      <details><summary>Paste a resource path</summary><label>bitmaps.map or its folder<input aria-label="Halo Textures path" value={path} onChange={e=>setPath(e.target.value)} placeholder="C:\Games\Halo\maps\bitmaps.map"/></label><button disabled={busy||!path.trim()} onClick={()=>void connect('path')}>Verify Halo Textures</button></details>
      <small>{project.source?.resourceSha256?.['bitmaps.map']?'Pinned resource location is remembered. Automatic recovery requires the same recorded hashes.':'Automatic selection requires no missing supported external images. Partial candidates can be reviewed here.'}</small>
    </>:<p>MCC Halo 1 uses installed .imeta and .ipak texture resources, verified and connected automatically when its map opens.</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
