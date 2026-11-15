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
import type {NativeTagContext} from '../nativeOperations';
import type {Project,Vec3} from '../types';

/** A source marker only. All native mutation remains in the reviewed tag writer. */
export default function NativeAiStartOverlay({project,enabled,snap,mode,onSelectScene,onStart,onEnd,notify}:{
  project:Project;enabled:boolean;snap:boolean|number;mode:'translate'|'rotate'|'scale';onSelectScene:()=>void;onStart?:()=>void;onEnd?:()=>void;notify:(message:string)=>void;
}) {
  const [draft,setDraft]=useMapState<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,()=>null);
  const [reviewed,setReviewed]=useState('');const group=useRef<THREE.Group>(null),drag=useRef<NativeAiStartView|null>(null);
  const current=useRef({draft,enabled,mode});current.current={draft,enabled,mode};
  const dragMode=useRef<typeof mode|null>(null);
  const callbacks=useRef({onSelectScene,notify,onEnd});callbacks.current={onSelectScene,notify,onEnd};
  const {camera,controls}=useThree();
  const scope=draft?.active?draft.key:'';
  useEffect(()=>{
    let live=true;setReviewed('');
    if(!scope||!native||!draft)return;
    const requested=draft;
    void call<NativeTagContext>('native_tag_context',{projectId:project.id}).then(context=>{
      if(!live)return;
      if(nativeAiStartMatches(requested,context)){setReviewed(scope);callbacks.current.onSelectScene();}
      else {setDraft(previous=>previous?.key===scope?{...previous,active:false}:previous);callbacks.current.notify('Native AI point handles were hidden because their source changed. Refresh native source controls before reviewing another edit.');}
    }).catch(error=>{if(live){setDraft(previous=>previous?.key===scope?{...previous,active:false}:previous);callbacks.current.notify('Native AI point handles could not verify their source: '+String(error));}});
    return()=>{live=false;};
  },[scope,project.id]);
  useEffect(()=>{
    const changed=(event:Event)=>{if((event as CustomEvent<{projectId:string}>).detail?.projectId===project.id)setDraft(null);};
    window.addEventListener('guilty-spark-native-source-changed',changed);return()=>window.removeEventListener('guilty-spark-native-source-changed',changed);
  },[project.id]);
  const position=nativeAiStartPosition(draft?.values);
  const facing=nativeAiStartFacing(draft?.facingDegrees);
  const knownFacing=typeof draft?.originalFacingRadians==='number'&&Number.isFinite(draft.originalFacingRadians);
  const ready=(!knownFacing||facing!==null)&&!!draft?.active&&scope===reviewed&&!!position&&project.builds.some(build=>build.id===draft.buildId&&build.status==='validated');
  useEffect(()=>{
    if(!ready||!position||!enabled)return;
    const center=new THREE.Vector3(...position).add(new THREE.Vector3(0,0,.3));
    camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(3,-3,2));camera.lookAt(center);
    if(camera instanceof THREE.OrthographicCamera){camera.zoom=80;camera.updateProjectionMatrix();}
    const orbit=controls as unknown as {target?:THREE.Vector3;update?:()=>void};orbit?.target?.copy(center);orbit?.update?.();
  },[draft?.focus,ready,enabled,camera,controls]);
  useEffect(()=>()=>{if(drag.current){drag.current=null;dragMode.current=null;callbacks.current.onEnd?.();}},[scope,ready,enabled,draft?.locked,mode]);
  if(!ready||!draft||!position)return null;
  const writable=enabled&&!draft.locked&&mode!=='scale'&&(mode!=='rotate'||knownFacing);
  return <>
    <mesh position={draft.original}><sphereGeometry args={[.1,8,6]}/><meshBasicMaterial color="#a7afb6" wireframe depthTest={false}/></mesh>
    {knownFacing&&<Line points={[draft.original,[draft.original[0]+.65*Math.cos(draft.originalFacingRadians!),draft.original[1]+.65*Math.sin(draft.originalFacingRadians!),draft.original[2]]]} color="#a7afb6" depthTest={false}/>}
    <Line points={[draft.original,position]} color="#82ded0" depthTest={false}/>
    <group ref={group} position={position} rotation={[0,0,facing??0]} name="native-ai-start-coordinate-proposal">
      <mesh onClick={event=>{event.stopPropagation();onSelectScene();}}><sphereGeometry args={[.14,10,6]}/><meshBasicMaterial color="#82ded0" depthTest={false}/></mesh>
      {knownFacing&&<Line points={[[0,0,0],[.8,0,0],[.6,.08,0],[.8,0,0],[.6,-.08,0]]} color="#82ded0" depthTest={false}/>}
    </group>
    <TransformControls object={group as MutableRefObject<THREE.Group>} mode={mode==='rotate'?'rotate':'translate'} space="world" enabled={writable}
      translationSnap={typeof snap==='number' ? snap||null : snap ? 0.5 : null} rotationSnap={snap?Math.PI/12:null} size={.85} showX={mode!=='rotate'} showY={mode!=='rotate'} showZ
      onMouseDown={()=>{if(!writable)return;drag.current=draft;dragMode.current=mode;onSelectScene();onStart?.();}}
      onMouseUp={()=>{
        const latest=current.current,next=group.current?.position.toArray() as Vec3|undefined,nextFacing=group.current?.rotation.z;
        if(group.current){group.current.position.set(...position);group.current.rotation.set(0,0,facing??0);}
        const enabled=latest.enabled&&latest.mode===dragMode.current;
        if(dragMode.current==='rotate'){
          const facingDegrees=nativeAiStartDragFacing(drag.current,latest.draft,nextFacing,enabled);
          if(facingDegrees!==null&&latest.draft)setDraft({...latest.draft,facingDegrees,mode:'rotate'});
        }else{
          const values=nativeAiStartDragValues(drag.current,latest.draft,next,enabled);
          if(values&&latest.draft)setDraft({...latest.draft,values,mode:'translate'});
          else if(next&&!nativeAiStartPosition(next.map(String)))notify('AI start coordinates must be finite and within the supported range. The proposal was kept unchanged.');
        }
        dragMode.current=null;
        drag.current=null;onEnd?.();
      }}/>
  </>;
}
