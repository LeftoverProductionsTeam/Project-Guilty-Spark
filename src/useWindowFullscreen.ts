import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { native } from './api';

/** Read actual window state; remembered layouts must not pretend a window is fullscreen. */
export function useWindowFullscreen() {
  const [fullscreen, setFullscreen] = useState(false),
    [error, setError] = useState('');
  const busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const read = async () => {
      try {
        const value = native ? await getCurrentWindow().isFullscreen() : !!document.fullscreenElement;
        if (alive.current) setFullscreen(!!value);
      } catch {
        /* F11 still reports actionable failures through the control. */
      }
    };
    void read();
    const stop = native ? getCurrentWindow().onResized(() => void read()) : null;
    document.addEventListener('fullscreenchange', read);
    return () => {
      alive.current = false;
      document.removeEventListener('fullscreenchange', read);
      void stop?.then((fn) => fn());
    };
  }, []);
  const change = useCallback(async (enabled?: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const active = native ? await getCurrentWindow().isFullscreen() : !!document.fullscreenElement;
      const next = enabled ?? !active;
      if (native) await getCurrentWindow().setFullscreen(next);
      else if (next && !active) await document.documentElement.requestFullscreen();
      else if (!next && active) await document.exitFullscreen();
      if (alive.current) {
        setFullscreen(next);
        setError('');
      }
    } catch (reason) {
      if (alive.current) setError(`Fullscreen unavailable: ${String(reason)}`);
    } finally {
      busy.current = false;
    }
  }, []);
  return { fullscreen, change, error };
}
