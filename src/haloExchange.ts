/** Read-only cross-map tag reference interchange. This is NOT binary tag extraction.
 * A tag can only be admitted to the palette if the locally inspected source
 * cache has the exact SHA-256, cache version, datum ID, class and path.
 */
import type { OpenProject, Tag, MapInspection } from './types';

export interface ExchangeReference {
  label: string;
  class: string;
  path: string | null;
  targetId: number;
}
export interface ExchangeTag {
  id: number;
  class: string;
  path: string;
  dependencies: ExchangeReference[];
}
export interface TagExchangeBundle {
  format: 'guilty-spark-tag-reference-bundle';
  version: 1;
  gameDataIncluded: false;
  source: {
    sha256: string;
    cacheVersion: number;
    engine: string;
    scenarioPath: string;
  };
  tags: ExchangeTag[];
  notice: string;
}
const notice = 'Tag names, dependency identities and source hash only. NO Halo tag bytes, resources, texture images, gameplay-ready tags or licenses are included. Extract real tags separately with an authorized tool into isolated output.';
const hexSha = (s:string) => /^[0-9a-f]{64}$/i.test(s);
const safePath = (s:string) => s.length>0 && s.length<=256 &&
  !s.startsWith('/') && !s.startsWith('\\') && !/^[A-Za-z]:/.test(s) &&
  !s.split(/[\\/]/).some(part=>!part || part==='.' || part==='..') &&
  /^[A-Za-z0-9 _\\/.'()!#-]+$/.test(s);
const safeClass = (s:string) => /^[a-zA-Z0-9!#@ ]{4}$/.test(s);
function isTag(t: Tag): boolean {
  return Number.isSafeInteger(t.id) && t.id>=0 && t.id<=0xffffffff && safeClass(t.class) && safePath(t.path);
}
const identity=(tag:Pick<Tag,'class'|'path'>) => tag.class.toLowerCase()+':'+tag.path.replace(/\\/g,'/').toLowerCase();
function verifiedSource(open: OpenProject): MapInspection {
  if (!open.inspection || !open.project.source) throw new Error('An inspected local cache is required');
  if (!hexSha(open.inspection.sha256) || open.inspection.sha256.toLowerCase()!==open.project.source.sha256.toLowerCase())
    throw new Error('Preserved source SHA-256 does not match the inspected map');
  if (!Number.isSafeInteger(open.inspection.header.version)) throw new Error('Unknown cache version');
  return open.inspection;
}
/** Source tag bytes NEVER enter this bundle. References remain tied to one cache. */
export function createTagExchangeBundle(open:OpenProject,tagIds:number[]):TagExchangeBundle {
  const inspection=verifiedSource(open);
  if (!Array.isArray(tagIds) || !tagIds.length || tagIds.length>128) throw new Error('Select 1-128 tags');
  const byId=new Map(inspection.tags.map(tag=>[tag.id,tag]));
  const tags:ExchangeTag[]=[];
  const selected=new Set<number>();
  for (const id of tagIds) {
    if (!Number.isSafeInteger(id) || selected.has(id)) throw new Error('Invalid or duplicate tag ID');
    selected.add(id);
    const tag=byId.get(id);
    if (!tag || !isTag(tag)) throw new Error('Selected tag is missing or has an unsafe identity');
    if (open.project.tagEdits?.some(edit=>edit.tagId===id))
      throw new Error('Selected tag has staged edits; a cache-only reference bundle would silently omit those changes. Export the original tag separately or preserve a full staged-edit recipe.');
    if (!Array.isArray(tag.references) || tag.references.length>256)
      throw new Error('This tag has over 256 indexed references; exporting a partial dependency set would silently lose data');
    const dependencies:ExchangeReference[]=[];
    for (const ref of tag.references) {
      if (!ref || !Number.isSafeInteger(ref.targetId) || ref.targetId<0 || ref.targetId>0xffffffff ||
          !safeClass(ref.class) || typeof ref.label!=='string' || !/^[\x20-\x7e]{0,80}$/.test(ref.label))
        throw new Error('Tag has an unsafe or unsupported indexed reference; no partial export was made');
      const target=byId.get(ref.targetId);
      dependencies.push({
        label:ref.label,class:ref.class,
        // A datum which points to a different class is not a verified path.
        path:target && isTag(target) && target.class===ref.class ? target.path : null,
        targetId:ref.targetId,
      });
    }
    tags.push({id:tag.id,class:tag.class,path:tag.path,dependencies});
  }
  return {
    format:'guilty-spark-tag-reference-bundle',version:1,gameDataIncluded:false,
    source:{
      sha256:inspection.sha256.toLowerCase(),cacheVersion:inspection.header.version,
      engine:inspection.header.engine.slice(0,64),scenarioPath:inspection.scenarioPath.slice(0,256),
    },tags,notice,
  };
}
/** Parse untrusted manifests with fixed size, shape, identity and duplication bounds. */
export function parseTagExchangeBundle(input:string):TagExchangeBundle {
  if (typeof input!=='string' || input.length>524288) throw new Error('Reference manifest exceeds 512 KiB');
  let json:unknown;
  try { json=JSON.parse(input); } catch { throw new Error('Invalid tag reference JSON'); }
  if (!json || typeof json!=='object') throw new Error('Invalid tag reference bundle');
  const b=json as Partial<TagExchangeBundle>;
  if (b.format!=='guilty-spark-tag-reference-bundle'||b.version!==1||b.gameDataIncluded!==false ||
      !b.source || typeof b.source!=='object' || !Array.isArray(b.tags) || !b.tags.length||b.tags.length>128 ||
      !hexSha(b.source.sha256 ?? '') || !Number.isSafeInteger(b.source.cacheVersion) ||
      typeof b.source.engine!=='string' || !/^[\x20-\x7e]{1,64}$/.test(b.source.engine) ||
      /[\\/:]/.test(b.source.engine) ||
      typeof b.source.scenarioPath!=='string' || b.source.scenarioPath.length>256 ||
      /[\x00-\x1f]/.test(b.source.scenarioPath)) throw new Error('Unsupported or unsafe tag bundle');
  const seen=new Set<string>();
  const seenIds=new Set<number>();
  const tags:ExchangeTag[]=b.tags.map((tag:ExchangeTag)=>{
    if (!tag || !Number.isSafeInteger(tag.id) || tag.id<0 || tag.id>0xffffffff || !safeClass(tag.class) || !safePath(tag.path) ||
        !Array.isArray(tag.dependencies) || tag.dependencies.length>256) throw new Error('Unsafe tag record');
    const key=identity(tag);
    if (seen.has(key)) throw new Error('Duplicate tag class/path');
    if (seenIds.has(tag.id)) throw new Error('Duplicate source tag datum ID');
    seen.add(key); seenIds.add(tag.id);
    const deps:ExchangeReference[]=tag.dependencies.map((dep:ExchangeReference)=>{
      if (!dep || typeof dep.label!=='string' || !/^[\x20-\x7e]{0,80}$/.test(dep.label) || !safeClass(dep.class) ||
          !Number.isSafeInteger(dep.targetId) || dep.targetId<0 || dep.targetId>0xffffffff ||
          (dep.path!==null && (typeof dep.path!=='string'||!safePath(dep.path)))) throw new Error('Unsafe dependency reference');
      return {label:dep.label,class:dep.class,path:dep.path,targetId:dep.targetId};
    });
    return {id:tag.id,class:tag.class,path:tag.path,dependencies:deps};
  });
  return {
    format:'guilty-spark-tag-reference-bundle',version:1,gameDataIncluded:false,
    source:{sha256:b.source.sha256!.toLowerCase(),cacheVersion:b.source.cacheVersion!,engine:b.source.engine!,scenarioPath:b.source.scenarioPath!},
    tags,notice,
  };
}
export interface ExchangeResolution {matched:Tag[]; missing:string[]; resolvedDependencies:number; unresolvedDependencies:number; }
export function resolveTagExchangeBundle(bundle:TagExchangeBundle,open:OpenProject):ExchangeResolution {
  // Re-parse even in-app bundles, to avoid trusting forged JSON/state.
  const b=parseTagExchangeBundle(JSON.stringify(bundle));
  const inspection=verifiedSource(open);
  if (inspection.sha256.toLowerCase()!==b.source.sha256 || inspection.header.version!==b.source.cacheVersion)
    throw new Error('This reference manifest belongs to a different cache. Select/import the exact source map first.');
  const byId=new Map(inspection.tags.map(tag=>[tag.id,tag]));
  const matched:Tag[]=[],missing:string[]=[];
  let resolvedDependencies=0,unresolvedDependencies=0;
  for (const entry of b.tags) {
    const actual=byId.get(entry.id);
    if (!actual || identity(actual)!==identity(entry)) {missing.push(`${entry.class}:${entry.path}`);continue;}
    matched.push(actual);
    for (const ref of entry.dependencies) {
      const actualDependency=byId.get(ref.targetId);
      if (ref.path && actualDependency && identity(actualDependency)===identity({path:ref.path,class:ref.class})) resolvedDependencies++;
      else unresolvedDependencies++;
    }
  }
  return {matched,missing,resolvedDependencies,unresolvedDependencies};
}
/** Explicit argv PREVIEW for an independently verified local Invader installation.
 * This does not execute tools or write to the Halo installation. No shell interpolation.
 */
export function invaderExtractionArguments(tag:ExchangeTag):string[] {
  if (!Number.isSafeInteger(tag.id)||!safeClass(tag.class)||!safePath(tag.path))throw new Error('Unsafe extraction target');
  return ['--recursive','--search',`${tag.path.replace(/\//g,'\\')}.${tag.class}`,'--tags','<new-isolated-tags-folder>','--maps','<read-only-maps-folder>','<source-map-file>'];
}
