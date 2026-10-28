import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createVisualPipeline } from '../visualPipeline';
import { renderFeatures } from '../renderFeatures';
import type { RenderFeatures } from '../renderFeatures';
export default function SceneEffects({ settings }: { settings?: RenderFeatures | null }) {
  const profile = renderFeatures(settings),
    { gl, scene, camera, size, viewport } = useThree();
  const pipeline = useMemo(
    () => (profile.enabled ? createVisualPipeline(gl, scene, camera, profile.bloom, false) : null),
    [gl, scene, camera, profile.enabled, profile.bloom],
  );
  useEffect(() => () => pipeline?.dispose(), [pipeline]);
  useEffect(() => {
    pipeline?.resize(size.width, size.height, viewport.dpr, profile.quality);
  }, [pipeline, size.width, size.height, viewport.dpr, profile.quality]);
  useEffect(
    () => () => {
      delete scene.userData.gsRenderFeatures;
      delete scene.userData.gsLinearOutput;
      delete gl.domElement.dataset.gsRenderFeatures;
    },
    [scene, gl],
  );
  useFrame(() => {
    scene.userData.gsRenderFeatures = profile;
    scene.userData.gsLinearOutput = !!pipeline;
    gl.domElement.dataset.gsRenderFeatures = JSON.stringify(profile);
    if (pipeline) {
      pipeline.update(profile);
      pipeline.composer.render();
    } else gl.render(scene, camera);
  }, 1);
  return null;
}
