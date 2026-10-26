/** Source-only Halo 1 BSP topology diagnostics.
 *
 * QuickForge intentionally generates independent flat-shaded vertices for
 * triangles. This read-only audit therefore builds a *quantized coordinate*
 * edge graph, rather than confusing split UV/normal vertices with open edges.
 * Geometric coincidence cannot prove a weld, collision partition, T-junction
 * freedom or valid portals. Halo Tool's structure output remains authoritative.
 * Reference: https://reclaimers.net/h1/guides/levels/bsp-troubleshooting/
 */
export interface MeshIntegrityReview {
  checkedTriangles: number;
  duplicateFaces: number;
  shortEdges: number;
  degenerateTriangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  windingConflicts: number;
  /** Coordinate-only edge with another distinct vertex strictly inside it; a compiler-risk candidate, not proof. */
  tJunctionEdges: number;
  /** False means the bounded T-junction scan was incomplete and zero findings is NOT clean evidence. */
  tJunctionScanComplete: boolean;
  tJunctionCandidatesChecked: number;
  connectedShellCandidates: number;
  openShellCandidates: number;
  edgeClosedShellCandidates: number;
  exampleDuplicateTriangles: number[];
  exampleShortEdges: number[];
  exampleDegenerateTriangles: number[];
  exampleBoundaryTriangles: number[];
  exampleNonManifoldTriangles: number[];
  exampleWindingTriangles: number[];
  exampleTJunctionTriangles: number[];
  note: string;
}
const TOLERANCE = 1e-6; // editor world units, for analysis ONLY, no vertex mutation
const SHORT_EDGE = 0.001; // 0.1 cm in the JMS x100 coordinate conversion
const AREA_EPSILON = 1e-10; // conservative 2*triangle area in world units squared
const LIMIT = 32000;
const KEY_FACTOR = 1 / TOLERANCE;
const SAMPLE_LIMIT = 16;
// Deliberately bounded: no file/mesh can cause an unbounded vertex-edge search.
const TJUNCTION_COMPARISON_LIMIT = 2_000_000;
const TJUNCTION_DISTANCE_EPSILON = 0.000005;
interface Edge { firstTriangle: number; count: number; directionSum: number;
  start: [number, number, number]; end: [number, number, number]; }
