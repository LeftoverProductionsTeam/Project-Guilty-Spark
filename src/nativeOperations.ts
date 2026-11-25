export interface NativeCommand {atom:string;modifier:number;parameters:[number,number];point1:number;point2:number;animation:number;script:number;recording:number;command:number;objectName:number}
export interface NativeCommandList {index:number;name:string;flags:[boolean,boolean,boolean,boolean,boolean,boolean];bsp:number;commands:NativeCommand[];points:[number,number,number][]}
export interface NativeCommandSource {lists:NativeCommandList[];atoms:string[];referenceCounts:[number,number,number,number,number]}

/** Existing command-list proposal, shared with its form and window-local viewport.
 * It is not a project object, pilot, accepted native edit or runtime route. */
export const NATIVE_COMMAND_VIEW='world.command-list';
export interface NativeCommandDraft {
 key:string;projectId:string;buildId:string;tag:string;sourceSha256:string;
 original:NativeCommandList;list:NativeCommandList;point:number;
 active:boolean;focus:number;locked:boolean;reviewRequest?:number;frameRoute?:boolean;append?:boolean;
}
export function nativeCommandKey(context:NativeTagContext,list:NativeCommandList):string {
 return JSON.stringify([context.projectId,context.buildId,context.tag.replaceAll('\\','/'),context.tagSha256,list]);
}
export function nativeCommandMatches(draft:NativeCommandDraft,context:NativeTagContext):boolean {
 const rows=context.commandSource?.lists,original=draft.append?draft.original:rows?.find(row=>row.index===draft.original?.index);
 const appendValid=!!draft.append&&!!rows&&rows.length<256&&draft.original.index===rows.length&&/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(draft.original.name)&&!rows.some(row=>row.name.toLowerCase()===draft.original.name.toLowerCase())&&draft.list.points.length>0&&draft.list.points.length<=64&&draft.list.commands.length>0&&draft.list.commands.length<=64;
 return context.class==='scnr'&&!context.commandSourceIssue&&!!original&&(!draft.append||appendValid)&&
  /^[a-f0-9]{64}$/i.test(context.tagSha256??'')&&draft.projectId===context.projectId&&draft.buildId===context.buildId&&
  draft.tag.replaceAll('\\','/')===context.tag.replaceAll('\\','/')&&draft.sourceSha256===context.tagSha256&&
  draft.key===nativeCommandKey(context,original)&&JSON.stringify(draft.original)===JSON.stringify(original)&&
  draft.list.index===original.index&&draft.list.name===original.name&&draft.list.commands.length>=original.commands.length&&draft.list.commands.length<=64&&draft.list.points.length>=original.points.length&&draft.list.points.length<=64&&!context.protectedCommandLists?.includes(original.index);
}
export function nativeRouteCommand(point:number):NativeCommand{return{atom:'go_to',modifier:0,parameters:[0,0],point1:point,point2:-1,animation:-1,script:-1,recording:-1,command:-1,objectName:-1};}
export function newNativeCommandRoute(context:NativeTagContext,name:string,position:[number,number,number]):NativeCommandDraft{
 if(context.class!=='scnr'||context.commandSourceIssue||!context.commandSource||!/^[a-f0-9]{64}$/i.test(context.tagSha256??'')||context.commandSource.lists.length>=256||position.length!==3||!/^[A-Za-z][A-Za-z0-9_]{0,30}$/.test(name)||context.commandSource.lists.some(row=>row.name.toLowerCase()===name.toLowerCase())||position.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))throw Error('Choose a unique native route name and finite initial world coordinates in current editable scenario source.');
 const original:NativeCommandList={index:context.commandSource.lists.length,name,flags:[false,false,false,false,false,false],bsp:-1,commands:[nativeRouteCommand(0)],points:[[...position]]};
 return {key:nativeCommandKey(context,original),projectId:context.projectId,buildId:context.buildId,tag:context.tag,sourceSha256:context.tagSha256!,original,list:structuredClone(original),point:0,active:false,focus:0,locked:false,append:true};
}

