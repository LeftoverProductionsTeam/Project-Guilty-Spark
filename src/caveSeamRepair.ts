/** Source-only Halo 1 tunnel seam repair planning.
 * Never patches a compiled .scenario_structure_bsp, collision tree or map.
 * Only a unique, small translation verified by the existing exact rim matcher
 * may be applied to an editable QuickForge document. No speculative rotations,
 * scaling, mesh welding or room/terrain Boolean operations are performed.
 */
import type { ForgeBrush, QuickForgeDocument } from './forge';
import type { Vec3 } from './types';
import { analyzeCaveJoins, cavePorts } from './caveJoinAnalysis.ts';

export interface CaveSeamSnap {
  movingBrushId: string;
  targetBrushId: string;
  movingEnd: 'near' | 'far';
  targetEnd: 'near' | 'far';
  distance: number;
  destination: Vec3;
  /** Applying this correction does not certify BSP, collision, portals or gameplay. */
  compileVerified: false;
}
export interface CaveExtensionIssue {
  code: 'TUNNEL_GAP' | 'TUNNEL_INCOMPATIBLE' | 'TUNNEL_THREE_WAY' | 'TUNNEL_ROOM_UNCUT' | 'TUNNEL_SCAN_BOUND';
  severity: 'error' | 'warning';
  brushIds: string[];
  message: string;
}
export interface CaveExtensionAudit {
  issues: CaveExtensionIssue[];
  corrections: CaveSeamSnap[];
  complete: boolean;
  compiledCollisionVerified: false;
}
const NEAR = 0.25; // maximum source edit in editor world units
const EPS = 0.000001;
const eq = (a: number,b: number,e=0.00001) => Math.abs(a-b)<=e;
const norm = (v:Vec3) => Math.hypot(...v);
const dot = (a:Vec3,b:Vec3) => a.reduce((s,x,i)=>s+x*b[i],0);
const difference=(a:Vec3,b:Vec3):Vec3 => a.map((x,i)=>x-b[i]) as Vec3;
function validBrushes(geometry: ForgeBrush[]): void {
  if(!Array.isArray(geometry) || geometry.length>256) throw new Error('Cave audit exceeds the 256-brush source limit');
  const ids = new Set<string>();
  for (const b of geometry) {
    if (!b || typeof b.id!=='string' || !b.id || ids.has(b.id)) throw new Error('Cave source has missing or duplicate brush IDs');
    ids.add(b.id);
    if(b.kind==='caveTunnel' && (!Number.isSafeInteger(b.steps) || b.steps<3 || b.steps>64 ||
        [...b.position,...b.dimensions,...b.rotation].some(n=>!Number.isFinite(n)) ||
        b.dimensions.some(n=>n<0.1 || n>512))) throw new Error('Cave source has unsupported dimensions or subdivisions');
  }
}
/** Exact validated plan for ONE bounded translation. Does not modify the input. */
export function planCaveSeamSnap(doc:Pick<QuickForgeDocument,'geometry'>, movingId:string,targetId:string):CaveSeamSnap {
  validBrushes(doc.geometry);
  if(movingId===targetId) throw new Error('A tunnel cannot join to itself');
  const moving=doc.geometry.find(b=>b.id===movingId),target=doc.geometry.find(b=>b.id===targetId);
  if(!moving||!target||moving.kind!=='caveTunnel'||target.kind!=='caveTunnel') throw new Error('Both endpoints must be editable cave tunnels');
  if(moving.locked) throw new Error('Locked tunnel cannot be moved');
  if(moving.steps!==target.steps || !eq(moving.dimensions[0],target.dimensions[0]) ||
     !eq(moving.dimensions[2],target.dimensions[2])) throw new Error('Tunnel mouths have different ring geometry');
  const candidates: CaveSeamSnap[] = [];
  for(const a of cavePorts(moving)) for(const b of cavePorts(target)) {
    const shift=difference(b.center,a.center),distance=norm(shift);
    if(distance<EPS || distance>NEAR || dot(a.outward,b.outward)>-0.9999)continue;
    const destination=moving.position.map((n,i)=>n+shift[i]) as Vec3;
    if(destination.some(n=>!Number.isFinite(n)||Math.abs(n)>1500))continue;
    const shifted={...moving,position:destination};
    const revised={geometry:doc.geometry.map(brush=>brush.id===movingId ? shifted : brush)};
    const before=analyzeCaveJoins(doc),after=analyzeCaveJoins(revised);
    // Entire ring matching, uniqueness and protection of all other existing
    // welds must survive the proposed edit. No partial/ambiguous source welds.
    const found=after.candidates.find(c=>c.sourceWeldEligible &&
      ((c.first.brushId===movingId && c.first.end===a.end && c.second.brushId===targetId && c.second.end===b.end) ||
       (c.second.brushId===movingId && c.second.end===a.end && c.first.brushId===targetId && c.first.end===b.end)));
    const previous=new Set(before.candidates.filter(c=>c.sourceWeldEligible).map(c=>
      [c.first.brushId+':'+c.first.end,c.second.brushId+':'+c.second.end].sort().join('|')));
    const current=new Set(after.candidates.filter(c=>c.sourceWeldEligible).map(c=>
      [c.first.brushId+':'+c.first.end,c.second.brushId+':'+c.second.end].sort().join('|')));
    if(!found || current.size!==previous.size+1 || [...previous].some(key=>!current.has(key)))continue;
    candidates.push({movingBrushId:movingId,targetBrushId:targetId,movingEnd:a.end,targetEnd:b.end,
      distance,destination,compileVerified:false});
  }
  if(candidates.length!==1) throw new Error(candidates.length ? 'Multiple candidate tunnel connections; manual review required' : 'No unique exact-ring source correction within 0.25 world units');
  return candidates[0];
}
/** Separate, reversible document update. Recompute the plan against CURRENT state;
 * a stale UI plan can never overwrite subsequent edits or move a locked brush.
 */
