import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { call, native } from '../api';
import { disconnectLiveSession } from '../liveSession';
import type { LiveCleanupStatus, LiveDisconnectReport } from '../liveSession';
import { Notice } from './ui';

/** Local journal status stays reachable when the game snapshot can no longer be sampled. */
export default function LiveSessionRecovery({
  onReleased,
  disabled = false,
  onBusyChange,
}: {
  onReleased: (report: LiveDisconnectReport) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<LiveCleanupStatus | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const mounted = useRef(false),
    epoch = useRef(0),
    working = useRef(false);
  async function refresh() {
    const ticket = ++epoch.current;
    try {
      const next = await call<LiveCleanupStatus>('live_mcc_cleanup_status');
      if (mounted.current && ticket === epoch.current) {
        setStatus(next);
        setError('');
      }
    } catch (error) {
      if (mounted.current && ticket === epoch.current) setError(String(error));
    }
  }
  useEffect(() => {
    if (!native) return;
    mounted.current = true;
    void refresh();
    const changed = listen('spark:live-session-changed', () => void refresh()).catch(() => () => {});
    return () => {
      mounted.current = false;
      epoch.current++;
      void changed.then((stop) => stop()).catch(() => {});
    };
  }, []);
  async function release() {
    if (working.current || disabled || !status?.sessionToken) return;
    working.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    onBusyChange?.(true);
    let released = false;
    try {
      const report = await disconnectLiveSession(status.sessionToken);
      released = true;
      if (mounted.current) {
        setStatus(null);
        onReleased(report);
      }
    } catch (error) {
      // Refresh the token after a competing window changed the session, retaining the failure text.
      await refresh();
      if (mounted.current) setError(String(error));
    } finally {
      working.current = false;
      onBusyChange?.(false);
      if (mounted.current) {
        setBusy(false);
        if (released) void refresh();
      }
    }
  }
  if (!native || (!status?.hasSession && !error)) return null;
  return (
    <div className="live-session-recovery" role="region" aria-label="Previous live session">
      {status?.hasSession && (
        <>
          <p>{status.detail}</p>
          <button disabled={busy || disabled} onClick={() => void release()}>
            {busy ? 'Releasing previous session…' : 'Release previous live session'}
          </button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <button disabled={busy || disabled} onClick={() => void refresh()}>
        Check previous session
      </button>
    </div>
  );
}
