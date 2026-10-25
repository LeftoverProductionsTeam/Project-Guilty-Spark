import { effectiveReferenceId, fieldValue } from './editor';
import type { MapInspection, OpenProject, Project, SceneObject, Tag } from './types';

export type DifferenceStatus = 'added' | 'removed' | 'changed' | 'unknown';
export interface Difference {
  id: string;
  category: string;
  status: DifferenceStatus;
  subject: string;
  property: string;
  before: string;
  after: string;
  detail?: string;
}
export interface Comparison {
  rows: Difference[];
  matchedTags: number;
  unchangedAuditedTags: number;
  coverage: { area: string; status: 'compared' | 'partial' | 'unknown'; detail: string }[];
}
export const tagIdentity = (tag: Pick<Tag, 'class' | 'path'>) =>
  `${tag.class.toLowerCase()}:${tag.path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .toLowerCase()}`;
const display = (value: unknown): string =>
  value === undefined || value === null
    ? 'Not available'
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const assetClasses = new Set([
  'bitm',
  'snd!',
  'mod2',
  'mode',
  'antr',
  'coll',
  'senv',
  'soso',
  'schi',
  'scex',
  'swat',
  'smet',
]);
const menuClasses = new Set([
  'DeLa',
  'Soul',
  'wgit',
  'wgtz',
  'hud#',
  'hudg',
  'unhi',
  'grhi',
  'wphi',
  'font',
  'ustr',
]);
function tagCategory(tag: Tag): string {
  if (['actr', 'actv', 'bipd'].includes(tag.class)) return 'AI & unit tags';
  if (menuClasses.has(tag.class)) return 'Menu & HUD tags';
  if (assetClasses.has(tag.class)) return 'Asset tags';
  if (['weap', 'proj', 'itmc'].includes(tag.class)) return 'Weapons & projectiles';
  return 'Tags';
}
function groupedTags(inspection: MapInspection | null) {
  const groups = new Map<string, Tag[]>();
  for (const tag of inspection?.tags ?? []) {
    const key = tagIdentity(tag);
    groups.set(key, [...(groups.get(key) ?? []), tag]);
  }
  return groups;
}
function referenceIdentity(id: number, tags: Map<number, Tag>): string {
  const tag = tags.get(id);
  return tag ? tagIdentity(tag) : `Unresolved datum 0x${id.toString(16).toUpperCase()}`;
}
function indexed<T>(items: T[], identity: (item: T, index: number) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  items.forEach((item, i) => {
    const key = identity(item, i);
    result.set(key, [...(result.get(key) ?? []), item]);
  });
  return result;
}

