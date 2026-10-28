import { Euler, Matrix4, Vector3 } from 'three';
import type { Project, MapInspection, SceneObject, Vec3 } from './types';
import type { LiveStatus } from './components/LiveObjectInspector';
export function matchesLiveMap(
  project: Project | null,
  inspection: MapInspection | null,
  status: LiveStatus | null,
): boolean {
  const normalize = (p: string) => p.replaceAll('\\', '/').toLowerCase();
  if (!(
    project?.source &&
    inspection &&
    status &&
    inspection.sha256 === project.source.sha256 &&
    inspection.tagChecksum === status.snapshot.identity.checksum &&
    inspection.tags.length === status.snapshot.identity.tagCount &&
    normalize(inspection.scenarioPath) === normalize(status.snapshot.identity.scenario)
  ))
    return false;
  const tags = new Map(inspection.tags.map((t) => [t.id, t]));
  return status.snapshot.objects.every((o) => {
    const tag = tags.get(o.tagDatum);
    return !!tag && normalize(tag.path) === normalize(o.tagPath);
  });
}
export function runtimeScene(status: LiveStatus): SceneObject[] {
  return status.snapshot.objects
    .filter((o) => o.parentDatum === 4294967295)
    .map((o) => {
      const forward = new Vector3(...o.forward).normalize(),
        up = new Vector3(...o.up);
      up.addScaledVector(forward, -up.dot(forward)).normalize();
      const left = new Vector3().crossVectors(up, forward).normalize(),
        rotation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(forward, left, up), 'ZYX');
      return {
        id: 'live:' + o.datum,
        name: o.tagPath.split('/').at(-1) + ' · #' + o.datum.toString(16),
        kind: (
          { 0: 'Biped', 1: 'Vehicle', 2: 'Weapon', 3: 'Equipment', 6: 'Scenery' } as Record<number, string>
        )[o.kind],
        tagId: o.tagDatum,
        assetId: null,
        position: [...o.position] as Vec3,
        rotation: [rotation.z, rotation.y, rotation.x] as Vec3,
        scale: [o.scale, o.scale, o.scale] as Vec3,
        visible: true,
        sourceOffset: null,
        rotationOffset: null,
      };
    });
}
