import {useEffect,useRef,useState} from 'react';
import type {MutableRefObject} from 'react';
import {useThree} from '@react-three/fiber';
import {Line} from '@react-three/drei';
import * as THREE from 'three';
import TransformControls from './HaloTransformControls';
import {useMapState} from '../mapSession';
import {call,native} from '../api';
import {NATIVE_AI_START_VIEW,nativeAiStartMatches,nativeAiStartPosition,nativeAiStartDragValues,nativeAiStartFacing,nativeAiStartDragFacing} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import {nativeCommandMatches,nativeCommandPoint,nativeCommandDrag} from '../nativeOperations';
import type {NativeTagContext,NativeCommandDraft} from '../nativeOperations';
import type {Project,Vec3} from '../types';

/** Shared native AI/command point handles only. All mutation remains in the reviewed tag writer. */
export default function NativeAiStartOverlay({project,enabled,snap,mode,onSelectScene,onStart,onEnd,notify,command,onCommandChange}:{
  command?:NativeCommandDraft|null;onCommandChange?:(update:(value:NativeCommandDraft|null)=>NativeCommandDraft|null)=>void;
  project:Project;enabled:boolean;snap:boolean|number;mode:'translate'|'rotate'|'scale';onSelectScene:()=>void;onStart?:()=>void;onEnd?:()=>void;notify:(message:string)=>void;
}) {
  const [aiDraft,setDraft]=useMapState<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,()=>null);
  const isCommand=command?.active===true,draft=isCommand?null:aiDraft;
  const [reviewed,setReviewed]=useState('');const group=useRef<THREE.Group>(null),drag=useRef<NativeAiStartView|null>(null),commandDrag=useRef<NativeCommandDraft|null>(null);
  const current=useRef({draft,command,enabled,mode});current.current={draft,command,enabled,mode};
  const dragMode=useRef<typeof mode|null>(null);
  const callbacks=useRef({onSelectScene,notify,onEnd});callbacks.current={onSelectScene,notify,onEnd};
  const {camera,controls}=useThree();
  const scope=isCommand?JSON.stringify([command.key,command.point]):draft?.active?draft.key:'';
  useEffect(()=>{
    let live=true;setReviewed('');
    if(!scope||!native||(!draft&&!isCommand))return;
    const requested=draft,requestedCommand=isCommand?command:null;
    const hide=()=>{if(requestedCommand)onCommandChange?.(previous=>previous?.key===requestedCommand.key&&previous.point===requestedCommand.point?{...previous,active:false}:previous);else setDraft(previous=>previous?.key===scope?{...previous,active:false}:previous);};
    void call<NativeTagContext>('native_tag_context',{projectId:project.id}).then(context=>{
      if(!live)return;
      if(requestedCommand?nativeCommandMatches(requestedCommand,context):requested&&nativeAiStartMatches(requested,context)){setReviewed(scope);callbacks.current.onSelectScene();}
      else {hide();callbacks.current.notify('Native source point handles were hidden because their source changed. Refresh native source controls before reviewing another edit.');}
    }).catch(error=>{if(live){hide();callbacks.current.notify('Native source point handles could not verify their source: '+String(error));}});
    return()=>{live=false;};
  },[scope,project.id]);
  useEffect(()=>{
    const changed=(event:Event)=>{if((event as CustomEvent<{projectId:string}>).detail?.projectId===project.id){setDraft(null);onCommandChange?.(()=>null);}};
    window.addEventListener('guilty-spark-native-source-changed',changed);return()=>window.removeEventListener('guilty-spark-native-source-changed',changed);
  },[project.id]);
  const position=isCommand?nativeCommandPoint(command):nativeAiStartPosition(draft?.values);
  const original=isCommand?(command.append?command.list.points[command.point]:command.original.points[command.point]):draft?.original;
  const focus=isCommand?command.focus:draft?.focus,locked=isCommand?command.locked:draft?.locked,buildId=isCommand?command.buildId:draft?.buildId;
  const facing=nativeAiStartFacing(draft?.facingDegrees);
  const knownFacing=typeof draft?.originalFacingRadians==='number'&&Number.isFinite(draft.originalFacingRadians);
  const ready=(!knownFacing||facing!==null)&&(isCommand||!!draft?.active)&&scope===reviewed&&!!position&&!!original&&project.builds.some(build=>build.id===buildId&&build.status==='validated');
  useEffect(()=>{
    if(!ready||!position||!enabled)return;
    const center=new THREE.Vector3(...position).add(new THREE.Vector3(0,0,.3));
    let radius=0;
    if(isCommand&&command.frameRoute&&command.list.points.every(p=>p.every(Number.isFinite))){const bounds=new THREE.Box3().setFromPoints([...command.list.points,original!].map(p=>new THREE.Vector3(...p)));const sphere=bounds.getBoundingSphere(new THREE.Sphere());center.copy(sphere.center);radius=Math.max(.2,sphere.radius);}
    // Keep the entire route away from the viewport's command bar. This is a
    // camera fit only; no native coordinates or flight navigation are changed.
    const offset=new THREE.Vector3(3,-3,2);
    if(radius&&camera instanceof THREE.PerspectiveCamera){const vertical=THREE.MathUtils.degToRad(camera.fov)/2,horizontal=Math.atan(Math.tan(vertical)*camera.aspect);offset.normalize().multiplyScalar(radius/Math.sin(Math.min(vertical,horizontal))*2);}
    camera.up.set(0,0,1);camera.position.copy(center).add(offset);camera.lookAt(center);
    if(camera instanceof THREE.OrthographicCamera){camera.zoom=radius?Math.min(camera.right-camera.left,camera.top-camera.bottom)/(radius*4):80;camera.updateProjectionMatrix();}
    const orbit=controls as unknown as {target?:THREE.Vector3;update?:()=>void};orbit?.target?.copy(center);orbit?.update?.();
  },[focus,ready,enabled,camera,controls]);
  useEffect(()=>()=>{if(drag.current||commandDrag.current){drag.current=null;commandDrag.current=null;dragMode.current=null;callbacks.current.onEnd?.();}},[scope,ready,enabled,locked,mode]);
  if(!ready||!position||!original)return null;
  const writable=enabled&&!locked&&mode!=='scale'&&(mode!=='rotate'||knownFacing);
  const candidateRoute=isCommand?command.list.points:draft?.kind==='patrol'?draft.patrol?.route.points.map((p,i)=>i===draft.start?position:p.position):undefined;
  const route=candidateRoute?.every(p=>p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6))?candidateRoute:undefined;
  const pointIndex=isCommand?command.point:draft?.start;
  return <>
    {route&&route.length>1&&<Line points={route} color="#608b9c" depthTest={false}/>}
    {route?.map((p,i)=>i===pointIndex?null:<mesh key={i} position={p} onClick={isCommand?event=>{event.stopPropagation();onCommandChange?.(current=>current?.key===command.key&&current.active?{...current,point:i,focus:Date.now(),frameRoute:false}:current);}:undefined}><sphereGeometry args={[.07,8,6]}/><meshBasicMaterial color="#608b9c" depthTest={false}/></mesh>)}
    <mesh position={original}><sphereGeometry args={[.1,8,6]}/><meshBasicMaterial color="#a7afb6" wireframe depthTest={false}/></mesh>
    {knownFacing&&<Line points={[original,[original[0]+.65*Math.cos(draft!.originalFacingRadians!),original[1]+.65*Math.sin(draft!.originalFacingRadians!),original[2]]]} color="#a7afb6" depthTest={false}/>}
    <Line points={[original,position]} color="#82ded0" depthTest={false}/>
    <group ref={group} position={position} rotation={[0,0,facing??0]} name={isCommand?'native-command-point-coordinate-proposal':'native-ai-start-coordinate-proposal'}>
      <mesh onClick={event=>{event.stopPropagation();onSelectScene();}}><sphereGeometry args={[.14,10,6]}/><meshBasicMaterial color="#82ded0" depthTest={false}/></mesh>
      {knownFacing&&<Line points={[[0,0,0],[.8,0,0],[.6,.08,0],[.8,0,0],[.6,-.08,0]]} color="#82ded0" depthTest={false}/>}
    </group>
    <TransformControls object={group as MutableRefObject<THREE.Group>} mode={mode==='rotate'?'rotate':'translate'} space="world" enabled={writable}
      translationSnap={typeof snap==='number' ? snap||null : snap ? 0.5 : null} rotationSnap={snap?Math.PI/12:null} size={.85} showX={mode!=='rotate'} showY={mode!=='rotate'} showZ
      onMouseDown={()=>{if(!writable)return;drag.current=draft;commandDrag.current=isCommand?command:null;dragMode.current=mode;onSelectScene();onStart?.();}}
      onMouseUp={()=>{
        const latest=current.current,next=group.current?.position.toArray() as Vec3|undefined,nextFacing=group.current?.rotation.z;
        if(group.current){group.current.position.set(...position);group.current.rotation.set(0,0,facing??0);}
        const enabled=latest.enabled&&latest.mode===dragMode.current;
        if(commandDrag.current){
          const started=commandDrag.current;if(nativeCommandDrag(started,latest.command??null,next,enabled&&latest.mode==='translate'))onCommandChange?.(value=>nativeCommandDrag(started,value,next,enabled&&latest.mode==='translate')??value);
        }else if(dragMode.current==='rotate'){
          const facingDegrees=nativeAiStartDragFacing(drag.current,latest.draft,nextFacing,enabled);
          if(facingDegrees!==null&&latest.draft)setDraft({...latest.draft,facingDegrees,mode:'rotate'});
        }else{
          const values=nativeAiStartDragValues(drag.current,latest.draft,next,enabled);
          if(values&&latest.draft)setDraft({...latest.draft,values,mode:'translate'});
          else if(next&&!nativeAiStartPosition(next.map(String)))notify('AI point coordinates must be finite and within the supported range. The proposal was kept unchanged.');
        }
        dragMode.current=null;
        drag.current=null;commandDrag.current=null;onEnd?.();
      }}/>
  </>;
}
