/**
 * 07 Halo Modding Brain / C31 — a contextual, read-only operating guide.
 * Never infer a game build or runtime from an editable source/preview state.
 * The only actions this model offers are navigation to existing workspaces.
 */
import type { Workspace } from './types';

export interface WorkbenchEvidence {
  desktop: boolean;
  project: boolean;
  source: boolean;
  inspectedSource: boolean;
  forge: boolean;
  toolFolder: boolean;
  unsaved: boolean;
  runningJob: boolean;
}

type Requirement = 'none' | 'project' | 'source' | 'forge' | 'toolchain';
export interface WorkbenchGuideDefinition {
  title: string;
  can: string;
  cannot: string;
  tip: string;
  need: Requirement;
  followUp: Workspace;
}
export interface WorkbenchGuideView extends WorkbenchGuideDefinition {
  status: string;
  explanation: string;
  target: Workspace;
  action: string;
  sourceReminder: string;
}

/** A complete and explicit entry for every known workspace, including hidden footer routes. */
export const WORKBENCH_GUIDES: Record<Workspace, WorkbenchGuideDefinition> = {
  'get-started': { title:'Choose a real learning path', can:'Walk through workflows and open the appropriate Spark workspace.', cannot:'Opening a lesson does not create assets or pass an engine test.', tip:'Start with a preserved map or the original QuickForge arena.', need:'none', followUp:'library' },
  library: { title:'Preserve before experimenting', can:'Import a supported owned map or open an existing project and inspect its identity.', cannot:'A copied cache is not guaranteed to contain reconstructible source tags.', tip:'Keep downloaded archives and stock Halo installs outside your editable workspace.', need:'none', followUp:'map-finder' },
  'map-finder': { title:'Find the old maps responsibly', can:'Browse curated HaloMods/CE3/HaloMaps/HaloMD pages; import a separately downloaded local file.', cannot:'External links may be dead; this screen does not download or execute files automatically.', tip:'Check the Halo edition, creator, and whether a file is a patch or complete map.', need:'none', followUp:'library' },
  quickforge: { title:'Model the source, not the compiled BSP', can:'Create and edit source rooms, caves, ramps, tunnels, objectives and previews.', cannot:'Snapping and local collision previews cannot prove Halo Tool collision, portals or visibility.', tip:'Validate topology first; export JMS to an isolated build and inspect the Tool WRL afterward.', need:'none', followUp:'build' },
  world: { title:'Inspect a preserved world', can:'Explore supported render BSP material regions, lightmaps and placements.', cannot:'An imported compiled BSP cannot yet be arbitrarily cut, recompiled or losslessly rewritten.', tip:'A visible tunnel mouth without a sealed source wall is not a compiled portal.', need:'source', followUp:'quickforge' },
  tags: { title:'Follow the real tag dependencies', can:'Inspect observed class-aware references, stage supported edits and plan cross-map migration.', cannot:'Cache datum IDs are not portable editable .tag files. A lineage scan is not full dependency closure.', tip:'Use compatible Invader extraction in an isolated tag tree before any rebuild.', need:'source', followUp:'academy' },
  assets: { title:'Prepare source assets', can:'Inspect, import and export supported OBJ/JMS source geometry and check seams.', cannot:'An OBJ or JMS by itself does not contain Halo collision trees, tags or a playable cache.', tip:'Preserve UVs, winding, normals and author attribution when changing an asset.', need:'project', followUp:'quickforge' },
  scenario: { title:'Understand scenario relationships', can:'Inspect supported objects, spawns, encounters and their source associations.', cannot:'A scenario marker or AI wave plan is not compiled HaloScript or live engine AI.', tip:'Verify objectives and actual tag paths against the target engine before building.', need:'source', followUp:'creator' },
  build: { title:'Treat the compiler as the referee', can:'Run explicitly configured, compatible, isolated Tool/Invader workflows and inspect logs.', cannot:'A generated source file or clean preview cannot certify a map playable.', tip:'Never force-kill Tool while structure is writing a BSP; review WRL and native logs.', need:'toolchain', followUp:'academy' },
  compare: { title:'Compare instead of guessing', can:'Review available source identities and supported cache differences.', cannot:'Two maps sharing tag paths are not necessarily binary-compatible or rebuildable.', tip:'Use class/path and source SHA information instead of transplanting cache datum IDs.', need:'project', followUp:'tags' },
  runtimes: { title:'Choose the correct engine first', can:'Inspect edition-specific tooling, runtime profiles and registered legacy companions.', cannot:'A detected executable or Wine runtime does not establish successful launch or compatibility.', tip:'Treat Mac Demo, PC, CE, HaloMD and MCC as distinct targets until tested.', need:'none', followUp:'settings' },
  live: { title:'Keep preview and gameplay distinct', can:'Investigate local previews and the supported runtime test handoff.', cannot:'The editor preview is not a live Halo engine or synchronized multiplayer session.', tip:'Record separate compiler, in-engine and second-client evidence.', need:'none', followUp:'build' },
  firefight: { title:'Design encounters, then verify AI', can:'Draft waves, delays, spawn intent and related scenario source data.', cannot:'A wave simulator cannot spawn real engine AI or synchronize it across clients.', tip:'First prove one real encounter in a compiled scenario before scaling to a survival mode.', need:'project', followUp:'creator' },
  interface: { title:'Borrow the Halo feel, not the game files', can:'Customize Halo-inspired palettes, consent-based UI sounds and verified owned bitmap header art.', cannot:'Missing or changed source hashes are never replaced with guessed image data; full ui.map sprites remain unfinished.', tip:'Choose an owned compatible bitmap through a preserved map; only its reference persists.', need:'none', followUp:'library' },
  creator: { title:'Direct a mission with honest proof', can:'Author mission beats, cinematic plans, custom modes and private server handoffs.', cannot:'Authored scripts do not establish valid scenario objects, networked AI or campaign gameplay.', tip:'Tie each encounter to real names/tags and test its engine behavior separately.', need:'project', followUp:'build' },
  academy: { title:'Rediscover the modding era', can:'Follow source-aware lessons inspired by HMT, Eschaton, SparkEdit and SwordEdit.', cannot:'Tutorial progress is not proof of a playable map or complete old-tool emulation.', tip:'Experiment quickly, preserve the original, trace dependencies, rebuild and share reproducible sources.', need:'none', followUp:'get-started' },
  community: { title:'Credit the people who built this culture', can:'Explore the attributed historical archives and preserved community knowledge.', cannot:'An archived download listing does not prove authorship rights or source recoverability.', tip:'Preserve creator names, tool credits, permissions and links with each mod.', need:'none', followUp:'academy' },
  preservation: { title:'Record where the mod came from', can:'Record the project, source and creator attribution as available.', cannot:'A saved note never grants permission to redistribute third-party tags or maps.', tip:'Keep source hashes and original release metadata alongside your experiments.', need:'project', followUp:'library' },
  settings: { title:'Configure tools without risking your game', can:'Point Spark to separately installed, compatible editing tools.', cannot:'Registering a path does not launch a tool or certify its binaries and licenses.', tip:'Keep stock game installations separate from isolated Tool, data, tags and maps directories.', need:'none', followUp:'runtimes' },
};

