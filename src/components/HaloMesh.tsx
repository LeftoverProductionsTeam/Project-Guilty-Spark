import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import type { MeshData, ShaderPreview } from '../types';
import { shaderLegend, shaderForTriangle } from '../renderView';
import { renderIndices } from '../haloGeometry';
import { materialLightmapKey } from '../haloLightmap';
import { createHaloMaterial, updateHaloMaterial } from '../haloMaterial';
const EMPTY_SHADER_TEXTURES: Record<number, THREE.Texture> = {};
const EMPTY_LIGHTMAP_TEXTURES: Record<string, THREE.Texture> = {};
export default function HaloMesh({
  data,
  wireframe = false,
  flatShading = false,
  color = '#526e79',
  materialLens = false,
  shaderTextures = EMPTY_SHADER_TEXTURES,
  lightmapTextures = EMPTY_LIGHTMAP_TEXTURES,
  onShaderClick,
  shaderMetadata = {},
  extraTextures = {},
  sky = false,
}: {
  data: MeshData;
  wireframe?: boolean;
  flatShading?: boolean;
  color?: string;
  materialLens?: boolean;
  shaderTextures?: Record<number, THREE.Texture>;
  lightmapTextures?: Record<string, THREE.Texture>;
  onShaderClick?: (tagId: number) => void;
  shaderMetadata?: Record<number, ShaderPreview>;
  extraTextures?: Record<string, THREE.Texture>;
  sky?: boolean;
}) {
  const legend = useMemo(
    () =>
      materialLens || Object.keys(shaderTextures).length || Object.keys(lightmapTextures).length
        ? shaderLegend(data)
        : [],
    [data, materialLens, shaderTextures, lightmapTextures],
  );
  const hasSecondUvs =
    !!data.lightmapUvs &&
    data.lightmapUvs.length === (data.positions.length / 3) * 2 &&
    data.lightmapUvs.every((value) => Number.isFinite(value) && Math.abs(value) <= 32);
  const materialKey = (range: NonNullable<MeshData['materialRanges']>[number]) => {
    const pageKey = materialLightmapKey(range, hasSecondUvs, lightmapTextures) ?? '';
    return `${range.shaderTagId}|${pageKey}`;
  };
  const materialKeys = useMemo(
    () => [...new Set((data.materialRanges ?? []).map(materialKey))],
    [data, lightmapTextures, hasSecondUvs],
  );
  const materials = useMemo(
    () =>
      legend.length
        ? [
            new THREE.MeshStandardMaterial({ color: '#526e79', side: THREE.DoubleSide, roughness: 0.85 }),
            ...materialKeys.map((key) => {
              const [tagText, lightPageKey] = key.split('|');
              const tag = Number(tagText);
              const entry = legend.find((item) => item.tagId === tag);
              const lightMap = lightPageKey ? (lightmapTextures[lightPageKey] ?? null) : null;
              if (shaderTextures[tag] && !materialLens && !wireframe) {
                const extra: Record<string, THREE.Texture> = {};
                for (const [key, texture] of Object.entries(extraTextures))
                  if (key.startsWith(`${tag}:`)) extra[key.slice(key.indexOf(':') + 1)] = texture;
                return createHaloMaterial(shaderTextures[tag], lightMap, shaderMetadata[tag], extra, sky);
              }
              return new THREE.MeshStandardMaterial({
                color:
                  shaderTextures[tag] || lightMap
                    ? '#ffffff'
                    : materialLens
                      ? (entry?.color ?? '#8c9292')
                      : '#8c9292',
                map: shaderTextures[tag] ?? null,
                lightMap,
                lightMapIntensity: 1,
                alphaTest: shaderTextures[tag]?.userData.alphaTest ? 0.5 : 0,
                side: THREE.DoubleSide,
                roughness: 0.85,
              });
            }),
          ]
        : null,
    [
      legend,
      materialKeys,
      shaderTextures,
      lightmapTextures,
      materialLens,
      shaderMetadata,
      extraTextures,
      sky,
      wireframe,
    ],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    g.setIndex(renderIndices(data));
    if (data.normals?.length === data.positions.length) {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    } else {
      g.computeVertexNormals();
    }
    if (data.uvs?.length === (data.positions.length / 3) * 2) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    if (hasSecondUvs && data.lightmapUvs?.every((v) => Number.isFinite(v) && Math.abs(v) <= 32)) {
      // Modern Three uses channel=1/uv1 for lightMap; also set uv2 for
      // older renderer integrations. These are original cached UVs.
      g.setAttribute('uv1', new THREE.Float32BufferAttribute(data.lightmapUvs, 2));
      g.setAttribute('uv2', new THREE.Float32BufferAttribute(data.lightmapUvs, 2));
    } else
      g.setAttribute(
        'uv1',
        new THREE.Float32BufferAttribute(new Float32Array((data.positions.length / 3) * 2), 2),
      );
    if (legend.length && data.materialRanges?.length) {
      const materialIndex = new Map(materialKeys.map((key, i) => [key, i + 1]));
      let next = 0;
      for (const range of [...data.materialRanges].sort((a, b) => a.indexStart - b.indexStart)) {
        const start = Math.max(next, range.indexStart);
        const end = Math.min(data.indices.length, range.indexStart + range.indexCount);
        if (start > next) g.addGroup(next, start - next, 0);
        if (end > start) g.addGroup(start, end - start, materialIndex.get(materialKey(range)) ?? 0);
        next = Math.max(next, end);
      }
      if (next < data.indices.length) g.addGroup(next, data.indices.length - next, 0);
    }
    return g;
  }, [data, legend, materialKeys, hasSecondUvs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => materials?.forEach((material) => material.dispose()), [materials]);
  return (
    <mesh
      geometry={geometry}
      material={materials ?? undefined}
      frustumCulled={!sky}
      onBeforeRender={(_renderer, scene, camera, _geometry, material) =>
        updateHaloMaterial(material, scene, camera)
      }
      raycast={sky ? () => null : undefined}
      onClick={(event) => {
        if (
          !onShaderClick ||
          !materialLens ||
          event.faceIndex == null ||
          event.button !== 0 ||
          event.delta > 5
        )
          return;
        const tagId = shaderForTriangle(data, event.faceIndex);
        if (tagId === null) return;
        event.stopPropagation();
        onShaderClick(tagId);
      }}
    >
      {!materials && (
        <meshStandardMaterial
          color={color}
          side={THREE.DoubleSide}
          roughness={0.85}
          metalness={0.1}
          wireframe={wireframe}
          flatShading={flatShading}
          transparent={wireframe}
          opacity={wireframe ? 0.65 : 1}
        />
      )}
    </mesh>
  );
}