export function nativeCommandPoint(draft:NativeCommandDraft|null):[number,number,number]|null {
 const point=draft?.list.points[draft.point];return draft&&Number.isInteger(draft.point)&&draft.point>=0&&draft.point<64&&
  Array.isArray(point)&&point.length===3&&point.every(v=>Number.isFinite(v)&&Math.abs(v)<=1e6)?point:null;
}
export function nativeCommandDrag(start:NativeCommandDraft|null,current:NativeCommandDraft|null,next:readonly number[]|undefined,enabled:boolean):NativeCommandDraft|null {
 if(!enabled||!start?.active||!current?.active||start.locked||current.locked||
  JSON.stringify(start)!==JSON.stringify(current)||!nativeCommandPoint(current)||!next||next.length!==3||next.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))return null;
 return {...current,list:{...current.list,points:current.list.points.map((p,i)=>i===current.point?[next[0],next[1],next[2]]:p)}};
}
import type { FirefightConfig } from './firefight';
export const campaignAiStates=['sleeping','alert','guarding','searching','fleeing','moving_repeat_same_position','moving_loop','moving_loop_back_and_forth','moving_loop_randomly','moving_randomly'] as const;
export type CampaignAiState=typeof campaignAiStates[number];
export interface NativeEncounterStart {id:string;position:[number,number,number];facingRadians:number;visible?:boolean;locked?:boolean}
export interface NativePatrolPoint extends NativeEncounterStart {waitSeconds:[number,number];weight:number}
export const campaignTacticalModes=['attacking','attackingSearch','attackingGuard','defending','defendingSearch','defendingGuard'] as const;
export type CampaignTacticalMode=typeof campaignTacticalModes[number];
export interface NativeFiringPoint {id:string;position:[number,number,number];group:string;visible?:boolean;locked?:boolean}
export interface NativeCombatSource {points:NativeFiringPoint[];groups:Record<CampaignTacticalMode,string[]>}
export interface NativeEncounterAppend {name:string;actorPath:string;position:[number,number,number];startActive:boolean;majorUpgrade?:typeof nativeMajorUpgrades[number];count?:number;spacing?:number;difficulty?:{normal:number;insane:number}|null;grid?:{total:number;offset:number;facingRadians?:number};starts?:NativeEncounterStart[];patrol?:{points:NativePatrolPoint[]};combat?:NativeCombatSource;behavior?:{initialState:CampaignAiState;returnState:CampaignAiState}}
export interface NativeSquadCountEdit {encounter:number;squad:number;encounterName:string;squadName:string;normalCount:number;insaneCount:number}
export interface NativeScenarioSquad {encounter:number;squad:number;encounterName:string;name:string;normalCount:number;insaneCount:number;starts?:{index:number;position:[number,number,number];facingRadians?:number|null;commandList?:number|null}[]|null}
export const nativeSourceAiStates=['none','sleeping','alert','moving_repeat_same_position','moving_loop','moving_loop_back_and_forth','moving_loop_randomly','moving_randomly','guarding','guarding_at_guard_position','searching','fleeing'] as const;
export const nativeMajorUpgrades=['normal','few','many','none','all'] as const;
export interface NativeSquadBehavior {majorUpgrade?:string;automaticMigration?:boolean;initialState:string;returnState:string;starts:{index:number;initialState:string;returnState:string}[];patrolCount:number}
export function nativeSourceStateReady(state:string,count:number){const index=nativeSourceAiStates.indexOf(state as typeof nativeSourceAiStates[number]);return index>=0&&count>=([4,5,6].includes(index)?2:[3,7].includes(index)?1:0);}
export function nativeBehaviorIssue(draft:NativeSquadBehavior,source:NativeSquadBehavior):string|null{
 if(draft.majorUpgrade!==undefined&&(source.majorUpgrade===undefined||!nativeMajorUpgrades.includes(draft.majorUpgrade as typeof nativeMajorUpgrades[number])))return 'Native upgrade policy is unavailable. Refresh supported source.';
 if(draft.automaticMigration!==undefined&&(typeof draft.automaticMigration!=='boolean'||typeof source.automaticMigration!=='boolean'))return 'Native migration flag is unavailable. Refresh the supported source before editing it.';
 if(draft.patrolCount!==source.patrolCount||draft.starts.length!==source.starts.length||draft.starts.some((p,i)=>p.index!==source.starts[i].index))return 'Refresh the source; starting-location or route indices changed.';
 const pairs=[[draft,source],...draft.starts.map((p,i)=>[p,source.starts[i]])];for(const [next,before]of pairs)for(const f of ['initialState','returnState'] as const){if(!nativeSourceAiStates.includes(next[f] as typeof nativeSourceAiStates[number]))return 'Native state is unavailable.';if(next[f]!==before[f]&&!nativeSourceStateReady(next[f],source.patrolCount))return 'A new moving state needs an authored source route. Restore this draft choice or prepare the native route first.';}return null;
}
export interface NativeSourcePatrolPoint {sourceIndex:number|null;position:[number,number,number];facingRadians:number;weight:number;waitSeconds:[number,number];animation:number;sequenceId:number}
export interface NativeSourcePatrolRoute {points:NativeSourcePatrolPoint[]}
export function nativePatrolIssue(route:NativeSourcePatrolRoute,source:NativeSourcePatrolRoute,behavior?:NativeSquadBehavior|null):string|null{
 if(route.points.length>32)return 'A native squad supports at most32 movement positions.';
 for(const p of route.points){
  if(p.position.length!==3||p.position.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)||!Number.isFinite(p.facingRadians)||Math.abs(p.facingRadians)>1e6||!Number.isFinite(p.weight)||p.weight<0||p.weight>1e6||p.waitSeconds.length!==2||p.waitSeconds.some(v=>!Number.isFinite(v)||v<0||v>1e6)||p.waitSeconds[0]>p.waitSeconds[1])return 'Use finite XYZ/facing, nonnegative weight and ordered wait bounds within the native limits.';
  if(p.sourceIndex!==null){const old=source.points[p.sourceIndex];if(!Number.isInteger(p.sourceIndex)||!old||p.animation!==old.animation||p.sequenceId!==old.sequenceId)return 'Existing patrol animation and sequence references must stay with their source row.';}
  else if(p.animation!==-1||p.sequenceId!==0)return 'New patrol points require no animation and sequence0.';
 }
 if(route.points.length!==source.points.length){
  if(!behavior)return 'Native behavior is unavailable; changing the point count is unsafe.';
  if([behavior,...behavior.starts].some(p=>!nativeSourceStateReady(p.initialState,route.points.length)||!nativeSourceStateReady(p.returnState,route.points.length)))return 'Keep enough route points for the squad and every starting-location movement state. Change behavior first.';
 }
 return null;
}
export function nativePatrolEqual(a:NativeSourcePatrolRoute,b:NativeSourcePatrolRoute):boolean{
 const close=(x:number,y:number)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=Math.max(1e-6,Math.max(Math.abs(x),Math.abs(y))*2**-22);
 return a.points.length===b.points.length&&a.points.every((p,i)=>{const q=b.points[i];return p.sourceIndex===q.sourceIndex&&p.animation===q.animation&&p.sequenceId===q.sequenceId&&p.position.every((v,j)=>close(v,q.position[j]))&&close(p.weight,q.weight)&&p.waitSeconds.every((v,j)=>close(v,q.waitSeconds[j]))&&Number.isFinite(p.facingRadians)&&Number.isFinite(q.facingRadians)&&Math.abs(Math.atan2(Math.sin(p.facingRadians-q.facingRadians),Math.cos(p.facingRadians-q.facingRadians)))<=.000002;});
}
export interface NativeScenarioCombat {encounter:number;name:string;points:{index:number;position:[number,number,number];group:string}[];squads:{index:number;name:string;groups:NativeCombatSource['groups'];behavior?:NativeSquadBehavior|null;behaviorIssue?:string|null;patrol?:NativeSourcePatrolRoute|null;patrolIssue?:string|null}[]}
export interface NativeNamedObject {name:string;class:string;index:number;nameIndex:number;tagPath:string;position:[number,number,number]}
export interface NativeCutsceneFlag {index:number;name:string;position:[number,number,number];facingRadians:[number,number]}
export interface NativeCameraPoint {index:number;name:string;position:[number,number,number];orientationRadians:[number,number,number];fovRadians:number}
export interface NativeVolumeGeometry {forward:[number,number,number];up:[number,number,number];corner:[number,number,number];dimensions:[number,number,number]}
export interface NativeTriggerVolume {name:string;kind:number;geometry:NativeVolumeGeometry|null}
export interface NativeDevicePlacement {class:'ctrl'|'mach'|'vehi';index:number;nameIndex:number;name:string;tagPath:string;position:[number,number,number];rotationRadians:[number,number,number];usableFromBothSides?:boolean;interactionDisabled?:boolean;manualActivation?:boolean;initiallyOff?:boolean;initiallyOpen?:boolean;powerGroup?:number;positionGroup?:number}
export interface NativeDeviceGroup {index:number;name:string;initialValue:number;changeOnce:boolean;reserved:boolean}
export interface NativeVehicleFlight {throttle:number;avoidanceDistance:number;pathfindingRadius:number}
export interface NativeTransportAppend {name:'extraction_pelican'|'extraction_spirit';tagPath:string;position:[number,number,number];rotationRadians:[number,number,number]}
export interface NativeFactionBody {faction:'unsc'|'covenant';bipedTagPath:string;permutation:number;includeFirstPersonArms?:boolean}
export interface NativeFactionKit {faction:'unsc'|'covenant';controlTagPath:string;position:[number,number,number];rotationRadians:[number,number,number];profile:import('./firefight').NativePlayerProfile}
export interface NativeSquadTerminal {number:number;controlTagPath:string;position:[number,number,number];rotationRadians:[number,number,number];readiness:boolean}
export interface NativeMachineSettings {
  machineType: 'door' | 'platform' | 'gear';
  powerTransitionTime: number;
  powerAccelerationTime: number;
  positionTransitionTime: number;
  positionAccelerationTime: number;
  depoweredPositionTransitionTime: number;
  depoweredPositionAccelerationTime: number;
}
export interface NativeControlSettings {controlType:string;trigger:string;callValue:number;automaticActivationRadius:number;delaySeconds:number}
export type NativeOperation =
  | {kind:'machineSettings';settings:NativeMachineSettings;sourceSha256:string}
  | {kind:'controlSettings';settings:NativeControlSettings;sourceSha256:string}
  | {kind:'playerStartPosition';index:number;copyFrom?:number;position:[number,number,number];facingRadians:number;sourceSha256:string}
  | {kind:'squadTerminals';terminals:NativeSquadTerminal[];sourceSha256:string}
  | {kind:'factionBody';body:NativeFactionBody;sourceSha256:string;replaceExisting?:boolean}
  | {kind:'factionKits';kits:NativeFactionKit[];sourceSha256:string} | {kind:'vehicleFlight';tuning:NativeVehicleFlight;sourceSha256:string} | {kind:'appendTransport';transport:NativeTransportAppend;sourceSha256:string} | {kind:'commandList';list:NativeCommandList;sourceSha256:string;append?:boolean} | {kind:'deviceGroupAppend';name:string;initialValue:number;changeOnce:boolean;sourceSha256:string} | {kind:'deviceGroupSettings';index:number;name:string;initialValue:number;changeOnce:boolean;sourceSha256:string} | {kind:'devicePlacement';device:NativeDevicePlacement;sourceSha256:string}| {kind:'triggerVolume';index:number;name:string;geometry:NativeVolumeGeometry;sourceSha256:string;append?:boolean}|{kind:'cutsceneFlag';point:NativeCutsceneFlag;sourceSha256:string;append?:boolean}|{kind:'cutsceneCamera';point:NativeCameraPoint;sourceSha256:string;append?:boolean}| { kind: 'boundingRadius'; value: number } | { kind: 'lensFlareScaleRepair' } | {kind:'hudDuplicate';array:string;index:number;sourceSha256:string}
  | ({kind:'encounterSquadCounts';sourceSha256:string}&NativeSquadCountEdit)
  | {kind:'encounterSquadCountsBatch';sourceSha256:string;edits:NativeSquadCountEdit[]}
  | {kind:'encounterStartPosition';encounter:number;squad:number;start:number;encounterName:string;squadName:string;position:[number,number,number];sourceSha256:string;facingRadians?:number|null;commandList?:number|null}
  | {kind:'encounterSquadPatrol';encounter:number;squad:number;encounterName:string;squadName:string;route:NativeSourcePatrolRoute;sourceSha256:string}
  | {kind:'encounterSquadBehavior';encounter:number;squad:number;encounterName:string;squadName:string;behavior:NativeSquadBehavior;sourceSha256:string}
  | {kind:'encounterFiringPosition';encounter:number;point:number;encounterName:string;position:[number,number,number];group:string;sourceSha256:string}
  | {kind:'encounterSquadFiringGroups';encounter:number;squad:number;encounterName:string;squadName:string;groups:NativeCombatSource['groups'];sourceSha256:string}
  | ({kind:'appendEncounter'}&Omit<NativeEncounterAppend,'grid'|'starts'|'behavior'|'patrol'|'combat'>) | {kind:'appendEncounters';encounters:NativeEncounterAppend[];sourceRules?:FirefightConfig};
