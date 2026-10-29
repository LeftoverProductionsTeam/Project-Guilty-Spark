import type { BspAssembly } from './bspAssembly';
import { assemblySignature } from './bspAssembly';
import type { Project, Vec3 } from './types';
export type VisibilityZone =
  | { kind: 'tunnel'; id: string; name: string; segment: number; start: number; end: number }
  | { kind: 'editorBounds'; id: string; name: string; min: Vec3; max: Vec3 };
export function validateVisibilityZones(plan: BspAssembly): string[] {
  const errors: string[] = [],
    ids = new Set<string>(),
    segments = new Set<number>();
  const zones = plan.visibilityZones ?? [];
  if (
    !Number.isFinite(plan.tunnelWidth) ||
    !Number.isFinite(plan.tunnelHeight) ||
    plan.tunnelWidth < 0.8 ||
    plan.tunnelWidth > 16 ||
    plan.tunnelHeight < 1 ||
    plan.tunnelHeight > 16
  )
    errors.push('Tunnel dimensions are outside the supported bounds.');
  if (zones.length > 32) errors.push('Use at most 32 visibility zones per connection.');
  for (const z of zones) {
    if (
      !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(z.id) ||
      ids.has(z.id) ||
      !z.name.trim() ||
      Array.from(z.name).length > 80 ||
      /\p{Cc}/u.test(z.name)
    )
      errors.push('Zones need unique IDs and names of 1–80 characters.');
    ids.add(z.id);
    if (z.kind === 'tunnel') {
      const a = plan.tunnelPoints[z.segment],
        b = plan.tunnelPoints[z.segment + 1];
      if (!Number.isInteger(z.segment) || !a || !b)
        errors.push(`${z.name}: choose an existing tunnel segment.`);
      else if (
        [...a, ...b].some((v) => !Number.isFinite(v) || Math.abs(v) > 2048) ||
        !Number.isFinite(z.start) ||
        !Number.isFinite(z.end) ||
        z.start < 0.05 ||
        z.end > 0.95 ||
        z.start >= z.end ||
        (z.end - z.start) * Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5 - 1e-8
      )
        errors.push(`${z.name}: use ordered cuts from 5% to 95%, at least 0.5 world units apart.`);
      if (segments.has(z.segment)) errors.push('Use one portal zone per tunnel segment.');
      segments.add(z.segment);
    } else if (
      [0, 1, 2].some(
        (i) =>
          !Number.isFinite(z.min[i]) ||
          !Number.isFinite(z.max[i]) ||
          Math.abs(z.min[i]) > 2048 ||
          Math.abs(z.max[i]) > 2048 ||
          z.max[i] - z.min[i] < 0.1,
      )
    )
      errors.push(`${z.name}: bounds must be ordered, finite and within ±2048.`);
  }
  return errors;
}
export function portalQuads(plan: BspAssembly, zone: VisibilityZone): Vec3[][] {
  if (zone.kind !== 'tunnel' || validateVisibilityZones({ ...plan, visibilityZones: [zone] }).length)
    return [];
  const a = plan.tunnelPoints[zone.segment],
    b = plan.tunnelPoints[zone.segment + 1],
    dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  const side: Vec3 = [
    (-dy / length) * (plan.tunnelWidth / 2 + 0.01),
    (dx / length) * (plan.tunnelWidth / 2 + 0.01),
    0,
  ];
  return [zone.start, zone.end].map((t) => {
    const center = a.map((v, i) => v + (b[i] - v) * t) as Vec3;
    const left = center.map((v, i) => v - side[i]) as Vec3,
      right = center.map((v, i) => v + side[i]) as Vec3;
    return [
      [left[0], left[1], left[2] - 0.01],
      [right[0], right[1], right[2] - 0.01],
      [right[0], right[1], right[2] + plan.tunnelHeight + 0.01],
      [left[0], left[1], left[2] + plan.tunnelHeight + 0.01],
    ] as Vec3[];
  });
}
export function visibilityBounds(plan: BspAssembly, zone: VisibilityZone): { min: Vec3; max: Vec3 } | null {
  if (validateVisibilityZones({ ...plan, visibilityZones: [zone] }).length) return null;
  if (zone.kind === 'editorBounds') return { min: zone.min, max: zone.max };
  const points = portalQuads(plan, zone).flat();
  if (!points.length) return null;
  return {
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
  };
}
export function movePortalCut(
  plan: BspAssembly,
  zone: Extract<VisibilityZone, { kind: 'tunnel' }>,
  cut: 'start' | 'end',
  point: Vec3,
): VisibilityZone {
  const a = plan.tunnelPoints[zone.segment],
    b = plan.tunnelPoints[zone.segment + 1];
  if (!a || !b) return zone;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.5) return zone;
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length);
  const separation = 0.5 / length;
  return {
    ...zone,
    [cut]:
      cut === 'start'
        ? Math.max(0.05, Math.min(zone.end - separation, t))
        : Math.min(0.95, Math.max(zone.start + separation, t)),
  };
}
export function mergeZoneOnlyUpdate(
  previous: BspAssembly | null,
  next: BspAssembly | null,
  draft: BspAssembly | null,
): BspAssembly | null {
  if (
    previous &&
    next &&
    draft &&
    assemblySignature({ ...previous, visibilityZones: undefined }) ===
      assemblySignature({ ...next, visibilityZones: undefined })
  )
    return { ...draft, visibilityZones: next.visibilityZones };
  return next;
}
export function withVisibilityZones(project: Project, zones: VisibilityZone[]): Project {
  if (!project.bspAssembly) return project;
  const { visibilityZones: _old, ...plan } = project.bspAssembly;
  return { ...project, bspAssembly: { ...plan, ...(zones.length ? { visibilityZones: zones } : {}) } };
}
