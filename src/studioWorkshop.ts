import type { QuickForgeDocument } from './forge';
import { sameJson } from './semanticJson';
type Workshop = NonNullable<QuickForgeDocument['workshop']>;
type Brush = Workshop['brushes'][number];
const same = sameJson;

export function mergeWorkshop(
  base: Workshop | null | undefined,
  next: Workshop | null | undefined,
  current: Workshop | null | undefined,
  force = false,
): Workshop | null | undefined {
  const field = <T>(b: T, n: T, c: T, path: string): T => {
    if (same(b, n)) return structuredClone(c);
    if (!force && !same(c, b) && !same(c, n)) throw Error(`Concurrent Workshop conflict: ${path}`);
    return structuredClone(n);
  };
  if (same(base, next)) return structuredClone(current);
  if (!base || !next || !current) return field(base, next, current, 'workshop/schema');
  const shape = (b: Brush) => ({ role: b.role, vertices: b.vertices, faces: b.faces });
  const rows = <T extends { id: string }>(
    before: T[],
    after: T[],
    now: T[],
    merge: (b: T, n: T, c: T) => T,
    target: string,
  ) => {
    const out = structuredClone(now);
    for (const id of [...new Set([...before, ...after].map((v) => v.id))].sort()) {
      const b = before.find((v) => v.id === id),
        n = after.find((v) => v.id === id),
        i = out.findIndex((v) => v.id === id);
      if (same(b, n)) continue;
      if (b && n && i >= 0) out[i] = merge(b, n, out[i]);
      else if (!b && n && i < 0) out.push(structuredClone(n));
      else if (!b && n && i >= 0 && (force || same(out[i], n))) out[i] = structuredClone(n);
      else if (b && !n && i < 0) continue;
      else if (b && !n && i >= 0 && (force || same(out[i], b))) out.splice(i, 1);
      else if (force && n && i < 0) out.push(structuredClone(n));
      else throw Error(`Concurrent Workshop edit/delete conflict: ${target}/${id}`);
    }
    return out;
  };
  return {
    schemaVersion: field(base.schemaVersion, next.schemaVersion, current.schemaVersion, 'workshop/schema'),
    brushes: rows(
      base.brushes,
      next.brushes,
      current.brushes,
      (b, n, c) => {
        const out = structuredClone(c),
          path = `workshop/brushes/${b.id}`;
        Object.assign(out, field(shape(b), shape(n), shape(c), `${path}/structure`));
        out.name = field(b.name, n.name, c.name, `${path}/name`);
        for (const key of ['position', 'rotation', 'scale'] as const)
          out[key] = [0, 1, 2].map((axis) =>
            field(b[key][axis], n[key][axis], c[key][axis], `${path}/${key}/${axis}`),
          ) as [number, number, number];
        return out;
      },
      'workshop/brushes',
    ),
    portals: rows(
      base.portals,
      next.portals,
      current.portals,
      (b, n, c) => field(b, n, c, `workshop/portals/${b.id}`),
      'workshop/portals',
    ),
  };
}
