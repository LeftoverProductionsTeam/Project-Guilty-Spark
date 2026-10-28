import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MeshData, SceneDecal } from '../types';
import { decalTextureKey, indexDecalSurfaces, projectMapDecals } from '../mapDecals';
import type { DecalPart } from '../mapDecals';
const vertex = `varying vec2 decalUv,lightUv;varying float depth;
attribute vec2 uv1;
void main(){decalUv=uv;lightUv=uv1;vec4 p=modelViewMatrix*vec4(position,1.0);depth=-p.z;gl_Position=projectionMatrix*p;}`;
const fragment = `varying vec2 decalUv,lightUv;varying float depth;
uniform sampler2D decalMap,lightMap;uniform bool hasLight,alphaTest,fogEnabled,linearOutput;
uniform vec3 tint,fogColor;uniform float intensity,fogNear,fogFar,fogMaximum;uniform int blend;
void main(){vec4 c=texture2D(decalMap,decalUv);if(alphaTest&&c.a<.5)discard;
c.rgb*=tint;if(hasLight)c.rgb*=texture2D(lightMap,lightUv).rgb;c.a*=intensity;
vec3 neutral=blend==1?vec3(1.0):blend==2?vec3(.5):blend>=3?vec3(0.0):fogColor;
if(blend==1||blend==2){c.rgb=mix(neutral,c.rgb,c.a);c.a=1.0;}
if(fogEnabled){float f=clamp((depth-fogNear)/max(.001,fogFar-fogNear),0.0,1.0)*fogMaximum;
if(blend==0)c.rgb=mix(c.rgb,fogColor,f);else if(blend==1||blend==2)c.rgb=mix(c.rgb,neutral,f);else c.a*=1.0-f;}
gl_FragColor=linearOutput&&blend!=1&&blend!=2?sRGBTransferEOTF(c):c;}`;
function DecalMesh({
  part,
  texture,
  light,
}: {
  part: DecalPart;
  texture: THREE.Texture;
  light?: THREE.Texture;
}) {
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(part.uvs, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(part.lightmapUvs, 2));
    g.computeBoundingSphere();
    const d = part.decal,
      m = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        toneMapped: false,
        transparent: true,
      side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      uniforms: {
        linearOutput:{value:false},
          decalMap: { value: texture },
          lightMap: { value: light ?? texture },
          hasLight: { value: !!light && d.layer < 2 },
          alphaTest: { value: d.layer === 3 },
          tint: { value: new THREE.Vector3(...d.color) },
          intensity: { value: d.intensity },
          blend: { value: d.blend },
          fogEnabled: { value: false },
          fogColor: { value: new THREE.Color() },
          fogNear: { value: 0 },
          fogFar: { value: 1 },
          fogMaximum: { value: 1 },
        },
      });
    if (d.blend === 1 || d.blend === 2) {
      m.blending = THREE.CustomBlending;
      m.blendSrc = THREE.DstColorFactor;
      m.blendDst = d.blend === 2 ? THREE.SrcColorFactor : THREE.ZeroFactor;
    } else if (d.blend === 3 || d.blend === 7) {
      m.blending = THREE.AdditiveBlending;
    } else if (d.blend === 4) {
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.ReverseSubtractEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
    } else if (d.blend === 5 || d.blend === 6) {
      m.blending = THREE.CustomBlending;
      m.blendEquation = d.blend === 5 ? THREE.MinEquation : THREE.MaxEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
    }
    return { geometry: g, material: m };
  }, [part, texture, light]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={100 + part.decal.layer * 16 + part.decal.chainIndex}
      userData={{ mapDecal: true, decalId: part.decal.id }}
      raycast={() => null}
      onBeforeRender={(_r, scene) => {
        material.uniforms.linearOutput.value=!!scene.userData.gsLinearOutput;
        const fog = scene.fog as (THREE.Fog & { maximumDensity?: number }) | null;
        material.uniforms.fogEnabled.value = !!fog;
        if (fog) {
          material.uniforms.fogColor.value.copy(fog.color).convertLinearToSRGB();
          material.uniforms.fogNear.value = fog.near;
          material.uniforms.fogFar.value = fog.far;
          material.uniforms.fogMaximum.value = fog.maximumDensity ?? 1;
        }
      }}
    />
  );
}
export default function MapDecals({
  mesh,
  decals,
  textures,
  lightmaps,
}: {
  mesh: MeshData;
  decals: SceneDecal[];
  textures: Record<string, THREE.Texture>;
  lightmaps: Record<string, THREE.Texture>;
}) {
  const index = useMemo(() => indexDecalSurfaces(mesh), [mesh]);
  const available = useMemo(
    () => decals.filter((d) => textures[decalTextureKey(d.bitmapTagId)]),
    [decals, textures],
  );
  const projection = useMemo(
    () =>
      projectMapDecals(
        index,
        available,
        new Map(
          available.map((d) => {
            const image = textures[decalTextureKey(d.bitmapTagId)].image as { width: number; height: number };
            return [d.bitmapTagId, image];
          }),
        ),
      ),
    [index, available, textures],
  );
  return (
    <group
      userData={{
        mapDecalLayer: true,
        sourceDecals: decals.length,
        renderedDecals: projection.rendered,
        omittedDecals: projection.omitted,
      }}
    >
      {projection.parts.map((part, i) => (
        <DecalMesh
          key={part.decal.id + ':' + i}
          part={part}
          texture={textures[decalTextureKey(part.decal.bitmapTagId)]}
          light={part.lightmap ? lightmaps[part.lightmap] : undefined}
        />
      ))}
    </group>
  );
}