export interface NativeTagContext {
  missionSource?:{encounters:{name:string;initiallyCreated:boolean}[];weapons:NativeMissionWeapon[]}|null;missionSourceIssue?:string|null;
  vehicleFlight?:NativeVehicleFlight|null;vehicleFlightIssue?:string|null;
  sourceTarget?: 'mcc-cea' | 'gbx-custom';
  projectId: string;
  buildId: string;
  tag: string;
  class: string;
  tagsDirectory: string;
  tagSha256?:string;
  machineSettings?:NativeMachineSettings|null;machineSettingsIssue?:string|null;
  controlSettings?:NativeControlSettings|null;controlSettingsIssue?:string|null;controlRequiresPlayerActivation?:boolean;
  boundingRadius: number | null;
  lensFlareScale: number | null;
  actorVariants?:string[];
  canAppendEncounter?:boolean;
  canAppendTransport?:boolean;vehicleSources?:string[];
  canAppendFactionKits?:boolean;controlSources?:string[];weaponSources?:string[];bipedSources?:string[];
  factionKits?:{kit:NativeFactionKit;body?:{bipedTagPath:string;permutation:number;firstPersonArms?:boolean}|null}[];factionBodyIssue?:string|null;
  scenarioSquads?:NativeScenarioSquad[];
  scenarioStartSquads?:NativeScenarioSquad[];
  scenarioPlayerStarts?:{index:number;position:[number,number,number];facingRadians?:number|null}[];
  playerStartEditIssue?:string|null;
  scenarioDevices?:NativeDevicePlacement[];
  scenarioDeviceGroups?:NativeDeviceGroup[]|null;
  deviceEditIssue?:string|null;
  scenarioVolumes?:NativeTriggerVolume[];
  triggerEditIssue?:string|null;
  guidanceObjects?:NativeNamedObject[]|null;guidanceObjectIssue?:string|null;
  scenarioFlags?:NativeCutsceneFlag[];flagEditIssue?:string|null;
  scenarioCameras?:NativeCameraPoint[];
  cameraEditIssue?:string|null;
  scenarioCommandLists?:{index:number;name:string;commands:number}[];
  commandListIssue?:string|null;
  vehicleSeats?:string[]|null;
  vehicleSeatIssue?:string|null;
  commandSource?:NativeCommandSource|null;
  commandSourceIssue?:string|null;
  protectedCommandLists?:number[];
  scenarioCombat?:NativeScenarioCombat[];
  combatEditIssue?:string|null;
  startEditIssue?:string|null;
  squadEditIssue?:string|null;
  protectedSquadEncounters?:string[];
  hudArrays?:{name:string;label:string;count:number|null;maximum:number;issue:string|null}[];
  canDuplicateHud?:boolean;
  hudStructureIssue?:string|null;
  firefightPlan?:Extract<NativeOperation,{kind:'appendEncounters'}>|null;
  firefightPlanIssue?:string|null;
  canEdit: boolean;
  canRepair: boolean;
  editIssue: string | null;
  repairIssue: string | null;
  history: NativePreview[];
}
export interface NativePreview {
  id: string;
  tag: string;
  toolId: string;
  beforeSha256: string;
  afterSha256: string;
  changedBytes: number;
  fieldChanges: { before: string; after: string }[];
  actorPositions?:[number,number,number][]|null;
  detail: string;
  currentState: 'before' | 'after' | 'conflict';
}
export interface NativeAccepted {
  operationId: string;
  revisionId: string;
  tagsDirectory: string;
  files: number;
  restored: boolean;
  detail: string;
}
export interface NativeDependencies {
  tag: string;
  tool: string;
  executableSha256: string;
  complete: boolean;
  dependencies: { path: string; reportedBroken: boolean; present: boolean }[];
  output: string;
  detail: string;
}
export function notifyNativeSource(projectId: string) {
  window.dispatchEvent(new CustomEvent('guilty-spark-native-source-changed', { detail: { projectId } }));
}

