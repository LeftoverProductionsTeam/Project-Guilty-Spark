/** Halo CE/H1 script-source exporters (NOT a compiler or in-game runtime bridge).
 *  Functions and types cross-checked against c20 Halo 1 HaloScript reference and
 *  real CE campaign .hsc syntax. Compiling .hsc requires scenario references and
 *  Sapien/HEK; no existing Halo files are touched. Names are strictly allowlisted
 *  and never evaluated as arbitrary HaloScript by this application.
 */
import type { CreatorStudioDocument } from './creatorStudio';
import { emptyCreatorStudio, missionBranchGroups, validateCreatorStudio, missionSoundProblems } from './creatorStudio.ts';
import { inspectScenarioBindings } from './scenarioBindings.ts';
import { sameJson } from './semanticJson.ts';
import { defaultNativePlayerProfile, nativeFirefightHudMessages, type NativeFirefightHudMessage, type FirefightConfig, type NativeEncounterCandidate, type FirefightCatalog } from './firefight.ts';
import type { Project } from './types';
import type { NativeOperation } from './nativeOperations';
export interface ScriptExport { filename: string; content: string; dependencies: string[]; warnings: string[]; activation?: string; scenarioType?: 'singleplayer'; generatedOnly: true; hudMessages?:NativeFirefightHudMessage[]; sourceBinding?:{schemaVersion:1;rules:FirefightConfig;sourceSha256:string;encounters:string[][];groups:{name:string;actorVariantPath:string;count:number}[];activation:'manual'|'startup';loadout:'scenario'|'authored-profile';playerProfileName?:string} }
const ident = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;
const tag = /^[A-Za-z_][A-Za-z0-9_/-]{0,30}$/;
const safeComment = (s: string): string => s.replace(/[\r\n\0]/g,' ').replace(/[^\x20-\x7e]/g,'?').slice(0,110);
function ensureName(name: string|undefined, label: string, path=false): string {
  if(typeof name !== 'string' || !(path ? tag : ident).test(name))
    throw new Error(`${label} must be a Halo CE script identifier (1-31 ASCII characters).`);
  return name;
}
const ticks=(ms:number)=>Math.max(1,Math.round(ms*30/1000));
const heading=(title:string):string[]=>[
  '; Guilty Spark source export (Halo CE / H1 campaign script syntax).',
  '; REVIEW before compiling. Requires matching objects/encounters/camera points in your scenario.',
  '; Build only from your owner-supplied editable tags; source .map files remain untouched.',
  `; ${safeComment(title)}`,
  '',
];
/** Ordered mission flow; manual beats are callable stubs, not automatically executed. */
export function exportHaloCeMission(studio:CreatorStudioDocument,options:{waitForLogic?:boolean}={}): ScriptExport {
  const errors=validateCreatorStudio(studio);if(errors.length)throw new Error(errors.join('; '));
  if(!studio.missions.length)throw new Error('Add at least one mission beat.');
  const deps:string[]=[], lines=heading('Mission Director');
  const globals:string[]=[];
  const manualSetters:string[]=[];
  const branches=missionBranchGroups(studio.missions);
  for(const {index} of branches.values())globals.push('(global boolean gs_branch_'+index+'_ready false)','(global boolean gs_branch_'+index+'_inside false)');
  const cueLines=(beat:CreatorStudioDocument['missions'][number],index:number,phase:'start'|'complete'):string[]=>{
    const cue=beat.soundCue;if(!cue||cue.phase!==phase)return [];
    deps.push('sound:'+cue.soundPath);
    const text:string[]=[];
    if(cue.delayMs)text.push('  (sleep '+ticks(cue.delayMs)+')');
    if(cue.caption){deps.push('hud_message:gs_mission_cue_'+(index+1));text.push('  (hud_set_help_text gs_mission_cue_'+(index+1)+')','  (show_hud_help_text true)');}
    text.push('  (sound_impulse_start "'+cue.soundPath+'" none '+cue.gain+')',
      '  (sleep_until (<= (sound_impulse_time "'+cue.soundPath+'") 0) 1 18000)');
    if(cue.caption)text.push('  (show_hud_help_text false)');
    return text;
  };
  studio.missions.forEach((beat,index)=>{if(beat.escortFailure==='continue')globals.push('(global boolean gs_result_'+(index+1)+'_done false)','(global boolean gs_result_'+(index+1)+'_failed false)');});
  const scripted:string[]=['(script dormant gs_mission', options.waitForLogic?'  (sleep_until gs_logic_ready 1)':'  (sleep 1)'];
  studio.missions.forEach((beat,i)=>{
    scripted.push(`  ; ${i+1}: ${safeComment(beat.title)} | ${safeComment(beat.objective)}`);
    if(beat.conditionResult){
      const index=studio.missions.findIndex(row=>row.id===beat.conditionResult!.beatId)+1,key='gs_result_'+index;
      scripted.push('  (if (and '+key+'_done '+(beat.conditionResult.failed?key+'_failed':'(not '+key+'_failed)')+') (begin');
    }
    if(beat.conditionVolume!=null){
      const volume=ensureName(beat.conditionVolume,`Beat ${i+1} optional condition volume`);deps.push('trigger_volume:'+volume);
      const group=beat.conditionGroup==null?undefined:branches.get(beat.conditionGroup);
      let condition='(volume_test_objects '+volume+' (players))';
      if(group){
        const key='gs_branch_'+group.index;
        scripted.push('  (if (not '+key+'_ready) (begin','    (sleep_until (> (list_count (players)) 0) 1)','    (set '+key+'_inside '+condition+')','    (set '+key+'_ready true)','  ))');
        condition=key+'_inside';
      }
      if(beat.conditionOutside===true)condition='(not '+condition+')';
      scripted.push('  (if '+condition+' (begin');
    }
    if(beat.completeMission===true&&(i+1!==studio.missions.length||beat.checkpoint===true||beat.conditionVolume!=null||beat.conditionResult!=null))
      throw Error('Native level completion must be the final beat, without a checkpoint or optional condition on the same beat.');
    if(beat.hudObjective===true) {
      const text=beat.hudText??'';
      if(!text.length||text.length>254||/[%\x00-\x1f\x7f]/.test(text))
        throw Error(`Beat ${i+1} HUD text needs 1–254 UTF-16 characters without percent signs or control characters. Direction notes are preserved separately.`);
      const name=`gs_mission_obj_${i+1}`;deps.push('hud_message:'+name);
      scripted.push(`  (hud_set_objective_text ${name})`);
    }
    scripted.push(...cueLines(beat,i,'start'));
    switch(beat.trigger){
      case 'manual':
        const key=`gs_manual_${i+1}_done`;
        globals.push(`(global boolean ${key} false)`);
        manualSetters.push(`(script static void gs_complete_${i+1}`, `  (set ${key} true)`, ')', '');
        scripted.push(`  ; Another HaloScript trigger must call (gs_complete_${i+1}).`);
        scripted.push(`  (sleep_until ${key} 15)`);
        break;
      case 'timer':
        if(!Number.isInteger(beat.timerSeconds) || beat.timerSeconds! < 1 || beat.timerSeconds! > 600)
          throw new Error(`Beat ${i+1} needs timerSeconds between 1 and 600.`);
        scripted.push(`  (sleep ${ticks(beat.timerSeconds!*1000)})`);break;
      case 'triggerVolume':{
        const ref=ensureName(beat.triggerRef??undefined,`Beat ${i+1} trigger volume`);
        deps.push(`trigger_volume:${ref}`);
        scripted.push(`  (sleep_until (volume_test_objects ${ref} (players)) 15)`);break;
      }
      case 'deviceActivated':{
        const ref=ensureName(beat.triggerRef??undefined,'Beat '+(i+1)+' native control');
        deps.push('device_control:'+ref);
        // Arm below the threshold first. An already-active terminal cannot
        // silently satisfy a later objective; do not reset the player's device.
        scripted.push('  (sleep_until (< (device_get_position '+ref+') 0.5) 1)',
          '  (sleep_until (>= (device_get_position '+ref+') 0.5) 1)');break;
      }
      case 'escort':{
        const ref=ensureName(beat.encounterName,'Beat '+(i+1)+' survivor encounter',true),destination=ensureName(beat.triggerRef??undefined,'Beat '+(i+1)+' survivor destination');
        const minimum=beat.minimumSurvivors??1;
        deps.push('ai_encounter:'+ref,'trigger_volume:'+destination,'hud_message:gs_mission_fail_'+(i+1));
        scripted.push('  (ai_place '+ref+')','  (sleep_until (> (ai_living_count '+ref+') 0) 15 300)',
          '  (ai_set_team '+ref+' human)','  (ai_follow_target_players '+ref+')',
          '  (sleep_until (or (< (ai_living_count '+ref+') '+minimum+') (volume_test_objects_all '+destination+' (ai_actors '+ref+'))) 15)',
          '  (if (< (ai_living_count '+ref+') '+minimum+') (begin',
          '    (hud_set_objective_text gs_mission_fail_'+(i+1)+')','    (print "gs survivor objective failed")');
        if(beat.escortFailure==='continue')scripted.push('    (set gs_result_'+(i+1)+'_failed true)');
        else scripted.push('    (sleep_until false 15)');
        scripted.push('  ))');
        if(beat.escortFailure==='continue')scripted.push('  (set gs_result_'+(i+1)+'_done true)','  (if (not gs_result_'+(i+1)+'_failed) (begin');
        break;
      }
      case 'encounterCleared':{
        const ref=ensureName(beat.encounterName,`Beat ${i+1} encounter`,true);
        deps.push(`ai_encounter:${ref}`);
        scripted.push(`  (ai_place ${ref})`);
        // Guard: never count an unspawned/empty squad as a successfully cleared wave.
        scripted.push(`  (sleep_until (> (ai_living_count ${ref}) 0) 15)`);
        scripted.push(`  (sleep_until (= (ai_living_count ${ref}) 0) 15)`);break;
      }
    }
    scripted.push(...cueLines(beat,i,'complete'));
    scripted.push('  (print "gs objective complete")');
    if(beat.checkpoint===true)scripted.push('  (game_save)');
    if(beat.completeMission===true)scripted.push('  (game_won)');
    if(beat.escortFailure==='continue')scripted.push('  ))');
    if(beat.conditionVolume!=null)scripted.push('  ))');
    if(beat.conditionResult!=null)scripted.push('  ))');
  });
  scripted.push(')', '');
  lines.push(...globals, '', ...manualSetters, ...scripted);
  return {filename:'gs_mission.hsc',content:lines.join('\r\n'),dependencies:deps,activation:'(wake gs_mission)',warnings:[
    'Mission is a dormant script. Explicitly call (wake gs_mission) from a reviewed scenario startup script.',
    'Optional volume conditions run when their step starts. Shared decisions sample once at their first eligible member and retain that result for every member; inside/outside outcomes are mutually exclusive. Skipped steps run no AI, HUD, cue or checkpoint. This is shared scenario state, not independent squad progress or replay settlement.',
    'Manual beats stop progression until another script or trigger calls their generated gs_complete_N function. Replaying in a persistent world needs explicit gate reset and run-aware settlement; this exporter does not certify replayability.',
    ...(studio.missions.some(beat=>beat.trigger==='deviceActivated')?['Terminal objectives wait for the named native control below half position, then a new activation. Scripted device changes may also satisfy this shared scenario condition. This does not acquire an item, bank loot, reset a terminal or create independent squad state. Native use behavior and gameplay require testing.']:[]),
    ...(studio.missions.some(beat=>beat.trigger==='escort')?['Survivor escort places its source group, assigns native human team and follows the closest players. All surviving actors must enter the destination with the configured minimum alive. Default casualty failure stops this mission script, not the world. Continue to failure handling records its result and skips its success cues/checkpoint; later result conditions select success or failure routes. A skipped rescue has no result. No loot or extraction settlement is awarded. Native navigation/gameplay and multiplayer behavior require testing.']:[]),
    ...(studio.missions.some(beat=>beat.soundCue)?['Radio cues use the complete imported native sound and its sound-class settings; the game selects permutations. They are unpositioned, shared scenario cues, not per-squad voice chat. Playback waits at most ten minutes; captions use the standard HUD help channel and can be replaced by other scripts. Editor audition does not prove game audio.']:[]),
    'Mission source requires hand-authored scenario trigger volumes, encounters, objectives, AI navigation, BSP and tag assets.',
    'Opt-in HUD objectives need their matching standard message tag. Native checkpoint requests may time out when unsafe; level completion can advance the campaign. Compilation/gameplay remain unverified.',
  ],generatedOnly:true};
}

