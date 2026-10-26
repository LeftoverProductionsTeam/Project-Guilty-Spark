/** Safe Halo 1 multiplayer planning with verifiable local-map evidence.
 * Native Halo gametypes are binary assets. Editing settings here NEVER writes
 * blam.lst, starts a server, publishes a map, or synchronizes AI.
 */
import type { CreatorStudioDocument, GameTypeDesign, ServerPlan } from './creatorStudio';
import type { RuntimeInventory } from './types';

export const HALO_CE_STOCK_VARIANTS = [
  'slayer', 'team slayer', 'ctf', 'assault', 'oddball', 'team oddball',
  'juggernaut', 'king', 'crazy king', 'race', 'team race',
  'classic_rockets', 'classic_snipers',
] as const;
export const HALO_CE_BASE_FAMILIES = ['slayer','ctf','oddball','king','race','juggernaut','assault'] as const;
export type BaseFamily = typeof HALO_CE_BASE_FAMILIES[number];
export type LocalMapProof = { map: string; sha256: string; cacheVersion: number; relativePath: string };
export type SessionFinding = { severity: 'blocker'|'warning'|'info'; code: string; message: string };
export type SessionReadiness = { verifiedMaps: LocalMapProof[]; findings: SessionFinding[]; canExportReviewConfig: boolean; readyForManualLocalTest: boolean };
const token = /^[A-Za-z0-9_-]{1,64}$/;
const safeGameName = /^[A-Za-z0-9_ -]{1,64}$/;
const validEvidence = (text:string) => typeof text==='string' && text.length<=180 && !/[\x00-\x1f\x7f<>]/.test(text);
const builtIn = new Set<string>(HALO_CE_STOCK_VARIANTS);
const lower = (s:string) => s.trim().toLowerCase();
export function stockVariant(name:string):boolean {return builtIn.has(lower(name));}

