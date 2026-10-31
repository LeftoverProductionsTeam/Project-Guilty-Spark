import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Mesh as ThreeMesh, BufferAttribute } from 'three';
import { animationDeformer } from '../animation';
import type { AnimationPreview } from '../animation';
import type { OwnedModelView } from '../useOwnedForgeModels';
import Mesh from './HaloMesh';
export default function AnimatedBiped({
  model,
  animation,
  onError,
}: {
  model: OwnedModelView;
  animation?: AnimationPreview | null;
  onError: (message: string) => void;
}) {
  const group = useRef<Group>(null),
    elapsed = useRef(0),
    seek = useRef(-1),
    failed = useRef(false);
  const { gl } = useThree();
  const prepared = useMemo(() => {
    if (!animation) return null;
    try {
      return { player: animationDeformer(model.mesh, animation.clip), error: '' };
    } catch (e) {
      return { player: null, error: String(e) };
    }
  }, [model.mesh, animation?.clip]);
  useEffect(() => {
    failed.current = false;
    seek.current = -1;
    group.current?.traverse(o=>{if(o instanceof ThreeMesh){const p=o.geometry.getAttribute('position') as BufferAttribute,n=o.geometry.getAttribute('normal') as BufferAttribute;if(p.array.length===model.mesh.positions.length){p.array.set(model.mesh.positions);p.needsUpdate=true;if(n?.array.length===model.mesh.normals?.length){n.array.set(model.mesh.normals);n.needsUpdate=true;}}}});
    if (prepared?.error) onError(prepared.error);
  }, [prepared]);
  useFrame((_, delta) => {
    if (!animation || !prepared?.player || !group.current || failed.current) return;
    try {
      if (seek.current !== animation.seek) {
        elapsed.current = animation.time;
        seek.current = animation.seek;
      } else if (animation.playing) elapsed.current += Math.min(delta, 0.1) * animation.speed;
      const frame = prepared.player.sample(elapsed.current, animation.loop, animation.rootMotion);
      group.current.traverse((o) => {
        if (o instanceof ThreeMesh) {
          const p = o.geometry.getAttribute('position') as BufferAttribute,
            n = o.geometry.getAttribute('normal') as BufferAttribute;
          if (p.array.length === frame.positions.length) {
            p.array.set(frame.positions);
            p.needsUpdate = true;
            if (n?.array.length === frame.normals.length) {
              n.array.set(frame.normals);
              n.needsUpdate = true;
            }
            o.frustumCulled = false;
          }
        }
      });
      gl.domElement.dataset.gsAnimation = JSON.stringify({
        name: animation.clip.name,
        time: elapsed.current,
        frames: animation.clip.frameCount,
        bones: animation.clip.nodes.length,
        playing: animation.playing,
        source: 'verified-skeletal-animation',
        samplePosition: Array.from(frame.positions.subarray(0, 3)),
      });
    } catch (e) {
      failed.current = true;
      onError(String(e));
    }
  });
  useEffect(
    () => () => {
      delete gl.domElement.dataset.gsAnimation;
    },
    [gl],
  );
  return (
    <group ref={group}>
      <Mesh
        data={model.mesh}
        shaderTextures={model.shaderTextures}
        shaderMetadata={model.shaderMetadata}
        extraTextures={model.extraTextures}
      />
    </group>
  );
}
