/** Per-map UI state, separate from authored edits and build fingerprints. */
import { useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MapInspection } from './types';
const cache = new Map<string, Record<string, unknown>>(),
  unpersisted = new Map<string, Record<string, unknown>>(),
  listeners = new Set<() => void>();
const prefix = 'guilty-spark-map-session-v1:';
function stored(id: string): Record<string, unknown> | undefined {
  try {
    const text = localStorage.getItem(prefix + id);
    if (text && text.length > 262144) return;
    const value = text ? JSON.parse(text) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return;
  }
}
function merged(old: Record<string, unknown>, next: Record<string, unknown>) {
  const value = { ...old };
  for (const [key, item] of Object.entries(next)) {
    // Keep stable references for unchanged layout/camera objects in peer updates.
    if (JSON.stringify(old[key]) !== JSON.stringify(item))
      Object.defineProperty(value, key, {
        value: item,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return value;
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null) {
      cache.clear();
      unpersisted.clear();
    } else if (event.key.startsWith(prefix)) {
      const id = event.key.slice(prefix.length),
        latest = stored(id);
      if (latest === undefined) return;
      if (event.newValue === null && !Object.keys(latest).length) cache.delete(id);
      else cache.set(id, merged(merged(cache.get(id) ?? {}, latest), unpersisted.get(id) ?? {}));
    } else return;
    for (const listener of listeners) listener();
  });
function record(id: string) {
  let value = cache.get(id);
  if (!value) {
    value = stored(id) ?? {};
    cache.set(id, value!);
  }
  return value!;
}
export function readMapSession<T>(id: string, key: string, fallback: T): T {
  const value = record(id);
  return Object.hasOwn(value, key) ? (value[key] as T) : fallback;
}
export function writeMapSession<T>(id: string, key: string, value: T) {
  if (!id || id.length > 128 || !/^[\w.:-]{1,80}$/.test(key)) return;
  // Another native WebView may have saved a different key since this cache loaded.
  const old = merged(merged(record(id), stored(id) ?? {}), unpersisted.get(id) ?? {});
  let text: string;
  try {
    if (JSON.stringify(old[key]) === JSON.stringify(value)) return;
    text = JSON.stringify({ ...old, [key]: value });
    if (text.length > 262144) return;
  } catch {
    return;
  }
  cache.set(id, { ...old, [key]: value });
  try {
    localStorage.setItem(prefix + id, text);
    unpersisted.delete(id);
  } catch {
    unpersisted.set(id, { ...unpersisted.get(id), [key]: value });
  }
  for (const listener of listeners) listener();
}
export function useMapState<T>(
  id: string,
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const get = () => {
    const r = record(id);
    let valid = Object.hasOwn(r, key);
    if (valid && typeof initial !== 'function') {
      const v = r[key];
      valid =
        initial === null
          ? v === null || typeof v === 'number' || typeof v === 'string'
          : Array.isArray(initial)
            ? Array.isArray(v)
            : typeof v === typeof initial;
      if (typeof v === 'number' && !Number.isFinite(v)) valid = false;
    }
    if (!valid) r[key] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return r[key] as T;
  };
  const value = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    get,
    get,
  );
  const set: Dispatch<SetStateAction<T>> = (next) =>
    writeMapSession(id, key, typeof next === 'function' ? (next as (value: T) => T)(get()) : next);
  return [value, set];
}

/** Carry view preferences across a new immutable cache revision, never game handles. */
export function copyMapViewSession(
  from: string,
  to: string,
  before: MapInspection | null,
  after: MapInspection | null,
) {
  if (from === to) return;
  const prior = record(from);
  const safe =
    /^(?:camera\.(?:world|forge|machinima)\.(?:PerspectiveCamera|OrthographicCamera)$|scroll\.|workspace$|tags\.(?:query|filter|limit|advanced)$|world\.(?:query|mode|snap|grid|view|ortho|fly|playerView)$|tools\.open$|hosting\.(?:runtime|tab)$|servers\.(?:provider|filter)$)/;
  for (const [key, value] of Object.entries(prior)) if (safe.test(key)) writeMapSession(to, key, value);
  for (const key of ['tags.selection', 'tags.focus']) {
    const old = before?.tags.find((tag) => tag.id === prior[key]);
    const matches = old
      ? (after?.tags.filter(
          (tag) =>
            tag.class === old.class &&
            tag.path.replaceAll('\\', '/').toLowerCase() === old.path.replaceAll('\\', '/').toLowerCase(),
        ) ?? [])
      : [];
    writeMapSession(to, key, matches.length === 1 ? matches[0].id : null);
  }
  writeMapSession(to, 'level.target', 'source');
}
