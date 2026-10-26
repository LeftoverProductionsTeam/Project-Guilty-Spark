/** Read-only, fail-closed UI preflight for authored source meshes.
 * This prevents exporting stale previews and corrupted in-memory arrays.
 * The Rust exporter is still the authority on compiled Halo geometry, collision,
 * dependencies and whether a source export can proceed. No gameplay guarantee.
 */
import type { ForgeMesh, GeometryReport, QuickForgeDocument } from './forge';
import { auditQuickForgeMesh } from './haloMeshIntegrity.ts';
import type { MeshIntegrityReview } from './haloMeshIntegrity.ts';
import { auditCaveExtensions } from './caveSeamRepair.ts';
export interface SourcePreflight {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  triangles: number;
  /** Evidence is tied to the exact document object that generated the preview. */
  sameDocument: boolean;
  /** Read-only coordinate-edge analysis of the exact preview mesh. */
  meshIntegrity: MeshIntegrityReview | null;
}
export function preflightSourceExport(
  doc: QuickForgeDocument,
  snapshot: {mesh: ForgeMesh; document: QuickForgeDocument} | null,
  validation: GeometryReport | null,
  validationDocument: QuickForgeDocument | null,
  busy = false,
): SourcePreflight {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const sameDocument = !!snapshot && snapshot.document === doc && validationDocument === doc;
  let meshIntegrity: MeshIntegrityReview | null = null;
  if (busy || !sameDocument || !validation) {
    return {ready:false,blockers:['Current edit has not finished geometry generation and validation; wait for the updated mesh.'],warnings,triangles:0,sameDocument,meshIntegrity};
  }
  if (!validation.valid) blockers.push('Rust geometry report contains errors: repair them before exporting.');
  for (const issue of validation.issues ?? []) {
    if (issue.severity === 'error') blockers.push(`${issue.code}: ${issue.message}`);
    else warnings.push(`${issue.code}: ${issue.message}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(validation.sourceSha256)) blockers.push('Invalid source SHA-256 evidence in geometry report.');
  const mesh = snapshot.mesh;
  if (!doc.geometry.length || doc.geometry.length > 256) blockers.push('Source world needs 1–256 authored brushes.');
  const ids = [...doc.geometry, ...doc.placements, ...doc.spawns, ...doc.objectives].map(node => node.id);
  if (new Set(ids).size !== ids.length) blockers.push('Duplicate editor object IDs could corrupt placement or geometry references.');
  const materials = new Set(doc.materials.map(material => material.id));
  if (materials.size !== doc.materials.length) blockers.push('Duplicate material IDs.');
  for (const brush of doc.geometry) {
    if (!materials.has(brush.materialId)) blockers.push(`Brush ${brush.name} references a nonexistent source material.`);
    if ([...brush.position,...brush.rotation,...brush.dimensions].some(v => !Number.isFinite(v))) blockers.push(`Invalid transform on brush ${brush.name}.`);
    if (brush.dimensions.some(v => v < .1 || v > 512)) blockers.push(`Unsafe brush dimensions on ${brush.name}.`);
    if (brush.kind === 'terrain' && brush.heights?.length && brush.heights.length !== (brush.steps+1)**2)
      blockers.push(`Terrain sample count does not match subdivisions on ${brush.name}.`);
  }
  if (mesh.indices.length % 3 !== 0 || mesh.positions.length % 3 !== 0 ||
      mesh.normals.length !== mesh.positions.length || mesh.uvs.length !== mesh.positions.length / 3 * 2 ||
      mesh.indices.length / 3 > 32000) blockers.push('Generated vertex/index/normal/UV buffer lengths or triangle budget are invalid.');
  if (![...mesh.positions,...mesh.normals,...mesh.uvs].every(v => Number.isFinite(v) && Math.abs(v) <= 2048))
    blockers.push('Non-finite or out-of-range mesh coordinates, normals or UVs.');
  if (mesh.positions.some(v => Math.abs(v) > 1500)) blockers.push('HALO_VERTEX_BOUNDS: source geometry lies beyond ±1500 world units; Halo Tool can report a bad point. Scale/recenter before exporting.');
  if (!mesh.indices.every(i => Number.isSafeInteger(i) && i >= 0 && i < mesh.positions.length / 3))
    blockers.push('Out-of-range mesh triangle indices.');
  if (mesh.positions.length / 3 !== validation.vertices || mesh.indices.length / 3 !== validation.triangles)
    blockers.push('Generated mesh counts disagree with Rust validation counts.');
  // A second, position-based mesh audit catches duplicated collision faces
  // caused by separate source brushes even when each has unique vertex indices.
  if (!blockers.some(item=>/buffer|indices|bounds|array lengths|mesh coordinates/i.test(item))) {
    try {
      const review=auditQuickForgeMesh(mesh);
      meshIntegrity=review;
      if(review.duplicateFaces) blockers.push(`Duplicate coincident source faces: ${review.duplicateFaces}. Remove overlapping faces before exporting collision BSP source.`);
      if(review.degenerateTriangles) blockers.push(`${review.degenerateTriangles} zero-area or collapsed source triangles. Repair them before exporting the BSP source.`);
      if(review.nonManifoldEdges) blockers.push(`${review.nonManifoldEdges} source edges are shared by more than two faces. Resolve the non-manifold shell before exporting collision BSP source.`);
      if(review.windingConflicts) blockers.push(`${review.windingConflicts} source edges have inconsistent face winding. Repair face orientation before exporting collision BSP source.`);
      if(review.boundaryEdges) warnings.push(`${review.boundaryEdges} geometric boundary edges in ${review.openShellCandidates} source shell candidate(s). Halo collision spaces normally must be sealed; review exceptions and compiler WRL output.`);
      if(review.connectedShellCandidates>1) warnings.push(`${review.connectedShellCandidates} separate source shell candidates. Inspect their clearance, material exceptions, portals and intersections in Halo Tool.`);
      if(review.shortEdges) warnings.push(`${review.shortEdges} very short edges may collapse during Halo Tool JMS import. Inspect the source before building.`);
      if(review.tJunctionEdges) warnings.push(`${review.tJunctionEdges} source edges contain an additional vertex along their interior (possible T-junction). Review the affected brushes and Halo Tool WRL; the read-only audit does not repair geometry.`);
      if(!review.tJunctionScanComplete) warnings.push('Bounded source T-junction scan was incomplete. This is NOT a zero-findings or valid-BSP certificate; inspect Halo Tool WRL diagnostics.');
    } catch(error) {blockers.push(`Independent source mesh audit failed: ${String(error)}`);}
  }

  const byId = new Map(doc.geometry.map(brush => [brush.id,brush]));
  let end = 0;
  for (const part of mesh.parts) {
    const brush = byId.get(part.brushId);
    if (!brush || part.materialId !== brush.materialId) blockers.push('Mesh part has a missing/mismatched source brush or material.');
    if (!Number.isSafeInteger(part.indexStart) || !Number.isSafeInteger(part.indexCount) ||
        part.indexStart !== end || part.indexCount < 0 || part.indexCount % 3 !== 0 ||
        part.indexStart + part.indexCount > mesh.indices.length)
      blockers.push('Mesh parts have overlapping, missing or invalid triangle ranges.');
    end = part.indexStart + part.indexCount;
  }
  if (end !== mesh.indices.length || mesh.parts.length !== doc.geometry.length)
    blockers.push('Mesh part coverage does not match the authored brush inventory.');
  if (doc.geometry.some(brush => brush.kind === 'caveTunnel')) {
    try {
      const joins = auditCaveExtensions(doc);
      for (const issue of joins.issues) (issue.severity === 'error' ? blockers : warnings).push(`${issue.code}: ${issue.message}`);
    } catch (error) {blockers.push(`Cave extension safety audit failed: ${String(error)}`);}
    warnings.push('Cave source geometry still needs verified room topology, portals, PVS and compiled Halo collision.');
  }
  if (doc.geometry.some(brush => brush.kind === 'terrain'))
    warnings.push('Terrain walk collision is an editor simulation. Rebuild the BSP with a matching Halo Tool and inspect WRL errors.');
  return {ready:blockers.length === 0,blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],triangles:mesh.indices.length/3,sameDocument,meshIntegrity};
}

/** Prevent a malformed inspector/gizmo transform from being saved as a staged
 * scene placement. Imported map bytes are never edited by this operation.
 * Large legacy-map coordinates are allowed; non-finite/extreme values are not.
 */
export function validateSceneTransform(value: {position: number[]; rotation: number[]; scale: number[]}): void {
  for (const [key, length] of [['position',3],['rotation',3],['scale',3]] as const) {
    const arr = value[key];
    if (!Array.isArray(arr) || arr.length !== length || !arr.every(Number.isFinite))
      throw new Error(`Rejected invalid ${key} transform from 3D gizmo`);
  }
  if (value.position.some(n => Math.abs(n) > 100_000)) throw new Error('Scene position outside safe import/export bounds');
  if (value.rotation.some(n => Math.abs(n) > 1e6)) throw new Error('Scene rotation outside safe bounds');
  if (value.scale.some(n => n <= 0 || n > 1000)) throw new Error('Scene scale must be positive and bounded');
}
