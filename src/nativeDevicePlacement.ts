import type {NativeDevicePlacement,NativeTagContext} from './nativeOperations';
import type {Project,MapInspection,SceneObject,Vec3} from './types';
import {nativeAiStartPosition} from './nativeAiStart';
export const NATIVE_DEVICE_VIEW='world.device-placement';
export interface NativeDeviceView {projectId:string;buildId:string;tag:string;sourceSha256:string;original:NativeDevicePlacement;position:[string,string,string];angles:[string,string,string];usableFromBothSides?:boolean;interactionDisabled?:boolean;manualActivation?:boolean;initiallyOff?:boolean;initiallyOpen?:boolean;powerGroup?:number;positionGroup?:number;active:boolean;focus:number;locked?:boolean;reviewRequest?:number}
const strings=(v:number[])=>v.map(String) as [string,string,string];
export function deviceDraft(row:NativeDevicePlacement){
    return {position:strings(row.position),angles:strings(row.rotationRadians.map(n=>Number((n*180/Math.PI).toFixed(6)))),usableFromBothSides:row.usableFromBothSides,interactionDisabled:row.interactionDisabled,manualActivation:row.manualActivation,initiallyOff:row.initiallyOff,initiallyOpen:row.initiallyOpen,powerGroup:row.powerGroup,positionGroup:row.positionGroup};
}
export function devicePose(view:Pick<NativeDeviceView,'original'|'position'|'angles'|'usableFromBothSides'|'interactionDisabled'|'manualActivation'|'initiallyOff'|'initiallyOpen'|'powerGroup'|'positionGroup'>):NativeDevicePlacement|null{
    const position=nativeAiStartPosition(view.position),angles=view.angles.map(v=>v.trim()?Number(v):NaN);
    if(!position||angles.some(n=>!Number.isFinite(n)||Math.abs(n)>360))return null;
    const before=deviceDraft(view.original).angles;
    const rotationRadians=angles.every((n,i)=>n===Number(before[i]))?view.original.rotationRadians:angles.map(n=>n*Math.PI/180) as Vec3;
    const usableFromBothSides=view.original.usableFromBothSides===undefined?undefined:view.usableFromBothSides??view.original.usableFromBothSides;
    return {...view.original,position,rotationRadians,usableFromBothSides,
      interactionDisabled:view.original.interactionDisabled===undefined?undefined:view.interactionDisabled??view.original.interactionDisabled,
      manualActivation:view.original.manualActivation===undefined?undefined:view.manualActivation??view.original.manualActivation,
      initiallyOff:view.original.initiallyOff===undefined?undefined:view.initiallyOff??view.original.initiallyOff,
      initiallyOpen:view.original.initiallyOpen===undefined?undefined:view.initiallyOpen??view.original.initiallyOpen,
      powerGroup:view.original.powerGroup===undefined?undefined:view.powerGroup??view.original.powerGroup,
      positionGroup:view.original.positionGroup===undefined?undefined:view.positionGroup??view.original.positionGroup};
}
export function deviceIdentity(view:NativeDeviceView){return JSON.stringify([view.projectId,view.buildId,view.tag,view.sourceSha256,view.original]);}
export function deviceScope(view:NativeDeviceView){return JSON.stringify([deviceIdentity(view),view.position,view.angles,view.usableFromBothSides,view.interactionDisabled,view.manualActivation,view.initiallyOff,view.initiallyOpen,view.powerGroup,view.positionGroup]);}
export function deviceMatches(view:NativeDeviceView,context:NativeTagContext){return !context.deviceEditIssue&&context.class==='scnr'&&view.projectId===context.projectId&&view.buildId===context.buildId&&view.tag.replaceAll('\\','/')===context.tag.replaceAll('\\','/')&&view.sourceSha256===context.tagSha256&&JSON.stringify(context.scenarioDevices?.find(row=>row.class===view.original.class&&row.index===view.original.index))===JSON.stringify(view.original);}
export function deviceObjectId(row:NativeDevicePlacement){return (row.class==='ctrl'?'Control-':row.class==='vehi'?'Vehicle-':row.class==='weap'?'Weapon-':'Machine-')+row.index;}
export function deviceSceneObject(view:NativeDeviceView,project:Project,inspection:MapInspection|null):SceneObject|null{const pose=devicePose(view),object=project.scene.find(o=>o.id===deviceObjectId(view.original));const tag=inspection?.tags.find(t=>t.id===object?.tagId);return pose&&object&&tag?.class===pose.class&&tag.path.replaceAll('\\','/').toLowerCase()===pose.tagPath.replaceAll('\\','/').toLowerCase()?{...object,visible:true,position:pose.position,rotation:pose.rotationRadians}:null;}
export function deviceTransform(view:NativeDeviceView|null,scope:string,object:SceneObject):NativeDeviceView|null{if(!view?.active||view.locked||deviceScope(view)!==scope||object.id!==deviceObjectId(view.original)||object.scale.some(n=>Math.abs(n-1)>1e-6))return null;const next={...view,position:strings(object.position),angles:strings(object.rotation.map(n=>n*180/Math.PI))};return devicePose(next)?next:null;}
