import ProjectSnapshots from './ProjectSnapshots';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  ArrowRight,
  AudioLines,
  Box,
  Code2,
  Copy,
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
import { call, native } from '../api';
import { formatNumber } from '../editor';
import { exportMeshObj } from '../haloObj';
import { exportMeshJms } from '../haloJms';
import { assembleSourceMeshes } from '../meshAssembly';
import type { MeshAssembly, MeshSnapMode, FaceDirection } from '../meshAssembly';
import { downloadLocalText } from '../exportHelpers';
import { reconcileSettingsDraft } from '../settings';
import { Empty, Notice, NumberField, PageTitle, Pill } from './ui';
function PreviewMesh({ mesh }: { mesh: MeshData }) {
  const g = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    if (mesh.uvs?.length === (mesh.positions.length / 3) * 2) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs ?? [], 2));
    }
    if (mesh.normals?.length === mesh.positions.length) {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals ?? [], 3));
    } else {
      g.computeVertexNormals();
    }
    g.setIndex(mesh.indices);
    for (const part of mesh.parts ?? []) {
      // Preserve real material-group boundaries for future texture assignment.
      if (part.indexStart >= 0 && part.indexCount > 0 && part.indexStart + part.indexCount <= mesh.indices.length) {
        g.addGroup(part.indexStart, part.indexCount, 0);
      }
    }
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
  const [exchangeFeedback, setExchangeFeedback] = useState('');
  const [movingAssetId,setMovingAssetId] = useState('');
  const [alignMode,setAlignMode] = useState<MeshSnapMode>('face');
  const [alignFace,setAlignFace] = useState<FaceDirection>('x+');
  const [targetVertex,setTargetVertex] = useState(0);
  const [movingVertex,setMovingVertex] = useState(0);
  const [weldSeams,setWeldSeams] = useState(false);
  const [assembly,setAssembly] = useState<{targetId:string;movingId:string;result:MeshAssembly}|null>(null);
  const [assemblyError,setAssemblyError] = useState('');
  const asset = project.assets.find((a) => a.id === chosen) ?? project.assets.at(-1);
  const mesh = asset ? meshes[asset.id] : undefined;
  const compatible = project.assets.filter(a=>a.id!==asset?.id && !!meshes[a.id]);
  const movingAsset = compatible.find(a=>a.id===movingAssetId);
  const displayedAssembly = assembly && assembly.targetId === asset?.id && assembly.movingId === movingAssetId
    ? assembly.result : null;
  function calculateAssembly() {
    try {
      if (!asset || !mesh || !movingAsset) throw new Error('Choose two imported meshes with available geometry');
      const result=assembleSourceMeshes(mesh,meshes[movingAsset.id],{
        mode:alignMode,face:alignFace,targetVertex,movingVertex,
      },weldSeams);
      setAssembly({targetId:asset.id,movingId:movingAsset.id,result});
      setAssemblyError('');
    } catch(error) {
      setAssembly(null);setAssemblyError(String(error));
    }
  }
  function saveJms(source:MeshData,label:string,kind:'model'|'bsp-candidate') {
    try {
      const result=exportMeshJms(source,kind);
      downloadLocalText(`${label.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,48)}.jms`,result.text,'text/plain');
      setExchangeFeedback(`Saved JMS 8200 source (${result.triangles} triangles, ${result.materials.length} materials). Not a compiled Halo tag or verified map.`);
    } catch(error) {setExchangeFeedback(`JMS export rejected: ${String(error)}`);}
  }
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
            <button className="primary" title="Import an OBJ geometry source file. UVs, normals and material groups are preserved where supported; this is not a compiled Halo .tag." onClick={onImport}>
              <Upload size={15} />
              Import OBJ
            </button>
          </>
        }
      />
      <Notice tone="info">
        OBJ import now preserves vertex normals, UV seams and material-group boundaries in the preview mesh.
        External MTL textures, Halo render/collision tag generation, glTF, animation and audio decoding are not implemented.
      </Notice>
      {project.assets.length ? (
        <div className="asset-layout">
          <div className="surface asset-list">
            {project.assets.map((a) => (
              <button
                key={a.id}
                className={a.id === asset?.id ? 'asset-item selected' : 'asset-item'}
                onClick={() => {setChosen(a.id);setAssembly(null);setAssemblyError('');}}
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
                  <PreviewMesh mesh={displayedAssembly?.mesh ?? mesh} />
                </Bounds>
                <OrbitControls makeDefault />
              </Canvas>
            ) : (
              <div className="loading">Loading geometry…</div>
            )}
            <span className="asset-preview-label">{displayedAssembly ? 'Source mesh assembly · not compiled BSP' : 'Imported geometry'} · drag to orbit</span>
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
              <dd>{asset?.hasUvs ? 'Preserved in preview geometry' : 'Not found'}</dd>
              <dt>Materials</dt>
              <dd>{asset?.materials.length ?? 0} named</dd>
            </dl>
            {asset?.materials.map((m) => (
              <Pill key={m}>{m}</Pill>
            ))}
            <div className="section-label">Geometry exchange</div>
            <button type="button" className="small-button" disabled={!mesh || !asset} title="Save the selected imported mesh as source OBJ for use in another compatible project. Shader bitmaps and collision are not copied." onClick={() => {
              try {
                if (!asset || !mesh) throw new Error('Select an imported source asset');
                const result=exportMeshObj(mesh,asset.name);
                downloadLocalText(`gs_asset_${asset.id.slice(0,8)}.obj`,result.text);
                setExchangeFeedback(`Exported ${result.triangles} indexed triangles as source OBJ. No Halo tag binaries were included.`);
              } catch (error) { setExchangeFeedback(`OBJ export rejected: ${String(error)}`); }
            }}>Export selected mesh OBJ</button>
            <button type="button" className="small-button" disabled={!mesh || !asset} title="Save JMS 8200 source geometry. Run the actual target Halo compiler to produce tags and verified collision."
              onClick={() => { if(asset && mesh) saveJms(mesh,`gs_asset_${asset.id.slice(0,8)}`,'model'); }}>
              Export selected mesh JMS source
            </button>
            {exchangeFeedback && <p className="subtle" role="status">{exchangeFeedback}</p>}
            <p className="subtle">Wavefront geometry only. Import the OBJ into another Guilty Spark project with Import OBJ; shader tags and Halo collision data are not extracted.</p>
            <div className="section-label">Mesh-to-mesh snap &amp; seam welding</div>
            <p className="subtle">Select two user-imported source meshes. Face snapping is optional and explicit; welding only accepts matching, opposite-facing <strong>open</strong> edges with compatible UVs/normals.</p>
            <div className="mesh-assembly-controls">
              <label>Moving mesh
                <select aria-label="Moving source mesh" value={movingAssetId} onChange={e=>{setMovingAssetId(e.target.value);setAssembly(null);setAssemblyError('');}}>
                  <option value="">Choose a second asset</option>
                  {compatible.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label>Alignment
                <select aria-label="Mesh snap mode" value={alignMode} onChange={e=>{setAlignMode(e.target.value as MeshSnapMode);setAssembly(null);}}>
                  <option value="face">Snap bounding faces</option>
                  <option value="vertex">Snap exact vertex coordinates</option>
                </select>
              </label>
              {alignMode==='face' ? <label>Target face
                <select aria-label="Target mesh face" value={alignFace} onChange={e=>{setAlignFace(e.target.value as FaceDirection);setAssembly(null);}}>
                  {(['x+','x-','y+','y-','z+','z-'] as FaceDirection[]).map(face=><option key={face} value={face}>{face}</option>)}
                </select>
              </label> : <>
                <label>Target vertex index
                  <input type="number" aria-label="Target vertex index" min={0} step={1} value={targetVertex}
                    onChange={e=>{setTargetVertex(Number(e.target.value));setAssembly(null);}} />
                </label>
                <label>Moving vertex index
                  <input type="number" aria-label="Moving vertex index" min={0} step={1} value={movingVertex}
                    onChange={e=>{setMovingVertex(Number(e.target.value));setAssembly(null);}} />
                </label>
              </>}
              <label className="mesh-assembly-check"><input type="checkbox" aria-label="Weld matching open boundary edges"
                checked={weldSeams} title="Opt-in welding requires matching open boundary edges and compatible normals and UVs; closed BSP solids cannot be unioned safely by this tool." onChange={e=>{setWeldSeams(e.target.checked);setAssembly(null);}} />
                Weld compatible open seams (optional)</label>
              <button type="button" className="small-button" title="Compute an in-memory mesh alignment and optional seam weld, with topology reports before any export. No original file is changed." disabled={!mesh||!movingAsset} onClick={calculateAssembly}>
                Preview aligned source
              </button>
            </div>
            {assemblyError && <p className="mesh-assembly-error" role="alert">{assemblyError}</p>}
            {displayedAssembly && <div className="mesh-assembly-result" role="status">
              <p>{displayedAssembly.alignment.description}. Shift: {displayedAssembly.alignment.translation.map(v=>v.toFixed(3)).join(', ')}.</p>
              <p>{displayedAssembly.topology.triangles} triangles · {displayedAssembly.topology.boundaryEdges} open edges · {displayedAssembly.weldedEdges} seam edges joined</p>
              <div className="mesh-assembly-actions">
                <button className="small-button" onClick={()=>{
                  try {
                    const obj=exportMeshObj(displayedAssembly.mesh,`gs_joined_${asset?.name??'mesh'}`);
                    downloadLocalText('gs_aligned_meshes.obj',obj.text);
                    setExchangeFeedback(`Exported aligned OBJ (${obj.triangles} triangles). Source geometry only.`);
                  } catch(error){setExchangeFeedback(`Assembly OBJ export rejected: ${String(error)}`);}
                }}>Export aligned OBJ</button>
                <button className="small-button" onClick={()=>saveJms(displayedAssembly.mesh,'gs_aligned_meshes','model')}>Export aligned JMS source</button>
                <button className="small-button" onClick={()=>saveJms(displayedAssembly.mesh,'gs_bsp_candidate','bsp-candidate')}>Export sealed BSP JMS candidate</button>
              </div>
              {displayedAssembly.warnings.map((w,i)=><p key={i} className="subtle">{w}</p>)}
            </div>}
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
          <button className="primary" title="Import an OBJ geometry source file. UVs, normals and material groups are preserved where supported; this is not a compiled Halo .tag." onClick={onImport}>
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
export function Preservation({ project, edit,onBeforeSave,onRestore }: { project: Project; edit: (p: Project, d: string) => void;onBeforeSave:()=>Promise<void>;onRestore:(p:import('../types').OpenProject)=>Promise<void> }) {
  const v = project.provenance;
  return (
    <div className="preservation-page">
      <PageTitle
        eyebrow="COMMUNITY & PRESERVATION"
        title="Keep the story with the map."
        description="A record of the creator, community, source, and permission to preserve their work."
      />
      <div className="preservation-columns">
        <ProjectSnapshots project={project} onBeforeSave={onBeforeSave} onRestore={onRestore}/>
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
            {project.source?.archive && (
              <>
                <div className="section-label">Preserved archive provenance</div>
                <code className="path-text">{project.source.archive.originalPath}</code>
                <code className="path-text">{project.source.archive.entryPath}</code>
                <code className="checksum">{project.source.archive.sha256}</code>
              </>
            )}
            {project.source?.resourceDirectory && (
              <>
                <div className="section-label">Source resource directory</div>
                <code className="path-text">{project.source.resourceDirectory}</code>
              </>
            )}
            {Object.entries(project.source?.resourceSha256 ?? {}).map(([name, hash]) => (
              <div key={name}>
                <div className="section-label">{name} SHA-256</div>
                <code className="checksum">{hash}</code>
              </div>
            ))}
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
  onRuntimes,
  undoLimit=100,onUndoLimit,
}: {
  data: Bootstrap;
  onApply: (s: Settings) => Promise<void>;
  onAction: (f: () => Promise<unknown>, s?: string) => Promise<void>;
  onRuntimes: () => void;
  undoLimit?:number;onUndoLimit?:(limit:number)=>void;
}) {
  const [draft, setDraft] = useState(data.settings);
  const [pathChecks,setPathChecks]=useState<Record<string,string>>({});
  async function checkPath(key:keyof Settings,value:string){
    setPathChecks(old=>({...old,[key]:'Checking folder…'}));
    try{const result=await call<string>('validate_setting_path',{key,path:value});setPathChecks(old=>({...old,[key]:result}));}
    catch(e){setPathChecks(old=>({...old,[key]:String(e)}));}
  }
  const previousSettings = useRef(data.settings);
  useEffect(() => {
    const previous = previousSettings.current;
    setDraft((current) => reconcileSettingsDraft(current, previous, data.settings));
    previousSettings.current = data.settings;
  }, [data.settings]);
  const rows: [keyof Settings, string, string][] = [
    ['hekDirectory', 'Map Builder', 'The Halo editing program that turns your level into a playable map. Select the kit folder containing tool.exe, e.g. SteamLibrary\\steamapps\\common\\HCEEK.'],
    ['hekTagsDirectory', 'Editable Halo Tags', 'Game data describing weapons, vehicles, textures and level settings. Choose a legal editable tags folder, e.g. HaloProjects\\MyTagset\\tags.'],
    [
      'steamDirectory',
      'Steam installation',
      'Optional override. Non-default libraries are read from libraryfolders.vdf.',
    ],
    [
      'mccDirectory',
      'MCC installation',
      'Folder containing halo1. Detection is read-only. An optional MCC Inbox can be created explicitly from the library.',
    ],
    [
      'invaderDirectory',
      'Invader utilities',
      'A separately installed folder containing invader-info, invader-extract and invader-build.',
    ],
    [
      'resourceDirectory',
      'Halo Textures and shared sounds',
      'The source runtime’s bitmaps.map, sounds.map and loc.map. Do not substitute unrelated engine resources.',
    ],
    [
      'metadataTemplateDirectory',
      'Official Excession metadata',
      'An unpublished Halo1 package configured for the exact scenario. Its map metadata is preserved.',
    ],
  ];
  return (
    <div className="settings-page">
      <PageTitle
        eyebrow="PREFERENCES & RUNTIMES"
        title="A workbench that knows its limits."
        description="Connect installed tools and runtimes. All paths and integrations stay local."
        actions={
          <button className="primary" onClick={() => void onApply(draft).catch(()=>{})}>
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
                  onChange={(e) => {setDraft({ ...draft, [key]: e.target.value || null });setPathChecks(old=>({...old,[key]:'Not checked'}));}}
                />
                <button
                  onClick={() =>
                    void onAction(async () => {
                      const chosen = await call<string | null>('choose_setting_path', { key });
                      if (chosen) {setDraft((d) => ({ ...d, [key]: chosen }));await checkPath(key,chosen);}
                    })
                  }
                >
                  <FolderOpen size={15} />
                  Browse
                </button>
              </div>
              <button className="small-button" disabled={!native||!draft[key]} onClick={()=>void checkPath(key,String(draft[key]))}>Check folder</button>
              <small role="status">{pathChecks[key]??'Not checked in this session. Folder selection alone does not prove compatibility.'}</small>
            </div>
          ))}
          <div className="setting-row">
            <label htmlFor="gs-hek-flavor">Official Halo 1 Editing Kit flavor</label>
            <p>Choose what the configured Halo Editing Kit folder actually contains. Classic HEK is for Halo Custom Edition; H1A is for MCC. Wrong-family tools are never offered for launch.</p>
            <select id="gs-hek-flavor" aria-label="Official Editing Kit family" title="Select the exact installed Halo tool generation to prevent using legacy executables with MCC data." value={draft.hekFlavor ?? ''} onChange={e=>setDraft({...draft,hekFlavor:(e.target.value||null) as Settings['hekFlavor']})}>
              <option value="">Unverified / not selected</option>
              <option value="legacyHek">Classic HEK · Halo Custom Edition</option>
              <option value="h1aEk">H1A Editing Kit · MCC Halo CE</option>
            </select>
          </div>
          <div className="setting-row">
            <label>Optional Invader offline tool cache</label>
            <p>
              Make a verified local copy of the three Invader CLI executables and adjacent DLLs
              from a directory you installed yourself. Nothing is downloaded, executed or
              redistributed. Confirm that your copy's license permits personal caching.
              Review the generated path and click Apply preferences to use it.
            </p>
            <button
              className="small-button"
              disabled={!draft.invaderDirectory}
              onClick={() => void onAction(async () => {
                const sourceDirectory = draft.invaderDirectory;
                if (!sourceDirectory) return;
                const chosen = await call<string>('cache_invader_installation', { sourceDirectory });
                setDraft((current) => ({ ...current, invaderDirectory: chosen }));
              })}
            >
              <Copy size={14} />
              Cache Invader locally (optional)
            </button>
          </div>
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
          <div className="setting-row"><label>Undo history</label><p>Retain up to this many editor actions per open project. Default: 100. Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redoes. Saved snapshots are managed separately.</p>
            <NumberField label="Undo history limit" value={undoLimit} min={1} max={1000} step={1} onCommit={value=>{if(Number.isInteger(value))onUndoLimit?.(value);}}/>
          </div>
          <div className="setting-row"><label>Periodic project snapshots</label><p>Keep versioned project edits and an automatic safety snapshot before builds. Original maps are preserved separately.</p>
            <label>Interval in minutes<input type="number" min={1} max={1440} value={draft.snapshotIntervalMinutes??10} onChange={e=>setDraft({...draft,snapshotIntervalMinutes:Number(e.target.value)})}/></label>
            <label>Snapshots to retain<input type="number" min={1} max={100} value={draft.snapshotRetention??20} onChange={e=>setDraft({...draft,snapshotRetention:Number(e.target.value)})}/></label>
            <p>Open the current project’s Preservation record to preview and confirm a restore.</p></div>
          <button className="primary" onClick={() => void onApply(draft).catch(()=>{})}>
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
              <strong>Native and legacy runtimes</strong>
              <Pill>Explicit registrations</Pill>
              <p>
                Use Runtimes &amp; friends to inspect existing installations, read capability evidence and
                compare peer manifests.
              </p>
              <button className="small-button" onClick={onRuntimes}>
                Manage runtime adapters
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
