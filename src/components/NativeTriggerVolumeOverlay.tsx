import {useEffect,useRef,useState} from 'react';
import type {MutableRefObject} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import TransformControls from './HaloTransformControls';
import {useMapState} from '../mapSession';
import {call,native} from '../api';
import {NATIVE_VOLUME_VIEW,nativeVolumeMatches,volumeGeometry,volumeCenter,volumeQuaternion,volumeViewKey,volumeDrag} from '../nativeTriggerVolume';
import type {NativeVolumeView} from '../nativeTriggerVolume';
import type {NativeTagContext} from '../nativeOperations';
import type {Project,Vec3} from '../types';
/** A source proposal; native mutation stays in the existing reviewed writer. */
export default function NativeTriggerVolumeOverlay({project,enabled,snap,mode,onSelectScene,onStart,onEnd,notify}:{project:Project;enabled:boolean;snap:boolean|number;mode:'translate'|'rotate'|'scale';onSelectScene:()=>void;onStart?:()=>void;onEnd?:()=>void;notify:(message:string)=>void}){
 const [view,setView]=useMapState<NativeVolumeView|null>(project.id,NATIVE_VOLUME_VIEW,()=>null),[reviewed,setReviewed]=useState('');const group=useRef<THREE.Group>(null),drag=useRef<NativeVolumeView|null>(null),dragMode=useRef<typeof mode|null>(null),current=useRef({view,enabled,mode});current.current={view,enabled,mode};
 const callbacks=useRef({notify,onEnd,onSelectScene});callbacks.current={notify,onEnd,onSelectScene};const {camera,controls,size}=useThree(),scope=view?.active?volumeViewKey(view):'';
 useEffect(()=>{let live=true;setReviewed('');if(!scope||!view||!native)return;const requested=view;void call<NativeTagContext>('native_tag_context',{projectId:project.id}).then(context=>{if(!live)return;if(nativeVolumeMatches(requested,context)){setReviewed(scope);callbacks.current.onSelectScene();}else{setView(v=>v&&volumeViewKey(v)===scope?{...v,active:false}:v);callbacks.current.notify('Trigger handles hidden: native source changed. Refresh native source controls.');}}).catch(error=>{if(live){setView(v=>v&&volumeViewKey(v)===scope?{...v,active:false}:v);callbacks.current.notify('Trigger source could not be verified: '+String(error));}});return()=>{live=false;};},[scope,project.id]);
 useEffect(()=>{const changed=(event:Event)=>{if((event as CustomEvent<{projectId:string}>).detail?.projectId===project.id)setView(null);};window.addEventListener('guilty-spark-native-source-changed',changed);return()=>window.removeEventListener('guilty-spark-native-source-changed',changed);},[project.id]);
 const geometry=view?volumeGeometry(view):null,ready=!!view?.active&&scope===reviewed&&!!geometry&&project.builds.some(b=>b.id===view.buildId&&b.status==='validated');
 useEffect(()=>{if(!ready||!geometry||!enabled)return;const center=new THREE.Vector3(...volumeCenter(geometry)),r=Math.max(1,Math.hypot(...geometry.dimensions)/2);camera.up.set(0,0,1);camera.position.copy(center).add(new THREE.Vector3(r*1.7,-r*1.7,r*1.2));camera.lookAt(center);if(camera instanceof THREE.OrthographicCamera){camera.zoom=Math.max(.01,size.height/(r*3));camera.updateProjectionMatrix();}const orbit=controls as unknown as {target?:THREE.Vector3;update?:()=>void};orbit?.target?.copy(center);orbit?.update?.();},[view?.focus,ready,enabled,camera,controls]);
 useEffect(()=>()=>{if(drag.current){drag.current=null;dragMode.current=null;callbacks.current.onEnd?.();}},[scope,ready,enabled,view?.locked,mode]);
 if(!ready||!geometry||!view)return null;const writable=enabled&&!view.locked;
 return <><group ref={group} position={volumeCenter(geometry)} quaternion={volumeQuaternion(geometry)} scale={geometry.dimensions} name="native-trigger-volume-proposal"><mesh onClick={event=>{event.stopPropagation();onSelectScene();}}><boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#82ded0" wireframe depthTest={false}/></mesh></group>
 <TransformControls object={group as MutableRefObject<THREE.Group>} mode={mode} space={mode==='scale'?'local':'world'} enabled={writable} size={.9} translationSnap={typeof snap==='number'?snap||null:snap?.5:null} rotationSnap={snap?Math.PI/12:null} scaleSnap={null}
 onMouseDown={()=>{if(!writable)return;drag.current=view;dragMode.current=mode;onSelectScene();onStart?.();}}
 onMouseUp={()=>{const latest=current.current,obj=group.current,start=drag.current;if(obj&&start){const rotation=new THREE.Euler().setFromQuaternion(obj.quaternion,'ZYX');const pose={center:dragMode.current==='translate'?obj.position.toArray() as Vec3:start.center.map(Number) as Vec3,rotation:dragMode.current==='rotate'?[rotation.x,rotation.y,rotation.z].map(v=>v*180/Math.PI) as Vec3:start.rotation.map(Number) as Vec3,dimensions:dragMode.current==='scale'?obj.scale.toArray() as Vec3:start.dimensions.map(Number) as Vec3};obj.position.fromArray(volumeCenter(geometry));obj.quaternion.copy(volumeQuaternion(geometry));obj.scale.fromArray(geometry.dimensions);const next=volumeDrag(start,latest.view,pose,latest.enabled&&latest.mode===dragMode.current);if(next)setView({...next,mode});else callbacks.current.notify('Trigger proposal retained: source/selection changed or the transform is invalid.');}drag.current=null;dragMode.current=null;onEnd?.();}}/>
 </>;
}
