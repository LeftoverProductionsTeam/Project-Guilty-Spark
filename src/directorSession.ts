import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { call } from './api';
import type { CameraPose } from './machinima';
import type { CameraShot } from './creatorStudio';
export interface DirectorComposition {
  pose: CameraPose;
  shots: Required<
    Pick<CameraShot, 'id' | 'name' | 'durationMs' | 'cameraPosition' | 'lookAt' | 'fov' | 'roll' | 'easing'>
  >[];
  selected: string | null;
  target: string | null;
  tracking: 'free' | 'fixed' | 'follow' | 'lookAt' | 'orbit';
  playing: boolean;
  playheadMs: number;
  startedAtMs: number;
}
export interface DirectorSession {
  id: string;
  projectId: string;
  revision: number;
  composition: DirectorComposition;
  window: string | null;
  recording: boolean;
}
export function useDirectorSession(projectId: string) {
  const [session, setSession] = useState<DirectorSession | null>(null),
    [error, setError] = useState('');
  const current = useRef(session),
    generation = useRef(0),
    queue = useRef(Promise.resolve());
  current.current = session?.projectId === projectId ? session : null;
  useEffect(() => {
    const token = ++generation.current;
    setSession(null);
    setError('');
    const accept = (value: DirectorSession) => {
      if (generation.current !== token || value.projectId !== projectId) return;
      setSession((previous) =>
        !previous || previous.projectId !== projectId || value.revision >= previous.revision
          ? value
          : previous,
      );
    };
    void call<DirectorSession>('director_session', { projectId })
      .then(accept)
      .catch((e) => {
        if (generation.current === token) setError(String(e));
      });
    const stop = listen<DirectorSession>('spark:director', ({ payload }) => accept(payload));
    return () => {
      generation.current++;
      void stop.then((stop) => stop());
    };
  }, [projectId]);
  const update = useCallback(
    (transform: (composition: DirectorComposition) => DirectorComposition, save = true) => {
      const token = generation.current;
      const request = queue.current.then(async () => {
        const before = current.current;
        if (generation.current !== token || before?.projectId !== projectId) return;
        try {
          const value = await call<DirectorSession>('director_update', {
            projectId,
            revision: before.revision,
            composition: transform(before.composition),
            save,
          });
          if (generation.current !== token) return;
          current.current = value;
          setSession((previous) => (previous && previous.revision > value.revision ? previous : value));
          setError('');
        } catch (e) {
          if (generation.current !== token) return;
          setError(String(e));
          const refreshed = await call<DirectorSession>('director_session', { projectId });
          if (generation.current === token) {
            current.current = refreshed;
            setSession(refreshed);
          }
        }
      });
      queue.current = request.catch((e) => {
        if (generation.current === token) setError(String(e));
      });
      return request;
    },
    [projectId],
  );
  return { session: session?.projectId === projectId ? session : null, error, update };
}