/** Source-only campaign proposal. Native writing and validation remain in the existing append recipe. */
export function scaleCampaignDifficulty(entries:NativeEncounterAppend[],normalFactor:number,insaneFactor:number,selected?:string){
 if(!entries.length||[normalFactor,insaneFactor].some(value=>!Number.isFinite(value)||value<0||value>4))throw Error('Choose campaign groups and finite population factors between 0 and 4.');
 if(selected!==undefined&&!entries.some(entry=>entry.name===selected))throw Error('Select an existing campaign encounter.');
 const rows:{name:string;before:[number,number];after:[number,number];clamped:boolean}[]=[];
 let changed=0;
 const next=entries.map(entry=>{
  if(selected!==undefined&&entry.name!==selected)return entry;
  const count=entry.count??1,before:[number,number]=[entry.difficulty?.normal??count,entry.difficulty?.insane??count];
  if(!Number.isInteger(count)||count<1||count>32||before.some(value=>!Number.isInteger(value)||value<0||value>count))throw Error('Review invalid starting-position or native difficulty counts for '+entry.name+'.');
  const requested:[number,number]=[Math.round(before[0]*normalFactor),Math.round(before[1]*insaneFactor)];
  const after=requested.map(value=>Math.min(count,value)) as [number,number];
  rows.push({name:entry.name,before,after,clamped:requested.some(value=>value>count)});
  if(before.every((value,index)=>value===after[index]))return entry;
  changed++;return {...entry,difficulty:{normal:after[0],insane:after[1]}};
 });
 return {entries:next,rows,changed};
}

