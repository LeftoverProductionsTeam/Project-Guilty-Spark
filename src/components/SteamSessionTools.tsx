import { useEffect, useState } from 'react';
import { call, native } from '../api';
import { Notice } from './ui';
interface ModuleStatus {
  configured: boolean;
  appId: number;
  testMode: boolean;
  detail: string;
}
export default function SteamSessionTools({ onReady }: { onReady?: (ready: boolean) => void }) {
  const [status, setStatus] = useState<ModuleStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tested, setTested] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (native)
      void call<ModuleStatus>('steam_module_status').then(
        (value) => {
          if (!cancelled) {
            setStatus(value);
            onReady?.(value.configured);
          }
        },
        (e) => {
          if (!cancelled) setError(String(e));
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="steam-session-tools">
      <strong>Steam · Spacewar test mode (480)</strong>
      <p>{status?.detail ?? 'The optional Steam module is configured separately from Halo.'}</p>
      <div className="analysis-actions">
        <button
          disabled={!native || busy}
          onClick={() =>
            void perform(async () => {
              const result = await call<ModuleStatus & { cancelled?: boolean }>('choose_steam_module');
              if (!result.cancelled) {
                setStatus(result);
                onReady?.(result.configured);
                setTested('');
              }
            })
          }
        >
          Choose Steam module
        </button>
        <button
          disabled={!native || busy || !status?.configured}
          onClick={() =>
            void perform(async () => {
              const ready = await call<{ appId: number; testMode: boolean; relayStatus: string }>(
                'steam_session_probe',
              );
              setTested(
                `Steam initialized for app ${ready.appId}. Relay status: ${ready.relayStatus}. A peer connection has not been tested by this check.`,
              );
            })
          }
        >
          {busy ? 'Checking…' : 'Test Steam connection'}
        </button>
      </div>
      <p className="subtle">
        Steam may show Spacewar while the test module runs. A second Steam account is required for a peer
        test. Halo keeps its own game connection; Spark carries editor source separately.
      </p>
      {tested && <p role="status">{tested}</p>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
