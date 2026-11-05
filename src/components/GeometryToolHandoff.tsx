import {useEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import {useMapState} from '../mapSession';
import {useWorkspaceActivity} from './WorkspaceActivity';
import {HelpTip,Notice} from './ui';
interface Prepared{handoff:{id:string;assetId:string;baselineSha256:string};workingPath:string}
interface Review extends Prepared{sha256:string;changed:boolean;vertices:number;triangles:number;completeUvs:boolean;materials:string[];warnings:string[]}
/** External saves remain a private fork until the ordinary, hash-bound import.
 * Neither a matching timestamp nor a launched process proves writer identity. */
export default function GeometryToolHandoff({projectId,assetId,onImport}:{projectId:string;assetId:string;onImport:(path:string,sha:string)=>Promise<void>}){
  const [id,setId]=useMapState(projectId,`geometry.handoff.${assetId}`,'');
  const [review,setReview]=useState<Review|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const activity=useWorkspaceActivity(),working=useRef(false),polling=useRef<Promise<void>|null>(null);
  useEffect(()=>{
    if(!native||!id||!activity.active)return;
    let alive=true,last='',stable='';
    const poll=()=>{
      if(working.current||polling.current)return;
      polling.current=(async()=>{
      try{
        const stamp=await call<{bytes:number;modifiedNanos:string}>('geometry_handoff_status',{projectId,id});
        const key=JSON.stringify(stamp);
        if(key===last&&key!==stable){
          const value=await call<Review>('review_geometry_handoff',{projectId,id});
          if(alive){setReview(value);setError('');stable=key;if(value.changed)setMessage('External geometry save detected. Review and import the revised copy. Writer identity is unconfirmed.');}
        }
        last=key;
      }catch(reason){if(alive){setReview(null);setError(String(reason));}}
      finally{polling.current=null;}
      })();
    };
    void poll();const timer=setInterval(()=>void poll(),2000);return()=>{alive=false;clearInterval(timer);};
  },[projectId,id,activity.active]);
  // Reserve an explicit action before waiting for the read-only poll. A slow
  // status request must not silently consume an enabled Review/Import click.
  async function run(action:()=>Promise<void>){if(working.current)return;working.current=true;setBusy(true);setError('');try{await polling.current;await action();}catch(reason){setError(String(reason));}finally{setBusy(false);working.current=false;}}
  return <section className="geometry-tool-handoff" aria-label="External geometry handoff">
    <div className="button-row"><button disabled={!native||busy} onClick={()=>void run(async()=>{const prepared=await call<Prepared>('prepare_geometry_handoff',{projectId,assetId});setId(prepared.handoff.id);setReview(null);setMessage('One OBJ copied; original and immutable baseline retained. Open Blender, import working.obj, edit, and export OBJ to the same working path.');})}>{id?'Prepare another geometry fork':'Prepare Blender edit'}</button><HelpTip label="Explain Blender geometry handoff" help="Edit a private OBJ copy in Blender. Saving it is detected while this workspace is active. Review and import creates a new asset through the normal Undo path. The original stays intact. MTL images, rigs and animation are not imported by OBJ."/></div>
    {id&&<>
      <div className="button-row"><button disabled={busy} onClick={()=>void run(async()=>setMessage(await call<string>('launch_geometry_tool',{projectId,id})))}>Open Blender</button><button disabled={busy} onClick={()=>void run(async()=>{const value=await call<Review>('review_geometry_handoff',{projectId,id});setReview(value);setMessage(value.changed?'Validated external geometry; native compilation is still required.':'No geometry save differs from the preserved baseline.');})}>Review geometry save</button></div>
      {review&&<><label>Blender OBJ working file<input aria-label="Blender OBJ working file" readOnly value={review.workingPath} onFocus={event=>event.currentTarget.select()}/></label><small>{review.vertices} vertices · {review.triangles} triangles · {review.completeUvs?'Complete UVs':'UVs incomplete — native build blocked'} · {review.materials.join(', ')}</small>
        <button disabled={busy||!review.changed} onClick={()=>void run(async()=>{await onImport(review.workingPath,review.sha256);})}>Import reviewed geometry copy</button>
        {review.warnings.map(w=><small key={w}>{w}</small>)}</>}
    </>}
    {message&&<small role="status">{message}</small>}{error&&<Notice tone="error">{error} The original asset and baseline remain unchanged.</Notice>}
  </section>;
}