/** Compare only decoded semantics. Cache addresses and datum renumbering are not content changes. */
export function compareProjects(
  left: OpenProject,
  right: OpenProject,
  includeSavedEdits = false,
): Comparison {
  if (!left.inspection || !right.inspection)
    return {
      rows: [
        {
          id: 'inspection',
          category: 'Map identity',
          status: 'unknown',
          subject: 'Source inspection',
          property: 'Coverage',
          before: left.inspection ? 'Available' : 'Unavailable',
          after: right.inspection ? 'Available' : 'Unavailable',
          detail:
            'Both preserved source maps must be inspected before semantic differences can be established.',
        },
      ],
      matchedTags: 0,
      unchangedAuditedTags: 0,
      coverage: [
        {
          area: 'Source semantics',
          status: 'unknown',
          detail: 'One or both maps are unavailable. Missing inspection is not evidence of removed content.',
        },
      ],
    };
  const rows: Difference[] = [];
  let matchedTags = 0;
  let unchangedAuditedTags = 0;
  const add = (
    category: string,
    subject: string,
    property: string,
    before: unknown,
    after: unknown,
    status: DifferenceStatus = 'changed',
    detail?: string,
  ) => {
    if (status === 'changed' && equal(before, after) && !detail) return;
    rows.push({
      id: `${category}:${rows.length}`,
      category,
      status,
      subject,
      property,
      before: display(before),
      after: display(after),
      detail,
    });
  };
  const leftTags = new Map(left.inspection?.tags.map((tag) => [tag.id, tag]) ?? []);
  const rightTags = new Map(right.inspection?.tags.map((tag) => [tag.id, tag]) ?? []);
  const a = groupedTags(left.inspection),
    b = groupedTags(right.inspection);
  for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const before = a.get(key) ?? [],
      after = b.get(key) ?? [];
    const tag = before[0] ?? after[0];
    const category = tagCategory(tag);
    const subject = `${tag.path || '(empty path)'} [${tag.class}]`;
    if (before.length > 1 || after.length > 1) {
      add(
        category,
        subject,
        'Ambiguous tag identity',
        `${before.length} entries`,
        `${after.length} entries`,
        'unknown',
        'Multiple tags share this class/path. No arbitrary pairing was made.',
      );
      continue;
    }
    if (!before.length || !after.length) {
      add(
        category,
        subject,
        'Tag inventory',
        before.length ? key : null,
        after.length ? key : null,
        before.length ? 'removed' : 'added',
      );
      continue;
    }
    matchedTags++;
    const l = before[0],
      r = after[0],
      count = rows.length;
    add(
      category,
      subject,
      'Resource storage',
      l.external ? 'External' : 'Embedded',
      r.external ? 'External' : 'Embedded',
    );
    const lf = new Map(l.fields.map((f) => [f.key, f])),
      rf = new Map(r.fields.map((f) => [f.key, f]));
    for (const fieldKey of new Set([...lf.keys(), ...rf.keys()])) {
      const one = lf.get(fieldKey),
        two = rf.get(fieldKey);
      if (!one || !two || one.kind !== two.kind) {
        add(
          category,
          subject,
          (one ?? two)!.label,
          one ? 'Decoded' : 'Not decoded',
          two ? 'Decoded' : 'Not decoded',
          'unknown',
          'Different decoded field coverage; no value equivalence is assumed.',
        );
        continue;
      }
      let v1: number | string = includeSavedEdits ? fieldValue(left.project, l, one) : one.value;
      let v2: number | string = includeSavedEdits ? fieldValue(right.project, r, two) : two.value;
      if (one.kind === 'reference') {
        if (!leftTags.has(v1) || !rightTags.has(v2)) {
          add(
            category,
            subject,
            one.label,
            referenceIdentity(v1, leftTags),
            referenceIdentity(v2, rightTags),
            'unknown',
            'At least one reference is unresolved; datum numbers cannot establish semantic equivalence.',
          );
          continue;
        }
        v1 = referenceIdentity(v1, leftTags);
        v2 = referenceIdentity(v2, rightTags);
      }
      add(category, subject, one.label, v1, v2);
    }
    // References are keyed by their schema label/occurrence, not cache byte offsets.
    const refs = (tag: Tag, project: Project, tags: Map<number, Tag>) => {
      const occurrence = new Map<string, number>();
      return new Map(
        tag.references.map((ref) => {
          const key = `${ref.label} [${ref.class}]`;
          const index = occurrence.get(key) ?? 0;
          occurrence.set(key, index + 1);
          return [
            `${key} #${index + 1}`,
            referenceIdentity(
              includeSavedEdits ? effectiveReferenceId(project, tag, ref) : ref.targetId,
              tags,
            ),
          ];
        }),
      );
    };
    const lr = refs(l, left.project, leftTags),
      rr = refs(r, right.project, rightTags);
    for (const ref of new Set([...lr.keys(), ...rr.keys()])) {
      if (!lr.has(ref) || !rr.has(ref))
        add(
          category,
          subject,
          ref,
          lr.get(ref),
          rr.get(ref),
          'unknown',
          'Reference coverage differs. A missing decoded field is not proof of a removed dependency.',
        );
      else if (lr.get(ref)?.startsWith('Unresolved datum') || rr.get(ref)?.startsWith('Unresolved datum'))
        add(
          category,
          subject,
          ref,
          lr.get(ref),
          rr.get(ref),
          'unknown',
          'Unresolved references cannot be compared by datum number.',
        );
      else add(category, subject, ref, lr.get(ref), rr.get(ref));
    }
    if (rows.length === count && (l.fields.length || l.references.length)) unchangedAuditedTags++;
  }
  const paired = <T>(
    category: string,
    leftItems: T[],
    rightItems: T[],
    key: (item: T, index: number) => string,
    summarize: (item: T, side: 'left' | 'right') => unknown,
  ) => {
    const ls = indexed(leftItems, key),
      rs = indexed(rightItems, key);
    for (const identity of new Set([...ls.keys(), ...rs.keys()])) {
      const l = ls.get(identity) ?? [],
        r = rs.get(identity) ?? [];
      if (l.length > 1 || r.length > 1)
        add(category, identity, 'Ambiguous pairing', l.length, r.length, 'unknown');
      else if (!l.length || !r.length)
        add(
          category,
          identity,
          'Inventory',
          l.length ? summarize(l[0], 'left') : null,
          r.length ? summarize(r[0], 'right') : null,
          l.length ? 'removed' : 'added',
        );
      else add(category, identity, 'Decoded values', summarize(l[0], 'left'), summarize(r[0], 'right'));
    }
  };
  const placements = (open: OpenProject) =>
    includeSavedEdits ? open.project.scene : (open.inspection?.objects ?? []);
  paired(
    'Scenario placements',
    placements(left),
    placements(right),
    (o: SceneObject) => `${o.kind} · ${o.id}`,
    (o, side) => ({
      name: o.name,
      tag: o.tagId === null ? null : referenceIdentity(o.tagId, side === 'left' ? leftTags : rightTags),
      position: o.position,
      rotation: o.rotation,
      ...(includeSavedEdits ? { scale: o.scale, visible: o.visible } : {}),
    }),
  );
  paired(
    'Encounters',
    left.inspection?.encounters ?? [],
    right.inspection?.encounters ?? [],
    (e) => e.name.toLowerCase(),
    (e) => ({ name: e.name, team: e.team, squads: e.squads }),
  );
  paired(
    'Script index',
    left.inspection?.scripts ?? [],
    right.inspection?.scripts ?? [],
    (s) => s.name.toLowerCase(),
    (s) => s,
  );
  paired(
    'Resource dependencies',
    left.inspection?.resources ?? [],
    right.inspection?.resources ?? [],
    (r) => r.name.toLowerCase(),
    (r) => ({ required: r.required, found: r.found, reason: r.reason }),
  );
  if (includeSavedEdits)
    paired(
      'Workshop assets',
      left.project.assets,
      right.project.assets,
      (asset) => `${asset.kind}:${asset.name.toLowerCase()}`,
      (asset) => ({
        sha256: asset.sha256,
        vertices: asset.vertices,
        triangles: asset.triangles,
        hasUvs: asset.hasUvs,
        materials: asset.materials,
      }),
    );
  const lm = left.inspection?.mesh,
    rm = right.inspection?.mesh;
  if (lm?.positions.length && rm?.positions.length) {
    const sameNumbers = (x: number[], y: number[]) =>
      x.length === y.length && x.every((value, index) => value === y[index]);
    if (!sameNumbers(lm.positions, rm.positions) || !sameNumbers(lm.indices, rm.indices))
      add(
        'Collision geometry',
        'Decoded BSP mesh',
        'Vertices / triangle topology',
        `${lm.positions.length / 3} vertices; ${lm.indices.length / 3} triangles`,
        `${rm.positions.length / 3} vertices; ${rm.indices.length / 3} triangles`,
        'changed',
        'Decoded vertex coordinates and/or triangle indexes differ, even if counts match. Render geometry is not decoded.',
      );
  } else
    add(
      'Collision geometry',
      'BSP mesh',
      'Coverage',
      lm?.positions.length ? 'Decoded' : 'Not decoded',
      rm?.positions.length ? 'Decoded' : 'Not decoded',
      'unknown',
    );
  if (left.inspection && right.inspection) {
    for (const field of ['version', 'name', 'build', 'scenarioType'] as const)
      add(
        'Map identity',
        'Cache header',
        field,
        left.inspection.header[field],
        right.inspection.header[field],
      );
    add('Map identity', 'Scenario', 'Tag path', left.inspection.scenarioPath, right.inspection.scenarioPath);
  }
  return {
    rows,
    matchedTags,
    unchangedAuditedTags,
    coverage: [
      {
        area: 'Tag inventory',
        status: 'compared',
        detail:
          'Matched by class and normalized path. Datum IDs, tag order and cache addresses are excluded from content equality.',
      },
      {
        area: 'Audited fields / references',
        status: 'partial',
        detail:
          'Only fields and references decoded by the installed parser are compared. Matching values do not establish identical full tags.',
      },
      {
        area: 'Scenario placements',
        status: 'partial',
        detail:
          'Paired by kind and source slot. Insertions/reordering can shift later pairs; this is not automatic entity tracking.',
      },
      {
        area: 'Collision BSP',
        status: lm?.positions.length && rm?.positions.length ? 'compared' : 'unknown',
        detail:
          'Decoded vertex coordinates and triangle indexes are compared. Textured render surfaces and object models are not decoded.',
      },
      {
        area: 'Actor definitions / menu behavior / script bodies',
        status: 'unknown',
        detail:
          'Tag membership, indexed references, encounter metadata and script signatures are available. Full definitions, UI behavior and script instructions are not compared.',
      },
      {
        area: 'Bitmap / sound / model / animation payloads',
        status: 'unknown',
        detail:
          'Inventory and external-resource flags are compared. Unchanged tag names are not proof of identical asset data.',
      },
      {
        area: 'Resource integrity',
        status: 'partial',
        detail:
          'Presence and requirements describe the configured resource directory. Existence alone does not verify that the resources match a historical variant.',
      },
    ],
  };
}
