import {useFrame,useThree} from '@react-three/fiber';
import {useRef} from 'react';
import {Box3,Vector3} from 'three';
import type {Object3D} from 'three';
type GizmoControl=Object3D&{enabled:boolean;object?:Object3D;space:string;mode:string;axis?:string|null;dragging?:boolean;getHelper?:()=>Object3D;gizmo?:{picker?:Record<string,Object3D>}};
/** Read-only canvas diagnostics used to verify actual camera/render behavior. */
export default function ViewportTelemetry(){
  const {gl,camera,controls,scene}=useThree();const previous=useRef('');
  const box=useRef(new Box3()),point=useRef(new Vector3());
  const sample=useRef({seconds:0,frames:0,gizmo:'',decals:''});
  useFrame((_,delta)=>{
    const stats=sample.current;stats.seconds+=delta;stats.frames++;
    if(stats.seconds<0.25)return;
    gl.domElement.dataset.gsPerformance=JSON.stringify({fps:stats.frames/stats.seconds,frameMs:stats.seconds*1000/stats.frames,drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,sampledAt:Date.now()});
    stats.seconds=0;stats.frames=0;
    const target=(controls as unknown as {target?:Vector3}|null)?.target;
    const state=JSON.stringify({position:camera.position.toArray().map(v=>+v.toFixed(5)),
      quaternion:camera.quaternion.toArray().map(v=>+v.toFixed(5)),target:target?.toArray().map(v=>+v.toFixed(5)),
      textures:gl.info.memory.textures});
    if(state!==previous.current){gl.domElement.dataset.gsCamera=state;previous.current=state;}
    let decalState:{source:number;rendered:number;omitted:number}|undefined;
    let active:GizmoControl|undefined;
    scene.traverse(object=>{const root=object as Object3D&{isTransformControlsRoot?:boolean;isTransformControls?:boolean;controls?:GizmoControl};
      if(object.userData.mapDecalLayer)decalState={source:object.userData.sourceDecals,rendered:object.userData.renderedDecals,omitted:object.userData.omittedDecals};
      const candidate=root.isTransformControls?root as GizmoControl:root.isTransformControlsRoot?root.controls:undefined;
      if(candidate?.enabled&&candidate.object)active=candidate;});
    const decals=decalState?JSON.stringify(decalState):'';
    if(decals!==stats.decals){if(decals)gl.domElement.dataset.gsDecals=decals;else delete gl.domElement.dataset.gsDecals;stats.decals=decals;}
    if(active){
      const helper=active.gizmo?.picker?.[active.mode]??active.getHelper?.()??active,handles:Record<string,number[]>={};
      helper.updateWorldMatrix(true,true);
      helper.traverse(object=>{
        if(!['X','Y','Z'].includes(object.name)||handles[object.name])return;
        box.current.setFromObject(object);if(box.current.isEmpty())return;
        const p=box.current.getCenter(point.current).project(camera);handles[object.name]=[p.x,p.y];
      });
      const origin=active.object!.getWorldPosition(point.current).project(camera);
      const value=JSON.stringify({space:active.space,mode:active.mode,axis:active.axis,dragging:active.dragging,objectPosition:active.object!.position.toArray(),origin:[origin.x,origin.y],handles});
      if(value!==stats.gizmo){gl.domElement.dataset.gsGizmo=value;stats.gizmo=value;}
    }else if(stats.gizmo){delete gl.domElement.dataset.gsGizmo;stats.gizmo='';}
  });return null;
}
