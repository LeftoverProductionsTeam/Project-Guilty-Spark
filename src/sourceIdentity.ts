import type { MapInspection, OpenProject, Project, RuntimeId } from './types';
import {textureResourceScope} from './textureResourceScope';
export type NativeRouteStatus = 'available'|'requiresPreflight'|'unsupported'|'requiresSource';
const normalize=(value:string)=>value.replaceAll('\\','/').toLowerCase();
/** Source response/cache identity includes both bitmap and audio bindings. */
export function mapSourceIdentityKey(project:Pick<Project,'id'|'source'>) {
  const source=project.source,audio=source?.audioResources;
  return JSON.stringify([project.id,source?.originalPath,source?.preservedPath,source?.cacheVersion,
    normalize(source?.scenarioPath??''),textureResourceScope(source),audio?.kind??null,audio?.directory??null,
    Object.entries(audio?.sha256??{}).sort(([a],[b])=>a.localeCompare(b))]);
}
export interface NativeSourceRoute {operation:string;status:NativeRouteStatus;detail:string}
/** Read-only native facts. Counts and candidate sources never grant writes. */
export interface MapSourceIdentity {
  schemaVersion: 1;
  projectId: string;
  source: NonNullable<Project['source']>;
  format: string;
  runtimeOrigin: { runtimeId: RuntimeId; root: string; executableSha256: string | null } | null;
  runtimeInstallations: {runtimeId:RuntimeId;root:string;executableSha256:string|null;originalLocation:boolean;cacheFamilyMatches:boolean}[];
  contract: {cacheVersion:number;edition:string;platformAmbiguous:boolean;build:string;extended:boolean;compressed:boolean;
    operations:NativeSourceRoute[];compilationTargets:NativeSourceRoute[];runtimeFamilyCandidates:RuntimeId[]};
  resources: MapInspection['resources'];
  readback: { renderTriangles: number; collisionTriangles: number; modelTypes: number; tags: number; typedFields: number };
  configuredBuildTargets: string[];
  candidatePreviewRuntimes: RuntimeId[];
}
/** Shared native-response binding. Hosting preferences are intentionally absent. */
export function assertMapSourceIdentity(identity: MapSourceIdentity, project: Project, inspection?: MapInspection) {
  const source=project.source;
  if (!source || identity?.schemaVersion!==1 || identity.projectId!==project.id ||
    identity.source?.sha256!==source.sha256 || identity.source.cacheVersion!==source.cacheVersion ||
    identity.source.originalPath!==source.originalPath || identity.source.preservedPath!==source.preservedPath ||
    normalize(identity.source.scenarioPath)!==normalize(source.scenarioPath) ||
    mapSourceIdentityKey({id:identity.projectId,source:identity.source})!==mapSourceIdentityKey(project) ||
    (identity.contract && identity.contract.cacheVersion!==source.cacheVersion) ||
    (inspection && (identity.source.sha256!==inspection.sha256 || identity.source.cacheVersion!==inspection.header.version)))
    throw Error('The native response belongs to a different source or resource revision');
}
export interface MapTextureSource {
  identity: MapSourceIdentity;
  runtimeId: RuntimeId;
  open: OpenProject;
}
