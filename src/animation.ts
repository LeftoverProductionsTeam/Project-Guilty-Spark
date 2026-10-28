import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import type { MeshData, ModelRig } from './types';
export interface AnimationNode {
  name: string;
  parent: number;
}
export interface AnimationClip {
  name: string;
  fps: number;
  frameCount: number;
  checksum: number;
  nodes: AnimationNode[];
  transforms: number[];
}
export interface AnimationAsset {
  id: string;
  name: string;
  kind: 'clip' | 'graph';
  sourcePath: string;
  sourceSha256: string;
  dataPath: string;
  dataSha256: string;
  frameCount: number;
  fps: number;
  checksum: number;
  nodeNames: string[];
  animationNames: string[];
}
export interface AnimationAssignment {
  id: string;
  assetId: string;
  targetTagId: number;
  targetTagPath: string;
  sourceSha256: string;
  mode: 'custom' | 'replace-graph';
  playOnTake: boolean;
}
export interface AnimationPreview {
  clip: AnimationClip;
  targetTagId: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  seek: number;
  time: number;
  rootMotion: boolean;
}
export function animationMapping(clip: AnimationClip, rig: ModelRig): number[] {
  if (!rig.nodes.length || rig.nodes.length > 64 || clip.nodes.length !== rig.nodes.length)
    throw Error('Animation and biped have different skeleton sizes. Export using this biped’s rig.');
  const exact = clip.checksum === rig.checksum;
  const names = new Map(clip.nodes.map((n, i) => [n.name.toLowerCase(), i]));
  if (names.size !== clip.nodes.length) throw Error('Animation has duplicate bone names.');
  const mapping = rig.nodes.map((n, i) => (exact ? i : (names.get(n.name.toLowerCase()) ?? -1)));
  if (mapping.some((i) => i < 0))
    throw Error('Animation bone names do not match this biped. Automatic bone retargeting is unavailable.');
  for (let i = 0; i < mapping.length; i++) {
    const parent = rig.nodes[i].parent,
      other = clip.nodes[mapping[i]].parent;
    if (other !== (parent < 0 ? -1 : mapping[parent]))
      throw Error('Animation hierarchy differs from the biped’s skeleton.');
  }
  return mapping;
}
/** Two actual Halo skin weights per vertex. Buffers/matrices are reused each frame. */
export function animationDeformer(mesh: MeshData, clip: AnimationClip) {
  const rig = mesh.rig;
  if (!rig) throw Error('This model has no verified skeleton and skin weights.');
  if (rig.indices.length !== (mesh.positions.length / 3) * 2 || rig.weights.length !== rig.indices.length)
    throw Error('Biped skin weight count is invalid.');
  const mapping = animationMapping(clip, rig),
    n = rig.nodes.length;
  if (
    !Number.isInteger(clip.frameCount) ||
    clip.frameCount < 1 ||
    clip.frameCount > 9000 ||
    clip.transforms.length !== clip.frameCount * n * 8 ||
    clip.transforms.length > 2_000_000 ||
    clip.transforms.some((v) => !Number.isFinite(v))
  )
    throw Error('Animation frame data is invalid.');
  const local = rig.nodes.map(() => new Matrix4()),
    world = rig.nodes.map(() => new Matrix4()),
    bind = rig.nodes.map(() => new Matrix4()),
    skin = rig.nodes.map(() => new Matrix4()),
    normal = rig.nodes.map(() => new Matrix3());
  const p = new Vector3(),
    q = new Quaternion(),
    q2 = new Quaternion(),
    scale = new Vector3(),
    v = new Vector3(),
    a = new Vector3(),
    b = new Vector3();
  const evaluate = (i: number, done: Set<number>, visiting: Set<number>) => {
    if (done.has(i)) return;
    if (visiting.has(i)) throw Error('Biped hierarchy contains a cycle.');
    visiting.add(i);
    const parent = rig.nodes[i].parent;
    if (parent >= n || parent < -1) throw Error('Biped parent index is invalid.');
    if (parent >= 0) {
      evaluate(parent, done, visiting);
      world[i].multiplyMatrices(world[parent], local[i]);
    } else world[i].copy(local[i]);
    visiting.delete(i);
    done.add(i);
  };
  for (let i = 0; i < n; i++) {
    const bone = rig.nodes[i];
    local[i].compose(p.fromArray(bone.position), q.fromArray(bone.rotation).normalize(), scale.setScalar(1));
  }
  let done = new Set<number>();
  for (let i = 0; i < n; i++) evaluate(i, done, new Set());
  for (let i = 0; i < n; i++) bind[i].copy(world[i]).invert();
  const positions = new Float32Array(mesh.positions.length),
    normals = new Float32Array(
      mesh.normals?.length === mesh.positions.length ? mesh.normals : mesh.positions.map(() => 0),
    );
  return {
    positions,
    normals,
    duration: Math.max(0, (clip.frameCount - 1) / clip.fps),
    sample(time: number, loop = true, rootMotion = false) {
      const length = Math.max(1, clip.frameCount - 1),
        frame = loop
          ? (Math.max(0, time) * clip.fps) % length
          : Math.min(length, Math.max(0, time) * clip.fps),
        f0 = Math.min(clip.frameCount - 1, Math.floor(frame)),
        f1 = Math.min(clip.frameCount - 1, f0 + 1),
        alpha = frame - f0;
      for (let i = 0; i < n; i++) {
        const node = mapping[i],
          at = (f0 * n + node) * 8,
          next = (f1 * n + node) * 8,
          t = clip.transforms;
        p.set(
          t[at] + (t[next] - t[at]) * alpha,
          t[at + 1] + (t[next + 1] - t[at + 1]) * alpha,
          t[at + 2] + (t[next + 2] - t[at + 2]) * alpha,
        );
        if (!rootMotion && rig.nodes[i].parent < 0)
          p.sub(v.fromArray(t, node * 8)).add(v.fromArray(rig.nodes[i].position));
        q.fromArray(t, at + 3).normalize();
        q2.fromArray(t, next + 3).normalize();
        q.slerp(q2, alpha);
        const s = t[at + 7] + (t[next + 7] - t[at + 7]) * alpha;
        local[i].compose(p, q, scale.setScalar(s));
      }
      done.clear();
      for (let i = 0; i < n; i++) evaluate(i, done, new Set());
      for (let i = 0; i < n; i++) {
        skin[i].multiplyMatrices(world[i], bind[i]);
        normal[i].getNormalMatrix(skin[i]);
      }
      for (let i = 0; i < positions.length / 3; i++) {
        const j = i * 2,
          first = rig.indices[j],
          second = rig.indices[j + 1],
          weight = rig.weights[j],
          other = rig.weights[j + 1];
        if (
          first >= n ||
          second >= n ||
          !Number.isFinite(weight + other) ||
          Math.abs(weight + other - 1) > 0.01
        )
          throw Error('Biped skin influence is invalid.');
        v.fromArray(mesh.positions, i * 3);
        a.copy(v).applyMatrix4(skin[first]).multiplyScalar(weight);
        b.copy(v).applyMatrix4(skin[second]).multiplyScalar(other);
        a.add(b).toArray(positions, i * 3);
        if (mesh.normals?.length === mesh.positions.length) {
          v.fromArray(mesh.normals, i * 3);
          a.copy(v).applyMatrix3(normal[first]).multiplyScalar(weight);
          b.copy(v).applyMatrix3(normal[second]).multiplyScalar(other);
          a.add(b)
            .normalize()
            .toArray(normals, i * 3);
        }
      }
      return this;
    },
  };
}
