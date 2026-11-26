import type {NativeTagContext} from './nativeOperations';
/** Authoring-only mission, cinematic, dedicated server and QA project data.
 *
 * No workflow in this module edits installed Halo files or starts a process.
 * Halo CE server commands are exported ONLY as a validated, user-reviewed
 * plaintext draft. The other runtime families deliberately have no exporter.
 */
import {addLogicTrigger,missionExtractionFields,setNativeLogicName} from './nativeLogic.ts';
import type {Project} from './types';
import {validMachinimaSettings} from './machinima.ts';

const extractionTerminalRoles = new Map<string, {purpose:string; effect:string}>([
  ['extraction_deploy', {purpose:'Deploy', effect:'Issues the selected kit and starts deployment.'}],
  ['extraction_loadout', {purpose:'Review loadout', effect:'First use shows the kit. Further uses can change the saved selection. Crouch-use opens the discard interaction.'}],
  ['extraction_debrief', {purpose:'Review debrief', effect:'Standing use reads the operation result. Crouch-use opens the stash discard interaction.'}],
  ['extraction_unsc', {purpose:'Join UNSC', effect:'Selects the UNSC body and kit. Incompatible carried weapons may drop next to the player.'}],
  ['extraction_covenant', {purpose:'Join Covenant', effect:'Selects the Covenant body and kit. Incompatible carried weapons may drop next to the player.'}],
  ['extraction_activate', {purpose:'Request evacuation', effect:'Calls the shared evacuation when the mission allows it.'}],
  ['extraction_unsc_ground_call', {purpose:'Request UNSC ground evacuation', effect:'Arms the return to the UNSC hub to bank gear.'}],
  ['extraction_cov_ground_call', {purpose:'Request Covenant ground evacuation', effect:'Arms the return to the Covenant hub to bank gear.'}],
  ['extraction_unsc_deploy', {purpose:'Deploy UNSC', effect:'Issues the UNSC kit and starts deployment.'}],
  ['extraction_covenant_deploy', {purpose:'Deploy Covenant', effect:'Issues the Covenant kit and starts deployment.'}],
  ['extraction_pelican_activate', {purpose:'Call Pelican', effect:'Requests Pelican evacuation when the UNSC route is ready.'}],
  ['extraction_spirit_activate', {purpose:'Call Spirit', effect:'Requests Spirit evacuation when the Covenant route is ready.'}],
]);

/** Recognize the engine's exact control names and flag other monitors for source review. */
export function extractionTerminalReview(devices: NonNullable<NativeTagContext['scenarioDevices']>) {
  const counts = new Map<string, number>();
  for (const device of devices) counts.set(device.name, (counts.get(device.name) ?? 0) + 1);
  const seen = new Set<string>();
  const terminals = devices.flatMap(device => {
    const {name, class: tagClass} = device;
    const squad = /^extraction_squad_(0[1-9]|1[0-9]|2[0-2])$/.exec(name);
    const role = extractionTerminalRoles.get(name) ?? (squad ? {
      purpose:'Select squad ' + Number(squad[1]), effect:'Changes the player’s squad selection in the hub.',
    } : undefined);
    // Include nonstandard extraction controls so a typo or a debug binding
    // does not appear to be recognized by the runtime.
    if (!role && (tagClass !== 'ctrl' || (!/^extraction_/i.test(name) && !/holo[ _-]*control|monitor/i.test(device.tagPath)))) return [];
    if (role && seen.has(name)) return [];
    if (role) seen.add(name);
    const duplicate = !!name && (counts.get(name) ?? 0) > 1;
    const issue = duplicate ? 'Duplicate scenario name'
      : tagClass !== 'ctrl' ? 'Name is assigned to a different object class'
      : device.interactionDisabled ? 'Player interaction is disabled'
      : !role ? 'Review script or device links before enabling this control'
      : null;
    return [{
      device, purpose: role?.purpose ?? 'Unassigned monitor',
      effect: role?.effect ?? 'This name has no built-in Extraction action.', issue,
      canLocate: tagClass === 'ctrl' && !!name && !duplicate,
    }];
  });
  const regionalGround = ['extraction_unsc_ground_call','extraction_cov_ground_call'];
  const deploy = regionalGround.some(name=>seen.has(name)) ? ['extraction_unsc_deploy','extraction_covenant_deploy'] : ['extraction_deploy'];
  const missing = deploy.filter(name=>!seen.has(name));
  if(regionalGround.some(name=>seen.has(name)))missing.push(...regionalGround.filter(name=>!seen.has(name)));
  else if(!missionExtractionFields.some(field=>seen.has(field.control)))missing.push('evacuation control');
  return {terminals, missing};
}

/** Native radio cue: imported snd! closure, not a separate audio engine. */
export interface MissionSoundCue {
  importId: string;
  soundPath: string;
  phase: 'start' | 'complete';
  gain: number;
  delayMs: number;
  caption: string;
}
export function validMissionSoundCue(cue:MissionSoundCue):boolean {
  return !!cue&&typeof cue==='object'&&Object.keys(cue).every(key=>['importId','soundPath','phase','gain','delayMs','caption'].includes(key))&&
    typeof cue.importId==='string'&&/^[a-zA-Z0-9_-]{1,72}$/.test(cue.importId)&&
    typeof cue.soundPath==='string'&&cue.soundPath.length<=255&&/^[A-Za-z0-9_][A-Za-z0-9_ ./-]*$/.test(cue.soundPath)&&
    cue.soundPath.split('/').every(part=>part!==''&&part!=='.'&&part!=='..')&&
    ['start','complete'].includes(cue.phase)&&Number.isFinite(cue.gain)&&cue.gain>=0&&cue.gain<=1&&
    Number.isInteger(cue.delayMs)&&cue.delayMs>=0&&cue.delayMs<=60000&&
    typeof cue.caption==='string'&&cue.caption.length<=254&&!/[%\x00-\x1f\x7f]/.test(cue.caption);
}
/** A saved cue must resolve to its exact receipt, class and native path. */
export function missionSoundImport(project:Project,cue:MissionSoundCue) {
  const found=project.nativeAssetImports?.filter(binding=>binding.id===cue.importId)??[];
  return found.length===1&&found[0].tagClass==='snd!'&&found[0].nativePath.replaceAll('\\','/')===cue.soundPath?found[0]:undefined;
}
/** Verify selected closures before preparation; the existing importer rechecks
 * their receipts, bytes and origins during native staging. */
