import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowRight,
  AudioLines,
  Box,
  Code2,
  FolderOpen,
  Globe2,
  Info,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
  Waypoints,
} from 'lucide-react';
import type { Bootstrap, MapInspection, MeshData, Project, Settings } from '../types';
import { call } from '../api';
import { formatNumber } from '../editor';
import { Empty, Notice, PageTitle, Pill } from './ui';
function PreviewMesh({ mesh }: { mesh: MeshData }) {
  const g = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    g.setIndex(mesh.indices);
    g.computeVertexNormals();
    return g;
  }, [mesh]);
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh geometry={g}>
      <meshStandardMaterial color="#78b7bc" roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}
export function Assets({
  project,
  meshes,
  onImport,
  onWorld,
}: {
  project: Project;
  meshes: Record<string, MeshData>;
  onImport: () => void;
  onWorld: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(project.assets[0]?.id ?? null);
  const asset = project.assets.find((a) => a.id === chosen) ?? project.assets.at(-1);
  const mesh = asset ? meshes[asset.id] : undefined;
  return (
    <div className="workshop-page">
      <PageTitle
        eyebrow="ASSET WORKSHOP"
        title="Give an idea some shape."
        description="Ingest and inspect your own geometry in a persistent local workspace."
        actions={
          <>
            <button onClick={onWorld}>
              <Box size={15} />
              Place in scene
            </button>
            <button className="primary" onClick={onImport}>
              <Upload size={15} />
              Import OBJ
            </button>
          </>
        }
      />
      <Notice tone="info">
        OBJ mesh ingestion and previews are implemented. UV presence and material names are indexed. Halo
        render/collision tag generation, glTF, textures, animation and audio decoding are not implemented.
      </Notice>
      {project.assets.length ? (
        <div className="asset-layout">
          <div className="surface asset-list">
            {project.assets.map((a) => (
              <button
                key={a.id}
                className={a.id === asset?.id ? 'asset-item selected' : 'asset-item'}
                onClick={() => setChosen(a.id)}
              >
                <Box size={21} />
                <span>
                  <strong>{a.name}</strong>
                  <small>{formatNumber(a.triangles)} triangles</small>
                </span>
                <Pill>OBJ</Pill>
              </button>
            ))}
          </div>
          <div className="asset-preview surface">
            {mesh ? (
              <Canvas camera={{ position: [8, -8, 8], up: [0, 0, 1], fov: 50 }}>
                <color attach="background" args={['#101820']} />
                <ambientLight intensity={1.6} />
                <directionalLight position={[10, -10, 20]} intensity={2} />
                <Bounds fit clip observe margin={1.5}>
                  <PreviewMesh mesh={mesh} />
                </Bounds>
                <OrbitControls makeDefault />
              </Canvas>
            ) : (
              <div className="loading">Loading geometry…</div>
            )}
            <span className="asset-preview-label">Imported geometry · drag to orbit</span>
          </div>
          <div className="surface asset-details">
            <div className="section-label">Mesh inspection</div>
            <h3>{asset?.name}</h3>
            <dl>
              <dt>Vertices</dt>
              <dd>{formatNumber(asset?.vertices ?? 0)}</dd>
              <dt>Triangles</dt>
              <dd>{formatNumber(asset?.triangles ?? 0)}</dd>
              <dt>UV data</dt>
              <dd>{asset?.hasUvs ? 'Present · indexed only' : 'Not found'}</dd>
              <dt>Materials</dt>
              <dd>{asset?.materials.length ?? 0} named</dd>
            </dl>
            {asset?.materials.map((m) => (
              <Pill key={m}>{m}</Pill>
            ))}
            <div className="section-label">Integrity</div>
            <code className="checksum">{asset?.sha256}</code>
            <p className="subtle">
              Source geometry is copied into the project. It is not yet compiled into Halo asset tags.
            </p>
          </div>
        </div>
      ) : (
        <Empty icon={<Box size={32} />} title="Your geometry belongs here">
          Import a Wavefront OBJ to inspect its mesh, place it in a 3D scene, and save your work.
          <button className="primary" onClick={onImport}>
            <Plus size={15} />
            Import your first mesh
          </button>
        </Empty>
      )}
    </div>
  );
}
export function Scenario({ inspection, onWorld }: { inspection: MapInspection | null; onWorld: () => void }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(0);
  const encounters =
    inspection?.encounters.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) ?? [];
  const active = encounters[chosen] ?? encounters[0];
  return (
    <div className="scenario-page">
      <PageTitle
        eyebrow="AI & SCENARIO"
        title="See what makes a world tick."
        description="Inspect the encounters, squads, and compiled script index stored in your map."
        actions={
          <button onClick={onWorld}>
            <Waypoints size={15} />
            Open placements
          </button>
        }
      />
      <Notice>
        This workspace currently inspects AI and script metadata. Wave editing, script compilation, AI
        simulation, and multiplayer AI replication are not implemented.
      </Notice>
      <div className="scenario-stats">
        <div className="surface">
          <Users size={21} />
          <strong>{inspection?.encounters.length ?? 0}</strong>
          <span>AI encounters</span>
        </div>
        <div className="surface">
          <Network size={21} />
          <strong>{inspection?.encounters.reduce((n, e) => n + e.squads.length, 0) ?? 0}</strong>
          <span>Squads indexed</span>
        </div>
        <div className="surface">
          <Code2 size={21} />
          <strong>{inspection?.scripts.length ?? 0}</strong>
          <span>Compiled scripts</span>
        </div>
        <div className="surface">
          <Waypoints size={21} />
          <strong>{inspection?.objects.filter((o) => o.kind === 'Player spawn').length ?? 0}</strong>
          <span>Player spawns</span>
        </div>
      </div>
      <div className="scenario-columns">
        <section className="surface">
          <div className="section-heading">
            <h3>Encounter hierarchy</h3>
            <Pill>Read only</Pill>
          </div>
          <div className="panel-search">
            <Search size={14} />
            <input
              aria-label="Search encounters"
              placeholder="Find an encounter…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChosen(0);
              }}
            />
          </div>
          <div className="encounter-list">
            {encounters.map((e, i) => (
              <button
                key={e.name + i}
                className={e === active ? 'selected' : ''}
                onClick={() => setChosen(i)}
              >
                <Users size={14} />
                <span>{e.name}</span>
                <Pill>{e.squads.length}</Pill>
              </button>
            ))}
            {!encounters.length && <p className="subtle">No indexed encounters match this map or search.</p>}
          </div>
        </section>
        <section className="surface">
          <div className="section-label">Selected encounter</div>
          <h2>{active?.name ?? 'No encounter selected'}</h2>
          {active && (
            <>
              <Pill>Team {active.team}</Pill>
              <h3 className="spaced">Squads</h3>
              {active.squads.map((s, i) => (
                <div className="squad-row" key={i}>
                  <Users size={14} />
                  <span>{s || `Unnamed squad ${i + 1}`}</span>
                  <Pill>Source data</Pill>
                </div>
              ))}
            </>
          )}
          <Notice tone="info">
            Original Halo PC multiplayer does not automatically synchronize arbitrary AI. Native runtimes need
            separate protocol and multi-client validation.
          </Notice>
        </section>
        <section className="surface">
          <div className="section-heading">
            <h3>Script index</h3>
            <Pill>Compiled metadata</Pill>
          </div>
          <div className="script-list">
            {inspection?.scripts.map((s, i) => (
              <div key={i}>
                <Code2 size={13} />
                <span>{s.name}</span>
                <code>
                  {s.scriptType}:{s.returnType}
                </code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
export function Preservation({ project, edit }: { project: Project; edit: (p: Project, d: string) => void }) {
  const v = project.provenance;
  return (
    <div className="preservation-page">
      <PageTitle
        eyebrow="COMMUNITY & PRESERVATION"
        title="Keep the story with the map."
        description="A record of the creator, community, source, and permission to preserve their work."
      />
      <div className="preservation-columns">
        <section className="surface metadata-form">
          <div className="section-heading">
            <h3>Archive record</h3>
            <Pill>Saved with project</Pill>
          </div>
          <label>
            Original mod title
            <input
              value={project.title}
              maxLength={200}
              onChange={(e) => edit({ ...project, title: e.target.value }, 'Update project title')}
            />
          </label>
          <div className="form-grid">
            <label>
              Creator
              <input
                placeholder="e.g. Fonzie / Fonzeh"
                value={v.creator}
                maxLength={256}
                onChange={(e) =>
                  edit(
                    { ...project, provenance: { ...v, creator: e.target.value } },
                    'Update creator attribution',
                  )
                }
              />
            </label>
            <label>
              Community / source
              <input
                placeholder="e.g. MacGamingMods"
                value={v.community}
                maxLength={256}
                onChange={(e) =>
                  edit(
                    { ...project, provenance: { ...v, community: e.target.value } },
                    'Update source community',
                  )
                }
              />
            </label>
            <label>
              Release year
              <input
                type="number"
                placeholder="Unknown"
                min={1990}
                max={2100}
                value={v.releaseYear ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!e.target.value || (Number.isInteger(n) && n >= 1990 && n <= 2100))
                    edit(
                      { ...project, provenance: { ...v, releaseYear: e.target.value ? n : null } },
                      'Update release year',
                    );
                }}
              />
            </label>
            <label>
              Original runtime
              <input readOnly value={project.source?.engine ?? 'Asset workspace'} />
            </label>
          </div>
          <label>
            Description
            <textarea
              rows={4}
              maxLength={10000}
              value={v.description}
              onChange={(e) =>
                edit(
                  { ...project, provenance: { ...v, description: e.target.value } },
                  'Update archive description',
                )
              }
            />
          </label>
          <label>
            Source URL
            <input
              placeholder="https://…"
              maxLength={2048}
              value={v.sourceUrl}
              onChange={(e) =>
                edit({ ...project, provenance: { ...v, sourceUrl: e.target.value } }, 'Update source URL')
              }
            />
          </label>
          <label>
            Attribution &amp; permissions
            <textarea
              rows={3}
              placeholder="Record the creator’s permissions. Import does not authorize redistribution."
              maxLength={10000}
              value={v.permissions}
              onChange={(e) =>
                edit(
                  { ...project, provenance: { ...v, permissions: e.target.value } },
                  'Update permissions record',
                )
              }
            />
          </label>
        </section>
        <aside>
          <section className="surface">
            <ShieldCheck size={26} className="accent" />
            <h3>Preserved at the source</h3>
            <p className="subtle">
              The original map and its checksum stay attached to this project. Editor changes are stored
              separately.
            </p>
            <div className="section-label">SHA-256</div>
            <code className="checksum">{project.source?.sha256 ?? 'No Halo source cache'}</code>
            <div className="section-label">Original path</div>
            <code className="path-text">{project.source?.originalPath ?? 'Asset workspace'}</code>
          </section>
          <section className="surface restoration-note">
            <Pill tone="amber">Flagship restoration · pending</Pill>
            <h3>Zombie Apocalypse</h3>
            <p>
              Imported candidates retain their actual cache family and creator attribution. Restoration
              requires a validated build, official package metadata, and an in-game MCC load test.
            </p>
            <small>No acceptance result has been simulated.</small>
          </section>
        </aside>
      </div>
    </div>
  );
}
export function Preferences({
  data,
  onApply,
  onAction,
}: {
  data: Bootstrap;
  onApply: (s: Settings) => Promise<void>;
  onAction: (f: () => Promise<unknown>, s?: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(data.settings);
  useEffect(() => setDraft(data.settings), [data.settings]);
  const rows: [keyof Settings, string, string][] = [
    [
      'steamDirectory',
      'Steam installation',
      'Optional override. Non-default libraries are read from libraryfolders.vdf.',
    ],
    [
      'mccDirectory',
      'MCC installation',
      'Folder containing halo1. Guilty Spark creates its own Inbox and Mods subfolders.',
    ],
    [
      'invaderDirectory',
      'Invader utilities',
      'A separately installed folder containing invader-info, invader-extract and invader-build.',
    ],
    [
      'resourceDirectory',
      'Original resource maps',
      'The source runtime’s bitmaps.map, sounds.map and loc.map. Do not substitute unrelated engine resources.',
    ],
    [
      'metadataTemplateDirectory',
      'Official Excession metadata',
      'An unpublished Halo1 package configured for the exact scenario. Its map metadata is preserved.',
    ],
    [
      'nativeExecutable',
      'Native runtime executable',
      'Launch a user-installed ChupathingyCE / OpenCE executable. Deployment and runtime capabilities are unverified.',
    ],
  ];
  return (
    <div className="settings-page">
      <PageTitle
        eyebrow="PREFERENCES & RUNTIMES"
        title="A workbench that knows its limits."
        description="Connect installed tools and runtimes. All paths and integrations stay local."
        actions={
          <button className="primary" onClick={() => void onApply(draft)}>
            Apply preferences
          </button>
        }
      />
      <div className="settings-columns">
        <section className="surface path-settings">
          <h3>Tool &amp; runtime paths</h3>
          {rows.map(([key, title, description]) => (
            <div className="setting-row" key={key}>
              <label>{title}</label>
              <p>{description}</p>
              <div>
                <input
                  aria-label={title}
                  value={(draft[key] as string | null) ?? ''}
                  placeholder={
                    key === 'steamDirectory'
                      ? (data.installation.steamPath ?? 'Auto-detect')
                      : key === 'mccDirectory'
                        ? (data.installation.mccPath ?? 'Auto-detect')
                        : 'Choose an installed folder or executable'
                  }
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
                />
                <button
                  onClick={() =>
                    void onAction(async () => {
                      const chosen = await call<string | null>('choose_setting_path', { key });
                      if (chosen) setDraft((d) => ({ ...d, [key]: chosen }));
                    })
                  }
                >
                  <FolderOpen size={15} />
                  Browse
                </button>
              </div>
            </div>
          ))}
          <label className="toggle-setting">
            <input
              type="checkbox"
              checked={draft.autoBuild}
              onChange={(e) => setDraft({ ...draft, autoBuild: e.target.checked })}
            />
            <span>
              <strong>Attempt conversion after Inbox import</strong>
              <small>Missing tools or source resources produce a clear build blocker.</small>
            </span>
          </label>
          <button className="primary" onClick={() => void onApply(draft)}>
            Apply preferences
          </button>
        </section>
        <aside>
          <section className="surface">
            <div className="section-heading">
              <h3>
                <Globe2 size={16} />
                Runtime capabilities
              </h3>
            </div>
            <div className="capability-item">
              <strong>Steam MCC · Halo 1</strong>
              <Pill tone="green">Local package adapter</Pill>
              <p>
                Invader conversion, official-template packaging, manifest registration, and normal Steam
                launch. In-game verification is pending.
              </p>
            </div>
            <div className="capability-item">
              <strong>ChupathingyCE / OpenCE</strong>
              <Pill>External launcher only</Pill>
              <p>
                Separately installed runtimes. Their map families and network versions differ; no engine code
                is embedded.
              </p>
              <button
                className="small-button"
                disabled={!data.settings.nativeExecutable}
                onClick={() => void onAction(() => call('launch_native'))}
              >
                Open configured runtime
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="capability-item">
              <strong>Live editing · AI replication · VR</strong>
              <Pill tone="amber">Not implemented</Pill>
              <p>
                The core contains a versioned command validation model. No game bridge, network transport, or
                OpenXR integration is connected.
              </p>
            </div>
          </section>
          <section className="surface">
            <h3>
              <Info size={16} />
              Local data
            </h3>
            <code className="path-text">{data.dataDirectory}</code>
            <button
              className="small-button"
              onClick={() => void onAction(() => call('reveal_folder', { kind: 'data' }))}
            >
              <FolderOpen size={14} />
              Open data folder
            </button>
            <p className="subtle">
              SQLite library, immutable imports, project files, build jobs, and structured logs. No telemetry
              or automatic uploads.
            </p>
          </section>
          {[...data.diagnostics, ...data.installation.diagnostics].map((d, i) => (
            <Notice key={i}>{d}</Notice>
          ))}
        </aside>
      </div>
    </div>
  );
}
