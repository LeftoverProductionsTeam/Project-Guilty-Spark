/** Halo CE/H1 script-source exporters (NOT a compiler or in-game runtime bridge).
 *  Functions and types cross-checked against c20 Halo 1 HaloScript reference and
 *  real CE campaign .hsc syntax. Compiling .hsc requires scenario references and
 *  Sapien/HEK; no existing Halo files are touched. Names are strictly allowlisted
 *  and never evaluated as arbitrary HaloScript by this application.
 */
import type { CreatorStudioDocument } from './creatorStudio';
import { validateCreatorStudio } from './creatorStudio.ts';
import type { FirefightConfig } from './firefight';
export interface ScriptExport { filename: string; content: string; dependencies: string[]; warnings: string[]; activation?: string; scenarioType?: 'singleplayer'; generatedOnly: true }
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
export function exportHaloCeFirefight(config:FirefightConfig):ScriptExport {
  if(config.schemaVersion!==1 || !Array.isArray(config.waves) || !config.waves.length || config.waves.length>32 ||
    !Array.isArray(config.enemies) || !Number.isInteger(config.rounds) || config.rounds<1 || config.rounds>32 || config.endless)
    throw new Error('Finite waves (1-32), valid enemies and 1-32 rounds are required for the conservative CE exporter. Endless is unsupported.');
  if(!Number.isInteger(config.maxAlive) || config.maxAlive<1 || config.maxAlive>32 || !Number.isInteger(config.intermissionMs) || config.intermissionMs<0 || config.intermissionMs>600000)
    throw new Error('Invalid max-alive/intermission configuration for HaloScript.');
  const enemyIds=new Set(config.enemies.map(e=>e.id));
  const deps:string[]=[],lines=heading('Firefight · authored AI encounters (single-player preview only)');
  for(let i=0;i<config.waves.length;i++) {
    const wave=config.waves[i], total=wave.groups.reduce((sum,g)=>sum+g.count,0);
    if(!wave.groups.length || wave.groups.length>8 || total<1 || total>config.maxAlive)
      throw new Error(`Wave ${i+1} must have 1-8 groups and 1-${config.maxAlive} starting actors. Split larger waves into encounter steps.`);
    const encounters=wave.groups.map((g,j)=>{
      if(!enemyIds.has(g.enemyId)||!Number.isInteger(g.count)||g.count<1||g.count>32)
        throw new Error(`Wave ${i+1} group ${j+1} has an invalid enemy reference/count.`);
      const ref=`gs_w${String(i+1).padStart(2,'0')}_g${String(j+1).padStart(2,'0')}`;
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
export function exportHaloCeFirefightRound(config:FirefightConfig):ScriptExport {
  const conservative=exportHaloCeFirefight(config);
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
      return {ref:`gs_w${String(w+1).padStart(2,'0')}_g${String(g+1).padStart(2,'0')}`,count:group.count,
        points:Math.floor(group.count*points*wave.scoreMultiplierMilli/1000)};
    });
    return {groups,count:groups.reduce((n,g)=>n+g.count,0),score:groups.reduce((n,g)=>n+g.points,0)};
  });
  if(waves.reduce((n,w)=>n+w.score,0)*config.rounds>2147483647)throw Error('Native round score exceeds Halo long range.');
  const owned=(ref:string)=>`gs_ff_units_${ref.slice(3)}`;
  const clean=(ref:string)=>`gs_ff_clean_${ref.slice(3)}`;
  const lines=heading('Firefight native round candidate · solo encounter controller');
  lines.push('; State: 0 idle, 1 preparing, 2 active, 3 intermission, 4 complete, 5 refused/defeated.',
    '; Score is team wave-clear points, not player kill attribution or a native HUD/medal implementation.',
    '(global boolean gs_ff_start false)','(global short gs_ff_state 0)','(global short gs_ff_round 0)',
    '(global short gs_ff_wave 0)','(global long gs_ff_score 0)','(global long gs_ff_cleared 0)','(global unit gs_ff_player none)','');
  for(const wave of waves)for(const group of wave.groups)
    lines.push(`(global object_list ${owned(group.ref)} (ai_actors ${group.ref}))`);
  lines.push('');
  for(const wave of waves)for(const group of wave.groups){
    lines.push(`(script static void ${clean(group.ref)}`,`  (ai_force_active ${group.ref} false)`);
    // Native ai_erase no longer owns a unit after its actor dies. Retain the
    // exact encounter's salted unit references before combat, then delete its
    // captured corpses too. Descending slots also tolerate list compaction.
    // The existing 32-actor/group bound keeps this finite without a shared loop
    // counter or arbitrary object-name/definition-wide deletion.
    for(let slot=group.count-1;slot>=0;slot--)
      lines.push(`  (object_destroy (list_get ${owned(group.ref)} ${slot}))`);
    lines.push(`  (ai_erase ${group.ref})`,`  (set ${owned(group.ref)} (ai_actors ${group.ref}))`,')','');
  }
  lines.push('(script static void gs_ff_reset');
  for(const wave of waves)for(const group of wave.groups)lines.push(`  (${clean(group.ref)})`);
  lines.push('  (set gs_ff_score 0)','  (set gs_ff_cleared 0)','  (set gs_ff_round 0)','  (set gs_ff_wave 0)',')','');
  waves.forEach((wave,w)=>{
    const counts=wave.groups.map(g=>`(ai_living_count ${g.ref})`), living=counts.length===1?counts[0]:`(+ ${counts.join(' ')})`;
    lines.push(`(script static void gs_wave_${String(w+1).padStart(2,'0')}`, '  (if (!= gs_ff_state 5) (begin',
      '    (set gs_ff_state 2)',`    (set gs_ff_wave ${w+1})`);
    for(const group of wave.groups)lines.push(`    (ai_place ${group.ref})`,
      `    (set ${owned(group.ref)} (ai_actors ${group.ref}))`,`    (ai_force_active ${group.ref} true)`);
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
    for(const group of wave.groups)lines.push(`    (${clean(group.ref)})`);
    lines.push('  ))',')','');
  });
  lines.push('(script continuous gs_firefight','  (sleep_until gs_ff_start 1)','  (set gs_ff_start false)',
    '  (gs_ff_reset)','  (set gs_ff_state 1)',
    `  (sleep_until (> (unit_get_health (unit (list_get (players) 0))) 0) 1 ${ticks(config.spawnTimeoutMs)})`,
    '  (set gs_ff_player (unit (list_get (players) 0)))',
    '  (if (<= (unit_get_health gs_ff_player) 0) (set gs_ff_state 5))',
    `  (sleep ${ticks(config.preparationMs+config.countdownMs)})`);
  for(let r=0;r<config.rounds;r++){
    lines.push(`  (set gs_ff_round ${r+1})`);
    for(let w=0;w<waves.length;w++)lines.push(`  (gs_wave_${String(w+1).padStart(2,'0')})`,
      `  (if (!= gs_ff_state 5) (sleep ${ticks(config.intermissionMs)}))`);
  }
  lines.push('  (if (!= gs_ff_state 5) (set gs_ff_state 4))');
  lines.push(')','');
  return {...conservative,content:lines.join('\r\n'),activation:'(set gs_ff_start true)',scenarioType:'singleplayer',warnings:[
    'Experimental native solo round source. Build only into a separate reviewed singleplayer/campaign scenario with these exact encounters/counts and safe spawn/navigation data.',
    'Start or request another round with (set gs_ff_start true). The continuous controller resets only its own encounters and score, then waits for actual living counts to reach zero.',
    'Missing/partial spawns, a dead player or the authored wave deadline refuse progression. No phantom success, forced kills or invulnerability is generated.',
    'Wave-clear points are a script global, not per-player kill credit, medals or a Halo HUD. External scripts must not erase or respawn these owned encounters during a round.',
    'Each cleared wave allows two seconds for native death animation, then removes only its captured units/corpses before the authored intermission. Defeat and partial-spawn refusal also clean owned units. Encounters must be not initially created and exclusively owned by this controller.',
    'Solo only. Team lives, revives, supplies, difficulty scaling, infection and multiplayer AI are separate gates. Native compilation is not human gameplay acceptance.',
  ]};
}
/** Plain JSON contract for creator tool integration. No secrets or local source paths. */
export function scriptManifest(out:ScriptExport):string {
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-h1-script-source',file:out.filename,
    status:'exportedNotCompiled',gameplayVerified:false,scenarioType:out.scenarioType??null,activation:out.activation ?? null,dependencies:out.dependencies,warnings:out.warnings},null,2);
}
