import type { RuntimeId, RuntimeRegistration } from './types';
import type { NativePlayerProfile } from './firefight';
import type { NativeOperation } from './nativeOperations';
import { nativeTransportAiRoute, nativeTransportLegs, nativeTransportRecording, type NativeTransportOptions } from './haloScript';

const localForgeFeature = 'forge.hmv_local_devices.v1';
const localForgePhysicsFeature = 'forge.hmv_local_physics.v1';
const hostForgePhysicsFeature = 'forge.hmv_host_physics.v1';

export function verifyForerunnerLocalForge(requiresPhysics = false) {
  const required = requiresPhysics ? [localForgeFeature, localForgePhysicsFeature] : [localForgeFeature];
  return verifyForerunnerForge(required, 'Local Forge', requiresPhysics ? 'Local Forge Fixed and Phased physics' : 'Local Forge support');
}

export function verifyForerunnerHostPhysics() {
  return verifyForerunnerForge(['forge.hmv_base_placements.v1', hostForgePhysicsFeature],
    'Hosted Forge', 'hosted Forge Fixed and Phased physics');
}

export async function verifyForerunnerGuestForge(requiresPhysics: boolean) {
  const placements = 'forge.guest_placements.v1';
  const livePhysics = 'forge.live_physics.v1';
  const required = ['forge.hmv_base_placements.v1', 'forge.guest_rotate.v1'];
  if (requiresPhysics) required.push(hostForgePhysicsFeature);
  const profile = await verifyForerunnerForge(required, 'guest Forge',
    requiresPhysics ? 'guest Forge editing and hosted Fixed and Phased physics' : 'guest Forge editing', [placements, livePhysics]);
  const features = profile.reviewedCompanion?.capabilities.native_features ?? [];
  return {
    profile: runtimeProfileLabel(profile),
    placements: features.includes(placements),
    livePhysics: features.includes(livePhysics) && features.includes(hostForgePhysicsFeature),
  };
}

async function verifyForerunnerForge(required: string[], mode: string, support: string, preferred: string[] = []) {
  const { call } = await import('./api');
  const profiles = await call<RuntimeRegistration[]>('list_runtime_registrations');
  const candidates = profiles.filter(profile => profile.runtimeId === 'openCe'
    && required.every(feature => profile.reviewedCompanion?.capabilities.native_features?.includes(feature)));
  if (!candidates.length) throw Error(`Review a Forerunner build with ${support} in Games & Tools.`);
  if (preferred.length) {
    const supported = (profile: RuntimeRegistration) =>
      preferred.filter(feature => profile.reviewedCompanion?.capabilities.native_features?.includes(feature)).length;
    candidates.sort((a, b) => supported(b) - supported(a));
  }
  for (const registration of candidates) {
    try {
      const result = await call<import('./types').RuntimeInstallation>('inspect_runtime_registration', { registration });
      if (result.validation === 'pass' && result.registrationId === registration.id
        && result.executableSha256 === registration.reviewedCompanion?.executableSha256) return registration;
    } catch {
      // A stale profile must not prevent a second intact reviewed profile from being used.
    }
  }
  throw Error(`The reviewed ${mode} runtime changed or is unavailable. Inspect it again in Games & Tools.`);
}

export const PREFERRED_RUNTIME:RuntimeId='chupathingyCe';
export type OpenCeFlavor = 'opence' | 'faber' | 'openh1' | 'forerunner';

export type ActionAvailability = 'ready' | 'running' | 'setupRequired' | 'updateNeeded' | 'unavailable';
export type EvidenceLevel =
  'unknown' | 'unsupported' | 'upstreamDeclared' | 'implemented' | 'locallyTested' | 'multiplayerTested';
