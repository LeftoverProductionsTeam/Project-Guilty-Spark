import type { RuntimeId, RuntimeRegistration } from './types';

export const PREFERRED_RUNTIME:RuntimeId='chupathingyCe';
export type OpenCeFlavor = 'opence' | 'faber' | 'openh1';

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
 const identity=[profile.id,profile.version??'',profile.root.replaceAll('\\','/').split('/').filter(Boolean).at(-1)??''].join(' ');
 return profile.runtimeId==='chupathingyCe'?'ChupathingyCE':/openh1/i.test(identity)?'OpenH1':/faber/i.test(identity)?'Faber':runtimeNames[profile.runtimeId];
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
  workingSource?: { buildId: string; tagsDirectory: string } | null;
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
