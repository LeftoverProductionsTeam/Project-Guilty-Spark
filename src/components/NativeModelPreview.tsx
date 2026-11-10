import SceneEffects from './SceneEffects';
import {native} from '../api';
import { DEFAULT_RENDER_FEATURES } from '../renderFeatures';
const showcaseFeatures = {
  ...DEFAULT_RENDER_FEATURES,
  enabled: true,
  quality: 'full' as const,
  bloomStrength: 0.065,
  bloomThreshold: 1.25,
  bloomRadius: 0.16,
  exposureEv: -0.15,
  normalMaps:false,
  specular:false,
  selfIllumination:false,
  toneMapping: 'source' as const,
};
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import type { ForgeAsset } from '../forge';

import { useOwnedForgeModels, forgeModelKey } from '../useOwnedForgeModels';
import type { OwnedModelView } from '../useOwnedForgeModels';
import type { EditorEnvironment } from '../environment';
import { sourceSurfaceEnvironment } from '../environment';
import {modelSourceAppearance} from '../modelSourceAppearance';
import {glassWithoutDiffuse,unassignedNativeTriangles} from '../nativeShaderTextures';
import type {ModelSourceAppearance} from '../modelSourceAppearance';
import HaloMesh from './HaloMesh';
import AnimatedBiped from './AnimatedBiped';
import { useNativeModelAnimations } from '../useNativeModelAnimations';
import type { AnimationPreview } from '../animation';
import SceneEnvironment from './SceneEnvironment';
import '../nativeModelPreview.css';
import { useWorkspaceActivity } from './WorkspaceActivity';
import { readMapSession, writeMapSession } from '../mapSession';
import { modelFitPosition, validModelPreviewCamera } from '../modelPreviewCamera';
import ShieldLoading from './ShieldLoading';
import ViewportActivity from './ViewportActivity';
import type { ModelViewPreset } from '../modelPreviewCamera';
import type { MeshData } from '../types';
import { loadOwnedCollision } from '../useEndToFloor';

