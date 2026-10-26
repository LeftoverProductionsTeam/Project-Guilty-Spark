import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  TransformControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import {
  Box,
  Copy,
  Eye,
  EyeOff,
  Focus,
  Grid2X2,
  Move3D,
  Rotate3D,
  Scaling,
  Search,
  Trash2,
} from 'lucide-react';
import type { MapInspection, MeshData, Project, SceneObject, Vec3 } from '../types';
import { formatNumber, replaceVector } from '../editor';
import { hasRenderGeometry, resolveBspMesh, resolveObjectMesh, shaderForTriangle, shaderLegend } from '../renderView';
import { createPreviewEvidence } from '../qaEvidence';
import { loadUserShaderTexture } from '../haloTexture';
import { decodeHaloDds } from '../haloDds';
import { call, native } from '../api';
import { decodeOwnedBitmapPreview } from '../ownedBitmapPreview';
import { MAX_OWNED_PREVIEWS_PER_CLICK, planOwnedMaterialPreviews } from '../ownedMaterialBatch';
import type { OwnedMaterialPreviewTask } from '../ownedMaterialBatch';
import {bitmapImageKey, decodeOwnedBitmapBatch, uniqueBitmapTargets, MAX_NATIVE_BATCH_RGBA_BYTES} from '../ownedBitmapBatch';
import type {OwnedBitmapBatchResponse} from '../ownedBitmapBatch';
import type { OwnedBitmapPreview } from '../ownedBitmapPreview';
import { verifyResourceAudit } from '../resourceAudit';
import type { ResourceMapAudit } from '../resourceAudit';
import { encodeHaloSourceTiff } from '../haloTiff';
import { matchLocalShaderTextures } from '../shaderTextureMatching';
import { buildMaterialAudit } from '../materialAudit';
import { auditHaloBspRender } from '../bspRenderAudit';
import { inspectLightmapPages, matchLocalLightmapPages, lightmapPageKey, materialLightmapKey } from '../haloLightmap';
import { exportMeshObj } from '../haloObj';
import { downloadLocalText } from '../exportHelpers';
import { validateSceneTransform } from '../sourcePreflight';
import type { ViewMode } from '../renderView';
import RightMouseFly from './RightMouseFly';
import EnvironmentControls from './EnvironmentControls';
import { DEFAULT_ENVIRONMENT, sunlightPosition, toHex } from '../environment';
import type { EditorEnvironment } from '../environment';
import { HelpTip, IconButton, Notice, NumberField, Pill } from './ui';

function matchesClassicBitmapRuntime(version: number) { return version === 7 || version === 609; }
const EMPTY_SHADER_TEXTURES: Record<number, THREE.Texture> = {};
const EMPTY_LIGHTMAP_TEXTURES: Record<string, THREE.Texture> = {};

