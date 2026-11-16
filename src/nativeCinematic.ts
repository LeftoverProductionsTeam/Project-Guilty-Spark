import {emptyCreatorStudio} from './creatorStudio';
import type {CreatorStudioDocument,CameraShot} from './creatorStudio';
import {exportHaloCeCinematic} from './haloScript';
import type {NativeCameraPoint} from './nativeOperations';
import {nativeCameraPose,cameraClose} from './nativeCutsceneCamera';
export const nativeCinematicPrefix='; Spark existing-camera cinematic\r\n';
/** Existing native markers are references. This path never appends/replaces their geometry. */
export function nativeCameraShot(point:NativeCameraPoint,id:string):CameraShot{
 const pose=nativeCameraPose(point);return {id,name:point.name||'Native camera '+point.index,durationMs:2000,cameraPosition:[...pose.position],lookAt:[...pose.lookAt],roll:pose.roll,fov:pose.fov,subtitle:'',cameraMarker:point.name,easing:'smooth'};
}
export function nativeCinematicTakeKey(studio?:CreatorStudioDocument|null){return JSON.stringify([studio?.shots??[],studio?.cinematicTriggerVolume??null]);}
export function nativeCinematicSource(studio:CreatorStudioDocument,cameras:NativeCameraPoint[],name:string,context?:{triggerVolumes:string[];scenarioType:number;retainController?:boolean}){
 if(studio.engineMachinima?.enabled)throw Error('Disable the separate game-native recording controller before preparing an existing-camera campaign cinematic.');
 name=name.trim();if(name.toLowerCase()==='global_scripts')throw Error('Global source is preserved. Choose a scenario cinematic function name.');
 const volume=studio.cinematicTriggerVolume;
 if(volume!=null){if(context?.scenarioType!==0)throw Error('Automatic cinematic area triggers require verified campaign source. Manual script invocation remains available.');const matches=context.triggerVolumes.filter(n=>n.toLowerCase()===volume.toLowerCase());if(matches.length!==1||matches[0]!==volume)throw Error('The cinematic trigger area is missing or ambiguous in the current native source. Choose an existing area again; no source was replaced.');}
 const source=exportHaloCeCinematic(studio,{prepared:true,scriptName:name,...(volume!=null||context?.retainController?{areaTrigger:{volume:volume??null}}:{})});
 for(const shot of studio.shots){const matches=cameras.filter(p=>p.name.toLowerCase()===(shot.cameraMarker??'').toLowerCase());const point=matches.length===1&&matches[0].name===shot.cameraMarker?matches[0]:undefined;if(!point)throw Error('Native camera '+(shot.cameraMarker||shot.name)+' is missing or ambiguous. Read the current native cameras and choose a matching marker.');
  const delta=shot.lookAt.map((v,i)=>v-shot.cameraPosition[i]),length=Math.hypot(...delta);
  const proposed:NativeCameraPoint={...point,position:shot.cameraPosition,orientationRadians:[Math.atan2(delta[1],delta[0]),Math.asin(delta[2]/length),(shot.roll??0)*Math.PI/180],fovRadians:shot.fov*Math.PI/180};
  if(!cameraClose(point,proposed))throw Error('Shot '+shot.name+' differs from native camera '+point.name+'. Review and accept its pose/FOV in Tags → Native source controls → Existing cutscene cameras, or re-add the current native point. No geometry was ignored or overwritten.');
 }
 return {...source,content:nativeCinematicPrefix+source.content,filename:name+'.hsc',warnings:['Uses verified existing native camera poses; no points are added. '+(volume!=null?'The startup controller waits for a player and area '+volume+', then calls '+name+' once per map load.':context?.retainController?'The retained startup controller is disabled; '+name+' can still be called manually.':'The static function '+name+' is not automatically played. Call it from an appropriate recovered campaign module, then rebuild.')+' Native playback, timing and return to player control need game testing.']};
}
export function appendNativeCameraShot(studio:CreatorStudioDocument|null|undefined,point:NativeCameraPoint,id:string):CreatorStudioDocument{
 const current=studio??emptyCreatorStudio();if(current.shots.some(s=>s.cameraMarker===point.name))throw Error('This native camera is already in the take. Edit its timing in Machinima.');
 const shot=nativeCameraShot(point,id);nativeCinematicSource({...emptyCreatorStudio(),shots:[shot]},[point],'gs_cinematic');if(current.shots.length>=256)throw Error('A saved take supports at most256shots.');return {...current,shots:[...current.shots,shot]};
}