export function missionSoundProblems(project:Project):string[] {
  return (project.studio?.missions??[]).flatMap(beat=>{
    const cue=beat.soundCue;if(!cue)return [];
    if(!validMissionSoundCue(cue))return ['Invalid radio cue on '+beat.title];
    return missionSoundImport(project,cue)?[]:
      ['Mission '+beat.title+' needs its exact included native sound. Choose the imported sound again; no missing audio is replaced.'];
  });
}
export interface MissionCinematicCue {firstShotId:string;lastShotId:string;phase:'start'|'complete'}
/** Stable shot IDs retain the selected sequence through rename, history and Save. */
export function missionCinematicShots(studio:Pick<CreatorStudioDocument,'shots'>,beat:Pick<MissionBeat,'cinematicCue'>):CameraShot[] {
  const cue=beat.cinematicCue;if(cue==null)return [];
  if(typeof cue!=='object'||Array.isArray(cue)||Object.keys(cue).some(key=>!['firstShotId','lastShotId','phase'].includes(key))||
    typeof cue.firstShotId!=='string'||typeof cue.lastShotId!=='string'||!['start','complete'].includes(cue.phase))throw Error('Invalid mission camera scene');
  const first=studio.shots.findIndex(shot=>shot.id===cue.firstShotId),last=studio.shots.findIndex(shot=>shot.id===cue.lastShotId);
  if(first<0||last<first)throw Error('Mission camera scene needs an existing first and last shot in timeline order. Select its range again.');
  return studio.shots.slice(first,last+1);
}
export function missionCameraUsers(studio:Pick<CreatorStudioDocument,'missions'>,shotId:string):MissionBeat[] {
  return studio.missions.filter(beat=>beat.cinematicCue?.firstShotId===shotId||beat.cinematicCue?.lastShotId===shotId);
}
export interface MissionBeat {
  /** Absent: shared mission.01–22: native Forerunner operation membership. */
  squadNumber?:number|null;
  allowSharedPresentation?:boolean|null;
  /** Final shared settlement beat can open evacuation after the first physical arrival. */
  earlyExtraction?:boolean|null;
  /** Use the native begin and abort callbacks for this numbered operation. */
  resetOnDeployment?:boolean|null;
  guidance?:{flag?:string|null;object?:string|null;height:number}|null;
  id: string;
  title: string;
  objective: string;
  trigger: 'manual' | 'triggerVolume' | 'encounterCleared' | 'escort' | 'deviceActivated' | 'weaponOwned' | 'forerunnerExtractionSettled' | 'timer';
  encounterName: string;
  /** Explicit runtime team for this encounter only; absent retains legacy behavior. */
  encounterTeam?:'source'|'human'|'covenant'|'flood'|null;
  /** Escort uses delivered NPCs; an area beat can require a real player insertion at its pad. */
  transportInsertion?:'pelican'|'spirit'|null;
  triggerRef?: string | null;
  weaponPath?: string | null;
  /** Existing named scenario weapon, created once when this collection step starts. */
  createWeaponObject?: string | null;
  timerSeconds?: number | null;
  minimumSurvivors?: number | null;
  escortRequiresPlayer?: boolean | null;
  /** Existing native ground command list that leads the escort into its rally area. */
  escortRoute?: string | null;
  escortFailure?: 'stop' | 'continue' | null;
  hudObjective?: boolean | null;
  hudText?: string | null;
  checkpoint?: boolean | null;
  completeMission?: boolean | null;
  /** Evaluate this native player-volume condition when the beat begins; false skips it. */
  conditionVolume?: string | null;
  /** Shared native volume decision, sampled once at the first member. */
  conditionGroup?: string | null;
  /** Remember entries into the branch area while an earlier weapon objective is active. */
  conditionVisitDuring?: string | null;
  conditionOutside?: boolean | null;
  conditionResult?: {beatId:string;failed:boolean} | null;
  soundCue?: MissionSoundCue | null;
  cinematicCue?: MissionCinematicCue | null;
}
export interface CameraShot {
  id: string;
  name: string;
  durationMs: number;
  cameraPosition: [number, number, number];
  lookAt: [number, number, number];
  fov: number;
  subtitle: string;
  cameraMarker?: string|null;
  /** Editor interpolation and native prepared roll; raw HaloScript still uses named markers. */
  roll?: number;
  easing?: 'linear' | 'smooth' | 'cut';
}
export type ServerRuntime = 'haloCustomEdition' | 'haloPC' | 'haloDemo' | 'mcc' | 'openCE' | 'chupathingyCE';
export interface GameTypeDesign {
  id: string;
  /** This is an authoring plan, never a native blam.lst writer. */
  name: string;
  baseVariant: 'slayer'|'ctf'|'oddball'|'king'|'race'|'juggernaut'|'assault';
  teamPlay: boolean;
  scoreLimit: number;
  timeLimitMinutes: number;
  respawnSeconds: number;
  friendlyFire: boolean;
  startingEquipment: 'mapDefault'|'rockets'|'snipers'|'custom';
  specialRules: 'standard'|'infectionConcept'|'firefightConcept';
  /** User-declared confirmation, not a verified filesystem check. */
  nativeStatus: 'draft'|'userConfirmedInGame';
  nativeEvidence: string;
  notes: string;
}
export interface ServerPlan {
  name: string;
  runtime: ServerRuntime;
  maxPlayers: number;
  publicListing: boolean;
  rotation: { id: string; map: string; gameVariant: string }[];
  /** Optional for backwards-compatible v1 project reads. */
  gameTypes?: GameTypeDesign[];
}
export type PlaytestVerdict = 'notRun' | 'pass' | 'fail' | 'blocked';
export interface PlaytestRecord {
  id: string;
  caseId: string;
  target: string;
  verdict: PlaytestVerdict;
  performedAt: string;
  evidence: string;
  notes: string;
  manuallyReported: boolean;
}
export interface CreatorStudioDocument {
  /** Recovered native cinematic activation; null keeps manual invocation. */
  cinematicTriggerVolume?:string|null;
  engineMachinima?:{enabled:boolean;playback:'fixed'|'sequence';cameraId?:string|null;autoStart:boolean}|null;
  schemaVersion: 1;
  missions: MissionBeat[];
  shots: CameraShot[];
  server: ServerPlan;
  playtests: PlaytestRecord[];
  machinima?: import('./machinima').MachinimaSettings;
}
export function emptyCreatorStudio(): CreatorStudioDocument {
  return {
    schemaVersion: 1, missions: [], shots: [], playtests: [],
    server: { name: 'Guilty Spark LAN', runtime: 'haloCustomEdition', maxPlayers: 8, publicListing: false, rotation: [], gameTypes: [] },
  };
}
/** An editable blueprint using existing native bindings, not a deployed game. */
export interface BlackEchoOptions {faction:'unsc'|'covenant';rescue:string;facility:string;defense:string}
export const defaultBlackEchoOptions=(faction:BlackEchoOptions['faction']='unsc'):BlackEchoOptions=>({faction,rescue:faction==='unsc'?'be_marines':'be_covenant',facility:faction==='unsc'?'be_covenant':'be_marines',defense:'be_defense'});
export function blackEchoMission(nextId:()=>string,options?:BlackEchoOptions):MissionBeat[] {
  const roles=options??defaultBlackEchoOptions(),covenant=roles.faction==='covenant';
  if(!['unsc','covenant'].includes(roles.faction)||[roles.rescue,roles.facility,roles.defense].some(name=>!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name))||[roles.facility,roles.defense,'be_flood'].includes(roles.rescue)||roles.facility==='be_flood'||roles.defense==='be_flood')throw Error('Choose valid, nonconflicting native rescue, opposing facility and defense encounters.');
  const rows:[string,string,MissionBeat['trigger'],string,string?][]=[
    ['Squad insertion','Reach the insertion area and review the operation briefing.','triggerVolume','be_insert'],
    ['Rescue stranded Marines','Reach the rescue rally alongside the surviving Marines before engaging the facility defenders.','escort','be_marines'],
    ['Investigate the Covenant facility','Clear the facility defenders and search for the classified package.','encounterCleared','be_covenant'],
    ['Recover classified technology','This step waits for actual technology collection logic to call gs_complete_4. The reference area is an authoring marker; entering it alone cannot acquire or bank equipment.','manual','be_artifact'],
    ['Contain the Flood emergency','Optional containment branch: when this step begins, a player in be_containment requests the Flood encounter. Otherwise continue to extraction defense.','encounterCleared','be_flood','be_containment'],
    ['Defend the extraction point','Clear the forces attacking the evacuation site.','encounterCleared','be_defense'],
    ['Extract survivors and equipment','Reach evacuation. This step waits for actual survivor/loot settlement to call gs_complete_7. The reference area alone cannot bank inventory or complete extraction; the persistent world stays active.','manual','be_extract'],
  ];
  return rows.map(([title,objective,trigger,reference,conditionVolume],index)=>({
    id:nextId(),title:covenant&&index===1?'Rescue stranded Covenant':covenant&&index===2?'Investigate the UNSC facility':title,
    objective:covenant&&index===1?'Reach the rescue rally alongside your surviving Covenant allies before engaging the UNSC defenders.':covenant&&index===2?'Clear the UNSC defenders and recover the classified package.':objective,trigger,
    encounterName:index===1?roles.rescue:index===2?roles.facility:index===5?roles.defense:trigger==='encounterCleared'?reference:'',
    ...(options&&(trigger==='escort'||trigger==='encounterCleared')?{encounterTeam:index===4?'flood' as const:(index===1)==covenant?'covenant' as const:'human' as const}:{}),
    ...(trigger==='escort'?{triggerRef:'be_survivors',minimumSurvivors:1,escortRequiresPlayer:true}:trigger!=='encounterCleared'?{triggerRef:reference}:{}),...(conditionVolume?{conditionVolume}:{}),
    hudObjective:true,hudText:covenant&&index===1?'Rescue stranded Covenant':covenant&&index===2?'Investigate the UNSC facility':title,
  }));
}
/** Explicitly bind this known blueprint to Forerunner's existing native contract.
 * Existing objective IDs, authored text, source modules and other beats survive. */
