import {runtimeNames} from '../runtimeWorkbench';
import { useState } from 'react';
import { call, native } from '../api';
import { useMapState } from '../mapSession';
import type { EngineBuildTarget, Project, RuntimeId, Settings } from '../types';
export default function BuildTargets({
  project,
  onChange,
  defaults,
}: {
  project: Project;
  onChange: (p: Project) => void;
  defaults?: Settings;
}) {
  const [error, setError] = useState('');
  const [newRuntime,setNewRuntime]=useState<RuntimeId>(defaults?.preferredHalo??'mccSteam');
  const [open, setOpen] = useMapState(project.id, 'tools.targetsOpen', false);
  const targets = project.buildTargets ?? [];
  const active = targets.find((t) => t.id === project.activeBuildTarget);
  function update(target: EngineBuildTarget, change: Partial<EngineBuildTarget>) {
    onChange({
      ...project,
      buildTargets: targets.map((t) => (t.id === target.id ? { ...t, ...change } : t)),
    });
  }
  function add(runtimeId: RuntimeId) {
    const id = crypto.randomUUID();
    onChange({
      ...project,
      buildTargets: [
        ...targets,
        {
          id,
          name: runtimeNames[runtimeId],
          runtimeId,
          builder: runtimeId === 'mccSteam' ? 'h1a-tool' : runtimeId==='haloCustomEdition'?'invader-ce':'unsupported',
          hekDirectory:
            defaults?.hekFlavor === (runtimeId === 'mccSteam' ? 'h1aEk' : 'legacyHek')
              ? (defaults.hekDirectory ?? null)
              : null,
          hekFlavor: runtimeId === 'mccSteam' ? 'h1aEk' : runtimeId==='haloCustomEdition'?'legacyHek':null,
          tagsDirectory:
            defaults?.hekFlavor === (runtimeId === 'mccSteam' ? 'h1aEk' : 'legacyHek')
              ? (defaults.hekTagsDirectory ?? null)
              : null,
          invaderDirectory: defaults?.invaderDirectory ?? null,
          ceCompatibleTagset: false,
          openSauce: false,
        },
      ],
      activeBuildTarget: project.activeBuildTarget ?? id,
    });
  }
  async function browse(t: EngineBuildTarget, key: 'hekDirectory' | 'tagsDirectory' | 'invaderDirectory') {
    try {
      const p = await call<string | null>('choose_setting_path', {
        key: key === 'tagsDirectory' ? 'hekTagsDirectory' : key,
      });
      if (p) update(t, { [key]: p });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <details className="gs-build-targets" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Engine build targets · {targets.length} configured{active ? ` · ${active.name} selected` : ''}
      </summary>
      <p>
        Keep a separate editable tagset and tool configuration for each engine. Every build uses a fresh
        job/output folder. Existing projects continue to use Settings until a target is selected.
      </p>
      <div className="analysis-actions"><label>Target runtime<select aria-label="New engine target runtime" value={newRuntime} onChange={e=>setNewRuntime(e.target.value as RuntimeId)}>{Object.entries(runtimeNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><button className="small-button" disabled={targets.length>=16} onClick={()=>add(newRuntime)}>Add runtime target</button></div>
      {targets.map((t) => (
        <fieldset key={t.id}>
          <legend>
            {t.name} {t.id === active?.id ? '· selected' : ''}
          </legend>
          <label>
            Target name
            <input value={t.name} maxLength={100} onChange={(e) => update(t, { name: e.target.value })} />
          </label>
          <p>
            {t.builder==='unsupported'?'Runtime profile saved independently. Native cache compilation for this runtime still needs a verified adapter; installed tools and inspection remain available.':t.runtimeId === 'mccSteam'
              ? 'MCC H1A Tool compiles the native tags to classic MCC cache version 13.'
              : 'Compatible CE source + Invader gbx-custom output (cache version 609). MCC map binaries cannot be copied directly into CE.'}
          </p>
          {t.builder === 'invader-mcc' && (
            <button onClick={() => update(t, { builder: 'h1a-tool' })}>
              Use native H1A Tool for this MCC target
            </button>
          )}
          <label>
            Authoring kit generation
            <select
              value={t.hekFlavor ?? ''}
              onChange={(e) => update(t, { hekFlavor: e.target.value as EngineBuildTarget['hekFlavor'] })}
            >
              <option value="">Choose a compatible authoring kit</option><option value="h1aEk">MCC H1A kit</option>
              {t.runtimeId !== 'mccSteam' && <option value="legacyHek">Legacy CE HEK</option>}
            </select>
          </label>
          {(['hekDirectory', 'tagsDirectory', 'invaderDirectory'] as const).map((key) => (
            <label key={key}>
              {key === 'hekDirectory'
                ? 'Map Builder folder'
                : key === 'tagsDirectory'
                  ? 'Editable Halo Tags folder'
                  : 'Invader folder'}
              <input value={t[key] ?? ''} onChange={(e) => update(t, { [key]: e.target.value || null })} />
              <button className="small-button" disabled={!native} onClick={() => void browse(t, key)}>
                Browse {key === 'tagsDirectory' ? 'tags' : key === 'hekDirectory' ? 'kit' : 'Invader'}
              </button>
            </label>
          ))}
          {t.runtimeId === 'haloCustomEdition' && (
            <label>
              <input
                type="checkbox"
                checked={t.ceCompatibleTagset}
                onChange={(e) => update(t, { ceCompatibleTagset: e.target.checked })}
              />{' '}
              I selected a CE base tagset and reviewed MCC-only fields, shaders, scripts and limits.
              Compilation and game testing are still required.
            </label>
          )}
          <button
            className="small-button"
            onClick={() =>
              onChange({
                ...project,
                activeBuildTarget: t.id,
                quickForge: project.quickForge
                  ? { ...project.quickForge, runtimeId: t.runtimeId }
                  : project.quickForge,
              })
            }
          >
            Use this target
          </button>
          {defaults && (
            <button
              className="small-button"
              disabled={defaults.hekFlavor !== t.hekFlavor}
              onClick={() =>
                update(t, {
                  hekDirectory: defaults.hekDirectory ?? null,
                  tagsDirectory: defaults.hekTagsDirectory ?? null,
                  invaderDirectory: defaults.invaderDirectory ?? null,
                })
              }
            >
              Copy default tools into this profile
            </button>
          )}
          <button
            className="small-button"
            onClick={() =>
              onChange({
                ...project,
                buildTargets: targets.filter((x) => x.id !== t.id),
                activeBuildTarget: project.activeBuildTarget === t.id ? null : project.activeBuildTarget,
              })
            }
          >
            Remove this profile
          </button>
          <small>
            Folders are configuration only. Build preflight verifies exact dependencies and tool identities
            before execution.
          </small>
        </fieldset>
      ))}
      {active && (
        <button className="small-button" onClick={() => onChange({ ...project, activeBuildTarget: null })}>
          Use default tool settings
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
