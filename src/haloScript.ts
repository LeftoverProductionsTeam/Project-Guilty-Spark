/** Halo CE/H1 script-source exporters (NOT a compiler or in-game runtime bridge).
 *  Functions and types cross-checked against c20 Halo 1 HaloScript reference and
 *  real CE campaign .hsc syntax. Compiling .hsc requires scenario references and
 *  Sapien/HEK; no existing Halo files are touched. Names are strictly allowlisted
 *  and never evaluated as arbitrary HaloScript by this application.
 */
import type { CameraShot, CreatorStudioDocument } from './creatorStudio';
import { emptyCreatorStudio, missionBranchGroups, validateCreatorStudio, missionSoundProblems, missionCinematicShots,validMissionWeaponPath } from './creatorStudio.ts';
import {extractionLayout} from './nativeLogic.ts';
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
type MissionExportOptions={waitForLogic?:boolean;preparedCinematics?:boolean;forerunner?:boolean};
function namespaceMission(source:string,scope:number,dependencies:string[]):string{
 const rows=haloSourceDeclarations(source),owned=new Set(rows.filter(row=>row.name.startsWith('gs_')).map(row=>row.name)),edits:{start:number;end:number;value:string}[]=[];
 for(const dependency of dependencies){const name=dependency.split(':')[1];if(owned.has(name)&&(scope||name==='gs_mission'))throw Error('Native source name '+name+' collides with generated controller state. Preserve it in shared scope or author an unambiguous native reference.');}
 const prefix=scope?'gs_sq'+String(scope).padStart(2,'0')+'_':'gs_';
 haloSourceDeclarations(source,(start,end,token)=>{
  if(owned.has(token))edits.push({start,end,value:scope?prefix+token.slice(3):token==='gs_mission'?'gs_shared_mission':token});
  else if(scope&&token==='players'&&source[start-1]==='(')edits.push({start,end,value:'forerunner_squad_'+String(scope).padStart(2,'0')+'_players'});
 });
 for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.value+source.slice(edit.end);
 return source;
}
/** Same mission writer for shared and independent native squad operations. */
export function exportHaloCeMission(studio:CreatorStudioDocument,options:MissionExportOptions={}):ScriptExport{
 const errors=validateCreatorStudio(studio);if(errors.length)throw Error(errors.join('; '));
 if(!studio.missions.some(beat=>beat.squadNumber!=null))return exportMissionFlow(studio,options);
 if(!options.forerunner)throw Error('Independent squad objectives require the reviewed Forerunner native feature; legacy exports cannot execute these queries.');
 const scopes=new Map<number,{beats:CreatorStudioDocument['missions'];indices:number[]}>();
 studio.missions.forEach((beat,index)=>{const number=beat.squadNumber??0,part=scopes.get(number)??{beats:[],indices:[]};part.beats.push(beat);part.indices.push(index);scopes.set(number,part);});
 for(const [index,beat]of studio.missions.entries()){
  if(beat.squadNumber!=null){
   if(beat.checkpoint||beat.completeMission)throw Error('Squad objectives cannot save or end the shared world. Keep checkpoints/level completion in the shared campaign.');
   if(beat.cinematicCue)throw Error('Native squad camera isolation is not supported. Keep the saved scene and use shared mission scope or the shared intro; no camera fields were removed.');
   if((beat.hudObjective||beat.soundCue)&&beat.allowSharedPresentation!==true)throw Error('Objective '+(index+1)+' uses shared native HUD/radio. Explicitly allow shared presentation or preserve those fields and use shared mission scope.');
  }
  for(const other of studio.missions.slice(0,index)){
   if((beat.squadNumber??0)===(other.squadNumber??0))continue;
   if(['escort','encounterCleared'].includes(beat.trigger)&&['escort','encounterCleared'].includes(other.trigger)&&[beat.encounterName,other.encounterName].every(Boolean)&&(beat.encounterName.toLowerCase()===other.encounterName.toLowerCase()||beat.encounterName.toLowerCase().startsWith(other.encounterName.toLowerCase()+'/')||other.encounterName.toLowerCase().startsWith(beat.encounterName.toLowerCase()+'/')))throw Error('Independent controllers cannot both own the same encounter spawn. Author separate native encounter groups.');
   if(beat.createWeaponObject&&beat.createWeaponObject.toLowerCase()===other.createWeaponObject?.toLowerCase())throw Error('Independent controllers cannot both recreate the same named weapon. Use separately authored objects.');
  }
 }
 if(studio.missions.some(beat=>beat.checkpoint||beat.completeMission))throw Error('Independent squad operations cannot save or end the shared world; use a separate shared campaign.');
 const parts:ScriptExport[]=[],body:string[]=[],start:string[]=['(script dormant gs_mission'];
 for(const [number,part]of scopes){
  if(number&&part.beats.at(-1)?.trigger!=='forerunnerExtractionSettled')throw Error('Squad'+number+' needs a final native settled-extraction objective to rearm for another operation.');
  const flow=exportMissionFlow({...studio,missions:part.beats},options,part.indices,number);
  parts.push(flow);
  if(number){
   const digits=String(number).padStart(2,'0');
   body.push('(script static object_list forerunner_squad_'+digits+'_players (list_get (players) 32767))',namespaceMission(flow.content,number,flow.dependencies));
   start.push('  (set gs_sq'+digits+'_enabled true)');
  }else{body.push(namespaceMission(flow.content,0,flow.dependencies));start.push('  (wake gs_shared_mission)');}
 }
 start.push(')');body.push(start.join('\n'));
 return {filename:'gs_mission.hsc',content:body.join('\n\n'),dependencies:[...new Set(parts.flatMap(p=>p.dependencies))],activation:'(wake gs_mission)',warnings:[...new Set(parts.flatMap(p=>p.warnings)), 'Squad progress uses current native operation participants and isolated readiness; the engine owns inventory and durable settlement. Shared native presentation is explicitly opt-in. No mandatory raid timer or reward writer. Full native/peer/gameplay acceptance remains required.'],generatedOnly:true};
}

