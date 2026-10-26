import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, Trash2, Play, Flag } from 'lucide-react';
import { call } from '../api';
import type {
  FirefightCatalog,
  FirefightConfig,
  FirefightSimulation,
  FirefightValidation,
  SpawnZone,
} from '../firefight';
import type { LibraryEntry, Project } from '../types';
import { Notice, NumberField, PageTitle, Pill } from './ui';

export default function Firefight({
  project,
  entries,
  edit,
  compact = false,
  selectedZone,
  onSelectZone,
}: {
  project: Project;
  entries: LibraryEntry[];
  edit: (project: Project, description: string) => void;
  compact?: boolean;
  selectedZone?: string | null;
  onSelectZone?: (id: string) => void;
}) {
  const sources = entries.filter((e) => e.version !== null);
  const [sourceId, setSourceId] = useState(
    sources.find((e) => e.sha256 === project.firefight?.sourceSha256)?.id ??
      (project.source ? project.id : sources[0]?.id) ??
      '',
  );
  const [catalog, setCatalog] = useState<FirefightCatalog | null>(null);
  const [validation, setValidation] = useState<FirefightValidation | null>(null);
  const [simulation, setSimulation] = useState<FirefightSimulation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const config = project.firefight;
  useEffect(() => {
    let alive = true;
    setCatalog(null);
    setError('');
    if (!sourceId) return;
    call<FirefightCatalog>('firefight_catalog', { sourceProjectId: sourceId })
      .then((result) => {
        if (alive) setCatalog(result);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [sourceId]);
  useEffect(() => {
    setValidation(null);
    setSimulation(null);
  }, [config]);
  function change(next: FirefightConfig, description: string) {
    edit({ ...project, firefight: next }, description);
  }
  function begin(next?: FirefightConfig) {
    if (!catalog) return;
    const first = catalog.enemies[0];
    if (!next && !first) {
      setError('This source contains no audited actor-variant tags. Import a map with actual actv content.');
      return;
    }
    const spawn = project.quickForge?.spawns[0]?.position ?? [0, 0, 0.2];
    change(
      next ?? {
        ...catalog.defaultConfig,
        title: `${project.title} · Firefight`,
        sourceSha256: sources.find((e) => e.id === sourceId)?.sha256 ?? null,
        enemies: [first],
        waves: [
          {
            id: crypto.randomUUID(),
            name: 'Wave 1',
            boss: false,
            scoreMultiplierMilli: 1000,
            groups: [{ enemyId: first.id, count: 6 }],
          },
        ],
        spawnZones: [{ id: crypto.randomUUID(), position: [...spawn], radius: 2, enabled: true }],
      },
      'Create Firefight authoring rules',
    );
  }
  function updateZone(id: string, patch: Partial<SpawnZone>) {
    if (config)
      change(
        {
          ...config,
          spawnZones: config.spawnZones.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)),
        },
        'Edit AI spawn zone',
      );
  }
  async function run(kind: 'validate' | 'preview') {
    if (!config) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'validate')
        setValidation(
          await call<FirefightValidation>('firefight_validate', {
            config,
            sourceProjectId: sourceId || undefined,
          }),
        );
      else setSimulation(await call<FirefightSimulation>('firefight_preview', { config, completedWaves: 1 }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={compact ? 'firefight-compact' : 'analysis-page firefight-page'}>
      {!compact && (
        <PageTitle
          eyebrow="FIREFIGHT / SURVIVAL AUTHORING"
          title="Build a wave plan from real actors"
          description="Author deterministic rules and spawn zones. Runtime scripting and network gameplay require separate validation."
        />
      )}
      <Notice tone="info">
        Authoring rules only. No live game bridge or two-client AI synchronization is connected. The rules
        preview uses scripted virtual spawns and kills.
      </Notice>
      <label className="forge-field">
        Actor source map
        <select
          aria-label="Firefight actor source"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">Choose an imported map</option>
          {sources.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} · cache {entry.version}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice>{error}</Notice>}
      {catalog && (
        <>
          <div className="forge-panel-heading">
            <strong>{catalog.enemies.length} real actor variants</strong>
            <Pill>actv</Pill>
          </div>
          {!config && (
            <button className="primary full" disabled={!catalog.enemies.length} onClick={() => begin()}>
              <Plus size={14} />
              Create custom waves
            </button>
          )}
          {catalog.presets.length > 0 && (
            <details className="forge-details">
              <summary>Recovered Zombie presets</summary>
              {catalog.presets.map((preset) => (
                <div className="forge-preset" key={preset.id}>
                  <button disabled={!preset.config} onClick={() => begin(preset.config!)}>
                    {preset.name}
                  </button>
                  <p>{preset.detail}</p>
                  {preset.missingActorVariants.length > 0 && (
                    <small>Missing: {preset.missingActorVariants.join(', ')}</small>
                  )}
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {config && (
        <>
          <div className="forge-panel-heading">
            <h3>Survival rules</h3>
            <Pill>{config.waves.length} waves</Pill>
          </div>
          <label className="forge-field">
            Rules title
            <input
              value={config.title}
              maxLength={160}
              onChange={(e) => change({ ...config, title: e.target.value }, 'Rename Firefight rules')}
            />
          </label>
          <div className="forge-rule-grid">
            {(
              [
                ['playerCount', 'Players', 1, 16],
                ['teamLives', 'Team lives', 0, 999],
                ['rounds', 'Rounds', 1, 100],
                ['maxAlive', 'Maximum alive', 1, 256],
                ['maxTotalPerWave', 'Wave enemy limit', 1, 4096],
                ['spawnIntervalMs', 'Spawn interval (ms)', 1, 60000],
                ['countdownMs', 'Countdown (ms)', 0, 60000],
                ['intermissionMs', 'Intermission (ms)', 0, 600000],
                ['difficultyStepPercent', 'Difficulty step (%)', 0, 500],
                ['extraPlayerCountPercent', 'Extra player scaling (%)', 0, 500],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <NumberField
                  label={label}
                  value={config[key]}
                  min={min}
                  max={max}
                  step={1}
                  onCommit={(value) =>
                    change({ ...config, [key]: Math.round(value) }, `Set Firefight ${label}`)
                  }
                />
              </label>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.endless}
              onChange={(e) => change({ ...config, endless: e.target.checked }, 'Set endless Firefight')}
            />
            Endless rounds
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.replenishAmmoEachWave}
              onChange={(e) =>
                change({ ...config, replenishAmmoEachWave: e.target.checked }, 'Set ammo replenishment')
              }
            />
            Request ammo replenishment each wave (runtime integration required)
          </label>
          <div className="forge-panel-heading">
            <h3>Wave timeline</h3>
            <button
              className="small-button"
              disabled={!config.enemies.length}
              onClick={() =>
                change(
                  {
                    ...config,
                    waves: [
                      ...config.waves,
                      {
                        id: crypto.randomUUID(),
                        name: `Wave ${config.waves.length + 1}`,
                        boss: false,
                        scoreMultiplierMilli: 1000,
                        groups: [{ enemyId: config.enemies[0].id, count: 6 }],
                      },
                    ],
                  },
                  'Add Firefight wave',
                )
              }
            >
              <Plus size={13} />
              Wave
            </button>
          </div>
          {config.waves.map((wave, index) => (
            <article className="forge-wave" key={wave.id}>
              <div className="forge-wave-title">
                <span>{index + 1}</span>
                <input
                  aria-label={`Wave ${index + 1} name`}
                  value={wave.name}
                  onChange={(e) =>
                    change(
                      {
                        ...config,
                        waves: config.waves.map((w) =>
                          w.id === wave.id ? { ...w, name: e.target.value } : w,
                        ),
                      },
                      'Rename wave',
                    )
                  }
                />
                <button
                  aria-label={`Remove wave ${index + 1}`}
                  onClick={() =>
                    change({ ...config, waves: config.waves.filter((w) => w.id !== wave.id) }, 'Remove wave')
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {wave.groups.map((group, gi) => (
                <div className="forge-wave-group" key={gi}>
                  <select
                    aria-label={`Wave ${index + 1} enemy ${gi + 1}`}
                    value={group.enemyId}
                    onChange={(e) => {
                      const enemy = [...config.enemies, ...(catalog?.enemies ?? [])].find(
                        (entry) => entry.id === e.target.value,
                      );
                      if (!enemy) return;
                      const enemies = config.enemies.some((entry) => entry.id === enemy.id)
                        ? config.enemies
                        : [...config.enemies, enemy];
                      change(
                        {
                          ...config,
                          enemies,
                          waves: config.waves.map((w) =>
                            w.id === wave.id
                              ? {
                                  ...w,
                                  groups: w.groups.map((g, i) =>
                                    i === gi ? { ...g, enemyId: enemy.id } : g,
                                  ),
                                }
                              : w,
                          ),
                        },
                        'Set wave actor',
                      );
                    }}
                  >
                    {[
                      ...new Map(
                        [...config.enemies, ...(catalog?.enemies ?? [])].map((enemy) => [enemy.id, enemy]),
                      ).values(),
                    ].map((enemy) => (
                      <option key={enemy.id} value={enemy.id}>
                        {enemy.name}
                      </option>
                    ))}
                  </select>
                  <NumberField
                    label={`Wave ${index + 1} enemy ${gi + 1} count`}
                    value={group.count}
                    min={1}
                    max={4096}
                    step={1}
                    onCommit={(value) =>
                      change(
                        {
                          ...config,
                          waves: config.waves.map((w) =>
                            w.id === wave.id
                              ? {
                                  ...w,
                                  groups: w.groups.map((g, i) =>
                                    i === gi ? { ...g, count: Math.round(value) } : g,
                                  ),
                                }
                              : w,
                          ),
                        },
                        'Set wave enemy count',
                      )
                    }
                  />
                  <button
                    aria-label={`Remove enemy group ${gi + 1} from wave ${index + 1}`}
                    onClick={() =>
                      change(
                        {
                          ...config,
                          waves: config.waves.map((w) =>
                            w.id === wave.id ? { ...w, groups: w.groups.filter((_, i) => i !== gi) } : w,
                          ),
                        },
                        'Remove wave enemy group',
                      )
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div className="forge-wave-footer">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={wave.boss}
                    onChange={(e) =>
                      change(
                        {
                          ...config,
                          waves: config.waves.map((w) =>
                            w.id === wave.id ? { ...w, boss: e.target.checked } : w,
                          ),
                        },
                        'Set boss wave',
                      )
                    }
                  />
                  Boss
                </label>
                <button
                  className="small-button"
                  onClick={() =>
                    change(
                      {
                        ...config,
                        waves: config.waves.map((w) =>
                          w.id === wave.id
                            ? { ...w, groups: [...w.groups, { enemyId: config.enemies[0].id, count: 3 }] }
                            : w,
                        ),
                      },
                      'Add wave enemy group',
                    )
                  }
                >
                  Add group
                </button>
              </div>
            </article>
          ))}
          <div className="forge-panel-heading">
            <h3>AI spawn zones</h3>
            <button
              className="small-button"
              onClick={() =>
                change(
                  {
                    ...config,
                    spawnZones: [
                      ...config.spawnZones,
                      { id: crypto.randomUUID(), position: [0, 0, 0.2], radius: 2, enabled: true },
                    ],
                  },
                  'Add AI spawn zone',
                )
              }
            >
              <Plus size={13} />
              Zone
            </button>
          </div>
          {config.spawnZones.map((zone, index) => (
            <div className={`forge-zone ${zone.id === selectedZone ? 'selected' : ''}`} key={zone.id}>
              <div className="forge-panel-heading">
                <button className="text-button" onClick={() => onSelectZone?.(zone.id)}>
                  <Flag size={13} />
                  Zone {index + 1}
                </button>
                <button
                  aria-label={`Remove AI zone ${index + 1}`}
                  onClick={() =>
                    change(
                      { ...config, spawnZones: config.spawnZones.filter((z) => z.id !== zone.id) },
                      'Remove AI spawn zone',
                    )
                  }
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="forge-vector">
                {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                  <label key={axis}>
                    {axis}
                    <NumberField
                      label={`AI zone ${index + 1} ${axis}`}
                      value={zone.position[i]}
                      min={-2048}
                      max={2048}
                      onCommit={(value) => {
                        const position = [...zone.position] as SpawnZone['position'];
                        position[i] = value;
                        updateZone(zone.id, { position });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="forge-field">
                Radius
                <NumberField
                  label={`AI zone ${index + 1} radius`}
                  value={zone.radius}
                  min={0.1}
                  max={100}
                  onCommit={(radius) => updateZone(zone.id, { radius })}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={zone.enabled}
                  onChange={(e) => updateZone(zone.id, { enabled: e.target.checked })}
                />
                Enabled in rules
              </label>
            </div>
          ))}
          <div className="analysis-actions">
            <button disabled={busy} onClick={() => void run('validate')}>
              <ShieldCheck size={14} />
              Validate rules & actors
            </button>
            <button disabled={busy} onClick={() => void run('preview')}>
              <Play size={14} />
              Preview rule sequence
            </button>
          </div>
          {validation && (
            <div className="forge-rule-result">
              <Pill tone={validation.valid ? 'green' : 'amber'}>
                {validation.valid ? 'Authoring validation passed' : 'Authoring validation blocked'}
              </Pill>
              <p>Runtime integration: not connected.</p>
              {validation.diagnostics.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
              {validation.missingActorVariants.map((path) => (
                <code key={path}>Missing actor: {path}</code>
              ))}
              {validation.missingEquipment.map((path) => (
                <code key={path}>Missing equipment: {path}</code>
              ))}
            </div>
          )}
          {simulation && (
            <section className="forge-rule-result">
              <h3>Offline rules preview</h3>
              <p>Scripted virtual spawn/kill events · no gameplay or network verification.</p>
              <Pill>{simulation.state.phase}</Pill>
              <p>
                Wave {simulation.state.waveNumber} · round {simulation.state.roundNumber} · virtual score{' '}
                {simulation.state.score}
              </p>
              <ol>
                {simulation.events.slice(0, 100).map((event, i) => (
                  <li key={i}>
                    <time>{(event.atMs / 1000).toFixed(1)}s</time>
                    <strong>{event.kind}</strong>
                    <span>{event.detail}</span>
                  </li>
                ))}
              </ol>
              {simulation.events.length > 100 && (
                <small>Showing the first 100 of {simulation.events.length} events.</small>
              )}
              {simulation.diagnostics.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
