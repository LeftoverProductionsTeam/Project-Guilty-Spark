import { useEffect, useRef } from 'react';
import { Box3, Matrix4 } from 'three';
import { call } from './api';
import { isEditingText } from './editorFlight';
import { collisionBounds, floorSnapDelta } from './floorSnap';
import type { CollisionMesh, FloorSurface } from './floorSnap';
export interface DropBody {
  id: string;
  name: string;
  matrix: Matrix4;
  preview?: CollisionMesh;
  collision?: CollisionMesh;
  source?: { projectId: string; sourceSha256: string; tagId: number };
  imported?: {
    projectId: string;
    assetId: string;
    sourceSha256: string;
    scale: [number, number, number];
    rotation: [number, number, number];
  };
}
const cache = new Map<string, Promise<CollisionMesh | null>>();
async function collider(body: DropBody) {
  if (body.collision) return body.collision;
  // Editable OBJ bytes can change outside Spark; recheck them on every action.
  if (body.imported) return call<CollisionMesh>('preview_imported_collision', body.imported);
  if (!body.source) return null;
  const key = `${body.source.projectId}:${body.source.sourceSha256}:${body.source.tagId}`;
  let request = cache.get(key);
  if (!request) {
    if (cache.size >= 96) cache.delete(cache.keys().next().value!);
    request = call<CollisionMesh | null>('preview_owned_object_collision', body.source);
    cache.set(key, request);
    request.catch(() => cache.delete(key));
  }
  return request;
}
export default function useEndToFloor(config: {
  enabled: boolean;
  revision: string;
  selected: DropBody[];
  others: DropBody[];
  terrain?: CollisionMesh | null;
  onDrop: (delta: number) => void;
  onError: (message: string) => void;
}) {
  const latest = useRef(config),
    busy = useRef(false);
  latest.current = config;
  useEffect(() => {
    let active = true;
    const key = (event: KeyboardEvent) => {
      const c = latest.current;
      if (
        event.key !== 'End' ||
        event.repeat ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        isEditingText(event.target) ||
        document.querySelector('[role="dialog"]') ||
        !c.enabled ||
        !c.selected.length ||
        busy.current
      )
        return;
      event.preventDefault();
      busy.current = true;
      void (async () => {
        const selected = await Promise.all(
          c.selected.map(async (body) =>
            collisionBounds((await collider(body)) ?? body.preview, body.matrix),
          ),
        );
        const footprint = selected.reduce((box, b) => box.union(b), new Box3());
        const nearby = c.others.filter((body) => {
          const bounds = collisionBounds(body.preview ?? body.collision, body.matrix);
          return (
            bounds.min.x <= footprint.max.x &&
            bounds.max.x >= footprint.min.x &&
            bounds.min.y <= footprint.max.y &&
            bounds.max.y >= footprint.min.y &&
            bounds.min.z <= footprint.max.z
          );
        });
        if (nearby.length > 24)
          throw Error('Too many overlapping collision objects. Narrow the selection before snapping.');
        const surfaces: FloorSurface[] = c.terrain ? [{ mesh: c.terrain, matrix: new Matrix4() }] : [];
        for (const body of nearby) {
          const mesh = await collider(body);
          if (mesh) surfaces.push({ mesh, matrix: body.matrix });
        }
        if (!active) return;
        if (
          !latest.current.enabled ||
          latest.current.revision !== c.revision ||
          latest.current.selected.map((x) => x.id).join() !== c.selected.map((x) => x.id).join()
        )
          throw Error('Selection changed while collision loaded. Press End again.');
        const delta = floorSnapDelta(selected, surfaces);
        if (delta === null) throw Error('No supporting collision surface was found below the selection.');
        if (Math.abs(delta) > 0.0002) c.onDrop(delta);
      })()
        .catch((error) => {
          if (active) c.onError(`Floor snap: ${String(error)}`);
        })
        .finally(() => {
          busy.current = false;
        });
    };
    window.addEventListener('keydown', key);
    return () => {
      active = false;
      window.removeEventListener('keydown', key);
    };
  }, []);
}
