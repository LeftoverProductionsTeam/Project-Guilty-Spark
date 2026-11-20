import { useEffect, useState } from 'react';
import type { CollisionNode } from './collisionSpatial';
import {
  hasIncidentSurfaceIndex,
  installIncidentSurfaceTree,
  shouldDeferIncidentSurface,
} from './haloLightmap';
import type { MeshData } from './types';

const synchronousFallback = new WeakSet<MeshData>();

function needsWorker(mesh: MeshData) {
  return typeof Worker !== 'undefined' && !hasIncidentSurfaceIndex(mesh)
    && !synchronousFallback.has(mesh) && shouldDeferIncidentSurface(mesh);
}

export function prepareIncidentSurfaceIndex(mesh: MeshData, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted || !needsWorker(mesh)) return Promise.resolve();

  return new Promise(resolve => {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (tree?: CollisionNode | null) => {
      if (finished) return;
      finished = true;
      worker?.terminate();
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      if (!signal?.aborted) {
        if (tree === undefined) synchronousFallback.add(mesh);
        else installIncidentSurfaceTree(mesh, tree);
      }
      resolve();
    };
    const cancel = () => finish();

    try {
      worker = new Worker(new URL('./incidentSurface.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<CollisionNode | null>) => finish(event.data);
      worker.onerror = event => { event.preventDefault(); finish(); };
      worker.onmessageerror = () => finish();
      signal?.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(cancel, 20_000);
      // Transfer exact numeric copies. The renderer retains its immutable
      // source buffers and no texture, model, or bitmap data crosses.
      const positions = new Float64Array(mesh.positions);
      const indices = new Float64Array(mesh.indices);
      worker.postMessage({ positions, indices }, [positions.buffer, indices.buffer]);
    } catch {
      finish();
    }
  });
}

/** Small maps and unavailable workers use the same synchronous sampler. */
export function useIncidentSurfaceIndex(mesh: MeshData | null | undefined) {
  const [, refresh] = useState(0);
  const waiting = !!mesh && needsWorker(mesh);
  useEffect(() => {
    if (!mesh || !waiting) return;
    const controller = new AbortController();
    void prepareIncidentSurfaceIndex(mesh, controller.signal).then(() => {
      if (!controller.signal.aborted) refresh(version => version + 1);
    });
    return () => controller.abort();
  }, [mesh, waiting]);
  return waiting;
}