export function connectBlackEchoObjectives(project:Project,nextId:()=>string,nativeSource?:NativeTagContext|null,options?:BlackEchoOptions):Project {
 const base=project.studio?.missions.length?project:addBlackEchoDraft(project,nextId,nativeSource,options),studio=base.studio!,beats=studio.missions;
 const insertion=beats[0];
 const starterArea=insertion?.trigger==='triggerVolume'&&insertion.triggerRef==='be_insert'&&insertion.transportInsertion==null;
 const terminal=insertion?.trigger==='deviceActivated'&&insertion.triggerRef==='extraction_deploy'&&insertion.transportInsertion==null;
 const authoredArrival=insertion?.trigger==='triggerVolume'&&insertion.transportInsertion!=null&&scriptIdent.test(insertion.triggerRef??'');
 if(beats.length!==7||!(starterArea||terminal||authoredArrival)||beats[1].trigger!=='escort'||beats[1].triggerRef!=='be_survivors'||beats[2].trigger!=='encounterCleared'||beats[4].trigger!=='encounterCleared'||beats[4].encounterName!=='be_flood'||beats[5].trigger!=='encounterCleared'||!['manual','weaponOwned'].includes(beats[3].trigger)||!['manual','forerunnerExtractionSettled'].includes(beats[6].trigger))throw Error('Open the seven-step Black Echo blueprint; preserve other authored missions.');
 const terminalObjective='Activate the native deployment terminal to begin the operation. Runtime insertion and physical flight remain separate gameplay checks.';
 // Only upgrade the old generated terminal objective. A creator's own terminal or pad binding stays intact.
 const generatedStart=insertion.squadNumber==null&&(starterArea||(terminal&&insertion.objective===terminalObjective));
 const forge=base.quickForge;
 const covenant=beats[1].encounterTeam==='covenant';
 let arrival:{transport:'pelican'|'spirit';pad:string;aircraft:string}|null=null;
 if(generatedStart&&covenant)arrival={transport:'spirit',pad:'spirit_zone',aircraft:'Spirit'};
 if(generatedStart&&!covenant&&(!forge||forge.native)){
  const pelicans=nativeSource?.scenarioDevices?.filter(row=>row.name?.toLowerCase()==='extraction_pelican')??[];
  if(pelicans.length>1||pelicans.some(row=>row.name!=='extraction_pelican'||row.class!=='vehi'))throw Error('Use one named native Pelican vehicle: extraction_pelican. Review the current scenario names before connecting.');
  if(pelicans.length===1)arrival={transport:'pelican',pad:'extraction_zone',aircraft:'Pelican'};
 }
 let evacuation: string=missionExtractionFields[0].control;
 if(!forge||forge.native){
  requireNativeBlackEcho(base,nativeSource,{rescue:beats[1].encounterName,facility:beats[2].encounterName,defense:beats[5].encounterName});if(nativeSource!.sourceTarget!=='gbx-custom')throw Error('Forerunner settlement requires reviewed standard CE609 solo source; other engines do not provide its callback.');
  const [sharedField,pelicanField,spiritField]=missionExtractionFields;
  const factionField=covenant?spiritField:pelicanField;
  const named=(name:string)=>nativeSource.scenarioDevices?.filter(row=>row.name.toLowerCase()===name)??[];
  const areas=(name:string)=>nativeSource.scenarioVolumes?.filter(row=>row.name.toLowerCase()===name)??[];
  const hasFactionRoute=named(factionField.control).length>0||areas(factionField.zone).length>0;
  const field=beats[6].trigger==='manual'
    ?beats[6].squadNumber==null&&hasFactionRoute?factionField:sharedField
    :missionExtractionFields.find(row=>row.control===beats[6].triggerRef);
  if(!field)throw Error('Select a supported native evacuation control in the final objective.');
  evacuation=field.control;
  if(arrival&&hasFactionRoute)arrival.pad=factionField.zone;
  const arrivalPad=arrival?.pad??(authoredArrival?insertion.triggerRef:null);
  for(const name of ['extraction_return',field.zone]){
   const pads=areas(name);
   if(pads.length!==1||pads[0].name!==name||pads[0].kind!==1||!pads[0].geometry)throw Error('Author a unique readable native extraction pad: '+name);
  }
  if(arrivalPad){
   const pads=areas(arrivalPad.toLowerCase());
   if(pads.length!==1||pads[0].name!==arrivalPad||pads[0].kind!==1||!pads[0].geometry)throw Error('Author a unique readable native arrival pad: '+arrivalPad+'. Accept, build and read native source again.');
  }
  for(const name of ['extraction_deploy',field.control]){
   const controls=named(name);
   if(controls.length!==1||controls[0].name!==name||controls[0].class!=='ctrl'||controls[0].interactionDisabled)throw Error('Author a unique usable native extraction control: '+name);
  }
 }else if(forge.gameMode!=='campaign'||!['haloCustomEdition','chupathingyCe'].includes(forge.runtimeId))throw Error('Choose an editable standard Custom Edition campaign build target for Forerunner. Other runtimes do not provide its settled-extraction callback.');
 const pickup=beats[3],containment=beats[4];
 const useContainmentVisit=containment.conditionVolume==='be_containment'&&
   containment.conditionGroup==null&&containment.conditionVisitDuring==null&&
   containment.conditionOutside==null&&containment.conditionResult==null&&
   containment.objective.startsWith('Optional containment branch: when this step begins,')&&
   (pickup.squadNumber??0)===(containment.squadNumber??0)&&pickup.conditionVolume==null&&pickup.conditionResult==null;
 const missions=beats.map((beat,index):MissionBeat=>{
  if(index===0&&arrival)return {...beat,trigger:'triggerVolume',triggerRef:arrival.pad,transportInsertion:arrival.transport,
   objective:beat.objective===terminalObjective||beat.objective==='Reach the insertion area and review the operation briefing.'
     ?'Ride the '+arrival.aircraft+' to the field. Disembark after it lands to begin the rescue.':beat.objective,
   hudText:beat.hudText==='Squad insertion'?'Ride the '+arrival.aircraft+' to the field and disembark.':beat.hudText};
  if(index===0&&starterArea)return {...beat,trigger:'deviceActivated',triggerRef:'extraction_deploy',objective:terminalObjective};
  if(index===3&&(beat.trigger==='manual'||useContainmentVisit))return {...beat,trigger:'weaponOwned',weaponPath:beat.weaponPath??'',
   objective:useContainmentVisit?'Collect the selected native technology weapon. Visit the separate containment area while this objective is active to opt into the Flood encounter.':'Collect the selected native technology weapon. Actual player inventory ownership completes this objective.',
   hudText:useContainmentVisit&&beat.hudText==='Recover classified technology'?'Recover the technology. Visit the containment area before pickup to investigate the Flood.':beat.hudText};
  if(index===4&&useContainmentVisit)return {...beat,conditionVisitDuring:pickup.id,
   objective:'This optional encounter runs if anyone visited the containment area during technology recovery. Otherwise continue to extraction defense.'};
  if(index===6&&beat.trigger==='manual')return {...beat,trigger:'forerunnerExtractionSettled',triggerRef:evacuation,
   objective:'Activate evacuation after the objectives, then physically return to the hub. Forerunner completes this objective only after surviving players and gear settle.'};
  return beat;
 });
 return missions.every((beat,index)=>beat===beats[index])?base:{...base,studio:{...studio,missions}};
}
/** Bind only an explicitly read existing native campaign. No native tag, marker,
 * original placement, recipe or script is changed by the metadata action. */
