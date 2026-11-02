import type { MapInspection, OpenProject, Project, RuntimeId } from './types';
/** Read-only native facts. Counts and candidate sources never grant writes. */
export interface MapSourceIdentity {
  schemaVersion: 1;
  projectId: string;
  source: NonNullable<Project['source']>;
  format: string;
  runtimeOrigin: { runtimeId: RuntimeId; root: string; executableSha256: string | null } | null;
  resources: MapInspection['resources'];
  readback: { renderTriangles: number; collisionTriangles: number; modelTypes: number; tags: number; typedFields: number };
  configuredBuildTargets: string[];
  candidatePreviewRuntimes: RuntimeId[];
}
export interface MapTextureSource {
  identity: MapSourceIdentity;
  runtimeId: RuntimeId;
  open: OpenProject;
}
