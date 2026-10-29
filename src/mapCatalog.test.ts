import { expect, test } from 'vitest';
import { MAP_CATALOG, filterMapCatalog } from './mapCatalog';
test('catalog filters separate source editions from an author-supplied MCC release', () => {
  expect(filterMapCatalog('', 'mcc', 'all').map((map) => map.id)).toEqual(['backrooms']);
  expect(filterMapCatalog('', 'halo-md', 'zombies').map((map) => map.id)).toEqual(['zombie-halomd-1']);
  expect(filterMapCatalog('Conscars', 'all', 'multiplayer').map((map) => map.id)).toEqual(['alpine-1']);
  expect(filterMapCatalog('', 'halo-pc', 'all')).toEqual([]);
});
test('catalog preserves publisher attribution and only offers direct imports for HTTPS map packages', () => {
  expect(new Set(MAP_CATALOG.map((map) => map.id)).size).toBe(MAP_CATALOG.length);
  for (const map of MAP_CATALOG) {
    expect(map.author.length).toBeGreaterThan(3);
    expect(new URL(map.source).protocol).toBe('https:');
    if (map.directDownload) {
      const url = new URL(map.directDownload);
      expect(url.protocol).toBe('https:');
      expect(url.pathname).toMatch(/\.(map|zip)$/);
    }
    expect(map.dependencies.length).toBeGreaterThan(30);
    expect(map.permissions.length).toBeGreaterThan(30);
  }
});