/** Same f32 native grid for preview; explicit poses become the sole source on edit. */
export function campaignEncounterStarts(entry:NativeEncounterAppend):NativeEncounterStart[]{
 campaignPatrolPoints(entry);campaignCombatPoints(entry);
 if(entry.starts){if(entry.grid||entry.starts.length!==(entry.count??1)||!entry.starts.length||entry.starts.length>32)throw Error('Review the individual campaign start count.');const ids=new Set<string>();for(const point of entry.starts){if(typeof point.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(point.id)||ids.has(point.id)||!Array.isArray(point.position)||point.position.length!==3||point.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||!Number.isFinite(point.facingRadians)||Math.abs(point.facingRadians)>Math.PI*2+1e-6)throw Error('Campaign starts need distinct source IDs, finite XYZ within2048 and facing within one turn.');ids.add(point.id);}return entry.starts;}
 const count=entry.count??1,total=entry.grid?.total??count,offset=entry.grid?.offset??0,side=Math.ceil(Math.sqrt(total)),half=(side-1)/2,spacing=Math.fround(entry.spacing??.75);
 const facingRadians=Math.fround(entry.grid?.facingRadians??0);
 if(!Number.isFinite(facingRadians)||Math.abs(facingRadians)>Math.fround(Math.PI))throw Error('Review the native starting grid facing.');
 if(!Number.isInteger(count)||count<1||count>32||total<1||total>32||offset<0||offset+count>total)throw Error('Review the campaign starting grid.');
 return Array.from({length:count},(_,index)=>({id:'grid-'+index,position:[Math.fround(Math.fround(entry.position[0])+Math.fround(((offset+index)%side-half)*spacing)),Math.fround(Math.fround(entry.position[1])+Math.fround((Math.floor((offset+index)/side)-half)*spacing)),Math.fround(entry.position[2])],facingRadians}));
}
export function campaignAiStateReady(state:CampaignAiState,count:number){return !state.startsWith('moving_')||count>=(['moving_loop','moving_loop_back_and_forth','moving_loop_randomly'].includes(state)?2:1);}
export function campaignPatrolPoints(entry:NativeEncounterAppend):NativePatrolPoint[]{
 const points=entry.patrol?.points??[];if(entry.patrol&&(!points.length||points.length>32))throw Error('A native patrol needs1–32 movement points.');
 const ids=new Set<string>();for(const point of points){if(!/^[A-Za-z0-9_-]{1,64}$/.test(point.id)||ids.has(point.id)||point.position.length!==3||point.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||!Number.isFinite(point.facingRadians)||Math.abs(point.facingRadians)>Math.PI*2+1e-6||!Array.isArray(point.waitSeconds)||point.waitSeconds.length!==2||point.waitSeconds.some(v=>!Number.isFinite(v)||v<0||v>3600)||point.waitSeconds[0]>point.waitSeconds[1]||!Number.isFinite(point.weight)||point.weight<=0||point.weight>100)throw Error('Patrol points need unique IDs, finite XYZ/facing, positive weights≤100 and ordered0–3600second waits.');ids.add(point.id);}
 if(entry.behavior&&[entry.behavior.initialState,entry.behavior.returnState].some(state=>!campaignAiStates.includes(state)||!campaignAiStateReady(state,points.length)))throw Error('Choose a supported native AI state and author enough patrol points before selecting movement behavior.');
 return points;
}
export const campaignPatrolId=(encounter:string,point:string)=>'campaignPatrol:'+encounter+':'+point;
export const campaignStartId=(encounter:string,start:string)=>'campaign:'+encounter+':'+start;

