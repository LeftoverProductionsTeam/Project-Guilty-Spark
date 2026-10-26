/** First-run routes are an instructional map of real Guilty Spark workspaces,
 * never fake achievements or an assumption that local tools are functional. */
import type { Bootstrap, Project, Workspace } from './types';
export type StarterId='legacy'|'inspect'|'original'|'convert'|'campaign'|'zombies'|'multiplayer';
export interface StarterStep { id:string; label:string; why:string; target:Workspace; needsDesktop:boolean; }
export interface StarterPath { id:StarterId;title:string;description:string;level:'Start here'|'Advanced';steps:StarterStep[]; }
export const STARTER_PATHS:readonly StarterPath[]=[
  {id:'legacy',title:'Relive the Halo modding era',level:'Start here',description:'Compare Eschaton, HMT, SwordEdit and old log mods to safe source editing. Research first, then create a reproducible experiment.',steps:[
    {id:'academy',label:'Open the 07 Halo Modding Brain Legacy Lab',why:'A research-linked, project-aware workflow map explains what the old tools did and what modern Spark can actually prove.',target:'academy',needsDesktop:false},
    {id:'preserve',label:'Preserve an owned Halo Demo or PC cache',why:'A source SHA-256 anchors the experiment without rewriting the original game map or copying someone else\'s assets.',target:'library',needsDesktop:true},
    {id:'compare',label:'Inspect map tags and relationships',why:'The modern source/tag pipeline replaces direct-cache poking and keeps unsupported classes explicit.',target:'tags',needsDesktop:false},
    {id:'author',label:'Rebuild an idea as editable source',why:'Use actual geometry, placements, objectives and dependency checks rather than assuming old map hacks generate collision.',target:'quickforge',needsDesktop:false},
    {id:'plan',label:'Export a local legacy workflow handoff',why:'The Academy handoff records project evidence and unverified engine gates with no private paths or original asset bytes.',target:'academy',needsDesktop:false},
  ]},
  {id:'inspect',title:'Open an old Halo map',level:'Start here',description:'Preserve a local cache, inspect its actual tags and see its geometry.',steps:[
    {id:'import',label:'Import an owned .map in Map Library',why:'The original cache is copied and hashed before inspection.',target:'library',needsDesktop:true},
    {id:'view',label:'Explore the World Editor',why:'Real BSP surfaces are visible when supported by the cache; missing textures remain explicit.',target:'world',needsDesktop:false},
    {id:'tag',label:'Browse relationships in Tag Editor',why:'A tag identity is a reference, not an extracted writable tag file.',target:'tags',needsDesktop:false},
    {id:'academy',label:'Follow the preservation lesson',why:'Learn why project overlays are safer than editing installed maps directly.',target:'academy',needsDesktop:false},
  ]},
  {id:'original',title:'Build an original arena',level:'Start here',description:'Author editable source geometry, test its preview collision, and export a validated JMS.',steps:[
    {id:'create',label:'Start a QuickForge source project',why:'Room, terrain and cave brushes are explicit editable source primitives.',target:'quickforge',needsDesktop:true},
    {id:'navigate',label:'Practice RMB + WASD and XYZ arrows',why:'Navigate and place with toggleable grid/mesh snapping without rewriting the source.',target:'quickforge',needsDesktop:false},
    {id:'collision',label:'Walk the local collision preview',why:'It is a fast geometry test; it is not Halo’s compiled collision BSP.',target:'quickforge',needsDesktop:false},
    {id:'build',label:'Validate and export through the matching Tool',why:'Playable output requires Halo Tool, tags, collision and in-game testing.',target:'build',needsDesktop:true},
  ]},
  {id:'convert',title:'Set up real editing tools',level:'Start here',description:'Choose your Halo runtime first, then only the editing kit and adapters compatible with it.',steps:[
    {id:'runtime',label:'Select the target Halo runtime',why:'Classic Custom Edition and MCC H1A use different tool interfaces.',target:'runtimes',needsDesktop:false},
    {id:'settings',label:'Point Spark at installed tools',why:'No tool is automatically downloaded, installed or executed.',target:'settings',needsDesktop:true},
    {id:'inspect',label:'Inspect tool identity inside Spark',why:'An inventory/hash check is read-only; running a CLI job is a distinct, opt-in action.',target:'runtimes',needsDesktop:true},
    {id:'build',label:'Use a managed Build/Tag workflow',why:'Only vetted tool actions can touch a designated working directory.',target:'build',needsDesktop:true},
  ]},
  {id:'campaign',title:'Create a campaign mission',level:'Advanced',description:'Design mission beats and cinematic shots, then prepare source scripts for a real scenario.',steps:[
    {id:'source',label:'Create or open a source project',why:'Campaign scripts require a scenario with matching named objects, AI squads and cameras.',target:'quickforge',needsDesktop:true},
    {id:'story',label:'Author objectives and camera shots',why:'Creator Studio exports HaloScript source rather than pretending it is gameplay.',target:'creator',needsDesktop:false},
    {id:'prepare',label:'Stage source through the HCEEK exporter',why:'The output needs actual tags and a compatible Halo compiler.',target:'creator',needsDesktop:false},
    {id:'verify',label:'Test a real campaign in-engine',why:'Check checkpoints, trigger behavior, AI paths and cinematic playback.',target:'build',needsDesktop:true},
  ]},
  {id:'multiplayer',title:'Host a private Halo CE game',level:'Start here',description:'Pick your map, choose or design a game type, inspect the installed runtime and prepare a safe multiplayer handoff.',steps:[
    {id:'server',label:'Open Game Type Workshop in Creator Studio',why:'Create a private map rotation without modifying your server or game files.',target:'creator',needsDesktop:false},
    {id:'scan',label:'Register and scan Halo CE',why:'The selected map must be a real multiplayer cache in the runtime inventory, identified by SHA-256.',target:'runtimes',needsDesktop:true},
    {id:'game',label:'Choose a native Halo game type',why:"Custom names must already exist in the game's native savegame records; Spark designs are not binary game types.",target:'creator',needsDesktop:false},
    {id:'hand',label:'Export and review the server handoff',why:'The init.txt and manifest are drafts; you remain in control of game/network settings.',target:'creator',needsDesktop:false},
    {id:'help',label:"Read original authors' multiplayer lessons",why:'The Academy points to archived tutorials from named Halo modding contributors.',target:'academy',needsDesktop:false},
  ]},
  {id:'zombies',title:'Restore Zombie Apocalypse',level:'Advanced',description:'Create AI wave rules and independently validate local, server and multiplayer behavior.',steps:[
    {id:'waves',label:'Author Firefight wave definitions',why:'Configuration and local simulation alone cannot spawn engine actors.',target:'firefight',needsDesktop:false},
    {id:'actors',label:'Inspect AI references and scenario dependencies',why:'A scenario must have real encounters, squads and actor variants.',target:'scenario',needsDesktop:false},
    {id:'scripts',label:'Export source scripts with dependencies',why:'The target engine must compile and execute the generated scripts.',target:'creator',needsDesktop:false},
    {id:'multiplayer',label:'Document two-client acceptance tests',why:'Halo 1 networked AI requires version-specific proof; no fake multiplayer pass.',target:'runtimes',needsDesktop:true},
  ]},
];
export const WORKSPACE_TOOLTIPS:Partial<Record<Workspace,string>>={
  'get-started':'A beginner-safe tour of the available paths, dependencies and limitations.',
  library:'Import owned maps and open saved projects. Preserves originals and source hashes.',
  'map-finder':'Find original HaloMods, HaloMaps, CE3 and HaloMD community map downloads. Browser downloads are opt-in; import local files separately.',
  quickforge:'Build editable source brushes, terrain and caves. Run live preview collision; export JMS after validation.',
  academy:'Guided, evidence-aware Halo lessons, with clear labels for work requiring real engine tests.',
  community:'Historical references and the living community Thanks page. Local nominations are not published.',
  firefight:'Compose AI-wave rules; requires a real Halo scenario and script compilation for gameplay.',
  world:'Inspect BSP and object geometry; imported BSP edits require source reconstruction.',
  tags:'Browse tag dependencies; extract/stage real tags with installed compatible tools and permission.',
  assets:'Import and export OBJ/JMS geometry, align meshes and check source seams.',
  scenario:'Inspect actual scenario objects and encounters; scenario compilation needs engine tools.',
  build:'Build and QA through configured Halo tools, with receipts. No automatic game-playable guarantee.',
  compare:'Compare map variants and differences against preserved sources.',
  runtimes:'Select a runtime, inspect compatible tool identities, launch GUI editors beside Spark or use managed CLI workflows.',
  live:'Test the limited live preview and inspect what remains disconnected from Halo gameplay.',
  interface:'Configure local themes, UI sounds and accessibility preferences.',
  creator:'Author missions, cinematics, private multiplayer sessions, custom game type designs and playtest records.',
  preservation:'Track sources and creator attribution to preserve Halo community history.',
  settings:'Set supported external tool paths and compatibility profile. Does not install or run tools.',
};
export function starterEvidence(id:StarterId,project:Project|null,data:Bootstrap):string[]{
  const hasSource=!!project?.source;
  const hasForge=!!project?.quickForge;
  const hasToolFolder=!!data.settings.hekDirectory||!!data.settings.invaderDirectory;
  switch(id){
    case 'legacy':return [hasSource?'Preserved source available for legacy review':'Import your own cache for source-specific history'];
    case 'inspect':return [hasSource?'Owned source map selected':'No map source loaded'];
    case 'original':return [hasForge?'QuickForge source document selected':'QuickForge source not yet selected'];
    case 'convert':return [hasToolFolder?'Tool folder configured; capability not yet proven':'No editing-kit folder configured'];
    case 'campaign':return [project?.studio?'Creator Studio document exists':'No authored mission document'];
    case 'multiplayer':return [project?.studio?.server.rotation.length?'A local session rotation is drafted; map verification still required':'No session rotation yet'];
    case 'zombies':return [hasForge&&project?.quickForge?.gameMode==='zombie'?'Zombie-intent source selected; gameplay unverified':'Zombie-intent project not yet selected'];
  }
}
const ONBOARDING_SEEN='guilty-spark-first-run-seen-v1';
export function firstVisitWorkspace():Workspace{
  try{return window.localStorage.getItem(ONBOARDING_SEEN)==='yes'?'library':'get-started';}
  catch{return 'library';}
}
export function markFirstVisitSeen(){try{window.localStorage.setItem(ONBOARDING_SEEN,'yes');}catch{/* optional */}}
