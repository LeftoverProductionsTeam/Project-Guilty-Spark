/** Halo CE/H1 script-source exporters (NOT a compiler or in-game runtime bridge).
 *  Functions and types cross-checked against c20 Halo 1 HaloScript reference and
 *  real CE campaign .hsc syntax. Compiling .hsc requires scenario references and
 *  Sapien/HEK; no existing Halo files are touched. Names are strictly allowlisted
 *  and never evaluated as arbitrary HaloScript by this application.
 */
import type { CreatorStudioDocument } from './creatorStudio';
import { validateCreatorStudio } from './creatorStudio.ts';
import { defaultNativePlayerProfile, type FirefightConfig, type NativeEncounterCandidate, type FirefightCatalog } from './firefight';
import type { Project } from './types';
import type { NativeOperation } from './nativeOperations';
export interface ScriptExport { filename: string; content: string; dependencies: string[]; warnings: string[]; activation?: string; scenarioType?: 'singleplayer'; generatedOnly: true; sourceBinding?:{schemaVersion:1;rules:FirefightConfig;sourceSha256:string;encounters:string[][];groups:{name:string;actorVariantPath:string;count:number}[];activation:'manual'|'startup';loadout:'scenario'} }
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
export function exportHaloCeMission(studio:CreatorStudioDocument): ScriptExport {
  const errors=validateCreatorStudio(studio);if(errors.length)throw new Error(errors.join('; '));
  if(!studio.missions.length)throw new Error('Add at least one mission beat.');
  const deps:string[]=[], lines=heading('Mission Director');
  const globals:string[]=[];
  const manualSetters:string[]=[];
  const scripted:string[]=['(script dormant gs_mission', '  (sleep 1)'];
  studio.missions.forEach((beat,i)=>{
    scripted.push(`  ; ${i+1}: ${safeComment(beat.title)} | ${safeComment(beat.objective)}`);
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
        const ref=ensureName(beat.triggerRef,`Beat ${i+1} trigger volume`);
        deps.push(`trigger_volume:${ref}`);
        scripted.push(`  (sleep_until (volume_test_objects ${ref} (players)) 15)`);break;
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
    scripted.push('  (print "gs objective complete")');
  });
  scripted.push(')', '');
  lines.push(...globals, '', ...manualSetters, ...scripted);
  return {filename:'gs_mission.hsc',content:lines.join('\r\n'),dependencies:deps,activation:'(wake gs_mission)',warnings:[
    'Mission is a dormant script. Explicitly call (wake gs_mission) from a reviewed scenario startup script.',
    'Manual beats stop progression until another script or trigger calls their generated gs_complete_N function.',
    'Mission source requires hand-authored scenario trigger volumes, encounters, objectives, AI navigation, BSP and tag assets.',
    'HUD objective text, checkpoints and scripting compile/gameplay remain unverified.',
  ],generatedOnly:true};
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
  const player=binding?undefined:config.nativePlayerProfile;
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
  const owned=(group:{slot:string})=>`gs_ff_units_${group.slot}`;
  const clean=(group:{slot:string})=>`gs_ff_clean_${group.slot}`;
  const lines=heading('Firefight native round candidate · solo encounter controller');
  lines.push('; State: 0 idle, 1 preparing, 2 active, 3 intermission, 4 complete, 5 refused/defeated.',
    '; Score is team wave-clear points, not player kill attribution or a native HUD/medal implementation.',
    '(global boolean gs_ff_start false)','(global short gs_ff_state 0)','(global short gs_ff_round 0)',
    '(global short gs_ff_wave 0)','(global long gs_ff_score 0)','(global long gs_ff_cleared 0)','(global unit gs_ff_player none)','');
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
  lines.push('  (set gs_ff_score 0)','  (set gs_ff_cleared 0)','  (set gs_ff_round 0)','  (set gs_ff_wave 0)',')','');
  waves.forEach((wave,w)=>{
    const counts=wave.groups.map(g=>`(ai_living_count ${g.ref})`), living=counts.length===1?counts[0]:`(+ ${counts.join(' ')})`;
    lines.push(`(script static void gs_wave_${String(w+1).padStart(2,'0')}`, '  (if (!= gs_ff_state 5) (begin',
      '    (set gs_ff_state 2)',`    (set gs_ff_wave ${w+1})`);
    for(const group of wave.groups)lines.push(`    (ai_place ${group.ref})`,
      `    (set ${owned(group)} (ai_actors ${group.ref}))`,`    (ai_force_active ${group.ref} true)`);
    const exact=wave.groups.map(g=>`(= (ai_living_count ${g.ref}) ${g.count})`), ready=exact.length===1?exact[0]:`(and ${exact.join(' ')})`;
    lines.push(`    (sleep_until ${ready} 1 ${ticks(config.spawnTimeoutMs)})`,
      `    (if (not ${ready}) (set gs_ff_state 5))`,
      '    (if (!= gs_ff_state 5) (begin',
      `      (sleep_until (or (= ${living} 0) (<= (unit_get_health gs_ff_player) 0)) 1 ${ticks(config.stuckTimeoutMs)})`,
      `      (if (and (= ${living} 0) (> (unit_get_health gs_ff_player) 0))`,
      '        (begin',`          (set gs_ff_score (+ gs_ff_score ${wave.score}))`,
      `          (set gs_ff_cleared (+ gs_ff_cleared ${wave.count}))`,
      '          (set gs_ff_state 3)',
      '        )','        (set gs_ff_state 5)', '      )','    ))',
      '    (if (= gs_ff_state 3) (sleep 60))');
    for(const group of wave.groups)lines.push(`    (${clean(group)})`);
    lines.push('  ))',')','');
  });
  lines.push('(script continuous gs_firefight','  (sleep_until gs_ff_start 1)','  (set gs_ff_start false)',
    '  (gs_ff_reset)','  (set gs_ff_state 1)',
    `  (sleep_until (> (unit_get_health (unit (list_get (players) 0))) 0) 1 ${ticks(config.spawnTimeoutMs)})`,
    '  (set gs_ff_player (unit (list_get (players) 0)))',
    '  (if (<= (unit_get_health gs_ff_player) 0) (set gs_ff_state 5))');
  if(player)lines.push('  (if (!= gs_ff_state 5) (player_add_equipment gs_ff_player gs_firefight_start true))');
  lines.push(`  (sleep ${ticks(config.preparationMs+config.countdownMs)})`);
  for(let r=0;r<config.rounds;r++){
    lines.push(`  (set gs_ff_round ${r+1})`);
    for(let w=0;w<waves.length;w++)lines.push(`  (gs_wave_${String(w+1).padStart(2,'0')})`,
      `  (if (!= gs_ff_state 5) (sleep ${ticks(config.intermissionMs)}))`);
  }
  lines.push('  (if (!= gs_ff_state 5) (set gs_ff_state 4))');
  lines.push(')','');
  const sourceBinding=binding?{schemaVersion:1 as const,rules:config,sourceSha256:binding.sourceSha256.toLowerCase(),encounters:references,groups:config.waves.flatMap((wave,w)=>wave.groups.map((group,g)=>({name:references[w][g],actorVariantPath:config.enemies.find(enemy=>enemy.id===group.enemyId)!.actorVariantPath,count:group.count}))),activation:binding.activation,loadout:'scenario' as const}:undefined;
  const content=(sourceBinding?'; Spark source encounter bindings: '+JSON.stringify(sourceBinding)+'\r\n':'')+lines.join('\r\n')+(binding?.activation==='startup'?nativeRoundBootstrap:'');
  return {...conservative,...(sourceBinding?{sourceBinding}:{}),content,activation:'(set gs_ff_start true)',scenarioType:'singleplayer',dependencies:[...conservative.dependencies,...(player?['starting_profile:gs_firefight_start',...Array.from(new Set([player.primaryWeapon,player.secondaryWeapon].filter((path):path is string=>!!path))).map(path=>'weapon:'+path)]:[])],warnings:[
    ...(binding?['Bound encounters come from the exact source cache inventory. Their ownership, navigation and gameplay still require review; original scripts may also manipulate them.','Keep this scenario’s existing player equipment. No generated starting profile or weapon override is applied.','Activation: '+(binding.activation==='startup'?'an explicit gs_ff_bootstrap startup script is included.':'manual; a reviewed scenario script must set gs_ff_start true.')]:[]),
    ...(player?['Create gs_firefight_start as a standard scenario player starting profile using the exported player-loadout authoring metadata; include its exact weapon dependencies.']:[]),
    'Experimental native solo round source. Build only into a separate reviewed singleplayer/campaign scenario with these exact encounters/counts and safe spawn/navigation data.',
    'Start or request another round with (set gs_ff_start true). The continuous controller resets only its own encounters and score, then waits for actual living counts to reach zero.',
    'Missing/partial spawns, a dead player or the authored wave deadline refuse progression. No phantom success, forced kills or invulnerability is generated.',
    'Wave-clear points are a script global, not per-player kill credit, medals or a Halo HUD. External scripts must not erase or respawn these owned encounters during a round.',
    'Each cleared wave allows two seconds for native death animation, then removes only its captured units/corpses before the authored intermission. Defeat and partial-spawn refusal also clean owned units. Encounters must be not initially created and exclusively owned by this controller.',
    'Solo only. Team lives, revives, supplies, difficulty scaling, infection and multiplayer AI are separate gates. Native compilation is not human gameplay acceptance.',
  ]};
}
/** Planned source specifications, never a decoded native inventory. The caller
 * must review and build this controller with the exact append operation in the
 * atomic source build; ordinary script attachment cannot create encounters. */