/** Binding comments remain source metadata; engines execute ordinary HaloScript. */
export const nativeMissionBinding = '; Spark native mission configuration: ';
export interface NativeMissionBinding {
  schemaVersion:1;
  missions:import('./creatorStudio').MissionBeat[];
  activation:'manual'|'startup';
  sourceSha256:string;
}

async function nativeMissionHash(body:string):Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)))]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
}
/** Read our comment metadata and checksum; never evaluate script source.
 * A checksum detects changes, not author identity or trusted peer permissions. */
async function readNativeMissionModule(module:{filename:string;content:string}):Promise<NativeMissionBinding> {
  const end=module.content.indexOf('\n');
  if(!module.filename.toLowerCase().endsWith('.hsc')||!module.content.startsWith(nativeMissionBinding)||end<0)
    throw Error('No generated mission binding is available. Handwritten HaloScript is preserved.');
  if(module.content.length>1024*1024||/[\x00\x80-\uffff]/.test(module.content))
    throw Error('Attached mission exceeds the native source budget or has unsupported source encoding. No data was adopted.');
  let binding:NativeMissionBinding;
  try {binding=JSON.parse(module.content.slice(nativeMissionBinding.length,end).trimEnd());}
  catch {throw Error('Attached mission metadata is invalid. Preserve the source module before reconciling it.');}
  const fields=['schemaVersion','missions','activation','sourceSha256'];
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(key=>!fields.includes(key))||
    binding.schemaVersion!==1||!['manual','startup'].includes(binding.activation)||!Array.isArray(binding.missions)||
    !binding.missions.length||binding.missions.length>128||typeof binding.sourceSha256!=='string'||!/^[a-f0-9]{64}$/i.test(binding.sourceSha256))
    throw Error('Attached mission uses unsupported metadata. No local mission data was replaced.');
  const beatFields=['id','title','objective','trigger','encounterName','triggerRef','timerSeconds','hudObjective','hudText','checkpoint','completeMission','conditionVolume','conditionGroup','conditionOutside','soundCue','minimumSurvivors','escortFailure','conditionResult'];
  if(binding.missions.some(beat=>!beat||typeof beat!=='object'||Array.isArray(beat)||
    Object.keys(beat).some(key=>!beatFields.includes(key))||
    (['id','title','objective','trigger','encounterName'] as const).some(field=>typeof beat[field]!=='string')||
    (beat.triggerRef!=null&&typeof beat.triggerRef!=='string')||
    (beat.conditionVolume!=null&&typeof beat.conditionVolume!=='string')||
    (beat.conditionGroup!=null&&typeof beat.conditionGroup!=='string')||
    (beat.conditionOutside!=null&&typeof beat.conditionOutside!=='boolean')||
    (beat.minimumSurvivors!=null&&typeof beat.minimumSurvivors!=='number')||
    (beat.timerSeconds!=null&&typeof beat.timerSeconds!=='number')||
    (beat.hudText!=null&&typeof beat.hudText!=='string')||
    [beat.hudObjective,beat.checkpoint,beat.completeMission].some(value=>value!=null&&typeof value!=='boolean')))
    throw Error('Attached mission contains unsupported beat fields. Keep the original source for explicit review.');
  const errors=validateCreatorStudio({...emptyCreatorStudio(),missions:binding.missions});
  if(errors.length)throw Error(errors.join('; '));
  // Required identifiers/delays use the same exporter validation as preparation.
  exportHaloCeMission({...emptyCreatorStudio(),missions:binding.missions});
  const body=module.content.slice(end+1);
  if((await nativeMissionHash(body)).toLowerCase()!==binding.sourceSha256.toLowerCase())
    throw Error('Attached mission source differs from its checksum. No mission data was adopted or regenerated.');
  if(body!==nativeMissionBody(binding.missions,binding.activation))
    throw Error('Attached mission data differs from the current generated source, or uses another generator. Preserve/export the module in Logic / Events before explicit reconciliation.');
  return binding;
}
/** Rust Option values serialize as null; absence has the same authored meaning. */
export function sameMissionData(a:NativeMissionBinding['missions'],b:NativeMissionBinding['missions']):boolean {
  const normalize=(values:NativeMissionBinding['missions'])=>values.map(beat=>({...beat,
    triggerRef:beat.triggerRef??null,timerSeconds:beat.timerSeconds??null,minimumSurvivors:beat.minimumSurvivors??null,escortFailure:beat.escortFailure??null,conditionResult:beat.conditionResult??null,
    hudObjective:beat.hudObjective??null,hudText:beat.hudText??null,checkpoint:beat.checkpoint??null,completeMission:beat.completeMission??null,conditionVolume:beat.conditionVolume??null,conditionGroup:beat.conditionGroup??null,conditionOutside:beat.conditionOutside??null,soundCue:beat.soundCue??null}));
  return sameJson(normalize(a),normalize(b));
}
export interface NativeMissionReview {
  projectId:string;
  document:NonNullable<Project['quickForge']>;
  module:{filename:string;content:string};
  binding:NativeMissionBinding;
  localMissions:NativeMissionBinding['missions'];
}
export async function reviewNativeCampaignMission(project:Project):Promise<NativeMissionReview> {
  const document=project.quickForge;
  const owned=document?.logic?.handwrittenSources?.filter(source=>source.content.startsWith(nativeMissionBinding))??[];
  if(!document||owned.length!==1||owned[0].filename.toLowerCase()!=='gs_mission.hsc')
    throw Error('Review requires one attached gs_mission.hsc binding. Preserve and reconcile missing, renamed or duplicate modules in Logic / Events.');
  const localMissions=structuredClone(project.studio?.missions??[]);
  const module=owned[0],binding=await readNativeMissionModule(module);
  return {projectId:project.id,document,module,binding,localMissions};
}
/** Explicit replacement of mission data only. Source modules and unrelated
 * Studio settings remain unchanged; normal project history owns Undo/Redo. */
