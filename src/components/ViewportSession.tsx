import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { readMapSession, writeMapSession } from '../mapSession';
interface Pose {
  type: string;
  position: number[];
  quaternion: number[];
  target?: number[];
  zoom: number;
}
const finite = (a: unknown, n: number): a is number[] =>
  Array.isArray(a) &&
  a.length === n &&
  a.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e8);
export function hasViewportSession(id: string, channel: string, type: string) {
  const pose = readMapSession<Pose | null>(id, `camera.${channel}.${type}`, null);
  return (
    !!pose &&
    pose.type === type &&
    finite(pose.position, 3) &&
    finite(pose.quaternion, 4) &&
    Number.isFinite(pose.zoom) &&
    pose.zoom > 0.0001 &&
    pose.zoom < 10000
  );
}
export default function ViewportSession({
  id,
  channel,
  paused = false,
  ready = true,
  requiresControls = false,
}: {
  id: string;
  channel: string;
  paused?: boolean;
  ready?: boolean;
  requiresControls?: boolean;
}) {
  const { camera, controls, gl } = useThree(),
    elapsed = useRef(0),
    restored = useRef<{ camera: unknown; controls: unknown } | null>(null),
    flushRef = useRef<() => void>(() => {}),
    pause = useRef(paused);
  pause.current = paused;
  useEffect(() => {
    const flush = (event: Event) => { if ((event as CustomEvent<string>).detail === id) flushRef.current(); };
    window.addEventListener('guilty-spark-flush-map-view', flush);
    return () => window.removeEventListener('guilty-spark-flush-map-view', flush);
  }, [id]);
  const key = `camera.${channel}.${camera.type}`;
  const view = camera as import('three').PerspectiveCamera | import('three').OrthographicCamera;
  const controlMatches = !!controls && (controls as unknown as { object: unknown }).object === camera;
  const contextReady = ready && !!camera.userData.gsEditorCamera && (!requiresControls || controlMatches);
  useEffect(() => {
    if (!contextReady) return;
    const pose = readMapSession<Pose | null>(id, key, null);
    if (
      !paused &&
      pose?.type === camera.type &&
      finite(pose.position, 3) &&
      finite(pose.quaternion, 4) &&
      Number.isFinite(pose.zoom) &&
      pose.zoom > 0.0001 &&
      pose.zoom < 10000
    ) {
      camera.position.fromArray(pose.position);
      camera.quaternion.fromArray(pose.quaternion).normalize();
      view.zoom = pose.zoom;
      camera.updateProjectionMatrix();
      const orbit = controlMatches
        ? (controls as unknown as { target?: import('three').Vector3; update?: () => void })
        : undefined;
      if (finite(pose.target, 3)) orbit?.target?.fromArray(pose.target);
      orbit?.update?.();
    }
    restored.current = { camera, controls };
  }, [id, key, camera, controls, contextReady]);
  function save() {
    if (
      !contextReady ||
      restored.current?.camera !== camera ||
      restored.current?.controls !== controls ||
      pause.current
    )
      return;
    const rounded = (a: number[]) => a.map((v) => Math.round(v * 1e6) / 1e6);
    const orbit = controlMatches ? (controls as unknown as { target?: import('three').Vector3 }) : undefined;
    const pose: Pose = {
      type: camera.type,
      position: rounded(camera.position.toArray()),
      quaternion: rounded(camera.quaternion.toArray()),
      zoom: view.zoom,
      target: orbit?.target ? rounded(orbit.target.toArray()) : undefined,
    };
    writeMapSession(id, key, pose);
    gl.domElement.dataset.gsCameraPose = JSON.stringify(pose);
  }
  useFrame((_, delta) => {
    if (contextReady) flushRef.current = save;
    elapsed.current += delta;
    if (elapsed.current > 0.25) {
      elapsed.current = 0;
      save();
    }
  });
  useEffect(() => {
    const flush = () => flushRef.current();
    window.addEventListener('gs:save-viewport-context', flush);
    return () => {
      window.removeEventListener('gs:save-viewport-context', flush);
      flushRef.current();
    };
  }, [id, channel]);
  return null;
}
