import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createVisualPipeline } from '../visualPipeline';
import { renderFeatures } from '../renderFeatures';
import type { RenderFeatures } from '../renderFeatures';
export default function SceneEffects({
  settings,
  transparentBackground = false,
  materialRevision,
}: {
  settings?: RenderFeatures | null;
  transparentBackground?: boolean;
  materialRevision?: object;
}) {
  const profile = renderFeatures(settings),
    { gl, scene, camera, size, viewport, invalidate } = useThree();
  const pipeline = useMemo(
    () =>
      profile.enabled
        ? createVisualPipeline(gl, scene, camera, profile.bloom, false, transparentBackground)
        : null,
    [gl, scene, camera, profile.enabled, profile.bloom, transparentBackground],
  );
  useEffect(() => () => pipeline?.dispose(), [pipeline]);
  useEffect(() => {
    pipeline?.resize(size.width, size.height, viewport.dpr, profile.quality);
  }, [pipeline, size.width, size.height, viewport.dpr, profile.quality]);
  const signature=JSON.stringify(profile);
  useLayoutEffect(()=>{
    scene.userData.gsRenderFeatures=profile;
    scene.userData.gsLinearOutput=!!pipeline;
    gl.domElement.dataset.gsRenderFeatures=signature;
    pipeline?.update(profile);
  },[scene,gl,pipeline,signature]);
  useEffect(
    () => () => {
      delete scene.userData.gsRenderFeatures;
      delete scene.userData.gsLinearOutput;
      delete gl.domElement.dataset.gsRenderFeatures;
    },
    [scene, gl],
  );
  const preparation = useRef<{ revision: object; frameReady: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => () => {
    clearTimeout(timer.current);
    preparation.current = null;
  }, [gl, camera, pipeline, materialRevision]);
  useFrame(() => {
    if (materialRevision && !pipeline && !gl.xr.isPresenting && !gl.getContext().isContextLost() &&
      gl.extensions.has('KHR_parallel_shader_compile')) {
      if (preparation.current?.revision !== materialRevision) {
        const batch = { revision: materialRevision, frameReady: false };
        preparation.current = batch;
        const ready = () => {
          if (preparation.current !== batch || batch.frameReady) return;
          clearTimeout(timer.current);
          batch.frameReady = true;
          invalidate();
        };
        try {
          // Keep the previous framebuffer until the driver has linked this
          // material revision. Rendering sooner forces shader-log readback.
          timer.current = setTimeout(ready, 2500);
          void gl.compileAsync(scene, camera).then(ready, ready);
        } catch {
          ready();
        }
      }
      if (!preparation.current?.frameReady) return;
    }
    if (pipeline) {
      pipeline.composer.render();
    } else gl.render(scene, camera);
  }, 1);
  return null;
}
