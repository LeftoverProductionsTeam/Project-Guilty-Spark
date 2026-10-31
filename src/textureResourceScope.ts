import { useSyncExternalStore } from 'react';
import type { Project } from './types';

/** Location and all pins affect failed-image retries. Camera/tag edits do not. */
export function textureResourceScope(source: Project['source'] | undefined): string {
  return source ? JSON.stringify([
    source.sha256, source.resourceDirectory ?? null,
    Object.entries(source.resourceSha256 ?? {}).sort(([a],[b])=>a.localeCompare(b)),
  ]) : '';
}
const scopes = new Map<string,string>();
const listeners = new Set<()=>void>();
const subscribe = (listener:()=>void) => { listeners.add(listener); return ()=>{listeners.delete(listener);}; };
/** Metadata only; never retain extra maps or pixels to keep a scope alive. */
export function publishTextureResources(project: Pick<Project,'id'|'source'>) {
  const next=textureResourceScope(project.source);
  if(scopes.get(project.id)===next)return;
  scopes.set(project.id,next);
  while(scopes.size>256)scopes.delete(scopes.keys().next().value!);
  for(const listener of listeners)listener();
}
export function useTextureResourceScope(projectId:string | null | undefined): string {
  return useSyncExternalStore(subscribe,()=>projectId ? scopes.get(projectId) ?? '' : '',()=> '');
}
export function useTextureResourceScopes(projectIds: readonly string[]): string {
  return useSyncExternalStore(subscribe,()=>JSON.stringify(projectIds.map(id=>[id,scopes.get(id)??''])),()=> '');
}
