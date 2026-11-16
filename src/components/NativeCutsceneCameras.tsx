import {useEffect,useRef,useState} from 'react';
import {useMapState,readMapSession} from '../mapSession';
import {NATIVE_CAMERA_VIEW,nativeCameraMatches,cameraDraft,cameraPoint,cameraClose,cameraFromViewport} from '../nativeCutsceneCamera';
import type {NativeCameraView} from '../nativeCutsceneCamera';
import type {NativeTagContext,NativeOperation} from '../nativeOperations';
import {Notice} from './ui';
export default function NativeCutsceneCameras({context,busy,dirty,onPreview,onDraftChange,onLevelEditor}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(op:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void}){
 const [view,setView]=useMapState<NativeCameraView|null>(context.projectId,NATIVE_CAMERA_VIEW,()=>null),[selected,setSelected]=useState(0),[error,setError]=useState('');
 const details=useRef<HTMLDetailsElement>(null),review=useRef(0),points=context.scenarioCameras??[];
 const owns=!!view&&nativeCameraMatches(view,context),original=points.find(p=>p.index===(owns?view.original.index:selected))??points[0];
 const draft=original?(owns?view:{...cameraDraft(original),original}):null,point=draft?cameraPoint(draft):null,changed=!!point&&!!original&&!cameraClose(point,original);
 const blocked=busy||dirty||!!context.cameraEditIssue||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'');
 useEffect(()=>{if(view&&!nativeCameraMatches(view,context))setView(null);},[context]);
 useEffect(()=>{onDraftChange();},[JSON.stringify(view)]);
 useEffect(()=>{if(owns&&view.reviewRequest&&review.current!==view.reviewRequest){review.current=view.reviewRequest;if(details.current){details.current.open=true;details.current.querySelector<HTMLInputElement>('[aria-label="Cutscene camera X"]')?.focus();}}},[context,view?.reviewRequest]);
 function update(patch:Partial<NativeCameraView>){if(!original||!draft||!context.tagSha256)return;setError('');setView({projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,active:false,focus:0,...(owns?view:{}),...draft,...patch});onDraftChange();}
 function capture(){if(blocked||!original)return;window.dispatchEvent(new CustomEvent('guilty-spark-flush-map-view',{detail:context.projectId}));const next=cameraFromViewport(original,readMapSession(context.projectId,'camera.world.PerspectiveCamera',null));if(!next){setError('Open the Level Editor in perspective, position its camera, then return here. A current pose and supported lens are required.');return;}update(cameraDraft(next));}
 return <details className="native-cutscene-cameras" ref={details}><summary>Existing cutscene cameras · {points.length}</summary>
  <p className="subtle">Adjust an existing native camera while keeping its name, index and script references. Preview edits source only; runtime cutscene timing and playback require game testing.</p>
  {context.cameraEditIssue&&<Notice tone="info">{context.cameraEditIssue}</Notice>}
  {!!points.length&&original&&draft&&<><label>Camera point<select aria-label="Native cutscene camera" value={original.index} disabled={busy||dirty} onChange={e=>{setSelected(Number(e.target.value));setView(null);setError('');onDraftChange();}}>{points.map(p=><option key={p.index} value={p.index}>{p.index} · {p.name||'Unnamed camera'}</option>)}</select></label>
   <fieldset disabled={blocked}><legend>Pose & lens</legend><div className="native-field-edit">{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}<input aria-label={'Cutscene camera '+axis} type="number" step="any" value={draft.position[i]} onChange={e=>{const next=[...draft.position] as NativeCameraView['position'];next[i]=e.target.value;update({position:next});}}/></label>)}</div>
   <div className="native-field-edit">{(['Yaw','Pitch','Roll'] as const).map((axis,i)=><label key={axis}>{axis} °<input aria-label={'Cutscene camera '+axis.toLowerCase()} type="number" step="any" min={-360} max={360} value={draft.angles[i]} onChange={e=>{const next=[...draft.angles] as NativeCameraView['angles'];next[i]=e.target.value;update({angles:next});}}/></label>)}<label>FOV °<input aria-label="Cutscene camera FOV" type="number" min={5} max={150} step="any" value={draft.fov} onChange={e=>update({fov:e.target.value})}/></label></div></fieldset>
   {!point&&<Notice tone="info">Enter finite XYZ within ±1,000,000, angles within ±360° and FOV5–150°.</Notice>}{error&&<Notice>{error}</Notice>}
   {!onLevelEditor&&<Notice tone="info">Viewport preview/capture needs an opened native map. For generated source, author shots in Creator Studio / Machinima or open its compiled map.</Notice>}
   <div className="button-row"><button disabled={blocked||!point||!onLevelEditor} onClick={()=>{update({active:true,focus:Date.now()});onLevelEditor?.();}}>View cutscene camera in Level Editor</button><button disabled={blocked||!onLevelEditor} onClick={capture}>Use Level Editor camera</button>
    <button disabled={blocked||!changed} onClick={()=>onPreview({kind:'cutsceneCamera',point:point!,sourceSha256:context.tagSha256!})}>Preview native camera edit</button><button disabled={busy||!owns} onClick={()=>{setView(null);onDraftChange();}}>Reset camera draft</button></div>
   <p className="subtle">View the shot, fly/orbit to adjust it, return to this source and Use Level Editor camera. Preview → Accept → Save → restart → Build working tag edits. Native Restore selects the complete earlier source, independently of project Undo. Unaccepted camera drafts are temporary and window-local.</p>
  </>}{!points.length&&!context.cameraEditIssue&&<p className="subtle">This source has no cutscene cameras. Author new shots in Creator Studio / Machinima; existing-point edits do not append or rename references.</p>}
 </details>;
}