import {useWorkspaceFileActions} from './WorkspacePanels';
import { useEffect, useId, useRef, useState } from 'react';
import { Plus, ShieldCheck, Trash2, Play, Flag, Download } from 'lucide-react';
import { defaultNativePlayerProfile, reconcileFirefightSource, type NativePlayerProfile } from '../firefight';
import { beginProjectMutation } from '../projectMutation';
import { exportHaloCeFirefightRound, scriptManifest, attachNativeFirefightRound, nativeSoloFirefightRules } from '../haloScript';
import { sourceZip } from '../sourceZip';
import { call, native } from '../api';
import type { QuickForgeBuildReceipt } from '../forge';
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
  onSave,
  compact = false,
  selectedZone,
  onSelectZone,
}: {
  project: Project;
  entries: LibraryEntry[];
  edit: (project: Project, description: string) => void;
  onSave?: () => Promise<void>;
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
  const [loadedCatalog,setLoadedCatalog]=useState<{id:string;value:FirefightCatalog}|null>(null);
  const catalog=loadedCatalog?.id===sourceId?loadedCatalog.value:null;
  const [actorRemap,setActorRemap]=useState<Record<string,string>>({});
  const [weaponRemap,setWeaponRemap]=useState<Record<string,string>>({});
  const [validation, setValidation] = useState<FirefightValidation | null>(null);
  const [simulation, setSimulation] = useState<FirefightSimulation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const config = project.firefight;
  const tagKey=(path:string)=>path.replaceAll('\\','/').toLowerCase();
  const sourceMatches=!!catalog&&(!config||config.sourceSha256===catalog.defaultConfig.sourceSha256);
  const boundSource=sources.find(entry=>entry.sha256===config?.sourceSha256);
  const eligibleEnemies=sourceMatches?(catalog?.enemies??[]).filter(candidate=>!config?.enemies.some(enemy=>tagKey(enemy.actorVariantPath)===tagKey(candidate.actorVariantPath))):[];
  const missingActors=config?.enemies.filter(enemy=>catalog&&!catalog.enemies.some(candidate=>tagKey(candidate.actorVariantPath)===tagKey(enemy.actorVariantPath)))??[];
  const missingWeapons=[...new Set(config?.nativePlayerProfile?[config.nativePlayerProfile.primaryWeapon,...(config.nativePlayerProfile.secondaryWeapon?[config.nativePlayerProfile.secondaryWeapon]:[])].map(tagKey):[])]
    .filter(path=>catalog&&!(catalog.weapons??[]).some(candidate=>tagKey(candidate)===path));
  const weaponChoicesId = useId();
  const latestProject=useRef(project);latestProject.current=project;
  const activeProject=useRef<string|null>(project.id);
  useEffect(()=>{activeProject.current=project.id;return()=>{activeProject.current=null;};},[project.id]);
  const [sourceExport,setSourceExport]=useState<{receipt:QuickForgeBuildReceipt;input:Project}|null>(null);
  const prepared=!!project.quickForge&&!project.quickForge.native&&project.quickForge.gameMode==='firefight'&&
    !!project.quickForge.logic?.handwrittenSources?.some(source=>source.filename==='gs_firefight.hsc');
  const canExportSources=native&&!!onSave&&prepared&&!busy;
  const sourceExportHint=!native?'Native source export is available in the desktop app.':!onSave?'Use the owning editable window and wait for the active build to finish.':!prepared?'Use solo native rules, review the loadout, then Prepare native solo round in this editable level.':'Saves this map and exports geometry, scenario commands, dependencies and HaloScript. Source export does not compile or launch Halo.';
  const staleExport=!!sourceExport&&(sourceExport.receipt.current===false||sourceExport.input.quickForge!==project.quickForge||sourceExport.input.firefight!==config);
  useWorkspaceFileActions('firefight:'+project.id,config?[
    {id:'firefight-round-source',label:'Export native Firefight round sources…',hint:sourceExportHint,disabled:!canExportSources,run:()=>void exportNativeRound()},
    {id:'firefight-script-plan',label:'Export Firefight script & encounter plan…',hint:'Advanced authoring ZIP only; no generated scenario or playable cache.',disabled:busy,run:()=>exportRound()},
  ]:[]);
  useEffect(()=>{
    let alive=true;setSourceExport(null);
    if(native&&project.quickForge)void call<QuickForgeBuildReceipt|null>('quickforge_build_report',{projectId:project.id})
      .then(receipt=>{if(alive&&receipt?.status==='exported'&&receipt.sources)setSourceExport(previous=>previous??{receipt,input:project});})
      .catch(problem=>{if(alive)setError('Previous source export could not be read: '+String(problem));});
    return()=>{alive=false;};
  },[project.id]);
  useEffect(() => {
    let alive = true;
    setLoadedCatalog(null);
    setError('');
    if (!sourceId) return;
    call<FirefightCatalog>('firefight_catalog', { sourceProjectId: sourceId })
      .then((result) => {
        if (alive) setLoadedCatalog({id:sourceId,value:result});
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
  }, [config,sourceId]);
  useEffect(()=>{setActorRemap({});setWeaponRemap({});},[sourceId,config?.sourceSha256]);
  function change(next: FirefightConfig, description: string) {
    edit({ ...project, firefight: next }, description);
  }
  function playerProfile(patch:Partial<NativePlayerProfile>) {
    if(config?.nativePlayerProfile)change({...config,nativePlayerProfile:{...config.nativePlayerProfile,...patch}},'Edit native player loadout');
  }
  function begin(next?: FirefightConfig) {
    if (!catalog || busy) return;
    if (next) {
      change(next, 'Create Firefight authoring rules');
      return;
    }
    const sourceActor = catalog.enemies[0];
    if (!sourceActor) {
      setError('This source contains no audited actor-variant tags. Import a map with actual actv content.');
      return;
    }
    const first = {...sourceActor,id:crypto.randomUUID()};
    const spawn = project.quickForge?.spawns[0]?.position ?? [0, 0, 0.2];
    change(
      {
        ...catalog.defaultConfig,
        title: `${project.title} · Firefight`,
        sourceSha256: catalog.defaultConfig.sourceSha256,
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
      if (kind === 'validate') {
        const result=await call<FirefightValidation>('firefight_validate',{config,sourceProjectId:sourceId||undefined});
        if(latestProject.current.firefight!==config)throw Error('Rules changed during validation. Validate the current rules again.');
        setValidation(result);
      } else {
        const result=await call<FirefightSimulation>('firefight_preview',{config,completedWaves:1});
        if(latestProject.current.firefight!==config)throw Error('Rules changed during preview. Preview the current rules again.');
        setSimulation(result);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function adoptSource() {
    if(!config||!catalog||busy)return;
    if(native&&!onSave){setError('Use the owning editable window and wait for the current build before changing the rules source.');return;}
    let candidate:FirefightConfig;
    try{candidate=reconcileFirefightSource(config,catalog,actorRemap,weaponRemap);}
    catch(problem){setError(String(problem));return;}
    const release=beginProjectMutation(project.id);
    setBusy(true);setError('');
    try {
      const review=await call<FirefightValidation>('firefight_validate',{config:candidate,sourceProjectId:sourceId});
      if(activeProject.current!==project.id||latestProject.current.id!==project.id||latestProject.current.firefight!==config)
        throw Error('The project closed or its rules changed during source review. Review again; no old rules were reapplied.');
      if(!review.valid||!review.sourceMatches||review.missingActorVariants.length||review.missingEquipment.length)
        throw Error(['Source review blocked. Keep the existing rules until the selected assets and rules validate.',...review.diagnostics,...review.missingActorVariants,...review.missingEquipment].join(' '));
      edit({...latestProject.current,firefight:candidate},'Reconcile Firefight actor and loadout source');
    } catch(problem){setError(String(problem));}finally{release();setBusy(false);}
  }
  function prepareNativeRound() {
    try {
      edit(attachNativeFirefightRound(project), 'Prepare native solo Firefight encounters and script');
      setError('');
    } catch (error) { setError(String(error)); }
  }
  async function exportNativeRound() {
    if(!canExportSources||!onSave)return;
    const input=project;
    setBusy(true);setError('');
    try {
      await onSave();
      if(latestProject.current.quickForge!==input.quickForge||latestProject.current.firefight!==input.firefight)
        throw Error('The round or geometry changed while saving. Prepare the intended round, then export again.');
      const receipt=await call<QuickForgeBuildReceipt>('quickforge_export',{projectId:input.id,expectedProject:input});
      setSourceExport({receipt,input});
      if(receipt.status!=='exported'||!receipt.sources||receipt.blockers.length)
        setError(receipt.blockers.join(' | ')||'Source export did not finish. Inspect its job diagnostics; no compiled map was created.');
    } catch(problem){setError(String(problem));}finally{setBusy(false);}
  }
  function exportRound() {
    if(!config)return;
    try {
      const source=exportHaloCeFirefightRound(config);
      const bytes=sourceZip([{name:source.filename,contents:source.content},
        {name:'native-round.json',contents:scriptManifest(source)},
        {name:'encounter-plan.json',contents:JSON.stringify({scenarioType:'singleplayer',sourceSha256:config.sourceSha256,enemies:config.enemies,
          spawnZones:config.spawnZones,waves:config.waves,nativePlayerProfile:config.nativePlayerProfile??null,dependencies:source.dependencies,compiled:false,gameplayVerified:false},null,2)}]);
      const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/zip'}));
      const link=document.createElement('a');link.href=url;link.download='spark-firefight-script-plan.zip';
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);setError('');
    }catch(error){setError(String(error));}
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
      <div className="firefight-setup">
      <Notice tone="info">
        Authoring rules only. No live game bridge or two-client AI synchronization is connected. The rules
        preview uses scripted virtual spawns and kills.
      </Notice>
      <label className="forge-field">
        Actor source map
        <select
          aria-label="Firefight actor source"
          disabled={busy}
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
      {config&&<p className="subtle">Rules source: {boundSource?.title??(config.sourceSha256?config.sourceSha256.slice(0,12)+'…':'not bound')}. Browsing another map does not change these rules.</p>}
      {config&&catalog&&!sourceMatches&&<details open className="forge-details">
        <summary>Review a different actor source</summary>
        <p className="subtle">Keep your waves, zones, counts, scores and authored IDs. Choose replacements for missing assets below, then explicitly apply this source. Native dependencies still need their own extraction/build path.</p>
        {boundSource&&<button disabled={busy} onClick={()=>setSourceId(boundSource.id)}>Return to rules source</button>}
        {missingActors.map(enemy=><label className="forge-field" key={enemy.id}>Replace {enemy.name}<code className="wrap-code">{enemy.actorVariantPath}</code>
          <select aria-label={'Source replacement for '+enemy.name} disabled={busy} value={actorRemap[enemy.id]??''} onChange={event=>setActorRemap(old=>({...old,[enemy.id]:event.target.value}))}>
            <option value="" disabled>Choose an actor from this source</option>
            {catalog.enemies.map(candidate=><option key={candidate.id} value={candidate.actorVariantPath}>{candidate.name} · {candidate.actorVariantPath}</option>)}
          </select>
        </label>)}
        {missingWeapons.map(path=><label className="forge-field" key={path}>Replace starting weapon<code className="wrap-code">{path}</code>
          <select aria-label={'Source replacement weapon '+path} disabled={busy} value={weaponRemap[path]??''} onChange={event=>setWeaponRemap(old=>({...old,[path]:event.target.value}))}>
            <option value="" disabled>Choose a weapon from this source</option>
            {(catalog.weapons??[]).map(candidate=><option key={candidate} value={candidate}>{candidate}</option>)}
          </select>
        </label>)}
        <button disabled={busy||native&&!onSave} onClick={()=>void adoptSource()} title="Checks the selected map's actual actor and weapon paths, then changes the rules source as one Undo step. Scripts are not regenerated and no tags are converted.">Use this source for existing rules</button>
      </details>}
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
            <section className="forge-details firefight-presets" aria-label="Firefight presets">
              <h3>Start from a preset</h3>
              <div className="firefight-preset-grid">
              {catalog.presets.map((preset) => (
                <div className="forge-preset" key={preset.id}>
                  <button title={`${config?'Replaces current rules; Undo restores them. ':''}${preset.detail}${preset.missingActorVariants.length ? ` Missing: ${preset.missingActorVariants.join(', ')}` : ''}`} disabled={busy||!preset.config} onClick={() => begin(preset.config!)}>
                    {preset.name}
                  </button>
                  {preset.missingActorVariants.length > 0 && (
                    <small>Missing: {preset.missingActorVariants.join(', ')}</small>
                  )}
                </div>
              ))}
              </div><details className="firefight-preset-notes"><summary>Preset credits &amp; requirements</summary>{catalog.presets.map(preset=><p key={preset.id}><strong>{preset.name}</strong> · {preset.detail}</p>)}</details>
            </section>
          )}
        </>
      )}
      </div>
      {config && (
        <div className="firefight-plan">
          <section className="firefight-rules">
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
          </section><section className="firefight-waves">
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
                      const key=e.target.value;
                      const candidate=key.startsWith('catalog:')?eligibleEnemies.find(entry=>'catalog:'+entry.id===key):undefined;
                      const enemy=candidate?{...candidate,id:crypto.randomUUID()}:config.enemies.find(entry=>entry.id===key);
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
                    {config.enemies.map(enemy=><option key={enemy.id} value={enemy.id}>{enemy.name}</option>)}
                    {eligibleEnemies.length>0&&<optgroup label="Add from rules source">{eligibleEnemies.map(enemy=><option key={'catalog:'+enemy.id} value={'catalog:'+enemy.id}>{enemy.name}</option>)}</optgroup>}
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
                  <label className="forge-wave-zone">Spawn zone
                    <select aria-label={`Wave ${index + 1} enemy ${gi + 1} spawn zone`} value={group.spawnZoneId??''}
                      onChange={event=>change({...config,waves:config.waves.map(w=>w.id===wave.id?{...w,groups:w.groups.map((g,i)=>i===gi?{...g,spawnZoneId:event.target.value||undefined}:g)}:w)},'Assign wave enemy spawn zone')}>
                      <option value="">Automatic · enabled zones</option>
                      {group.spawnZoneId&&!config.spawnZones.some(zone=>zone.id===group.spawnZoneId)&&<option value={group.spawnZoneId} disabled>Missing zone · choose another</option>}
                      {config.spawnZones.map((zone,zoneIndex)=><option key={zone.id} value={zone.id} disabled={!zone.enabled}>Zone {zoneIndex+1}{zone.enabled?'':' · disabled'}</option>)}
                    </select>
                    {onSelectZone&&group.spawnZoneId&&config.spawnZones.some(zone=>zone.id===group.spawnZoneId)&&<button className="text-button" onClick={()=>onSelectZone(group.spawnZoneId!)}>Select zone in editor</button>}
                  </label>
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
          </section><section className="firefight-zones">
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
          <p className="subtle">Assign each enemy group to a zone in its wave row, or keep Automatic. Removing or disabling an assigned zone blocks native preparation until you choose a replacement.</p>
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
          </section><section className="firefight-validation">
          <details>
            <summary>Player loadout</summary>
            <p className="subtle">Starting gear for the native solo round. Choose a weapon from the selected actor source, or enter its exact tag path without an extension. Validate rules &amp; actors checks these paths; the native build also needs their matching source tags. These are normal weapon slots, not dual wielding.</p>
            <datalist id={weaponChoicesId}>{(sourceMatches?catalog?.weapons??[]:[]).map(path=><option key={path} value={path}/>)}</datalist>
            <button disabled={busy} onClick={()=>config&&change({...config,nativePlayerProfile:defaultNativePlayerProfile()},'Set pistol starting profile')}>Use pistol loadout</button>
            {config.nativePlayerProfile&&<div className="forge-rule-grid">
              <label>Primary weapon tag<input aria-label="Primary weapon tag" list={weaponChoicesId} key={'primary:'+config.nativePlayerProfile.primaryWeapon} defaultValue={config.nativePlayerProfile.primaryWeapon} maxLength={240} onBlur={event=>{if(event.target.value!==config.nativePlayerProfile?.primaryWeapon)playerProfile({primaryWeapon:event.target.value});}}/></label>
              <label>Secondary weapon tag (optional)<input aria-label="Secondary weapon tag" list={weaponChoicesId} key={'secondary:'+config.nativePlayerProfile.secondaryWeapon} defaultValue={config.nativePlayerProfile.secondaryWeapon??''} maxLength={240} onBlur={event=>{const value=event.target.value||null;if(value!==config.nativePlayerProfile?.secondaryWeapon)playerProfile(value?{secondaryWeapon:value}:{secondaryWeapon:null,secondaryLoaded:0,secondaryReserved:0});}}/></label>
              {([['primaryLoaded','Primary rounds loaded',0,32767,1],['primaryReserved','Primary rounds reserved',0,32767,1],['secondaryLoaded','Secondary rounds loaded',0,32767,1],['secondaryReserved','Secondary rounds reserved',0,32767,1],['health','Starting health',.01,1,.05],['shields','Starting shields',0,3,.1],['fragmentationGrenades','Fragmentation grenades',0,4,1],['plasmaGrenades','Plasma grenades',0,4,1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<NumberField label={label} value={config.nativePlayerProfile![key]} min={min} max={max} step={step} onCommit={value=>playerProfile({[key]:value})}/></label>)}
            </div>}
          </details>
          <div className="analysis-actions">
            <button disabled={busy} onClick={() => change(nativeSoloFirefightRules(config), 'Use solo native Firefight rules')}
              title="One player, one life, one finite round, one spawn attempt, bounded preparation/timeouts; no revives, scaling, starting-equipment overrides or resupply. Enemy groups, zones and any selected native player loadout are retained. A fresh profile starts with a pistol, ammunition, health and shields. Undo restores the previous rules.">
              Use solo native rules
            </button>
            <button disabled={busy || !project.quickForge} onClick={prepareNativeRound}
              title="Prepare a solo round with native actor encounters and startup HaloScript. Review Player loadout first. One player/life, finite waves, no scaling or supplies. Save, then use Build & playtest; compilation and gameplay remain separate checks.">
              Prepare native solo round
            </button>
            <button disabled={busy} onClick={() => void run('validate')}>
              <ShieldCheck size={14} />
              Validate rules & actors
            </button>
            <button disabled={busy} onClick={() => void run('preview')}>
              <Play size={14} />
              Preview rule sequence
            </button>
            <button disabled={!canExportSources} onClick={()=>void exportNativeRound()} title={sourceExportHint}>
              <Download size={14} />Export native round sources
            </button>
          </div>
          <details><summary>Advanced script export</summary>
            <p className="subtle">The script and encounter-plan ZIP describes authoring intent. It does not contain a generated native scenario or a playable map.</p>
            <button disabled={busy} onClick={exportRound}><Download size={14} />Export script &amp; encounter plan</button>
          </details>
          {sourceExport&&<details open><summary>{staleExport?'Previous source export · changed since export':sourceExport.receipt.status!=='exported'?'Source export · did not finish':sourceExport.receipt.blockers.length?'Source export · resolve blockers':'Source export · not compiled'}</summary>
            {sourceExport.receipt.sources&&<>
              <code className="wrap-code">{sourceExport.receipt.sources.scenarioPlanPath}</code>
              <p className="subtle">{sourceExport.receipt.sources.commands.length} construction commands · {sourceExport.receipt.sources.dependencies.length} dependency entries. Includes source geometry, HaloScript and Firefight authoring metadata. Matching editable tags and native compilation are still required.</p>
              <button onClick={()=>void call('reveal_folder',{kind:'quickforgeSources',id:project.id+':'+sourceExport.receipt.jobId}).catch(problem=>setError(String(problem)))}>Open exported source folder</button>
            </>}
            {sourceExport.receipt.blockers.map((message,index)=><p key={index}>{message}</p>)}
          </details>}
          {project.quickForge?.logic?.handwrittenSources?.some(source => source.filename === 'gs_firefight.hsc') &&
            <p role="status" className="subtle">Native solo source attached. Save and build to validate. Changed rules need preparing again; manual source edits are protected.</p>}
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
                <code key={path}>Missing equipment or starting weapon: {path}</code>
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
          </section>
        </div>
      )}
    </div>
  );
}
