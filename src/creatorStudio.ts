import type {NativeTagContext} from './nativeOperations';
/** Authoring-only mission, cinematic, dedicated server and QA project data.
 *
 * No workflow in this module edits installed Halo files or starts a process.
 * Halo CE server commands are exported ONLY as a validated, user-reviewed
 * plaintext draft. The other runtime families deliberately have no exporter.
 */
import {addLogicTrigger,setNativeLogicName} from './nativeLogic.ts';
import type {Project} from './types';
import {validMachinimaSettings} from './machinima.ts';
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
  guidance?:{flag?:string|null;object?:string|null;height:number}|null;
  id: string;
  title: string;
  objective: string;
  trigger: 'manual' | 'triggerVolume' | 'encounterCleared' | 'escort' | 'deviceActivated' | 'weaponOwned' | 'forerunnerExtractionSettled' | 'timer';
  encounterName: string;
  /** Explicit runtime team for this encounter only; absent retains legacy behavior. */
  encounterTeam?:'source'|'human'|'covenant'|'flood'|null;
  /** Reviewed source/controller owns spawn; transport owns boarding/release, escort owns follow. */
  transportInsertion?:'pelican'|'spirit'|null;
  triggerRef?: string | null;
  weaponPath?: string | null;
  /** Existing named scenario weapon, created once when this collection step starts. */
  createWeaponObject?: string | null;
  timerSeconds?: number | null;
  minimumSurvivors?: number | null;
  escortRequiresPlayer?: boolean | null;
  escortFailure?: 'stop' | 'continue' | null;
  hudObjective?: boolean | null;
  hudText?: string | null;
  checkpoint?: boolean | null;
  completeMission?: boolean | null;
  /** Evaluate this native player-volume condition when the beat begins; false skips it. */
  conditionVolume?: string | null;
  /** Shared native volume decision, sampled once at the first member. */
  conditionGroup?: string | null;
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
export function connectBlackEchoObjectives(project:Project,nextId:()=>string,nativeSource?:NativeTagContext|null):Project {
 const base=project.studio?.missions.length?project:addBlackEchoDraft(project,nextId,nativeSource),studio=base.studio!,beats=studio.missions;
 if(beats.length!==7||!['triggerVolume','deviceActivated'].includes(beats[0].trigger)||!['be_insert','extraction_deploy'].includes(beats[0].triggerRef??'')||beats[1].trigger!=='escort'||beats[1].triggerRef!=='be_survivors'||beats[2].trigger!=='encounterCleared'||beats[4].trigger!=='encounterCleared'||beats[4].encounterName!=='be_flood'||beats[5].trigger!=='encounterCleared'||!['manual','weaponOwned'].includes(beats[3].trigger)||!['manual','forerunnerExtractionSettled'].includes(beats[6].trigger))throw Error('Open the seven-step Black Echo blueprint; preserve other authored missions.');
 if(!base.quickForge||base.quickForge.native){
  requireNativeBlackEcho(base,nativeSource,{rescue:beats[1].encounterName,facility:beats[2].encounterName,defense:beats[5].encounterName});if(nativeSource!.sourceTarget!=='gbx-custom')throw Error('Forerunner settlement requires reviewed standard CE609 solo source; other engines do not provide its callback.');
  for(const name of ['extraction_return','extraction_zone'])if(nativeSource!.scenarioVolumes?.filter(row=>row.name===name&&row.kind===1&&row.geometry).length!==1)throw Error('Author a unique readable native extraction pad: '+name);
  for(const name of ['extraction_deploy','extraction_activate'])if(nativeSource!.scenarioDevices?.filter(row=>row.name===name&&row.class==='ctrl').length!==1)throw Error('Author a unique native extraction control: '+name);
 }else if(base.quickForge.gameMode!=='campaign'||!['haloCustomEdition','chupathingyCe'].includes(base.quickForge.runtimeId))throw Error('Choose an editable standard Custom Edition campaign build target for Forerunner. Other runtimes do not provide its settled-extraction callback.');
 return {...base,studio:{...studio,missions:beats.map((beat,index)=>index===0&&beat.trigger==='triggerVolume'&&beat.triggerRef==='be_insert'?{...beat,trigger:'deviceActivated',triggerRef:'extraction_deploy',objective:'Activate the native deployment terminal to begin the operation. Runtime insertion and physical flight remain separate gameplay checks.'}:index===3?{...beat,trigger:'weaponOwned',weaponPath:beat.weaponPath??'',objective:'Collect the selected native technology weapon. Actual player inventory ownership completes this objective; entering its area does not.'}:index===6?{...beat,trigger:'forerunnerExtractionSettled',triggerRef:'extraction_activate',objective:'Activate evacuation after the objectives, then physically return to the hub. Forerunner completes this objective only after surviving players and gear settle.'}:beat)}};
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
    ['be_artifact','Black Echo · Classified technology',24,0,4],['be_containment','Black Echo · Optional Flood branch',25,1,2],
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
/** Validates the exact schema persisted in the Rust project. */
/** Stable editor IDs; native globals use bounded first-occurrence numbers. */
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
    if(beat.conditionGroup==null)continue;
    if(typeof beat.conditionGroup!=='string'||!recordId.test(beat.conditionGroup))throw Error('Invalid shared mission decision');
    const known=groups.get(beat.conditionGroup);
    if(known&&(known.volume!==beat.conditionVolume||(known.firstBeat.squadNumber??0)!==(beat.squadNumber??0)))throw Error('Shared mission decisions must use the same native volume and objective scope');
    if(!known)groups.set(beat.conditionGroup,{volume:beat.conditionVolume!,firstBeat:beat,index:groups.size+1});
  }
  return groups;
}
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
      (m.guidance!=null&&(!m.guidance||typeof m.guidance!=='object'||Array.isArray(m.guidance)||Object.keys(m.guidance).some(key=>!['flag','object','height'].includes(key))||(m.guidance.flag!=null)===(m.guidance.object!=null)||[m.guidance.flag,m.guidance.object].some(name=>name!=null&&(typeof name!=='string'||name!==''&&!scriptIdent.test(name)))||!Number.isFinite(m.guidance.height)||Math.abs(m.guidance.height)>100)) ||
      (m.triggerRef != null && m.triggerRef !== '' && !scriptIdent.test(m.triggerRef)) ||
      (m.conditionVolume != null && m.conditionVolume !== '' && (typeof m.conditionVolume!=='string'||!scriptIdent.test(m.conditionVolume))) ||
      (m.soundCue != null && !validMissionSoundCue(m.soundCue)) ||
      (m.weaponPath!=null&&m.weaponPath!==''&&(typeof m.weaponPath!=='string'||!validMissionWeaponPath(m.weaponPath))) ||
      (m.createWeaponObject!=null&&(typeof m.createWeaponObject!=='string'||!scriptIdent.test(m.createWeaponObject)||m.trigger!=='weaponOwned')) ||
      (m.transportInsertion!=null&&(m.trigger!=='escort'||m.squadNumber!=null||!['pelican','spirit'].includes(m.transportInsertion))) ||
      (m.encounterTeam!=null&&(!['escort','encounterCleared'].includes(m.trigger)||!['source','human','covenant','flood'].includes(m.encounterTeam))) ||
      (m.escortRequiresPlayer != null && (m.trigger !== 'escort' || typeof m.escortRequiresPlayer !== 'boolean')) ||
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
