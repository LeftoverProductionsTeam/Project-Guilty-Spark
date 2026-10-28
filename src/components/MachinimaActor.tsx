import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import type { ForgeSpawn } from '../forge';
import type { OwnedModelView } from '../useOwnedForgeModels';
import { createSourceCollisionWorld, stepSourceWalk } from '../liveCollision';
import type { WalkState } from '../liveCollision';
import { isEditingText } from '../editorFlight';
import AnimatedBiped from './AnimatedBiped';
import type { AnimationPreview } from '../animation';
import { readMapSession, writeMapSession } from '../mapSession';
export interface RehearsalFrame {
  time: number;
  actor: { position: number[]; yaw: number };
  camera: { position: number[]; quaternion: number[] };
}
/** A detached-camera rehearsal with actual owned geometry, skin weights and
 * optional animation clips. Game actors are controlled by the native take. */
export default function MachinimaActor({
  actor,
  model,
  snapshot,
  recording,
  take,
  onError,
  animation,
  sessionId,
}: {
  actor: ForgeSpawn;
  model: OwnedModelView;
  snapshot: { mesh: { positions: number[]; indices: number[] } } | null;
  recording: boolean;
  take: MutableRefObject<RehearsalFrame[]>;
  onError: (message: string) => void;
  animation?: AnimationPreview | null;
  sessionId?: string;
}) {
  const group = useRef<THREE.Group>(null),
    keys = useRef(new Set<string>()),
    yaw = useRef(actor.facing),
    elapsed = useRef(0),
    sample = useRef(0);
  const motion = useRef<WalkState>({
    feet: [...actor.position],
    verticalSpeed: 0,
    grounded: false,
    contacts: 0,
  });
  const { gl, camera, controls, scene } = useThree();
  const body = useMemo(() => {
    let lo = Infinity,
      hi = -Infinity;
    for (let i = 2; i < model.mesh.positions.length; i += 3) {
      lo = Math.min(lo, model.mesh.positions[i]);
      hi = Math.max(hi, model.mesh.positions[i]);
    }
    const height = Math.max(0.2, hi - lo);
    return { height, radius: Math.max(0.04, height * 0.18) };
  }, [model.mesh]);
  const collider = useMemo(() => {
    try {
      return { world: snapshot ? createSourceCollisionWorld(snapshot.mesh, body) : null, error: '' };
    } catch (error) {
      return { world: null, error: String(error) };
    }
  }, [snapshot?.mesh, body]);
  useEffect(() => {
    if (collider.error) onError(collider.error);
  }, [collider.error]);
  useEffect(() => {
    const key = `actor.${actor.id}`,
      pose = sessionId
        ? readMapSession<{ anchor: number[]; position: number[]; yaw: number } | null>(sessionId, key, null)
        : null;
    const valid =
      pose &&
      JSON.stringify(pose.anchor) === JSON.stringify(actor.position) &&
      Array.isArray(pose.position) &&
      pose.position.length === 3 &&
      pose.position.every(Number.isFinite) &&
      Number.isFinite(pose.yaw);
    motion.current = {
      feet: valid ? ([...pose.position] as [number, number, number]) : [...actor.position],
      verticalSpeed: 0,
      grounded: false,
      contacts: 0,
    };
    yaw.current = valid ? pose.yaw : actor.facing;
    return () => {
      if (sessionId)
        writeMapSession(sessionId, key, {
          anchor: actor.position,
          position: motion.current.feet,
          yaw: yaw.current,
        });
    };
  }, [actor.id, actor.position, actor.facing, sessionId]);
  useEffect(() => {
    if (recording) {
      elapsed.current = 0;
      sample.current = 0;
      take.current = [];
    }
  }, [recording]);
  useEffect(() => {
    const allowed = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyQ',
      'KeyE',
      'ShiftLeft',
      'ShiftRight',
    ];
    const down = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditingText(event.target) ||
        !allowed.includes(event.code)
      )
        return;
      event.preventDefault();
      keys.current.add(event.code);
    };
    const up = (event: KeyboardEvent) => keys.current.delete(event.code),
      clear = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      delete gl.domElement.dataset.gsActor;
    };
  }, [gl]);
  useEffect(() => {
    const frame = () => {
      const center = new THREE.Vector3(...motion.current.feet).add(
        new THREE.Vector3(0, 0, body.height * 0.5),
      );
      let best: THREE.Vector3 | null = null,
        score = -1;
      const ray = new THREE.Raycaster();
      for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const angle = yaw.current + offset,
          direction = new THREE.Vector3(
            Math.cos(angle) * body.height * 2.4,
            Math.sin(angle) * body.height * 2.4,
            body.height * 0.35,
          ),
          distance = direction.length();
        direction.normalize();
        ray.set(center, direction);
        ray.near = 0.03;
        ray.far = distance;
        const hit = ray.intersectObjects(scene.children, true).find((h) => {
          if (!(h.object instanceof THREE.Mesh)) return false;
          let o: THREE.Object3D | null = h.object;
          while (o) {
            if (o === group.current || o.userData.directorHelper) return false;
            o = o.parent;
          }
          return true;
        });
        const available = hit ? Math.max(0.15, hit.distance - 0.06) : distance;
        if (available > score) {
          score = available;
          best = center.clone().addScaledVector(direction, available);
        }
      }
      if (best) camera.position.copy(best);
      camera.up.set(0, 0, 1);
      camera.lookAt(center);
      const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void };
      orbit?.target?.copy(center);
      orbit?.update?.();
    };
    window.addEventListener('gs:frame-director-actor', frame);
    return () => window.removeEventListener('gs:frame-director-actor', frame);
  }, [camera, controls, scene, body]);
  useFrame((_, delta) => {
    if (!group.current || !collider.world) return;
    const dt = Math.min(delta, 0.05),
      input = keys.current;
    yaw.current += ((input.has('KeyQ') ? 1 : 0) - (input.has('KeyE') ? 1 : 0)) * dt * 1.8;
    const forward = (input.has('ArrowUp') ? 1 : 0) - (input.has('ArrowDown') ? 1 : 0),
      side = (input.has('ArrowRight') ? 1 : 0) - (input.has('ArrowLeft') ? 1 : 0),
      size = Math.max(1, Math.hypot(forward, side));
    const speed = input.has('ShiftLeft') || input.has('ShiftRight') ? 6 : 2.5,
      c = Math.cos(yaw.current),
      s = Math.sin(yaw.current);
    motion.current = stepSourceWalk(
      collider.world,
      motion.current,
      [((c * forward + s * side) * speed) / size, ((s * forward - c * side) * speed) / size, 0],
      dt,
    );
    group.current.position.fromArray(motion.current.feet);
    group.current.rotation.z = yaw.current;
    gl.domElement.dataset.gsActor = JSON.stringify({
      position: motion.current.feet,
      yaw: yaw.current,
      grounded: motion.current.grounded,
      height: body.height,
      sourceCollision: true,
      gameActor: false,
    });
    if (recording && take.current.length < 1800) {
      elapsed.current += dt;
      sample.current += dt;
      if (sample.current >= 1 / 30) {
        sample.current = 0;
        take.current.push({
          time: elapsed.current,
          actor: { position: [...motion.current.feet], yaw: yaw.current },
          camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
        });
      }
    }
  });
  return (
    <group ref={group} position={actor.position} rotation={[0, 0, actor.facing]}>
      <AnimatedBiped model={model} animation={animation} onError={onError} />
    </group>
  );
}
