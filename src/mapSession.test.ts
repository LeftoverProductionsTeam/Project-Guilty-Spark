import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const prefix = 'guilty-spark-map-session-v1:';
let data: Map<string, string>, blocked: boolean;
beforeEach(() => {
  vi.resetModules();
  data = new Map();
  blocked = false;
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw Error('quota');
      data.set(key, value);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
test('a warm window merges a peer preference before saving a different key', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world', layout: { width: 300 } }));
  const session = await import('./mapSession');
  const layout = session.readMapSession('a', 'layout', null);
  data.set(
    prefix + 'a',
    JSON.stringify({ workspace: 'world', layout: { width: 300 }, 'director.recordingFolder': 'D:/takes' }),
  );
  session.writeMapSession('a', 'director.docked', true);
  expect(JSON.parse(data.get(prefix + 'a')!)).toMatchObject({
    'director.recordingFolder': 'D:/takes',
    'director.docked': true,
  });
  expect(session.readMapSession('a', 'layout', null)).toBe(layout);
});
test('a storage event refreshes just that map without replacing unchanged objects', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world', layout: { width: 300 } }));
  data.set(prefix + 'b', JSON.stringify({ workspace: 'tags' }));
  const session = await import('./mapSession');
  const layout = session.readMapSession('a', 'layout', null);
  expect(session.readMapSession('b', 'workspace', '')).toBe('tags');
  data.set(
    prefix + 'a',
    JSON.stringify({ workspace: 'world', layout: { width: 300 }, 'director.recordingFolder': 'D:/takes' }),
  );
  window.dispatchEvent(
    Object.assign(new Event('storage'), { key: prefix + 'a', newValue: data.get(prefix + 'a') }),
  );
  expect(session.readMapSession('a', 'director.recordingFolder', '')).toBe('D:/takes');
  expect(session.readMapSession('a', 'layout', null)).toBe(layout);
  expect(session.readMapSession('b', 'workspace', '')).toBe('tags');
});
test('an explicit write compares with the latest peer value, not its stale cache', async () => {
  data.set(prefix + 'a', JSON.stringify({ mode: 'old' }));
  const session = await import('./mapSession');
  expect(session.readMapSession('a', 'mode', '')).toBe('old');
  data.set(prefix + 'a', JSON.stringify({ mode: 'peer' }));
  session.writeMapSession('a', 'mode', 'old');
  expect(JSON.parse(data.get(prefix + 'a')!).mode).toBe('old');
});
test('quota failure retains in-memory preferences and a later save persists them together', async () => {
  data.set(prefix + 'a', JSON.stringify({ workspace: 'world' }));
  const session = await import('./mapSession');
  blocked = true;
  session.writeMapSession('a', 'workspace', 'machinima');
  session.writeMapSession('a', 'director.recordingFolder', 'D:/takes');
  expect(session.readMapSession('a', 'workspace', '')).toBe('machinima');
  blocked = false;
  session.writeMapSession('a', 'director.docked', true);
  expect(JSON.parse(data.get(prefix + 'a')!)).toMatchObject({
    workspace: 'machinima',
    'director.recordingFolder': 'D:/takes',
    'director.docked': true,
  });
});
