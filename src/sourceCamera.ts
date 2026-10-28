import type {SceneObject, Vec3} from './types';

/** Player starts store feet positions and a Halo yaw around the world Z axis.
 * The eye offset is an editor viewing aid; it does not simulate a biped. */
export function playerStartCamera(start: SceneObject): {position: Vec3; target: Vec3} {
  const yaw = start.rotation[0], pitch = start.rotation[1];
  const position: Vec3 = [start.position[0], start.position[1], start.position[2] + 0.62];
  return {position, target: [position[0] + Math.cos(yaw) * Math.cos(pitch) * 12,
    position[1] + Math.sin(yaw) * Math.cos(pitch) * 12,
    position[2] + Math.sin(pitch) * 12]};
}