export function defaultGameTypeDesign(id:string, name='My custom Slayer', baseVariant:BaseFamily='slayer'):GameTypeDesign {
  return {id,name,baseVariant,teamPlay:false,scoreLimit:25,timeLimitMinutes:15,respawnSeconds:5,
    friendlyFire:false,startingEquipment:'mapDefault',specialRules:'standard',
    nativeStatus:'draft',nativeEvidence:'',notes:''};
}
export function gameTypeValidation(gameTypes:GameTypeDesign[]|undefined):string[] {
  if(gameTypes===undefined)return [];
  if(!Array.isArray(gameTypes)||gameTypes.length>64)return ['Game type collection exceeds 64 entries'];
  const ids=new Set<string>(), names=new Set<string>(), problems:string[]=[];
  for(const t of gameTypes) {
    if(!t||typeof t!=='object'){problems.push('Invalid game type record');continue;}
    if(typeof t.id!=='string'||!token.test(t.id)||ids.has(t.id))problems.push('Invalid or duplicate game type ID');
    else ids.add(t.id);
    if(typeof t.name!=='string'||!safeGameName.test(t.name)||!t.name.trim()||names.has(lower(t.name)))problems.push('Invalid or duplicate game type name');
    else names.add(lower(t.name));
    if(!HALO_CE_BASE_FAMILIES.includes(t.baseVariant)) problems.push(`Unknown base family for ${t.name}`);
    if(typeof t.teamPlay!=='boolean'||typeof t.friendlyFire!=='boolean')problems.push(`Invalid boolean game rules for ${t.name}`);
    if(!Number.isInteger(t.scoreLimit)||t.scoreLimit<0||t.scoreLimit>1000 || !Number.isInteger(t.timeLimitMinutes)||t.timeLimitMinutes<0||t.timeLimitMinutes>180 || !Number.isInteger(t.respawnSeconds)||t.respawnSeconds<0||t.respawnSeconds>120)
      problems.push(`Out-of-range score, time, or respawn for ${t.name}`);
    if(!['mapDefault','rockets','snipers','custom'].includes(t.startingEquipment)) problems.push(`Unsupported equipment intent for ${t.name}`);
    if(!['standard','infectionConcept','firefightConcept'].includes(t.specialRules))problems.push(`Unsupported special rule intent for ${t.name}`);
    if(!['draft','userConfirmedInGame'].includes(t.nativeStatus) || !validEvidence(t.nativeEvidence) || (typeof t.notes!=='string'||t.notes.length>1000||/[\x00-\x1f\x7f]/.test(t.notes)))problems.push(`Unsafe game type metadata for ${t.name}`);
    if(t.nativeStatus==='userConfirmedInGame' && (typeof t.nativeEvidence!=='string' || !t.nativeEvidence.trim()))problems.push(`Provide a non-secret local savegame reference for ${t.name} before confirming`);
  }
  return problems;
}
/** Return only supported, hashed, actual multiplayer caches; no filesystem writes. */
export function installedHaloCeMaps(inventory:RuntimeInventory|null|undefined):LocalMapProof[] {
  if(!inventory || inventory.runtimeId!=='haloCustomEdition')return [];
  const maps=new Map<string,LocalMapProof>();
  for(const entry of (Array.isArray(inventory.maps)?inventory.maps:[])){
    if(!entry || typeof entry.relativePath!=='string')continue;
    const path=entry.relativePath.replace(/\\/g,'/');
    const match=/^(?:maps\/)?([A-Za-z0-9_-]{1,64})\.map$/i.exec(path);
    if(!entry.valid||entry.scenarioType!==1||!match||!entry.sha256||!/^[a-f\d]{64}$/i.test(entry.sha256)||entry.cacheVersion!==609)continue;
    const name=match[1];
    if(!maps.has(lower(name)))maps.set(lower(name),{map:name,sha256:entry.sha256,cacheVersion:entry.cacheVersion,relativePath:path});
  }
  return [...maps.values()].sort((a,b)=>a.map.localeCompare(b.map));
}
/** Confirm intended rotation is possible to stage, NOT that actual gameplay works. */
export function analyzeHaloCeSession(server:ServerPlan,inventory:RuntimeInventory|null|undefined):SessionReadiness {
  const findings:SessionFinding[]=[];
  const add=(severity:SessionFinding['severity'],code:string,message:string)=>findings.push({severity,code,message});
  // Native IPC and imported project JSON are untrusted at the boundary.
  // Readiness must not contradict the stricter server-config exporter.
  if(!server || typeof server!=='object'){
    add('blocker','SERVER_INVALID','No valid server profile was supplied.');
    return {verifiedMaps:[],findings,canExportReviewConfig:false,readyForManualLocalTest:false};
  }
  if(typeof server.name!=='string'||!server.name.trim()||server.name.length>63||/[\x00-\x1f\x7f\"\\]/.test(server.name)||
      !Number.isInteger(server.maxPlayers)||server.maxPlayers<1||server.maxPlayers>16||typeof server.publicListing!=='boolean' ||
      !Array.isArray(server.rotation)||server.rotation.length>128)
    add('blocker','INVALID_SERVER_PROFILE','Server name, player count, visibility or rotation size is invalid.');
  if(!Array.isArray(server.rotation))return {verifiedMaps:[],findings,canExportReviewConfig:false,readyForManualLocalTest:false};
  const rotationIds=new Set<string>();
  for(const entry of server.rotation){
    if(!entry||typeof entry.id!=='string'||!token.test(entry.id)||rotationIds.has(entry.id))
      add('blocker','INVALID_ROTATION_ID','Rotation IDs must be unique safe tokens.');
    else rotationIds.add(entry.id);
  }
  const maps=installedHaloCeMaps(inventory), known=new Map(maps.map(m=>[lower(m.map),m]));
  const designs=new Map((Array.isArray(server.gameTypes)?server.gameTypes:[]).filter(t=>t&&typeof t.name==='string').map(t=>[lower(t.name),t]));
  if(server.runtime!=='haloCustomEdition')add('blocker','TARGET_UNSUPPORTED','The validated init.txt generator only supports stock Halo Custom Edition dedicated servers.');
  if(server.publicListing)add('warning','PUBLIC_LISTING','Public listing was enabled manually; review network, privacy and firewall settings outside Spark before use.');
  if(!server.rotation.length)add('blocker','EMPTY_ROTATION','Choose at least one multiplayer map and a game type.');
  if(!inventory)add('blocker','NO_LOCAL_SCAN','Scan your registered Halo Custom Edition installation to verify the map basename and SHA-256.');
  else if(inventory.runtimeId!=='haloCustomEdition')add('blocker','INVENTORY_MISMATCH','The supplied inventory is not from Halo Custom Edition.');
  for(let i=0;i<server.rotation.length;i++){
    const entry=server.rotation[i],map=entry.map?.trim()??'',variant=entry.gameVariant?.trim()??'';
    if(!token.test(map)||!safeGameName.test(variant)||!variant) {add('blocker','UNSAFE_ROTATION',`Rotation ${i+1} has an invalid map or variant name.`);continue;}
    if(inventory&&!known.has(lower(map))){
      const conflict=inventory.maps.find(candidate=>candidate.relativePath.replace(/\\/g,'/').toLowerCase().endsWith(`/${lower(map)}.map`) && candidate.valid);
      if(conflict&&conflict.cacheVersion!==609) add('blocker','INCOMPATIBLE_CE_CACHE',`Map '${map}' uses cache version ${conflict.cacheVersion}; stock Halo Custom Edition requires version 609.`);
      else add('blocker','MAP_NOT_VERIFIED',`Map '${map}' is not a hashed version-609 multiplayer cache in the selected installation.`);
    }
    if(!stockVariant(variant)){
      const custom=designs.get(lower(variant));
      if(!custom)add('blocker','CUSTOM_VARIANT_UNREGISTERED',`'${variant}' is not a known built-in variant. Create a Game Type Workshop design and confirm the native Halo variant exists.`);
      else {
        if(custom.specialRules!=='standard')add('blocker','UNSUPPORTED_SCRIPTED_MODE',`'${variant}' requests ${custom.specialRules}; server init.txt cannot implement networked AI/infection rules.`);
        if(custom.nativeStatus!=='userConfirmedInGame'||!custom.nativeEvidence.trim())add('blocker','NATIVE_VARIANT_NOT_SAVED',`'${variant}' has not been declared saved in Halo's native game type editor.`);
        else add('warning','NATIVE_VARIANT_USER_DECLARED',`'${variant}' is user-declared, not independently inspected as a valid blam.lst binary.`);
      }
    }
  }
  const validDesigns=gameTypeValidation(server.gameTypes);
  for(const error of validDesigns)add('blocker','INVALID_DESIGN',error);
  const hasBlocker=findings.some(f=>f.severity==='blocker');
  return {verifiedMaps:maps,findings,canExportReviewConfig:server.runtime==='haloCustomEdition'&&server.rotation.length>0 && !validDesigns.length,
    readyForManualLocalTest:!hasBlocker};
}
/** Sanitized portable plan: no passwords, absolute paths, native files or changes. */
export function exportSessionHandoff(studio:CreatorStudioDocument,inventory:RuntimeInventory|null|undefined):string {
  const report=analyzeHaloCeSession(studio.server,inventory);
  return JSON.stringify({schemaVersion:1,kind:'guilty-spark-ce-session-handoff',
    engine:'haloCustomEdition',source:'user-project-plan',status:report.readyForManualLocalTest?'READY_FOR_MANUAL_CHECK':'BLOCKED',
    nativeGameTypeFilesWritten:false,serverStarted:false,firewallModified:false,aiNetworkingImplemented:false,
    // Local source descriptions are not transmitted in a shareable package:
    // they may contain machine-specific paths, profile names or other private context.
    server:{...studio.server,gameTypes:(studio.server.gameTypes??[]).map(game=>({
      ...game,nativeEvidence:game.nativeEvidence?'[local declaration omitted]':''
    }))},
    verifiedMaps:report.verifiedMaps.filter(map=>studio.server.rotation.some(row=>lower(row.map)===lower(map.map))),
    findings:report.findings,
    steps:['Install the exact map cache in the intended Halo CE maps folder yourself and verify its SHA-256.',
      'For custom variants, save matching names in the native Halo CE client, then verify the savegame data on the hosting machine.',
      'Review the exported init.txt and configure a private, authorized test server separately.',
      'Have a second player join on the same runtime version; record a real gameplay result. Do not assume AI synchronizes.'],
  },null,2);
}