export class ViewportBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h2>3D graphics unavailable</h2>
        <p>
          The graphics context could not start. Update your graphics driver or reopen this workspace. Map and
          tag inspection remain available.
        </p>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Mesh({
  data,
  wireframe = false,
  flatShading = false,
  color = '#526e79',
  materialLens = false,
  shaderTextures = EMPTY_SHADER_TEXTURES,
  lightmapTextures = EMPTY_LIGHTMAP_TEXTURES,
  onShaderClick,
}: {
  data: MeshData;
  wireframe?: boolean;
  flatShading?: boolean;
  color?: string;
  materialLens?: boolean;
  shaderTextures?: Record<number, THREE.Texture>;
  lightmapTextures?: Record<string, THREE.Texture>;
  onShaderClick?: (tagId: number) => void;
}) {
  const legend = useMemo(() => (materialLens || Object.keys(shaderTextures).length || Object.keys(lightmapTextures).length) ? shaderLegend(data) : [], [data, materialLens, shaderTextures, lightmapTextures]);
  const hasSecondUvs = !!data.lightmapUvs && data.lightmapUvs.length === data.positions.length / 3 * 2 &&
    data.lightmapUvs.every(value => Number.isFinite(value) && Math.abs(value) <= 32);
  const materialKey = (range:NonNullable<MeshData['materialRanges']>[number]) => {
    const pageKey = materialLightmapKey(range, hasSecondUvs, lightmapTextures) ?? '';
    return `${range.shaderTagId}|${pageKey}`;
  };
  const materialKeys = useMemo(() => [...new Set((data.materialRanges ?? []).map(materialKey))], [data, lightmapTextures, hasSecondUvs]);
  const materials = useMemo(() => legend.length ? [
    new THREE.MeshStandardMaterial({ color: '#526e79', side: THREE.DoubleSide, roughness: 0.85 }),
    ...materialKeys.map(key => {
      const [tagText, lightPageKey] = key.split('|');
      const tag = Number(tagText);
      const entry = legend.find(item => item.tagId===tag);
      const lightMap = lightPageKey ? lightmapTextures[lightPageKey] ?? null : null;
      return new THREE.MeshStandardMaterial({
        color: shaderTextures[tag] || lightMap ? '#ffffff' : materialLens ? entry?.color ?? '#8c9292' : '#8c9292',
        map:shaderTextures[tag] ?? null, lightMap, lightMapIntensity:1,
        side:THREE.DoubleSide, roughness:0.85,
      });
    }),
  ] : null, [legend, materialKeys, shaderTextures, lightmapTextures, materialLens]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    g.setIndex(data.indices);
    if (data.normals?.length === data.positions.length) {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    } else {
      g.computeVertexNormals();
    }
    if (data.uvs?.length === data.positions.length / 3 * 2) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    if (hasSecondUvs && data.lightmapUvs?.every(v=>Number.isFinite(v)&&Math.abs(v)<=32)) {
      // Modern Three uses channel=1/uv1 for lightMap; also set uv2 for
      // older renderer integrations. These are original cached UVs.
      g.setAttribute('uv1', new THREE.Float32BufferAttribute(data.lightmapUvs, 2));
      g.setAttribute('uv2', new THREE.Float32BufferAttribute(data.lightmapUvs, 2));
    }
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
    <mesh geometry={geometry} material={materials ?? undefined} onClick={(event) => {
      if (!onShaderClick || !materialLens || event.faceIndex == null) return;
      const tagId = shaderForTriangle(data, event.faceIndex);
      if (tagId === null) return;
      event.stopPropagation();
      onShaderClick(tagId);
    }}>
      {!materials && <meshStandardMaterial
        color={color}
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0.1}
        wireframe={wireframe}
        flatShading={flatShading}
        transparent={wireframe}
        opacity={wireframe ? 0.65 : 1}
      />}
    </mesh>
  );
}
const colors: Record<string, string> = {
  'Player spawn': '#8fe1bc',
  Biped: '#f1b073',
  Vehicle: '#81b5e8',
  Weapon: '#d9be76',
  Scenery: '#7d9bb4',
  Equipment: '#ba9eda',
  'Workshop mesh': '#62b9c8',
};
function ObjectVisual({
  object,
  asset,
  selected,
  size,
  wireframe,
}: {
  object: SceneObject;
  asset?: MeshData;
  selected: boolean;
  size: number;
  wireframe: boolean;
}) {
  if (asset) return <Mesh data={asset} color={selected ? '#82ded0' : '#7098ab'} wireframe={wireframe} />;
  return (
    <>
      <mesh>
        <octahedronGeometry args={[size, 0]} />
        <meshBasicMaterial
          color={selected ? '#ceffef' : (colors[object.kind] ?? '#93a7b9')}
          wireframe={!selected}
        />
      </mesh>
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[size * 1.8, size * 0.035, 6, 32]} />
          <meshBasicMaterial color="#72e3c0" />
        </mesh>
      )}
    </>
  );
}
function FrameCamera({
  mesh,
  objects,
  frame,
}: {
  mesh: MeshData | null;
  objects: SceneObject[];
  frame: number;
}) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const box = new THREE.Box3();
    if (mesh?.positions.length) {
      const p = mesh.positions;
      for (const index of mesh.indices) {
        const i = index * 3;
        box.expandByPoint(new THREE.Vector3(p[i], p[i + 1], p[i + 2]));
      }
    } else {
      for (const o of objects) box.expandByPoint(new THREE.Vector3(...o.position));
    }
    if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(10, 10, 10));
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 5);
    camera.up.set(0, 0, 1);
    camera.position.copy(center).add(new THREE.Vector3(size * 0.7, -size * 0.85, size * 0.65));
    camera.lookAt(center);
    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = Math.max(0.1, 600 / size);
      camera.updateProjectionMatrix();
    }
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
    orbit?.target?.copy(center);
    orbit?.update?.();
  }, [camera, controls, mesh, frame]);
  return null;
}
function Scene({
  project,
  inspection,
  assetMeshes,
  selected,
  setSelected,
  onTransform,
  onOpenTag,
  shaderTextures,
  lightmapTextures,
  mode,
  snap,
  grid,
  viewMode,
  previewMesh,
  ortho,
  fly,
  frame,
  environment,
}: {
  project: Project;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  selected: string | null;
  setSelected: (s: string | null) => void;
  onTransform: (o: SceneObject) => void;
  onOpenTag?: (tagId: number) => void;
  shaderTextures: Record<number, THREE.Texture>;
  lightmapTextures: Record<string, THREE.Texture>;
  mode: 'translate' | 'rotate' | 'scale';
  snap: boolean;
  grid: boolean;
  viewMode: ViewMode;
  previewMesh: MeshData | null;
  ortho: boolean;
  fly: boolean;
  frame: number;
  environment: EditorEnvironment;
}) {
  const group = useRef<THREE.Group>(null);
  const chosen = project.scene.find((o) => o.id === selected);
  const all = project.scene.filter((o) => o.visible);
  const markerSize = inspection ? 0.22 : 0.15;
  return (
    <>
      {ortho ? (
        <OrthographicCamera
          makeDefault
          position={[10, -10, 10]}
          near={0.01}
          far={100000}
          up={[0, 0, 1]}
          zoom={30}
        />
      ) : (
        <PerspectiveCamera
          makeDefault
          position={[10, -10, 10]}
          near={0.05}
          far={100000}
          up={[0, 0, 1]}
          fov={55}
        />
      )}
      {environment.previewEnabled ? <>
        <ambientLight intensity={environment.ambientIntensity} color={toHex(environment.ambientColor)} />
        <directionalLight position={sunlightPosition(environment)} intensity={environment.sunIntensity} color={toHex(environment.sunColor)} />
        {environment.fogEnabled && <fog attach="fog" args={[toHex(environment.fogColor),environment.fogNear,environment.fogFar]} />}
      </> : <>
        <ambientLight intensity={1.4} />
        <directionalLight position={[50,-20,80]} intensity={2.1} />
        <hemisphereLight args={['#b4d9f3','#19222b',1.5]} />
      </>}
      {grid && (
        <gridHelper
          args={[200, 100, '#354854', '#1b2b35']}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.02]}
        />
      )}
      {previewMesh?.positions.length ? (
        <Mesh
          data={previewMesh}
          wireframe={viewMode === 'wireframe'}
          flatShading={viewMode === 'solid'}
          color={viewMode === 'collision' ? '#526e79' : '#8c9292'}
          materialLens={viewMode === 'materials' && hasRenderGeometry(inspection)}
          shaderTextures={viewMode === 'render' || viewMode === 'materials' ? shaderTextures : EMPTY_SHADER_TEXTURES}
          lightmapTextures={viewMode === 'render' || viewMode === 'materials' ? lightmapTextures : EMPTY_LIGHTMAP_TEXTURES}
          onShaderClick={onOpenTag}
        />
      ) : null}
      {all
        .filter((o) => o.id !== selected)
        .map((o) => (
          <group
            key={o.id}
            position={o.position}
            rotation={[o.rotation[2], o.rotation[1], o.rotation[0], 'ZYX']}
            scale={o.scale}
            onClick={(e) => {
              e.stopPropagation();
              setSelected(o.id);
            }}
          >
            <ObjectVisual
              object={o}
              asset={resolveObjectMesh(inspection, o.tagId, o.assetId, assetMeshes)}
              selected={false}
              size={markerSize}
              wireframe={viewMode === 'wireframe'}
            />
          </group>
        ))}
      {chosen?.visible && (
        <TransformControls
          mode={mode}
          enabled={!fly}
          showX showY showZ
          space={mode === 'translate' ? 'world' : 'local'}
          translationSnap={snap ? 0.5 : null}
          rotationSnap={snap ? Math.PI / 12 : null}
          scaleSnap={snap ? 0.1 : null}
          onMouseUp={() => {
            if (group.current) {
              const g = group.current;
              const unchanged = g.position.distanceTo(new THREE.Vector3(...chosen.position)) < 1e-6
                && g.scale.distanceTo(new THREE.Vector3(...chosen.scale)) < 1e-6
                && g.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(chosen.rotation[2], chosen.rotation[1], chosen.rotation[0], 'ZYX'))) < 1e-6;
              if (unchanged) return;
              onTransform({
                ...chosen,
                position: g.position.toArray() as Vec3,
                rotation: [g.rotation.z, g.rotation.y, g.rotation.x],
                scale: g.scale.toArray() as Vec3,
              });
            }
          }}
        >
          <group
            ref={group}
            position={chosen.position}
            rotation={[chosen.rotation[2], chosen.rotation[1], chosen.rotation[0], 'ZYX']}
            scale={chosen.scale}
          >
            <ObjectVisual
              object={chosen}
              asset={resolveObjectMesh(inspection, chosen.tagId, chosen.assetId, assetMeshes)}
              selected
              size={markerSize}
              wireframe={viewMode === 'wireframe'}
            />
          </group>
        </TransformControls>
      )}
      {fly ? (
        <RightMouseFly speed={15} />
      ) : (
        <OrbitControls makeDefault enablePan={false} enableDamping dampingFactor={0.1} />
      )}
      {!fly && <RightMouseFly speed={15} />}
      <FrameCamera
        mesh={previewMesh ?? Object.values(assetMeshes)[0] ?? null}
        objects={project.scene}
        frame={frame}
      />
    </>
  );
}
export default function World({
  project,
  inspection,
  assetMeshes,
  edit,
  notify,
  onOpenTag,
}: {
  project: Project;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  edit: (p: Project, description: string) => void;
  notify: (m: string) => void;
  onOpenTag?: (tagId: number) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [snap, setSnap] = useState(false);
  const [grid, setGrid] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('smooth');
  const [ortho, setOrtho] = useState(false);
  const [fly, setFly] = useState(false);
  const [frame, setFrame] = useState(0);
  const [bsp, setBsp] = useState(0);
  const [exportModelId, setExportModelId] = useState('');
  const [environment, setEnvironment] = useState<EditorEnvironment>(() => structuredClone(DEFAULT_ENVIRONMENT));
  const [shaderTextures, setShaderTextures] = useState<Record<number, THREE.Texture>>({});
  const [loadingOwnedBitmap, setLoadingOwnedBitmap] = useState<Record<number, boolean>>({});
  const [resourceAudit, setResourceAudit] = useState<ResourceMapAudit | null>(null);
  const [auditingResources, setAuditingResources] = useState(false);
  const bitmapRequests = useRef(new Set<number>());
  const autoPreviewEpoch = useRef(0);
  const autoPreviewBusy = useRef(false);
  const [autoPreviewLocked,setAutoPreviewLocked] = useState(false);
  const [autoPreviewProgress, setAutoPreviewProgress] = useState<{
    kind: 'shader' | 'lightmap' | 'both'; done: number; total: number; failed: number; active: boolean;
  } | null>(null);
  const [textureNames, setTextureNames] = useState<Record<number, string>>({});
  const [lightmapTextures,setLightmapTextures] = useState<Record<string, THREE.Texture>>({});
  const [lightmapNames,setLightmapNames] = useState<Record<string, string>>({});
  const lightmapsRef = useRef(lightmapTextures);
  lightmapsRef.current=lightmapTextures;
  useEffect(() => () => {Object.values(lightmapsRef.current).forEach(t=>t.dispose());}, []);
  const texturesRef = useRef(shaderTextures);
  texturesRef.current = shaderTextures;
  useEffect(() => () => { Object.values(texturesRef.current).forEach(t => t.dispose()); }, []);
  useEffect(() => { setResourceAudit(null); }, [project.id, inspection?.sha256, project.source?.resourceSha256?.['bitmaps.map']]);
  /** Preview a matching classic bitmap using verified internal cache data or
   * strictly indexed external pixels from the user's explicitly pinned file. */
  async function previewInternalBitmap(shaderTagId: number, bitmapTagId: number) {
    if (!inspection || !native || bitmapRequests.current.has(shaderTagId)) return;
    if (!inspection.tags.some(t => t.id === bitmapTagId && t.class === 'bitm')) {
      notify('The shader bitmap is not verified in the current cache'); return;
    }
    bitmapRequests.current.add(shaderTagId);
    setLoadingOwnedBitmap(old => ({...old, [shaderTagId]:true}));
    const sourceSha256 = inspection.sha256;
    const expectedProjectId = project.id;
    try {
      const response = await call<OwnedBitmapPreview>('preview_owned_cache_bitmap', {
        projectId: project.id, bitmapTagId, imageIndex: 0,
      });
      const image = decodeOwnedBitmapPreview(response, {
        bitmapTagId, sourceSha256,
        resourceSha256: project.source?.resourceSha256?.['bitmaps.map'] ?? null,
      });
      const texture = new THREE.DataTexture(image.pixels, image.width, image.height, THREE.RGBAFormat);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.name = `Read-only Halo cache bitmap ${image.format} #${bitmapTagId}`;
      if (currentInspectionRef.current !== sourceSha256 || currentProjectRef.current !== expectedProjectId) {
        texture.dispose(); notify('Source project or cache changed during bitmap extraction; preview discarded.'); return;
      }
      setShaderTextures(old => { old[shaderTagId]?.dispose(); return {...old,[shaderTagId]:texture}; });
      const origin = response.sourceKind === 'verified-resource' ? 'Verified bitmaps.map' : 'Preserved cache';
      setTextureNames(old => ({...old,[shaderTagId]:`${origin} #${bitmapTagId} · ${image.format}`}));
      setViewMode('render');
      notify(`Read-only ${image.width}×${image.height} ${image.format} top mipmap from ${origin}. Shader blending and baked lighting remain approximate; engine output is unverified.`);
    } catch (error) {
      notify(`Automatic bitmap preview unavailable: ${String(error)}. You can still select an extracted local DDS/PNG image.`);
    } finally {
      bitmapRequests.current.delete(shaderTagId);
      setLoadingOwnedBitmap(old => ({...old,[shaderTagId]:false}));
    }
  }

  /** One exact-source read for the whole user-requested subset. Unlike the
   * earlier serial loop, one native SHA-verified snapshot and at most one
   * pinned shared-resource index serve up to 24 distinct bitmap images.
   * Per-image refusals never invent textures. Manual images always win.
   */
  async function previewVerifiedMaterialBatch(kind: 'shader' | 'lightmap' | 'both') {
    if (!inspection || !native || autoPreviewBusy.current || !inspection.renderMesh) return;
    const source = inspection.sha256;
    const projectAtStart = project.id;
    const recordedResource = project.source?.resourceSha256?.['bitmaps.map'] ?? null;
    let tasks: OwnedMaterialPreviewTask[];
    try {
      const plan = planOwnedMaterialPreviews(inspection, inspection.renderMesh,
        new Set(Object.keys(shaderTextures).map(Number)),new Set(Object.keys(lightmapTextures)));
      const planned = kind === 'shader' ? plan.shaderTasks : kind === 'lightmap' ? plan.lightmapTasks :
        [...plan.shaderTasks, ...plan.lightmapTasks];
      tasks = planned.filter(task => task.kind !== 'shader' || !bitmapRequests.current.has(task.shaderTagId))
        .slice(0,MAX_OWNED_PREVIEWS_PER_CLICK);
    } catch (error) { notify(`Automatic material planning refused: ${String(error)}`); return; }
    if (!tasks.length) {notify(`No additional verified ${kind} images are eligible for direct cache preview.`);return;}
    const epoch = ++autoPreviewEpoch.current;
    autoPreviewBusy.current = true;
    setAutoPreviewLocked(true);
    let done=0,failed=0;
    const reservedShaderIds = tasks.filter(t=>t.kind==='shader').map(t=>t.shaderTagId);
    reservedShaderIds.forEach(id=>bitmapRequests.current.add(id));
    if(reservedShaderIds.length) setLoadingOwnedBitmap(old=>{
      const next={...old};for(const id of reservedShaderIds)next[id]=true;return next;
    });
    setAutoPreviewProgress({kind,done,total:tasks.length,failed,active:true});
    const shaderLoaded=new Map<number,{texture:THREE.Texture;label:string}>();
    const lightmapLoaded=new Map<string,{texture:THREE.Texture;label:string}>();
    const discard=()=>{
      for(const item of shaderLoaded.values())item.texture.dispose();
      for(const item of lightmapLoaded.values())item.texture.dispose();
      shaderLoaded.clear();lightmapLoaded.clear();
    };
    const isCurrent=()=>epoch===autoPreviewEpoch.current &&
      currentInspectionRef.current===source && currentProjectRef.current===projectAtStart &&
      currentResourceRef.current===recordedResource;
    try {
      const targets=uniqueBitmapTargets(tasks,source,recordedResource);
      const response=await call<OwnedBitmapBatchResponse>('preview_owned_cache_bitmap_batch', {
        projectId:projectAtStart,
        requests:targets.map(t=>({bitmapTagId:t.bitmapTagId,imageIndex:t.imageIndex??0})),
      });
      if(!isCurrent())return;
      // Reject the WHOLE payload on one stale ID, changed hash, unsolicited
      // image, oversized DDS, or malformed success/refusal pair.
      const decoded=decodeOwnedBitmapBatch(response,targets);
      let textureBytes=0;
      for(const task of tasks){
        if(!isCurrent()){discard();return;}
        const found=decoded.get(bitmapImageKey(task.bitmapTagId,task.imageIndex));
        if (!found?.image) {failed++;continue;}
        const image=found.image;
        const byteCount=image.pixels.byteLength;
        if (byteCount > MAX_NATIVE_BATCH_RGBA_BYTES-textureBytes) {failed++;continue;}
        if (task.kind==='shader' && (texturesRef.current[task.shaderTagId] || shaderLoaded.has(task.shaderTagId))) {
          failed++;continue;
        }
        if (task.kind==='lightmap' && (lightmapsRef.current[task.key] || lightmapLoaded.has(task.key))) {
          failed++;continue;
        }
        const texture = new THREE.DataTexture(image.pixels,image.width,image.height,THREE.RGBAFormat);
        texture.needsUpdate=true;
        texture.colorSpace=THREE.SRGBColorSpace;
        texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
        texture.name=`Verified Halo ${task.kind} bitmap ${task.bitmapTagId} image ${task.imageIndex}`;
        if(task.kind==='lightmap')texture.channel=1;
        const label=`Read-only ${found.sourceKind==='verified-resource'?'verified resource':'cache'} `+
          `#${task.bitmapTagId} image ${task.imageIndex} (${image.format})`;
        if(task.kind==='shader')shaderLoaded.set(task.shaderTagId,{texture,label});
        else lightmapLoaded.set(task.key,{texture,label});
        textureBytes+=byteCount;
        done++;
      }
      if(!isCurrent()){discard();return;}
      // Commit only once all requested source identities have been checked;
      // the state updater still refuses to replace an image added by hand.
      if(shaderLoaded.size){
        const originalAssignments = new Set(Object.keys(texturesRef.current).map(Number));
        setShaderTextures(previous=>{
          const next={...previous};
          for(const [id,item] of shaderLoaded){
            if(next[id])item.texture.dispose();else next[id]=item.texture;
          }
          return next;
        });
        setTextureNames(previous=>{
          const next={...previous};
          for(const [id,item] of shaderLoaded)if(!originalAssignments.has(id) && !next[id])next[id]=item.label;
          return next;
        });
      }
      if(lightmapLoaded.size){
        const originalAssignments = new Set(Object.keys(lightmapsRef.current));
        setLightmapTextures(previous=>{
          const next={...previous};
          for(const [key,item] of lightmapLoaded){
            if(next[key])item.texture.dispose();else next[key]=item.texture;
          }
          return next;
        });
        setLightmapNames(previous=>{
          const next={...previous};
          for(const [key,item] of lightmapLoaded)if(!originalAssignments.has(key) && !next[key])next[key]=item.label;
          return next;
        });
      }
      if(done)setViewMode('render');
      notify(`Verified ${kind} previews: ${done} assigned, ${failed} refused, already set, or over budget. `+
        `Further eligible images can be loaded with another click. Shader/radiosity parity still needs Halo runtime testing.`);
    } catch(error) {
      discard();
      if(isCurrent())notify(`Verified material batch refused: ${String(error)}. No original Halo files changed.`);
    } finally {
      for(const id of reservedShaderIds)bitmapRequests.current.delete(id);
      if(reservedShaderIds.length)setLoadingOwnedBitmap(old=>{
        const next={...old};for(const id of reservedShaderIds)delete next[id];return next;
      });
      // Do not allow overlapping native map snapshots after cancel or a
      // project switch; release the lock only when the read has actually ended.
      autoPreviewBusy.current=false;
      setAutoPreviewLocked(false);
      if(isCurrent())setAutoPreviewProgress({kind,done,total:tasks.length,failed,active:false});
      else setAutoPreviewProgress(null);
    }
  }

  function cancelAutoPreview() {
    // The in-flight snapshot is read-only and cannot be interrupted via
    // Tauri, but its response and textures will be ignored. The busy flag
    // remains true until the already-started native command settles.
    autoPreviewEpoch.current++;
    setAutoPreviewProgress(old=>old?{...old,active:false}:old);
    notify('Automatic material preview canceled. The in-flight read will be discarded.');
  }

  /** Index-only resource audit. Does not extract pixels or modify a map. */
  async function checkResourceIndex() {
    if (!native || !project.source || auditingResources) return;
    setAuditingResources(true);
    setResourceAudit(null);
    const expectedProject = project.id;
    const expectedMap = inspection?.sha256;
    const expectedResource = project.source.resourceSha256?.['bitmaps.map'];
    try {
      const report = await call<ResourceMapAudit>('audit_owned_bitmap_resources',{projectId:expectedProject});
      if (expectedProject !== currentProjectRef.current || expectedMap !== currentInspectionRef.current ||
          !expectedResource || report.resourceSha256 !== expectedResource.toLowerCase()) {
        notify('Project/map/resource changed during shared-resource audit; report discarded.'); return;
      }
      setResourceAudit(verifyResourceAudit(report, expectedResource));
      notify(`Verified bitmaps.map index: ${report.resourceCount} entries, ${report.exactBitmapPathMatches} unique exact bitmap-path matches. This does not prove external pixels are decodable.`);
    } catch (error) { notify(`Resource index audit unavailable: ${String(error)}. Choose the original source resources in Build.`); }
    finally { setAuditingResources(false); }
  }

  async function attachShaderTexture(tagId: number, file: File) {
    const sourceHash = inspection?.sha256;
    const projectIdAtStart = project.id;
    try {
      const texture = await loadUserShaderTexture(file);
      if (!sourceHash || sourceHash !== currentInspectionRef.current || projectIdAtStart !== currentProjectRef.current) {
        texture.dispose(); notify('Source project or map changed during texture decoding; assignment discarded.'); return;
      }
      setShaderTextures(old => { old[tagId]?.dispose(); return {...old, [tagId]:texture}; });
      setTextureNames(old => ({...old, [tagId]:file.name}));
      setViewMode('render');
      notify(`Local texture attached to shader #${tagId}. Game shader effects/lightmaps are still unimplemented.`);
    } catch (e) { notify(`Cannot load local texture: ${String(e)}`); }
  }

  async function attachLightmapPage(bspIndex: number, page: number, file: File) {
    let key: string;
    try { key = lightmapPageKey(bspIndex, page); }
    catch (error) { notify(`Invalid lightmap address: ${String(error)}`); return; }
    const sourceHash = inspection?.sha256;
    const projectIdAtStart = project.id;
    if (!inspectLightmapPages(resolveBspMesh(inspection, 'render', -1)).some(p => p.key === key && p.withRealUvs)) {
      notify(`${key} has no validated secondary UV stream in this map; assignment refused.`); return;
    }
    try {
      const texture = await loadUserShaderTexture(file);
      if (!sourceHash || sourceHash !== currentInspectionRef.current || projectIdAtStart !== currentProjectRef.current) {
        texture.dispose(); notify('Source project or map changed during lightmap decoding; assignment discarded.'); return;
      }
      // This is a local preview, not a reproduction of Halo radiosity or shader blending.
      texture.channel = 1;
      setLightmapTextures(old => {old[key]?.dispose();return {...old,[key]:texture};});
      setLightmapNames(old => ({...old,[key]:file.name}));
      setViewMode('render');
      notify(`Local lightmap attached to BSP ${bspIndex + 1}, page ${page}; game shader lighting remains approximate.`);
    } catch(error) { notify(`Cannot attach local lightmap image: ${String(error)}`); }
  }

  /** Assign only uniquely identified BSP+page files from user-supplied images.
   * Never carry an ambiguous page image across different BSPs.
   */
  async function attachLocalLightmapBatch(files: File[]) {
    if (!inspection || !files.length) return;
    const sourceHash = inspection.sha256;
    const projectIdAtStart = project.id;
    try {
      const matches = matchLocalLightmapPages(inspectLightmapPages(resolveBspMesh(inspection, 'render', -1)),files);
      if (!matches.assignments.length) {
        notify(`No unambiguous lightmap images matched: ${matches.skipped.length} skipped.`); return;
      }
      const loaded: Record<string,THREE.Texture> = {};
      const names: Record<string,string> = {};
      let failures = 0;
      for (const assignment of matches.assignments) {
        try {
          const texture = await loadUserShaderTexture(files[assignment.fileIndex]);
          texture.channel = 1;
          loaded[assignment.key] = texture;
          names[assignment.key] = assignment.filename;
        } catch { failures++; }
      }
      if (sourceHash !== currentInspectionRef.current || projectIdAtStart !== currentProjectRef.current) {
        Object.values(loaded).forEach(t => t.dispose());
        notify('Source map changed during lightmap decoding; the batch was discarded.'); return;
      }
      setLightmapTextures(old => {
        for(const key of Object.keys(loaded)) old[key]?.dispose();
        return {...old,...loaded};
      });
      setLightmapNames(old => ({...old,...names}));
      if (Object.keys(loaded).length) setViewMode('render');
      notify(`${Object.keys(loaded).length} BSP-specific lightmaps paired; ${matches.skipped.length} skipped, ${failures} unreadable. Original cache unchanged.`);
    } catch (error) { notify(`Lightmap batch rejected: ${String(error)}`); }
  }

  /** Convert only a user-selected DDS image into a local, uncompressed TIFF source.
   * This is source preparation, not a verified H1 Tool/Invader bitmap compile.
   * No installed game files or project state are touched.
   */
  async function exportLocalDdsTiff(file: File) {
    if (!/\.dds$/i.test(file.name) || !file.size || file.size > 96*1024*1024) {
      notify('Select one local DDS file within the 96 MiB source preview limit.'); return;
    }
    try {
      const image = decodeHaloDds(await file.arrayBuffer());
      const output = encodeHaloSourceTiff(image);
      const copy = new Uint8Array(output.byteLength); copy.set(output);
      const stem = file.name.replace(/\.dds$/i, '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 50) || 'local_texture';
      const url = URL.createObjectURL(new Blob([copy.buffer], { type:'image/tiff' }));
      try {
        const link = document.createElement('a'); link.href = url;
        link.download = `${stem}.tif`; link.rel = 'noopener';
        document.body.appendChild(link); link.click(); link.remove();
      } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
      notify(`Prepared ${image.width}×${image.height} local RGBA TIFF source. Import it into your own Editing Kit workspace; game/tool compilation is not verified.`);
    } catch (error) { notify(`DDS-to-TIFF source export rejected: ${String(error)}`); }
  }

  /** The user selects source image files; never enumerate Halo directories or guess a mapping. */
  async function attachLocalTextureBatch(files: File[]) {
    if (!inspection || !files.length) return;
    const sourceHash = inspection.sha256;
    const projectIdAtStart = project.id;
    try {
      const completeMesh = resolveBspMesh(inspection, 'render', -1);
      const ids = shaderLegend(completeMesh).map(x => x.tagId);
      const matches = matchLocalShaderTextures(inspection, ids, files);
      if (!matches.assignments.length) {
        notify(`No safe exact shader/bitmap matches in ${files.length} images. Select individual textures in Shader Inspector.`);
        return;
      }
      const loaded: Record<number, THREE.Texture> = {};
      const names: Record<number, string> = {};
      let failures = 0;
      for (const match of matches.assignments) {
        try {
          loaded[match.shaderTagId] = await loadUserShaderTexture(files[match.fileIndex]);
          names[match.shaderTagId] = files[match.fileIndex].name;
        } catch { failures++; }
      }
      if (sourceHash !== currentInspectionRef.current || projectIdAtStart !== currentProjectRef.current) {
        Object.values(loaded).forEach(texture => texture.dispose());
        notify('Source map changed while loading images; texture batch discarded.');
        return;
      }
      setShaderTextures(previous => {
        for (const id of Object.keys(loaded)) previous[Number(id)]?.dispose();
        return {...previous,...loaded};
      });
      setTextureNames(previous => ({...previous,...names}));
      setViewMode('render');
      notify(`${Object.keys(loaded).length} local images assigned to exact shader paths; ${matches.skipped.length} unmatched and ${failures} unreadable. No textures saved in project.`);
    } catch (error) { notify(`Batch texture assignment rejected: ${String(error)}`); }
  }
  const currentInspectionRef = useRef(inspection?.sha256);
  currentInspectionRef.current = inspection?.sha256;
  const currentProjectRef = useRef(project.id);
  currentProjectRef.current = project.id;
  const currentResourceRef = useRef(project.source?.resourceSha256?.['bitmaps.map'] ?? null);
  currentResourceRef.current = project.source?.resourceSha256?.['bitmaps.map'] ?? null;
  const chosen = project.scene.find((o) => o.id === selected);
  const renderAvailable = hasRenderGeometry(inspection);
  useEffect(() => {
    autoPreviewEpoch.current++;
    setAutoPreviewProgress(null);
    setViewMode(renderAvailable ? 'render' : 'smooth');
    setBsp(0);
    setLoadingOwnedBitmap({});
    setShaderTextures(previous => { Object.values(previous).forEach(t=>t.dispose()); return {}; });
    setTextureNames({});
    setLightmapTextures(previous=>{Object.values(previous).forEach(t=>t.dispose());return {};});
    setLightmapNames({});
  }, [inspection?.sha256, renderAvailable, project.id, project.source?.resourceSha256?.['bitmaps.map']]);
  const previewMesh = useMemo(
    () => resolveBspMesh(inspection, viewMode, bsp),
    [inspection, viewMode, bsp],
  );
  const materials = useMemo(() => shaderLegend(previewMesh), [previewMesh]);
  const availableLightmapPages = useMemo(() => inspectLightmapPages(previewMesh), [previewMesh]);
  const ownedPreviewPlan = useMemo(() => {
    if (!inspection?.renderMesh) return null;
    try {return planOwnedMaterialPreviews(inspection, inspection.renderMesh,
      new Set(Object.keys(shaderTextures).map(Number)), new Set(Object.keys(lightmapTextures)));}
    catch {return null;}
  }, [inspection,shaderTextures,lightmapTextures]);
  const materialAudit = useMemo(() => {
    if(!inspection || !previewMesh?.materialRanges?.length) return null;
    try { return buildMaterialAudit(inspection, previewMesh); }
    catch { return null; } // a malformed cache never takes down the World viewport
  }, [inspection,previewMesh]);
  // Always use the complete, source-attributed compiled BSP mesh, not only a
  // viewport-selected subset, so page and material conflicts are not hidden.
  const bspAudit = useMemo(() => {
    if (!inspection?.renderMesh?.materialRanges?.length) return {review:null, error:null};
    try { return {review:auditHaloBspRender(inspection, inspection.renderMesh),error:null}; }
    catch (e) { return {review:null,error:String(e)}; }
  }, [inspection]);
  function exportBspReview() {
    try {
      if(!inspection || !bspAudit.review)throw new Error('No validated BSP render audit is available');
      if(bspAudit.review.sourceSha256!==inspection.sha256)throw new Error('BSP inspection changed during export');
      const name=(inspection.header.name??'halo_map').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'halo_map';
      downloadLocalText(`${name}_bsp_render_preflight.json`,JSON.stringify(bspAudit.review,null,2),'application/json;charset=utf-8');
      notify(`Read-only BSP diagnostics exported: ${bspAudit.review.checked.triangles} source-preview triangles. No pixel bytes or filesystem paths included.`);
    } catch(e) {notify(`BSP diagnostic report refused: ${String(e)}`);}
  }
  function exportMaterialAudit() {
    try {
      if(!materialAudit || !inspection)throw new Error('No validated material metadata for this map');
      const name=(inspection.header.name??'halo_map').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,48)||'halo_map';
      downloadLocalText(`${name}_material_audit.json`,JSON.stringify(materialAudit,null,2),'application/json;charset=utf-8');
      notify(`Saved a read-only report of ${materialAudit.shaders.length} shader regions. No bitmap pixels or local system paths are included.`);
    }catch(error){notify(`Material report rejected: ${String(error)}`);}
  }
  function exportInspectedMesh(mesh: MeshData | null | undefined, label:string) {
    try {
      if (!mesh?.indices?.length) throw new Error('No supported render geometry was resolved for this selection');
      const exported=exportMeshObj(mesh,label);
      const clean=label.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60) || 'halo_geometry';
      downloadLocalText(`${clean}.obj`,exported.text,'text/plain;charset=utf-8');
      notify(`Exported ${exported.triangles} real source triangles as OBJ (read-only). Material IDs are diagnostic; compiled BSP/collision and game textures are not included.`);
    } catch (error) { notify(`OBJ export rejected: ${String(error)}`); }
  }
  function update(o: SceneObject) {
    try {
      validateSceneTransform(o);
      edit({ ...project, scene: project.scene.map((s) => (s.id === o.id ? o : s)) }, `Transform ${o.name}`);
    } catch (error) { notify(`Scene transform was not saved: ${String(error)}`); }
  }
  function duplicate() {
    if (!chosen) return;
    const o = {
      ...structuredClone(chosen),
      id: crypto.randomUUID(),
      name: chosen.name + ' copy',
      position: [chosen.position[0] + 1, chosen.position[1], chosen.position[2]] as Vec3,
      sourceOffset: null,
      rotationOffset: null,
    };
    edit({ ...project, scene: [...project.scene, o] }, `Duplicate ${chosen.name} in editor`);
    setSelected(o.id);
    if (!chosen.assetId)
      notify(
        'Duplicated in the project. Exporting additional Halo instances requires a scenario compilation adapter and is currently blocked.',
      );
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') || e.ctrlKey || e.metaKey || document.querySelector('canvas[data-gs-fly-active="true"]')) return;
      switch (e.key.toLowerCase()) {
        case 'w':
          if (!fly) setMode('translate');
          break;
        case 'e':
          if (!fly) setMode('rotate');
          break;
        case 'r':
          if (!fly) setMode('scale');
          break;
        case 'f':
          if (!fly) setFrame((f) => f + 1);
          break;
        case 'escape':
          setSelected(null);
          break;
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fly]);
  return (
    <div className="world-layout">
      <aside className="panel hierarchy">
        <div className="panel-heading">
          <strong>Scene hierarchy</strong>
          <Pill>{project.scene.length}</Pill>
        </div>
        <div className="panel-search">
          <Search size={14} />
          <input
            placeholder="Find an object…"
            aria-label="Search scene objects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="hierarchy-group">
          <Box size={14} />
          {inspection?.header.name ?? 'Workshop scene'}
        </div>
        <div className="object-list">
          {project.scene
            .filter(
              (o) =>
                o.name.toLowerCase().includes(query.toLowerCase()) ||
                o.kind.toLowerCase().includes(query.toLowerCase()),
            )
            .map((o) => (
              <div className={`object-row ${selected === o.id ? 'selected' : ''}`} key={o.id}>
                <button className="object-name" onClick={() => setSelected(o.id)}>
                  <Box size={13} style={{ color: colors[o.kind] }} />
                  <span>{o.name}</span>
                </button>
                <button
                  className="visibility"
                  aria-label={`${o.visible ? 'Hide' : 'Show'} ${o.name}`}
                  onClick={() =>
                    edit(
                      {
                        ...project,
                        scene: project.scene.map((s) => (s.id === o.id ? { ...s, visible: !s.visible } : s)),
                      },
                      `Toggle visibility: ${o.name}`,
                    )
                  }
                >
                  {o.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            ))}
        </div>
        <div className="panel-foot">
          {Object.keys(inspection?.modelMeshes ?? {}).length} native model types in static/bind-pose preview.
          Unresolved objects use diagnostic markers. Textures and animated rigs are not yet supported.
          {inspection && <button
            type="button" className="small-button full"
            onClick={() => {
              const evidence = createPreviewEvidence(inspection, new Date().toISOString());
              if (!navigator.clipboard?.writeText) {
                notify('Clipboard API unavailable. Use the map validation scripts in the source ZIP.');
                return;
              }
              void navigator.clipboard.writeText(evidence)
                .then(() => notify('Read-only map QA evidence copied. No game files were changed.'))
                .catch(() => notify('Clipboard permission denied. Use the bundled validation scripts instead.'));
            }}
          >Copy map QA report</button>}
          {inspection && <>
            <button type="button" className="small-button full" disabled={!previewMesh?.indices.length}
              onClick={() => exportInspectedMesh(previewMesh,`${inspection.header.name}_bsp_${bsp}`)}>
              Export viewed BSP as OBJ
            </button>
            {!!Object.keys(inspection.modelMeshes ?? {}).length && <>
              <select aria-label="Static model to export" value={exportModelId} onChange={e=>setExportModelId(e.target.value)}>
                <option value="">Choose inspected static model…</option>
                {Object.keys(inspection.modelMeshes ?? {}).map(id=><option key={id} value={id}>Tag model #{id}</option>)}
              </select>
              <button type="button" className="small-button full" disabled={!exportModelId}
                onClick={() => exportInspectedMesh(inspection.modelMeshes?.[exportModelId],`halo_model_${exportModelId}`)}>
                Export selected model OBJ
              </button>
            </>}
            <p className="subtle">Exported geometry can be imported into Asset Workshop in another project. This does not make an imported BSP editable or gameplay-ready.</p>
          </>}
        </div>
      </aside>
      <section className="viewport-shell">
        <div className="viewport-toolbar">
          <div className="button-group">
            <IconButton
              label="Translate (W)"
              active={mode === 'translate'}
              onClick={() => setMode('translate')}
            >
              <Move3D size={17} />
            </IconButton>
            <IconButton label="Rotate (E)" active={mode === 'rotate'} onClick={() => setMode('rotate')}>
              <Rotate3D size={17} />
            </IconButton>
            <IconButton label="Scale (R)" active={mode === 'scale'} onClick={() => setMode('scale')}>
              <Scaling size={17} />
            </IconButton>
          </div>
          <span className="toolbar-divider" />
          <button title="Toggle 0.5-world-unit XYZ translation snapping. Disabling it permits precise free placement without editing the source map cache." aria-pressed={snap} className={snap ? 'small-button active' : 'small-button'} onClick={() => setSnap(!snap)}>
            Snap {snap ? '0.5' : 'off'}
          </button>
          <IconButton label="Toggle grid" active={grid} onClick={() => setGrid(!grid)}>
            <Grid2X2 size={16} />
          </IconButton>
          <span className="toolbar-spacer" />
          <select
            aria-label="Camera projection"
            value={ortho ? 'ortho' : 'perspective'}
            onChange={(e) => setOrtho(e.target.value === 'ortho')}
          >
            <option value="perspective">Perspective</option>
            <option value="ortho">Orthographic</option>
          </select>
          <button title="Orbit on: left-drag to orbit, wheel zoom. Orbit off: no automatic orbit while flying. In both modes, hold RIGHT MOUSE to look and hold WASD to fly, R/F ascend/descend, Shift boosts." aria-pressed={fly} className={fly ? 'small-button active' : 'small-button'} onClick={() => setFly(!fly)}>
            {fly ? 'RMB flight · orbit off' : 'RMB flight · orbit on'}
          </button>
          <select
            aria-label="Viewport display mode"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as typeof viewMode)}
          >
            <option value="render" disabled={!renderAvailable}>BSP render · optional local textures</option>
            <option value="smooth">Smooth shaded</option>
            <option value="solid">Flat shaded</option>
            <option value="wireframe">Wireframe</option>
            <option value="collision">Collision geometry</option>
            <option value="materials" disabled={!renderAvailable}>Material Lens · debug shader IDs</option>
          </select>
          <HelpTip help="Select a placed object to see the translation gizmo. Red X, green Y, blue Z arrows move it on one world axis. W moves, E rotates, R scales. Hold RMB to look around, RMB+WASD to fly; changes are staged in the project, not written into original Halo caches." />
          <IconButton label="Frame scene (F)" onClick={() => setFrame((f) => f + 1)}>
            <Focus size={17} />
          </IconButton>
        </div>
        <div className="viewport" data-testid="viewport">
          <ViewportBoundary>
            <Suspense fallback={<div className="loading">Preparing geometry…</div>}>
              <Canvas
                dpr={[1, 1.75]}
                gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
                onPointerMissed={(event) => { if (event.button === 0 && event.type === 'click') setSelected(null); }}
              >
                <color attach="background" args={[environment.previewEnabled ? toHex(environment.skyColor) : '#101820']} />
                <Scene
                  {...{
                    project,
                    assetMeshes,
                    selected,
                    setSelected,
                    mode,
                    snap,
                    grid,
                    viewMode,
                    previewMesh,
                    ortho,
                    fly,
                    frame,
                    environment,
                  }}
                  inspection={inspection}
                  onTransform={update}
                  onOpenTag={onOpenTag}
                  shaderTextures={shaderTextures}
                  lightmapTextures={lightmapTextures}
                />
              </Canvas>
            </Suspense>
          </ViewportBoundary>
          <div className="viewport-label">
            <span className="live-dot" />
            {previewMesh?.positions.length
              ? viewMode === 'collision' || !renderAvailable
                ? 'Actual collision geometry · game textures not available'
                : viewMode === 'materials' ? 'Actual shader-tag regions · debug colors, not Halo textures' : Object.keys(lightmapTextures).length ? 'Actual BSP geometry · local lightmap-page preview, game shader effects unverified' : Object.keys(shaderTextures).length ? 'Actual BSP geometry · local texture previews (lighting incomplete)' : 'Actual BSP geometry · choose a local DDS/image in Shader Inspector'
              : project.assets.length
                ? 'Imported workshop geometry'
                : 'Empty project scene'}
          </div>
          {!!inspection?.mesh.parts?.length && (
            <select
              className="bsp-control"
              aria-label="Visible BSP"
              value={bsp}
              onChange={(e) => setBsp(Number(e.target.value))}
            >
              {inspection.mesh.parts.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
              <option value={-1}>All BSPs</option>
            </select>
          )}
          <div className="axis-hint" aria-label="Gizmo axis colors: X red, Y green, Z blue" title="Select an asset to drag these axis-colored gizmo arrows: red X, green Y, blue Z. Hold RMB to navigate; release to transform.">
            <span className="gs-axis-x">X</span>
            <span className="gs-axis-y">Y</span>
            <span className="gs-axis-z">Z ↑</span>
          </div>
          <div className="viewport-help">
            {fly
              ? 'Hold RMB + drag to look · hold RMB + WASD to fly · R/F up/down · Shift boost'
              : 'Hold RMB + WASD to fly/look · left-drag orbit · wheel zoom · F frame scene'}
          </div>
        </div>
        <div className="viewport-status">
          <span>{formatNumber((previewMesh?.indices.length ?? 0) / 3)} visible triangles</span>
          <span>{Object.keys(inspection?.modelMeshes ?? {}).length} object model types resolved</span>
          <span>{project.scene.length} objects</span>
          <span>Halo coordinates · Z up</span>
          <Pill tone="blue">Editor preview</Pill>
        </div>
      </section>
      <aside className="panel inspector">
        <div className="panel-heading">
          <strong>Inspector</strong>
          {chosen && <Pill>{chosen.kind}</Pill>}
        </div>
        <details className="gs-world-environment-panel">
          <summary title="Temporary local fog, sun and ambient preview for comparing your owned map. Never modifies or exports a compiled Halo map.">Environment · preview sun, ambient &amp; fog</summary>
          <EnvironmentControls value={environment} onChange={setEnvironment}/>
        </details>
        {!chosen && (viewMode === 'materials' || viewMode === 'render') && materials.length > 0 && (
          <div className="material-lens">
            <p>Shader IDs originate from this map. The desktop editor can preview supported internal top mipmaps and, on classic PC/CE, some external raw pixels if the selected bitmaps.map is SHA-256 pinned and the index uniquely proves their byte range. External tag bodies, ambiguous entries, MCC ipaks and full engine shader effects remain unsupported. No original map or resource file is modified.</p>
            {native && inspection && matchesClassicBitmapRuntime(inspection.header.version) && <div className="gs-resource-audit" role="status">
              <button type="button" className="small-button" disabled={auditingResources || !project.source?.resourceSha256?.['bitmaps.map']}
                title="Checks the original project-selected bitmaps.map hash, bounded header, index paths and resource offsets. Does not extract, copy, or alter textures. Select resources in Build first."
                onClick={() => void checkResourceIndex()}>{auditingResources ? 'Checking original resource index…' : 'Verify selected bitmaps.map index'}</button>
              {!project.source?.resourceSha256?.['bitmaps.map'] && <small>Use Build → Choose source resources to select and hash the matching bitmaps.map first.</small>}
              {resourceAudit && <div><small>{resourceAudit.resourceCount} indexed resources · {resourceAudit.exactBitmapPathMatches} exact bitmap paths · {resourceAudit.missingBitmapPathMatches} unmatched · {resourceAudit.ambiguousBitmapPaths} duplicate paths</small><small>{resourceAudit.warning}</small></div>}
            </div>}
            <label className="shader-file-pick">Convert an owned local DDS texture to an uncompressed Halo Editing Kit TIFF source (.tif; no game writes)
              <input type="file" accept=".dds" aria-label="Convert selected DDS to TIFF source"
                onChange={event => {const file=event.target.files?.[0]; if(file)void exportLocalDdsTiff(file); event.target.value='';}} />
            </label>
            <strong>{materials.length} unique shader tags in visible BSP</strong>
            {native && inspection?.renderMesh && <div className="gs-owned-material-batch" role="status">
              <p title="One read-only SHA-verified cache snapshot per click and, if necessary, one exact pinned bitmaps.map index. Bounded output and decoded textures; nothing written to a Halo installation.">
                Verified classic materials · one batch, up to {MAX_OWNED_PREVIEWS_PER_CLICK} image slots
              </p>
              <div className="gs-owned-material-actions">
                <button type="button" className="small-button"
                  title="Preview verified shader_environment base maps and shader_model diffuse maps from one SHA-256-pinned batch. Manually selected images are preserved."
                  disabled={autoPreviewLocked || !ownedPreviewPlan?.shaderTasks.length}
                  onClick={() => void previewVerifiedMaterialBatch('shader')}>
                  Preview verified diffuse ({ownedPreviewPlan?.shaderTasks.length ?? 0} eligible)
                </button>
                <button type="button" className="small-button"
                  title="Use each BSP's exact lightmap bitm dependency and its page index, only when secondary UVs are verified and all sections agree. Does not imply engine-authentic radiosity."
                  disabled={autoPreviewLocked || !ownedPreviewPlan?.lightmapTasks.length}
                  onClick={() => void previewVerifiedMaterialBatch('lightmap')}>
                  Preview verified lightmaps ({ownedPreviewPlan?.lightmapTasks.length ?? 0} eligible)
                </button>
                <button type="button" className="small-button"
                  title="Auto-preview both exact diffuse maps and BSP-local lightmap pages using one source-verified batch. Halo lighting and shader blends remain approximate."
                  disabled={autoPreviewLocked || !(ownedPreviewPlan?.shaderTasks.length || ownedPreviewPlan?.lightmapTasks.length)}
                  onClick={() => void previewVerifiedMaterialBatch('both')}>
                  Auto-preview verified materials
                </button>
                {autoPreviewProgress?.active && <button type="button" className="small-button"
                  title="Discard the pending results of the in-flight read-only batch. Another batch cannot begin until that native operation ends."
                  onClick={cancelAutoPreview}>Cancel queued previews</button>}
              </div>
              <small>{autoPreviewProgress
                ? `${autoPreviewProgress.kind}: ${autoPreviewProgress.done}/${autoPreviewProgress.total} added, ${autoPreviewProgress.failed} refused${autoPreviewProgress.active?' · working':' · finished'}`
                : autoPreviewLocked ? 'Finishing the canceled read-only native batch before another may start.'
                : 'Exact source tag IDs only. Unavailable and unsupported formats are skipped, never replaced with guessed images.'}</small>
            </div>}
            {materialAudit && <div className="gs-material-audit" role="status">
              <p title="Bounded native cache-reader lookup of shader_environment base maps and shader_model diffuse maps. Does not extract pixel data or render game shaders.">
                Bitmap references: {materialAudit.summary.resolved} exact primary maps, {materialAudit.summary.missing} empty,
                {' '}{materialAudit.summary.invalid} invalid, {materialAudit.summary.unavailable} unavailable,
                {' '}{materialAudit.summary.legacyUnverified} from older metadata.
              </p>
              <button className="small-button" type="button" onClick={exportMaterialAudit}
                title="Save shader IDs, exact primary bitmap tag paths and lightmap sections as JSON. Read-only source metadata. This does not export game pixels or guarantee game shader compatibility.">
                Export material dependency report (.json)
              </button>
            </div>}
            {bspAudit.review && <div className="gs-material-audit" aria-label="Compiled BSP render preflight">
              <strong>Compiled BSP render preflight · source metadata</strong>
              <p>{bspAudit.review.checked.vertices} vertices / {bspAudit.review.checked.triangles} triangles across {bspAudit.review.checked.materialRanges} material spans;
                {' '}{bspAudit.review.checked.lightmapPages} BSP-specific lightmap pages. {bspAudit.review.checked.degenerateTriangles} degenerate triangles.
              </p>
              <p>{bspAudit.review.summary.errors} attribution errors / {bspAudit.review.summary.warnings} cautions.
                {bspAudit.review.summary.omittedFindings>0 ? ` (${bspAudit.review.summary.omittedFindings} additional findings summarized but not listed)` : ''}
                {' '}This checks render-buffer consistency, <strong>not</strong> Halo collision, sealed portals, radiosity or actual game loading.</p>
              <div className="analysis-actions">
                <button className="small-button" type="button" onClick={exportBspReview}
                  title="Export only source SHA-256, render counts, material tag IDs and bounded findings. Does not export source map paths, bitmap bytes, geometry or gameplay claims.">
                  Export BSP preflight (.json)
                </button>
              </div>
              {bspAudit.review.findings.length>0 && <details className="forge-tool-diagnostics">
                <summary>Inspect {bspAudit.review.findings.length} BSP preview findings</summary>
                {bspAudit.review.findings.map((issue,i)=><p key={`${issue.code}-${i}`} className="forge-hint">
                  <strong>{issue.severity} · {issue.code}</strong>: {issue.message}{issue.bspIndex!==null?` (BSP ${issue.bspIndex+1})`:''}
                </p>)}
              </details>}
            </div>}
            {bspAudit.error && <Notice tone="warning">BSP preflight unavailable: {bspAudit.error}. The source cache was not modified.</Notice>}
            {availableLightmapPages.length>0&&<div className="gs-lightmap-pages">
              <strong>Compiled BSP lightmap pages (local image preview)</strong>
              <p>These page indices and UV coverage come from the imported cache, not guessed lighting. Choose your own extracted page image. Halo's actual radiosity, blending and animated shaders still need native rendering work.</p>
              <label className="shader-file-pick" title="Use bsp_0_page_0.png and bsp_1_page_0.png when BSPs share a page number. A filename like page_3.png is accepted only if that page is unique across the entire map.">Batch match BSP-specific lightmap images
                <input type="file" multiple accept=".dds,.png,.jpg,.jpeg,.webp" aria-label="Batch attach extracted local lightmap page images"
                  onChange={event=>{const files=Array.from(event.target.files??[]);if(files.length)void attachLocalLightmapBatch(files);event.target.value='';}}/>
              </label>
              {availableLightmapPages.map(page=><div className="material-lens-assignment" key={page.key}>
                <div><strong>BSP {page.bspIndex + 1} · Page {page.page}</strong><small>{page.triangles} triangles · {page.materials} materials · {page.withRealUvs?'real lightmap UVs':'secondary UV unavailable'}</small></div>
                <label className="shader-file-pick">{lightmapNames[page.key]??`Choose image for bsp_${page.bspIndex}_page_${page.page}`}
                  <input type="file" disabled={!page.withRealUvs} accept=".dds,.png,.jpg,.jpeg,.webp"
                    aria-label={`Local lightmap image for BSP ${page.bspIndex + 1} page ${page.page}`} onChange={event=>{const file=event.target.files?.[0];if(file)void attachLightmapPage(page.bspIndex,page.page,file);event.target.value='';}}/>
                </label>
                {lightmapTextures[page.key]&&<button className="small-button" onClick={()=>{
                  setLightmapTextures(old=>{const next={...old};next[page.key]?.dispose();delete next[page.key];return next;});
                  setLightmapNames(old=>{const next={...old};delete next[page.key];return next;});
                }}>Remove page</button>}
              </div>)}
            </div>}
            <label className="shader-file-pick">Batch match local exported DDS/PNG/JPEG/WebP textures (exact names only)
              <input type="file" multiple accept=".dds,.png,.jpg,.jpeg,.webp" aria-label="Choose local textures to auto match shader paths"
                onChange={event => {const files=Array.from(event.target.files ?? []); if(files.length) void attachLocalTextureBatch(files); event.target.value='';}} />
            </label>
            <div className="material-lens-list">
              {materials.map((entry) => {
                const tag = inspection?.tags.find((item) => item.id === entry.tagId);
                const bitmapRef=tag?.references?.find(r=>/^(base map|diffuse map)$/i.test(r.label));
                const bitmapTag=inspection?.tags.find(t=>t.id===bitmapRef?.targetId&&t.class==='bitm');
                return (
                  <div className="material-lens-assignment" key={entry.tagId}>
                    <button type="button" disabled={!onOpenTag || !tag}
                      onClick={() => onOpenTag?.(entry.tagId)} title="Open actual shader tag">
                      <span className="material-chip" style={{ backgroundColor: entry.color }} />
                      <span><strong>{tag?.path ?? `Tag 0x${entry.tagId.toString(16)}`}</strong>
                        <small>{Math.round(entry.triangles)} triangles · {tag?.class ?? 'unresolved'}</small>
                        <small title="The cache reader validates each primary bitmap datum against the original source tag table. You can still manually preview a texture for unsupported shaders.">
                          {tag?.primaryBitmapStatus==='resolved' && bitmapTag ? `Primary bitmap: ${bitmapTag.path}` :
                            tag?.primaryBitmapStatus ? `Primary bitmap: ${tag.primaryBitmapStatus} (manual preview only)` :
                            'Primary bitmap: legacy/unverified (filename matching is not authoritative)'}
                        </small></span>
                    </button>
                    {native && tag?.primaryBitmapStatus === 'resolved' && bitmapTag && !bitmapTag.external && (
                      <button className="small-button" type="button" disabled={!!loadingOwnedBitmap[entry.tagId]}
                        title="Read one SHA-256-verified classic Halo bitmap top mipmap. Internal data comes from the preserved cache. External raw data is only read if a matching, unique bitmaps.map index entry fully contains the range and the project pinned its SHA-256. External tag bodies, ambiguous entries, MCC and unsupported pixel layouts fail closed."
                        onClick={() => void previewInternalBitmap(entry.tagId, bitmapTag.id)}>
                        {loadingOwnedBitmap[entry.tagId] ? 'Verifying bitmap source…' : 'Preview verified map bitmap'}
                      </button>
                    )}
                    {bitmapTag?.external && <small title="The bitmap tag *body* is external. The new resource bridge only handles external raw pixels whose tag metadata remains internal and whose byte range can be proven. Use an authorized tag extraction workflow for external tag metadata.">External bitmap tag metadata · local extraction required</small>}
                    <label className="shader-file-pick">{textureNames[entry.tagId] ? `Texture: ${textureNames[entry.tagId]}` : 'Choose local DDS/image'}
                      <input type="file" accept=".dds,.png,.jpg,.jpeg,.webp" aria-label={`Local texture for shader ${entry.tagId}`}
                        onChange={event => { const file=event.target.files?.[0]; if(file) void attachShaderTexture(entry.tagId,file); event.target.value=''; }}/>
                    </label>
                    {shaderTextures[entry.tagId] && <button type="button" aria-label={`Remove shader texture ${entry.tagId}`} onClick={() => {
                      setShaderTextures(previous => { const next={...previous}; next[entry.tagId]?.dispose(); delete next[entry.tagId]; return next; });
                      setTextureNames(previous => { const next={...previous}; delete next[entry.tagId]; return next; });
                    }}>Remove image</button>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {chosen ? (
          <div className="inspector-body">
            <label className="field-label">
              Object name
              <input value={chosen.name} onChange={(e) => update({ ...chosen, name: e.target.value })} />
            </label>
            <div className="inspector-section">
              <div className="section-label">Transform</div>
              {(['position', 'rotation', 'scale'] as const).map((property) => (
                <div className="transform-field" key={property}>
                  <label>
                    {property === 'rotation'
                      ? 'Yaw / pitch / roll'
                      : property[0].toUpperCase() + property.slice(1)}
                    {property === 'rotation' && <small>degrees</small>}
                  </label>
                  <div className="vector-inputs">
                    {chosen[property].map((value, i) => (
                      <div key={i}>
                        <span className={`axis-${i}`}>
                          {property === 'rotation' ? ['Y', 'P', 'R'][i] : ['X', 'Y', 'Z'][i]}
                        </span>
                        <NumberField
                          value={
                            property === 'rotation' ? Number(((value * 180) / Math.PI).toFixed(3)) : value
                          }
                          label={`${property} ${i}`}
                          min={property === 'scale' ? 0.001 : -1e6}
                          onCommit={(v) => {
                            try {
                              update({
                                ...chosen,
                                [property]: replaceVector(
                                  chosen[property],
                                  i,
                                  property === 'rotation' ? (v * Math.PI) / 180 : v,
                                ),
                              });
                            } catch (e) {
                              notify(String(e));
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {chosen.sourceOffset !== null && (
              <Notice>
                Position and rotation can be rebuilt through Invader. Per-instance scale and new Halo
                instances are editor-only.
              </Notice>
            )}
            <div className="inspector-actions">
              <button onClick={duplicate}>
                <Copy size={14} />
                Duplicate
              </button>
              <button
                onClick={() => {
                  edit(
                    { ...project, scene: project.scene.filter((o) => o.id !== chosen.id) },
                    `Remove ${chosen.name} from editor`,
                  );
                  setSelected(null);
                }}
              >
                <Trash2 size={14} />
                Remove
              </button>
            </div>
            <div className="subtle">
              Source object ID <code>{chosen.id}</code>
            </div>
          </div>
        ) : (
          <div className="inspector-placeholder">
            <Move3D size={26} />
            <p>Select an object in the scene or hierarchy to edit its transform.</p>
            <small>W · translate &nbsp; E · rotate &nbsp; R · scale</small>
          </div>
        )}
      </aside>
    </div>
  );
}