/** Ordered mission flow; manual beats are callable stubs, not automatically executed. */
function exportMissionFlow(studio:CreatorStudioDocument,options:MissionExportOptions={},indices?:number[],scope=0): ScriptExport {
  const errors=validateCreatorStudio(studio);if(errors.length)throw new Error(errors.join('; '));
  if(!studio.missions.length)throw new Error('Add at least one mission beat.');
  const guided=studio.missions.some(beat=>beat.guidance!=null),moving=studio.missions.some(beat=>beat.guidance?.object!=null);
  if(guided&&!scope)throw Error('Personal objective waypoints require Forerunner squad scope. Preserve the location choice and select its squad before preparing.');
  const extractionBeats=studio.missions.filter(beat=>beat.trigger==='forerunnerExtractionSettled');
  if(extractionBeats.length&&(!options.forerunner||extractionBeats.length!==1||studio.missions.at(-1)!==extractionBeats[0]||extractionBeats[0].conditionVolume!=null||extractionBeats[0].conditionResult!=null||extractionBeats[0].completeMission||extractionBeats[0].checkpoint))throw Error('Forerunner settled extraction must be the single final unconditional objective, without a checkpoint or level exit. Select its reviewed runtime; legacy engines cannot complete this callback.');
  const empty="(= (list_count (players)) 0)";
  const markAbort="  (if "+empty+" (set gs_aborted true))";
  const wait=(condition:string,interval:number,timeout?:number,settlement=false):string[]=>scope?["  (sleep_until (or gs_aborted "+empty+" "+condition+") "+interval+(timeout==null?"":" "+timeout)+")",settlement?"  (if (and "+empty+" (not "+condition+")) (set gs_aborted true))":markAbort]:["  (sleep_until "+condition+" "+interval+(timeout==null?"":" "+timeout)+")"];
  const deps:string[]=[], lines=heading('Mission Director');
  const sceneSources:string[]=[];
  const sceneCall=(beat:CreatorStudioDocument['missions'][number],index:number,phase:'start'|'complete'):string[]=>
    beat.cinematicCue?.phase===phase?['  (sleep_until (> (list_count (players)) 0) 1)','  (gs_scene_'+(index+1)+')']:[];
  studio.missions.forEach((beat,local)=>{const index=indices?.[local]??local;
    const selected=missionCinematicShots(studio,beat);if(!selected.length)return;
    const shots=selected.map(shot=>({...shot,cameraMarker:cinematicMarker(shot,studio.shots.findIndex(row=>row.id===shot.id))}));
    const source=exportHaloCeCinematic({...emptyCreatorStudio(),shots},{prepared:options.preparedCinematics,scriptName:'gs_scene_'+(index+1)});
    sceneSources.push(source.content);deps.push(...source.dependencies);
  });
  const globals:string[]=[];
  if(guided)globals.push('(global short gs_nav_stage 0)','(global short gs_nav_drawn_stage 0)','(global boolean gs_nav_dirty false)','(global unit gs_nav_viewer none)','(global object_list gs_nav_members (list_get (players) 32767))',...Array.from({length:6},(_,i)=>'(global unit gs_nav_'+i+' none)'));
  if(moving)globals.push('(global object gs_nav_target none)','(global object gs_nav_previous none)');
  const manualSetters:string[]=[];
  const branches=missionBranchGroups(studio.missions);
  const collectionVisits=new Map<string,{key:string;volume:string}[]>();
  studio.missions.forEach((beat,local)=>{
    if(beat.conditionVisitDuring==null)return;
    const index=(indices?.[local]??local)+1,key='gs_visit_'+index;
    const volume=ensureName(beat.conditionVolume??undefined,'Beat '+index+' optional condition volume');
    const visits=collectionVisits.get(beat.conditionVisitDuring)??[];
    visits.push({key,volume});
    collectionVisits.set(beat.conditionVisitDuring,visits);
    globals.push('(global boolean '+key+' false)');
  });
  for(const {index} of branches.values())globals.push('(global boolean gs_branch_'+index+'_ready false)','(global boolean gs_branch_'+index+'_inside false)');
  const cueLines=(beat:CreatorStudioDocument['missions'][number],index:number,phase:'start'|'complete'):string[]=>{
    const cue=beat.soundCue;if(!cue||cue.phase!==phase)return [];
    deps.push('sound:'+cue.soundPath);
    const nativePath=cue.soundPath.replaceAll('/','\\');
    const text:string[]=[];
    if(cue.delayMs){
      if(scope){const counter='gs_cue_wait_'+(index+1)+'_'+phase;globals.push('(global short '+counter+' 0)');text.push('  (set '+counter+' 0)','  (sleep_until (begin','    (set '+counter+' (+ '+counter+' 1))','    (or gs_aborted '+empty+' (>= '+counter+' '+ticks(cue.delayMs)+'))','  ) 1)',markAbort);}
      else text.push('  (sleep '+ticks(cue.delayMs)+')');
    }
    if(scope)text.push('  (if (not gs_aborted) (begin');
    if(cue.caption){deps.push('hud_message:gs_mission_cue_'+(index+1));text.push('  (hud_set_help_text gs_mission_cue_'+(index+1)+')','  (show_hud_help_text true)');}
    text.push('  (sound_impulse_start "'+nativePath+'" none '+cue.gain+')',
      ...wait('(<= (sound_impulse_time "'+nativePath+'") 0)',1,18000));
    if(cue.caption)text.push('  (show_hud_help_text false)');
    if(scope)text.push('  ))');
    return text;
  };
  studio.missions.forEach((beat,local)=>{const index=indices?.[local]??local;if(beat.escortFailure==='continue')globals.push('(global boolean gs_result_'+(index+1)+'_done false)','(global boolean gs_result_'+(index+1)+'_failed false)');});
  const scripted:string[]=['(script dormant gs_mission', options.waitForLogic?'  (sleep_until gs_logic_ready 1)':'  (sleep 1)'];
  studio.missions.forEach((beat,local)=>{const i=indices?.[local]??local;
    if(scope)scripted.push(markAbort,"  (if (not gs_aborted) (begin");
    scripted.push(`  ; ${i+1}: ${safeComment(beat.title)} | ${safeComment(beat.objective)}`);
    if(beat.conditionResult){
      const target=studio.missions.findIndex(row=>row.id===beat.conditionResult!.beatId),index=(indices?.[target]??target)+1,key='gs_result_'+index;
      scripted.push('  (if (and '+key+'_done '+(beat.conditionResult.failed?key+'_failed':'(not '+key+'_failed)')+') (begin');
    }
    if(beat.conditionVolume!=null){
      const volume=ensureName(beat.conditionVolume,`Beat ${i+1} optional condition volume`);deps.push('trigger_volume:'+volume);
      const group=beat.conditionGroup==null?undefined:branches.get(beat.conditionGroup);
      let condition=beat.conditionVisitDuring!=null?'gs_visit_'+(i+1):'(volume_test_objects '+volume+' (players))';
      if(group){
        const key='gs_branch_'+group.index;
        scripted.push('  (if (not '+key+'_ready) (begin',...(scope?wait('(> (list_count (players)) 0)',1):['    (sleep_until (> (list_count (players)) 0) 1)']),'    (set '+key+'_inside '+condition+')','    (set '+key+'_ready true)','  ))');
        condition=key+'_inside';
      }
      if(beat.conditionOutside===true)condition='(not '+condition+')';
      scripted.push('  (if '+condition+' (begin');
    }
    if(beat.completeMission===true&&(local+1!==studio.missions.length||beat.checkpoint===true||beat.conditionVolume!=null||beat.conditionResult!=null))
      throw Error('Native level completion must be the final beat, without a checkpoint or optional condition on the same beat.');
    if(beat.guidance){const guide=beat.guidance;deps.push(guide.object!=null?'waypoint_object:'+ensureName(guide.object,'Objective waypoint object'):'cutscene_flag:'+ensureName(guide.flag??undefined,'Objective waypoint flag'));scripted.push('  (set gs_nav_stage '+(i+1)+')');}
    scripted.push(...sceneCall(beat,i,'start'));
    if(beat.hudObjective===true) {
      const text=beat.hudText??'';
      if(!text.length||text.length>254||/[%\x00-\x1f\x7f]/.test(text))
        throw Error(`Beat ${i+1} HUD text needs 1–254 UTF-16 characters without percent signs or control characters. Direction notes are preserved separately.`);
      const name=`gs_mission_obj_${i+1}`;deps.push('hud_message:'+name);
      scripted.push(`  (hud_set_objective_text ${name})`);
    }
    scripted.push(...cueLines(beat,i,'start'));
    if(scope)scripted.push('  (if (not gs_aborted) (begin');
    switch(beat.trigger){
      case 'manual':
        const key=`gs_manual_${i+1}_done`;
        globals.push(`(global boolean ${key} false)`);
        manualSetters.push(`(script static void gs_complete_${i+1}`, `  (set ${key} true)`, ')', '');
        scripted.push(`  ; Another HaloScript trigger must call (gs_complete_${i+1}).`);
        scripted.push(...wait(key,15));
        break;
      case 'weaponOwned': {
        const path=beat.weaponPath??'';if(!validMissionWeaponPath(path))throw Error('Choose an included native technology weapon for objective '+(i+1)+'.');
        const visits=collectionVisits.get(beat.id)??[];
        for(const {key} of visits)scripted.push('  (set '+key+' false)');
        if(beat.createWeaponObject!=null){const name=ensureName(beat.createWeaponObject,'Collection weapon object');deps.push('weapon_object:'+name+':'+path);scripted.push('  (object_create '+name+')');}
        deps.push('weapon:'+path);const cursor='gs_collector_'+(i+1),found='gs_collected_'+(i+1);
        globals.push('(global short '+cursor+' 0)','(global boolean '+found+' false)');
        scripted.push('  (sleep_until (begin',
          ...visits.map(({key,volume})=>'    (if (volume_test_objects '+volume+' (players)) (set '+key+' true))'),
          '    (if (>= '+cursor+' (list_count (players))) (set '+cursor+' 0))',
          '    (if (and (< '+cursor+' (list_count (players))) (unit_has_weapon (unit (list_get (players) '+cursor+')) "'+path.replaceAll('/','\\')+'")) (set '+found+' true))',
          '    (set '+cursor+' (+ '+cursor+' 1))', scope?'    (or gs_aborted '+empty+' '+found+')':'    '+found, '  ) 1)');if(scope)scripted.push(markAbort);break;
      }
      case 'forerunnerExtractionSettled': {
        const control=ensureName(beat.triggerRef??undefined,'Forerunner extraction control');
        if(control!=='extraction_activate')throw Error('Forerunner contract 1 requires the native extraction_activate control.');
        deps.push('forerunner_extraction:'+control);const settled='gs_settled_'+(i+1),armed='gs_extraction_armed';
        globals.push('(global boolean '+armed+' false)','(global boolean '+settled+' false)');
        if(scope){
          manualSetters.push('(script continuous forerunner_squad_'+String(scope).padStart(2,'0')+'_complete','  (sleep -1)',...(guided?['  (if (and '+armed+' (not gs_aborted)) (begin','    (set gs_nav_stage 0)','    (set '+settled+' true)','  ))']:['  (if (and '+armed+' (not gs_aborted)) (set '+settled+' true))']),')','');
          scripted.push('  (set '+armed+' true)','  (device_group_set extraction_squad_'+String(scope).padStart(2,'0')+'_ready 1)',...wait(settled,1,undefined,true),'  (set '+armed+' false)');
        }else{
          manualSetters.push('(script dormant forerunner_extraction_complete','  (if '+armed+' (set '+settled+' true))',')','');
          scripted.splice(2,0,'  (device_set_power '+control+' 0)');
          scripted.push('  (set '+armed+' true)','  (device_set_power '+control+' 1)','  (sleep_until '+settled+' 1)');
        }break;
      }
      case 'timer':
        if(!Number.isInteger(beat.timerSeconds) || beat.timerSeconds! < 1 || beat.timerSeconds! > 600)
          throw new Error(`Beat ${i+1} needs timerSeconds between 1 and 600.`);
        if(scope){const counter='gs_delay_'+(i+1);globals.push('(global short '+counter+' 0)');scripted.push('  (sleep_until (begin','    (set '+counter+' (+ '+counter+' 1))','    (or gs_aborted '+empty+' (>= '+counter+' '+ticks(beat.timerSeconds!*1000)+'))','  ) 1)',markAbort);}
        else scripted.push('  (sleep '+ticks(beat.timerSeconds!*1000)+')');break;
      case 'triggerVolume':{
        const ref=ensureName(beat.triggerRef??undefined,`Beat ${i+1} trigger volume`);
        deps.push(`trigger_volume:${ref}`);
        if(beat.transportInsertion){
          if(scope||!options.forerunner)throw Error('Passenger insertion requires shared Forerunner campaign scope.');
          deps.push('transport_arrival:'+beat.transportInsertion+':'+ref);
          scripted.push(...wait('gs_'+beat.transportInsertion+'_player_arrived',1));break;
        }
        scripted.push(...wait(scope?'(and (> (list_count (players)) 0) (volume_test_objects '+ref+' (players)))':'(volume_test_objects '+ref+' (players))',15));break;
      }
      case 'deviceActivated':{
        const ref=ensureName(beat.triggerRef??undefined,'Beat '+(i+1)+' native control');
        deps.push('device_control:'+ref);
        // Arm below the threshold first. An already-active terminal cannot
        // silently satisfy a later objective; do not reset the player's device.
        if(scope&&ref==='extraction_deploy')scripted.push(...wait('(> (list_count (players)) 0)',1));
        else scripted.push(...wait('(< (device_get_position '+ref+') 0.5)',1),...wait('(>= (device_get_position '+ref+') 0.5)',1));break;
      }
      case 'escort':{
        const ref=ensureName(beat.encounterName,'Beat '+(i+1)+' survivor encounter',true),destination=ensureName(beat.triggerRef??undefined,'Beat '+(i+1)+' survivor destination');
        const minimum=beat.minimumSurvivors??1;
        const survivorsArrived = '(volume_test_objects_all '+destination+' (ai_actors '+ref+'))';
        const arrival = beat.escortRequiresPlayer
          ? '(and '+survivorsArrived+' (volume_test_objects '+destination+' (players)))'
          : survivorsArrived;
        deps.push('ai_encounter:'+ref,'trigger_volume:'+destination,'hud_message:gs_mission_fail_'+(i+1));
        if(beat.transportInsertion){if(scope||!options.forerunner)throw Error('Dropship troop handoff requires shared Forerunner campaign scope. Independent squad delivery remains unsupported.');deps.push('transport_insertion:'+beat.transportInsertion+':'+ref);}
        if(scope){
          scripted.push('  (ai_place '+ref+')',...wait('(> (ai_living_count '+ref+') 0)',15,300),'  (if (not gs_aborted) (begin',...(beat.encounterTeam&&beat.encounterTeam!=='source'?['  (ai_set_team '+ref+' '+beat.encounterTeam+')']:[]),
            '  (sleep_until (begin','    (if (> (list_count (players)) 0) (ai_follow_target_unit '+ref+' (unit (list_get (players) 0))))',
            '    (or gs_aborted '+empty+' (< (ai_living_count '+ref+') '+minimum+') (and (> (ai_living_count '+ref+') 0) '+arrival+'))','  ) 15)',markAbort,
            '  (if (and (not gs_aborted) (< (ai_living_count '+ref+') '+minimum+')) (begin');
          if(beat.allowSharedPresentation)scripted.push('    (hud_set_objective_text gs_mission_fail_'+(i+1)+')');
          scripted.push('    (print "gs survivor objective failed")',beat.escortFailure==='continue'?'    (set gs_result_'+(i+1)+'_failed true)':'    (set gs_aborted true)','  ))');
          if(beat.escortFailure==='continue')scripted.push('  (if (not gs_aborted) (set gs_result_'+(i+1)+'_done true))');
          scripted.push('  ))');
          if(beat.escortFailure==='continue')scripted.push('  (if (not gs_result_'+(i+1)+'_failed) (begin');
          break;
        }
        scripted.push(...(beat.transportInsertion?['  (sleep_until gs_'+beat.transportInsertion+'_insertion_complete 1)']:['  (ai_place '+ref+')']),'  (sleep_until (> (ai_living_count '+ref+') 0) 15 300)',
          ...(beat.encounterTeam==null?['  (ai_allegiance player human)','  (ai_set_team '+ref+' human)']:beat.encounterTeam==='source'?[]:['  (ai_set_team '+ref+' '+beat.encounterTeam+')']),'  (ai_follow_target_players '+ref+')',
          '  (sleep_until (or (< (ai_living_count '+ref+') '+minimum+') '+arrival+') 15)',
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
        if(beat.encounterTeam&&beat.encounterTeam!=='source')scripted.push('  (ai_set_team '+ref+' '+beat.encounterTeam+')');
        // Guard: never count an unspawned/empty squad as a successfully cleared wave.
        scripted.push(...wait('(> (ai_living_count '+ref+') 0)',15));
        scripted.push(...wait('(= (ai_living_count '+ref+') 0)',15));break;
      }
    }
    if(scope)scripted.push('  (if (not gs_aborted) (begin');
    scripted.push(...cueLines(beat,i,'complete'),...sceneCall(beat,i,'complete'));
    scripted.push('  (print "gs objective complete")');
    if(beat.checkpoint===true)scripted.push('  (game_save)');
    if(beat.completeMission===true)scripted.push('  (game_won)');
    if(scope)scripted.push('  ))');
    if(beat.escortFailure==='continue')scripted.push('  ))');
    if(scope)scripted.push('  ))');
    if(beat.guidance)scripted.push('  (set gs_nav_stage 0)');
    if(beat.conditionVolume!=null)scripted.push('  ))');
    if(beat.conditionResult!=null)scripted.push('  ))');
    if(scope)scripted.push('  ))');
  });
  if(scope){
    const ready='extraction_squad_'+String(scope).padStart(2,'0')+'_ready';
    deps.push('forerunner_squad:'+String(scope).padStart(2,'0'),'device_control:extraction_squad_'+String(scope).padStart(2,'0'));
    globals.unshift('(global boolean gs_enabled false)','(global boolean gs_running false)','(global boolean gs_aborted false)');
    const reset=globals.flatMap(line=>{const found=line.match(/^\(global (?:boolean|short) ([A-Za-z_0-9]+) ([A-Za-z_0-9-]+)\)$/);return found&&found[1]!=='gs_enabled'?['  (set '+found[1]+' '+found[2]+')']:[];});
    scripted[0]='(script continuous gs_mission';
    scripted.splice(1,0,'  (sleep_until gs_enabled 1)',...reset,'  (device_group_set '+ready+' 0)','  (sleep_until (> (list_count (players)) 0) 1)','  (set gs_running true)');
    const settled='gs_settled_'+((indices?.[studio.missions.length-1]??studio.missions.length-1)+1);
    scripted.push('  (set gs_running false)','  (set gs_extraction_armed false)','  (if '+settled+' (sleep_until (or '+empty+' (< (device_group_get '+ready+') 0.5)) 1))','  (device_group_set '+ready+' 0)','  (if gs_aborted (sleep_until '+empty+' 1))','  (sleep 1)');
    if(guided){
      scripted.push('  (set gs_nav_stage 0)');
      const markers=studio.missions.flatMap((beat,local)=>beat.guidance?[{stage:(indices?.[local]??local)+1,...beat.guidance}]:[]),flags=[...new Set(markers.flatMap(m=>m.flag==null?[]:[m.flag]))];
      manualSetters.push('(script static void gs_nav_hide','  (if (!= gs_nav_viewer none) (begin',...flags.map(flag=>'    (deactivate_nav_point_flag gs_nav_viewer '+flag+')'),...(moving?['    (if (!= gs_nav_previous none) (deactivate_nav_point_object gs_nav_viewer gs_nav_previous))']:[]),'  ))',')','',
        '(script static void gs_nav_show','  (if (!= gs_nav_viewer none) (begin',...markers.map(m=>m.object!=null?'    (if (and (= gs_nav_stage '+m.stage+') (!= gs_nav_target none)) (activate_nav_point_object default gs_nav_viewer gs_nav_target '+m.height+'))':'    (if (= gs_nav_stage '+m.stage+') (activate_nav_point_flag default gs_nav_viewer '+m.flag+' '+m.height+'))'),'  ))',')','',
        '(script static void gs_nav_update',
        '  (if (and gs_running (not '+settled+') (= (list_count gs_nav_members) 0)) (set gs_aborted true))',
        '  (if gs_aborted (set gs_nav_stage 0))',
        ...(moving?['  (set gs_nav_target none)',...markers.flatMap(m=>m.object==null?[]:['  (if (= gs_nav_stage '+m.stage+') (set gs_nav_target '+m.object+'))'])]:[]),
        '  (set gs_nav_dirty (or (!= gs_nav_stage gs_nav_drawn_stage) '+Array.from({length:6},(_,i)=>'(!= gs_nav_'+i+' (unit (list_get gs_nav_members '+i+')))').join(' ')+(moving?' (!= gs_nav_target gs_nav_previous)':'')+'))',
        '  (if gs_nav_dirty (begin',
        // Clear every old binding first: list reordering must not remove a newly shown member.
        ...Array.from({length:6},(_,i)=>['    (set gs_nav_viewer gs_nav_'+i+')','    (gs_nav_hide)','    (set gs_nav_'+i+' none)']).flat(),
        ...(moving?['    (set gs_nav_previous gs_nav_target)']:[]),
        '    (set gs_nav_drawn_stage gs_nav_stage)',
        '    (if (and (!= gs_nav_stage 0) (<= (list_count gs_nav_members) 6)) (begin',
        ...Array.from({length:6},(_,i)=>['      (set gs_nav_'+i+' (unit (list_get gs_nav_members '+i+')))','      (set gs_nav_viewer gs_nav_'+i+')','      (gs_nav_show)']).flat(),
        '    ))','  ))',')','',
        '(script continuous gs_guard','  (if (or gs_running (!= gs_nav_drawn_stage 0)) (begin','    (set gs_nav_members (players))','    (gs_nav_update)','  ))','  (sleep 1)',')','');
    }else manualSetters.push('(script continuous gs_guard','  (if (and gs_running (not '+settled+') (= (list_count (players)) 0)) (set gs_aborted true))','  (sleep 1)',')','');
  }
  scripted.push(')', '');
  lines.push(...sceneSources,...globals, '', ...manualSetters, ...scripted);
  return {filename:'gs_mission.hsc',content:lines.join('\r\n'),dependencies:deps,activation:'(wake gs_mission)',warnings:[
    'Mission is a dormant script. Explicitly call (wake gs_mission) from a reviewed scenario startup script.',
    scope?"Optional conditions and rescue results stay within this squad. Decisions reset each operation and sample current native participants; skipped steps run no AI, HUD or cue.":'Optional volume conditions run when their step starts. Shared decisions sample once at their first eligible member and retain that result for every member; inside/outside outcomes are mutually exclusive. Skipped steps run no AI, HUD, cue or checkpoint. This is shared scenario state, not independent squad progress or replay settlement.',
    scope?"Manual beats wait for their namespaced gs_sqNN_complete_N function. State resets per operation; stale external calls and real native replay still require gameplay acceptance.":'Manual beats stop progression until another script or trigger calls their generated gs_complete_N function. Replaying in a persistent world needs explicit gate reset and run-aware settlement; this exporter does not certify replayability.',
    ...(studio.missions.some(beat=>beat.trigger==='weaponOwned')?[scope?"Collection scans current issued squad participants, requerying each tick. Use a technology tag absent from starting loadouts. This does not bank or award inventory.":'Collection scans one actual native player inventory per tick, including later players. Any matching owned weapon satisfies this shared objective; use a unique technology tag absent from starting loadouts if only one pickup should qualify. No pickup, duplication, bank award or per-squad quest is fabricated.']:[]),
    ...(extractionBeats.length?[scope?"Forerunner-only squad operation: author the matching numbered terminal and unique readiness group, deployment/extraction volumes and hub starts. Readiness arms only after this squad finishes its objectives; the native callback confirms settlement. No global extraction control, reward writer, raid timer or teleport is added.":'Forerunner-only: enable its native Extraction mode and supply powered deployment control, initially unpowered extraction_activate, extraction_zone/extraction_return volumes and safe hub starts. Earlier objectives gate extraction power; the native one-shot callback arrives only after actual survivor/gear settlement. No timer, reward writer, teleport or independent squad quest is added. Legacy runtime exports are refused.']:[]),
    ...(studio.missions.some(beat=>beat.trigger==='deviceActivated')?[scope?"Numbered squad deployment is detected through the native issued-participant query. Other terminal objectives observe shared control transitions; use independent controls when interaction must be isolated. Scripts may also activate controls; no terminal reset or inventory grant is added.":'Terminal objectives wait for the named native control below half position, then a new activation. Scripted device changes may also satisfy this shared scenario condition. This does not acquire an item, bank loot, reset a terminal or create independent squad state. Native use behavior and gameplay require testing.']:[]),
    ...(studio.missions.some(beat=>beat.trigger==='escort')?[scope?"Scoped rescue follows a current squad participant and uses its explicit encounter team, or preserves source teams when no override is selected. All surviving actors must reach the destination with the required minimum alive. Failure stops this operation or follows the authored rescue-result path. AI allegiance, navigation and multiplayer behavior require gameplay testing.":'Survivor escort places its source group and follows the closest players. Its selected encounter team applies; the legacy default assigns the native human team and player-human allegiance. All surviving actors must enter the destination with the configured minimum alive. Default casualty failure stops this mission script, not the world. Continue to failure handling records its result and skips its success cues/checkpoint; later result conditions select success or failure routes. A skipped rescue has no result. No loot or extraction settlement is awarded. Native navigation/gameplay and multiplayer behavior require testing.']:[]),
    ...(studio.missions.some(beat=>beat.soundCue)?['Radio cues use the complete imported native sound and its sound-class settings; the game selects permutations. They are unpositioned, shared scenario cues, not per-squad voice chat. Playback waits at most ten minutes; captions use the standard HUD help channel and can be replaced by other scripts. Editor audition does not prove game audio.']:[]),
    ...(guided?['Personal native waypoints target current native squad units, requerying after bodies/membership change and removing prior markers on transitions, failure or settlement. At most six participants are supported; oversized lists refuse partial display. The standard four-marker HUD budget and engine relay cache still apply. Moving targets requery their actual native object identity, clear the previous target before rebinding and wait while absent; no spawn or inventory award is added. Current compatible Forerunner is required; rendering/real peers remain unverified.']:[]),
    ...(studio.missions.some(beat=>beat.encounterTeam!=null)?['Explicit encounter teams affect only that native AI group at runtime; Source preserves its authored team. Actor assets and global alliances are unchanged. Player factions, allegiance and actual combat still require compatible game acceptance.']:[]),
    'Mission source requires hand-authored scenario trigger volumes, encounters, objectives, AI navigation, BSP and tag assets.',
    'Opt-in HUD objectives need their matching standard message tag. Native checkpoint requests may time out when unsafe; level completion can advance the campaign. Compilation/gameplay remain unverified.',
  ],generatedOnly:true};
}

/** Binding comments remain source metadata; engines execute ordinary HaloScript. */
/** Recovered source uses the same mission exporter without QuickForge's
 * gs_logic_ready global. The existing reviewed-module transaction owns writes. */
export const recoveredMissionPrefix='; Spark recovered campaign mission v1\n';
const retainedMissionMarker='\n; Spark retained module body v1\n';
const generatedMissionMarker='\n; Spark generated mission body v1\n';
function retainedMissionSource(content:string):string{const start=content.indexOf(retainedMissionMarker),end=content.indexOf(generatedMissionMarker,start+retainedMissionMarker.length);if(start<0||end<0||content.indexOf(retainedMissionMarker,start+1)>=0||content.indexOf(generatedMissionMarker,end+1)>=0)throw Error('Retained module source boundary is missing or ambiguous.');return content.slice(start+retainedMissionMarker.length,end);}
export interface RecoveredMissionComposition {filename:string;sourceSha256:string;retainedSha256?:string;retiredStartups:string[];replaceExtractionCallback:boolean}
export interface HaloSourceDeclaration {kind:'script'|'global';type:string;name:string;start:number;end:number;headerEnd:number}
/** Bounded lossless source spans, not a replacement HaloScript compiler. */
export function haloSourceDeclarations(source:string,visitToken?:(start:number,end:number,token:string)=>void):HaloSourceDeclaration[]{
 if(new TextEncoder().encode(source).length>256*1024)throw Error('Mission composition supports at most256KiB of original source. Use the manual source editor.');
 const rows:HaloSourceDeclaration[]=[];let depth=0,start=0,at=0,header:{text:string;end:number;quoted?:boolean}[]=[];
 while(at<source.length){
  const c=source[at];if(/\s|\uFEFF/.test(c)){at++;continue;}
  if(c===';'){
   if(source[at+1]==='*'){let comments=1;at+=2;while(at<source.length&&comments){if(source.slice(at,at+2)===';*'){comments++;at+=2;}else if(source.slice(at,at+2)==='*;'){comments--;at+=2;}else at++;}if(comments)throw Error('Unclosed native source block comment.');}
   else{while(at<source.length&&source[at]!=='\n')at++;}continue;
  }
  if(c==='('){if(!depth){start=at;header=[];}if(++depth>128)throw Error('Native source nesting exceeds the composition limit.');at++;continue;}
  if(c===')'){
   if(!depth)throw Error('Unbalanced native source parentheses.');at++;if(--depth)continue;
   const kind=header[0]?.text,type=header[1]?.text,nameIndex=kind==='script'&&type==='static'?3:2,name=header[nameIndex];
   if(!['script','global'].includes(kind)||!name||name.quoted||!ident.test(name.text)||!type||header.slice(0,nameIndex).some(t=>t.quoted))throw Error('Unsupported source declaration. Preserve it through the manual source editor.');
   rows.push({kind:kind as 'script'|'global',type,name:name.text,start,end:at,headerEnd:name.end});if(rows.length>2048)throw Error('Native source declaration limit exceeded.');continue;
  }
  if(c==='"'){const begin=at++;let closed=false;while(at<source.length){if(source[at]==='\\'){at+=2;continue;}if(source[at++]==='"'){closed=true;break;}}if(!closed)throw Error('Unclosed native source string.');if(!depth)throw Error('Unexpected text outside native source declarations.');if(depth===1&&header.length<4)header.push({text:source.slice(begin,at),end:at,quoted:true});continue;}
  const begin=at;while(at<source.length&&!/[\s();"\uFEFF]/.test(source[at]))at++;if(at===begin)throw Error('Unsupported native source text.');if(!depth)throw Error('Unexpected text outside native source declarations.');visitToken?.(begin,at,source.slice(begin,at));if(depth===1&&header.length<4)header.push({text:source.slice(begin,at),end:at});
 }
 if(depth)throw Error('Unbalanced native source parentheses.');return rows;
}
function validateMissionComposition(value:RecoveredMissionComposition,requireRetained=false){
 if(!value||Object.keys(value).some(key=>!['filename','sourceSha256','retainedSha256','retiredStartups','replaceExtractionCallback'].includes(key))||!/^([A-Za-z0-9_-]{1,31})\.hsc$/.test(value.filename)||value.filename.toLowerCase()==='global_scripts.hsc'||!/^[a-f0-9]{64}$/i.test(value.sourceSha256)||!Array.isArray(value.retiredStartups)||value.retiredStartups.length>16||value.retiredStartups.some(name=>!ident.test(name))||new Set(value.retiredStartups.map(name=>name.toLowerCase())).size!==value.retiredStartups.length||typeof value.replaceExtractionCallback!=='boolean'||requireRetained&&!/^[a-f0-9]{64}$/i.test(value.retainedSha256??''))throw Error('Invalid reviewed mission source composition.');
}
function legacyMissionRadioSource(content:string,missions:CreatorStudioDocument['missions']):string {
 for(const beat of missions){const cue=beat.soundCue;if(!cue)continue;for(const op of ['sound_impulse_start','sound_impulse_time'])content=content.replaceAll('('+op+' "'+cue.soundPath.replaceAll('/','\\')+'"','('+op+' "'+cue.soundPath+'"');}return content;
}
function recoveredMissionDocument(studio:CreatorStudioDocument,activation:'manual'|'startup',forerunner:boolean,composition?:RecoveredMissionComposition,retained?:string,legacyRadioPaths=false):ScriptExport{
 if(!['manual','startup'].includes(activation)||typeof forerunner!=='boolean')throw Error('Choose manual or startup recovered mission activation.');
 const source=exportHaloCeMission(studio,{forerunner});
 if(legacyRadioPaths)source.content=legacyMissionRadioSource(source.content,studio.missions);
 const bootstrap='\n(script startup gs_mission_bootstrap\n'+(activation==='startup'?'  (sleep_until (> (list_count (players)) 0) 1)\n  (wake gs_mission)':'  (sleep -1)')+'\n)\n';
 const configuration={activation,forerunner,missions:studio.missions,shots:studio.shots,...(composition?{composition}:{})};
 let body=source.content+bootstrap;
 if(composition){
  validateMissionComposition(composition,true);if(retained==null||retained.includes(retainedMissionMarker))throw Error('Missing or ambiguous retained native source.');
  if(retained.includes(generatedMissionMarker))throw Error('Retained source contains a reserved mission boundary.');
  const allGenerated=haloSourceDeclarations(body),callback=allGenerated.filter(row=>row.kind==='script'&&row.name==='forerunner_extraction_complete');
  if(composition.replaceExtractionCallback){
   const original=haloSourceDeclarations(retained).filter(row=>row.kind==='script'&&row.type==='dormant'&&row.name==='forerunner_extraction_complete');
   if(callback.length!==1||original.length!==1||retained.slice(original[0].start,original[0].end)!==body.slice(callback[0].start,callback[0].end))throw Error('The revised mission must retain its reviewed extraction callback in its original declaration slot.');
   body=body.slice(0,callback[0].start)+body.slice(callback[0].end);
  }
  const generated=haloSourceDeclarations(body),rows=haloSourceDeclarations(retained),key=(row:HaloSourceDeclaration)=>row.kind+':'+row.name.toLowerCase();
  if(rows.some(row=>generated.some(other=>key(row)===key(other))))throw Error('A generated mission declaration still belongs to retained source. Reconcile it manually; no source was replaced.');
  for(const name of composition.retiredStartups){const rowsNamed=rows.filter(row=>row.kind==='script'&&row.type==='startup'&&row.name===name);if(rowsNamed.length!==1||retained.slice(rowsNamed[0].headerEnd,rowsNamed[0].end)!=='\n  (sleep -1)\n)')throw Error('The reviewed retired startup changed. Preserve handwritten source through the manual editor.');}
  body=retainedMissionMarker+retained+generatedMissionMarker+body;
 }
 const header=JSON.stringify(configuration).replace(/[\u007f-\uffff]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
 const content=recoveredMissionPrefix+'; configuration: '+header+'\n'+body;
 if(new TextEncoder().encode(content).length>256*1024)throw Error('Recovered mission source exceeds the256KiB native file budget; no source was replaced.');
 return {...source,filename:composition?.filename??source.filename,content,activation:activation==='startup'?'Level startup':'(wake gs_mission)',warnings:[...source.warnings,...(composition?['Only the explicitly selected startup bodies and extraction callback were replaced. Every other original form and comment is retained. Review remaining startup/continuous scripts for competing gameplay ownership. Original source remains in the previous native build; existing license notices remain in the retained output.']:[])]};
}
export function recoveredCampaignMission(studio:CreatorStudioDocument,activation:'manual'|'startup',forerunner:boolean):ScriptExport{return recoveredMissionDocument(studio,activation,forerunner);}
/** One reviewed module revision, using the same mission writer and native transaction. */
export async function composeRecoveredCampaignMission(studio:CreatorStudioDocument,activation:'manual'|'startup',forerunner:boolean,original:string,composition:RecoveredMissionComposition):Promise<ScriptExport>{
 validateMissionComposition(composition);if(await nativeMissionHash(original)!==composition.sourceSha256)throw Error('The original module differs from its reviewed SHA256. Read ownership again.');
 if(original.startsWith(recoveredMissionPrefix)){
  const prior=await readRecoveredMissionSource(original);if(!prior.composition||prior.composition.filename!==composition.filename||JSON.stringify(prior.composition.retiredStartups)!==JSON.stringify(composition.retiredStartups)||prior.composition.replaceExtractionCallback!==composition.replaceExtractionCallback)throw Error('Keep the existing composition ownership or reconcile it through the manual source editor.');
  let retained=retainedMissionSource(original);
  if(composition.replaceExtractionCallback){const current=haloSourceDeclarations(retained).find(row=>row.kind==='script'&&row.name==='forerunner_extraction_complete')!,nextSource=recoveredCampaignMission(studio,activation,forerunner).content,next=haloSourceDeclarations(nextSource).find(row=>row.kind==='script'&&row.name==='forerunner_extraction_complete');if(!next)throw Error('The revised mission no longer supplies the original extraction callback.');retained=retained.slice(0,current.start)+nextSource.slice(next.start,next.end)+retained.slice(current.end);}
  return recoveredMissionDocument(studio,activation,forerunner,{...composition,retainedSha256:await nativeMissionHash(retained)},retained);
 }
 const generatedSource=recoveredCampaignMission(studio,activation,forerunner).content,rows=haloSourceDeclarations(original),generated=haloSourceDeclarations(generatedSource),edits:{start:number;end:number;content:string}[]=[];
 const shared=rows.filter(row=>generated.some(other=>other.kind===row.kind&&other.name.toLowerCase()===row.name.toLowerCase()));
 for(const row of shared){if(row.kind!=='script'||row.type!=='dormant'||row.name!=='forerunner_extraction_complete'||!composition.replaceExtractionCallback)throw Error('A generated declaration belongs to the original source: '+row.name+'. Reconcile through the manual source editor.');const replacement=generated.find(other=>other.kind==='script'&&other.name===row.name)!;edits.push({start:row.start,end:row.end,content:generatedSource.slice(replacement.start,replacement.end)});}
 if(composition.replaceExtractionCallback&&shared.filter(row=>row.name==='forerunner_extraction_complete').length!==1)throw Error('Select exactly one existing dormant extraction callback for replacement.');
 for(const name of composition.retiredStartups){const found=rows.filter(row=>row.kind==='script'&&row.type==='startup'&&row.name===name);if(found.length!==1)throw Error('Selected native startup is missing or ambiguous: '+name);const row=found[0];edits.push({start:row.headerEnd,end:row.end,content:'\n  (sleep -1)\n)'});}
 let retained=original;for(const edit of edits.sort((a,b)=>b.start-a.start))retained=retained.slice(0,edit.start)+edit.content+retained.slice(edit.end);
 return recoveredMissionDocument(studio,activation,forerunner,{...composition,retainedSha256:await nativeMissionHash(retained)},retained);
}
export async function readRecoveredMissionSource(content:string){
 if(new TextEncoder().encode(content).length>256*1024)throw Error('Recovered mission source exceeds its256KiB review budget. Preserve it through the manual source editor.');
 if(!content.startsWith(recoveredMissionPrefix))throw Error('This is not an unchanged generated recovered mission. Use the explicit manual source editor.');
 const line=content.slice(recoveredMissionPrefix.length).split('\n',1)[0];if(!line.startsWith('; configuration: '))throw Error('Recovered mission configuration is missing.');
 const configuration=JSON.parse(line.slice('; configuration: '.length));
 if(!configuration||Object.keys(configuration).some(key=>!['activation','forerunner','missions','shots','composition'].includes(key)))throw Error('Unknown recovered mission configuration.');
 if(!Array.isArray(configuration.missions)||configuration.missions.some((beat:unknown)=>!beat||typeof beat!=='object'||Array.isArray(beat)||Object.keys(beat).some(key=>!Object.hasOwn(nativeMissionBeatFields,key))))throw Error('Recovered mission contains unsupported beat fields. No data was adopted.');
 if(!Array.isArray(configuration.shots))throw Error('Recovered mission camera data is missing.');if(configuration.shots.length)validateNativeCinematic(configuration.shots);
 const studio={...emptyCreatorStudio(),missions:configuration.missions,shots:configuration.shots};
 const retained=configuration.composition?retainedMissionSource(content):undefined;
 if(configuration.composition&&(!content.includes(retainedMissionMarker)||await nativeMissionHash(retained!)!==configuration.composition.retainedSha256))throw Error('Retained module source was edited or its checksum is missing. Preserve it through the manual source editor.');
 if(recoveredMissionDocument(studio,configuration.activation,configuration.forerunner,configuration.composition,retained).content!==content&&recoveredMissionDocument(studio,configuration.activation,configuration.forerunner,configuration.composition,retained,true).content!==content)throw Error('Recovered mission source was edited. Preserve it through the manual source workflow; regeneration refused.');
 return configuration as {activation:'manual'|'startup';forerunner:boolean;missions:CreatorStudioDocument['missions'];shots:CreatorStudioDocument['shots'];composition?:RecoveredMissionComposition};
}

export const nativeMissionBinding = '; Spark native mission configuration: ';
export interface NativeMissionBinding {
  schemaVersion:1;
  missions:import('./creatorStudio').MissionBeat[];
  activation:'manual'|'startup';
  sourceSha256:string;
  /** Reviewed snapshot for native campaign scenes, not an engine recording take. */
  cinematic?:CameraShot[];
  /** Absent preserves the original prepared-intro behavior. */
  cinematicIntro?:boolean;
}

// Exhaustive against the saved beat type: new creator fields must remain reviewable.
const nativeMissionBeatFields={guidance:true,squadNumber:true,allowSharedPresentation:true,id:true,title:true,objective:true,trigger:true,encounterName:true,encounterTeam:true,transportInsertion:true,triggerRef:true,weaponPath:true,createWeaponObject:true,timerSeconds:true,hudObjective:true,hudText:true,checkpoint:true,completeMission:true,conditionVolume:true,conditionGroup:true,conditionVisitDuring:true,conditionOutside:true,soundCue:true,minimumSurvivors:true,escortRequiresPlayer:true,escortFailure:true,conditionResult:true,cinematicCue:true} satisfies Record<keyof CreatorStudioDocument['missions'][number],true>;
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
  const fields=['schemaVersion','missions','activation','sourceSha256','cinematic','cinematicIntro'];
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).some(key=>!fields.includes(key))||
    binding.schemaVersion!==1||!['manual','startup'].includes(binding.activation)||!Array.isArray(binding.missions)||
    !binding.missions.length||binding.missions.length>128||typeof binding.sourceSha256!=='string'||!/^[a-f0-9]{64}$/i.test(binding.sourceSha256))
    throw Error('Attached mission uses unsupported metadata. No local mission data was replaced.');

  if(binding.missions.some(beat=>!beat||typeof beat!=='object'||Array.isArray(beat)||
    Object.keys(beat).some(key=>!Object.hasOwn(nativeMissionBeatFields,key))||
    (['id','title','objective','trigger','encounterName'] as const).some(field=>typeof beat[field]!=='string')||
    (beat.triggerRef!=null&&typeof beat.triggerRef!=='string')||(beat.weaponPath!=null&&typeof beat.weaponPath!=='string')||
    (beat.createWeaponObject!=null&&typeof beat.createWeaponObject!=='string')||
    (beat.conditionVolume!=null&&typeof beat.conditionVolume!=='string')||
    (beat.conditionGroup!=null&&typeof beat.conditionGroup!=='string')||
    (beat.conditionVisitDuring!=null&&typeof beat.conditionVisitDuring!=='string')||
    (beat.conditionOutside!=null&&typeof beat.conditionOutside!=='boolean')||
    (beat.minimumSurvivors!=null&&typeof beat.minimumSurvivors!=='number')||
    (beat.escortRequiresPlayer!=null&&(beat.trigger!=='escort'||typeof beat.escortRequiresPlayer!=='boolean'))||
    (beat.timerSeconds!=null&&typeof beat.timerSeconds!=='number')||
    (beat.hudText!=null&&typeof beat.hudText!=='string')||
    [beat.hudObjective,beat.checkpoint,beat.completeMission].some(value=>value!=null&&typeof value!=='boolean')))
    throw Error('Attached mission contains unsupported beat fields. Keep the original source for explicit review.');
  if(binding.cinematicIntro!==undefined&&(typeof binding.cinematicIntro!=='boolean'||binding.cinematic===undefined))throw Error('Prepared cinematic activation has no valid camera snapshot.');
  if(binding.cinematic===undefined&&binding.missions.some(beat=>beat.cinematicCue!=null))throw Error('Prepared mission scenes are missing their reviewed camera shots.');
  if(binding.cinematicIntro===false&&!binding.missions.some(beat=>beat.cinematicCue!=null))throw Error('Prepared shots have no selected mission scene.');
  if(binding.cinematic!==undefined)validateNativeCinematic(binding.cinematic);
  const errors=validateCreatorStudio({...emptyCreatorStudio(),missions:binding.missions,shots:binding.cinematic??[]});
  if(errors.length)throw Error(errors.join('; '));
  // Required identifiers/delays use the same exporter validation as preparation.
  exportHaloCeMission({...emptyCreatorStudio(),missions:binding.missions,shots:binding.cinematic??[]},{forerunner:binding.missions.some(beat=>beat.trigger==='forerunnerExtractionSettled')});
  const body=module.content.slice(end+1);
  if((await nativeMissionHash(body)).toLowerCase()!==binding.sourceSha256.toLowerCase())
    throw Error('Attached mission source differs from its checksum. No mission data was adopted or regenerated.');
  const expectedBody=nativeMissionBody(binding.missions,binding.activation,binding.cinematic,binding.cinematicIntro);
  if(body!==expectedBody&&body!==legacyMissionRadioSource(expectedBody,binding.missions))
    throw Error('Attached mission data differs from the current generated source, or uses another generator. Preserve/export the module in Logic / Events before explicit reconciliation.');
  return binding;
}
/** Rust Option values serialize as null; absence has the same authored meaning. */
export function sameMissionData(a:NativeMissionBinding['missions'],b:NativeMissionBinding['missions']):boolean {
  const normalize=(values:NativeMissionBinding['missions'])=>values.map(beat=>({...beat,
    squadNumber:beat.squadNumber??null,allowSharedPresentation:beat.allowSharedPresentation??null,guidance:beat.guidance?{flag:beat.guidance.flag??null,object:beat.guidance.object??null,height:beat.guidance.height}:null,
    transportInsertion:beat.transportInsertion??null,encounterTeam:beat.encounterTeam??null,triggerRef:beat.triggerRef??null,weaponPath:beat.weaponPath??null,createWeaponObject:beat.createWeaponObject??null,timerSeconds:beat.timerSeconds??null,minimumSurvivors:beat.minimumSurvivors??null,escortRequiresPlayer:beat.escortRequiresPlayer===true,escortFailure:beat.escortFailure??null,conditionResult:beat.conditionResult??null,
    hudObjective:beat.hudObjective??null,hudText:beat.hudText??null,checkpoint:beat.checkpoint??null,completeMission:beat.completeMission??null,conditionVolume:beat.conditionVolume??null,conditionGroup:beat.conditionGroup??null,conditionVisitDuring:beat.conditionVisitDuring??null,conditionOutside:beat.conditionOutside??null,soundCue:beat.soundCue??null,cinematicCue:beat.cinematicCue??null}));
  return sameJson(normalize(a),normalize(b));
}
export interface NativeMissionReview {
  projectId:string;
  document:Project['quickForge'];
  recovered?:{project:Project;sha256:string;target:string;composition?:RecoveredMissionComposition};
  module:{filename:string;content:string};
  binding:NativeMissionBinding;
  localMissions:NativeMissionBinding['missions'];
  localShots:CameraShot[];
}
export async function reviewNativeCampaignMission(project:Project):Promise<NativeMissionReview> {
  const document=project.quickForge;
  const owned=document?.logic?.handwrittenSources?.filter(source=>source.content.startsWith(nativeMissionBinding))??[];
  if(!document||owned.length!==1||owned[0].filename.toLowerCase()!=='gs_mission.hsc')
    throw Error('Review requires one attached gs_mission.hsc binding. Preserve and reconcile missing, renamed or duplicate modules in Logic / Events.');
  const localMissions=structuredClone(project.studio?.missions??[]);
  const module=owned[0],binding=await readNativeMissionModule(module);
  return {projectId:project.id,document,module,binding,localMissions,localShots:structuredClone(project.studio?.shots??[])};
}
/** Read the existing recovered metadata without executing or rewriting native source.
 * The caller owns pinned native I/O and must recheck that source before adoption. */
export async function reviewRecoveredCampaignMission(project:Project,module:{filename:string;content:string;sha256:string},target:string):Promise<NativeMissionReview>{
  if(project.quickForge&&!project.quickForge.native||!['gbx-custom','mcc-cea'].includes(target))throw Error('Recovered mission review requires CE609 or MCC working source.');
  if(!/^[A-Za-z0-9_-]{1,31}\.hsc$/.test(module.filename)||!/^[a-f0-9]{64}$/.test(module.sha256)||new TextEncoder().encode(module.content).length>256*1024||await nativeMissionHash(module.content)!==module.sha256)throw Error('Recovered mission module identity changed. No project data was adopted.');
  const config=await readRecoveredMissionSource(module.content);
  if(config.composition?config.composition.filename!==module.filename:module.filename.toLowerCase()!=='gs_mission.hsc')throw Error('Recovered mission filename does not match its reviewed ownership.');
  if(config.forerunner&&target!=='gbx-custom')throw Error('This Forerunner mission requires CE609 source; no incompatible data was adopted.');
  return {projectId:project.id,document:project.quickForge,module:{filename:module.filename,content:module.content},binding:{schemaVersion:1,missions:structuredClone(config.missions),activation:config.activation,sourceSha256:module.sha256,cinematic:structuredClone(config.shots),cinematicIntro:false},localMissions:structuredClone(project.studio?.missions??[]),localShots:structuredClone(project.studio?.shots??[]),recovered:{project,sha256:module.sha256,target,composition:config.composition}};
}
/** Explicit replacement of mission data only. Source modules and unrelated
 * Studio settings remain unchanged; normal project history owns Undo/Redo. */
export function applyNativeCampaignMission(project:Project,review:NativeMissionReview):Project {
  const document=project.quickForge;
  if(project.id!==review.projectId||document!==review.document||!!review.recovered&&project!==review.recovered.project||!sameMissionData(project.studio?.missions??[],review.localMissions)||review.binding.cinematic!==undefined&&!sameCinematicData(project.studio?.shots??[],review.localShots))
    throw Error('Source or local mission data changed after review. Review again; no stale data was applied.');
  if(!review.recovered){
    if(!document)throw Error('The attached mission source is missing. Existing drafts remain intact.');
    const owned=document.logic?.handwrittenSources?.filter(source=>source.content.startsWith(nativeMissionBinding))??[];
    if(owned.length!==1||owned[0].filename!==review.module.filename||owned[0].content!==review.module.content)throw Error('The attached mission changed after review. Existing drafts remain intact.');
  }
  const studio={...(project.studio??emptyCreatorStudio()),missions:structuredClone(review.binding.missions),...(review.binding.cinematic?{shots:structuredClone(review.binding.cinematic)}:{})};
  const errors=validateCreatorStudio(studio);
  if(errors.length)throw Error('Cannot combine attached missions with current Studio data: '+errors.join('; '));
  if(sameMissionData(project.studio?.missions??[],studio.missions)&&sameCinematicData(project.studio?.shots??[],studio.shots))return project;
  return {...project,studio};
}

export function sameCinematicData(a:CameraShot[],b:CameraShot[]):boolean {
  const normalize=(shots:CameraShot[])=>shots.map(shot=>({...shot,cameraMarker:shot.cameraMarker??null,roll:shot.roll??null,easing:shot.easing??null}));
  return sameJson(normalize(a),normalize(b));
}
export function cinematicMarker(shot:CameraShot,index:number):string {
  return ensureName(shot.cameraMarker||('gs_cs_'+String(index+1).padStart(3,'0')),'Cinematic camera point');
}
function validateNativeCinematic(shots:CameraShot[]):void {
  if(!Array.isArray(shots)||!shots.length||shots.length>256)throw Error('Add 1–256 saved camera shots before preparing an intro.');
  const fields=['id','name','durationMs','cameraPosition','lookAt','fov','subtitle','cameraMarker','roll','easing'];
  if(shots.some(shot=>!shot||typeof shot!=='object'||Object.keys(shot).some(key=>!fields.includes(key))))throw Error('Unsupported cinematic shot metadata. Existing source is preserved.');
  const errors=validateCreatorStudio({...emptyCreatorStudio(),shots});if(errors.length)throw Error(errors.join('; '));
  const names=new Set<string>();
  shots.forEach((shot,i)=>{
    const name=cinematicMarker(shot,i).toLowerCase();if(names.has(name))throw Error('Cinematic camera point names must be unique.');names.add(name);
    if(Math.hypot(...shot.lookAt.map((value,axis)=>value-shot.cameraPosition[axis]))<.001)throw Error('Each cinematic shot needs a distinct look-at target.');
  });
}
function nativeMissionBody(missions:NativeMissionBinding['missions'],activation:NativeMissionBinding['activation'],cinematic?:CameraShot[],cinematicIntro=true):string {
  let body=exportHaloCeMission({...emptyCreatorStudio(),missions,shots:cinematic??[]},{waitForLogic:true,preparedCinematics:!!cinematic,forerunner:missions.some(beat=>beat.trigger==='forerunnerExtractionSettled')}).content;
  if(cinematic&&cinematicIntro){
    validateNativeCinematic(cinematic);
    const sequence=exportHaloCeCinematic({...emptyCreatorStudio(),shots:cinematic.map((shot,i)=>({...shot,cameraMarker:cinematicMarker(shot,i)}))},{prepared:true}).content;
    body=sequence+'\r\n'+body.replace(/^  \(sleep_until gs_logic_ready 1\)(?=\r?$)/m,()=> '  (sleep_until gs_logic_ready 1)\r\n  (sleep_until (> (list_count (players)) 0) 1)\r\n  (gs_cinematic)');
  }
  return body+(activation==='startup'?[
    '', '(script startup gs_mission_bootstrap',
    '  (sleep_until gs_logic_ready 1)', '  (wake gs_mission)', ')', '',
  ].join('\r\n'):'');
}
async function nativeMissionModule(missions:NativeMissionBinding['missions'],activation:NativeMissionBinding['activation'],cinematic?:CameraShot[],cinematicIntro=true,legacyRadioPaths=false):Promise<string> {
  if(!['manual','startup'].includes(activation))throw Error('Choose manual or startup mission activation.');
  const currentBody=nativeMissionBody(missions,activation,cinematic,cinematicIntro);
  const body=legacyRadioPaths?legacyMissionRadioSource(currentBody,missions):currentBody;
  const sourceSha256=await nativeMissionHash(body);
  const binding:NativeMissionBinding={schemaVersion:1,missions,activation,sourceSha256,...(cinematic?{cinematic,...(!cinematicIntro?{cinematicIntro:false}:{})}:{})};
  const header=JSON.stringify(binding).replace(/[\u007f-\uffff]/g,character=>
    '\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
  return nativeMissionBinding+header+'\r\n'+body;
}
/** Explicit source preparation. Refuse overwriting handwritten/older-generator
 * text; caller owns the existing project mutation/history transaction. */
export async function attachNativeCampaignMission(project:Project,activation:'manual'|'startup',includeCinematic?:boolean):Promise<Project> {
  const doc=project.quickForge;
  if(!doc||doc.gameMode!=='campaign'||doc.native||
    !['mccSteam','haloCustomEdition','chupathingyCe'].includes(doc.runtimeId))
    throw Error('Open editable Campaign / scripted solo source with a supported native build target first.');
  if(!doc.startingProfile)throw Error('Review Campaign starting loadout in Map properties before preparing the mission.');
  if(doc.logic?.manualSource!=null)throw Error('Generated startup logic is overridden. Preserve handwritten source before returning Native HaloScript to generated logic.');
  const missions=project.studio?.missions;
  if(!missions?.length)throw Error('Add mission beats before preparing native mission source.');
  if(missions.some(beat=>beat.squadNumber!=null))throw Error('Independent squads require reviewed CE609 working tags with numbered terminals/readiness gates. Build a base map, open its compiled source and use Prepare recovered mission source. The saved mission fields are preserved.');
  if(missions.some(beat=>beat.transportInsertion!=null))throw Error('Dropship insertion requires reviewed CE609 working tags with the matching built transport module. Build/open a base map and use Prepare recovered mission source; the saved mission fields are preserved.');
  const soundErrors=missionSoundProblems(project);if(soundErrors.length)throw Error(soundErrors.join('\n'));
  const shots=project.studio?.shots??[];
  const forerunner=missions.some(beat=>beat.trigger==='forerunnerExtractionSettled');
  if(forerunner&&!['haloCustomEdition','chupathingyCe'].includes(doc.runtimeId))throw Error('Forerunner Extraction objectives require a standard CE campaign build target. This callback is unsupported in legacy/MCC/Xbox runtime exports.');
  const output=exportHaloCeMission({...emptyCreatorStudio(),missions,shots},{forerunner});
  const bindings=inspectScenarioBindings([output],null,doc,shots.map(cinematicMarker));
  const missing=bindings.filter(binding=>binding.status!=='presentInAuthoringSource'&&!binding.dependency.startsWith('hud_message:')&&!binding.dependency.startsWith('sound:'));
  if(missing.length)throw Error(missing.map(binding=>binding.dependency+': '+binding.detail).join('\n'));
  if(forerunner){const layout=extractionLayout(doc,{activationPowered:false});if(layout.issues.length)throw Error(layout.issues.map(issue=>issue.message).join('\n'));}
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
  if(missions.some(beat=>beat.createWeaponObject!=null))throw Error('Scheduled named weapon creation currently requires recovered native scenario source. Editable blank-map weapons use automatic placement; no source was replaced.');
  const existing=sources.find(source=>source.filename.toLowerCase()==='gs_mission.hsc');
  let previousCinematic=false;
  if(sources.some(source=>source.content.startsWith(nativeMissionBinding)&&source!==existing))
    throw Error('A renamed mission binding is still present. Preserve and reconcile source modules in Logic / Events.');
  if(existing) {
    const old=await readNativeMissionModule(existing);previousCinematic=old.cinematic!==undefined&&old.cinematicIntro!==false;
    let original:string;
    try {
      if(old.schemaVersion!==1||!['manual','startup'].includes(old.activation)||!Array.isArray(old.missions))throw Error('Invalid binding');
      original=await nativeMissionModule(old.missions,old.activation,old.cinematic,old.cinematicIntro);
    } catch {throw Error('The existing mission binding cannot be regenerated safely. Preserve/export it before explicitly removing it from the build.');}
    if(existing.content!==original&&existing.content!==await nativeMissionModule(old.missions,old.activation,old.cinematic,old.cinematicIntro,true))
      throw Error('Mission source contains edits or uses a different generator. Preserve/export it before explicitly removing and regenerating it.');
  }
  const cinematicIntro=includeCinematic??previousCinematic;
  const cinematic=(cinematicIntro||missions.some(beat=>beat.cinematicCue!=null))?project.studio?.shots:undefined;
  if((includeCinematic??previousCinematic)&&!cinematic?.length)throw Error('Add camera shots or explicitly disable the mission intro before preparing again.');
  if(cinematic&&project.studio?.engineMachinima?.enabled)throw Error('Disable in-game recording in Machinima before preparing a story scene; both would own the game camera.');
  const module={filename:'gs_mission.hsc',content:await nativeMissionModule(missions,activation,cinematic,cinematicIntro)};
  const isMcc=doc.runtimeId==='mccSteam';
  if(module.content.length>(isMcc?1024*1024:256*1024))
    throw Error('Mission source exceeds the selected native target file budget. No text was truncated or replaced.');
  if(sources.length-(existing?1:0)+1+1+(isMcc?1:0)>(isMcc?16:8))
    throw Error('Mission exceeds the target script-file budget including generated logic/global source. Preserve all modules and reduce the selected build explicitly.');
  logic.handwrittenSources=[...sources.filter(source=>source!==existing),module];
  return {...project,quickForge:{...doc,logic}};
}

/** Actual H1 camera_set/cinematic_start syntax. Raw exports require existing markers; native preparation writes their positions/FOV separately. */
export function exportHaloCeCinematic(studio:CreatorStudioDocument,options:{prepared?:boolean;scriptName?:string;areaTrigger?:{volume:string|null}}={}): ScriptExport {
  const errors=validateCreatorStudio(studio);if(errors.length)throw new Error(errors.join('; '));
  if(!studio.shots.length)throw new Error('Add at least one cinematic shot.');
  const deps:string[]=[],lines=heading('Cinematic Director');
  if(options.prepared)validateNativeCinematic(studio.shots);
  const scriptName=ensureName(options.scriptName??'gs_cinematic','Cinematic script name');
  lines.push('(script static void '+scriptName,'  (cinematic_start)','  (camera_control true)','  (cinematic_show_letterbox true)');
  if(options.prepared)lines.push('  (player_enable_input false)');
  studio.shots.forEach((shot,i)=>{
    const ref=ensureName(shot.cameraMarker??undefined,`Shot ${i+1} cutscene camera point`);
    deps.push(`cutscene_camera_point:${ref}`);
    lines.push(`  ; ${i+1}: ${safeComment(shot.name)} | ${safeComment(shot.subtitle)}`);
    lines.push(`  ; Source camera XYZ=${shot.cameraPosition.join(',')} lookAt=${shot.lookAt.join(',')} FOV=${shot.fov} ${options.prepared?'(prepared native marker)':'(place marker in Sapien)'}`);
    lines.push(`  (camera_set ${ref} ${options.prepared&&(i===0||shot.easing==='cut')?0:ticks(shot.durationMs)})`);
    lines.push(`  (sleep ${ticks(shot.durationMs)})`);
  });
  lines.push('  (cinematic_show_letterbox false)','  (camera_control false)','  (cinematic_stop)');
  if(options.prepared)lines.push('  (player_enable_input true)');
  lines.push(')','');
  if(options.areaTrigger){
    const controller=ensureName(scriptName+'_start','Cinematic trigger script name (use a function name of at most25characters)');
    lines.push('; One area activation per map load; disabling preserves this native script identity.','(script startup '+controller);
    if(options.areaTrigger.volume!=null){const volume=ensureName(options.areaTrigger.volume,'Cinematic trigger area');deps.push('trigger_volume:'+volume);lines.push('  (sleep_until (> (list_count (players)) 0) 1)','  (sleep_until (volume_test_objects '+volume+' (players)) 1)','  ('+scriptName+')');}
    else lines.push('  (sleep_until false 15)');
    lines.push(')','');
  }
  return {filename:'gs_cinematic.hsc',content:lines.join('\r\n'),dependencies:deps,warnings:options.prepared?['Camera markers, position, orientation and FOV are prepared with the native mission. Subtitles remain rehearsal notes; native playback and camera restoration require game testing. Smooth uses the engine camera interpolation; cut snaps immediately.']:[
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


/** Original Spark source generator using the documented native Forerunner
 * contract. Native tags/AI/paths remain owned by the existing scenario editors. */
export interface NativeTransportCrew {
  group:string;seat:string;create?:boolean;releaseAtInsertion?:boolean;
  /** Suspend this controller’s deferred troop until its captured actor leaves the craft. */
  holdUntilInsertion?:boolean;
}
export interface NativeTransportOptions {
  /** NPC seat assignments, optionally released at first campaign insertion. */
  crew?:NativeTransportCrew[];
  faction:'unsc'|'covenant'; pilot:string; pilotSeat:string;
  outbound:string; inbound:string; hub:string; field:string;
  departureCue?:string; arrivalCue?:string;
  insertionCamera?:{marker:string;durationMs:number};
  departureCamera?:{marker:string;durationMs:number};
  /** Reuse the reviewed return/insertion routes for empty hub return and recall. */
  returnAfterInsertion?:boolean;
  /** Record an actual surviving rider leaving the first grounded insertion. */
  trackPlayerInsertion?:boolean;
  /** Explicit ownership of a not-initially-created native pilot. */
  createPilot?:boolean;
}
export const nativeTransportPrefix='; Spark native transport controller v1\n';
export function exportHaloCeTransport(options:NativeTransportOptions):ScriptExport {
  if(!options||Object.keys(options).some(key=>!['faction','pilot','pilotSeat','outbound','inbound','hub','field','departureCue','arrivalCue','returnAfterInsertion','trackPlayerInsertion','createPilot','insertionCamera','departureCamera','crew'].includes(key)))throw Error('Invalid transport configuration.');
  if(options.returnAfterInsertion!==undefined&&typeof options.returnAfterInsertion!=='boolean')throw Error('Choose whether the aircraft returns empty after insertion.');
  if(options.trackPlayerInsertion!==undefined&&(typeof options.trackPlayerInsertion!=='boolean'||options.trackPlayerInsertion&&!options.returnAfterInsertion))throw Error('Confirming passenger insertion requires the empty-return workflow.');
  if(options.createPilot!==undefined&&typeof options.createPilot!=='boolean')throw Error('Choose pilot creation ownership explicitly.');
  if(!['unsc','covenant'].includes(options.faction))throw Error('Choose UNSC Pelican or Covenant Spirit.');
  const pilot=ensureName(options.pilot,'Pilot encounter / squad',true);
  const outbound=ensureName(options.outbound,'Insertion command list'),inbound=ensureName(options.inbound,'Return command list');
  const hub=ensureName(options.hub,'Hub volume'),field=ensureName(options.field,'Landing volume');
  if(hub===field||outbound===inbound)throw Error('Use distinct hub/landing volumes and insertion/return command lists.');
  const seatLabel=(seat:unknown):seat is string=>typeof seat==='string'&&seat.length>0&&seat.length<=31&&/^[\x20-\x21\x23-\x5b\x5d-\x7e]+$/.test(seat)&&!!seat.trim();
  if(!seatLabel(options.pilotSeat))
    throw Error('Copy a real native pilot seat label (1–31 printable characters, without quotes or backslashes).');
  if(options.crew!=null&&(!Array.isArray(options.crew)||options.crew.length>8))throw Error('Review at most eight permanent native crew assignments.');
  const crew=options.crew??[],groups=[pilot.toLowerCase()],seats=[options.pilotSeat.toLowerCase()];
  for(const member of crew){
    if(!member||typeof member!=='object'||Array.isArray(member)||Object.keys(member).some(key=>!['group','seat','create','releaseAtInsertion','holdUntilInsertion'].includes(key))||!seatLabel(member.seat)||member.create!=null&&typeof member.create!=='boolean'||member.releaseAtInsertion!=null&&typeof member.releaseAtInsertion!=='boolean')throw Error('Crew needs a native group, exact seat label and explicit creation ownership.');
    if(member.holdUntilInsertion!=null&&(typeof member.holdUntilInsertion!=='boolean'||member.holdUntilInsertion&&(!member.create||!member.releaseAtInsertion)))throw Error('Holding a troop requires deferred crew owned by this controller and Disembark at first insertion.');
    const group=ensureName(member.group,'Crew encounter / squad',true).toLowerCase(),seat=member.seat.toLowerCase();
    if(groups.some(old=>old===group||old.startsWith(group+'/')||group.startsWith(old+'/'))||seats.includes(seat))throw Error('Pilot and crew need separate, nonoverlapping native groups and unique seats.');
    groups.push(group);seats.push(seat);
  }
  const cues=[options.departureCue,options.arrivalCue].map((cue,index)=>cue?ensureName(cue,index?'Arrival camera/dialogue function':'Departure camera/dialogue function'):null);
  const role=options.faction==='unsc'?'pelican':'spirit',craft='extraction_'+role,stem='gs_'+role;
  const relativeCamera=(camera:NativeTransportOptions['insertionCamera'])=>{
    if(camera==null)return [];
    if(typeof camera!=='object'||Array.isArray(camera)||Object.keys(camera).some(key=>!['marker','durationMs'].includes(key))||!Number.isInteger(camera.durationMs)||camera.durationMs<100||camera.durationMs>30000)throw Error('Relative transport camera needs a native marker and a 100–30000 ms duration.');
    const marker=ensureName(camera.marker,'Relative transport camera point');
    return ['  ; Shared aircraft-relative camera; does not grant a private squad view.','  (cinematic_start)','  (player_enable_input false)','  (camera_control true)',
      '  (camera_set_relative '+marker+' 0 (unit '+craft+'))','  (sleep '+ticks(camera.durationMs)+')','  (camera_control false)','  (player_enable_input true)','  (cinematic_stop)'];
  };
  const insertionCamera=relativeCamera(options.insertionCamera),departureCamera=relativeCamera(options.departureCamera);
  const troops=crew.flatMap((member,index)=>member.releaseAtInsertion?[{...member,index}]:[]),started=stem+'_insertion_started',delivered=stem+'_insertion_complete',troopUnit=stem+'_troop_unit',riders=stem+'_troop_riders',aboard=stem+'_troop_aboard';
  const troopHandle=(index:number)=>stem+'_troop_'+index;
  const riderTests=Array.from({length:32},(_,index)=>'(= '+troopUnit+' (unit (list_get '+riders+' '+index+')))');
  const riderChunks=Array.from({length:4},(_,index)=>'(or '+riderTests.slice(index*8,index*8+8).join(' ')+')');
  const troopGlobals=troops.length?['(global boolean '+started+' false)','(global boolean '+delivered+' false)','(global unit '+troopUnit+' none)','(global object_list '+riders+' (list_get (players) 32767))',...troops.map(member=>'(global unit '+troopHandle(member.index)+' none)'),
    '(script static boolean '+aboard,'  (set '+riders+' (vehicle_riders (unit '+craft+')))','  (and (!= '+troopUnit+' none) (or '+riderChunks.join(' ')+'))',')','']:[];
  const releaseTroops=troops.length?['  ; First campaign insertion: release only the captured NPC units, never players.','  (if (not '+delivered+') (begin',...troops.flatMap(member=>[
    '    (set '+troopUnit+' '+troopHandle(member.index)+')','    (if (and (!= '+troopUnit+' none) (> (unit_get_health '+troopUnit+') 0) ('+aboard+')) (unit_exit_vehicle '+troopUnit+'))',
    '    (sleep_until (begin','      (set '+troopUnit+' '+troopHandle(member.index)+')','      (or (= '+troopUnit+' none) (<= (unit_get_health '+troopUnit+') 0) (not ('+aboard+')))','    ) 1)',
    ...(member.holdUntilInsertion?[
      '    (if (and (!= '+troopUnit+' none) (> (unit_get_health '+troopUnit+') 0) (= (ai_living_count '+member.group+') 1)',
      '        (= '+troopUnit+' (unit (list_get (ai_actors '+member.group+') 0))))',
      '      (ai_braindead '+member.group+' false))',
    ]:[]),
  ]),'    (set '+delivered+' true)','  ))']:[];
  const health='(> (unit_get_health (unit '+craft+')) 0)';
  // Keep the named vehicle typed as a vehicle: an explicit unit cast compiles in CE
  // but the engine correctly rejects that downcast when validating seat checks.
  const pilotSeated='(vehicle_test_seat_list '+craft+' "'+options.pilotSeat+'" (ai_actors '+pilot+'))';
  const landed='(> (device_group_get '+craft+'_landed) 0.5)';
  const crewSeated=crew.map((member,index)=>{const seated='(and (= (ai_living_count '+member.group+') 1) (vehicle_test_seat_list '+craft+' "'+member.seat+'" (ai_actors '+member.group+')))';return member.releaseAtInsertion?'(or '+started+' (and '+seated+' (= '+troopHandle(index)+' (unit (list_get (ai_actors '+member.group+') 0)))))':seated;});
  const pad=(name:string)=>'(and '+health+' (= (ai_living_count '+pilot+') 1) '+pilotSeated+(crewSeated.length?' '+crewSeated.join(' '):'')+' (volume_test_object '+name+' '+craft+') '+landed+')';
  const empty='(= (list_count (vehicle_riders (unit '+craft+'))) '+(1+crew.filter(member=>!member.releaseAtInsertion).length)+')';
  const playerArrival=stem+'_player_arrived',arrivalRiders=stem+'_arrival_riders',arrivalPlayers=stem+'_arrival_players';
  const arrivalIndex=stem+'_arrival_index',arrivalUnit=stem+'_arrival_unit';
  const riderMatches=Array.from({length:32},(_,i)=>'(= '+arrivalUnit+' (unit (list_get '+arrivalRiders+' '+i+')))');
  const knownRider='(or '+Array.from({length:4},(_,i)=>'(or '+riderMatches.slice(i*8,i*8+8).join(' ')+')').join(' ')+')';
  const arrivalGlobals=options.trackPlayerInsertion?[
    '(global boolean '+playerArrival+' false)',
    '(global object_list '+arrivalRiders+' (list_get (players) 32767))',
    '(global object_list '+arrivalPlayers+' (list_get (players) 32767))',
    '(global short '+arrivalIndex+' 0)','(global unit '+arrivalUnit+' none)',
  ]:[];
  const confirmArrival=options.trackPlayerInsertion?[
    '  (if (not '+playerArrival+') (begin',
    '    (set '+arrivalPlayers+' (players))', '    (set '+arrivalIndex+' 0)',
    '    (sleep_until (begin',
    '      (set '+arrivalUnit+' (unit (list_get '+arrivalPlayers+' '+arrivalIndex+')))',
    '      (if (and '+pad(field)+' (!= '+arrivalUnit+' none) (> (unit_get_health '+arrivalUnit+') 0)',
    '          (volume_test_object '+field+' '+arrivalUnit+') '+knownRider+') (set '+playerArrival+' true))',
    '      (set '+arrivalIndex+' (+ '+arrivalIndex+' 1))',
    '      (or '+playerArrival+' (not '+pad(field)+') (>= '+arrivalIndex+' (list_count '+arrivalPlayers+')))',
    '    ) 1)',
    '    (set '+arrivalPlayers+' (list_get (players) 32767))',
    '    (set '+arrivalRiders+' (list_get (players) 32767))',
    '    (set '+arrivalUnit+' none)',
    '  ))',
  ]:[];
  const enter=(enabled:boolean)=>'  (unit_set_enterable_by_player (unit '+craft+') '+enabled+')';
  const lines=[nativeTransportPrefix.trimEnd(),'; configuration: '+JSON.stringify(options),...heading('Native '+role+' insertion and evacuation'),
    '; Forerunner only: requires actual native ground contact and durable crew callback.',
    '; No player force-boarding, loot grant, banking, teleport or raid timer.',
    '(global boolean '+stem+'_ready false)',
    '(global boolean '+stem+'_settled false)',...troopGlobals,...arrivalGlobals,
    '(script startup '+stem+'_pilot',
    ...(options.createPilot?['  ; Reviewed deferred pilot; existing source must not also own its creation.','  (if (= (ai_living_count '+pilot+') 0) (ai_place '+pilot+'))']:[]),
    '  (sleep_until (and '+health+' (= (ai_living_count '+pilot+') 1)) 1)',
    '  (vehicle_load_magic (unit '+craft+') "'+options.pilotSeat+'" (ai_actors '+pilot+'))',
    '  (sleep_until '+pilotSeated+' 1)',
    ...crew.flatMap((member,index)=>[
      ...(member.create?['  ; Explicit deferred NPC crew ownership; no erase or replacement.','  (if (= (ai_living_count '+member.group+') 0) (ai_place '+member.group+'))']:[]),
      '  (sleep_until (and '+health+' (= (ai_living_count '+member.group+') 1)) 1)',
      ...(member.holdUntilInsertion?['  (ai_braindead '+member.group+' true)']:[]),
      '  (vehicle_load_magic (unit '+craft+') "'+member.seat+'" (ai_actors '+member.group+'))',
      '  (sleep_until (and (= (ai_living_count '+member.group+') 1) (vehicle_test_seat_list '+craft+' "'+member.seat+'" (ai_actors '+member.group+'))) 1)',
      ...(member.releaseAtInsertion?['  (set '+troopHandle(index)+' (unit (list_get (ai_actors '+member.group+') 0)))']:[]),
    ]),
    '  (set '+stem+'_ready true)',')','',
    '(script continuous forerunner_'+role+'_complete',
    '  (sleep -1)',
    '  (set '+stem+'_settled true)',')','',
    '(script continuous '+stem+'_trip',
    '  (sleep_until (and '+stem+'_ready '+pad(hub)+') 1)',
    enter(true),
    '  (sleep_until (and '+pad(hub)+' (> (device_group_get '+craft+'_boarded) 0.5)) 1)',
    enter(false),
    '  (set '+stem+'_settled false)',
    ...(troops.length?['  (set '+started+' true)']:[]),
    ...(cues[0]?['  ('+cues[0]+')']:[]),
    '  (ai_command_list '+pilot+' '+outbound+')',
    ...insertionCamera,
    '  (sleep_until '+pad(field)+' 1)',
    ...(options.trackPlayerInsertion?['  (if (not '+playerArrival+') (set '+arrivalRiders+' (vehicle_riders (unit '+craft+'))))']:[]),
    ...releaseTroops,
    ...(cues[1]?['  ('+cues[1]+')']:[]),
    enter(true),
    ...(options.returnAfterInsertion?[
      '  ; Empty return: every passenger disembarks normally before this flight.',
      '  (sleep_until (and '+pad(field)+' '+empty+') 1)',
      ...confirmArrival,
      enter(false),
      ...(cues[0]?['  ('+cues[0]+')']:[]),
      '  (ai_command_list '+pilot+' '+inbound+')',
      '  (sleep_until '+pad(hub)+' 1)',
      '  ; Keep the empty ship closed while the deployed field crew requests pickup.',
      '  (sleep_until (and '+pad(hub)+' (> (device_group_get '+craft+'_called) 0.5) '+empty+') 1)',
      '  (ai_command_list '+pilot+' '+outbound+')',
      '  (sleep_until '+pad(field)+' 1)',
      ...(cues[1]?['  ('+cues[1]+')']:[]),
      enter(true),
    ]:[]),
    '  (sleep_until (and '+pad(field)+' (> (device_group_get '+craft+'_called) 0.5) (> (device_group_get '+craft+'_boarded) 0.5)) 1)',
    enter(false),
    ...(cues[0]?['  ('+cues[0]+')']:[]),
    ...(options.returnAfterInsertion?['  (set '+stem+'_settled false)']:[]),
    '  (ai_command_list '+pilot+' '+inbound+')',
    ...departureCamera,
    '  (sleep_until '+pad(hub)+' 1)',
    ...(cues[1]?['  ('+cues[1]+')']:[]),
    '  (sleep_until (and '+pad(hub)+' '+stem+'_settled) 1)',
    enter(true),
    '  (sleep_until (and '+pad(hub)+' '+empty+') 1)',
    ')',''];
  return {filename:stem+'_transport.hsc',content:lines.join('\n'),generatedOnly:true,scenarioType:'singleplayer',
    dependencies:['native_vehicle:'+craft,'ai_encounter:'+pilot,'command_list:'+outbound,'command_list:'+inbound,
      ...crew.map(member=>'ai_encounter:'+member.group),'trigger_volume:'+hub,'trigger_volume:'+field,...['_boarded','_called','_landed'].map(suffix=>'device_group:'+craft+suffix),
      ...cues.filter((cue):cue is string=>!!cue).map(cue=>'script:'+cue),...[options.insertionCamera,options.departureCamera].filter(camera=>!!camera).map(camera=>'cutscene_camera_point:'+camera!.marker)],
    warnings:['Forerunner native transport groups and crew callbacks are required. Legacy engines do not drive these outputs.',
      ...(crew.length?[troops.length?'NPC assignments use dedicated source groups and compatible seats. First insertion releases only captured troops after landing; permanent crew remains seated. Empty return counts pilot plus permanent crew. Missing/dead delivered troops still fail the mission survivor minimum. This is one shared campaign delivery, not repeatable squad insertion, automatic casualty recovery or proven gameplay.':'Permanent NPC crew uses dedicated source groups and compatible non-driver seats. Startup waits for exactly one actor in each group, seats only those AI and never erases/recreates a lost crew member. Arrival/departure requires those actors in their assigned seats; empty return counts pilot plus crew, not player passengers. Source creation ownership, animations, seats, casualty recovery and real flight remain independent game acceptance.']:[]),
      'The scenario or explicitly reviewed pilot creation must provide exactly one living pilot in the selected encounter/squad, its exact seat label and reachable native flight routes. Arrival requires both the matching pad volume and actual landing; a stalled/destroyed craft or pilot keeps the controller waiting.',
      'Players board and disembark normally. Gear, faction assignment, deployment, extraction activation, rewards and banking remain Forerunner-owned. At return the craft stays closed until the real crew-settlement callback; it is not replaced or destroyed.',
      'Optional relative camera coordinates are offsets in the craft frame, not world positions. These shared cinematics affect all viewers and temporarily control input; source points and restoration need game testing. Optional camera/dialogue functions must exist and return control, ending any cinematic before settlement. Compile/readback, flight, clearance, callbacks, repeat trips and multiplayer require independent acceptance.']};
}

export function readNativeTransportSource(content:string):NativeTransportOptions {
  if(!content.startsWith(nativeTransportPrefix))throw Error('Existing module is not generated transport source; use Edit selected module to retain its handwritten logic.');
  const row=content.split('\n')[1];if(!row?.startsWith('; configuration: '))throw Error('Transport configuration is missing; use the existing module editor.');
  const options=JSON.parse(row.slice('; configuration: '.length)) as NativeTransportOptions;
  const expected=exportHaloCeTransport(options).content;
  // Recognize the exact previous generated template for an explicit reviewed upgrade.
  // Never rewrite stored source merely by opening it, or accept unrelated hand edits.
  const legacy=expected.replace(/\(vehicle_test_seat_list (extraction_(?:pelican|spirit)) /g,'(vehicle_test_seat_list (unit $1) ');
  if(expected!==content&&legacy!==content)throw Error('Existing transport source was edited. Use Edit selected module; automatic regeneration would discard those edits.');
  return options;
}
