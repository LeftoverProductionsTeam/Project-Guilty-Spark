import {useEffect,useRef,useState} from 'react';
import {call,native} from '../api';
import type {NativeCommandGeometryReview,NativeCommandList,NativeTagContext} from '../nativeOperations';
import {Notice,NumberField} from './ui';
/** Compiled reference and explicit coordinate-draft corrections; native writes stay in source review. */
export default function NativeBspPointCheck({context,points,manualBsp,disabled,label,onSelect,onGround,selectionKey,commandRoute}:{context:NativeTagContext;points:[number,number,number][];manualBsp?:number;disabled:boolean;label:string;onSelect?:(index:number)=>void;onGround?:(index:number,point:[number,number,number])=>void;selectionKey?:string;commandRoute?:NativeCommandList}){
 const [findGround,setFindGround]=useState(false),[drop,setDrop]=useState(16);
 const groundDrop=findGround&&onGround?drop:undefined;
 const [start,setStart]=useState<{key:string|undefined;mode:string;xyz:string[]}|null>(null);
 const originMode=start&&start.key===selectionKey?start.mode:'';
 const xyz=start&&start.key===selectionKey?start.xyz:['','',''];
 const vehicles=context.scenarioDevices?.filter(row=>row.class==='vehi')??[];
 const routeOrigin=originMode==='custom'
  ?xyz.map(value=>value.trim()?Number(value):NaN) as [number,number,number]
  :vehicles.find(vehicle=>String(vehicle.index)===originMode)?.position;
 const key=JSON.stringify([context.projectId,context.buildId,context.tagSha256,selectionKey,manualBsp,points,groundDrop,commandRoute,originMode,routeOrigin]);const latest=useRef(key);latest.current=key;
 const generation=useRef(0);const [checking,setChecking]=useState(false),[error,setError]=useState('');const [review,setReview]=useState<{key:string;value:NativeCommandGeometryReview}|null>(null);
 useEffect(()=>{generation.current++;setChecking(false);setError('');return()=>{generation.current++;};},[key]);
 const finitePoint=(point:number[])=>point.length===3&&point.every(value=>Number.isFinite(value)&&Math.abs(value)<=1e6);
 const valid=points.length>0&&points.length<=64&&points.every(finitePoint)&&
  (!originMode||!!routeOrigin&&finitePoint(routeOrigin))&&(groundDrop===undefined||Number.isFinite(groundDrop)&&groundDrop>=.5&&groundDrop<=64);
 async function check(){
  if(!native||disabled||checking||!valid||!context.tagSha256)return;const request=++generation.current,selection=key;setChecking(true);setError('');setReview(null);
  try{const value=await call<NativeCommandGeometryReview>('native_scenario_geometry',{projectId:context.projectId,expectedBuildId:context.buildId,expectedTagSha256:context.tagSha256,points,...(groundDrop!==undefined?{groundDrop}:{}),...(commandRoute?{commandRoute,routeOrigin}:{} )});
   if(request!==generation.current||latest.current!==selection)return;
   if(value.buildId!==context.buildId||value.tagSha256!==context.tagSha256||!/^[a-f0-9]{64}$/i.test(value.outputSha256)||!Array.isArray(value.points)||value.points.length!==points.length||value.points.some((row,i)=>!Array.isArray(row.point)||row.point.length!==3||row.point.some((n,k)=>Math.fround(n)!==Math.fround(points[i][k]))||!Array.isArray(row.bsps)||row.bsps.some(n=>!Number.isInteger(n)||n<0||n>=16)||!Array.isArray(row.supports)||row.supports.some(s=>!Number.isInteger(s.bsp)||s.bsp<0||s.bsp>=16||!Number.isFinite(s.z))))throw Error('BSP review belongs to a different native source or coordinate revision; review again.');
   if(groundDrop!==undefined&&(Math.fround(value.groundDrop??NaN)!==Math.fround(groundDrop)||value.points.some(row=>
    !Array.isArray(row.ground)||new Set(row.ground.map(s=>s.bsp)).size!==row.ground.length||row.ground.some(s=>
      !Number.isInteger(s.bsp)||s.bsp<0||s.bsp>=16||!Number.isFinite(s.z)||Math.fround(s.z)>Math.fround(row.point[2])||row.point[2]-s.z>groundDrop+1e-4))))
    throw Error('Ground review belongs to a different search range or contains an invalid downward surface; review again.');
   if(commandRoute){
    const route=value.route;
    const movement=commandRoute.commands.flatMap((command,index)=>command.atom==='go_to'||command.atom==='go_to_and_face'?[index]:[]);
    const expected=routeOrigin?movement:movement.slice(1);
    if(!route||!Array.isArray(route.legs)||route.legs.length>64||
      (route.issue===null&&route.legs.length!==expected.length)||
      (routeOrigin?(!Array.isArray(route.origin)||!finitePoint(route.origin)||route.origin.some((n,k)=>Math.fround(n)!==Math.fround(routeOrigin[k]))):route.origin!==null)||
      (route.issue!==null&&(typeof route.issue!=='string'||route.legs.length>0))||
      route.legs.some((leg,index)=>{
       const to=points[leg.to],from=leg.from===null?routeOrigin:points[leg.from],prior=route.legs[index-1],hit=leg.crossing;
       const validBsp=(bsp:number)=>Number.isInteger(bsp)&&bsp>=0&&bsp<16&&(manualBsp===undefined||bsp===manualBsp);
       if(!to||!from||leg.action!==expected[index]||commandRoute.commands[leg.action]?.point1!==leg.to||
         (prior?(leg.from!==prior.to||leg.action<=prior.action):((leg.from===null)!==!!routeOrigin))||
         !Array.isArray(leg.sharedBsps)||leg.sharedBsps.some(bsp=>!validBsp(bsp)))return true;
       return hit!==null&&(!hit||!validBsp(hit.bsp)||!(hit.fraction>0&&hit.fraction<1)||
        !Array.isArray(hit.point)||!finitePoint(hit.point)||hit.point.some((n,k)=>Math.abs(n-(Math.fround(from[k])+hit.fraction*(Math.fround(to[k])-Math.fround(from[k]))))>1e-5));
      }))throw Error('Flight review belongs to a different command or start revision. Check the route again.');
   }
   setReview({key:selection,value});
  }catch(problem){if(request===generation.current)setError(String(problem));}finally{if(request===generation.current)setChecking(false);}
 }
 const current=review?.key===key?review.value:null;
 const common=current?.points.reduce<number[]>((ids,row)=>ids.filter(id=>row.supports.some(s=>s.bsp===id)),manualBsp===undefined?Array.from({length:16},(_,i)=>i):[manualBsp])??[];
 return <div className="native-bsp-point-check">
 {commandRoute&&<details><summary>First flight leg start</summary>
  <label>Flight start<select value={originMode} disabled={disabled||checking} onChange={event=>setStart({key:selectionKey,mode:event.target.value,xyz})}>
   <option value="">Start at first go-to point</option><option value="custom">Enter world coordinates</option>
   {vehicles.map(vehicle=><option key={vehicle.index} value={vehicle.index}>{vehicle.name||vehicle.tagPath.split(/[\\/]/).at(-1)} · vehicle {vehicle.index}</option>)}
  </select></label>
  {originMode==='custom'&&<div className="native-encounter-position">{['X','Y','Z'].map((axis,i)=><label key={axis}>Flight start {axis}<input type="number" step="any" min={-1e6} max={1e6} disabled={disabled||checking} value={xyz[i]} onChange={event=>setStart({key:selectionKey,mode:originMode,xyz:xyz.map((n,k)=>k===i?event.target.value:n)})}/></label>)}</div>}
  {originMode&&routeOrigin&&finitePoint(routeOrigin)&&<small>Start XYZ {routeOrigin.join(', ')}. This position is used for the check only.</small>}
 </details>}
 <button type="button" disabled={!native||disabled||checking||!valid} onClick={()=>void check()}>{checking?'Checking compiled BSP…':label}</button>
 {onGround&&<div className="native-ground-search"><label><input type="checkbox" disabled={disabled||checking} checked={findGround} onChange={event=>setFindGround(event.target.checked)}/>Find ground below points</label>{findGround&&<NumberField label="Maximum ground search drop" value={drop} min={.5} max={64} step={.5} onCommit={setDrop}/>}
 <small>Finds the closest upward-facing ground below each point within the chosen distance. Choose a surface candidate by BSP. Only its Z is copied; existing BSP assignment stays unchanged. Use ground changes only the coordinate draft; Preview → Accept → Save → rebuild is still required. It does not move actors, certify landing clearance or fix a missing map surface.</small></div>}
 <small>Checks the compiled reference. Native ground-bound command points need a collision surface within ±0.5 world units, including facing points. BSP empty-space membership is separate. Rebuild after structural BSP edits; neither result proves hull clearance, ground contact, pathfinding or flight.</small>
 {error&&<Notice>{error}</Notice>}
 {current?.route&&<>
  <h4>Flight leg results</h4>
  {current.route.issue?<Notice tone="info">{current.route.issue}</Notice>:current.route.legs.length>0
   ?<ul aria-label="Compiled BSP flight legs">{current.route.legs.map(leg=><li key={leg.action}>
    <strong>{leg.from===null?'Start':'Point '+leg.from} → Point {leg.to} · action {leg.action}</strong>
    {leg.crossing
     ?<span> — Surface crossing in BSP {leg.crossing.bsp} at {leg.crossing.point.map(n=>Number(n.toFixed(3))).join(', ')} ({Math.round(leg.crossing.fraction*100)}% along leg).</span>
     :<span> — {leg.sharedBsps.length?'No interior centerline crossing detected.':'No shared collision BSP for these endpoints.'}</span>}
    {onSelect&&<button type="button" onClick={()=>onSelect(leg.to)}>Edit destination point {leg.to}</button>}
   </li>)}</ul>
   :<p>Add a second go-to or choose a flight start to check the first leg.</p>}
  <small>Checks straight segments in native go-to action order. Facing-only points, hull clearance, scenery, coplanar contact and actual flight are outside this check.</small>
 </>}
 {current&&<><p>{common.length?'Common nearby-surface BSP: '+common.join(', '):'No single BSP has a nearby surface for every selected point.'}</p><ul aria-label="Native BSP point results">{current.points.map((row,index)=>{const surfaces=row.supports.filter(s=>manualBsp===undefined||s.bsp===manualBsp),inside=manualBsp===undefined?row.bsps.length>0:row.bsps.includes(manualBsp);return <li key={index}>{onSelect?<button type="button" onClick={()=>onSelect(index)}>Point {index}</button>:<strong>Point {index}</strong>} — {surfaces.length?surfaces.map(s=>'surface BSP '+s.bsp+' at Z '+Number(s.z.toFixed(5))).join('; '):'No collision surface within ±0.5'}; {inside?'inside collision space':'outside collision space'}{row.nearPartition?' · near partition plane':''}
 {groundDrop!==undefined&&<div className="button-row">{(row.ground??[]).filter(s=>manualBsp===undefined||s.bsp===manualBsp).map(surface=><button type="button" key={surface.bsp} disabled={disabled||checking||!onGround} onClick={()=>{
   if(disabled||!onGround||latest.current!==review?.key)return;
   generation.current++;setReview(null);onGround(index,[points[index][0],points[index][1],surface.z]);
  }}>Use ground for point {index} · BSP {surface.bsp} · Z {Number(surface.z.toFixed(5))}</button>)}
  {!(row.ground??[]).some(s=>manualBsp===undefined||s.bsp===manualBsp)&&<small>No upward-facing ground below within {groundDrop} units{manualBsp===undefined?'':' in selected BSP '+manualBsp}.</small>}</div>}
 </li>;})}</ul><small>Compiled reference {current.outputSha256.slice(0,12)}. Source changes require another review. Native compile/readback remains authoritative.</small></>}
 </div>;
}