export const campaignFiringId=(encounter:string,id:string)=>'campaignFiring:'+encounter+':'+id;
export function campaignCombatPoints(entry:NativeEncounterAppend):NativeFiringPoint[]{
 const points=entry.combat?.points??[];if(!entry.combat)return points;if(!points.length||points.length>512)throw Error('Native combat source needs1–512 firing positions.');
 for(const mode of campaignTacticalModes){const groups=entry.combat.groups?.[mode];if(!Array.isArray(groups)||groups.length>26||new Set(groups).size!==groups.length||groups.some(g=>typeof g!=='string'||!/^[a-z]$/.test(g)))throw Error('Each tactical mode needs distinct native groups A–Z (or an explicit empty selection).');}
 const ids=new Set<string>();for(const p of points){if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)||!Array.isArray(p.position)||p.position.length!==3||p.position.some(v=>!Number.isFinite(v)||Math.abs(v)>2048)||typeof p.group!=='string'||!/^[a-z]$/.test(p.group))throw Error('Firing points need unique IDs, finite XYZ within2048 and one native group A–Z.');ids.add(p.id);}return points;
}
export function customizeCampaignCombat(entry:NativeEncounterAppend):NativeCombatSource{return {points:campaignEncounterStarts(entry).map(p=>({id:p.id,position:[...p.position],group:'a'})),groups:Object.fromEntries(campaignTacticalModes.map(mode=>[mode,['a']])) as NativeCombatSource['groups']};}

