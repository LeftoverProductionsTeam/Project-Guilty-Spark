import { describe, expect, it } from 'vitest';
import { compareProjects, tagIdentity } from './compare';
import type { OpenProject, Tag } from './types';

function source(): OpenProject {
  return {
    project: {
      schemaVersion: 1,
      id: 'fixture',
      title: 'Synthetic comparison fixture',
      createdAt: '',
      modifiedAt: '',
      source: null,
      provenance: {
        creator: '',
        community: '',
        releaseYear: null,
        description: '',
        sourceUrl: '',
        permissions: '',
      },
      scene: [],
      assets: [],
      tagEdits: [],
      history: [],
      builds: [],
    },
    inspection: {
      header: {
        version: 7,
        engine: 'Synthetic',
        name: 'test',
        build: '',
        scenarioType: 1,
        fileSize: 2048,
        declaredSize: 2048,
        tagOffset: 100,
        tagSize: 100,
        crc32: 0,
        flags: 0,
        demoLayout: false,
        compressed: false,
        extended: false,
        legacyTagSizeRepair: false,
      },
      sha256: 'fixture',
      tags: [],
      objects: [],
      mesh: {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
        label: 'Synthetic',
        source: 'unit-test',
      },
      encounters: [],
      scripts: [],
      resources: [],
      diagnostics: [],
      scenarioPath: 'levels/test',
    },
  };
}
function tag(id: number, path = 'weapons/test', cls = 'weap'): Tag {
  return {
    id,
    index: id,
    class: cls,
    path,
    external: false,
    dataOffset: 100 + id,
    fields: [],
    references: [],
  };
}
function weapon(id: number, projectile: number): Tag {
  return {
    ...tag(id),
    fields: [
      {
        key: 'velocity',
        label: 'Velocity',
        kind: 'f32',
        offset: 12,
        value: 10,
        min: 0,
        max: 100,
        unit: '',
        targetClass: null,
      },
      {
        key: 'projectile',
        label: 'Projectile',
        kind: 'reference',
        offset: 16,
        value: projectile,
        min: 0,
        max: 0xffffffff,
        unit: '',
        targetClass: 'proj',
      },
    ],
    references: [{ label: 'Projectile', targetId: projectile, class: 'proj', offset: 16 }],
  };
}
describe('semantic variant comparison', () => {
  it('ignores datum renumbering, cache offsets, tag order and path separators', () => {
    const before = source(),
      after = source();
    before.inspection!.tags = [weapon(1, 2), tag(2, 'weapons/round', 'proj')];
    after.inspection!.tags = [
      { ...tag(420, 'WEAPONS\\ROUND', 'proj'), index: 9 },
      { ...weapon(100, 420), path: 'weapons\\test', dataOffset: 1900 },
    ];
    expect(compareProjects(before, after).rows).toEqual([]);
    expect(compareProjects(before, after).matchedTags).toBe(2);
  });
  it('reports numerical and dependency changes as separate decoded values', () => {
    const before = source(),
      after = source();
    before.inspection!.tags = [
      weapon(1, 2),
      tag(2, 'weapons/round', 'proj'),
      tag(3, 'weapons/rocket', 'proj'),
    ];
    after.inspection!.tags = structuredClone(before.inspection!.tags);
    after.inspection!.tags[0].fields[0].value = 20;
    after.inspection!.tags[0].fields[1].value = 3;
    after.inspection!.tags[0].references[0].targetId = 3;
    const rows = compareProjects(before, after).rows;
    expect(rows.find((row) => row.property === 'Velocity')).toMatchObject({
      before: '10',
      after: '20',
      status: 'changed',
    });
    expect(rows.find((row) => row.property === 'Projectile')).toMatchObject({
      before: 'proj:weapons/round',
      after: 'proj:weapons/rocket',
    });
  });
  it('excludes project overlays unless saved overlay comparison is selected', () => {
    const before = source();
    before.inspection!.tags = [weapon(1, 2), tag(2, 'weapons/round', 'proj')];
    const after = structuredClone(before);
    after.project.tagEdits = [{ tagId: 1, fieldKey: 'velocity', value: 99 }];
    expect(compareProjects(before, after).rows).toEqual([]);
    expect(compareProjects(before, after, true).rows).toEqual([
      expect.objectContaining({ property: 'Velocity', after: '99' }),
    ]);
  });
  it('does not invent correspondence for duplicate class/path identities', () => {
    const before = source(),
      after = source();
    before.inspection!.tags = [tag(1), tag(2)];
    after.inspection!.tags = [tag(3)];
    expect(compareProjects(before, after).rows).toEqual([
      expect.objectContaining({ status: 'unknown', property: 'Ambiguous tag identity' }),
    ]);
  });
  it('detects geometry coordinates changed with identical vertex and triangle counts', () => {
    const before = source(),
      after = source();
    after.inspection!.mesh.positions[0] = 12;
    expect(compareProjects(before, after).rows).toEqual([
      expect.objectContaining({ category: 'Collision geometry', status: 'changed' }),
    ]);
  });
  it('classifies unresolved references as unknown even if datum numbers match', () => {
    const before = source();
    before.inspection!.tags = [weapon(1, 999)];
    const result = compareProjects(before, structuredClone(before));
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.status === 'unknown')).toBe(true);
  });
  it('does not report source contents removed when an inspection is unavailable', () => {
    const before = source();
    before.inspection!.tags = [tag(1)];
    const after = source();
    after.inspection = null;
    expect(compareProjects(before, after).rows).toEqual([
      expect.objectContaining({ status: 'unknown', property: 'Coverage' }),
    ]);
  });
  it('does not claim payload equality for tags with no decoded schema', () => {
    const before = source();
    before.inspection!.tags = [tag(1, 'ui/title', 'bitm')];
    const result = compareProjects(before, structuredClone(before));
    expect(result.unchangedAuditedTags).toBe(0);
    expect(result.coverage.find((row) => row.area.includes('Bitmap'))?.status).toBe('unknown');
  });
  it('preserves the distinct empty basename found in legacy source paths', () => {
    expect(tagIdentity(tag(1, 'weapons/test/'))).not.toBe(tagIdentity(tag(2, 'weapons/test')));
  });
});
