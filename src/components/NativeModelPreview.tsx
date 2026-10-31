import SceneEffects from './SceneEffects';
import { DEFAULT_RENDER_FEATURES } from '../renderFeatures';
const showcaseFeatures = {
  ...DEFAULT_RENDER_FEATURES,
  enabled: true,
  quality: 'full' as const,
  bloomStrength: 0.065,
  bloomThreshold: 1.25,
  bloomRadius: 0.16,
  exposureEv: -0.15,
  selfIllumStrength: 0.85,
  specularStrength: 0.2,
  toneMapping: 'source' as const,
};
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ForgeAsset } from '../forge';

import { useOwnedForgeModels, forgeModelKey } from '../useOwnedForgeModels';
import type { OwnedModelView } from '../useOwnedForgeModels';
import type { EditorEnvironment } from '../environment';
import { DEFAULT_ENVIRONMENT } from '../environment';
import HaloMesh from './HaloMesh';
import AnimatedBiped from './AnimatedBiped';
import { useNativeModelAnimations } from '../useNativeModelAnimations';
import type { AnimationPreview } from '../animation';
import SceneEnvironment from './SceneEnvironment';
import '../nativeModelPreview.css';

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
function Model({
  view,
  live,
  showcase,
  animation,
  onAnimationError,
}: {
  view: OwnedModelView;
  live: boolean;
  showcase: boolean;
  animation?: AnimationPreview;
  onAnimationError: (error: string) => void;
}) {
  const group = useRef<THREE.Group>(null),
    { camera, pointer, invalidate, gl } = useThree();
  const poseSample = useRef(0);
  const motionAllowed = useMemo(() => !matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    if (!showcase || !live || !motionAllowed) return;
    const follow = (event: PointerEvent) => {
      const bounds = gl.domElement.getBoundingClientRect();
      pointer.set(
        THREE.MathUtils.clamp(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(1 - ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2, -1, 1),
      );
    };
    window.addEventListener('pointermove', follow, { passive: true });
    return () => window.removeEventListener('pointermove', follow);
  }, [showcase, live, motionAllowed, gl, pointer]);
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
    camera.position.set(
      fit.radius * (showcase ? 2.75 : 2.8),
      -fit.radius * (showcase ? 1 : 1.4),
      fit.radius * (showcase ? 0.65 : 0.95),
    );
    camera.lookAt(0, 0, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(0.001, fit.radius / 100);
      camera.far = fit.radius * 30;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, fit, invalidate, showcase]);
  useFrame((_, dt) => {
    if (!group.current) return;
    const target = (showcase ? -0.6 : 0) + (live && motionAllowed ? pointer.x * (showcase ? 0.45 : 0.22) : 0);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, target, 4, dt);
    group.current.rotation.x = THREE.MathUtils.damp(
      group.current.rotation.x,
      live && motionAllowed ? pointer.y * 0.045 : 0,
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
    <group ref={group}>
      <group position={fit.center.clone().multiplyScalar(-1)}>
        {animation ? (
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
    </group>
  );
}
/** Uses the exact same native geometry, texture decoder and shader as the map viewport. */
export default function NativeModelPreview({
  asset,
  live = true,
  environment,
  onSnapshot,
  showcase = false,
}: {
  asset: Pick<ForgeAsset, 'tagId' | 'sourceProjectId' | 'sourceSha256'>;
  live?: boolean;
  showcase?: boolean;
  environment?: EditorEnvironment | null;
  onSnapshot?: (url: string) => void;
}) {
  const placement = useMemo(
    () => ({ tagId: asset.tagId, sourceProjectId: asset.sourceProjectId, sourceSha256: asset.sourceSha256 }),
    [asset.sourceProjectId, asset.sourceSha256, asset.tagId],
  );
  const { models, failures } = useOwnedForgeModels([placement]);
  const animations = useNativeModelAnimations(placement, showcase);
  const [clipIndex, setClipIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [animationError, setAnimationError] = useState('');
  useEffect(() => {
    setClipIndex(0);
    setAnimationError('');
  }, [asset.sourceProjectId, asset.sourceSha256, asset.tagId]);
  const clip = animations.value?.clips[clipIndex];
  const animation = useMemo<AnimationPreview | undefined>(
    () =>
      clip && !animationError
        ? {
            clip,
            targetTagId: asset.tagId ?? 0,
            playing: playing && live,
            loop: true,
            speed: 1,
            seek: 0,
            time: 0,
            rootMotion: false,
          }
        : undefined,
    [clip, playing, live, asset.tagId, animationError],
  );
  const key = forgeModelKey(placement),
    view = models[key];
  const [visible, setVisible] = useState(false),
    host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((rows) => setVisible(rows.some((row) => row.isIntersecting)));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const value = useMemo<EditorEnvironment>(
    () =>
      environment ?? {
        ...DEFAULT_ENVIRONMENT,
        ambientColor: [0.9, 0.95, 1],
        ambientIntensity: showcase ? 0.5 : 0.85,
        sunColor: [1, 0.95, 0.88],
        sunIntensity: showcase ? 0.7 : 1.6,
        sunAzimuth: -30,
        sunElevation: 35,
      },
    [environment, showcase],
  );
  return (
    <div
      className={`native-model-preview${showcase ? ' native-model-showcase' : ''}`}
      data-transparent-background={showcase}
      ref={host}
      data-model-tag={asset.tagId ?? undefined}
      data-model-source={asset.sourceProjectId ?? undefined}
      data-model-source-hash={asset.sourceSha256 ?? undefined}
      data-model-triangles={view ? view.mesh.indices.length / 3 : 0}
      data-model-ready={!!view?.ready}
      data-native-animation-count={animations.value?.clips.length ?? 0}
      data-model-textures={view ? Object.keys(view.shaderTextures).length : 0}
      data-model-reflections={
        view
          ? Object.values(view.extraTextures).filter((texture) => texture instanceof THREE.CubeTexture).length
          : 0
      }
    >
      {view && visible ? (
        <Canvas
          camera={{ fov: 42, up: [0, 0, 1] }}
          dpr={showcase ? [1.5, 2] : [1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: !!onSnapshot,
          }}
          frameloop={live || onSnapshot ? 'always' : 'demand'}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <Suspense fallback={null}>
            <SceneEnvironment value={value} overrideLighting transparentBackground={showcase} />
            {showcase && <SceneEffects settings={showcaseFeatures} transparentBackground />}
            <Model
              view={view}
              live={live}
              showcase={showcase}
              animation={animation}
              onAnimationError={setAnimationError}
            />
            {onSnapshot && <Snapshot ready={!!view.ready} onSnapshot={onSnapshot} />}
          </Suspense>
        </Canvas>
      ) : (
        <span className="model-preview-loading">
          {failures[key] ? 'Model unavailable' : 'Reading the actual Halo model…'}
        </span>
      )}
      {failures[key] && <small role="status">{failures[key]}</small>}
      {showcase && (
        <div className="native-model-animation-controls">
          {!!animations.value?.clips.length && !animationError ? (
            <>
              <button
                onClick={() => setPlaying((value) => !value)}
                aria-label={playing ? 'Pause showcase animation' : 'Play showcase animation'}
              >
                {playing ? 'Ⅱ' : '▶'}
              </button>
              <select
                aria-label="Showcase animation"
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
