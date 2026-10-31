import { useEffect, useState } from 'react';
import { call, native } from './api';
import type { AnimationClip } from './animation';
import type { OwnedModelIdentity } from './useOwnedForgeModels';
interface NativeAnimations {
  objectTagId: number;
  graphTagId: number;
  clips: AnimationClip[];
  unavailable: string[];
}
const cache = new Map<string, Promise<NativeAnimations>>();
/** Only immutable, exact map/object identities can share a decoded graph. */
export function useNativeModelAnimations(asset: OwnedModelIdentity, enabled: boolean) {
  const [value, setValue] = useState<NativeAnimations | null>(null);
  const [error, setError] = useState('');
  const key = `${asset.sourceProjectId}:${asset.sourceSha256}:${asset.tagId}`;
  useEffect(() => {
    let alive = true;
    setValue(null);
    setError('');
    if (!enabled || !native || !asset.sourceProjectId || !asset.sourceSha256 || asset.tagId == null) return;
    let pending = cache.get(key);
    if (!pending) {
      if (cache.size >= 16) cache.delete(cache.keys().next().value!);
      pending = call<{ sourceSha256: string; animations: NativeAnimations }>(
        'preview_owned_object_animations',
        {
          projectId: asset.sourceProjectId,
          sourceSha256: asset.sourceSha256,
          tagId: asset.tagId,
        },
      ).then((result) => {
        if (result.sourceSha256 !== asset.sourceSha256 || result.animations.objectTagId !== asset.tagId)
          throw Error('Native animation source identity changed');
        return result.animations;
      });
      cache.set(key, pending);
      void pending.catch(() => cache.delete(key));
    }
    void pending.then(
      (next) => {
        if (alive) {
          setValue(next);
          if (!next.clips.length)
            setError(next.unavailable[0] ?? 'No supported native animation clips in this graph');
        }
      },
      (failure) => {
        if (alive) setError(String(failure));
      },
    );
    return () => {
      alive = false;
    };
  }, [key, enabled]);
  return { value, error };
}