function requireNativeBlackEcho(project:Project,source?:NativeTagContext|null,roles:Pick<BlackEchoOptions,'rescue'|'facility'|'defense'>=defaultBlackEchoOptions()):asserts source is NativeTagContext {
 if(!source||source.projectId!==project.id||source.class!=='scnr'||!['gbx-custom','mcc-cea'].includes(source.sourceTarget??'')||!source.canAppendEncounter||!/^[a-f0-9]{64}$/i.test(source.tagSha256??'')||!project.builds.some(build=>build.id===source.buildId&&build.status==='validated'))throw Error('Read the current editable native solo scenario areas before creating Black Echo.');
 if(source.missionSourceIssue||!source.missionSource)throw Error(source.missionSourceIssue??'Native mission references are unavailable; read source again.');
 for(const name of ['be_insert','be_survivors','be_artifact','be_containment','be_extract'])if(source.scenarioVolumes?.filter(row=>row.name===name&&row.kind===1&&row.geometry).length!==1)throw Error('Black Echo needs a unique readable native area '+name+'. Author or name it with the existing scenario tools, then read source again.');
 for(const name of new Set([roles.rescue,roles.facility,'be_flood',roles.defense])){
  const encounters=source.missionSource.encounters.filter(row=>row.name===name),squads=source.scenarioSquads?.filter(row=>row.encounterName===name)??[];
  if(encounters.length!==1||!squads.length||new Set(squads.map(row=>row.encounter)).size!==1)throw Error('Black Echo native encounter is missing or ambiguous: '+name);
  if(encounters[0].initiallyCreated)throw Error('Black Echo encounter must be script-created: '+name);
  if(source.protectedSquadEncounters?.some(row=>row.toLowerCase()===name))throw Error('Black Echo encounter is recipe-owned: '+name+'. Keep its existing controller.');
 }
}
export function validMissionWeaponPath(value:string):boolean {
 return value.length>0&&value.length<=240&&/^[A-Za-z0-9_][A-Za-z0-9_ ./-]*$/.test(value)&&value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..')&&!value.endsWith('.weapon');
}
/** One project history action; original geometry, bindings and source modules
 * stay intact. Areas are editable source markers, not valid terrain/navigation. */
