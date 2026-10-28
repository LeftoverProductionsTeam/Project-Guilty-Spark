/** Halo CE/H1 script-source exporters (NOT a compiler or in-game runtime bridge).
 *  Functions and types cross-checked against c20 Halo 1 HaloScript reference and
 *  real CE campaign .hsc syntax. Compiling .hsc requires scenario references and
 *  Sapien/HEK; no existing Halo files are touched. Names are strictly allowlisted
 *  and never evaluated as arbitrary HaloScript by this application.
 */
import type { CreatorStudioDocument } from './creatorStudio';
import { validateCreatorStudio } from './creatorStudio.ts';
import type { FirefightConfig } from './firefight';
export interface ScriptExport { filename: string; content: string; dependencies: string[]; warnings: string[]; activation?: string; generatedOnly: true }
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
/** Plain JSON contract for creator tool integration. No secrets or local source paths. */
export function scriptManifest(out:ScriptExport):string {
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-h1-script-source',file:out.filename,
    status:'exportedNotCompiled',gameplayVerified:false,activation:out.activation ?? null,dependencies:out.dependencies,warnings:out.warnings},null,2);
}