export const availabilityLabel: Record<ActionAvailability, string> = {
  ready: 'Ready',
  running: 'Running',
  setupRequired: 'Set up',
  updateNeeded: 'Update needed',
  unavailable: 'Not available',
};
export const evidenceLabel: Record<EvidenceLevel, string> = {
  unknown: 'Unknown',
  unsupported: 'Unsupported',
  upstreamDeclared: 'Upstream declared',
  implemented: 'Implemented',
  locallyTested: 'Locally tested',
  multiplayerTested: 'Multiplayer tested',
};
export const runtimeNames: Record<RuntimeId, string> = {
  mccSteam: 'MCC Halo 1',
  chupathingyCe: 'ChupathingyCE',
  openCe: 'OpenCE',
  arenaEvolved: 'Arena Evolved',
  haloPc: 'Halo PC',
  haloCustomEdition: 'Custom Edition',
  macRetail: 'Halo Mac retail',
  macDemo: 'Halo Mac demo',
  haloPcTrial: 'Halo PC trial',
  haloMd: 'HaloMD',
  haloXbox: 'Halo Xbox',
};
/** Display names do not grant capabilities; native executable validation remains authoritative. */
export function runtimeProfileName(profile:RuntimeRegistration):string {
 const identity=[profile.id,profile.version??'',profile.root.replaceAll('\\','/')].join(' ');
 if(profile.runtimeId!=='openCe')return runtimeNames[profile.runtimeId];
 return /forerunner/i.test(identity)?'Forerunner':/openh1/i.test(identity)?'OpenH1':/faber/i.test(identity)?'Faber':runtimeNames.openCe;
}
export function runtimeProfileLabel(profile:RuntimeRegistration):string {
 return runtimeProfileName(profile)+' · '+profile.root.replaceAll('\\','/').split('/').filter(Boolean).at(-1);
}
export interface RuntimeDockAction {
  id: string;
  operation: string;
  label: string;
  availability: ActionAvailability;
  description: string;
  nextAction: string;
  requiresConfirmation: boolean;
}
export interface RuntimeCapability {
  operation: string;
  evidenceLevel: EvidenceLevel;
  availability: ActionAvailability;
  detail: string;
  gates: { code: string; detail: string }[];
  nextAction: string;
  evidence: { target: string; procedure: string; result: string; location: string }[];
}
export interface RuntimeWorkbenchReport {
  report: {
    schemaVersion: number;
    profileId: string;
    target: { family: string; edition: string; platform: string; distribution: string; architecture: string };
    capabilities: RuntimeCapability[];
    diagnostics: string[];
    playerScale: { goalPlayers: number; checkpoints: number[]; acceptedGamePlayers: number | null };
  };
  profiles: {
    profileId: string;
    runtimeId: RuntimeId | null;
    label: string;
    implementedAdapter: boolean;
    detail: string;
  }[];
  actions: RuntimeDockAction[];
  sourceIssue: string | null;
  toolsIssue: string | null;
  processes: ToolProcessView[];
  workingBuild: { id: string; message: string } | null;
  workingSource?: { target?: 'mcc-cea' | 'gbx-custom'; buildId: string; tagsDirectory: string; authoringPending?: boolean; sourceProjectFingerprint?: string; projectFingerprint?: string } | null;
}
export interface CompiledSourceProject {
  projectId:string;title:string;buildId:string;outputSha256:string;
  target:'mcc-cea'|'gbx-custom';authoringChanged:boolean;
}
export interface EncounterAppendRequest {
  operation:Extract<NativeOperation,{kind:'appendEncounters'}>;
  existingController?:{filename:string;sha256:string}|null;
  hud?:HudAppendReview|null;
  playerProfile?:{index:number;name:string;profile:NativePlayerProfile;reuse:boolean;originalNames:string[];sourceFieldsSha256:string;profileFieldsSha256?:string|null}|null;
  fieldsSha256:string;scriptsSha256:string;writerSha256:string;projectFingerprint:string;
}
export interface NativeHudMessage {name:string;panels:({kind:'text';value:string}|{kind:'button';value:number})[]}
export interface HudAppendReview {inputReference:string|null;inputTagSha256:string|null;sourceSha256:string;messagesSha256:string;outputTagPath:string;stringToolSha256:string}
export interface FirefightSourcePlan {
  projectId:string;buildId:string;tagsDirectory:string;tagIdentity:string;request:EncounterAppendRequest;
  groups:{name:string;actorPath:string;positions:[number,number,number][]}[];
  previousController?:NativeScriptAttachment|null;
  previousGroups:{name:string;actorPath:string;positions:[number,number,number][]}[];
  hud?:{review:HudAppendReview;originalCount:number;inputMessages:NativeHudMessage[];messages:NativeHudMessage[]}|null;
}
export interface MissionHudSourcePlan {
  projectId:string;buildId:string;tagsDirectory:string;projectFingerprint:string;
  hud:NonNullable<FirefightSourcePlan['hud']>;
}
export interface NativeScriptAttachment { filename:string;content:string;sha256:string;replacesSha256?:string|null }
export interface WorkingScriptSources {
  transportRecordings?: {name:string;version:number;ticks:number}[];
  missionReview?:{objects?:import('./nativeOperations').NativeNamedObject[]|null;objectIssue?:string|null;flags?:import('./nativeOperations').NativeCutsceneFlag[];extractionSquads?:{terminal:import('./nativeOperations').NativeSquadTerminal}[];weapons?:import('./nativeOperations').NativeMissionWeapon[];encounters:{name:string;initiallyCreated:boolean}[];squads:import('./nativeOperations').NativeScenarioSquad[];devices:import('./nativeOperations').NativeDevicePlacement[];protectedEncounters:string[];escortRoutes?:{name:string;finalPosition:[number,number,number]|null;arrivalVolumes:string[];issue:string|null}[]|null};
  transportReview?:{vehicles:{name:string;tagPath:string;seats:string[];pilotSeats?:string[];flight?:import('./nativeOperations').NativeVehicleFlight;flightIssue?:string}[];groups:string[];routes:string[];pilots:string[];scriptCreatedPilots?:string[];protectedGroups?:string[];pilotBindings?:{aircraft:string;pilot:string;actors:string[];animationGraphs:string[];seats:string[];issue:string|null;crewSeats?:string[];crewIssue?:string|null}[];flightRoutes?:{name:string;points:number;commands:number;finalPosition:[number,number,number]|null;arrivalVolumes:string[];issue:string|null}[]};
  cameraReview?:{tagIdentity:string;cameras:import('./nativeOperations').NativeCameraPoint[];scriptNames:string[];triggerVolumes:string[];scenarioType:number};
  projectId:string;buildId:string;tagsDirectory:string;projectFingerprint:string;sourceSha256:string;
  modules:{filename:string;sha256:string;bytes:number;unavailable:string|null}[];
}
export interface WorkingScriptSource {selection:WorkingScriptSources;script:NativeScriptAttachment}