export function applyCaveSeamSnap(doc:QuickForgeDocument, requested:CaveSeamSnap):QuickForgeDocument {
  const current=planCaveSeamSnap(doc,requested.movingBrushId,requested.targetBrushId);
  if(current.movingEnd!==requested.movingEnd || current.targetEnd!==requested.targetEnd ||
     !eq(current.distance,requested.distance,1e-8) ||
     current.destination.some((n,i)=>!eq(n,requested.destination[i],1e-8))) throw new Error('Tunnel geometry changed since this repair was proposed. Reinspect before editing.');
  return {...doc, geometry:doc.geometry.map(b=>b.id===current.movingBrushId
    ? {...b, position:[...current.destination] as Vec3} : b)};
}

/** Potential Halo collision/structure failures: do not silently infer a room
 * opening from an aligned tunnel, and never call a near-miss a connected seam.
 */
export function auditCaveExtensions(doc:Pick<QuickForgeDocument,'geometry'>):CaveExtensionAudit {
  validBrushes(doc.geometry);
  const tunnels=doc.geometry.filter(b=>b.kind==='caveTunnel');
  if(!tunnels.length)return {issues:[],corrections:[],complete:true,compiledCollisionVerified:false};
  const issues:CaveExtensionIssue[]=[],corrections:CaveSeamSnap[]=[];
  if(tunnels.length>32){
    issues.push({code:'TUNNEL_SCAN_BOUND',severity:'error',brushIds:[],message:'More than 32 tunnels: bounded auto-repair scan refused. Split the source before exporting.'});
    return {issues,corrections,complete:false,compiledCollisionVerified:false};
  }
  const ports=tunnels.flatMap(cavePorts);
  const closeMatches=new Map<string,number>();
  const key=(id:string,end:'near'|'far')=>id+':'+end;
  const exact=analyzeCaveJoins(doc);
  for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++){
    const a=ports[i],b=ports[j];if(a.brushId===b.brushId)continue;
    const delta=difference(a.center,b.center),d=norm(delta);
    if(d>NEAR)continue;
    // Only opposing mouths form an apparent passage; parallel nearby endpoints
    // may be separate corridor geometry and need not be silently welded.
    if(dot(a.outward,b.outward)>-0.999)continue;
    const k1=key(a.brushId,a.end),k2=key(b.brushId,b.end);
    closeMatches.set(k1,(closeMatches.get(k1)??0)+1);
    closeMatches.set(k2,(closeMatches.get(k2)??0)+1);
    const match=exact.candidates.find(c=>
      (c.first.brushId===a.brushId && c.first.end===a.end && c.second.brushId===b.brushId && c.second.end===b.end) ||
      (c.second.brushId===a.brushId && c.second.end===a.end && c.first.brushId===b.brushId && c.first.end===b.end));
    if(d<=EPS && match?.sourceWeldEligible)continue;
    if(d>EPS){
      try{corrections.push(planCaveSeamSnap(doc,b.brushId,a.brushId));}
      catch{/* A mismatch is an error, not a guessed alignment fix. */}
    }
    issues.push({code:d>EPS?'TUNNEL_GAP':'TUNNEL_INCOMPATIBLE',severity:'error',
      brushIds:[a.brushId,b.brushId],message:d>EPS
        ? `Nearby opposing tunnel mouths are ${d.toFixed(4)} units apart, not welded. Snap a unique exact rim or separate the geometry before JMS export.`
        : 'Coincident tunnel mouths lack an exact unique rim weld. Check radii, segments and rotations.'});
  }
  for(const [name,count] of closeMatches)if(count>1){
    const id=name.split(':')[0];
    issues.push({code:'TUNNEL_THREE_WAY',severity:'error',brushIds:[id],message:'One tunnel mouth has multiple neighboring partners. Three-way automatic welding is unsafe.'});
  }
  // Conservative case: unrotated room wall has NOT been cut by the tunnel
  // source joiner. An aperture may only be created by an explicit modeling step.
  for(const tunnel of tunnels)for(const port of cavePorts(tunnel))for(const room of doc.geometry){
    if(room.kind!=='room' || room.id===tunnel.id ||
       room.rotation.some(v=>!eq(v,0)) || room.dimensions.some(v=>!Number.isFinite(v)||v<=0))continue;
    const offset=difference(port.center,room.position);
    for(let axis=0;axis<3;axis++){
      const face=Math.abs(Math.abs(offset[axis])-room.dimensions[axis]*0.5);
      if(face>0.05 || Math.abs(port.outward[axis])<0.99 ||
         [0,1,2].some(k=>k!==axis && Math.abs(offset[k])>room.dimensions[k]/2-0.05))continue;
      issues.push({code:'TUNNEL_ROOM_UNCUT',severity:'error',brushIds:[tunnel.id,room.id],
        message:'Tunnel mouth meets an uncut sealed room wall. The current generator cannot Boolean-cut this aperture; create a real connected source opening in a DCC tool first.'});
      break;
    }
  }
  return {issues,corrections:corrections.slice(0,16),complete:true,compiledCollisionVerified:false};
}