function sample(out: number[], index: number): void {
  if (out.length < SAMPLE_LIMIT) out.push(index);
}
/** Never changes source geometry and never reads or edits a Halo map/tag. */
export function auditQuickForgeMesh(mesh: { positions: number[]; indices: number[] }): MeshIntegrityReview {
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices) ||
      mesh.positions.length % 3 || mesh.indices.length % 3 || !mesh.indices.length ||
      mesh.indices.length / 3 > LIMIT || mesh.positions.length / 3 > LIMIT * 3 ||
      !mesh.positions.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2048))
    throw new Error('Mesh integrity audit cannot inspect malformed or oversized source buffers');
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = mesh.indices.length / 3;
  if (!mesh.indices.every(n => Number.isSafeInteger(n) && n >= 0 && n < vertexCount))
    throw new Error('Mesh integrity audit rejected invalid indices');

  const p = (index: number): [number, number, number] =>
    [mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]];
  const byIndex = new Map<number, string>();
  const uniquePointPositions = new Map<string, [number, number, number]>();
  const vertexKey = (index: number): string => {
    let key = byIndex.get(index);
    if (key === undefined) {
      const coords = p(index);
      key = coords.map(v => Math.round(v * KEY_FACTOR)).join(':');
      byIndex.set(index, key);
      if (!uniquePointPositions.has(key)) uniquePointPositions.set(key, coords);
    }
    return key;
  };
  // Connectivity is per triangle, not per vertex: two independent flat-shaded
  // triangles can share a source edge even when they use disjoint vertex IDs.
  const parents = new Int32Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) parents[t] = t;
  const find = (id: number): number => {
    while (parents[id] !== id) {
      parents[id] = parents[parents[id]];
      id = parents[id];
    }
    return id;
  };
  const union = (left: number, right: number): void => {
    const l = find(left), r = find(right);
    if (l !== r) parents[r] = l;
  };

  const faces = new Map<string, number>();
  const edges = new Map<string, Edge>();
  const duplicateExamples: number[] = [], shortExamples: number[] = [],
    degenerateExamples: number[] = [], boundaryExamples: number[] = [],
    nonManifoldExamples: number[] = [], windingExamples: number[] = [];
  let duplicateFaces = 0, shortEdges = 0, degenerateTriangles = 0;
  const badTriangle = new Uint8Array(triangleCount);
  for (let t = 0; t < triangleCount; t++) {
    const ids = mesh.indices.slice(t * 3, t * 3 + 3);
    const tags = ids.map(vertexKey);
    const identity = [...tags].sort().join(';');
    const oldFace = faces.get(identity);
    if (oldFace !== undefined) {
      duplicateFaces++;
      badTriangle[t] = 1;
      badTriangle[oldFace] = 1;
      sample(duplicateExamples, t);
    } else faces.set(identity, t);
    const [a, b, c] = ids.map(p);
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    if (new Set(tags).size < 3 || Math.hypot(...cross) <= AREA_EPSILON) {
      degenerateTriangles++;
      badTriangle[t] = 1;
      sample(degenerateExamples, t);
    }
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      const left = tags[k], right = tags[j];
      // A collapsed coordinate edge is already included in degenerateTriangles.
      if (left === right) continue;
      const key = left < right ? `${left}|${right}` : `${right}|${left}`;
      const direction = left < right ? 1 : -1;
      const old = edges.get(key);
      if (old) {
        union(t, old.firstTriangle);
        old.count++;
        old.directionSum += direction;
      } else {
        const pa = p(ids[k]), pb = p(ids[j]);
        edges.set(key, { firstTriangle: t, count: 1, directionSum: direction, start: pa, end: pb });
        if (Math.hypot(pa[0]-pb[0], pa[1]-pb[1], pa[2]-pb[2]) < SHORT_EDGE) {
          shortEdges++;
          sample(shortExamples, t);
        }
      }
    }
  }

  let boundaryEdges = 0, nonManifoldEdges = 0, windingConflicts = 0;
  // Wait until after all unions so every component is counted against its
  // final root. This is still NOT a portal/PVS or collision weld audit.
  for (const e of edges.values()) {
    if (e.count === 1) {
      boundaryEdges++;
      sample(boundaryExamples, e.firstTriangle);
    } else if (e.count > 2) {
      nonManifoldEdges++;
      sample(nonManifoldExamples, e.firstTriangle);
    } else if (e.directionSum !== 0) {
      windingConflicts++;
      sample(windingExamples, e.firstTriangle);
    }
  }
  // A long edge AB can intersect another face's vertex C with A--C--B,
  // even when A/B/C have separate flat-shaded vertex IDs. The edge graph
  // alone misses this T-junction. Check unique coordinate vertices against
  // geometric edges, sorted by each edge's longest axis to avoid O(E*V) on
  // ordinary maps. This is an advisory scanner, not an exact BSP intersection.
  const uniquePoints = [...uniquePointPositions.values()];
  const sorted = ([0, 1, 2] as const).map(axis => [...uniquePoints].sort((a,b) => a[axis] - b[axis]));
  const lowerBound = (points: [number, number, number][], axis: 0|1|2, target: number): number => {
    let lo = 0, hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid][axis] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  let tJunctionEdges = 0, tJunctionCandidatesChecked = 0, tJunctionScanComplete = true;
  const tJunctionExamples: number[] = [];
  for (const edge of edges.values()) {
    const a = edge.start, b = edge.end;
    const delta = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const lengthSquared = delta[0]**2 + delta[1]**2 + delta[2]**2;
    if (lengthSquared < SHORT_EDGE**2) continue; // already reported as a short edge
    const axis = (Math.abs(delta[1]) > Math.abs(delta[0])
      ? (Math.abs(delta[2]) > Math.abs(delta[1]) ? 2 : 1)
      : (Math.abs(delta[2]) > Math.abs(delta[0]) ? 2 : 0)) as 0|1|2;
    const candidates = sorted[axis];
    const min = Math.min(a[axis], b[axis]) - TJUNCTION_DISTANCE_EPSILON;
    const max = Math.max(a[axis], b[axis]) + TJUNCTION_DISTANCE_EPSILON;
    const begin = lowerBound(candidates, axis, min);
    // Honor the global budget *before* iterating. If the scan is incomplete,
    // callers MUST say so and must not mistake a zero partial count for safety.
    let end = lowerBound(candidates, axis, max);
    if (tJunctionCandidatesChecked + (end - begin) > TJUNCTION_COMPARISON_LIMIT) {
      tJunctionScanComplete = false;
      break;
    }
    let found = false;
    for (let i = begin; i < end; i++) {
      tJunctionCandidatesChecked++;
      const pt = candidates[i];
      // Reject endpoints and points outside the line segment's interior.
      const t = ((pt[0]-a[0])*delta[0] + (pt[1]-a[1])*delta[1] + (pt[2]-a[2])*delta[2]) / lengthSquared;
      if (t <= TJUNCTION_DISTANCE_EPSILON / Math.sqrt(lengthSquared) ||
          t >= 1 - TJUNCTION_DISTANCE_EPSILON / Math.sqrt(lengthSquared)) continue;
      const dx = pt[0] - (a[0] + t*delta[0]);
      const dy = pt[1] - (a[1] + t*delta[1]);
      const dz = pt[2] - (a[2] + t*delta[2]);
      if (dx*dx + dy*dy + dz*dz <= TJUNCTION_DISTANCE_EPSILON**2) {
        found = true;
        break;
      }
    }
    if (found) { tJunctionEdges++; sample(tJunctionExamples, edge.firstTriangle); }
  }
  const componentFlags = new Map<number, {open: boolean; invalid: boolean}>();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(t);
    const item = componentFlags.get(root) ?? { open: false, invalid: false };
    item.invalid ||= badTriangle[t] !== 0;
    componentFlags.set(root, item);
  }
  for (const e of edges.values()) {
    const item = componentFlags.get(find(e.firstTriangle))!;
    item.open ||= e.count === 1;
    item.invalid ||= e.count > 2 || (e.count === 2 && e.directionSum !== 0);
  }
  let openShellCandidates = 0, edgeClosedShellCandidates = 0;
  for (const item of componentFlags.values()) {
    if (item.open) openShellCandidates++;
    if (!item.open && !item.invalid) edgeClosedShellCandidates++;
  }
  return {
    checkedTriangles: triangleCount, duplicateFaces, shortEdges,
    degenerateTriangles, boundaryEdges, nonManifoldEdges, windingConflicts,
    tJunctionEdges, tJunctionScanComplete, tJunctionCandidatesChecked,
    connectedShellCandidates: componentFlags.size,
    openShellCandidates, edgeClosedShellCandidates,
    exampleDuplicateTriangles: duplicateExamples, exampleShortEdges: shortExamples,
    exampleDegenerateTriangles: degenerateExamples, exampleBoundaryTriangles: boundaryExamples,
    exampleNonManifoldTriangles: nonManifoldExamples, exampleWindingTriangles: windingExamples,
    exampleTJunctionTriangles: tJunctionExamples,
    note: 'Read-only geometric edge graph at 0.000001 world-unit quantization. Edge-closed means a source candidate only: coincident vertices are not welded, vertex-on-edge T-junctions are advisory and bounded, triangle intersections/material exceptions are not fully checked, and the real Halo Tool/Invader BSP, collision, portals, PVS, lightmaps and game loading remain unverified.',
  };
}
