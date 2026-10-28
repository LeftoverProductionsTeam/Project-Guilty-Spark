import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { Notice, NumberField } from './ui';
interface Config {
  back: number;
  right: number;
  up: number;
}
interface Status {
  enabled: boolean;
  active: boolean;
  restorePending: boolean;
  config: Config;
  shortcut?: { enabled: boolean; key: string };
  observed: { available: boolean; reason: string; weaponThirdPerson: boolean; trackCount: number } | null;
  error: string | null;
  detail: string;
}
const DEFAULT: Config = { back: 0.4, right: 0.3, up: 0.15 },
  STORAGE = 'spark.native-shoulder-camera.v1';
function stored(): Config {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Config | null;
    if (
      c &&
      Number.isFinite(c.back) &&
      c.back >= 0 &&
      c.back <= 3 &&
      Number.isFinite(c.right) &&
      Math.abs(c.right) <= 1.5 &&
      Number.isFinite(c.up) &&
      c.up >= -1 &&
      c.up <= 2
    )
      return { back: c.back, right: c.right, up: c.up };
  } catch {
    /* Storage may be unavailable. */
  }
  return { ...DEFAULT };
}
export default function NativeCameraControls() {
  const [status, setStatus] = useState<Status | null>(null),
    [draft, setDraft] = useState<Config>(stored),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    pending = useRef(false),
    changing = useRef(false),
    edited = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    async function refresh() {
      if (pending.current || changing.current) return;
      pending.current = true;
      const request = epoch.current;
      try {
        const next = await call<Status>('live_mcc_camera_status');
        if (!stopped && request === epoch.current) {
          setStatus(next);
          setError('');
          if (next.enabled && !edited.current) setDraft(next.config);
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
    const timer = native ? setInterval(() => void refresh(), 1000) : undefined;
    return () => {
      stopped = true;
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  function update(key: keyof Config, value: number) {
    edited.current = true;
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function configure(enabled: boolean, config = draft) {
    if (changing.current) return;
    changing.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    try {
      const next = await call<Status>('live_mcc_camera_configure', { enabled, config });
      if (mounted.current) {
        setStatus(next);
        setDraft(next.config);
        edited.current = false;
      }
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next.config));
      } catch {
        /* Native state still succeeded. */
      }
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function shortcut(value: { enabled: boolean; key: string }) {
    if (changing.current) return;
    changing.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    try {
      const next = await call<Status>('live_mcc_camera_shortcut', { shortcut: value });
      if (mounted.current) setStatus(next);
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function toggle() {
    if (changing.current) return;
    changing.current = true;
    epoch.current++;
    setBusy(true);
    setError('');
    try {
      const next = await call<Status>('live_mcc_camera_toggle', { config: draft });
      if (mounted.current) {
        setStatus(next);
        setDraft(next.config);
        edited.current = false;
      }
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next.config));
      } catch {}
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      changing.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const dirty =
    !!status &&
    (['back', 'right', 'up'] as const).some((key) => Math.abs(status.config[key] - draft[key]) > 0.00001);
  return (
    <section className="native-camera-controls">
      <div className="analysis-actions native-camera-quick-toggle">
        <button
          aria-label="Toggle in-game third person"
          aria-pressed={!!status?.enabled}
          disabled={!native || busy || !status || status.restorePending}
          onClick={() => void toggle()}
        >
          {status?.enabled ? 'Switch to first person' : 'Switch to third person'}
        </button>
        {status?.shortcut?.enabled && <span>{status.shortcut.key} · toggle in MCC</span>}
      </div>
      <details>
        <summary>Third-person shoulder camera · MCC Halo 1</summary>
        <p>
          Edit the in-game camera position while keeping your character controllable. Values offset the
          biped’s authored camera track in Halo world units.
        </p>
        <div className="vector-fields">
          <NumberField
            label="Camera extra back distance"
            value={draft.back}
            min={0}
            max={3}
            step={0.05}
            disabled={busy}
            onCommit={(value) => update('back', value)}
          />
          <NumberField
            label="Camera shoulder offset"
            value={draft.right}
            min={-1.5}
            max={1.5}
            step={0.05}
            disabled={busy}
            onCommit={(value) => update('right', value)}
          />
          <NumberField
            label="Camera height offset"
            value={draft.up}
            min={-1}
            max={2}
            step={0.05}
            disabled={busy}
            onCommit={(value) => update('up', value)}
          />
        </div>
        <p className="subtle">
          Positive shoulder values move right; negative values move left. Positive height raises the camera.
        </p>
        <div className="native-camera-shortcut">
          <label>
            <input
              type="checkbox"
              aria-label="Enable in-game camera shortcut"
              disabled={!native || busy || !status || status.restorePending}
              checked={!!status?.shortcut?.enabled}
              onChange={(e) =>
                void shortcut({ enabled: e.target.checked, key: status?.shortcut?.key ?? 'F6' })
              }
            />
            Enable in-game camera shortcut
          </label>
          <label>
            Camera shortcut
            <select
              aria-label="In-game camera shortcut"
              disabled={!native || busy || !status || status.restorePending}
              value={status?.shortcut?.key ?? 'F6'}
              onChange={(e) => void shortcut({ enabled: !!status?.shortcut?.enabled, key: e.target.value })}
            >
              {Array.from({ length: 12 }, (_, i) => `F${i + 1}`).map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
          <small>
            The shortcut works only while MCC is focused. Holding the key toggles once; modifier-key
            combinations are ignored.
          </small>
        </div>
        <div className="analysis-actions">
          <button disabled={busy} onClick={() => update('right', Math.abs(draft.right) || 0.3)}>
            Right shoulder
          </button>
          <button disabled={busy} onClick={() => update('right', -(Math.abs(draft.right) || 0.3))}>
            Left shoulder
          </button>
          <button disabled={busy} onClick={() => update('right', 0)}>
            Centered
          </button>
          <button
            disabled={busy}
            onClick={() => {
              edited.current = true;
              setDraft({ ...DEFAULT });
            }}
          >
            Reset position fields
          </button>
        </div>
        <div className="analysis-actions">
          <button
            disabled={!native || busy || !status || status.restorePending || (status.enabled && !dirty)}
            onClick={() => void configure(true)}
          >
            {status?.enabled ? 'Apply camera position' : 'Enable third-person camera'}
          </button>
          <button
            disabled={!native || busy || !status || (!status.enabled && !status.restorePending)}
            onClick={() => void configure(false)}
          >
            Restore original camera
          </button>
        </div>
        {status && (
          <p role="status">
            {status.active
              ? 'Third-person camera active'
              : status.enabled
                ? 'Third-person camera waiting for player'
                : status.restorePending
                  ? 'Camera restoration needs attention'
                  : 'Original camera selected'}
            {dirty ? ' · position changes not applied' : ''}
            {status.observed ? ` · ${status.observed.reason}` : ''}
          </p>
        )}
        <small>
          Experimental: the engine handles aiming and camera motion. Near/far reticle accuracy and wall
          collision still require playtesting. Matching local weapon/biped tags share these temporary
          settings. Disconnect restores the original data.
        </small>
      </details>
      {(error || status?.error) && <Notice tone="error">{error || status?.error}</Notice>}
    </section>
  );
}