/** Status is intentionally about source evidence, NEVER a claim of Halo gameplay. */
export function describeWorkbench(workspace: Workspace, e: WorkbenchEvidence): WorkbenchGuideView {
  const def = WORKBENCH_GUIDES[workspace];
  let status = 'Workspace available';
  let explanation = 'Read-only navigation is available. Runtime-specific operations still need their own checks.';
  let target = def.followUp;
  let action = `Open ${target}`;
  if (def.need === 'project' && !e.project ||
      def.need === 'source' && !e.source ||
      def.need === 'toolchain' && !e.project ||
      def.need === 'forge' && !e.forge) {
    status = 'Select a project';
    explanation = 'No suitable project source is open. Import a preserved map or create editable source first.';
    target = def.need === 'forge' ? 'quickforge' : 'library';
    action = target === 'library' ? 'Open Map Library' : 'Open QuickForge';
  } else if (workspace === 'build' && e.project && !e.source && !e.forge) {
    status = 'No Halo source to compile';
    explanation = 'This asset-only workspace has no preserved Halo cache or editable QuickForge geometry to build.';
    target = 'quickforge'; action = 'Create original source';
  } else if (def.need === 'source' && e.source && !e.inspectedSource) {
    status = 'Source inspection pending';
    explanation = 'The cache has a project reference, but current inspection does not match its preserved source identity.';
    target = 'library'; action = 'Reopen preserved map';
  } else if (def.need === 'toolchain' && !e.toolFolder) {
    status = 'Toolchain not configured';
    explanation = 'Register an installed, engine-matched editing kit first. A folder path is not proof of working Tool execution.';
    target = 'settings'; action = 'Configure editing tools';
  } else if (def.need === 'toolchain' && e.toolFolder) {
    status = 'Tool folder recorded';
    explanation = 'A tool directory is configured. Compiler success, map output and gameplay remain unverified.';
  } else if (def.need === 'source' && e.inspectedSource) {
    status = 'Source inspection matched';
    explanation = 'The viewed inspection matches the preserved source hash, not a certified export or runtime.';
  } else if (def.need === 'none' && workspace === 'quickforge' && !e.forge) {
    status = 'Create editable source';
    explanation = 'Start an original source arena, then validate each exported geometry revision.';
    target = 'academy'; action = 'Open arena starter lesson';
  }
  if (!e.desktop && ['tags','world','scenario','build','quickforge','assets','preservation'].includes(workspace)) {
    explanation += ' Browser preview cannot perform native map and Tool operations.';
  }
  if (e.unsaved) explanation += ' The active project has unsaved edits.';
  if (e.runningJob) explanation += ' A native job is still running; do not treat its output as complete.';
  return {...def, status, explanation, target, action,
    sourceReminder: 'SOURCE ≠ COMPILED TAGS ≠ PLAYABLE HALO MAP'};
}
