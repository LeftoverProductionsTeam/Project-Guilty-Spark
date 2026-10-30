import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Camera, Clapperboard, Pause, Play, Plus, Square, Download, Upload, Video } from 'lucide-react';
import type { Bootstrap, MapInspection, MeshData, OpenProject, Project, Vec3 } from '../types';
import type { CameraShot } from '../creatorStudio';
import { emptyCreatorStudio } from '../creatorStudio';
import { call, native } from '../api';
import { catalogAssets, placeAsset } from '../forge';
import type { ForgeMesh, ForgePlacement, QuickForgeDocument } from '../forge';
import { sourceSpartan } from '../sourceSpartan';
import AnimationStudio from './AnimationStudio';
import MachinimaCast from './MachinimaCast';
import type {AnimationPreview} from '../animation';
import {useMapState,readMapSession,writeMapSession} from '../mapSession';
import {
  DEFAULT_MACHINIMA,
  aspectRatio,
  encodeCameraTake,
  parseCameraTake,
  poseShot,
  sampleCamera,
  shotListCsv,
  shotStart,
  takeDuration,
} from '../machinima';
import type { MachinimaSettings } from '../machinima';
import { captureFrame, recordViewport } from '../machinimaCapture';
import { downloadLocalText } from '../exportHelpers';
import { Notice, NumberField } from './ui';
import MachinimaRig from './MachinimaRig';
import RenderFeatures from './RenderFeatures';
import NativeCameraControls from './NativeCameraControls';
import type { DirectorBridge, DirectorTransport } from './MachinimaRig';
import type { ForgeSnapshot } from './ForgeViewport';
import '../machinima.css';
import '../forge.css';
const World = lazy(() => import('./World')),
  ForgeViewport = lazy(() => import('./ForgeViewport'));
