import {useEffect,useState} from 'react';
import type {NativeTagContext,NativeOperation,NativeVehicleFlight as Tuning} from '../nativeOperations';
import {Notice} from './ui';
/** The existing native source transaction owns Preview/Accept/Restore and writes. */
export default function NativeVehicleFlight({context,busy,dirty,onPreview,onDraftChange}:{context:NativeTagContext;busy:boolean;dirty:boolean;onPreview:(operation:NativeOperation)=>void;onDraftChange:()=>void}){
 const source=context.vehicleFlight;
 const [values,setValues]=useState(['','','']);
 useEffect(()=>setValues(source?[source.throttle,source.avoidanceDistance,source.pathfindingRadius].map(v=>String(Number(v.toPrecision(7)))):['','','']),[context.tagSha256,source?.throttle,source?.avoidanceDistance,source?.pathfindingRadius]);
 const parsed=values.map(value=>value.trim()?Number(value):NaN);
 const valid=parsed.every((value,i)=>Number.isFinite(value)&&value>=0&&value<=(i===0?1:12));
 const previous=source?[source.throttle,source.avoidanceDistance,source.pathfindingRadius]:[];
 const changed=!!source&&valid&&parsed.some((value,i)=>Math.abs(value-previous[i])>1e-6);
 const blocked=busy||dirty||!source||!!context.vehicleFlightIssue||!!context.editIssue||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'');
 return <details className="native-vehicle-flight"><summary>Native aircraft AI flight settings</summary>
  <p className="subtle">Forerunner uses a native human-plane’s AI throttle, avoidance and pathfinding radius to opt into its pilot controller. This edits the shared vehicle definition for every instance using this tag; it does not change a running aircraft or plan a flight.</p>
  {context.vehicleFlightIssue&&<Notice>{context.vehicleFlightIssue}</Notice>}
  <fieldset disabled={blocked}>
   <div className="native-encounter-position">{(['AI throttle maximum','AI avoidance distance','AI pathfinding radius'] as const).map((label,i)=><label key={label}>{label}<input aria-label={label} type="number" min={0} max={i===0?1:12} step="any" value={values[i]} onChange={event=>{setValues(values.map((v,j)=>j===i?event.target.value:v));onDraftChange();}}/></label>)}</div>
   <button type="button" disabled={!changed||!valid} onClick={()=>onPreview({kind:'vehicleFlight',sourceSha256:context.tagSha256!,tuning:{throttle:parsed[0],avoidanceDistance:parsed[1],pathfindingRadius:parsed[2]} satisfies Tuning})}>Preview native flight settings</button>
  </fieldset>
  {source&&<p className="subtle">{!valid?'Correct the out-of-range or missing values before previewing.':parsed.every(value=>value>0)?'Draft enables the required numeric flight opt-in.':'Zero in any field disables the flight opt-in; use positive values for an authored flight.'} Throttle 0–1; both distances 0–12 Halo world units. Preserve real hull clearance and use keep-moving cruise points followed by stop-at-point final approaches in Native command lists. Native plane AI, collision and landing require gameplay validation.</p>}
  <p className="subtle">Preview → review exact fields → Accept as new source revision → Save → Build working tag edits. Independent readback checks all three compiled values. Native Restore returns the original tag; project Undo is separate. Other vehicles and original assets stay unchanged.</p>
 </details>;
}
