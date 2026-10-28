import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { GAMEPLAY_KEYS } from '../gameplay';
import { Notice, NumberField } from './ui';
interface Status {
  enabled: boolean;
  sprinting: boolean;
  restorePending: boolean;
  config: { hotkey: string; multiplier: number };
  observed: { playerDatum: number; multiplier: number; canSprint: boolean; reason: string } | null;
  error: string | null;
  detail: string;
}
export default function NativeSprintControls() {
  const [status, setStatus] = useState<Status | null>(null),
    [key, setKey] = useState('ShiftLeft'),
    [multiplier, setMultiplier] = useState(1.75),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    pending = useRef(false),
    changing = useRef(false),
    epoch = useRef(0),
    edited = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    async function refresh() {
      if (pending.current || changing.current) return;
      pending.current = true;
      const request = epoch.current;
      try {
        const value = await call<Status>('live_mcc_sprint_status');
        if (!stopped && request === epoch.current) {
          setStatus(value);
          setError('');
          if (!edited.current) {
            setKey(value.config.hotkey);
            setMultiplier(value.config.multiplier);
          }
        }
      } catch (error) {
        if (!stopped && request === epoch.current) {
          setStatus(null);
          setError(String(error));
        }
      } finally {
        pending.current = false;
      }
    }
    if (native) void refresh();
    const timer = native ? setInterval(() => void refresh(), 750) : undefined;
    return () => {
      stopped = true;
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  async function configure(enabled: boolean) {
    if (changing.current) return;
    changing.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    try {
      const value = await call<Status>('live_mcc_sprint_configure', {
        enabled,
        config: { hotkey: key, multiplier },
      });
      if (mounted.current) {
        setStatus(value);
        edited.current = false;
      }
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <details className="native-sprint-controls">
      <summary>Native sprint · MCC Halo 1</summary>
      <p>
        Hold the selected key while moving forward in the connected MCC window. Release, firing, reloading,
        crouching, entering a vehicle or leaving the game window restores the original player speed.
      </p>
      <label>
        Sprint key
        <select
          aria-label="Native sprint key"
          disabled={busy || status?.enabled}
          value={key}
          onChange={(event) => {
            edited.current = true;
            setKey(event.target.value);
          }}
        >
          {GAMEPLAY_KEYS.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Native sprint multiplier"
        value={multiplier}
        min={1.05}
        max={2}
        step={0.05}
        disabled={busy || !!status?.enabled}
        onCommit={(value) => {
          edited.current = true;
          setMultiplier(Math.min(2, Math.max(1.05, value)));
        }}
      />
      <div className="analysis-actions">
        <button
          disabled={!native || busy || !status || status.enabled || status.restorePending}
          onClick={() => void configure(true)}
        >
          Enable native sprint
        </button>
        <button
          disabled={!native || busy || !status || (!status.enabled && !status.restorePending)}
          onClick={() => void configure(false)}
        >
          Disable and restore speed
        </button>
      </div>
      {status && (
        <p role="status">
          {status.enabled ? 'Native sprint enabled' : 'Native sprint disabled'}
          {status.sprinting ? ' · sprint multiplier active' : ''}
          {status.restorePending ? ' · speed restoration needs attention' : ''}
          {status.observed
            ? ` · observed ${status.observed.multiplier.toFixed(2)}× · ${status.observed.reason}`
            : ''}
        </p>
      )}
      <small>
        Movement uses the engine's per-player multiplier. Faster locomotion animation is still being verified.
        Dual wield and sword lunge are separate engine work.
      </small>
      {(error || status?.error) && <Notice tone="error">{error || status?.error}</Notice>}
    </details>
  );
}