export function exportPlannedFirefightRound(operation:Extract<NativeOperation,{kind:'appendEncounters'}>,activation:'manual'|'startup',retainBootstrap=false):ScriptExport {
  const config=operation.sourceRules;
  if(!config?.sourceSha256||!operation.encounters.length||operation.encounters.length>16)throw Error('Review a source-bound native group plan first.');
  const groups=config.waves.flatMap(wave=>wave.groups);
  if(groups.length!==operation.encounters.length||groups.some((group,index)=>group.count!==(operation.encounters[index].count??1)||operation.encounters[index].startActive||config.enemies.find(enemy=>enemy.id===group.enemyId)?.actorVariantPath.replaceAll('\\','/').toLowerCase()!==operation.encounters[index].actorPath.replaceAll('\\','/').toLowerCase()))throw Error('Planned native groups differ from their saved rule actors/counts/inactive state.');
  let index=0;
  const names=config.waves.map(wave=>wave.groups.map(()=>operation.encounters[index++].name));
  const output=exportHaloCeFirefightRound(config,{sourceSha256:config.sourceSha256,sourceScenarioType:0,encounterNames:names,
    encounters:operation.encounters.map(entry=>({name:entry.name,actorVariantPaths:[entry.actorPath],normalCount:entry.count??1,insaneCount:entry.count??1,startingLocations:entry.count??1,notInitiallyCreated:!entry.startActive,issue:null})),
    activation,exclusiveOwnershipConfirmed:true});
  // Keep the owned startup signature when disabling automatic activation.
  // It becomes a no-op; original native signature preservation stays enabled.
  const content=output.content+(retainBootstrap&&activation==='manual'?'\r\n(script startup gs_ff_bootstrap\r\n  (sleep 1)\r\n)\r\n':'');
  return {...output,content,warnings:['Planned source is not native readback. Build the exact groups and reviewed controller through the atomic source path; recorded native group changes require exact generated-field ownership and stable names/indices.',...output.warnings]};
}

/** Plain JSON contract for creator tool integration. No secrets or local source paths. */
export function scriptManifest(out:ScriptExport):string {
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-h1-script-source',file:out.filename,
    status:'exportedNotCompiled',gameplayVerified:false,scenarioType:out.scenarioType??null,activation:out.activation ?? null,dependencies:out.dependencies,warnings:out.warnings,...(out.sourceBinding?{sourceBinding:out.sourceBinding}:{})},null,2);
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
      throw Error('The round source contains manual edits. Preserve or rename it in Logic / Events before regenerating.');
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
