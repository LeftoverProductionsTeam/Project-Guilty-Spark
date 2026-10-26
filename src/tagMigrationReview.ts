/**
 * 07 Halo Modding Brain: preview historical tag transplants without moving bytes.
 * This works exclusively on an owner-exported, bounded reference manifest and a
 * SHA-matched read-only destination cache inspection. Cache datum IDs are NEVER
 * treated as portable tag identities. No filesystem paths or executable actions.
 */
import { parseTagExchangeBundle } from './haloExchange.ts';
import type { ExchangeTag, TagExchangeBundle } from './haloExchange.ts';
import type { MapInspection, Project, Tag } from './types';

export type MigrationStatus = 'identity-present' | 'not-present' | 'class-conflict';
export type DependencyStatus =
  'present-in-target' | 'in-selected-source' | 'missing-from-target' |
  'class-conflict' | 'unknown-source-path' | 'inconsistent-source-reference';
export interface MigrationTagRow {
  class: string;
  path: string;
  status: MigrationStatus;
  /** A cache identity match is not evidence that two tags have the same bytes. */
  note: string;
}
export interface MigrationDependencyRow {
  fromClass: string;
  targetClass: string;
  targetPath: string | null;
  status: DependencyStatus;
}
export interface TagMigrationReview {
  format: 'guilty-spark-tag-migration-preview/v1';
  source: {sha256: string; cacheVersion: number; engine: string};
  target: {sha256: string; cacheVersion: number; engine: string};
  compatibility: 'same-engine-and-cache-version' | 'incompatible-or-unconfirmed';
  sameCache: boolean;
  selected: MigrationTagRow[];
  dependencies: MigrationDependencyRow[];
  counts: {
    selected: Record<MigrationStatus, number>;
    dependencies: Record<DependencyStatus, number>;
    dependencyReferencesScanned: number;
    displayedDependencyRows: number;
  };
  cautions: string[];
  limitations: {
    /** A cache tag index and selected immediate references are not a source tagset. */
    exhaustiveTagClosure: false;
    tagBytesTransferred: false;
    safeToOverwriteDestination: false;
    automaticEnginePorting: false;
    compiledMapVerified: false;
    inGameVerified: false;
  };
}
const SHA=/^[a-f0-9]{64}$/i;
const validClass=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9!#@ ]{4}$/.test(s);
const validPath=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=256&&
  !s.startsWith('/')&&!s.startsWith('\\')&&!/^[A-Za-z]:/.test(s)&&
  !s.split(/[\\/]/).some(part=>!part||part==='.'||part==='..')&&
  /^[A-Za-z0-9 _\\/.'()!#-]+$/.test(s);
const norm=(path:string)=>path.replace(/\\/g,'/').toLowerCase();
const key=(tag:Pick<ExchangeTag,'class'|'path'>)=>`${tag.class.toLowerCase()}:${norm(tag.path)}`;
const MAX_TARGET_TAGS=32768;
const MAX_DEPENDENCY_ROWS=96;

/** Plan only. The report is intentionally NEVER an import permission/command. */
export function reviewTagMigration(manifestJson:string,project:Project,inspection:MapInspection):TagMigrationReview {
  const bundle:TagExchangeBundle=parseTagExchangeBundle(manifestJson);
  if(!inspection || !project.source || !SHA.test(project.source.sha256) ||
      !SHA.test(inspection.sha256) || inspection.sha256.toLowerCase()!==project.source.sha256.toLowerCase() ||
      !Number.isSafeInteger(inspection.header?.version) ||
      inspection.header.version!==project.source.cacheVersion)
    throw new Error('Destination inspection does not match the preserved project source/cache version');
  if(!Array.isArray(inspection.tags)||inspection.tags.length>MAX_TARGET_TAGS)
    throw new Error('Destination tag index is absent or exceeds 32,768 entries');
  if(typeof inspection.header.engine!=='string' || !/^[\x20-\x7e]{1,64}$/.test(inspection.header.engine) ||
      /[\\/:]/.test(inspection.header.engine))
    throw new Error('Destination engine is not safely identified');
  const byIdentity=new Map<string,Tag>();
  const classesAtPath=new Map<string,Set<string>>();
  const tagIds=new Set<number>();
  for(const tag of inspection.tags) {
    if(!tag || !Number.isSafeInteger(tag.id) || tag.id<0 || tag.id>0xffffffff ||
        !validClass(tag.class) || !validPath(tag.path))
      throw new Error('Destination contains an unsafe or unrecognized tag identity');
    if(tagIds.has(tag.id) || byIdentity.has(key(tag)))
      throw new Error('Destination tag index has ambiguous duplicate datum or class/path identities');
    tagIds.add(tag.id);byIdentity.set(key(tag),tag);
    const at=norm(tag.path);if(!classesAtPath.has(at))classesAtPath.set(at,new Set());
    classesAtPath.get(at)!.add(tag.class.toLowerCase());
  }
  const sourceByDatum=new Map(bundle.tags.map(tag=>[tag.id,tag]));
  const selectedIdentity=new Set(bundle.tags.map(key));
  const selected:MigrationTagRow[]=[];
  const dependencies:MigrationDependencyRow[]=[];
  const selectedCounts:Record<MigrationStatus,number>={'identity-present':0,'not-present':0,'class-conflict':0};
  const dependencyCounts:Record<DependencyStatus,number>={
    'present-in-target':0,'in-selected-source':0,'missing-from-target':0,
    'class-conflict':0,'unknown-source-path':0,'inconsistent-source-reference':0,
  };
  let scanned=0;
  for(const tag of bundle.tags){
    const identity=key(tag);
    const status:MigrationStatus=byIdentity.has(identity)?'identity-present':
      classesAtPath.has(norm(tag.path))?'class-conflict':'not-present';
    selectedCounts[status]++;
    selected.push({class:tag.class,path:tag.path,status,
      note:status==='identity-present'?'Matching class/path only. Contents and processed fields may differ.':
        status==='class-conflict'?'Target uses this path under a different tag class; manual reconciliation required.':
          'Not present in inspected target cache; a real compatible source tag may need extraction.'});
    for(const ref of tag.dependencies) {
      scanned++;
      let disposition:DependencyStatus;
      if(ref.path===null){disposition='unknown-source-path';}
      else {
        const referenceId=sourceByDatum.get(ref.targetId);
        if(referenceId && (referenceId.class.toLowerCase()!==ref.class.toLowerCase() ||
          norm(referenceId.path)!==norm(ref.path))) disposition='inconsistent-source-reference';
        else if(byIdentity.has(`${ref.class.toLowerCase()}:${norm(ref.path)}`))disposition='present-in-target';
        else if(classesAtPath.has(norm(ref.path)))disposition='class-conflict';
        else if(selectedIdentity.has(`${ref.class.toLowerCase()}:${norm(ref.path)}`))disposition='in-selected-source';
        else disposition='missing-from-target';
      }
      dependencyCounts[disposition]++;
      if(dependencies.length<MAX_DEPENDENCY_ROWS)
        dependencies.push({fromClass:tag.class,targetClass:ref.class,targetPath:ref.path,status:disposition});
    }
  }
  const compatible=bundle.source.cacheVersion===inspection.header.version &&
    bundle.source.engine.trim().toLowerCase()===inspection.header.engine.trim().toLowerCase();
  const sameCache=bundle.source.sha256===inspection.sha256.toLowerCase();
  const cautions=[
    'Read-only reference comparison. No tag files were extracted, copied, overwritten or compiled.',
    'Cache datum IDs do not transfer between maps. Class/path matches do not establish identical tag data.',
    'Only selected tags and their indexed immediate references are visible. The actual recursive dependency graph may be larger.',
  ];
  if(!compatible)cautions.push('Engine name or cache version differs. Never automatically transplant these tags; use an edition-specific conversion/rebuild workflow.');
  if(sameCache)cautions.push('Source and destination hashes are identical: this is a self-comparison, not cross-map proof.');
  if(project.tagEdits.length)cautions.push('Target project contains staged tag edits; index comparisons do not validate their eventual compiled effect.');
  if(dependencyCounts['inconsistent-source-reference']) cautions.push('The manifest conflicts with itself: at least one selected tag datum is assigned a different class/path by a reference. Refuse unreviewed transfer.');
  if(dependencyCounts['unknown-source-path']) cautions.push('One or more referenced source tags have no verified path. A cache search cannot prove them resolved.');
  if(scanned>dependencies.length)cautions.push('Only the first 96 dependency rows are displayed; full counts cover every indexed reference in this manifest.');
  return {format:'guilty-spark-tag-migration-preview/v1',
    source:{sha256:bundle.source.sha256,cacheVersion:bundle.source.cacheVersion,engine:bundle.source.engine},
    target:{sha256:inspection.sha256.toLowerCase(),cacheVersion:inspection.header.version,engine:inspection.header.engine},
    compatibility:compatible?'same-engine-and-cache-version':'incompatible-or-unconfirmed',sameCache,
    selected,dependencies,counts:{selected:selectedCounts,dependencies:dependencyCounts,
      dependencyReferencesScanned:scanned,displayedDependencyRows:dependencies.length},cautions,
    limitations:{exhaustiveTagClosure:false,tagBytesTransferred:false,safeToOverwriteDestination:false,
      automaticEnginePorting:false,compiledMapVerified:false,inGameVerified:false}};
}

/** Private-path-free evidence for a historical creator's recovery notebook. */
export function exportTagMigrationReview(report:TagMigrationReview):string {
  if(report.format!=='guilty-spark-tag-migration-preview/v1'||!SHA.test(report.source.sha256)||!SHA.test(report.target.sha256)||
      report.limitations.tagBytesTransferred!==false||report.limitations.compiledMapVerified!==false||
      report.limitations.inGameVerified!==false||report.limitations.safeToOverwriteDestination!==false)
    throw new Error('The migration review is not a trusted, read-only source assessment');
  const out={format:report.format,source:report.source,target:report.target,
    compatibility:report.compatibility,sameCache:report.sameCache,counts:report.counts,
    selected:report.selected.slice(0,48).map((tag,index)=>({index,tagClass:tag.class,status:tag.status})),
    dependencies:report.dependencies.slice(0,48).map(d=>({fromClass:d.fromClass,targetClass:d.targetClass,status:d.status})),
    cautions:report.cautions,limitations:report.limitations,
    notice:'Metadata-only assessment: selected tag names, dependency paths, filesystem paths, executable paths, asset bytes and game content are deliberately omitted. No automatic import is authorized.'};
  const text=JSON.stringify(out,null,2);
  if(text.length>64_000 || /(?:[A-Za-z]:\\|\/(?:Users|home|mnt|Volumes)\/)/.test(text))
    throw new Error('Migration report exceeds the safe, path-free export limit');
  return text;
}
