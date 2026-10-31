import { createHaloMaterial, updateHaloMaterial } from '../haloMaterial';
import type { WorkshopMaterialView } from '../useWorkshopTextures';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ForgeMesh, QuickForgeDocument } from '../forge';

/** One evaluated surface renderer for geometry authoring and object placement. */
export default function BspSurfaces({
  mesh,
  doc,
  selection,
  onSelect,
  wire,
  textures,
  views,
}: {
  mesh: ForgeMesh;
  doc: QuickForgeDocument;
  selection?: { brushId: string; faceId?: string } | null;
  onSelect?: (s: { brushId: string; faceId?: string }) => void;
  wire: boolean;
  textures: Record<string, THREE.Texture>;
  views?: Record<string, WorkshopMaterialView>;
}) {
  const surface = useMemo(() => {
    const geometry = new THREE.BufferGeometry(),
      indices: number[] = [],
      hits: ForgeMesh['parts'] = [],
      colors = Array(mesh.positions.length).fill(1),
      materials: THREE.Material[] = [];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
    geometry.setAttribute(
      'uv1',
      new THREE.Float32BufferAttribute(new Float32Array((mesh.positions.length / 3) * 2), 2),
    );
    for (const [slot, m] of doc.materials.entries()) {
      const first = indices.length;
      for (const part of mesh.parts.filter((p) => p.materialId === m.id)) {
        for (let i = part.indexStart; i < part.indexStart + part.indexCount; i += 3) {
          indices.push(...mesh.indices.slice(i, i + 3));
          hits.push(part);
        }
        if (selection?.brushId === part.brushId && (!selection.faceId || selection.faceId === part.faceId)) {
          const c = new THREE.Color('#9ee9d8');
          for (const i of mesh.indices.slice(part.indexStart, part.indexStart + part.indexCount)) {
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
          }
        }
      }
      geometry.addGroup(first, indices.length - first, slot);
      const portal = m.name === '+portal' || m.name === '+exactportal';
      const view = views?.[m.id];
      if (view && !wire && !portal) {
        const material = createHaloMaterial(view.base, null, view.metadata, view.extra);
        material.vertexColors = true;
        materials.push(material);
      } else
        materials.push(
          new THREE.MeshStandardMaterial({
            color: textures[m.id] ? '#ffffff' : new THREE.Color(...m.color),
            map: textures[m.id] ?? null,
            side: portal ? THREE.DoubleSide : THREE.FrontSide,
            vertexColors: true,
            wireframe: wire,
            roughness: 0.85,
            transparent: portal,
            opacity: portal ? 0.18 : 1,
            depthWrite: !portal,
          }),
        );
    }
    geometry.setIndex(indices);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return { geometry, materials, hits };
  }, [mesh, doc.materials, selection, wire, textures, views]);
  useEffect(
    () => () => {
      surface.geometry.dispose();
      surface.materials.forEach((m) => m.dispose());
    },
    [surface],
  );
  return (
    <mesh
      onBeforeRender={(_gl, scene, camera, _geometry, material) =>
        updateHaloMaterial(material, scene, camera)
      }
      geometry={surface.geometry}
      material={surface.materials}
      userData={{ dropSurface: true, workshopSurface: true }}
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation();
              const hit = surface.hits[e.faceIndex ?? -1];
              if (hit) onSelect({ brushId: hit.brushId, faceId: hit.faceId });
            }
          : undefined
      }
    />
  );
}