export function applyNativeCampaignMission(project:Project,review:NativeMissionReview):Project {
  const document=project.quickForge;
  if(project.id!==review.projectId||!document||document!==review.document||!sameMissionData(project.studio?.missions??[],review.localMissions))
    throw Error('Source or local mission data changed after review. Review again; no stale data was applied.');
  const owned=document.logic?.handwrittenSources?.filter(source=>source.content.startsWith(nativeMissionBinding))??[];
  if(owned.length!==1||owned[0].filename!==review.module.filename||owned[0].content!==review.module.content)
    throw Error('The attached mission changed after review. Existing drafts remain intact.');
  const studio={...(project.studio??emptyCreatorStudio()),missions:structuredClone(review.binding.missions)};
  const errors=validateCreatorStudio(studio);
  if(errors.length)throw Error('Cannot combine attached missions with current Studio data: '+errors.join('; '));
  if(sameMissionData(project.studio?.missions??[],studio.missions))return project;
  return {...project,studio};
}

function nativeMissionBody(missions:NativeMissionBinding['missions'],activation:NativeMissionBinding['activation']):string {
  const output=exportHaloCeMission({...emptyCreatorStudio(),missions},{waitForLogic:true});
  return output.content+(activation==='startup'?[
    '', '(script startup gs_mission_bootstrap',
    '  (sleep_until gs_logic_ready 1)', '  (wake gs_mission)', ')', '',
  ].join('\r\n'):'');
}
async function nativeMissionModule(missions:NativeMissionBinding['missions'],activation:NativeMissionBinding['activation']):Promise<string> {
  if(!['manual','startup'].includes(activation))throw Error('Choose manual or startup mission activation.');
  const body=nativeMissionBody(missions,activation);
  const sourceSha256=await nativeMissionHash(body);
  const binding:NativeMissionBinding={schemaVersion:1,missions,activation,sourceSha256};
  const header=JSON.stringify(binding).replace(/[\u007f-\uffff]/g,character=>
    '\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
  return nativeMissionBinding+header+'\r\n'+body;
}
/** Explicit source preparation. Refuse overwriting handwritten/older-generator
 * text; caller owns the existing project mutation/history transaction. */
export async function attachNativeCampaignMission(project:Project,activation:'manual'|'startup'):Promise<Project> {
  const doc=project.quickForge;
  if(!doc||doc.gameMode!=='campaign'||doc.native||
    !['mccSteam','haloCustomEdition','chupathingyCe'].includes(doc.runtimeId))
    throw Error('Open editable Campaign / scripted solo source with a supported native build target first.');
  if(!doc.startingProfile)throw Error('Review Campaign starting loadout in Map properties before preparing the mission.');
  if(doc.logic?.manualSource!=null)throw Error('Generated startup logic is overridden. Preserve handwritten source before returning Native HaloScript to generated logic.');
  const missions=project.studio?.missions;
  if(!missions?.length)throw Error('Add mission beats before preparing native mission source.');
  const soundErrors=missionSoundProblems(project);if(soundErrors.length)throw Error(soundErrors.join('\n'));
  const output=exportHaloCeMission({...emptyCreatorStudio(),missions});
  const bindings=inspectScenarioBindings([output],null,doc);
  const missing=bindings.filter(binding=>binding.status!=='presentInAuthoringSource'&&!binding.dependency.startsWith('hud_message:')&&!binding.dependency.startsWith('sound:'));
  if(missing.length)throw Error(missing.map(binding=>binding.dependency+': '+binding.detail).join('\n'));
  for(const beat of missions)if(beat.trigger==='encounterCleared'||beat.trigger==='escort') {
    const name=beat.encounterName.split('/')[0];
    if(doc.campaignEncounters?.find(group=>group.name===name)?.startActive)
      throw Error('Mission owns ai_place for '+name+'. Disable initial actor creation before preparing its source.');
    if(beat.trigger==='escort') {
      const group=doc.campaignEncounters!.find(group=>group.name===name)!;
      const minimum=beat.minimumSurvivors??1;
      if(minimum>Math.min(group.count??1,group.difficulty?.normal??group.count??1,group.difficulty?.insane??group.count??1))
        throw Error('Survivor minimum exceeds the authored starts or difficulty population for '+name+'. Add actors or lower the minimum before preparing.');
      if(missions.filter(other=>other.encounterName.split('/')[0]===name&&['encounterCleared','escort'].includes(other.trigger)).length!==1)
        throw Error('Survivor encounter '+name+' needs one mission spawn owner. Do not respawn the same survivors from another beat.');
    }
  }
  const logic=structuredClone(doc.logic??{schemaVersion:1 as const,triggers:[],devices:[],rules:[]});
  const sources=logic.handwrittenSources??[];
  if(sources.some(source=>source.filename.toLowerCase()==='gs_firefight.hsc'))
    throw Error('This campaign still has a survival controller. Review it in Logic / Events before explicitly removing it from this build.');
  const existing=sources.find(source=>source.filename.toLowerCase()==='gs_mission.hsc');
  if(sources.some(source=>source.content.startsWith(nativeMissionBinding)&&source!==existing))
    throw Error('A renamed mission binding is still present. Preserve and reconcile source modules in Logic / Events.');
  if(existing) {
    const old=await readNativeMissionModule(existing);
    let original:string;
    try {
      if(old.schemaVersion!==1||!['manual','startup'].includes(old.activation)||!Array.isArray(old.missions))throw Error('Invalid binding');
      original=await nativeMissionModule(old.missions,old.activation);
    } catch {throw Error('The existing mission binding cannot be regenerated safely. Preserve/export it before explicitly removing it from the build.');}
    if(existing.content!==original)
      throw Error('Mission source contains edits or uses a different generator. Preserve/export it before explicitly removing and regenerating it.');
  }
  const module={filename:'gs_mission.hsc',content:await nativeMissionModule(missions,activation)};
  const isMcc=doc.runtimeId==='mccSteam';
  if(module.content.length>(isMcc?1024*1024:256*1024))
    throw Error('Mission source exceeds the selected native target file budget. No text was truncated or replaced.');
  if(sources.length-(existing?1:0)+1+1+(isMcc?1:0)>(isMcc?16:8))
    throw Error('Mission exceeds the target script-file budget including generated logic/global source. Preserve all modules and reduce the selected build explicitly.');
  logic.handwrittenSources=[...sources.filter(source=>source!==existing),module];
  return {...project,quickForge:{...doc,logic}};
}

/** Actual H1 camera_set/cinematic_start syntax. Position/FOV authoring is metadata. */
export function exportHaloCeCinematic(studio:CreatorStudioDocument): ScriptExport {
  const errors=validateCreatorStudio(studio);if(errors.length)throw new Error(errors.join('; '));
  if(!studio.shots.length)throw new Error('Add at least one cinematic shot.');
  const deps:string[]=[],lines=heading('Cinematic Director');
  lines.push('(script static void gs_cinematic','  (cinematic_start)','  (camera_control true)','  (cinematic_show_letterbox true)');
  studio.shots.forEach((shot,i)=>{
    const ref=ensureName(shot.cameraMarker??undefined,`Shot ${i+1} cutscene camera point`);
    deps.push(`cutscene_camera_point:${ref}`);
    lines.push(`  ; ${i+1}: ${safeComment(shot.name)} | ${safeComment(shot.subtitle)}`);
    lines.push(`  ; Source camera XYZ=${shot.cameraPosition.join(',')} lookAt=${shot.lookAt.join(',')} FOV=${shot.fov} (place marker in Sapien)`);
    lines.push(`  (camera_set ${ref} ${ticks(shot.durationMs)})`);
    lines.push(`  (sleep ${ticks(shot.durationMs)})`);
  });
  lines.push('  (cinematic_show_letterbox false)','  (camera_control false)','  (cinematic_stop)',')','');
  return {filename:'gs_cinematic.hsc',content:lines.join('\r\n'),dependencies:deps,warnings:[
    'Place and orient the named cutscene camera points in the editable scenario using the shot metadata.',
    'Camera FOV, subtitle, animation, music and cinematic blending are not compiled by this exporter.',
    'Call gs_cinematic from an existing compatible campaign script; it is not automatically played.',
  ],generatedOnly:true};
}
/**
 * Compile a *conservative* HaloScript wave sequence from Firefight authoring.
 * All enemy groups become separately named scenario encounters (not actor_variant
 * spawns). Only campaign-compatible AI waves are modeled: not network AI or score.
 */
export interface NativeRoundBindings {
  sourceSha256:string;sourceScenarioType:number;encounters:NativeEncounterCandidate[];
  encounterNames:string[][];activation:'manual'|'startup';exclusiveOwnershipConfirmed:boolean;
  /** Only an atomic native source review can prepare an existing-HUD merge. */
  hudMergePrepared?:boolean;
  /** Only the reviewed native source transaction may append/reuse this profile. */
  playerProfileName?:string;
}
const generatedEncounterRefs=(config:FirefightConfig)=>config.waves.map((wave,w)=>wave.groups.map((_,g)=>`gs_w${String(w+1).padStart(2,'0')}_g${String(g+1).padStart(2,'0')}`));
function nativeEncounterRefs(config:FirefightConfig,binding?:NativeRoundBindings):string[][] {
  if(!binding)return generatedEncounterRefs(config);
  if(!binding.exclusiveOwnershipConfirmed||!['manual','startup'].includes(binding.activation)||config.maxSpawnAttempts!==1)throw Error('Use solo native rules and explicitly confirm exclusive encounter ownership and activation before exporting.');
  return matchedNativeEncounterRefs(config,binding);
}
/** Suggest only exact decoded source matches; this grants no script ownership. */
export function matchGeneratedFirefightGroups(config:FirefightConfig,catalog:FirefightCatalog):string[][] {
  return matchedNativeEncounterRefs(config,{sourceSha256:catalog.defaultConfig.sourceSha256??'',sourceScenarioType:catalog.sourceScenarioType??-1,encounters:catalog.encounters??[],encounterNames:generatedEncounterRefs(config)});
}
function matchedNativeEncounterRefs(config:FirefightConfig,binding:Pick<NativeRoundBindings,'sourceSha256'|'sourceScenarioType'|'encounters'|'encounterNames'>):string[][] {
  if(binding.sourceScenarioType!==0||!config.sourceSha256||!/^[0-9a-f]{64}$/i.test(binding.sourceSha256)||binding.sourceSha256.toLowerCase()!==config.sourceSha256.toLowerCase())throw Error('Native encounter bindings require the exact singleplayer source used by these rules.');
  if(binding.encounterNames.length!==config.waves.length)throw Error('Review native encounter bindings after changing waves.');
  const key=(path:string)=>path.replaceAll('\\','/').toLowerCase(),used=new Set<string>();
  return config.waves.map((wave,w)=>{
    const names=binding.encounterNames[w];if(!Array.isArray(names)||names.length!==wave.groups.length)throw Error('Review native encounter bindings after changing groups.');
    return wave.groups.map((group,g)=>{
      const name=ensureName(names[g],`Wave ${w+1} group ${g+1} encounter`,true);
      if(used.has(name.toLowerCase()))throw Error('Each controller group must own a distinct native encounter; shared ownership is unsupported.');used.add(name.toLowerCase());
      const found=binding.encounters.filter(encounter=>encounter.name.toLowerCase()===name.toLowerCase());
      const actor=config.enemies.find(enemy=>enemy.id===group.enemyId)?.actorVariantPath;
      if(found.length!==1||found[0].issue||found[0].notInitiallyCreated!==true||found[0].normalCount!==group.count||found[0].insaneCount!==group.count||found[0].startingLocations==null||found[0].startingLocations<group.count||!actor||found[0].actorVariantPaths.length!==1||key(found[0].actorVariantPaths[0])!==key(actor))throw Error(`Native encounter ${name} does not match the reviewed actor/count/inactive source. Build and reopen the intended source, then select it in Firefight.`);
      return found[0].name;
    });
  });
}
export function exportHaloCeFirefight(config:FirefightConfig,binding?:NativeRoundBindings):ScriptExport {
  if(config.schemaVersion!==1 || !Array.isArray(config.waves) || !config.waves.length || config.waves.length>32 ||
    !Array.isArray(config.enemies) || !Number.isInteger(config.rounds) || config.rounds<1 || config.rounds>32 || config.endless)
    throw new Error('Finite waves (1-32), valid enemies and 1-32 rounds are required for the conservative CE exporter. Endless is unsupported.');
  if(!Number.isInteger(config.maxAlive) || config.maxAlive<1 || config.maxAlive>32 || !Number.isInteger(config.intermissionMs) || config.intermissionMs<0 || config.intermissionMs>600000)
    throw new Error('Invalid max-alive/intermission configuration for HaloScript.');
  const enemyIds=new Set(config.enemies.map(e=>e.id));
  const references=nativeEncounterRefs(config,binding);
  const deps:string[]=[],lines=heading('Firefight · authored AI encounters (single-player preview only)');
  for(let i=0;i<config.waves.length;i++) {
    const wave=config.waves[i], total=wave.groups.reduce((sum,g)=>sum+g.count,0);
    if(!wave.groups.length || wave.groups.length>8 || total<1 || total>config.maxAlive)
      throw new Error(`Wave ${i+1} must have 1-8 groups and 1-${config.maxAlive} starting actors. Split larger waves into encounter steps.`);
    const encounters=wave.groups.map((g,j)=>{
      if(!enemyIds.has(g.enemyId)||!Number.isInteger(g.count)||g.count<1||g.count>32)
        throw new Error(`Wave ${i+1} group ${j+1} has an invalid enemy reference/count.`);
      const ref=references[i][j];
      deps.push(`ai_encounter:${ref}:expectedActors=${g.count}:enemy=${g.enemyId}`);return ref;
    });
    lines.push(`(script static void gs_wave_${String(i+1).padStart(2,'0')}`);
    for(const ref of encounters)lines.push(`  (ai_place ${ref})`);
    for(const ref of encounters)lines.push(`  (sleep_until (> (ai_living_count ${ref}) 0) 15)`);
    for(const ref of encounters)lines.push(`  (sleep_until (= (ai_living_count ${ref}) 0) 15)`);
    lines.push(')','');
  }
  lines.push('(script dormant gs_firefight','  (sleep 30)');
  for(let r=0;r<config.rounds;r++)for(let w=0;w<config.waves.length;w++) {
    lines.push(`  ; Round ${r+1} · wave ${w+1}`);
    lines.push(`  (gs_wave_${String(w+1).padStart(2,'0')})`);
    if(r!==config.rounds-1||w!==config.waves.length-1) lines.push(`  (sleep ${ticks(config.intermissionMs)})`);
  }
  lines.push('  (print "gs authored waves ended")',')','');
  return {filename:'gs_firefight.hsc',content:lines.join('\r\n'),dependencies:deps,activation:'(wake gs_firefight)',warnings:[
    'Firefight is a dormant script. Explicitly call (wake gs_firefight) from a reviewed scenario startup script.',
    'Create each named AI encounter/squad in Sapien with the indicated actor variants, starting counts, nav and firing positions before compiling.',
    'Missing/empty encounters stall the sequence intentionally: no phantom wave completion.',
    'This HSC is a finite campaign AI sequence. Lives, scoring, revives, zombie infection, dynamic spawns and network synchronization are not implemented.',
  ],generatedOnly:true};
}
/** Opt-in extension of the existing finite encounter exporter. This source owns
 * only its named encounters. The engine runs waves; Spark does not send kills
 * or commands to a game. Encounter construction and human combat remain gates.
 */
export function exportHaloCeFirefightRound(config:FirefightConfig,binding?:NativeRoundBindings):ScriptExport {
  for(const wave of config.waves)for(const group of wave.groups){
    if(group.spawnZoneId!=null && !config.spawnZones.some(zone=>zone.id===group.spawnZoneId&&zone.enabled))
      throw Error(`Wave ${wave.name} references a missing or disabled spawn zone. Select another zone or Automatic; its assignment was retained.`);
  }
  const conservative=exportHaloCeFirefight(config,binding);
  const references=nativeEncounterRefs(config,binding);
  if(binding?.playerProfileName&&(!ident.test(binding.playerProfileName)||!config.nativePlayerProfile))throw Error('Review the named native player profile and saved loadout through the atomic source build.');
  const player=binding&&!binding.playerProfileName?undefined:config.nativePlayerProfile;
  const playerProfileName=binding?.playerProfileName??'gs_firefight_start';
  if(player){
    for(const weapon of [player.primaryWeapon,...(player.secondaryWeapon?[player.secondaryWeapon]:[])]){
      if(typeof weapon!=='string'||!weapon.length||weapon.length>240||/[^\x20-\x7e]/.test(weapon)||/\.weapon$/i.test(weapon)||/^(?:[\/]|[A-Za-z]:)/.test(weapon)||weapon.replaceAll('\\','/').split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Choose native player weapon tag paths without extensions.');
    }
    if(!Number.isFinite(player.health)||player.health<.01||player.health>1||!Number.isFinite(player.shields)||player.shields<0||player.shields>3||
      [player.primaryLoaded,player.primaryReserved,player.secondaryLoaded,player.secondaryReserved].some(n=>!Number.isSafeInteger(n)||n<0||n>32767)||
      [player.fragmentationGrenades,player.plasmaGrenades].some(n=>!Number.isSafeInteger(n)||n<0||n>4)||
      (!player.secondaryWeapon&&(player.secondaryLoaded!==0||player.secondaryReserved!==0))||
      (player.secondaryWeapon?.replaceAll('\\','/').toLowerCase()===player.primaryWeapon.replaceAll('\\','/').toLowerCase()))throw Error('Native player loadout exceeds Halo limits or duplicates the starting weapon.');
  }
  if(config.playerCount!==1 || config.teamLives!==1 || config.allowRevives || config.endless || config.difficultyStepPercent!==0 ||
    config.extraPlayerCountPercent!==0 || config.replenishAmmoEachWave ||
    !Array.isArray(config.startingEquipment) || config.startingEquipment.length ||
    !Array.isArray(config.supplyDropTags) || config.supplyDropTags.length)
    throw Error('Native round source currently requires one player, one life, no revives, no scaling, and no equipment/resupply overrides. Those rules remain in the authoring plan.');
  for(const [label,value] of [['preparation',config.preparationMs],['countdown',config.countdownMs],
    ['spawn timeout',config.spawnTimeoutMs],['wave timeout',config.stuckTimeoutMs]] as const)
    if(!Number.isSafeInteger(value)||value<0||value>600000 || (label.includes('timeout')&&value<1000))
      throw Error(`Native round ${label} must be bounded to ten minutes (timeouts at least one second).`);
  if(config.preparationMs+config.countdownMs>600000)throw Error('Combined preparation/countdown exceeds ten minutes.');
  const enemies=new Map(config.enemies.map(e=>[e.id,e]));
  if(enemies.size!==config.enemies.length)throw Error('Duplicate native round enemy identity.');
  const waves=config.waves.map((wave,w)=>{
    if(!Number.isSafeInteger(wave.scoreMultiplierMilli)||wave.scoreMultiplierMilli<1||wave.scoreMultiplierMilli>10000)
      throw Error('Native round score multiplier must be 1-10000.');
    const groups=wave.groups.map((group,g)=>{
      const points=enemies.get(group.enemyId)?.points;
      if(typeof points!=='number'||!Number.isSafeInteger(points)||points<0||points>100000)throw Error('Native round enemy points must be 0-100000.');
      return {ref:references[w][g],slot:`w${String(w+1).padStart(2,'0')}_g${String(g+1).padStart(2,'0')}`,count:group.count,
        points:Math.floor(group.count*points*wave.scoreMultiplierMilli/1000)};
    });
    return {groups,count:groups.reduce((n,g)=>n+g.count,0),score:groups.reduce((n,g)=>n+g.points,0)};
  });
  if(waves.reduce((n,w)=>n+w.score,0)*config.rounds>2147483647)throw Error('Native round score exceeds Halo long range.');
  const hud=nativeFirefightHudMessages(config),feedback=hud.length>0;
  if(binding&&feedback&&!binding.hudMergePrepared)throw Error('HUD-enabled bound controllers require Runtime Dock → Firefight groups & controller. Review the preserving HUD append and build it atomically; no source was replaced.');
  const owned=(group:{slot:string})=>`gs_ff_units_${group.slot}`;
  const clean=(group:{slot:string})=>`gs_ff_clean_${group.slot}`;
  const lines=heading('Firefight native round candidate · solo encounter controller');
  lines.push('; State: 0 idle, 1 preparing, 2 active, 3 intermission, 4 complete, 5 refused/defeated.',
    feedback?'; Score is team wave-clear points shown with standard HUD messages; not player kill attribution or medals.':'; Score is team wave-clear points, not player kill attribution or a native HUD/medal implementation.',
    '(global boolean gs_ff_start false)','(global short gs_ff_state 0)','(global short gs_ff_round 0)',
    '(global short gs_ff_wave 0)','(global long gs_ff_score 0)','(global long gs_ff_cleared 0)','(global unit gs_ff_player none)','');
  if(feedback){
    lines.push('(global short gs_ff_failure 0)','; Failure: 1 no player, 2 incomplete spawn, 3 player death, 4 wave deadline.','',
      '(script static void gs_ff_show_score');
    for(const message of hud.filter(message=>message.name.startsWith('gs_ff_score_')))
      lines.push('  (if (= gs_ff_score '+message.name.slice('gs_ff_score_'.length)+') (hud_set_objective_text '+message.name+'))');
    lines.push(')','');
  }
  for(const wave of waves)for(const group of wave.groups)
    lines.push(`(global object_list ${owned(group)} (ai_actors ${group.ref}))`);
  lines.push('');
  for(const wave of waves)for(const group of wave.groups){
    lines.push(`(script static void ${clean(group)}`,`  (ai_force_active ${group.ref} false)`);
    // Native ai_erase no longer owns a unit after its actor dies. Retain the
    // exact encounter's salted unit references before combat, then delete its
    // captured corpses too. Descending slots also tolerate list compaction.
    // The existing 32-actor/group bound keeps this finite without a shared loop
    // counter or arbitrary object-name/definition-wide deletion.
    for(let slot=group.count-1;slot>=0;slot--)
      lines.push(`  (object_destroy (list_get ${owned(group)} ${slot}))`);
    lines.push(`  (ai_erase ${group.ref})`,`  (set ${owned(group)} (ai_actors ${group.ref}))`,')','');
  }
  lines.push('(script static void gs_ff_reset');
  for(const wave of waves)for(const group of wave.groups)lines.push(`  (${clean(group)})`);
  lines.push('  (set gs_ff_score 0)','  (set gs_ff_cleared 0)','  (set gs_ff_round 0)','  (set gs_ff_wave 0)',...(feedback?['  (set gs_ff_failure 0)']:[]),')','');
  waves.forEach((wave,w)=>{
    const counts=wave.groups.map(g=>`(ai_living_count ${g.ref})`), living=counts.length===1?counts[0]:`(+ ${counts.join(' ')})`;
    lines.push(`(script static void gs_wave_${String(w+1).padStart(2,'0')}`);
    lines.push(feedback?'  (if (and (!= gs_ff_state 5) (<= (unit_get_health gs_ff_player) 0)) (begin (set gs_ff_failure 3) (set gs_ff_state 5)))':'  (if (and (!= gs_ff_state 5) (<= (unit_get_health gs_ff_player) 0)) (set gs_ff_state 5))');
    lines.push('  (if (!= gs_ff_state 5) (begin',
      '    (set gs_ff_state 2)',`    (set gs_ff_wave ${w+1})`);
    if(feedback)lines.push(`    (hud_set_help_text gs_ff_wave_${w+1})`);
    for(const group of wave.groups)lines.push(`    (ai_place ${group.ref})`,
      `    (set ${owned(group)} (ai_actors ${group.ref}))`,`    (ai_force_active ${group.ref} true)`);
    const exact=wave.groups.map(g=>`(= (ai_living_count ${g.ref}) ${g.count})`), ready=exact.length===1?exact[0]:`(and ${exact.join(' ')})`;
    lines.push(`    (sleep_until (or ${ready} (<= (unit_get_health gs_ff_player) 0)) 1 ${ticks(config.spawnTimeoutMs)})`,
      `    (if (not ${ready}) ${feedback?'(begin (set gs_ff_failure 2) (set gs_ff_state 5))':'(set gs_ff_state 5)'})`,
      feedback?'    (if (<= (unit_get_health gs_ff_player) 0) (begin (set gs_ff_failure 3) (set gs_ff_state 5)))':'    (if (<= (unit_get_health gs_ff_player) 0) (set gs_ff_state 5))',
      '    (if (!= gs_ff_state 5) (begin',
      `      (sleep_until (or (= ${living} 0) (<= (unit_get_health gs_ff_player) 0)) 1 ${ticks(config.stuckTimeoutMs)})`,
      `      (if (and (= ${living} 0) (> (unit_get_health gs_ff_player) 0))`,
      '        (begin',`          (set gs_ff_score (+ gs_ff_score ${wave.score}))`,
      `          (set gs_ff_cleared (+ gs_ff_cleared ${wave.count}))`,
      '          (set gs_ff_state 3)',...(feedback?['          (gs_ff_show_score)']:[]),
      '        )',feedback?'        (begin (set gs_ff_failure (if (<= (unit_get_health gs_ff_player) 0) 3 4)) (set gs_ff_state 5))':'        (set gs_ff_state 5)', '      )','    ))',
      '    (if (= gs_ff_state 3) (sleep 60))');
    for(const group of wave.groups)lines.push(`    (${clean(group)})`);
    lines.push('  ))',')','');
  });
  lines.push('(script continuous gs_firefight','  (sleep_until gs_ff_start 1)','  (set gs_ff_start false)',
    '  (gs_ff_reset)','  (set gs_ff_state 1)',
    `  (sleep_until (> (unit_get_health (unit (list_get (players) 0))) 0) 1 ${ticks(config.spawnTimeoutMs)})`,
    '  (set gs_ff_player (unit (list_get (players) 0)))',
    feedback?'  (if (<= (unit_get_health gs_ff_player) 0) (begin (set gs_ff_failure 1) (set gs_ff_state 5)))':'  (if (<= (unit_get_health gs_ff_player) 0) (set gs_ff_state 5))');
  if(feedback)lines.push('  (show_hud_help_text true)','  (if (!= gs_ff_state 5) (hud_set_help_text gs_ff_ready))','  (gs_ff_show_score)');
  if(player)lines.push('  (if (!= gs_ff_state 5) (player_add_equipment gs_ff_player '+playerProfileName+' true))');
  // HUD feedback is presentation only; death and round transitions must not depend on it.
  lines.push(`  (if (!= gs_ff_state 5) (begin (sleep_until (<= (unit_get_health gs_ff_player) 0) 1 ${ticks(config.preparationMs+config.countdownMs)}) (if (<= (unit_get_health gs_ff_player) 0) ${feedback?'(begin (set gs_ff_failure 3) (set gs_ff_state 5))':'(set gs_ff_state 5)'})))`);
  for(let r=0;r<config.rounds;r++){
    lines.push(`  (if (!= gs_ff_state 5) (set gs_ff_round ${r+1}))`);
    if(feedback)lines.push(`  (if (!= gs_ff_state 5) (hud_set_objective_text gs_ff_round_${r+1}))`);
    for(let w=0;w<waves.length;w++){lines.push(`  (gs_wave_${String(w+1).padStart(2,'0')})`);
      if(r!==config.rounds-1||w!==waves.length-1)lines.push(`  (if (!= gs_ff_state 5) (sleep ${ticks(config.intermissionMs)}))`);
    }
  }
  lines.push(feedback?'  (if (and (!= gs_ff_state 5) (<= (unit_get_health gs_ff_player) 0)) (begin (set gs_ff_failure 3) (set gs_ff_state 5)))':'  (if (and (!= gs_ff_state 5) (<= (unit_get_health gs_ff_player) 0)) (set gs_ff_state 5))');
  lines.push('  (if (!= gs_ff_state 5) (set gs_ff_state 4))');
  if(feedback){
    lines.push('  (if (= gs_ff_state 4) (hud_set_help_text gs_ff_victory))');
    ['gs_ff_no_player','gs_ff_spawn_failed','gs_ff_defeated','gs_ff_timed_out'].forEach((name,index)=>lines.push(`  (if (= gs_ff_failure ${index+1}) (hud_set_help_text ${name}))`));
    lines.push('  (gs_ff_show_score)');
  }
  lines.push(')','');
  const sourceBinding=binding?{schemaVersion:1 as const,rules:config,sourceSha256:binding.sourceSha256.toLowerCase(),encounters:references,groups:config.waves.flatMap((wave,w)=>wave.groups.map((group,g)=>({name:references[w][g],actorVariantPath:config.enemies.find(enemy=>enemy.id===group.enemyId)!.actorVariantPath,count:group.count}))),activation:binding.activation,loadout:binding.playerProfileName?'authored-profile' as const:'scenario' as const,...(binding.playerProfileName?{playerProfileName:binding.playerProfileName}:{})}:undefined;
  const content=(sourceBinding?'; Spark source encounter bindings: '+JSON.stringify(sourceBinding)+'\r\n':'')+lines.join('\r\n')+(binding?.activation==='startup'?nativeRoundBootstrap:'');
  return {...conservative,...(sourceBinding?{sourceBinding}:{}),...(feedback?{hudMessages:hud}:{}),content,activation:'(set gs_ff_start true)',scenarioType:'singleplayer',dependencies:[...conservative.dependencies,...(player?['starting_profile:'+playerProfileName,...Array.from(new Set([player.primaryWeapon,player.secondaryWeapon].filter((path):path is string=>!!path))).map(path=>'weapon:'+path)]:[])],warnings:[
    ...(binding?['Bound encounters come from the exact source cache inventory. Their ownership, navigation and gameplay still require review; original scripts may also manipulate them.',binding.playerProfileName?'Apply only the reviewed named player profile; original scenario profiles remain.':'Keep this scenario’s existing player equipment. No generated starting profile or weapon override is applied.','Activation: '+(binding.activation==='startup'?'an explicit gs_ff_bootstrap startup script is included.':'manual; a reviewed scenario script must set gs_ff_start true.')]:[]),
    ...(player?['Use the standard scenario player profile '+playerProfileName+' with its exact weapon dependencies; the atomic source build must verify its fields before adoption.']:[]),
    'Experimental native solo round source. Build only into a separate reviewed singleplayer/campaign scenario with these exact encounters/counts and safe spawn/navigation data.',
    'Start or request another round with (set gs_ff_start true). The continuous controller resets only its own encounters and score, then waits for actual living counts to reach zero.',
    'Missing/partial spawns, a dead player or the authored wave deadline refuse progression. No phantom success, forced kills or invulnerability is generated.',
    feedback?'Generated standard scenario HUD calls request wave/round status and the actual team wave-clear score; compile and game display remain unverified. They do not provide per-player kill credit or medals. Pause menu restart replays this cache; it does not load a rebuilt revision.':'Wave-clear points are a script global, not per-player kill credit, medals or a Halo HUD. External scripts must not erase or respawn these owned encounters during a round.',
    'Each cleared wave allows two seconds for native death animation, then removes only its captured units/corpses before the authored intermission. Defeat and partial-spawn refusal also clean owned units. Encounters must be not initially created and exclusively owned by this controller.',
    'Solo only. Team lives, revives, supplies, difficulty scaling, infection and multiplayer AI are separate gates. Native compilation is not human gameplay acceptance.',
  ]};
}
/** Planned source specifications, never a decoded native inventory. The caller
 * must review and build this controller with the exact append operation in the
 * atomic source build; ordinary script attachment cannot create encounters. */
export function exportPlannedFirefightRound(operation:Extract<NativeOperation,{kind:'appendEncounters'}>,activation:'manual'|'startup',retainBootstrap=false,hudMergePrepared=false,playerProfileName?:string):ScriptExport {
  const config=operation.sourceRules;
  if(!config?.sourceSha256||!operation.encounters.length||operation.encounters.length>16)throw Error('Review a source-bound native group plan first.');
  const groups=config.waves.flatMap(wave=>wave.groups);
  if(operation.encounters.some(entry=>entry.difficulty!=null))throw Error('Prepared Firefight groups keep their exact controller population; independent difficulty overrides belong to campaign encounter authoring.');
  if(groups.length!==operation.encounters.length||groups.some((group,index)=>group.count!==(operation.encounters[index].count??1)||operation.encounters[index].startActive||config.enemies.find(enemy=>enemy.id===group.enemyId)?.actorVariantPath.replaceAll('\\','/').toLowerCase()!==operation.encounters[index].actorPath.replaceAll('\\','/').toLowerCase()))throw Error('Planned native groups differ from their saved rule actors/counts/inactive state.');
  let index=0;
  const names=config.waves.map(wave=>wave.groups.map(()=>operation.encounters[index++].name));
  const output=exportHaloCeFirefightRound(config,{sourceSha256:config.sourceSha256,sourceScenarioType:0,encounterNames:names,
    encounters:operation.encounters.map(entry=>({name:entry.name,actorVariantPaths:[entry.actorPath],normalCount:entry.count??1,insaneCount:entry.count??1,startingLocations:entry.count??1,notInitiallyCreated:!entry.startActive,issue:null})),
    activation,exclusiveOwnershipConfirmed:true,hudMergePrepared,playerProfileName});
  // Keep the owned startup signature when disabling automatic activation.
  // It becomes a no-op; original native signature preservation stays enabled.
  const content=output.content+(retainBootstrap&&activation==='manual'?'\r\n(script startup gs_ff_bootstrap\r\n  (sleep 1)\r\n)\r\n':'');
  return {...output,content,warnings:['Planned source is not native readback. Build the exact groups and reviewed controller through the atomic source path; recorded native group changes require exact generated-field ownership and stable names/indices.',...output.warnings]};
}

/** Plain JSON contract for creator tool integration. No secrets or local source paths. */
export function scriptManifest(out:ScriptExport):string {
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-h1-script-source',file:out.filename,
    status:'exportedNotCompiled',gameplayVerified:false,scenarioType:out.scenarioType??null,activation:out.activation ?? null,dependencies:out.dependencies,warnings:out.warnings,...(out.hudMessages?{hudMessages:{sourceFile:'gs_firefight_messages.hmt',encoding:'UTF-16LE with BOM',nativeType:'hud_message_text',messages:out.hudMessages}}:{}),...(out.sourceBinding?{sourceBinding:out.sourceBinding}:{})},null,2);
}