function Snapshot({ ready, onSnapshot }: { ready: boolean; onSnapshot: (url: string) => void }) {
  const { gl } = useThree(),
    frames = useRef(0),
    done = useRef(false);
  useFrame(() => {
    if (!ready || done.current) return;
    if (++frames.current > 3) {
      done.current = true;
      requestAnimationFrame(() => onSnapshot(gl.domElement.toDataURL('image/png')));
    }
  });
  return null;
}
function FirstUsableFrame({ready,onReady}:{ready:boolean;onReady:()=>void}){
  const sent=useRef(false);
  useFrame(()=>{if(ready&&!sent.current){sent.current=true;requestAnimationFrame(onReady);}});
  return null;
}
function Model({
  view,
  live,
  showcase,
  portrait,
  animation,
  onAnimationError,
  identity,
  framing,
  surface,
  collision,
}: {
  view: OwnedModelView;
  live: boolean;
  showcase: boolean;
  portrait: boolean;
  animation?: AnimationPreview;
  onAnimationError: (error: string) => void;
  identity:{projectId:string;sourceHash:string;tagId:number};
  framing:{preset:ModelViewPreset;revision:number};
  surface: 'render' | 'collision';
  collision: MeshData | null;
}) {
  const group = useRef<THREE.Group>(null),
    { camera, gl, invalidate } = useThree();
  const pointer=useRef({x:0,y:0});
  const {active}=useWorkspaceActivity();
  const controls=useRef<ComponentRef<typeof OrbitControls>>(null);
  const sessionKey=`preview.camera.${identity.tagId}`;
  const remember=()=>{
    const target=controls.current?.target??new THREE.Vector3();
    const value={sourceHash:identity.sourceHash,position:camera.position.toArray(),target:target.toArray()};
    if(validModelPreviewCamera(value,identity.sourceHash,fit.radius))writeMapSession(identity.projectId,sessionKey,value);
    gl.domElement.dataset.gsPreviewCamera=JSON.stringify(value);invalidate();
  };
  const poseSample = useRef(0);
  const motionAllowed = useMemo(() => !matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    if (!showcase || !live || !motionAllowed) return;
    const follow = (event: PointerEvent) => {
      pointer.current.x=THREE.MathUtils.clamp(event.clientX/Math.max(1,innerWidth)*2-1,-1,1);
      pointer.current.y=THREE.MathUtils.clamp(1-event.clientY/Math.max(1,innerHeight)*2,-1,1);
    };
    window.addEventListener('pointermove', follow, { passive: true });
    return () => window.removeEventListener('pointermove', follow);
  }, [showcase, live, motionAllowed]);
  const fit = useMemo(() => {
    const box = new THREE.Box3();
    for (let i = 0; i < view.mesh.positions.length; i += 3)
      box.expandByPoint(new THREE.Vector3().fromArray(view.mesh.positions, i));
    const center = box.getCenter(new THREE.Vector3());
    let radius = 0.01;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < view.mesh.positions.length; i += 3)
      radius = Math.max(radius, vertex.fromArray(view.mesh.positions, i).distanceTo(center));
    return { center, radius };
  }, [view.mesh]);
  useEffect(() => {
    camera.up.set(0, 0, 1);
    const aspect=camera instanceof THREE.PerspectiveCamera?camera.aspect:1;
    const stored=readMapSession<unknown>(identity.projectId,sessionKey,null);
    const restore=!showcase&&framing.revision===0&&validModelPreviewCamera(stored,identity.sourceHash,fit.radius)?stored:null;
    camera.position.fromArray(restore?.position??(portrait?[fit.radius*3.15,0,0]:showcase?[fit.radius*2.1,-fit.radius,fit.radius*.65]:modelFitPosition(fit.radius,aspect,42,framing.preset)));
    const target=new THREE.Vector3().fromArray(restore?.target??[0,0,0]);
    controls.current?.target.copy(target);camera.lookAt(target);controls.current?.update();
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(0.001, fit.radius / 100);
      camera.far = fit.radius * 60;
      camera.updateProjectionMatrix();
    }
    invalidate();
    if(!showcase)remember();
  }, [camera, fit, invalidate, showcase,portrait,identity.projectId,identity.sourceHash,sessionKey,framing]);
  useFrame((_, dt) => {
    if (!group.current || !active) return;
    // Keep the left-facing resting pose, but let the right half of the page
    // turn the model far enough to face that side as well.
    const followYaw = pointer.current.x * (pointer.current.x > 0 ? 1 : 0.6);
    const target = showcase&&!portrait ? -1.0 + (live && motionAllowed ? followYaw : 0) : 0;
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, target, 4, dt);
    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      showcase && live && motionAllowed ? pointer.current.y * 0.08 : 0,
      4,
      dt,
    );
    if (showcase && (poseSample.current += dt) > 0.1) {
      poseSample.current = 0;
      group.current.updateWorldMatrix(true, false);
      const origin = new THREE.Vector3().project(camera),
        front = new THREE.Vector3(fit.radius, 0, 0).applyMatrix4(group.current.matrixWorld).project(camera);
      gl.domElement.dataset.gsShowcasePose = JSON.stringify({
        yaw: group.current.rotation.z,
        pitch: group.current.rotation.x,
        screenHeading: front.x - origin.x,
      });
    }
  });
  return (
    <><group ref={group}>
      <group position={fit.center.clone().multiplyScalar(-1)}>
        {surface === 'collision' ? (
          collision && <HaloMesh data={collision} wireframe color="#84dddb" />
        ) : animation ? (
          <AnimatedBiped model={view} animation={animation} onError={onAnimationError} />
        ) : (
          <HaloMesh
            data={view.mesh}
            shaderTextures={view.shaderTextures}
            shaderMetadata={view.shaderMetadata}
            extraTextures={view.extraTextures}
          />
        )}
      </group>
    </group>{!showcase&&<OrbitControls ref={controls} makeDefault enabled={live} enablePan enableDamping minDistance={fit.radius*.15} maxDistance={fit.radius*25} onEnd={remember}/>}</>
  );
}
/** Uses the exact same native geometry, texture decoder and shader as the map viewport. */
export default function NativeModelPreview({
  asset,
  live = true,
  environment,
  onSnapshot,
  showcase = false,
  portrait = false,
  animate = showcase,
  surface = 'render',
  onMaterials,
}: {
  asset: Pick<ForgeAsset, 'tagId' | 'sourceProjectId' | 'sourceSha256' | 'modelVariant'>;
  live?: boolean;
  showcase?: boolean;
  portrait?: boolean;
  animate?: boolean;
  surface?: 'render' | 'collision';
  onMaterials?: (shaderIds:number[]) => void;
  environment?: EditorEnvironment | null;
  onSnapshot?: (url: string) => void;
}) {
  const placement = useMemo(
    () => ({ tagId: asset.tagId, sourceProjectId: asset.sourceProjectId, sourceSha256: asset.sourceSha256,modelVariant:asset.modelVariant }),
    [asset.sourceProjectId, asset.sourceSha256, asset.tagId,asset.modelVariant],
  );
  const activity=useWorkspaceActivity();
  const [framing,setFraming]=useState<{preset:ModelViewPreset;revision:number}>({preset:'fit',revision:0});
  const identity=useMemo(()=>({projectId:asset.sourceProjectId??'',sourceHash:asset.sourceSha256??'',tagId:asset.tagId??0}),[asset.sourceProjectId,asset.sourceSha256,asset.tagId]);
  const [retry,setRetry]=useState(0);
  const { models, failures } = useOwnedForgeModels([placement],{[placement.sourceProjectId??'']:`preview:${retry}`});
  const animations = useNativeModelAnimations(placement, animate);
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [animationError, setAnimationError] = useState('');
  useEffect(() => {
    setClipIndex(0);
    setAnimationError('');
    setFraming({preset:'fit',revision:0});
  }, [asset.sourceProjectId, asset.sourceSha256, asset.tagId]);
  const clip = animations.value?.clips[clipIndex];
  const animation = useMemo<AnimationPreview | undefined>(
    () =>
      animate && clip && !animationError
        ? {
            clip,
            targetTagId: asset.tagId ?? 0,
            playing: playing && live && activity.active,
            loop: true,
            speed: 1,
            seek: 0,
            time: 0,
            rootMotion: false,
          }
        : undefined,
    [animate,clip, playing, live, activity.active,asset.tagId, animationError],
  );
  const key = forgeModelKey(placement),
    view = models[key];
  const materialIds=useMemo(()=>view?[...new Set(view.mesh.materialRanges?.map(range=>range.shaderTagId)??[])]:[],[view?.mesh]);
  const unassignedTriangles=useMemo(()=>view?unassignedNativeTriangles(view.mesh):null,[view?.mesh]);
  const missingShaderCount=view?materialIds.filter(id=>!view.shaderMetadata[id]||!view.shaderTextures[id]&&!glassWithoutDiffuse(view.shaderMetadata[id])).length:0;
  const incompleteAttribution=!!view&&(unassignedTriangles===null||unassignedTriangles>0);
  useEffect(()=>{if(view)onMaterials?.(materialIds);},[view?.mesh,materialIds,onMaterials]);
  const [collision, setCollision] = useState<{key:string;mesh:MeshData|null;error?:string}|null>(null);
  const [collisionRetry, setCollisionRetry] = useState(0);
  useEffect(() => {
    if (surface !== 'collision') return;
    let active = true;
    setCollision(null);
    void loadOwnedCollision({projectId:identity.projectId,sourceSha256:identity.sourceHash,tagId:identity.tagId})
      .then(mesh => { if (active) setCollision({key,mesh}); }, error => {
        if (active) setCollision({key,mesh:null,error:String(error)});
      });
    return () => { active = false; };
  }, [surface,identity.projectId,identity.sourceHash,identity.tagId,key,collisionRetry]);
  const collisionValue = collision?.key === key ? collision : null;
  const [sourceLighting,setSourceLighting]=useState<{key:string;value:ModelSourceAppearance|null}|null>(null);
  useEffect(()=>{let alive=true;setSourceLighting(null);if(!native||!identity.projectId||!identity.sourceHash){setSourceLighting({key,value:null});return;}
    void modelSourceAppearance(identity.projectId,identity.sourceHash).then(value=>{if(alive)setSourceLighting({key,value});},()=>{if(alive)setSourceLighting({key,value:null});});return()=>{alive=false;};
  },[identity.projectId,identity.sourceHash,key]);
  const [visible, setVisible] = useState(false),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((rows) => setVisible(rows.some((row) => row.isIntersecting)));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const value = useMemo<EditorEnvironment>(
    () =>
      environment ?? (sourceLighting?.key===key?sourceLighting.value?.environment:null) ?? sourceSurfaceEnvironment(),
    [environment,sourceLighting,key],
  );
  const [firstFrame,setFirstFrame]=useState('');
  // Decoded data may stay warm while its actual GPU context is retired. A new
  // context must paint before reporting readiness, just like the initial one.
  useEffect(()=>{if(!activity.graphicsResident)setFirstFrame('');},[activity.graphicsResident]);
  const lightingReady=!!environment||sourceLighting?.key===key;
  const animationReady=surface==='collision'||!animate||!!animations.value||!!animations.error;
  const frameKey = `${key}:${surface}`;
  const usable=!!view?.ready&&!failures[key]&&lightingReady&&animationReady&&(surface!=='collision'||!!collisionValue?.mesh);
  const pendingPhase=failures[key]?null:!view?'Reading native geometry':surface==='collision'&&!collisionValue?'Reading native collision':surface==='collision'&&!collisionValue?.mesh?null:!view.ready?'Loading source textures & reflections':!lightingReady?'Reading source lighting':!animationReady?'Reading native animation':firstFrame!==frameKey?'Preparing first viewport frame':null;
  return (
    <div
      className={`native-model-preview${showcase ? ' native-model-showcase' : ''}`}
      data-transparent-background={showcase}
      data-model-portrait={portrait?'front':undefined}
      ref={host}
      data-model-tag={asset.tagId ?? undefined}
      data-model-source={asset.sourceProjectId ?? undefined}
      data-model-source-hash={asset.sourceSha256 ?? undefined}
      data-model-variant={asset.modelVariant}
      data-model-triangles={view ? view.mesh.indices.length / 3 : 0}
      data-model-shader-ids={materialIds.join(',')}
      data-model-ready={!!view?.ready}
      data-model-first-frame={firstFrame===frameKey}
      data-model-surface={surface}
      data-collision-triangles={surface==='collision'&&collisionValue?.mesh?collisionValue.mesh.indices.length/3:undefined}
      data-collision-status={surface==='collision'?collisionValue?.error?'rejected':collisionValue?.mesh?'ready':collisionValue?'absent':'loading':undefined}
      data-model-loading-phase={pendingPhase??undefined}
      data-native-animation-count={animations.value?.clips.length ?? 0}
      data-native-self-illumination={view?Object.values(view.shaderMetadata).filter(m=>m.selfIllumination?.source===0&&[...m.selfIllumination.lower,...m.selfIllumination.upper].some(v=>v>0)).length:0}
      data-model-lighting={environment?'custom':sourceLighting?.key===key&&sourceLighting.value?.environment?'source':'inspection'}
      data-model-lighting-ready={!!environment||sourceLighting?.key===key}
      data-model-textures={view ? Object.keys(view.shaderTextures).length : 0}
      data-model-original-mips={view?JSON.stringify(Object.entries(view.shaderTextures).map(([shader,texture])=>({shader:Number(shader),levels:texture.userData.originalMipLevels??0,generated:texture.generateMipmaps}))):undefined}
      data-model-missing-shaders={missingShaderCount}
      data-model-texture-warnings={view?.textureWarnings?.length??0}
      data-model-unassigned-triangles={view?(unassignedTriangles??'unknown'):undefined}
      data-model-material-gaps={missingShaderCount+(incompleteAttribution?1:0)}
      data-model-reflections={
        view
          ? Object.values(view.extraTextures).filter((texture) => texture instanceof THREE.CubeTexture).length
          : 0
      }
    >
      {view && (visible||live||onSnapshot) && activity.graphicsResident ? (
        <Canvas
          camera={{ fov: 42, up: [0, 0, 1] }}
          dpr={portrait ? 1 : showcase ? [1.5, 2] : [1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: !!onSnapshot,
          }}
          frameloop={activity.active&&(visible||onSnapshot)&&(live||onSnapshot)?'always':'demand'}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <ViewportActivity continuous={!!((live||onSnapshot)&&visible)}/>
          <Suspense fallback={null}>
            <SceneEnvironment value={value} maximumFogDensity={sourceLighting?.key===key?sourceLighting.value?.fogMaximumDensity??1:1} overrideLighting transparentBackground={showcase} />
            {showcase && <SceneEffects settings={showcaseFeatures} transparentBackground />}
            <Model
              view={view}
              live={live&&visible&&activity.active}
              showcase={showcase}
              portrait={portrait}
              animation={animation}
              onAnimationError={setAnimationError}
              identity={identity}
              framing={framing}
              surface={surface}
              collision={collisionValue?.mesh??null}
            />
            <FirstUsableFrame key={frameKey} ready={usable} onReady={()=>setFirstFrame(frameKey)}/>
            {onSnapshot && <Snapshot ready={!!view.ready&&(!!environment||sourceLighting?.key===key)} onSnapshot={onSnapshot} />}
          </Suspense>
        </Canvas>
      ) : (
        failures[key]?<span className="model-preview-loading">Model unavailable</span>:null
      )}
      <ShieldLoading phase={pendingPhase} active={activity.active&&visible}/>
      {failures[key] && <small role="status">{failures[key]} <button type="button" onClick={()=>{setFirstFrame('');setRetry(n=>n+1);}}>Retry preview</button></small>}
      {!!view?.textureWarnings?.length&&<small className="model-material-coverage" role="status" aria-label="Original texture detail warning">{view.textureWarnings.join(' ')}</small>}
      {surface==='collision'&&collisionValue&&<small className="model-collision-status" role="status">
        {collisionValue.error?<>Native collision rejected: {collisionValue.error} <button onClick={()=>setCollisionRetry(n=>n+1)}>Retry collision</button></>:collisionValue.mesh?`${collisionValue.mesh.indices.length/3} native collision triangles · default pose`:'No native collision geometry is attached to this object.'}
      </small>}
      {surface==='render'&&incompleteAttribution&&<small className="model-material-coverage" role="status" aria-label="Model material coverage">
        {unassignedTriangles===null?'Source material coverage unavailable.':
          `Source materials incomplete · ${unassignedTriangles} ${unassignedTriangles===1?'triangle uses':'triangles use'} inspection shading.`}
      </small>}
      {!showcase&&sourceLighting?.key===key&&!sourceLighting.value?.environment&&!environment&&<small className="model-lighting-status">Source lighting unavailable · inspection lighting</small>}
      {!showcase&&live&&<div className="native-model-view-controls" aria-label="Model preview controls">
        <button type="button" title="Fit the complete model to this preview" onClick={()=>setFraming(value=>({preset:'fit',revision:value.revision+1}))}>Fit / Reset</button>
        <select aria-label="Model view" value={framing.preset} onChange={event=>setFraming(value=>({preset:event.target.value as ModelViewPreset,revision:value.revision+1}))}>
          <option value="fit">Perspective</option><option value="front">Front</option><option value="side">Side</option><option value="top">Top</option>
        </select>
        <span>Drag orbit · wheel zoom · right-drag pan</span>
      </div>}
      {animate && surface==='render' && (
        <div className="native-model-animation-controls">
          {!!animations.value?.clips.length && !animationError ? (
            <>
              <button
                onClick={() => setPlaying((value) => !value)}
                aria-label={showcase?(playing?'Pause showcase animation':'Play showcase animation'):(playing?'Pause model animation':'Play model animation')}
              >
                {playing ? 'Ⅱ' : '▶'}
              </button>
              <select
                aria-label={showcase?'Showcase animation':'Model animation'}
                value={clipIndex}
                onChange={(event) => setClipIndex(Number(event.target.value))}
              >
                {animations.value.clips.map((clip, index) => (
                  <option key={clip.name} value={index}>
                    {clip.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            (animationError || animations.error) && (
              <span title={animationError || animations.error}>Native animation unavailable</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
