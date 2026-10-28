import { useEffect, useState } from 'react';
import type { MapInspection, Project, Vec3 } from '../types';
import { createPowerup, POWERUP_EFFECTS, validatePowerups } from '../powerups';
import type { CustomPowerup } from '../powerups';
import { useMapState } from '../mapSession';
import { Notice, NumberField } from './ui';
function TextField({
  label,
  value,
  onCommit,
  list,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label>
      {label}
      <input
        aria-label={label}
        list={list}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export default function PowerupStudio({
  project,
  inspection,
  edit,
  onBuild,
}: {
  project: Project;
  inspection: MapInspection | null;
  edit: (next: Project, description: string) => void;
  onBuild: () => void;
}) {
  const items = project.powerups ?? [],
    [selected, select] = useMapState(project.id, 'custom-powerup-selection', ''),
    [error, setError] = useState('');
  const current = items.find((p) => p.id === selected) ?? items[0];
  function save(next: CustomPowerup[], description: string) {
    const problems = validatePowerups(next);
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }
    setError('');
    edit({ ...project, powerups: next }, description);
  }
  function update(patch: Partial<CustomPowerup>) {
    if (current)
      save(
        items.map((p) => (p.id === current.id ? { ...p, ...patch } : p)),
        'Edit custom power-up',
      );
  }
  const origin: Vec3 = project.quickForge?.spawns[0]?.position ??
    project.scene.find((o) => o.kind.toLowerCase().includes('player'))?.position ?? [0, 0, 0];
  const modelList = `powerup-models-${project.id}`,
    soundList = `powerup-sounds-${project.id}`;
  return (
    <section className="analysis-card powerup-studio" aria-label="Custom power-ups">
      <h2>Custom power-ups</h2>
      <p>
        Create a real Halo 1 equipment pickup with its own effect, duration, respawn, model and sound. Each
        recipe belongs to this map and uses its undo history.
      </p>
      <div className="analysis-actions">
        <button
          disabled={items.length >= 64}
          onClick={() => {
            const next = createPowerup(origin);
            save([...items, next], 'Create custom power-up');
            select(next.id);
          }}
        >
          Add custom power-up
        </button>
        <button disabled={!items.length} onClick={onBuild}>
          Build map with power-ups
        </button>
      </div>
      {!!items.length && (
        <label>
          Power-up
          <select
            aria-label="Custom power-up"
            value={current?.id ?? ''}
            onChange={(e) => select(e.target.value)}
          >
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <div key={current.id} className="powerup-fields">
          <TextField label="Power-up name" value={current.name} onCommit={(name) => update({ name })} />
          <label>
            Native effect
            <select
              aria-label="Power-up effect"
              value={current.effect}
              onChange={(e) => update({ effect: e.target.value as CustomPowerup['effect'] })}
            >
              {POWERUP_EFFECTS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Power-up duration (seconds)"
            value={current.durationSeconds}
            min={1}
            max={600}
            step={1}
            onCommit={(durationSeconds) => update({ durationSeconds })}
          />
          <NumberField
            label="Power-up respawn (seconds)"
            value={current.respawnSeconds}
            min={1}
            max={3600}
            step={1}
            onCommit={(respawnSeconds) => {
              if (Number.isInteger(respawnSeconds)) update({ respawnSeconds });
              else setError('Respawn uses whole seconds.');
            }}
          />
          <div className="vector-fields">
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <NumberField
                key={axis}
                label={`Power-up position ${axis}`}
                value={current.position[i]}
                min={-4096}
                max={4096}
                onCommit={(n) =>
                  update({ position: current.position.map((v, j) => (i === j ? n : v)) as Vec3 })
                }
              />
            ))}
          </div>
          <NumberField
            label="Power-up facing (degrees)"
            value={current.facingDegrees}
            min={-360}
            max={360}
            onCommit={(facingDegrees) => update({ facingDegrees })}
          />
          <label>
            <input
              type="checkbox"
              checked={current.levitate}
              onChange={(e) => update({ levitate: e.target.checked })}
            />
            Levitate at this position
          </label>
          <button onClick={() => update({ position: [...origin] })}>Use first player spawn position</button>
          <TextField
            label="Power-up model tag"
            list={modelList}
            value={current.modelTag ?? ''}
            onCommit={(value) => update({ modelTag: value || null })}
          />
          <TextField
            label="Power-up pickup sound"
            list={soundList}
            value={current.pickupSound ?? ''}
            onCommit={(value) => update({ pickupSound: value || null })}
          />
          <datalist id={modelList}>
            {inspection?.tags
              .filter((t) => t.class === 'mod2' || t.class === 'mode')
              .map((t) => (
                <option key={t.id} value={`${t.path}.${t.class === 'mod2' ? 'gbxmodel' : 'model'}`} />
              ))}
          </datalist>
          <datalist id={soundList}>
            {inspection?.tags
              .filter((t) => t.class === 'snd!')
              .map((t) => (
                <option key={t.id} value={`${t.path}.sound`} />
              ))}
          </datalist>
          <p className="subtle">
            Leave model and sound blank to use the native effect’s pickup. Custom paths must name editable
            tags in this map’s build tagset, including .gbxmodel/.model or .sound.
          </p>
          <div className="analysis-actions">
            <button
              disabled={items.length >= 64}
              onClick={() => {
                const copy = {
                  ...structuredClone(current),
                  id: crypto.randomUUID(),
                  name: `${current.name.slice(0, 70)} copy`,
                };
                save([...items, copy], 'Duplicate custom power-up');
                select(copy.id);
              }}
            >
              Duplicate power-up
            </button>
            <button
              onClick={() => {
                save(
                  items.filter((p) => p.id !== current.id),
                  'Remove custom power-up',
                );
                select('');
              }}
            >
              Remove power-up
            </button>
          </div>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Notice>
        Halo 1 multiplayer builds generate separate equipment and item-collection tags and append pickups to
        the scenario. Rebuild and load the map to use new pickups. Effects use native Halo rules; duration
        does not turn health or grenades into timed buffs. Native double speed and pickup behavior still need
        target-game acceptance.
      </Notice>
    </section>
  );
}