export function addBlackEchoDraft(project:Project,nextId:()=>string,nativeSource?:NativeTagContext|null,options?:BlackEchoOptions):Project {
  if(project.studio?.missions.length)throw Error('Preserve the current operation; use a campaign project with no mission beats.');
  const missions=blackEchoMission(nextId,options);let document=project.quickForge;
  if(!document||document.native){requireNativeBlackEcho(project,nativeSource,options);return {...project,studio:{...(project.studio??emptyCreatorStudio()),missions}};}
  if(document.gameMode!=='campaign')throw Error('Open editable Campaign / scripted solo source before creating Black Echo.');
  if(document.logic?.manualSource!=null||document.logic?.handwrittenSources?.some(source=>source.filename.toLowerCase()==='gs_mission.hsc'))
    throw Error('Preserve and reconcile the existing mission or handwritten logic before adding a generated operation.');
  const areas:[string,string,number,number,number][]=[
    ['be_insert','Black Echo · Insertion',0,0,4],['be_survivors','Black Echo · Marine rescue',8,0,4],
    ['be_artifact','Black Echo · Classified technology',24,0,4],['be_containment','Black Echo · Optional Flood branch',31,3,4],
    ['be_extract','Black Echo · Evacuation',40,0,6],
  ];
  const existing=document.logic?.triggers??[];
  if(areas.some(([name])=>existing.filter(trigger=>trigger.nativeName===name).length>1))throw Error('Resolve duplicate Black Echo area names before creating this operation.');
  if(existing.length+areas.filter(([name])=>!existing.some(trigger=>trigger.nativeName===name)).length>64)throw Error('Black Echo needs space in the existing 64-volume native budget. No source was changed.');
  const base=document.spawns[0]?.position??[0,0,0];
  if(areas.filter(([name])=>!existing.some(trigger=>trigger.nativeName===name)).some(([, ,x,y])=>[base[0]+x,base[1]+y,base[2]+1.5].some(value=>!Number.isFinite(value)||Math.abs(value)>1500)))
    throw Error('Move the insertion start so the new areas fit the existing native ±1500 coordinate limit. No source was changed.');
  for(const [nativeName,label,x,y,width] of areas){
    if(existing.some(trigger=>trigger.nativeName===nativeName))continue;
    const added=addLogicTrigger(document,[base[0]+x,base[1]+y,base[2]+1.5]);
    const trigger=added.document.logic!.triggers.find(trigger=>trigger.id===added.id)!;
    trigger.name=label;trigger.dimensions=[width,width,3];
    document=setNativeLogicName(added.document,{type:'trigger',value:trigger},nativeName);
  }
  return {...project,quickForge:document,studio:{...(project.studio??emptyCreatorStudio()),missions}};
}
const commandToken = /^[A-Za-z0-9_-]{1,64}$/;
// Stock Halo CE accepts custom game variants with spaces when safely quoted.
const variantToken = /^[A-Za-z0-9_ -]{1,64}$/;
const recordId = /^[A-Za-z0-9_-]{1,72}$/;
const scriptIdent = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
const triggerValues = new Set(['manual', 'triggerVolume', 'encounterCleared', 'escort', 'deviceActivated', 'weaponOwned', 'forerunnerExtractionSettled', 'timer']);
const runtimes = new Set<ServerRuntime>(['haloCustomEdition', 'haloPC', 'haloDemo', 'mcc', 'openCE', 'chupathingyCE']);
const verdicts = new Set<PlaytestVerdict>(['notRun', 'pass', 'fail', 'blocked']);
const safeText = (s: string, max: number) => typeof s === 'string' && s.length <= max && !/[\x00-\x1f\x7f]/.test(s);
const boundedPos = (v: number[]) => Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 4096);
/** A collection can drive a visit decision only when it always runs in that objective scope. */
export function missionCollectionSources(missions:MissionBeat[],index:number):MissionBeat[] {
  return missions.slice(0,index).filter(source=>source.trigger==='weaponOwned'&&(source.squadNumber??0)===(missions[index]?.squadNumber??0)&&source.conditionVolume==null&&source.conditionResult==null);
}
/** Validate area conditions and assign stable numbers to shared decisions. */
export function missionBranchGroups(missions:MissionBeat[]):Map<string,{volume:string;firstBeat:MissionBeat;index:number}> {
  const groups=new Map<string,{volume:string;firstBeat:MissionBeat;index:number}>();
  for(const [index,beat] of missions.entries()){
    if(beat.escortFailure!=null&&(beat.trigger!=='escort'||!['stop','continue'].includes(beat.escortFailure)))throw Error('Rescue failure handling requires a survivor escort');
    if(beat.conditionResult!=null){
      const result=beat.conditionResult;
      if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).some(key=>!['beatId','failed'].includes(key))||typeof result.beatId!=='string'||typeof result.failed!=='boolean')throw Error('Invalid mission rescue result');
      const target=missions.findIndex(row=>row.id===result.beatId);
      if(target<0||target>=index||(missions[target].squadNumber??0)!==(beat.squadNumber??0)||missions[target].trigger!=='escort'||missions[target].escortFailure!=='continue')throw Error('Choose an earlier survivor escort configured to continue on failure');
    }
    if(beat.conditionOutside!=null&&typeof beat.conditionOutside!=='boolean')throw Error('Invalid mission branch outcome');
    if((beat.conditionGroup!=null||beat.conditionOutside!=null)&&beat.conditionVolume==null)throw Error('Mission branch decisions need an optional condition volume');
    if(beat.conditionVisitDuring!=null&&(
      beat.conditionVolume==null||beat.conditionGroup!=null||
      !missionCollectionSources(missions,index).some(source=>source.id===beat.conditionVisitDuring)
    ))throw Error('Choose an earlier unconditional weapon collection in the same scope and a separate area decision');
    if(beat.conditionGroup==null)continue;
    if(typeof beat.conditionGroup!=='string'||!recordId.test(beat.conditionGroup))throw Error('Invalid shared mission decision');
    const known=groups.get(beat.conditionGroup);
    if(known&&(known.volume!==beat.conditionVolume||(known.firstBeat.squadNumber??0)!==(beat.squadNumber??0)))throw Error('Shared mission decisions must use the same native volume and objective scope');
    if(!known)groups.set(beat.conditionGroup,{volume:beat.conditionVolume!,firstBeat:beat,index:groups.size+1});
  }
  return groups;
}
/** Validate the exact schema persisted by the Rust project. */
export function validateCreatorStudio(doc: CreatorStudioDocument): string[] {
  if(doc.engineMachinima){const e=doc.engineMachinima;if(typeof e.enabled!=='boolean'||!['fixed','sequence'].includes(e.playback)||typeof e.autoStart!=='boolean'||(e.cameraId!=null&&!doc.shots?.some(s=>s.id===e.cameraId))||(e.enabled&&(!doc.shots?.length||doc.shots.length>64)))return ['Invalid game-native machinima take: choose 1–64 camera keys and an existing selected camera'];}
  const failures: string[] = [];
  if(doc.cinematicTriggerVolume!=null&&(typeof doc.cinematicTriggerVolume!=='string'||! /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(doc.cinematicTriggerVolume)))return ['Cinematic trigger area needs a native script identifier'];
  if (!doc || doc.schemaVersion !== 1) return ['Unsupported Creator Studio schema'];
  if (doc.machinima !== undefined && !validMachinimaSettings(doc.machinima)) return ['Invalid Machinima lens or playback settings'];
  if (!Array.isArray(doc.missions) || !Array.isArray(doc.shots) || !Array.isArray(doc.playtests) || !doc.server) return ['Missing Studio collection'];
  if (doc.missions.length > 128 || doc.shots.length > 256 || doc.playtests.length > 500 || !Array.isArray(doc.server.rotation) || doc.server.rotation.length > 128)
    return ['Creator Studio collection exceeds safe limits'];
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (!recordId.test(id) || ids.has(id)) return false;
    ids.add(id); return true;
  };
  for (const m of doc.missions) {
    try{missionCinematicShots(doc,m);}catch(error){failures.push(String(error));}
    if (!unique(m.id) || !safeText(m.title, 120) || !safeText(m.objective, 2048) || !safeText(m.encounterName, 128) || !triggerValues.has(m.trigger) ||
      (m.squadNumber!=null&&(!Number.isInteger(m.squadNumber)||m.squadNumber<1||m.squadNumber>22)) ||
      (m.allowSharedPresentation!=null&&typeof m.allowSharedPresentation!=='boolean') ||
      (m.resetOnDeployment!=null&&(typeof m.resetOnDeployment!=='boolean'||m.trigger!=='forerunnerExtractionSettled'||m.squadNumber==null)) ||
      (m.earlyExtraction!=null&&(typeof m.earlyExtraction!=='boolean'||m.trigger!=='forerunnerExtractionSettled'||m.squadNumber!=null)) ||
      (m.guidance!=null&&(!m.guidance||typeof m.guidance!=='object'||Array.isArray(m.guidance)||Object.keys(m.guidance).some(key=>!['flag','object','height'].includes(key))||(m.guidance.flag!=null)===(m.guidance.object!=null)||[m.guidance.flag,m.guidance.object].some(name=>name!=null&&(typeof name!=='string'||name!==''&&!scriptIdent.test(name)))||!Number.isFinite(m.guidance.height)||Math.abs(m.guidance.height)>100)) ||
      (m.triggerRef != null && m.triggerRef !== '' && !scriptIdent.test(m.triggerRef)) ||
      (m.conditionVolume != null && m.conditionVolume !== '' && (typeof m.conditionVolume!=='string'||!scriptIdent.test(m.conditionVolume))) ||
      (m.soundCue != null && !validMissionSoundCue(m.soundCue)) ||
      (m.weaponPath!=null&&m.weaponPath!==''&&(typeof m.weaponPath!=='string'||!validMissionWeaponPath(m.weaponPath))) ||
      (m.createWeaponObject!=null&&(typeof m.createWeaponObject!=='string'||!scriptIdent.test(m.createWeaponObject)||m.trigger!=='weaponOwned')) ||
      (m.transportInsertion!=null&&(!['escort','triggerVolume'].includes(m.trigger)||m.squadNumber!=null||!['pelican','spirit'].includes(m.transportInsertion))) ||
      (m.encounterTeam!=null&&(!['escort','encounterCleared'].includes(m.trigger)||!['source','human','covenant','flood'].includes(m.encounterTeam))) ||
      (m.escortRequiresPlayer != null && (m.trigger !== 'escort' || typeof m.escortRequiresPlayer !== 'boolean')) ||
      (m.escortRoute != null && (m.trigger !== 'escort' || typeof m.escortRoute !== 'string' || !scriptIdent.test(m.escortRoute))) ||
      (m.minimumSurvivors != null && (!Number.isInteger(m.minimumSurvivors)||m.minimumSurvivors<1||m.minimumSurvivors>32)) ||
      (m.timerSeconds != null && (!Number.isInteger(m.timerSeconds) || m.timerSeconds<0 || m.timerSeconds>600)) ||
      (m.hudText != null && !safeText(m.hudText,254)) ||
      [m.hudObjective,m.checkpoint,m.completeMission].some(value=>value!=null&&typeof value!=='boolean'))
      failures.push(`Invalid mission beat ${m.id?.slice(0, 40) ?? '(unknown)'}`);
  }
  try{missionBranchGroups(doc.missions);}catch(error){failures.push(String(error));}
  for (const shot of doc.shots) {
    if (!unique(shot.id) || !safeText(shot.name, 120) || !safeText(shot.subtitle, 2048) ||
      !Number.isInteger(shot.durationMs) || shot.durationMs < 100 || shot.durationMs > 600000 ||
      !Number.isFinite(shot.fov) || shot.fov < 10 || shot.fov > 140 ||
      (shot.roll !== undefined && (!Number.isFinite(shot.roll) || Math.abs(shot.roll)>180)) ||
      (shot.easing !== undefined && !['linear','smooth','cut'].includes(shot.easing)) ||
      !boundedPos(shot.cameraPosition) || !boundedPos(shot.lookAt) ||
      (shot.cameraMarker != null && shot.cameraMarker !== '' && !scriptIdent.test(shot.cameraMarker))) failures.push(`Invalid camera shot ${shot.id?.slice(0, 40) ?? '(unknown)'}`);
  }
  const s = doc.server;
  if (!safeText(s.name, 63) || !s.name.trim() || s.name.includes('"') || s.name.includes('\\') || !runtimes.has(s.runtime) ||
    !Number.isInteger(s.maxPlayers) || s.maxPlayers < 1 || s.maxPlayers > 16 || typeof s.publicListing !== 'boolean')
    failures.push('Invalid server profile');
  if (s.gameTypes !== undefined) {
    if (!Array.isArray(s.gameTypes) || s.gameTypes.length > 64) return ['Game type collection exceeds 64 entries'];
    const seen = new Set<string>();
    for (const type of s.gameTypes) {
      if (!type || typeof type !== 'object') { failures.push('Invalid custom game type record'); continue; }
      const safeName = typeof type.name === 'string' && variantToken.test(type.name) && !!type.name.trim();
      const safeEvidence = typeof type.nativeEvidence === 'string' && type.nativeEvidence.length <= 180 && !/[\x00-\x1f\x7f<>]/.test(type.nativeEvidence);
      const safeNotes = typeof type.notes === 'string' && type.notes.length <= 1000 && !/[\x00-\x1f\x7f]/.test(type.notes);
      if (!unique(type.id) || !safeName || seen.has(type.name.toLowerCase()) ||
        !['slayer','ctf','oddball','king','race','juggernaut','assault'].includes(type.baseVariant) ||
        typeof type.teamPlay !== 'boolean' || typeof type.friendlyFire !== 'boolean' ||
        !Number.isInteger(type.scoreLimit) || type.scoreLimit < 0 || type.scoreLimit > 1000 ||
        !Number.isInteger(type.timeLimitMinutes) || type.timeLimitMinutes < 0 || type.timeLimitMinutes > 180 ||
        !Number.isInteger(type.respawnSeconds) || type.respawnSeconds < 0 || type.respawnSeconds > 120 ||
        !['mapDefault','rockets','snipers','custom'].includes(type.startingEquipment) ||
        !['standard','infectionConcept','firefightConcept'].includes(type.specialRules) ||
        !['draft','userConfirmedInGame'].includes(type.nativeStatus) || !safeEvidence || !safeNotes ||
        (type.nativeStatus === 'userConfirmedInGame' && !type.nativeEvidence.trim()))
        failures.push(`Invalid custom game type ${String(type.id).slice(0,40)}`);
      if (safeName) seen.add(type.name.toLowerCase());
    }
  }
  for (const entry of s.rotation) {
    if (!unique(entry.id) || !commandToken.test(entry.map) || !variantToken.test(entry.gameVariant) || !entry.gameVariant.trim())
      failures.push(`Unsafe map/variant entry ${entry.id?.slice(0,40) ?? '(unknown)'}`);
  }
  for (const record of doc.playtests) {
    if (!unique(record.id) || !safeText(record.caseId, 120) || !record.caseId.trim() || !safeText(record.target, 120) ||
      !safeText(record.performedAt, 50) || !safeText(record.evidence, 2048) || !safeText(record.notes, 4096) ||
      !verdicts.has(record.verdict) || typeof record.manuallyReported !== 'boolean' ||
      (record.verdict === 'pass' && (!record.manuallyReported || !record.evidence.trim())))
      failures.push(`Invalid test record ${record.id?.slice(0,40) ?? '(unknown)'}`);
  }
  return failures;
}
/** Halo Custom Edition / stock CE server only. No passwords or admin tokens. */
export function exportHaloCeServerInit(studio: CreatorStudioDocument): string {
  const errors = validateCreatorStudio(studio);
  if (errors.length) throw new Error(`Unsafe server profile: ${errors.join('; ')}`);
  const server = studio.server;
  if (server.runtime !== 'haloCustomEdition') throw new Error('This runtime has no verified dedicated-server init.txt exporter.');
  if (!server.rotation.length) throw new Error('Add and verify at least one installed map and variant.');
  // A non-stock name is not a binary game type. Only accept a user-confirmed
  // game-created variant. Stock server init does not implement scripted Zombies.
  const known = new Set(['slayer','team slayer','ctf','assault','oddball','team oddball',
    'juggernaut','king','crazy king','race','team race','classic_rockets','classic_snipers']);
  for (const entry of server.rotation) {
    if (known.has(entry.gameVariant.trim().toLowerCase())) continue;
    const custom=(server.gameTypes??[]).find(type => type.name.trim().toLowerCase()===entry.gameVariant.trim().toLowerCase());
    if (!custom || custom.nativeStatus !== 'userConfirmedInGame' || !custom.nativeEvidence.trim() || custom.specialRules !== 'standard')
      throw new Error(`Custom game type '${entry.gameVariant}' is not ready. Save a matching native game type in Halo CE and declare its source; scripted infection/AI is not supported.`);
  }
  return [
    '// Guilty Spark: REVIEW BEFORE USE. No server/network changes performed.',
    '// Halo Custom Edition stock dedicated server; no SAPP or MCC syntax assumed.',
    '// Map names and variants must exist on the target installation.',
    '// No password or RCON secret is stored or exported.',
    `sv_name "${server.name}"`,
    `sv_maxplayers ${server.maxPlayers}`,
    `sv_public ${server.publicListing ? 1 : 0}`,
    ...server.rotation.map(entry => {
      const variant = entry.gameVariant.trim();
      return `sv_mapcycle_add ${entry.map} ${variant.includes(' ') ? `"${variant}"` : variant}`;
    }),
    'sv_mapcycle_begin',
    '',
  ].join('\r\n');
}
export function exportStudioEvidence(
  studio: CreatorStudioDocument, project: { id: string; title: string; source: { sha256: string } | null }, createdAt = new Date().toISOString(),
): string {
  const errors = validateCreatorStudio(studio);
  if (errors.length) throw new Error(errors.join('; '));
  return JSON.stringify({
    schemaVersion: 1,
    kind: 'guilty-spark-authoring-and-manual-qa',
    createdAt,
    project: { id: project.id, title: project.title, sourceSha256: project.source?.sha256 ?? null },
    mission: { beats: studio.missions, status: 'authoredNotCompiled' },
    cinematic: { shots: studio.shots, status: 'authoredNotCompiled' },
    server: { runtime: studio.server.runtime, name: studio.server.name, maxPlayers: studio.server.maxPlayers,
      publicListing: studio.server.publicListing, rotation: studio.server.rotation, gameTypes: studio.server.gameTypes??[], status: 'draftNotDeployed' },
    playtests: studio.playtests,
    liveGameVerifiedAutomatically: false,
    reminder: 'Manual verdicts are user reports only. Save screenshots/logs and test exact runtime/build independently.',
  }, null, 2);
}
