/** H1A/HCEEK data-layout authoring handoff; no disk writes or runtime actions.
 * Source layout follows the Halo 1 Sapien `data/levels/.../scripts/*.hsc`
 * convention. Only the user's OWN editable scenario may be compiled.
 */
import type { Project } from './types';
import type { ScriptExport } from './haloScript.ts';
import { exportHaloCeMission, exportHaloCeCinematic, exportHaloCeFirefight, scriptManifest } from './haloScript.ts';
import { sourceTreeZip } from './sourceZip.ts';
export type Activation = 'none' | 'mission' | 'firefight';
export interface HceekSourcePack {
  scenarioPath: string;
  scriptDirectory: string;
  files: {name:string;contents:string}[];
  bytes: Uint8Array;
  bootstrap: Activation;
  gameplayVerified: false;
}
/** This slug must match spark-core::quickforge::scenario_path. */
export function scenarioSlug(name:string):string {
  if(typeof name!=='string'||!name.length||name.length>120)throw new Error('Invalid QuickForge source name');
  const slug=Array.from(name, ch=>/^[A-Za-z0-9]$/.test(ch)?ch.toLowerCase():'_').join('').replace(/^_+|_+$/g,'').slice(0,31);
  if(!slug)throw new Error('QuickForge name has no usable ASCII scenario slug');
  return slug;
}
export function assembleHceekSourcePack(
  project: Pick<Project,'quickForge'|'studio'|'firefight'|'title'|'id'>,
  activation:Activation='none',
):HceekSourcePack {
  const forge=project.quickForge;
  if(!forge)throw new Error('Open a QuickForge source project before staging scenario scripts');
  if(!['mccSteam','haloCustomEdition'].includes(forge.runtimeId))
    throw new Error('Script staging targets an editable H1A/Custom Edition scenario, not a Demo/retail/native cache');
  if(!['firefight','zombie'].includes(forge.gameMode))
    throw new Error('Choose a QuickForge singleplayer Firefight/Zombie source scenario before staging mission/AI scripts');
  const slug=scenarioSlug(forge.name);
  const scriptDirectory=`data/levels/quickforge/${slug}/scripts`;
  const scenarioPath=`levels\\quickforge\\${slug}\\${slug}`;
  const scripts:ScriptExport[]=[];
  if(project.studio?.missions.length)scripts.push(exportHaloCeMission(project.studio));
  if(project.studio?.shots.length)scripts.push(exportHaloCeCinematic(project.studio));
  if(project.firefight)scripts.push(exportHaloCeFirefight(project.firefight));
  if(!scripts.length)throw new Error('Create a mission, camera timeline or finite Firefight wave configuration first');
  if(activation==='mission'&&!scripts.some(s=>s.filename==='gs_mission.hsc'))throw new Error('No mission script to start');
  if(activation==='firefight'&&!scripts.some(s=>s.filename==='gs_firefight.hsc'))throw new Error('No Firefight script to start');
  if(!['none','mission','firefight'].includes(activation))throw new Error('Invalid script activation mode');
  const files=scripts.flatMap(script=>[
    {name:`${scriptDirectory}/${script.filename}`,contents:script.content},
    {name:`manifests/${script.filename}.json`,contents:scriptManifest(script)},
  ]);
  if(activation!=='none'){
    // A single, creator-selected startup path, never two automatic AI missions.
    const target=activation==='mission'?'gs_mission':'gs_firefight';
    files.push({name:`${scriptDirectory}/gs_bootstrap.hsc`,contents:[
      '; REVIEW: opt-in Guilty Spark singleplayer bootstrap.',
      '; Loaded only when compiled into YOUR editable scenario.',
      '(script startup gs_bootstrap',
      '  (sleep 1)',
      `  (wake ${target})`,
      ')','',
    ].join('\r\n')});
  }
  if(scripts.length+(activation==='none'?0:1)>8)
    throw new Error('Classic Halo HEK supports at most eight HSC source files per scenario');
  const manifest={schemaVersion:1,kind:'guilty-spark-h1a-hceek-script-tree',scenarioPath,
    scriptDirectory,activation,sourceFiles:scripts.map(s=>s.filename),
    dependencies:scripts.flatMap(s=>s.dependencies),compiled:false,gameplayVerified:false,
    requires:['owner-provided editable tags','valid authored scenario AI encounters/camera points/trigger volumes',
      'Sapien legacy Compile Scripts or H1A auto script compile','actual cache build/game load'],
    safety:'Archive contains source scripts/manifests only. It never modifies a game or opens firewall ports.'};
  files.push({name:'READ_ME_FIRST.json',contents:JSON.stringify(manifest,null,2)});
  files.push({name:'STAGING_INSTRUCTIONS.txt',contents:[
    'GUILTY SPARK - HALO 1 SCRIPT STAGING (SOURCE ONLY)',
    `Editable scenario: tags\\${scenarioPath}.scenario`,
    `Scripts source directory: ${scriptDirectory}`,
    '1. Review ALL script sources and dependencies. Do not copy into an installed game.',
    '2. In your separate, backed-up Editing Kit workspace, place script files beneath the matching data/ directory.',
    '3. Create the referenced AI encounters, camera points and trigger volumes in the editable scenario first.',
    '4. This is a source-only archive; make sure the scenario tag is set to a supported campaign/singleplayer type.',
    '5. Legacy HEK: compile scripts through Sapien File > Compile Scripts; H1A toolset compiles during scenario processing.',
    '6. Run Tool/Invader build against a disposable build workspace, and test only a managed copy.',
    '7. A successful script parse or generated .map is NOT a game test. Preserve original hashes and collect evidence.',
    'NOT INCLUDED: scenario tags, bitmap/shader assets, compiled BSP, runtime, AI syncing or gameplay verification.',
    '',
  ].join('\r\n')});
  return {scenarioPath,scriptDirectory,files,bytes:sourceTreeZip(files),bootstrap:activation,gameplayVerified:false};
}
