import type { MapInspection, OpenProject, Project } from './types';
import { publishTextureResources } from './textureResourceScope';
export interface AssetSourceDocument {
  history: { current: Project | null };
  inspection: MapInspection | null;
}
export interface AssetSourceCandidate {
  id: string;
  name: string;
  location: string;
  engine: string;
  cacheVersion: number | null;
  archive: boolean;
  bytes: number;
}
export interface AssetSourceInventory {
  maps: AssetSourceCandidate[];
  notices: string[];
  elapsedMs: number;
}
export const assetSourceEvent = 'guilty-spark-asset-source-ready';
export function retainAssetSource(open: OpenProject) {
  publishTextureResources(open.project);
  window.dispatchEvent(new CustomEvent(assetSourceEvent, { detail: open }));
}
export function mergeAssetSources(
  primary: AssetSourceDocument[],
  background: OpenProject[],
): AssetSourceDocument[] {
  const present = new Set(primary.map((row) => row.history.current?.id));
  return [
    ...primary,
    ...background
      .filter((row) => !present.has(row.project.id))
      .map((row) => ({ history: { current: row.project }, inspection: row.inspection })),
  ];
}