/** Attach the existing solo controller to an editable level. Configuration is
 * bound as ASCII authoring metadata, never a native tag field. A later rules
 * edit is refused by the compiler until this explicit action refreshes it.
 * Handwritten changes are retained rather than silently regenerated. */
export const nativeRoundBinding = '; Spark native Firefight configuration: ';
const nativeRoundBootstrap = '\r\n(script startup gs_ff_bootstrap\r\n  (sleep 1)\r\n  (set gs_ff_start true)\r\n)\r\n';
function nativeRoundModule(config: FirefightConfig): string {
  const source = exportHaloCeFirefightRound(config);
  const binding = JSON.stringify(config).replace(/[\u007f-\uffff]/g, character =>
    '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  return nativeRoundBinding + binding + '\r\n' + source.content + nativeRoundBootstrap;
}
export function attachNativeFirefightRound(project: Project): Project {
  const doc = project.quickForge, config = project.firefight;
  if (!doc || !config || doc.gameMode !== 'firefight' ||
      !['mccSteam','haloCustomEdition','chupathingyCe'].includes(doc.runtimeId) || doc.native)
    throw Error('Open an editable solo Firefight level with a supported native build target first. Original Zombie restoration and shared-source scenarios use separate acceptance paths.');
  if (!config.nativePlayerProfile) throw Error('Use solo native rules and review Player loadout before preparing a native round.');
  if (config.maxSpawnAttempts !== 1) throw Error('Native solo rounds require one spawn attempt; retries remain an authoring rule.');
  if (config.waves.reduce((n,wave)=>n+wave.groups.length,0)>128) throw Error('Native scenario supports at most 128 encounters.');
  const module = {filename:'gs_firefight.hsc', content:nativeRoundModule(config)};
  const logic = structuredClone(doc.logic ?? {schemaVersion:1 as const,triggers:[],devices:[],rules:[]});
  const sources = logic.handwrittenSources ?? [];
  const existing = sources.find(source => source.filename.toLowerCase() === module.filename);
  if (existing && existing.content !== module.content) {
    const firstEnd = existing.content.indexOf('\r\n');
    if (!existing.content.startsWith(nativeRoundBinding) || firstEnd < 0)
      throw Error('gs_firefight.hsc is handwritten. Preserve or rename it in Logic / Events before preparing a generated round.');
    let original: string;
    try { original = nativeRoundModule(JSON.parse(existing.content.slice(nativeRoundBinding.length,firstEnd))); }
    catch { throw Error('The existing round source has an invalid binding; preserve it in Logic / Events before replacing it.'); }
    if (existing.content !== original)
      throw Error('The round source differs from the current generator; it may contain manual edits or use an older generator. Preserve or rename it in Logic / Events before regenerating.');
  }
  if (sources.some(source => source.filename.toLowerCase() === 'gs_firefight.hsc' && source !== existing))
    throw Error('Duplicate native round source; retain and reconcile each source in Logic / Events.');
  logic.handwrittenSources = [...sources.filter(source => source !== existing),module];
  return {...project, quickForge:{...doc,logic}};
}

export function nativeSoloFirefightRules(config: FirefightConfig): FirefightConfig {
  return {...config,playerCount:1,teamLives:1,allowRevives:false,rounds:1,endless:false,
    preparationMs:1000,countdownMs:1000,intermissionMs:1000,spawnTimeoutMs:5000,stuckTimeoutMs:60000,
    maxSpawnAttempts:1,maxAlive:32,maxTotalPerWave:32,difficultyStepPercent:0,extraPlayerCountPercent:0,
    startingEquipment:[],replenishAmmoEachWave:false,supplyDropTags:[],nativePlayerProfile:config.nativePlayerProfile??defaultNativePlayerProfile()};
}
