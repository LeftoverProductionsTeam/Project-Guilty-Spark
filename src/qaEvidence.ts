import type { MapInspection, MeshData } from './types';
import {inspectLightmapPages} from './haloLightmap.ts';

/**
 * Source-safe, read-only acceptance evidence for a locally supplied Halo map.
 * This deliberately excludes absolute file paths, sound bytes, bitmap bytes,
 * the map itself, player identifiers, and any claim that the map runs in Halo.
 */
const previewKinds = new Set(['Scenery', 'Vehicle', 'Biped', 'Equipment', 'Weapon']);

function counts(mesh: MeshData | null | undefined) {
  return {
    vertices: mesh ? Math.floor(mesh.positions.length / 3) : 0,
    triangles: mesh ? Math.floor(mesh.indices.length / 3) : 0,
    source: mesh?.source ?? 'unavailable',
  };
}

export function createPreviewEvidence(inspection: MapInspection, capturedAt: string): string {
  const modelIds = new Set(Object.keys(inspection.modelMeshes ?? {}).map((id) => Number(id)));
  const placed = inspection.objects.filter((object) => previewKinds.has(object.kind) && object.tagId !== null);
  const resolved = placed.filter((object) => modelIds.has(object.tagId!)).length;
  const shaders = new Map<number, { triangleCount: number; bspIndices: Set<number> }>();
  for (const range of inspection.renderMesh?.materialRanges ?? []) {
    if (!Number.isSafeInteger(range.shaderTagId) || !Number.isSafeInteger(range.indexCount) || range.indexCount < 0 || range.indexCount % 3 !== 0) continue;
    const previous = shaders.get(range.shaderTagId) ?? { triangleCount: 0, bspIndices: new Set<number>() };
    previous.triangleCount += range.indexCount / 3;
    previous.bspIndices.add(range.bspIndex);
    shaders.set(range.shaderTagId, previous);
  }
  const byId = new Map(inspection.tags.map((tag) => [tag.id, tag]));
  const shaderTags = [...shaders.entries()]
    .map(([tagId, value]) => ({
      tagId: `0x${tagId.toString(16).toUpperCase().padStart(8, '0')}`,
      class: byId.get(tagId)?.class ?? 'unresolved',
      path: byId.get(tagId)?.path ?? null,
      triangles: value.triangleCount,
      bspIndices: [...value.bspIndices].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.triangles - a.triangles);

  const report = {
    reportSchema: 'guilty-spark-preview-evidence/v1',
    capturedAt,
    map: {
      name: inspection.header.name,
      engine: inspection.header.engine,
      cacheVersion: inspection.header.version,
      sha256: inspection.sha256,
      tagCount: inspection.tags.length,
    },
    viewport: {
      bspCount: inspection.renderMesh?.parts?.length ?? 0,
      render: counts(inspection.renderMesh),
      collision: counts(inspection.mesh),
      decodedObjectModelTypes: modelIds.size,
      placedObjectCount: placed.length,
      placedObjectsWithModelPreview: resolved,
      placedObjectsWithDiagnosticMarker: placed.length - resolved,
      materialRanges: inspection.renderMesh?.materialRanges?.length ?? 0,
      uniqueShaderReferences: shaderTags.length,
      lightmapPages: inspectLightmapPages(inspection.renderMesh ?? null),
      note: 'Lightmap page metadata and UVs do not imply decoded lightmap images or validated lighting.',
      shaders: shaderTags,
    },
    // Untrusted parser diagnostics can contain OS paths and user names. Export
    // only stable diagnostic identifiers rather than leaking local filenames.
    missingRequiredResources: inspection.resources.filter((resource) => resource.required && !resource.found)
      .map((resource) => ({ name: resource.name })),
    diagnostics: inspection.diagnostics.map((d) => ({ severity: d.severity, code: d.code })),
    acceptance: {
      generatorWritesSourceData: false,
      // This evidence generator does NOT re-hash the map on disk.
      sourceIntegrityIndependentlyRechecked: false,
      sourceSha256FromInspection: inspection.sha256,
      genuineHaloTexturesDecoded: false,
      haloLightmapBitmapDecodedFromCache: false,
      secondUvStreamsReadFromCache: inspectLightmapPages(inspection.renderMesh ?? null).some(p => p.withRealUvs),
      playableBspCompiled: false,
      verifiedInGame: false,
      verifiedMultiplayerAI: false,
      reminder: 'This is preview-parser evidence only; game compatibility requires independent build and live runtime tests.',
    },
  };
  return JSON.stringify(report, null, 2);
}
