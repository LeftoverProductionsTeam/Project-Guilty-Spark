import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import type {NativeTagContext,NativeTriggerVolume,NativeVolumeGeometry} from './nativeOperations';
import type {Vec3} from './types';
export const NATIVE_VOLUME_VIEW='world.trigger-volume';
type Fields={center:[string,string,string];rotation:[string,string,string];dimensions:[string,string,string]};
export interface NativeVolumeView extends Fields {projectId:string;buildId:string|null;tag:string;sourceSha256:string;index:number;original:NativeTriggerVolume;active:boolean;focus:number;reviewRequest?:number;locked?:boolean;mode?:'translate'|'rotate'|'scale';append?:boolean}
const vector=(v:Vec3)=>new Vector3(...v),strings=(v:number[])=>v.map(String) as [string,string,string];
export function volumeQuaternion(g:NativeVolumeGeometry){const f=vector(g.forward),u=vector(g.up);return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(f,u.clone().cross(f),u)).normalize();}
export function volumeCenter(g:NativeVolumeGeometry):Vec3 {const f=vector(g.forward),u=vector(g.up),side=u.clone().cross(f);return vector(g.corner).addScaledVector(f,g.dimensions[0]/2).addScaledVector(side,g.dimensions[1]/2).addScaledVector(u,g.dimensions[2]/2).toArray() as Vec3;}
export function volumeDraft(g:NativeVolumeGeometry):Fields{const e=new Euler().setFromQuaternion(volumeQuaternion(g),'ZYX');return {center:strings(volumeCenter(g)),rotation:strings([e.x,e.y,e.z].map(v=>Number((v*180/Math.PI).toFixed(6)))),dimensions:strings(g.dimensions)};}
export function volumeGeometry(v:Fields&{original:NativeTriggerVolume}):NativeVolumeGeometry|null{
 const original=v.original.geometry;if(!original||v.original.kind!==1)return null;
 const parse=(fields:string[])=>fields.map(s=>s.trim()?Number(s):NaN),center=parse(v.center),angles=parse(v.rotation),dimensions=parse(v.dimensions);
 if([...center,...angles,...dimensions].some(n=>!Number.isFinite(n))||center.some(n=>Math.abs(n)>1e6)||dimensions.some(n=>n<=0||n>1e6)||angles.some(n=>Math.abs(n)>360))return null;
 const initial=volumeDraft(original),sameRotation=angles.every((n,i)=>Math.abs(n-Number(initial.rotation[i]))<1e-9);
 const q=new Quaternion().setFromEuler(new Euler(...angles.map(n=>n*Math.PI/180) as [number,number,number],'ZYX'));
 const forward=sameRotation?vector(original.forward):new Vector3(1,0,0).applyQuaternion(q),up=sameRotation?vector(original.up):new Vector3(0,0,1).applyQuaternion(q),side=up.clone().cross(forward);
 const corner=new Vector3(...center as Vec3).addScaledVector(forward,-dimensions[0]/2).addScaledVector(side,-dimensions[1]/2).addScaledVector(up,-dimensions[2]/2).toArray() as Vec3;
 if(corner.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))return null;
 return {forward:forward.toArray() as Vec3,up:up.toArray() as Vec3,corner,dimensions:dimensions as Vec3};
}
export function volumeClose(a:NativeVolumeGeometry,b:NativeVolumeGeometry){return (['forward','up','corner','dimensions'] as const).every(k=>a[k].every((v,i)=>Math.abs(v-b[k][i])<=Math.max(1e-6,Math.abs(v)*2**-22)));}
export function nativeVolumeMatches(v:NativeVolumeView,context:NativeTagContext){const original=context.scenarioVolumes?.[v.index];return context.class==='scnr'&&!context.triggerEditIssue&&v.projectId===context.projectId&&v.buildId===context.buildId&&v.sourceSha256===context.tagSha256&&v.tag.replaceAll('\\','/')===context.tag.replaceAll('\\','/')&&(v.append?v.index===(context.scenarioVolumes?.length??-1)&&v.original.kind===1&&!!v.original.geometry:JSON.stringify(original)===JSON.stringify(v.original));}
export function volumeViewKey(v:NativeVolumeView){return JSON.stringify([v.projectId,v.buildId,v.tag,v.sourceSha256,v.index,v.original,!!v.append]);}
export function volumeDrag(start:NativeVolumeView|null,current:NativeVolumeView|null,pose:{center:Vec3;rotation:Vec3;dimensions:Vec3},enabled:boolean):NativeVolumeView|null{
 if(!enabled||!start?.active||!current?.active||current.locked||volumeViewKey(start)!==volumeViewKey(current)||JSON.stringify([start.center,start.rotation,start.dimensions])!==JSON.stringify([current.center,current.rotation,current.dimensions]))return null;
 const next={...current,center:strings(pose.center),rotation:strings(pose.rotation),dimensions:strings(pose.dimensions)};return volumeGeometry(next)?next:null;
}
