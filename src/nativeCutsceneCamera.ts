import {PerspectiveCamera,Quaternion,Vector3} from 'three';
import type {NativeCameraPoint,NativeTagContext} from './nativeOperations';
import type {CameraPose} from './machinima';
export const NATIVE_CAMERA_VIEW='world.cutscene-camera';
export interface NativeCameraView {projectId:string;buildId:string;tag:string;sourceSha256:string;original:NativeCameraPoint;position:[string,string,string];angles:[string,string,string];fov:string;active:boolean;focus:number;reviewRequest?:number}
export function nativeCameraMatches(view:NativeCameraView,context:NativeTagContext):boolean{
 const point=context.scenarioCameras?.find(p=>p.index===view.original.index);
 return context.class==='scnr'&&!context.cameraEditIssue&&view.projectId===context.projectId&&view.buildId===context.buildId&&view.tag.replaceAll('\\','/')===context.tag.replaceAll('\\','/')&&view.sourceSha256===context.tagSha256&&JSON.stringify(point)===JSON.stringify(view.original);
}
export function cameraDraft(point:NativeCameraPoint):Pick<NativeCameraView,'position'|'angles'|'fov'>{
 const degrees=(v:number)=>String(Number((Math.atan2(Math.sin(v),Math.cos(v))*180/Math.PI).toFixed(6)));
 return {position:point.position.map(String) as [string,string,string],angles:point.orientationRadians.map(degrees) as [string,string,string],fov:String(Number((point.fovRadians*180/Math.PI).toFixed(6)))};
}
export function cameraPoint(view:Pick<NativeCameraView,'position'|'angles'|'fov'|'original'>):NativeCameraPoint|null{
 const parse=(s:unknown)=>typeof s==='string'&&s.trim()?Number(s):NaN;
 const position=view.position.map(parse),angles=view.angles.map(parse),fov=parse(view.fov);
 if(position.length!==3||angles.length!==3||position.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)||angles.some(n=>!Number.isFinite(n)||Math.abs(n)>360)||!Number.isFinite(fov)||fov<5||fov>150)return null;
 return {...view.original,position:position as NativeCameraPoint['position'],orientationRadians:angles.map(n=>n*Math.PI/180) as NativeCameraPoint['orientationRadians'],fovRadians:fov*Math.PI/180};
}
export function cameraClose(a:NativeCameraPoint,b:NativeCameraPoint):boolean{
 return a.index===b.index&&a.name===b.name&&a.position.every((v,i)=>Math.abs(v-b.position[i])<=Math.max(1e-6,Math.abs(v)*2**-22))&&a.orientationRadians.every((v,i)=>Math.abs(Math.atan2(Math.sin(v-b.orientationRadians[i]),Math.cos(v-b.orientationRadians[i])))<=.000002)&&Math.abs(a.fovRadians-b.fovRadians)<=.000002;
}
export function nativeCameraPose(point:NativeCameraPoint):CameraPose{
 const [yaw,pitch,roll]=point.orientationRadians,c=Math.cos(pitch);
 return {position:point.position,lookAt:[point.position[0]+Math.cos(yaw)*c*10,point.position[1]+Math.sin(yaw)*c*10,point.position[2]+Math.sin(pitch)*10],roll:roll*180/Math.PI,fov:point.fovRadians*180/Math.PI};
}
/** Read the existing viewport session, never an engine camera or an invented pose. */
export function cameraFromViewport(original:NativeCameraPoint,value:unknown):NativeCameraPoint|null{
 const pose=value as {type?:string;position?:number[];quaternion?:number[];fov?:number;zoom?:number}|null;
 if(pose?.type!=='PerspectiveCamera'||pose.position?.length!==3||pose.position.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)||pose.quaternion?.length!==4||pose.quaternion.some(n=>!Number.isFinite(n))||typeof pose.fov!=='number'||pose.fov<5||pose.fov>150||!Number.isFinite(pose.zoom)||pose.zoom!<=0)return null;
 const q=new Quaternion().fromArray(pose.quaternion);if(Math.abs(q.lengthSq()-1)>.001)return null;q.normalize();
 const forward=new Vector3(0,0,-1).applyQuaternion(q),base=new PerspectiveCamera();base.up.set(0,0,1);base.lookAt(forward);
 const relative=base.quaternion.invert().multiply(q),roll=2*Math.atan2(relative.z,relative.w);
 const effectiveFov=2*Math.atan(Math.tan(pose.fov*Math.PI/360)/pose.zoom!);
 if(effectiveFov<5*Math.PI/180||effectiveFov>150*Math.PI/180)return null;
 return {...original,position:[...pose.position] as NativeCameraPoint['position'],orientationRadians:[Math.atan2(forward.y,forward.x),Math.asin(Math.max(-1,Math.min(1,forward.z))),roll],fovRadians:effectiveFov};
}