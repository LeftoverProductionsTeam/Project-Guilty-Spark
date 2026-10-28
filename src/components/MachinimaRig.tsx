import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CameraHelper, PerspectiveCamera, Vector3 } from 'three';
import {createVisualPipeline} from '../visualPipeline';
import {renderFeatures} from '../renderFeatures';
import type {RenderFeatures} from '../renderFeatures';
import type { CameraShot } from '../creatorStudio';
import { sampleCamera, takeDuration } from '../machinima';
import type { CameraPose, MachinimaSettings } from '../machinima';
import type { Vec3 } from '../types';
export interface DirectorTransport {
  time: number;
  playing: boolean;
  preview: boolean;
  seek: number;
}
export interface DirectorBridge {
  pose: CameraPose | null;
  canvas: HTMLCanvasElement | null;
}
function applyPose(camera: PerspectiveCamera, pose: CameraPose) {
  camera.position.fromArray(pose.position);
  camera.up.set(0, 0, 1);
  const target = new Vector3(...pose.lookAt);
  if (target.distanceToSquared(camera.position) < 1e-8) target.x += 1;
  camera.lookAt(target);
  camera.rotateZ((pose.roll * Math.PI) / 180);
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
function Frustum({ shot, aspect }: { shot: CameraShot; aspect: number }) {
  const helper = useMemo(() => {
    const camera = new PerspectiveCamera(shot.fov, aspect, 0.1, 1.4);
    applyPose(camera, {
      position: shot.cameraPosition,
      lookAt: shot.lookAt,
      fov: shot.fov,
      roll: shot.roll ?? 0,
    });
    return new CameraHelper(camera);
  }, [shot, aspect]);
  useEffect(() => () => helper.dispose(), [helper]);
  return <primitive object={helper} />;
}
export default function MachinimaRig({
  shots,
  settings,
  transport,
  bridge,
  onTick,
  renderProfile,
}: {
  shots: CameraShot[];
  settings: MachinimaSettings;
  transport: DirectorTransport;
  bridge: MutableRefObject<DirectorBridge>;
  onTick: (time: number, ended: boolean) => void;
  renderProfile?:RenderFeatures|null;
}) {
  const { camera, scene, gl, size, viewport } = useThree();
  const features=renderFeatures(renderProfile);
  const clock = useRef({ time: transport.time, stamp: performance.now(), lastUi: 0 });
  const lens = useMemo(() => features.enabled||settings.depthOfField?createVisualPipeline(gl,scene,camera,features.enabled&&features.bloom,settings.depthOfField):null, [gl,scene,camera,features.enabled,features.bloom,settings.depthOfField]);
  useEffect(
    () => () => {
      lens?.dispose();
    },
    [lens],
  );
  useEffect(() => {
    lens?.resize(size.width,size.height,viewport.dpr,features.quality);
  }, [lens, size.width, size.height, viewport.dpr,features.quality]);
  useEffect(() => {
    clock.current = { ...clock.current, time: transport.time, stamp: performance.now() };
  }, [transport.seek, transport.playing, transport.preview, settings.speed]);
  useEffect(() => {
    bridge.current.canvas = gl.domElement;
    return () => {
      bridge.current.canvas = null;
      bridge.current.pose = null;
      delete gl.domElement.dataset.gsDirector;
      delete scene.userData.gsRenderFeatures;delete scene.userData.gsLinearOutput;
    };
  }, [bridge, gl]);
  useFrame(() => {
    const now = performance.now(),
      duration = takeDuration(shots),
      elapsed = clock.current.time + (transport.playing ? (now - clock.current.stamp) * settings.speed : 0);
    const time = settings.loopPlayback && duration > 0 ? elapsed % duration : Math.min(elapsed, duration),
      ended = transport.playing && !settings.loopPlayback && elapsed >= duration;
    const sampled = sampleCamera(shots, time);
    if (transport.preview && sampled && camera instanceof PerspectiveCamera) applyPose(camera, sampled.pose);
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    bridge.current.pose = {
      position: camera.position.toArray() as Vec3,
      lookAt: camera.position.clone().addScaledVector(direction, settings.focusDistance).toArray() as Vec3,
      fov: camera instanceof PerspectiveCamera ? camera.fov : 60,
      roll: transport.preview && sampled ? ((sampled.pose.roll + 540) % 360) - 180 : 0,
    };
    if (now - clock.current.lastUi > 80 || ended) {
      clock.current.lastUi = now;
      onTick(time, ended);
    }
    gl.domElement.dataset.gsDirector = JSON.stringify({
      time,
      playing: transport.playing,
      preview: transport.preview,
      shot: sampled?.index ?? null,
      position: bridge.current.pose.position,
      fov: bridge.current.pose.fov,
      depthOfField: settings.depthOfField,
    });
    scene.userData.gsRenderFeatures=features;scene.userData.gsLinearOutput=!!lens;
    gl.domElement.dataset.gsRenderFeatures=JSON.stringify(features);
    if(lens){lens.update(features,settings.depthOfField?{focus:settings.focusDistance,blur:settings.blur}:undefined);lens.composer.render();}else gl.render(scene,camera);
  }, 1);
  return (
    <>
      {settings.showPath && !transport.preview && shots.length > 0 && (
        <group userData={{ directorHelper: true }}>
          {shots.length > 1 && (
            <Line points={shots.map((s) => s.cameraPosition)} color="#8be7ff" lineWidth={2} />
          )}
          {shots.map((s) => (
            <Frustum
              key={s.id}
              shot={s}
              aspect={camera instanceof PerspectiveCamera ? camera.aspect : 16 / 9}
            />
          ))}
        </group>
      )}
    </>
  );
}