export function nativeTransportRecordingIssue(
  options: NativeTransportOptions,
  recordings: WorkingScriptSources['transportRecordings'],
): string | null {
  for (const leg of nativeTransportLegs(options)) {
    const recording = nativeTransportRecording(options, leg);
    if (!recording) continue;
    if (!options.holdParkedPilot) return 'Recorded flights need a dedicated deferred pilot with Hold parked pilot enabled.';
    for (const name of [recording.landing, recording.hover]) {
      if (name === undefined) continue;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name)
        || recordings?.filter(row => row.name.toLowerCase() === name.toLowerCase()).length !== 1
        || !recordings.some(row => row.name === name)) return 'Refresh the native source and choose a unique embedded recording for ' + (name || 'the landing') + '.';
    }
    if (recording.landing.toLowerCase() === recording.hover?.toLowerCase()) return 'Choose a separate hover and landing recording.';
  }
  return null;
}

export function nativeTransportRouteIssue(
  options: Pick<NativeTransportOptions, 'faction' | 'outbound' | 'inbound' | 'hub' | 'field' | 'returnAfterInsertion' | 'emptyInbound' | 'recordings'>,
  volumes: readonly string[],
  routes: NonNullable<WorkingScriptSources['transportReview']>['flightRoutes'],
): string | null {
  const aircraft = options.faction === 'unsc' ? 'pelican' : 'spirit';
  const dedicatedHub = aircraft + '_return';
  const dedicatedField = 'extraction_' + aircraft + '_zone';
  const hub = volumes.includes(dedicatedHub) ? dedicatedHub : 'extraction_return';
  const field = volumes.includes(dedicatedField) ? dedicatedField : 'extraction_zone';
  if (hub === dedicatedHub && options.hub !== hub) {
    return 'Select ' + hub + ' as the Hub pad volume so the controller and native settlement use the same pad.';
  }

  const hubZones = ['extraction_return', 'pelican_return', 'spirit_return'];
  const fieldZones = ['extraction_zone', 'extraction_pelican_zone', 'extraction_spirit_zone'];
  for (const leg of nativeTransportLegs(options)) {
    const insertion = leg === 'outbound';
    const pad = insertion ? options.field : options.hub;
    const required = insertion ? field : hub;
    const opposite = insertion ? hubZones : fieldZones;
    if (nativeTransportRecording(options, leg)) {
      if (pad !== required || volumes.filter(volume => volume === pad).length !== 1) {
        return 'Select ' + required + ' for the recorded flight so the controller and Forerunner use the same pad.';
      }
      continue;
    }
    if (!routes) return 'Read native transport source to inspect the actual flight commands and pad bounds.';
    const name = nativeTransportAiRoute(options, leg);
    const selected = routes.filter(route => route.name === name);
    if (selected.length !== 1) return 'Choose a unique native flight route for ' + (pad || 'each pad') + '.';
    const [route] = selected;
    if (route.issue) return route.issue;
    if (!route.finalPosition || !route.arrivalVolumes.includes(pad)) {
      return 'Route ' + name + ' final aircraft-origin point is not verified inside pad ' + pad + '. Review its final point and the pad geometry; fixed or unreadable volumes cannot be certified by this profile.';
    }
    const conflictingArea = opposite.find(area => route.arrivalVolumes.includes(area));
    if (!route.arrivalVolumes.includes(required) || conflictingArea) {
      return 'Forerunner extraction requires route ' + name + ' to finish inside ' + required + ' and outside ' + (conflictingArea ?? opposite[0]) + '. A custom pad must have its final route point inside the supported runtime mission area.';
    }
  }
  return null;
}
export interface ToolLaunchPlan {
  id: string;
  runtimeId: RuntimeId;
  actionId: string;
  projectId: string;
  buildId: string;
  executable: string;
  executableSha256: string;
  executableArchitecture: string;
  workingDirectory: string;
  tagsDirectory: string;
  scenarioFile: string;
  arguments: string[];
  startupScript: string | null;
  expiresAtUnix: number;
  detail: string;
}
export interface ToolProcessView {
  id: string;
  actionId: string;
  projectId: string;
  processId: number;
  status: string;
  exitCode: number | null;
  detail: string;
}
export interface CommunityServer {
  id: string;
  provider: string;
  source: string;
  name: string;
  map: { family: string; name: string; pack: string | null; displayName: string };
  gameType: string;
  mode: string;
  players: number;
  advertisedCapacity: number;
  open: boolean;
  locked: boolean;
  inProgress: boolean;
  legacyNetworkVersion: number;
  protocol: string;
  build: string | null;
  platform: string | null;
  hosting: string;
  region: string | null;
  providerVerified: boolean;
  fetchedAtUnix: number;
  advertisementAgeSeconds: number;
}
export interface CommunityListingView {
  listing: {
    provider: string;
    fetchedAtUnix: number;
    expiresAtUnix: number;
    servers: CommunityServer[];
    rejectedRows: number;
    diagnostics: string[];
  } | null;
  stale: boolean;
  refreshAfterUnix: number;
  fetching: boolean;
  error: string | null;
}
export interface CommunityJoinAssessment {
  dataRoot?: string | null;
  readiness: 'blocked' | 'readyForRuntimeCheck';
  runtimeId: RuntimeId;
  registrationId: string;
  issues: { code: string; summary: string; setupRoute: string }[];
  limitations: string[];
  connectionOutcome: string;
  preflightId: string | null;
  executableSha256: string;
  expiresAtUnix: number;
}
export type ContentProbeTarget =
  'mccHalo1' | 'sparkInspection' | 'chupathingyCe' | 'openCe' | 'experimentalRemix';
