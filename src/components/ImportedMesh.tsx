import { useEffect, useMemo } from 'react';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { MeshData } from '../types';
import type { QuickForgeDocument } from '../forge';

/** Preserved OBJ normals/UV seams with the same explicitly bound Halo surfaces
 * used by native compilation. Textures arrive only from the pinned source hook. */
export default function ImportedMesh({
  data,
  document,
  textures,
  selected,
}: {
  data: MeshData;
  document?: QuickForgeDocument;
  textures: Record<string, THREE.Texture>;
  selected: boolean;
}) {
  const source = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setIndex(data.indices);
    if (data.normals?.length === data.positions.length)
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    else geometry.computeVertexNormals();
    if (data.uvs?.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    const parts = data.parts?.length
      ? data.parts
      : [{ name: 'default', indexStart: 0, indexCount: data.indices.length }];
    const names = new Set(parts.map((p) => p.name));
    const assigned = document?.materials.filter((m) => m.shaderPath) ?? [];
    const materials = parts.map((part, index) => {
      const matches = assigned.filter((m) => m.name.toLowerCase() === part.name.toLowerCase());
      const surface =
        matches.length === 1
          ? matches[0]
          : matches.length === 0 && part.name === 'default' && names.size === 1 && assigned.length === 1
            ? assigned[0]
            : null;
      const texture = surface ? textures[surface.id] : null;
      geometry.addGroup(part.indexStart, part.indexCount, index);
      return new THREE.MeshStandardMaterial({
        color: texture ? '#ffffff' : surface ? new THREE.Color(...surface.color) : '#9eacb4',
        map: texture ?? null,
        roughness: 0.85,
        side: THREE.FrontSide,
      });
    });
    return { geometry, materials };
  }, [data, document?.materials, textures]);
  useEffect(
    () => () => {
      source.geometry.dispose();
      source.materials.forEach((m) => m.dispose());
    },
    [source],
  );
  return (
    <mesh geometry={source.geometry} material={source.materials}>
      {selected && <Edges color="#a1e6ed" threshold={25} />}
    </mesh>
  );
}
