import { buildIncidentSurfaceTree } from './haloLightmap';

self.addEventListener('message', (event: MessageEvent<{ positions: Float64Array; indices: Float64Array }>) => {
  const { positions, indices } = event.data;
  self.postMessage(buildIncidentSurfaceTree(positions, indices));
});