interface Props {
  project: Project;
  inspection: MapInspection | null;
  assetMeshes: Record<string, MeshData>;
  data: Bootstrap;
  edit: (p: Project, description: string) => void;
  notify: (message: string) => void;
  onLive: () => void;
  onEditor: () => void;
  onDirector: () => void;
  onBuild?:()=>void;
  onSave:()=>Promise<void>;
  onResourcesConnected:(open:OpenProject)=>Promise<void>;
}
export function SourceStage({
  projectId,
  document,
  sourceId,
  cinema,
  onError,
  animation,
}: {
  projectId:string;
  document: QuickForgeDocument;
  sourceId: string;
  cinema: { locked: boolean; rig: React.ReactNode;externalAuthority?:boolean };
  onError: (m: string) => void;
  animation:AnimationPreview|null;
}) {
  const [snapshot, setSnapshot] = useState<ForgeSnapshot | null>(null),
    [spawn, setSpawn] = useState<ForgePlacement | undefined>(),
    [error, setError] = useState('');
  const drop = useRef<((x: number, y: number) => Vec3 | null) | null>(null);
  useEffect(() => {
    let alive = true;
    setSnapshot(null);
    void call<ForgeMesh>('quickforge_preview', { document })
      .then((mesh) => {
        if (alive) {
          setSnapshot({ mesh, document });
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [document]);
  useEffect(() => {
    let alive = true;
    setSpawn(undefined);
    if (sourceId)
      void call<OpenProject>('open_project', { id: sourceId })
        .then((open) => {
          const biped = sourceSpartan(open.inspection),
            asset = biped && catalogAssets(open).find((a) => a.tagId === biped.id);
          if (alive && asset) setSpawn({ ...placeAsset(asset, [0, 0, 0]), id: 'director-spartan' });
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [sourceId]);
  return (
    <>
      <ForgeViewport
        sessionId={projectId}
        document={document}
        snapshot={snapshot}
        selected={[]}
        onSelect={() => {}}
        onTransform={() => {}}
        mode="translate"
        snap={0}
        grid={false}
        wireframe={false}
        cutaway
        walkCollision
        cameraMode="machinima"
        frame={0}
        errors={new Set()}
        dropPoint={drop}
        ghost={null}
        zones={[]}
        selectedZone={null}
        onZoneSelect={() => {}}
        onZoneMove={() => {}}
        onError={onError}
        spawnModelSource={spawn}
        actorAnimation={animation}
        cameraLocked={cinema.locked}
        externalCameraAuthority={cinema.externalAuthority}
        cinema
        viewportChildren={cinema.rig}
      />
      {error && (
        <div className="director-stage-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}
export default function MachinimaWorkspace({
  project,
  inspection,
  assetMeshes,
  data,
  edit,
  notify,
  onLive,
  onEditor,
  onDirector,
  onBuild,
  onSave,
  onResourcesConnected,
}: Props) {
  const studio = project.studio ?? emptyCreatorStudio(),
    shots = studio.shots,
    settings = studio.machinima ?? DEFAULT_MACHINIMA;
  const [selected, setSelected] = useMapState(project.id,'director.selection',shots[0]?.id ?? ''),
    [transport, setTransport] = useState<DirectorTransport>({
      time: readMapSession<number>(project.id,'director.time',0),
      playing: false,
      preview: false,
      seek: 0,
    }),
    [time, setTime] = useState(readMapSession<number>(project.id,'director.time',0)),
    [message, setMessage] = useState(''),
    [recording, setRecording] = useState(false),
    [captureReady, setCaptureReady] = useState(false);
  const bridge = useRef<DirectorBridge>({ pose: null, canvas: null }),
    stopRecording = useRef<(() => void) | null>(null),
    takeInput = useRef<HTMLInputElement>(null),
    mounted = useRef(true);
  const [animation,setAnimation]=useState<AnimationPreview|null>(null);
  const [nativeResolution,setNativeResolution]=useState('desktop'),[launching,setLaunching]=useState(false);
  const [sourceId, setSourceId] = useMapState(project.id,'director.source',
    project.quickForge?.placements[0]?.sourceProjectId ??
      data.entries.find((e) => e.version !== null)?.id ??
      '',
  );
  const shot = shots.find((s) => s.id === selected),
    duration = takeDuration(shots),
    playing = transport.playing;
  const rememberedTime=useRef(time);rememberedTime.current=time;useEffect(()=>()=>writeMapSession(project.id,'director.time',rememberedTime.current),[project.id]);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setCaptureReady(!!bridge.current.canvas), 300);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      stopRecording.current?.();
    };
  }, []);
  useEffect(() => {
    if (!shots.some((s) => s.id === selected)) setSelected(shots[0]?.id ?? '');
  }, [shots, selected]);
  function save(next: CameraShot[], description: string, preferences: MachinimaSettings = settings) {
    edit({ ...project, studio: { ...studio, shots: next, machinima: { ...preferences } } }, description);
  }
  function preference<K extends keyof MachinimaSettings>(key: K, value: MachinimaSettings[K]) {
    save(shots, 'Change director ' + key, { ...settings, [key]: value });
  }
  function patchShot(patch: Partial<CameraShot>) {
    if (shot)
      save(
        shots.map((s) => (s.id === shot.id ? { ...s, ...patch } : s)),
        'Edit camera keyframe',
      );
  }
  function seek(value: number, preview = true) {
    const next = Math.max(0, Math.min(duration, value));
    setTime(next);
    setTransport((t) => ({ ...t, time: next, preview, seek: t.seek + 1 }));
  }
  function selectShot(id: string) {
    setSelected(id);
    const i = shots.findIndex((s) => s.id === id);
    seek(shotStart(shots, i));
  }
  function capture(replace = false) {
    try {
      if (!bridge.current.pose) throw new Error('Wait for the map camera to become available.');
      const next = poseShot(bridge.current.pose, replace && shot ? shot.name : `Shot ${shots.length + 1}`);
      if (replace && shot) {
        save(
          shots.map((s) =>
            s.id === shot.id
              ? {
                  ...s,
                  cameraPosition: next.cameraPosition,
                  lookAt: next.lookAt,
                  fov: next.fov,
                  roll: next.roll,
                }
              : s,
          ),
          'Capture camera into keyframe',
        );
      } else {
        if (shots.length >= 256) throw new Error('A take supports up to 256 camera keys.');
        save([...shots, next], 'Capture new camera keyframe');
        setSelected(next.id);
      }
      setMessage('Camera key saved in this project.');
    } catch (e) {
      notify(String(e));
    }
  }
  function moveShot(direction: number) {
    if (!shot) return;
    const i = shots.indexOf(shot),
      j = i + direction;
    if (j < 0 || j >= shots.length) return;
    const next = [...shots];
    [next[i], next[j]] = [next[j], next[i]];
    save(next, 'Reorder camera keyframes');
  }
  const rig = (
    <MachinimaRig
      renderProfile={project.renderFeatures}
      shots={shots}
      settings={settings}
      transport={transport}
      bridge={bridge}
      onTick={(t, ended) => {
        setTime(t);
        if (ended) {
          setTransport((old) => ({ ...old, time: t, playing: false }));
          stopRecording.current?.();
        }
      }}
    />
  );
  const sampled = sampleCamera(shots, time);
  return (
    <div className="machinima-workspace">
      <header className="director-heading">
        <div>
          <span className="eyebrow">MACHINIMA · DIRECTOR WORKSPACE</span>
          <h2>
            <Clapperboard size={22} /> {project.title}
          </h2>
          <p>Source camera rehearsal · hold RMB + WASD, Q/E to descend / ascend · actor arrows and Q/E</p>
        </div>
        <div>
          <button onClick={onEditor}>Level editor</button><button onClick={onDirector}>Recording Director ↗</button>
          <button onClick={onLive}>MCC live mode</button>
        </div>
      </header>
      <details className="engine-machinima-controls"><summary>In-engine recording · native cameras, HUD off, your actor stays controllable</summary>
        <NativeCameraControls/>
        <p>Build a private MCC map variant with these camera points. In Halo, toggle your flashlight to start/stop the take. Movement and actions remain enabled while the game camera is detached. Record the Halo window with OBS Game Capture at the game’s full resolution.</p>
        <label><input type="checkbox" checked={!!studio.engineMachinima?.enabled} onChange={e=>edit({...project,studio:{...studio,engineMachinima:{enabled:e.target.checked,playback:studio.engineMachinima?.playback??'fixed',cameraId:shot?.id??null,autoStart:studio.engineMachinima?.autoStart??false}}},'Configure game-native machinima take')}/>Include native engine camera controls in the next MCC build</label>
        {studio.engineMachinima?.enabled&&<>
          <label>Engine camera<select aria-label="Engine camera" value={studio.engineMachinima.cameraId??shots[0]?.id??''} onChange={e=>edit({...project,studio:{...studio,engineMachinima:{...studio.engineMachinima!,cameraId:e.target.value}}},'Choose engine camera')}>{shots.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Engine playback<select aria-label="Engine playback" value={studio.engineMachinima.playback} onChange={e=>edit({...project,studio:{...studio,engineMachinima:{...studio.engineMachinima!,playback:e.target.value as 'fixed'|'sequence'}}},'Choose engine camera playback')}><option value="fixed">Fixed camera · be your own actor</option><option value="sequence">Play camera sequence · actor remains controllable</option></select></label>
          <label><input type="checkbox" checked={studio.engineMachinima.autoStart} onChange={e=>edit({...project,studio:{...studio,engineMachinima:{...studio.engineMachinima!,autoStart:e.target.checked}}},'Set engine take startup')}/>Start the take when the player spawns</label>
          <button disabled={!shots.length||shots.length>64} onClick={onBuild}>Open MCC build &amp; conversion</button>
          <label>Native recording resolution<select aria-label="Native recording resolution" value={nativeResolution} onChange={e=>setNativeResolution(e.target.value)}><option value="desktop">Current monitor resolution</option><option value="1080p">1920 × 1080</option><option value="1440p">2560 × 1440</option><option value="4k">3840 × 2160</option></select></label>
          <button disabled={!native||launching||!project.builds.some(b=>b.status==='validated')} onClick={()=>{setLaunching(true);void(async()=>{try{await onSave();const build=project.builds.filter(b=>b.status==='validated').at(-1)!;const result=await call<string>('launch_engine_take',{projectId:project.id,buildId:build.id,resolution:nativeResolution});setMessage(result);}catch(e){notify(String(e));}finally{setLaunching(false);}})();}}>{launching?'Opening native take…':'Launch built take in MCC Standalone'}</button>
          <p className="subtle">Uses the current validated build’s private tags and your installed MCC editing-kit runtime. Rebuild after changing cameras or animation assignments. OBS captures the game at the selected resolution.</p>
        </>}
        <p className="subtle">Supports 1–64 keys per engine take. Build/reload is required. Scenarios with existing scripts require their original source to be merged first; Spark will keep that build blocked instead of replacing gameplay. Engine effects and actor motion still need actual-game acceptance.</p>
      </details>
      <div className="director-body">
        <aside className="director-shots">
          <h3>
            Camera keys <span>{shots.length}/256</span>
          </h3>
          <button onClick={() => capture()} disabled={!captureReady || playing}>
            <Plus size={15} /> Capture camera key
          </button>
          <div className="director-shot-list" role="list" aria-label="Camera keyframes">
            {shots.map((s, i) => (
              <button
                key={s.id}
                className={selected === s.id ? 'selected' : ''}
                aria-pressed={selected === s.id}
                onClick={() => selectShot(s.id)}
              >
                <span>
                  {String(i + 1).padStart(2, '0')} · {s.name}
                </span>
                <small>
                  {(shotStart(shots, i) / 1000).toFixed(2)} s · {(s.durationMs / 1000).toFixed(2)} s ·{' '}
                  {s.easing ?? 'smooth'}
                </small>
              </button>
            ))}
          </div>
          {!shots.length && (
            <p>
              Fly to a view and capture it. Each key transitions to the next over its duration; the final key
              holds.
            </p>
          )}
          {shot && (
            <div className="director-reorder">
              <button onClick={() => moveShot(-1)} disabled={shots[0] === shot || playing}>
                Earlier
              </button>
              <button onClick={() => moveShot(1)} disabled={shots.at(-1) === shot || playing}>
                Later
              </button>
              <button
                disabled={playing || shots.length >= 256}
                onClick={() => {
                  const next = {
                    ...structuredClone(shot),
                    id: crypto.randomUUID(),
                    name: (shot.name + ' copy').slice(0, 120),
                  };
                  save(
                    [
                      ...shots.slice(0, shots.indexOf(shot) + 1),
                      next,
                      ...shots.slice(shots.indexOf(shot) + 1),
                    ],
                    'Duplicate camera key',
                  );
                  setSelected(next.id);
                }}
              >
                Duplicate
              </button>
              <button
                disabled={playing}
                onClick={() => {
                  save(
                    shots.filter((s) => s.id !== shot.id),
                    'Delete camera key',
                  );
                  setTransport((t) => ({ ...t, playing: false, preview: false }));
                }}
              >
                Delete key
              </button>
            </div>
          )}
          <h3>Take files</h3>
          <button
            onClick={() =>
              downloadLocalText(
                'spark-camera-take.json',
                encodeCameraTake(shots, settings),
                'application/json',
              )
            }
          >
            <Download size={15} /> Export camera take
          </button>
          <button disabled={playing || recording} onClick={() => takeInput.current?.click()}>
            <Upload size={15} /> Import camera take
          </button>
          <input
            ref={takeInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > 512 * 1024) throw new Error('Take exceeds 512 KiB.');
                const take = parseCameraTake(await file.text());
                if (take.shots.length + shots.length > 256)
                  throw new Error('Imported take would exceed 256 camera keys.');
                save([...shots, ...take.shots], 'Import camera take', take.settings);
                setMessage(`Appended ${take.shots.length} camera keys.`);
              } catch (error) {
                notify(String(error));
              }
            }}
          />
          <button onClick={() => downloadLocalText('spark-shot-list.csv', shotListCsv(shots), 'text/csv')}>
            Export shot list CSV
          </button>
          {project.quickForge && (
            <>
              <h3>Actor model source</h3>
              <select
                aria-label="Director actor source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">Choose preserved map…</option>
                {data.entries
                  .filter((e) => e.version !== null)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
              </select>
            </>
          )}
          <AnimationStudio project={project} inspection={inspection} edit={edit} onPreview={setAnimation} notify={notify}/>
          <Notice>Source animation playback uses the biped’s actual skeleton and weights. Game changes require a native build and reload; live graph replacement and peer animation replication remain unverified.</Notice>
        </aside>
        <section className="director-center">
          <div className="director-stage" data-testid="director-stage">
            <Suspense fallback={<p>Loading director viewport…</p>}>
              {project.quickForge ? (
                <SourceStage
                  projectId={project.id}
                  document={project.quickForge}
                  sourceId={sourceId}
                  animation={animation}
                  cinema={{ locked: transport.preview, rig }}
                  onError={notify}
                />
              ) : (
                <World
                  project={project}
                  inspection={inspection}
                  assetMeshes={assetMeshes}
                  edit={edit}
                  notify={notify}
                  onBeforeResources={onSave}
                  onResourcesConnected={onResourcesConnected}
                  selectedId={null}
                  cinematic
                  cameraLocked={transport.preview}
                  viewportChildren={<>{rig}<MachinimaCast project={project} inspection={inspection} animation={animation} onError={notify}/></>}
                />
              )}
            </Suspense>
            <div
              className="director-guides"
              style={{ '--director-aspect': aspectRatio(settings.aspect) } as React.CSSProperties}
            >
              <div className="director-composition">
                <div className="director-frame">
                  <span className="director-frame-label">
                    {settings.aspect} · {settings.fps} fps ·{' '}
                    {transport.preview ? 'SHOT PREVIEW' : 'FREE CAMERA'}
                  </span>
                  {settings.thirds && <div className="director-thirds" />}
                  {settings.safeFrame && <div className="director-safe" />}
                  {settings.center && <div className="director-cross" />}
                  {sampled && transport.preview && (
                    <span className="director-subtitle">{shots[sampled.index].subtitle}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="director-transport">
            <button
              disabled={!shots.length}
              aria-label={playing ? 'Pause camera take' : 'Play camera take'}
              onClick={() => {
                if (playing) {
                  setTransport((t) => ({ ...t, time, playing: false }));
                } else {
                  const start = time >= duration ? 0 : time;
                  setTransport((t) => ({
                    ...t,
                    time: start,
                    playing: true,
                    preview: true,
                    seek: t.seek + 1,
                  }));
                }
              }}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button
              aria-label="Stop camera take"
              onClick={() => {
                setTransport((t) => ({ ...t, time: 0, playing: false, seek: t.seek + 1 }));
                setTime(0);
                stopRecording.current?.();
              }}
            >
              <Square size={16} />
            </button>
            <button
              aria-pressed={!transport.preview}
              onClick={() => setTransport((t) => ({ ...t, time, preview: false, playing: false }))}
            >
              Free camera
            </button>
            <input
              aria-label="Camera timeline"
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={1000 / settings.fps}
              value={Math.min(time, duration)}
              disabled={!shots.length}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <output>
              {(time / 1000).toFixed(2)} / {(duration / 1000).toFixed(2)} s
            </output>
          </div>
          <div className="director-timeline">
            {shots.map((s) => (
              <button
                key={s.id}
                style={{ flexGrow: s.durationMs }}
                className={sampled?.index === shots.indexOf(s) ? 'active' : ''}
                onClick={() => selectShot(s.id)}
                title={s.name}
              >
                {s.name}
              </button>
            ))}
          </div>
          <p className="director-status" role="status">
            {message ||
              'Capture camera keys, preview the take, then export a frame or a silent video. Keys and lens settings save with the project.'}
          </p>
        </section>
        <aside className="director-inspector">
          <RenderFeatures project={project} edit={edit}/>
          <h3>Lens & composition</h3>
          <select
            aria-label="Capture aspect ratio"
            value={settings.aspect}
            disabled={recording}
            onChange={(e) => preference('aspect', e.target.value as MachinimaSettings['aspect'])}
          >
            {(['16:9', '2.39:1', '1:1', '9:16'] as const).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            aria-label="Capture frame rate"
            value={settings.fps}
            disabled={recording}
            onChange={(e) => preference('fps', Number(e.target.value) as 24 | 30 | 60)}
          >
            {[24, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} fps
              </option>
            ))}
          </select>
          {(['thirds', 'safeFrame', 'center', 'showPath', 'loopPlayback', 'depthOfField'] as const).map(
            (key) => (
              <label className="director-check" key={key}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => preference(key, e.target.checked)}
                />
                {
                  {
                    thirds: 'Rule of thirds',
                    safeFrame: '90% safe frame',
                    center: 'Center cross',
                    showPath: 'Camera path & frustums',
                    loopPlayback: 'Loop playback',
                    depthOfField: 'Depth of field',
                  }[key]
                }
              </label>
            ),
          )}
          <NumberField
            label="Playback speed"
            value={settings.speed}
            min={0.25}
            max={2}
            step={0.25}
            onCommit={(v) => preference('speed', v)}
          />
          <NumberField
            label="Focus distance"
            value={settings.focusDistance}
            min={0.1}
            max={4096}
            step={0.5}
            onCommit={(v) => preference('focusDistance', v)}
          />
          <NumberField
            label="Lens blur amount"
            value={settings.blur}
            min={0}
            max={1}
            step={0.05}
            onCommit={(v) => preference('blur', v)}
          />
          <h3>Capture</h3>
          <button
            disabled={!captureReady || recording}
            onClick={() => {
              if (bridge.current.canvas)
                void captureFrame(bridge.current.canvas, settings.aspect)
                  .then((size) => setMessage(`PNG exported · ${size.width} × ${size.height}`))
                  .catch((e) => notify(String(e)));
            }}
          >
            <Camera size={15} /> Capture PNG frame
          </button>
          <button
            disabled={!captureReady}
            onClick={() => {
              if (recording) {
                stopRecording.current?.();
                return;
              }
              try {
                if (!bridge.current.canvas) throw new Error('Wait for the camera.');
                stopRecording.current = recordViewport(bridge.current.canvas, settings, (active, detail) => {
                  if (mounted.current) {
                    setRecording(active);
                    setMessage(detail);
                  }
                });
              } catch (e) {
                notify(String(e));
              }
            }}
          >
            <Video size={15} /> {recording ? 'Stop & save video' : 'Record silent WebM'}
          </button>
          <small>
            Clean cropped viewport · up to 1920 × 1080 · 120 s limit. Composition guides and UI are excluded;
            hide path gizmos before recording a free-camera view.
          </small>
          {shot && (
            <fieldset disabled={playing}>
              <legend>Selected camera key</legend>
              <label>
                Name
                <input
                  aria-label="Camera key name"
                  maxLength={120}
                  value={shot.name}
                  onChange={(e) => patchShot({ name: e.target.value })}
                />
              </label>
              <NumberField
                label="Key duration (seconds)"
                value={shot.durationMs / 1000}
                min={0.1}
                max={600}
                step={0.1}
                onCommit={(v) => patchShot({ durationMs: Math.round(v * 1000) })}
              />
              <NumberField
                label="Camera FOV"
                value={shot.fov}
                min={10}
                max={140}
                step={1}
                onCommit={(v) => patchShot({ fov: v })}
              />
              <NumberField
                label="Camera roll (degrees)"
                value={shot.roll ?? 0}
                min={-180}
                max={180}
                step={1}
                onCommit={(v) => patchShot({ roll: v })}
              />
              <select
                aria-label="Key transition"
                value={shot.easing ?? 'smooth'}
                onChange={(e) => patchShot({ easing: e.target.value as CameraShot['easing'] })}
              >
                <option value="smooth">Smooth ease</option>
                <option value="linear">Linear</option>
                <option value="cut">Hold, then cut</option>
              </select>
              {(['cameraPosition', 'lookAt'] as const).map((key) => (
                <div className="director-vector" key={key}>
                  <strong>{key === 'cameraPosition' ? 'Camera position' : 'Look at'}</strong>
                  {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                    <NumberField
                      key={axis}
                      label={(key === 'cameraPosition' ? 'Camera ' : 'Target ') + axis}
                      value={shot[key][i]}
                      min={-4096}
                      max={4096}
                      step={0.1}
                      onCommit={(v) =>
                        patchShot({ [key]: shot[key].map((n, j) => (j === i ? v : n)) as Vec3 })
                      }
                    />
                  ))}
                </div>
              ))}
              <label>
                Subtitle
                <input
                  aria-label="Camera subtitle"
                  maxLength={2048}
                  value={shot.subtitle}
                  onChange={(e) => patchShot({ subtitle: e.target.value })}
                />
              </label>
              <button disabled={!captureReady} onClick={() => capture(true)}>
                Replace with current camera
              </button>
              <button onClick={() => seek(shotStart(shots, shots.indexOf(shot)))}>
                Preview this camera key
              </button>
            </fieldset>
          )}
          {!native && <p>Desktop source loading is unavailable in this browser.</p>}
        </aside>
      </div>
    </div>
  );
}
