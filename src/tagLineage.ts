/**
 * 07 Halo Modding Brain: bounded, provenance-bound reference archaeology.
 * Operates on the read-only parsed cache index and .gsproject reference overlays.
 * This is NOT a complete tag dependency resolver, binary tag export or compiler.
 */
import { effectiveReferenceId } from './editor';
import type { MapInspection, Project, Tag } from './types';

export type LineageEdgeStatus =
  'resolved' | 'cycle' | 'missing' | 'ambiguous-datum' | 'class-mismatch' |
  'invalid-reference' | 'depth-limit' | 'node-limit';
export interface LineageNode {
  tagId: number;
  tagClass: string;
  depth: number;
  externalTagBody: boolean;
  editedReferences: boolean;
}
export interface LineageEdge {
  fromId: number;
  targetId: number | null;
  expectedClass: string;
  actualClass: string | null;
  label: string;
  depth: number;
  edited: boolean;
  status: LineageEdgeStatus;
}
export interface IncomingTagReference {
  fromId: number;
  tagClass: string;
  edited: boolean;
}
export interface TagLineageReport {
  format: 'guilty-spark-tag-lineage/v1';
  sourceSha256: string;
  cacheVersion: number;
  root: {tagId: number; tagClass: string};
  nodes: LineageNode[];
  edges: LineageEdge[];
  incoming: IncomingTagReference[];
  incomingObserved: number;
  scans: {tagsIndexed: number; inboundReferencesScanned: number; indexedReferenceFieldsMissing: number};
  issues: {missing: number; wrongClass: number; ambiguous: number; invalid: number; cycles: number; externalTagBodies: number; edited: number};
  limits: {maxDepth: number; maxNodes: number; maxEdges: number; maxReferencesPerTag: number; maxInboundReferences: number};
  truncations: string[];
  evidence: {sameSourceInspection: true; completeTagDependencyTree: false; binaryTagExported: false; compilerVerified: false; gameplayVerified: false};
}
const SHA = /^[0-9a-f]{64}$/i;
const DATUM_MAX = 0xffffffff;
const MAX_TAGS = 32768;
const MAX_DEPTH = 5;
const MAX_NODES = 96;
const MAX_EDGES = 384;
const MAX_TAG_REFS = 128;
const MAX_INBOUND_REFS = 120000;
const MAX_INCOMING_SHOWN = 24;
const validId = (id:unknown):id is number => Number.isSafeInteger(id) && (id as number)>=0 && (id as number)<=DATUM_MAX;
const validClass = (value:unknown):value is string => typeof value==='string' && /^[\x20-\x7e]{4}$/.test(value);

function ensureSource(project:Project,inspection:MapInspection):string {
  const fromProject=project.source?.sha256;
  const fromInspection=inspection?.sha256;
  if(typeof fromProject!=='string'||typeof fromInspection!=='string'||!SHA.test(fromProject)||
      !SHA.test(fromInspection)||fromProject.toLowerCase()!==fromInspection.toLowerCase())
    throw new Error('Tag lineage requires an inspection of the exact preserved source SHA-256');
  if(!Number.isSafeInteger(inspection.header?.version) || inspection.header.version<0)
    throw new Error('Tag lineage requires a valid cache version');
  if(!Array.isArray(inspection.tags) || inspection.tags.length>MAX_TAGS)
    throw new Error('Tag index is unavailable or exceeds the bounded lineage inspector');
  return fromProject.toLowerCase();
}

