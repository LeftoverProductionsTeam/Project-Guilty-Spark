import type { MapInspection, OpenProject, Project } from './types';
import { publishTextureResources } from './textureResourceScope';
import { call } from './api';
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


let inventoryPending: Promise<AssetSourceInventory> | null = null;
let inventoryStarted = 0, inventoryLoading = false;
export function discoverAssetSources(refresh = false): Promise<AssetSourceInventory> {
  if (!inventoryPending || (!inventoryLoading && (refresh || Date.now() - inventoryStarted > 30000))) {
    inventoryStarted = Date.now(); inventoryLoading = true;
    const pending: Promise<AssetSourceInventory> = call<AssetSourceInventory>('discover_asset_sources').then(value => {
      if (inventoryPending !== pending) return discoverAssetSources();
      inventoryLoading = false;
      return value;
    }, error => {
      if (inventoryPending !== pending) return discoverAssetSources();
      inventoryPending = null; inventoryLoading = false;
      throw error;
    });
    inventoryPending = pending;
  }
  return inventoryPending;
}
/** Adopt the native folder-link result so a focused selector cannot revive an older scan. */
export function updateAssetSourceInventory(inventory: AssetSourceInventory) {
  inventoryPending = Promise.resolve(inventory);
  inventoryStarted = Date.now(); inventoryLoading = false;
}
if (typeof window !== 'undefined') window.addEventListener('guilty-spark-runtime-connections-changed', () => {
  inventoryPending = null; inventoryLoading = false;
});
/** One existing native source opener for the browser and direct map selector.
 * Reading a donor never changes the destination or authorizes a placement. */
export async function loadAssetSource(sourceId: string): Promise<OpenProject[]> {
  const sources = await call<OpenProject[]>('open_asset_source', {sourceId, preparePreviewResources: true});
  const loaded: OpenProject[] = [];
  for (let source of sources) {
    const version = source.inspection?.header.version;
    if ((version === 13 && !source.project.source?.resourceSha256?.['mcc-textures']) || [6,7,609].includes(version ?? 0)) {
      try {source = await call<OpenProject | null>(version === 13 ? 'connect_mcc_texture_resources' : 'auto_connect_classic_textures', {projectId: source.project.id}) ?? source;}
      catch {/* Native import/build independently require complete matching resources. */}
    }
    retainAssetSource(source); loaded.push(source);
  }
  if (!loaded.length) throw Error('No supported maps in the selected archive.');
  return loaded;
}
