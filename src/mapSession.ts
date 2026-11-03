/** Per-map UI state, separate from authored edits and build fingerprints. */
import { useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { MapInspection } from './types';
const cache = new Map<string, Record<string, unknown>>(),
  unpersisted = new Map<string, Record<string, unknown>>(),
  listeners = new Map<string, Map<string, Set<() => void>>>();
const prefix = 'guilty-spark-map-session-v1:';
// Re-read the storage string on every write for peer-window changes, but do not
// repeatedly decode an unchanged portrait/camera/layout record. Bound the extra
// serialized snapshots independently of the existing per-map view cache.
const storedRecords=new Map<string,{text:string|null;value:Record<string,unknown>}>();
function rememberStored(id:string,text:string|null,value:Record<string,unknown>) {
  storedRecords.delete(id);storedRecords.set(id,{text,value});
  if(storedRecords.size>8)storedRecords.delete(storedRecords.keys().next().value!);
  return value;
}

/** Subscribe only to the remembered values this view actually reads. */
export function subscribeMapSession(ids:readonly string[], key:string, listener:()=>void) {
  const unique=[...new Set(ids)];
  for(const id of unique) {
    let keys=listeners.get(id);
    if(!keys)listeners.set(id,keys=new Map());
    let callbacks=keys.get(key);
    if(!callbacks)keys.set(key,callbacks=new Set());
    callbacks.add(listener);
  }
  return()=>{
    for(const id of unique) {
      const keys=listeners.get(id),callbacks=keys?.get(key);
      callbacks?.delete(listener);
      if(!callbacks?.size)keys?.delete(key);
      if(!keys?.size)listeners.delete(id);
    }
  };
}
function publish(id:string, before:Record<string,unknown>, after:Record<string,unknown>) {
  cache.set(id,after);
  const pending=new Set<()=>void>();
  for(const [key,callbacks] of listeners.get(id)??[]) {
    if(Object.hasOwn(before,key)===Object.hasOwn(after,key)&&Object.is(before[key],after[key]))continue;
    for(const callback of callbacks)pending.add(callback);
  }
  for(const callback of pending)callback();
}
function stored(id: string): Record<string, unknown> | undefined {
  try {
    const text = localStorage.getItem(prefix + id);
    if (text && text.length > 262144) return;
    const known=storedRecords.get(id);
    if(known&&known.text===text)return rememberStored(id,text,known.value);
    const value = text ? JSON.parse(text) : {};
    return rememberStored(id,text,value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  } catch {
    return;
  }
}
function merged(old: Record<string, unknown>, next: Record<string, unknown>) {
  const value = { ...old };
  for (const [key, item] of Object.entries(next)) {
    // Keep stable references for unchanged layout/camera objects in peer updates.
    if (!Object.is(old[key],item) && JSON.stringify(old[key]) !== JSON.stringify(item))
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
      storedRecords.clear();
      const pending=new Set([...listeners.values()].flatMap(keys=>[...keys.values()].flatMap(callbacks=>[...callbacks])));
      for(const callback of pending)callback();
    } else if (event.key.startsWith(prefix)) {
      const id = event.key.slice(prefix.length),
        latest = stored(id);
      if (latest === undefined) return;
      const before=cache.get(id)??{};
      if (event.newValue === null && !Object.keys(latest).length) publish(id,before,{});
      else publish(id,before,merged(merged(before, latest), unpersisted.get(id) ?? {}));
    } else return;
  });
function record(id: string) {
  let value = cache.get(id);
  if (!value) {
    value = {...stored(id)};
    cache.set(id, value!);
  }
  return value!;
}
export function readMapSession<T>(id: string, key: string, fallback: T): T {
  const value = record(id);
  return Object.hasOwn(value, key) ? (value[key] as T) : fallback;
}
/** One stable subscription for source maps in a multi-map asset viewport. */
export function useMapSessionValues(ids: readonly string[], key: string, fallback: string): string {
  return useSyncExternalStore(
    listener => subscribeMapSession(ids,key,listener),
    () => JSON.stringify(ids.map(id => [id, readMapSession(id, key, fallback)])),
    () => '',
  );
}
export function writeMapSession<T>(id: string, key: string, value: T) {
  if (!id || id.length > 128 || !/^[\w.:-]{1,80}$/.test(key)) return;
  // Another native WebView may have saved a different key since this cache loaded.
  const before=record(id);
  const old = merged(merged(before, stored(id) ?? {}), unpersisted.get(id) ?? {});
  let text: string;
  try {
    if (JSON.stringify(old[key]) === JSON.stringify(value)) {
      // A peer can have changed another key before its storage event arrives.
      // Even a no-op local request must publish that acknowledged preference.
      publish(id,before,old);
      return;
    }
    text = JSON.stringify({ ...old, [key]: value });
    if (text.length > 262144) return;
  } catch {
    return;
  }
  const next={...old,[key]:value};
  try {
    localStorage.setItem(prefix + id, text);
    rememberStored(id,text,{...next});
    unpersisted.delete(id);
  } catch {
    unpersisted.set(id, { ...unpersisted.get(id), [key]: value });
  }
  publish(id,before,next);
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
    (callback) => subscribeMapSession([id],key,callback),
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