export function inspectTagLineage(project:Project,inspection:MapInspection,rootId:number):TagLineageReport {
  const sourceSha256=ensureSource(project,inspection);
  if(!validId(rootId)) throw new Error('Invalid root tag datum');
  const byId=new Map<number,Tag>();
  const duplicates=new Set<number>();
  for(const tag of inspection.tags){
    if(!tag||!validId(tag.id)||!validClass(tag.class)||!Array.isArray(tag.references))
      throw new Error('Tag table contains an invalid identity or reference list');
    if(byId.has(tag.id))duplicates.add(tag.id);
    else byId.set(tag.id,tag);
  }
  const root=byId.get(rootId);
  if(!root || duplicates.has(rootId))throw new Error('Root tag is absent or has an ambiguous datum ID');
  const nodes:LineageNode[]=[{tagId:root.id,tagClass:root.class,depth:0,externalTagBody:!!root.external,editedReferences:false}];
  const edges:LineageEdge[]=[];
  const visited=new Map<number,number>([[root.id,0]]);
  const truncations=new Set<string>();
  const issues={missing:0,wrongClass:0,ambiguous:0,invalid:0,cycles:0,externalTagBodies:root.external?1:0,edited:0};
  let unindexedFields=0;
  let stopped=false;
  const queue:{id:number;depth:number;trail:number[]}[]=[{id:root.id,depth:0,trail:[root.id]}];
  for(let cursor=0;cursor<queue.length && !stopped;cursor++) {
    const {id,depth,trail}=queue[cursor];
    const tag=byId.get(id)!;
    const nodeIndex=visited.get(id)!;
    if(tag.references.length>MAX_TAG_REFS)truncations.add('reference-per-tag limit');
    const fieldOffsets=new Set(tag.references.filter(r=>r&&Number.isSafeInteger(r.offset)).map(r=>r.offset));
    unindexedFields+=Array.isArray(tag.fields)?tag.fields.filter(f=>f?.kind==='reference'&&!fieldOffsets.has(f.offset)).length:0;
    for(const ref of tag.references.slice(0,MAX_TAG_REFS)) {
      if(edges.length>=MAX_EDGES){truncations.add('edge limit');stopped=true;break;}
      const valid=!!ref&&validId(ref.targetId)&&validClass(ref.class)&&Number.isSafeInteger(ref.offset)&&ref.offset>=0;
      const targetId=valid?effectiveReferenceId(project,tag,ref):null;
      const edited=valid && targetId!==ref.targetId;
      if(edited){issues.edited++;nodes[nodeIndex].editedReferences=true;}
      let status:LineageEdgeStatus='resolved';
      let target:Tag|undefined;
      if(!valid || !validId(targetId)){status='invalid-reference';issues.invalid++;}
      else if(duplicates.has(targetId)){status='ambiguous-datum';issues.ambiguous++;}
      else if(!(target=byId.get(targetId))){status='missing';issues.missing++;}
      else if(target.class!==ref.class){status='class-mismatch';issues.wrongClass++;}
      else if(trail.includes(targetId)){status='cycle';issues.cycles++;}
      else if(!visited.has(targetId) && depth>=MAX_DEPTH){status='depth-limit';truncations.add('depth limit');}
      else if(!visited.has(targetId) && nodes.length>=MAX_NODES){status='node-limit';truncations.add('node limit');}
      else if(!visited.has(targetId)) {
        visited.set(targetId,nodes.length);
        nodes.push({tagId:targetId,tagClass:target.class,depth:depth+1,externalTagBody:!!target.external,editedReferences:false});
        if(target.external)issues.externalTagBodies++;
        queue.push({id:targetId,depth:depth+1,trail:[...trail,targetId]});
      }
      edges.push({fromId:id,targetId:validId(targetId)?targetId:null,
        expectedClass:valid?ref.class:'????',actualClass:target?.class??null,
        label:typeof ref?.label==='string'?ref.label.slice(0,80):'Unknown field',depth:depth+1,
        edited:!!edited,status});
    }
  }
  // Bounded reverse lookup gives creators 'which inspected tags use this tag?'.
  // Never imply the native index enumerates every Halo tag reference field.
  const incoming:IncomingTagReference[]=[];
  let incomingObserved=0,inboundReferencesScanned=0;
  outer:for(const tag of inspection.tags){
    if(tag.references.length>MAX_TAG_REFS)truncations.add('inbound reference-per-tag limit');
    for(const ref of tag.references.slice(0,MAX_TAG_REFS)){
      if(inboundReferencesScanned>=MAX_INBOUND_REFS){truncations.add('inbound scan limit');break outer;}
      inboundReferencesScanned++;
      if(!ref||!validId(ref.targetId)||!validClass(ref.class)||!Number.isSafeInteger(ref.offset))continue;
      const targetId=effectiveReferenceId(project,tag,ref);
      if(targetId!==rootId || ref.class!==root.class)continue;
      incomingObserved++;
      if(incoming.length<MAX_INCOMING_SHOWN)incoming.push({fromId:tag.id,tagClass:tag.class,edited:targetId!==ref.targetId});
    }
  }
  if(incomingObserved>MAX_INCOMING_SHOWN)truncations.add('incoming display limit');
  return {format:'guilty-spark-tag-lineage/v1',sourceSha256,cacheVersion:inspection.header.version,
    root:{tagId:root.id,tagClass:root.class},nodes,edges,incoming,incomingObserved,
    scans:{tagsIndexed:inspection.tags.length,inboundReferencesScanned,indexedReferenceFieldsMissing:unindexedFields},
    issues,limits:{maxDepth:MAX_DEPTH,maxNodes:MAX_NODES,maxEdges:MAX_EDGES,
      maxReferencesPerTag:MAX_TAG_REFS,maxInboundReferences:MAX_INBOUND_REFS},
    truncations:[...truncations].sort(),evidence:{sameSourceInspection:true,completeTagDependencyTree:false,
      binaryTagExported:false,compilerVerified:false,gameplayVerified:false}};
}

/** A path-free, asset-free safety report: explicitly includes no tag names,
 * machine paths, pixel/audio data, user provenance text or compiler claims. */
export function exportTagLineageReport(report:TagLineageReport):string {
  const r={format:report.format,sourceSha256:report.sourceSha256,cacheVersion:report.cacheVersion,
    root:report.root,nodes:report.nodes.map(n=>({tagId:n.tagId,tagClass:n.tagClass,depth:n.depth,externalTagBody:n.externalTagBody,editedReferences:n.editedReferences})),
    edges:report.edges.map(e=>({fromId:e.fromId,targetId:e.targetId,expectedClass:e.expectedClass,
      actualClass:e.actualClass,depth:e.depth,edited:e.edited,status:e.status})),
    incoming:report.incoming,incomingObserved:report.incomingObserved,scans:report.scans,
    issues:report.issues,limits:report.limits,truncations:report.truncations,evidence:report.evidence,
    notice:'Read-only cache reference archaeology, not exhaustive binary tag dependencies or game build validation. Original assets and tag paths are excluded.'};
  const json=JSON.stringify(r,null,2);
  if(json.length>250000)throw new Error('Lineage report exceeds the export limit');
  return json;
}
