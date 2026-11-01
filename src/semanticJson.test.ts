import { it, expect } from 'vitest';
import { sameJson } from './semanticJson';
it('ignores JSON field order while retaining value and ordered-array conflicts', () => {
  expect(
    sameJson(
      { id: 'door', points: [[1, 2, 3]], materialId: 'portal' },
      { materialId: 'portal', points: [[1, 2, 3]], id: 'door' },
    ),
  ).toBe(true);
  expect(sameJson({ optional: undefined, id: 'door' }, { id: 'door' })).toBe(true);
  expect(sameJson([1, 2], [2, 1])).toBe(false);
  expect(sameJson({ x: 1 }, { x: 2 })).toBe(false);
  expect(sameJson(null, undefined)).toBe(false);
});
