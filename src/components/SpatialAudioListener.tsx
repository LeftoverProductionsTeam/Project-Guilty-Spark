import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { publishAudioListener } from '../spatialAudio';
import type { Vec3 } from '../types';
/** Camera and Halo map coordinates both use Z up; no axis guessing/swizzle. */
export default function SpatialAudioListener({ mapId }: { mapId: string }) {
  const { camera } = useThree(),
    elapsed = useRef(0),
    forward = useRef(new Vector3()),
    up = useRef(new Vector3());
  useFrame((_, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 0.05) return;
    elapsed.current = 0;
    camera.getWorldDirection(forward.current);
    up.current.set(0, 1, 0).applyQuaternion(camera.quaternion);
    publishAudioListener(mapId, {
      position: camera.position.toArray() as Vec3,
      forward: forward.current.toArray() as Vec3,
      up: up.current.toArray() as Vec3,
    });
  });
  return null;
}
