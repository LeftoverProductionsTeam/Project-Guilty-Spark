import {useEffect,useRef} from 'react';
import {useMapState} from '../mapSession';
import {NATIVE_AI_START_VIEW,nativeAiStartKey,nativeAiStartMatches,nativeAiStartPosition,nativeAiStartFacing,nativeAiFacingDegrees} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import {nativePatrolEqual,nativePatrolIssue} from '../nativeOperations';
import type {NativeSourcePatrolRoute,NativeSourcePatrolPoint,NativeSquadBehavior,NativeScenarioSquad,NativeTagContext,NativeOperation} from '../nativeOperations';
import {Notice} from './ui';

/** The existing window-local AI proposal owns the route and its selected gizmo. */
export default function NativeSquadPatrol({context,squadChoice,source,behavior,issue,busy,dirty,onPreview,onDraftChange,onLevelEditor}:{context:NativeTagContext;squadChoice:NativeScenarioSquad;source?:NativeSourcePatrolRoute|null;behavior?:NativeSquadBehavior|null;issue?:string|null;busy:boolean;dirty:boolean;onPreview:(op:NativeOperation)=>void;onDraftChange:()=>void;onLevelEditor?:()=>void}){
 const [view,setView]=useMapState<NativeAiStartView|null>(context.projectId,NATIVE_AI_START_VIEW,()=>null);
 const detail=useRef<HTMLDetailsElement>(null),lastReview=useRef(0);
 const owns=view?.kind==='patrol'&&view.encounter===squadChoice.encounter&&view.squad===squadChoice.squad&&nativeAiStartMatches(view,context);
 const index=owns?view.start:0,raw=owns?view.patrol!.route:source;
 const route=raw?structuredClone(raw):undefined,point=route?.points[index];
 const values=owns?view.values:point?.position.map(String) as [string,string,string]|undefined;
 const heading=owns?view.facingDegrees:point?nativeAiFacingDegrees(point.facingRadians):undefined;
 const position=nativeAiStartPosition(values),facing=nativeAiStartFacing(heading),validPose=!point||!!position&&facing!==null;
 if(point&&position&&facing!==null){point.position=position;point.facingRadians=facing;}
 const invalid=!validPose?'Finish the selected point’s coordinates and facing before previewing or selecting another point.':route&&source?nativePatrolIssue(route,source,behavior):null;
 const changed=!!source&&!!route&&!nativePatrolEqual(route,source),disabled=busy||dirty||!!issue;
 useEffect(()=>{if(view?.kind==='patrol'&&!nativeAiStartMatches(view,context))setView(null);},[context]);
 useEffect(()=>{if(owns&&view.locked!==(dirty||!!issue))setView({...view,locked:dirty||!!issue});},[owns,dirty,issue,view]);
 useEffect(()=>{if(owns)onDraftChange();},[owns,JSON.stringify(view?.patrol),JSON.stringify(view?.values),view?.facingDegrees]);
 useEffect(()=>{
  if(!owns||!view.reviewRequest||lastReview.current===view.reviewRequest)return;
  lastReview.current=view.reviewRequest;
  if(detail.current){detail.current.open=true;const parent=detail.current.closest<HTMLDetailsElement>('.native-squad-difficulty');if(parent)parent.open=true;detail.current.querySelector<HTMLInputElement>('[aria-label="Native patrol X"]')?.focus();}
 },[owns,view?.reviewRequest]);
 function draft(next:NativeSourcePatrolRoute,selected:number,options:Partial<Pick<NativeAiStartView,'active'|'focus'|'values'|'facingDegrees'|'mode'>>={}){
  if(!source||!context.tagSha256)return;const p=next.points[selected];
  const old=p?.sourceIndex!=null?source.points[p.sourceIndex]:undefined;
  const key=nativeAiStartKey(context,squadChoice.encounter,squadChoice.squad,selected,'patrol');
  setView({kind:'patrol',key,projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256,
   encounter:squadChoice.encounter,squad:squadChoice.squad,encounterName:squadChoice.encounterName,squadName:squadChoice.name,start:selected,
   patrol:{source:structuredClone(source),route:structuredClone(next)},original:old?.position??(owns&&view.key===key?view.original:p?.position)??[0,0,0],
   originalFacingRadians:old?.facingRadians??(owns&&view.key===key?view.originalFacingRadians:p?.facingRadians)??0,
   values:options.values??p?.position.map(String) as [string,string,string]??['0','0','0'],facingDegrees:options.facingDegrees??(p?nativeAiFacingDegrees(p.facingRadians):'0'),
   active:!!p&&(options.active??(owns&&view.active)??false),focus:options.focus??(owns?view.focus:0),mode:options.mode??(owns?view.mode:'translate'),locked:dirty||!!issue,reviewRequest:owns?view.reviewRequest:undefined});
  onDraftChange();
 }
 function update(patch:Partial<NativeSourcePatrolPoint>){if(route&&point){route.points[index]={...point,...patch};draft(route,index);}}
 function move(offset:number){if(!route||!point||index+offset<0||index+offset>=route.points.length)return;[route.points[index],route.points[index+offset]]=[route.points[index+offset],route.points[index]];draft(route,index+offset);}
 const numeric=(text:string)=>text.trim()?Number(text):NaN;
 return <details className="native-squad-patrol" ref={detail}><summary>Native patrol route</summary>
  <p className="subtle">Edit ordered movement positions in this source squad. Existing animation and sequence references follow copied/moved rows. Preview and Accept select a separate native source revision; this does not generate navigation or prove AI movement.</p>
  {issue&&<Notice tone="info">{issue}</Notice>}
  {route&&source?<><fieldset disabled={disabled}><legend>Movement positions · {route.points.length} /32</legend>
   <label>Point<select aria-label="Native patrol point" disabled={!validPose||!point} value={index} onChange={e=>draft(route,Number(e.target.value))}>{route.points.map((p,i)=><option key={i} value={i}>{i} · {p.sourceIndex===null?'new':'source '+p.sourceIndex}</option>)}</select></label>
   <div className="button-row"><button disabled={route.points.length>=32||!validPose} onClick={()=>{const seed=point?.position??squadChoice.starts?.[0]?.position??[0,0,0];const next:NativeSourcePatrolPoint={sourceIndex:null,position:[...seed],facingRadians:0,weight:1,waitSeconds:[0,0],animation:-1,sequenceId:0};draft({points:[...route.points,next]},route.points.length);}}>Add patrol point</button>
   <button disabled={!point||route.points.length>=32||!validPose} onClick={()=>{const next=[...route.points];next.splice(index+1,0,structuredClone(point!));draft({points:next},index+1);}}>Duplicate patrol point</button>
   <button disabled={!point||index===0||!validPose} onClick={()=>move(-1)}>Move point earlier</button><button disabled={!point||index===route.points.length-1||!validPose} onClick={()=>move(1)}>Move point later</button>
   <button disabled={!point||!validPose} onClick={()=>draft({points:route.points.filter((_,i)=>i!==index)},Math.max(0,index-1))}>Remove patrol point</button></div>
   {point&&<><div className="native-field-edit">{(['X','Y','Z'] as const).map((axis,i)=><label key={axis}>{axis}<input aria-label={'Native patrol '+axis} type="number" step="any" value={values?.[i]??''} onChange={e=>{const next=[...values!] as [string,string,string];next[i]=e.target.value;draft(route,index,{values:next,facingDegrees:heading});}}/></label>)}</div>
   <div className="native-field-edit"><label>Facing °<input aria-label="Native patrol facing degrees" type="number" min={-360} max={360} step="any" value={heading??''} onChange={e=>draft(route,index,{values,facingDegrees:e.target.value})}/></label>
   <label>Weight<input aria-label="Native patrol weight" type="number" min={0} step="any" value={Number.isFinite(point.weight)?point.weight:''} onChange={e=>update({weight:numeric(e.target.value)})}/></label>
   {(['Minimum','Maximum'] as const).map((name,i)=><label key={name}>{name} wait · seconds<input aria-label={'Native patrol '+name.toLowerCase()+' wait'} type="number" min={0} step="any" value={Number.isFinite(point.waitSeconds[i])?point.waitSeconds[i]:''} onChange={e=>{const next=[...point.waitSeconds] as [number,number];next[i]=numeric(e.target.value);update({waitSeconds:next});}}/></label>)}</div>
   <p className="subtle">Native animation {point.animation} / sequence {point.sequenceId} · preserved. Weight and wait bounds are engine inputs; actual timing and route reachability require gameplay validation.</p>
   <label>Viewport tool<select aria-label="Native patrol viewport tool" value={owns?view.mode??'translate':'translate'} onChange={e=>draft(route,index,{mode:e.target.value as 'translate'|'rotate'})}><option value="translate">Move position</option><option value="rotate">Rotate facing · native Z yaw</option></select></label></>}
  </fieldset>
  {invalid&&<Notice tone="info">{invalid}</Notice>}
  <div className="button-row"><button disabled={disabled||!point||!validPose||!context.tagSha256} onClick={()=>{draft(route,index,{active:true,focus:Date.now()});onLevelEditor?.();}}>Show patrol handles in Level Editor</button>
   <button disabled={disabled||!!invalid||!changed||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')} onClick={()=>onPreview({kind:'encounterSquadPatrol',encounter:squadChoice.encounter,squad:squadChoice.squad,encounterName:squadChoice.encounterName,squadName:squadChoice.name,route:structuredClone(route),sourceSha256:context.tagSha256!})}>Preview native patrol</button>
   <button disabled={busy||!owns} onClick={()=>{setView(null);onDraftChange();}}>Reset patrol draft</button></div>
  <p className="subtle">Unaccepted route drafts are window-local and are not saved. Accept → Save → restart → Build working tag edits → inspect the compiled route. Restore before-edit tag restores the complete earlier source, independently of project Undo.</p>
  </>:!issue&&<p className="subtle">Native patrol telemetry unavailable; no route is assumed.</p>}
 </details>;
}
