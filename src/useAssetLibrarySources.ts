import { useMemo, useSyncExternalStore } from 'react';
import type { AssetSourceDocument } from './assetSources';
import { assetSourceEvent, mergeAssetSources } from './assetSources';
import type { OpenProject } from './types';
let retained: OpenProject[] = [];
const listeners = new Set<() => void>();
if (typeof window !== 'undefined')
  window.addEventListener(assetSourceEvent, (event) => {
    const open = (event as CustomEvent<OpenProject>).detail;
    if (!open?.project?.id || !open.inspection) return;
    retained = [...retained.filter((row) => row.project.id !== open.project.id), open].slice(-6);
    listeners.forEach((listener) => listener());
  });
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => retained;
export function useAssetLibrarySources(documents: AssetSourceDocument[]) {
  const sources = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => mergeAssetSources(documents, sources), [documents, sources]);
}
