import {useEffect,useRef,useState} from 'react';
import type {MutableRefObject} from 'react';
import {useThree} from '@react-three/fiber';
import {Line} from '@react-three/drei';
import * as THREE from 'three';
import TransformControls from './HaloTransformControls';
import {useMapState} from '../mapSession';
import {call,native} from '../api';
import {NATIVE_AI_START_VIEW,nativeAiStartMatches,nativeAiStartPosition} from '../nativeAiStart';
import type {NativeAiStartView} from '../nativeAiStart';
import type {NativeTagContext} from '../nativeOperations';
import type {Project,Vec3} from '../types';

/** A source marker only. All native mutation remains in the reviewed tag writer. */
export default function NativeAiStartOverlay({project,enabled,snap,onSelectScene,onStart,onEnd,notify}:{
  project:Project;enabled:boolean;snap:boolean;onSelectScene:()=>void;onStart?:()=>void;onEnd?:()=>void;notify:(message:string)=>void;
}) {
  const [draft,setDraft]=useMapState<NativeAiStartView|null>(project.id,NATIVE_AI_START_VIEW,()=>null);
  const [reviewed,setReviewed]=useState('');const group=useRef<THREE.Group>(null),drag=useRef('');
  const current=useRef(draft);current.current=draft;
  const callbacks=useRef({onSelectScene,notify});callbacks.current={onSelectScene,notify};
  const {camera,controls}=useThree();
  const scope=draft?.active?draft.key:'';
  useEffect(()=>{
    let live=true;setReviewed('');
    if(!scope||!native||!draft)return;
    const requested=draft;
    void call<NativeTagContext>('native_tag_context',{projectId:project.id}).then(context=>{
      if(!live)return;
      if(nativeAiStartMatches(requested,context)){setReviewed(scope);callbacks.current.onSelectScene();}
      else {setDraft(previous=>previous?.key===scope?{...previous,active:false}:previous);callbacks.current.notify('AI start handles were hidden because their native source changed. Refresh AI starting positions before reviewing another edit.');}
    }).catch(error=>{if(live){setDraft(previous=>previous?.key===scope?{...previous,active:false}:previous);callbacks.current.notify('AI start handles could not verify their source: '+String(error));}});
    return()=>{live=false;};
  },[scope,project.id]);
  useEffect(()=>{
    const changed=(event:Event)=>{if((event as CustomEvent<{projectId:string}>).detail?.projectId===project.id)setDraft(null);};
    window.addEventListener('guilty-spark-native-source-changed',changed);return()=>window.removeEventListener('guilty-spark-native-source-changed',changed);
  },[project.id]);
  const position=nativeAiStartPosition(draft?.values);
  const ready=!!draft?.active&&scope===reviewed&&!!position&&project.builds.some(build=>build.id===draft.buildId&&build.status==='validated');
  useEffect(()=>{
    if(!ready||!position||!enabled)return;
    const center=new THREE.Vector3(...position).add(new THREE.Vector3(0,0,.3));
    camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(3,-3,2));camera.lookAt(center);
    if(camera instanceof THREE.OrthographicCamera){camera.zoom=80;camera.updateProjectionMatrix();}
    const orbit=controls as unknown as {target?:THREE.Vector3;update?:()=>void};orbit?.target?.copy(center);orbit?.update?.();
  },[draft?.focus,ready,enabled,camera,controls]);
  if(!ready||!draft||!position)return null;
  const writable=enabled&&!draft.locked;
  return <>
    <mesh position={draft.original}><sphereGeometry args={[.1,8,6]}/><meshBasicMaterial color="#a7afb6" wireframe depthTest={false}/></mesh>
    <Line points={[draft.original,position]} color="#82ded0" depthTest={false}/>
    <group ref={group} position={position} name="native-ai-start-coordinate-proposal">
      <mesh onClick={event=>{event.stopPropagation();onSelectScene();}}><sphereGeometry args={[.14,10,6]}/><meshBasicMaterial color="#82ded0" depthTest={false}/></mesh>
    </group>
    <TransformControls object={group as MutableRefObject<THREE.Group>} mode="translate" space="world" enabled={writable}
      translationSnap={snap ? .5 : null} size={.85} showX showY showZ
      onMouseDown={()=>{if(!writable)return;drag.current=JSON.stringify([draft.key,draft.values]);onSelectScene();onStart?.();}}
      onMouseUp={()=>{
        const latest=current.current,next=group.current?.position.toArray() as Vec3|undefined;
        if(group.current)group.current.position.set(...position);
        if(writable&&latest?.active&&!latest.locked&&JSON.stringify([latest.key,latest.values])===drag.current&&next){
          const values=next.map(String) as [string,string,string];
          if(nativeAiStartPosition(values))setDraft({...latest,values});
          else notify('AI start coordinates must be finite and within the supported range. The proposal was kept unchanged.');
        }
        drag.current='';onEnd?.();
      }}/>
  </>;
}