export interface OwnedContentProbe {
  target: ContentProbeTarget;
  sourceGeneration: string;
  complete: boolean;
  files: {
    relativePath: string;
    kind: string;
    bytes: number;
    status: string;
    detail: string;
    cache: { version: number; name: string; tagCount: number; tagClasses: Record<string, number> } | null;
  }[];
  operations: {
    operation: string;
    status: string;
    detail: string;
    prerequisites: { id: string; status: string; supplies: string[]; detail: string }[];
  }[];
  limitations: string[];
  nextLoaderSlice: string;
}
export function listingExpired(view: CommunityListingView | null, time = Date.now()): boolean {
  return !view?.listing || view.stale || time >= view.listing.expiresAtUnix * 1000;
}
export function canHandoff(
  assessment: CommunityJoinAssessment | null,
  view: CommunityListingView | null,
  time = Date.now(),
): boolean {
  return (
    assessment?.readiness === 'readyForRuntimeCheck' &&
    !!assessment.preflightId &&
    time < assessment.expiresAtUnix * 1000 &&
    !listingExpired(view, time)
  );
}

/** Relocate only paths owned by the old installation; external data stays explicit. */
export function relocateRuntimeRegistration(registration:RuntimeRegistration,root:string):RuntimeRegistration {
  const clean=(value:string)=>value.replaceAll('\\','/').replace(/\/+$/,'');
  const old=clean(registration.root),next=clean(root);
  const relocate=(value:string|null,fallback:string|null)=>{
    if(!value)return fallback;
    const path=clean(value);
    if(old&&path.toLowerCase()===old.toLowerCase())return next;
    if(old&&path.toLowerCase().startsWith(old.toLowerCase()+'/'))return next+path.slice(old.length);
    return value;
  };
  const executable=relocate(registration.executable,next+'/'+(registration.runtimeId==='haloCustomEdition'?'haloce.exe':'halo.exe'))!;
  return {...registration,root,executable,dataRoot:relocate(registration.dataRoot,next)};
}

/** Read-only version-1 response; operation names never authorize arbitrary calls. */
export interface CompanionRuntimeDiscovery {
 registrationId:string; executableSha256:string; capabilitiesSha256?:string;dependencySha256?:string|null;reviewIssue?:string|null;
 capabilities:{schema:'spark-forerunner.runtime-capabilities';contract_version:1;engine:'Forerunner';
 build:{upstream_version:string;commit:string;platform:string;architecture:string};simulation_hz:number;
 network:{advertised_version:number;native_layout_version:number};operations:string[];process_entrypoints:string[];
 native_features?:string[];
 map_targets?: { cache_version: number; tag_space_bytes: number; invader_engine: string; required_feature?: string; default: boolean; max_netgame_flags?: number }[];
 /** Advertising alone grants nothing; explicit profile review pins the supported startup contract. */
 startup_map?:{setting:string;environment:string;selector:string;cache_version:number;scenario_type:string;
 profile:string;fresh_start:boolean;network_host:boolean};upstream_projects:string[]};
}
