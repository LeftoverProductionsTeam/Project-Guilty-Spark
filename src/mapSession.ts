/** Per-map UI state, separate from authored edits and build fingerprints. */
import { useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
const cache = new Map<string, Record<string, unknown>>(),
  listeners = new Set<() => void>();
const prefix = 'guilty-spark-map-session-v1:';
function record(id: string) {
  let value = cache.get(id);
  if (!value) {
    try {
      const text = localStorage.getItem(prefix + id);
      const parsed = text && text.length <= 262144 ? JSON.parse(text) : {};
      value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      value = {};
    }
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
  const old = record(id);
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
  } catch {
    /* in-memory context remains available */
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
