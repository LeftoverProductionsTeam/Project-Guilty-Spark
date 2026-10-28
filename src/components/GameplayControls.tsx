import { useState } from 'react';
import { call, native } from '../api';
import { DEFAULT_GAMEPLAY_CONTROLS, GAMEPLAY_KEYS, type GameplayControls as Controls } from '../gameplay';
import type { Project } from '../types';
import { Notice, NumberField } from './ui';
interface Inventory {
  readOnly: boolean;
  inputHooksReady: boolean;
  weapons: { slot: number; tagPath: string; equipped: boolean }[];
  detail: string;
}
export default function GameplayControls({
  project,
  edit,
  onEditor,
}: {
  project: Project | null;
  edit: (project: Project, description: string) => void;
  onEditor: () => void;
}) {
  const [inventory, setInventory] = useState<Inventory | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const config = project?.gameplayControls ?? DEFAULT_GAMEPLAY_CONTROLS;
  function update<K extends keyof Controls>(key: K, value: Controls[K]) {
    if (project)
      edit(
        { ...project, gameplayControls: { ...config, [key]: value } },
        'Change map gameplay control preset',
      );
  }
  return (
    <section className="analysis-card gameplay-controls" aria-label="Gameplay control presets">
      <h2>Gameplay controls</h2>
      <Notice tone="info">
        Control presets are saved with each map. This build can inspect the connected player's inventory; live
        sprint, dual wield and sword lunge are awaiting verified MCC input and targeting hooks. Changing a
        preset does not enable them in the running game.
      </Notice>
      {project ? (
        <>
          <fieldset>
            <legend>Sprint preset</legend>
            <label>
              <input
                type="checkbox"
                checked={config.sprint}
                onChange={(e) => update('sprint', e.target.checked)}
              />
              Request sprint support
            </label>
            <label>
              Sprint hotkey
              <select
                aria-label="Sprint hotkey"
                value={config.sprintKey}
                onChange={(e) => update('sprintKey', e.target.value)}
              >
                {GAMEPLAY_KEYS.map((key) => (
                  <option disabled={key === config.dualWieldKey} key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Sprint speed multiplier"
              value={config.sprintMultiplier}
              min={1.05}
              max={2}
              step={0.05}
              onCommit={(value) => update('sprintMultiplier', Math.max(1.05, Math.min(2, value)))}
            />
            <p>Hold to sprint. The control contract stops sprint on firing, reloading or dual wielding.</p>
          </fieldset>
          <fieldset>
            <legend>Dual-wield preset</legend>
            <label>
              <input
                type="checkbox"
                checked={config.dualWield}
                onChange={(e) => update('dualWield', e.target.checked)}
              />
              Request dual wield support
            </label>
            <label>
              Dual-wield hotkey
              <select
                aria-label="Dual-wield hotkey"
                value={config.dualWieldKey}
                onChange={(e) => update('dualWieldKey', e.target.value)}
              >
                {GAMEPLAY_KEYS.map((key) => (
                  <option disabled={key === config.sprintKey} key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <dl className="gameplay-bindings">
              <div>
                <dt>Left mouse button</dt>
                <dd>Left gun · independent primary trigger</dd>
              </div>
              <div>
                <dt>Right mouse button</dt>
                <dd>Right gun · independent secondary trigger</dd>
              </div>
              <div>
                <dt>Both mouse buttons</dt>
                <dd>Fire both guns together</dd>
              </div>
            </dl>
            <p>
              While dual wielding, right click belongs to the right gun. Reload stops both triggers; zoom and
              grenade throw are suppressed. A paired first-person model, muzzle markers, independent magazines
              and matching animations are required.
            </p>
          </fieldset>
          <fieldset>
            <legend>Energy sword preset</legend>
            <label>
              <input
                type="checkbox"
                checked={config.swordLunge}
                onChange={(e) => update('swordLunge', e.target.checked)}
              />
              Request red-reticle sword lunge
            </label>
            <p>
              Lunge must require a live hostile target, red reticle, clear line of sight and a clear collision
              path. The stock Halo 1 sword has no usable first-person model/animation pair; an in-game sword
              is not enabled by this preset.
            </p>
          </fieldset>
        </>
      ) : (
        <p>Open a map to keep its own gameplay control preset.</p>
      )}
      <div className="analysis-actions">
        <button onClick={onEditor}>Open live connection</button>
        <button
          disabled={!native || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setInventory(await call<Inventory>('live_mcc_gameplay_inventory'));
            } catch (e) {
              setInventory(null);
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Reading player inventory…' : 'Inspect connected inventory'}
        </button>
      </div>
      {inventory && (
        <div role="status">
          <p>{inventory.detail}</p>
          <ul>
            {inventory.weapons.map((weapon) => (
              <li key={weapon.slot}>
                Slot {weapon.slot + 1}: {weapon.tagPath}
                {weapon.equipped ? ' · equipped' : ' · stowed'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