/** Explicit source review for the pinned MCC compiler; never modifies input. */
export function campaignMccSearchReview(combat:Pick<NativeCombatSource,'groups'>){const groups={...combat.groups,attackingSearch:[...new Set([...combat.groups.attackingSearch,...combat.groups.attacking])].sort(),defendingSearch:[...new Set([...combat.groups.defendingSearch,...combat.groups.attacking])].sort()};return {groups,changed:groups.attackingSearch.length!==combat.groups.attackingSearch.length||groups.defendingSearch.length!==combat.groups.defendingSearch.length};}

export interface NativeFlightLeg {
 action:number;
 from:number|null;
 to:number;
 sharedBsps:number[];
 crossing:{bsp:number;fraction:number;point:[number,number,number]}|null;
}
export interface NativeCommandGeometryReview {
 buildId:string;tagSha256:string;outputSha256:string;groundDrop?:number|null;
 controlMount?:{tagPath:string;offset:number|null;issue:string|null}|null;
 points:{point:[number,number,number];bsps:number[];nearPartition:boolean;supports:{bsp:number;z:number}[];ground?:{bsp:number;z:number}[]}[];
 route?:{origin:[number,number,number]|null;issue:string|null;legs:NativeFlightLeg[]}|null;
}

export interface NativeMissionWeapon {tagPath:string;placements:number[];startingEquipment:boolean;objects?:{index:number;name:string|null;notPlacedAutomatically:boolean;createIssue:string|null}[]}
