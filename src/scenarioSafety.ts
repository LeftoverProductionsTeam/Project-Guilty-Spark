/** Conservative legacy scenario failure checks. Inputs are editable project data,
 * not an authoritative substitute for Halo Tool/Sapien, tag_test, or network play.
 * See docs/LEGACY_SCENARIO_FAILURES.md for sources and limits.
 */
import type { QuickForgeDocument } from './forge';
import type { FirefightConfig } from './firefight';
import type { MapInspection } from './types';
export type ScenarioRisk = { severity:'error'|'warning'|'info'; code:string; message:string; ids:string[] };
export function inspectScenarioRisks(doc:QuickForgeDocument, firefight?:FirefightConfig|null, map?:MapInspection|null):ScenarioRisk[] {
  const risks:ScenarioRisk[]=[];
  const warn=(severity:ScenarioRisk['severity'],code:string,message:string,ids:string[]=[])=>risks.push({severity,code,message,ids});
  const sourceForPath=new Map<string,string>();
  for(const p of doc.placements) {
    const path=`${p.tagClass}:${p.tagPath.trim().toLowerCase().replace(/\//g,'\\')}`;
    const origin=p.sourceSha256??'UNTRACKED';
    const existing=sourceForPath.get(path);
    if(existing && existing!==origin) warn('error','CONFLICTING_TAG_ORIGINS',
      `The same tag class/path ${p.tagPath} has conflicting source identities; don't silently substitute either asset.`,[p.id]);
    else sourceForPath.set(path,origin);
    if(!p.sourceSha256 || !p.sourceProjectId) warn('warning','UNVERIFIED_TAG_ORIGIN',
      `Placement ${p.name||p.id} needs a verified source map and its full dependency tree before building.`,[p.id]);
    if(p.tagClass==='bipd' && !['firefight','zombie'].includes(doc.gameMode))
      warn('warning','UNSYNCED_MULTIPLAYER_AI', 'Placing a biped in multiplayer does not synchronize AI across clients.',[p.id]);
  }
  for(let i=0;i<doc.spawns.length;i++)for(let j=i+1;j<doc.spawns.length;j++){
    const a=doc.spawns[i],b=doc.spawns[j];
    const overlapMode=!a.gameModes?.length || !b.gameModes?.length || a.gameModes.some(mode=>b.gameModes.includes(mode));
    if(!overlapMode) continue;
    const delta=Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1],a.position[2]-b.position[2]);
    if(delta<0.05) warn('error','DUPLICATE_SPAWN_POSITION',
      `Player starts ${a.name||a.id} and ${b.name||b.id} occupy the same spot; separate them before compiling.`,[a.id,b.id]);
    else if(delta<1) warn('warning','CROWDED_SPAWNS',
      'Player starts are less than one world unit apart. Check clearances and game-type availability in Sapien/tag_test.',[a.id,b.id]);
  }
  if(firefight){
    for(const wave of firefight.waves){
      const requested=wave.groups.reduce((sum,g)=>sum+g.count,0);
      if(requested>firefight.maxTotalPerWave) warn('error','WAVE_EXCEEDS_CONFIGURED_BUDGET',
        `Wave '${wave.name}' requests ${requested} AI, exceeding its own configured ${firefight.maxTotalPerWave} limit.`);
      if(requested>firefight.maxAlive) warn('warning','WAVE_CONCURRENCY_PRESSURE',
        `Wave '${wave.name}' has ${requested} requested AI, above the configured ${firefight.maxAlive} simultaneous-AI cap; actual pacing needs engine verification.`);
    }
    if(['zombie','firefight'].includes(doc.gameMode) && !firefight.spawnZones.some(z=>z.enabled))
      warn('warning','NO_ENABLED_AI_SPAWN_ZONE','No enabled AI spawn zone; real encounter placement remains required.');
  }
  for(const resource of (map?.resources??[])) if(resource.required && !resource.found)
    warn('warning','MISSING_EXTERNAL_RESOURCE',`Imported cache declares missing resource '${resource.name}'; ${resource.reason||'inspect your local resource map'}.`);
  if(doc.geometry.some(b=>b.kind==='caveTunnel')) warn('info','CAVE_BSP_REBUILD_REQUIRED',
    'Cave-to-room CSG, exact collision BSP, portals/PVS and lightmaps require real Tool structure and gameplay validation.');
  return risks.slice(0,500);
}
