/** Portable, path-free QuickForge BSP source-geometry diagnostic.
 * Does not include actual geometry, world coordinates, imported tag paths,
 * original map bytes, or anything resembling a compiler/game success receipt.
 */
import type { SourcePreflight } from './sourcePreflight.ts';
import type { MeshIntegrityReview } from './haloMeshIntegrity.ts';

export interface HaloBspSourceReport {
  schema: 'guiltyspark-halo1-bsp-source-topology/v2';
  scope: 'current-authored-preview-only';
  sourceSha256: string;
  compilerVerified: false;
  collisionVerified: false;
  portalsVerified: false;
  gameplayVerified: false;
  sourceExportPermitted: boolean;
  sourceBlockers: number;
  sourceWarnings: number;
  topology: MeshIntegrityReview;
  interpretation: string[];
}
export function makeHaloBspSourceReport(sourceSha256: string, preflight: SourcePreflight): HaloBspSourceReport {
  if(!/^[a-f0-9]{64}$/i.test(sourceSha256) || !preflight?.sameDocument || !preflight.meshIntegrity ||
     !Number.isSafeInteger(preflight.triangles) ||
     preflight.triangles !== preflight.meshIntegrity.checkedTriangles ||
     preflight.meshIntegrity.checkedTriangles < 1 ||
     preflight.meshIntegrity.checkedTriangles > 32000)
    throw new Error('Cannot export stale or malformed source topology evidence');
  // Construct explicitly, instead of spreading user-provided scenario data.
  // Keep sample arrays bounded in case callers supply fabricated review data.
  const m = preflight.meshIntegrity;
  const fields = [m.duplicateFaces,m.shortEdges,m.degenerateTriangles,m.boundaryEdges,m.nonManifoldEdges,
    m.windingConflicts,m.tJunctionEdges,m.tJunctionCandidatesChecked,m.connectedShellCandidates,m.openShellCandidates,m.edgeClosedShellCandidates];
  if(fields.some(v=>!Number.isSafeInteger(v) || v<0 || v>96000) ||
     typeof m.tJunctionScanComplete !== 'boolean' ||
     m.openShellCandidates + m.edgeClosedShellCandidates > m.connectedShellCandidates)
    throw new Error('Cannot export inconsistent topology counts');
  const examples = (items: number[]):number[] => {
    if(!Array.isArray(items) || items.length>16 || items.some(i=>!Number.isSafeInteger(i) || i<0 || i>=m.checkedTriangles))
      throw new Error('Cannot export malformed topology example indices');
    return [...items];
  };
  return {
    schema:'guiltyspark-halo1-bsp-source-topology/v2',
    scope:'current-authored-preview-only',sourceSha256:sourceSha256.toLowerCase(),
    compilerVerified:false,collisionVerified:false,portalsVerified:false,gameplayVerified:false,
    sourceExportPermitted:preflight.ready,
    sourceBlockers:preflight.blockers.length,sourceWarnings:preflight.warnings.length,
    topology:{
      checkedTriangles:m.checkedTriangles,duplicateFaces:m.duplicateFaces,shortEdges:m.shortEdges,
      degenerateTriangles:m.degenerateTriangles,boundaryEdges:m.boundaryEdges,
      nonManifoldEdges:m.nonManifoldEdges,windingConflicts:m.windingConflicts,
      tJunctionEdges:m.tJunctionEdges,tJunctionScanComplete:m.tJunctionScanComplete,
      tJunctionCandidatesChecked:m.tJunctionCandidatesChecked,
      connectedShellCandidates:m.connectedShellCandidates,openShellCandidates:m.openShellCandidates,
      edgeClosedShellCandidates:m.edgeClosedShellCandidates,
      exampleDuplicateTriangles:examples(m.exampleDuplicateTriangles),
      exampleShortEdges:examples(m.exampleShortEdges),
      exampleDegenerateTriangles:examples(m.exampleDegenerateTriangles),
      exampleBoundaryTriangles:examples(m.exampleBoundaryTriangles),
      exampleNonManifoldTriangles:examples(m.exampleNonManifoldTriangles),
      exampleWindingTriangles:examples(m.exampleWindingTriangles),
      exampleTJunctionTriangles:examples(m.exampleTJunctionTriangles),
      note:m.note,
    },
    interpretation:[
      'Geometric adjacency is inferred from quantized coordinates; it does not weld vertices. T-junction candidates use a bounded vertex-on-edge scan and can be incomplete. Neither absence of candidates nor a closed source graph proves collision, CSG, portals or runtime safety.',
      'Open edges are warnings because Halo material rules have documented exceptions; non-manifold, degenerate and inconsistent-winding source triangles block QuickForge export.',
      'Source export permission is not a Tool structure, cache-file, in-game or multiplayer success result. Rebuild with the exact Halo 1 editing kit in an isolated workspace and retain its WRL/log evidence.',
      'No Halo source files or installed game content were read or modified to produce this report.',
    ],
  };
}
