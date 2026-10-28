import { describe, it, expect } from 'vitest';
import { queueTagDuplicate } from './tagDuplicates';
import type { MapInspection, Project, Tag } from './types';
import { historyReducer, initialHistory } from './editor';
describe('tag duplication rebuild requests', () => {
  const source = { id: 1, path: 'weapons/pistol/pistol', class: 'weap' } as Tag,
    owner = { id: 2, path: 'levels/a10/a10', class: 'scnr' } as Tag,
    inspection = { tags: [source, owner] } as MapInspection,
    project = { id: 'map-a', history: [], tagEdits: [], source: {} } as unknown as Project;
  it('queues a separate native tag and supports ordinary undo without altering its source', () => {
    const next = queueTagDuplicate(project, inspection, source, owner.id, 'spark/pistol_copy');
    expect(project.tagDuplicates).toBeUndefined();
    expect(source.path).toBe('weapons/pistol/pistol');
    expect(next.tagDuplicates?.[0]).toMatchObject({
      sourceTagId: 1,
      ownerTagId: 2,
      path: 'spark/pistol_copy',
    });
    let history = historyReducer(initialHistory, { type: 'load', project });
    history = historyReducer(history, { type: 'edit', project: next, description: 'Duplicate pistol' });
    history = historyReducer(history, { type: 'undo' });
    expect(history.current?.tagDuplicates).toBeUndefined();
    history = historyReducer(history, { type: 'redo' });
    expect(history.current?.tagDuplicates).toHaveLength(1);
    expect(() => queueTagDuplicate(next, inspection, source, owner.id, 'another/copy')).toThrow(/already/);
  });
  it('refuses path traversal, a source alias and special engine roots', () => {
    for (const path of [
      '../pistol',
      '/pistol',
      'C:/pistol',
      'weapons//pistol',
      'bad*path',
      'weapons/pistol/pistol',
    ])
      expect(() => queueTagDuplicate(project, inspection, source, owner.id, path)).toThrow();
    expect(() => queueTagDuplicate(project, inspection, source, source.id, 'spark/copy')).toThrow(
      /another tag/,
    );
    expect(() => queueTagDuplicate(project, inspection, owner, source.id, 'spark/scenario')).toThrow(
      /dedicated/,
    );
  });
});
