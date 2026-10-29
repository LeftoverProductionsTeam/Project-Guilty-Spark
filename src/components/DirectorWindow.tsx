import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { listen } from '@tauri-apps/api/event';
import { call, native } from '../api';
import type { OpenProject, Vec3 } from '../types';
import type { CameraPose } from '../machinima';
import { poseShot, sampleCamera, takeDuration } from '../machinima';
import { useDirectorSession } from '../directorSession';
import type { DirectorComposition } from '../directorSession';
import { recordDirector, nextTakeName } from '../directorRecording';
import type { ActiveRecording } from '../directorRecording';
import type { DirectorBridge } from './MachinimaRig';
import { SourceStage } from './MachinimaWorkspace';
import { dragWindow, ResizeEdges } from './WindowFrame';
import { useWindowFullscreen } from '../useWindowFullscreen';
import { observeWindowFocus } from '../windowFocus';
import { matchesLiveMap, runtimeScene } from '../liveScene';
import type { LiveStatus } from './LiveObjectInspector';
import { NumberField } from './ui';
import { useMapState } from '../mapSession';
import { directorCanvasCapture } from '../directorCanvasCapture';
import type { DirectorCanvasCapture } from '../directorCanvasCapture';
import '../directorWindow.css';
const World = lazy(() => import('./World'));
function apply(camera: PerspectiveCamera, pose: CameraPose) {
  camera.position.fromArray(pose.position);
  camera.up.set(0, 0, 1);
  camera.lookAt(new Vector3(...pose.lookAt));
  camera.rotateZ((pose.roll * Math.PI) / 180);
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
function DirectorRig({
  composition,
  objects,
  bridge,
  resolution,
  onEnded,
}: {
  composition: DirectorComposition;
  objects: OpenProject['project']['scene'];
  bridge: React.MutableRefObject<DirectorBridge>;
  resolution: number;
  onEnded: (pose: CameraPose) => void;
}) {
  const { camera, gl, size } = useThree(),
    applied = useRef(''),
    offset = useRef(new Vector3()),
    tracking = useRef(''),
    ended = useRef<number | null>(null);
  useEffect(() => {
    applied.current='';tracking.current='';
  },[camera]);
  useEffect(() => {
    bridge.current.canvas = gl.domElement;
    return () => {
      bridge.current.canvas = null;
      bridge.current.pose = null;
    };
  }, [gl, bridge]);
  useEffect(() => {
    gl.setPixelRatio(
      resolution ? Math.min(4, resolution / Math.max(1, size.width)) : Math.min(2, window.devicePixelRatio),
    );
    gl.setSize(size.width, size.height);
  }, [gl, size.width, size.height, resolution]);
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const poseKey = JSON.stringify(composition.pose);
    if (poseKey !== applied.current) {
      apply(camera, composition.pose);
      applied.current = poseKey;
      tracking.current = '';
    }
    const elapsed =
      composition.playheadMs + (composition.playing ? Math.max(0, Date.now() - composition.startedAtMs) : 0);
    const target = objects.find((object) => object.id === composition.target);
    if (composition.playing && composition.shots.length) {
      const shots = composition.shots.map((shot) => ({ ...shot, subtitle: '' })),
        sample = sampleCamera(shots, elapsed);
      if (sample) {
        apply(camera, sample.pose);
        if (elapsed >= takeDuration(shots) && ended.current !== composition.startedAtMs) {
          ended.current = composition.startedAtMs;
          onEnded(sample.pose);
        }
      }
    } else if (composition.tracking === 'free') {
      const direction = new Vector3();
      camera.getWorldDirection(direction);
      apply(camera, {
        ...composition.pose,
        position: camera.position.toArray() as Vec3,
        lookAt: camera.position.clone().add(direction).toArray() as Vec3,
      });
    } else if (composition.tracking === 'fixed') apply(camera, composition.pose);
    else if (target && ['follow', 'lookAt', 'orbit'].includes(composition.tracking)) {
      const key = `${composition.tracking}:${target.id}`;
      if (tracking.current !== key) {
        tracking.current = key;
        offset.current.set(...composition.pose.position).sub(new Vector3(...target.position));
      }
      const position = new Vector3(...target.position),
        eye = new Vector3(...composition.pose.position);
      if (composition.tracking === 'follow') eye.copy(position).add(offset.current);
      if (composition.tracking === 'orbit') {
        const angle = ((Date.now() - composition.startedAtMs) / 1000) * 0.2;
        eye
          .copy(offset.current)
          .applyAxisAngle(new Vector3(0, 0, 1), angle)
          .add(position);
      }
      apply(camera, {
        ...composition.pose,
        position: eye.toArray() as Vec3,
        lookAt: position.toArray() as Vec3,
      });
    }
    const direction = new Vector3();
    camera.getWorldDirection(direction);
    bridge.current.pose = {
      position: camera.position.toArray() as Vec3,
      lookAt: camera.position.clone().addScaledVector(direction, 20).toArray() as Vec3,
      fov: camera.fov,
      roll: composition.pose.roll,
    };
    gl.domElement.dataset.gsDirector = JSON.stringify({
      time: elapsed,
      mode: composition.tracking,
      position: bridge.current.pose.position,
      fov: camera.fov,
    });
  });
  return null;
}
export default function DirectorWindow({
  projectId,
  embedded = false,
  onPopout,
  onClose,
}: {
  projectId: string;
  embedded?: boolean;
  onPopout?: () => void;
  onClose?: () => void;
}) {
  const { fullscreen } = useWindowFullscreen();
  const { session, error, update } = useDirectorSession(projectId),
    [opened, setOpened] = useState<OpenProject | null>(null),
    [message, setMessage] = useState(''),
    [clean, setClean] = useState(false),
    [mode, setMode] = useState<'editor' | 'capture'>('editor');
  const [displays, setDisplays] = useState<
      { index: number; name: string; scale: number; width: number; height: number }[]
    >([]),
    [fps, setFps] = useState(30),
    [resolution, setResolution] = useState(0),
    [quality, setQuality] = useState(12_000_000),
    [recording, setRecording] = useState('idle'),
    [elapsed, setElapsed] = useState(0),
    [audio, setAudio] = useState(false),
    [countdown, setCountdown] = useState(0);
  const [linked, setLinked] = useState(false),
    [live, setLive] = useState<LiveStatus | null>(null);
  const [outputDirectory,setOutputDirectory]=useMapState(projectId,'director.recordingFolder','');
  const [takeName,setTakeName]=useState(nextTakeName);
  const bridge = useRef<DirectorBridge>({ canvas: null, pose: null }),
    video = useRef<HTMLVideoElement>(null),
    [feed, setFeed] = useState<MediaStream | null>(null),
    active = useRef<ActiveRecording | null>(null),
    ownedCanvas = useRef<DirectorCanvasCapture | null>(null),
    clock = useRef({ started: 0, accumulated: 0, running: false }),
    starting = useRef<AbortController | null>(null),
    latest = useRef(session);
  latest.current = session;
  useEffect(() => {
    let alive = true,
      revision = 0;
    const reload = async () => {
      const token = ++revision;
      try {
        const open = await call<OpenProject>('open_project', { id: projectId });
        if (alive && token === revision) setOpened(open);
      } catch (e) {
        if (alive && token === revision) setMessage(String(e));
      }
    };
    const saved = listen<string>('spark:project-saved', ({ payload }) => {
      if (payload === projectId) void reload();
    });
    void saved
      .then(() => {
        if (alive) void reload();
      })
      .catch((e) => {
        if (alive) setMessage(String(e));
      });
    void call<typeof displays>('director_displays')
      .then(setDisplays)
      .catch((e) => setMessage(String(e)));
    const close = listen<string>('spark:director-close-blocked', ({ payload }) => setMessage(payload));
    return () => {
      alive = false;
      void saved.then((stop) => stop());
      void close.then((stop) => stop());
    };
  }, [projectId]);
  useEffect(() => {
    if (video.current) video.current.srcObject = feed;
  }, [feed, mode]);
  useEffect(() => {
    if (!linked || !opened || mode !== 'editor') return;
    let alive = true,
      pending = false;
    const sample = async () => {
      if (pending) return;
      pending = true;
      try {
        const status = await call<LiveStatus>('live_mcc_sample');
        if (!matchesLiveMap(opened.project, opened.inspection, status))
          throw new Error(
            'The connected game is a different map or tag set. Open its exact preserved map before linking the Director.',
          );
        if (alive) setLive(status);
      } catch (e) {
        if (alive) {
          setLive(null);
          setLinked(false);
          setMessage(
            `Game link stopped: ${String(e)}. Connect in the main Level editor first. This view uses Spark’s renderer; native animation and effects can differ.`,
          );
        }
      } finally {
        pending = false;
      }
    };
    void sample();
    const timer = setInterval(() => void sample(), 250);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [linked, opened?.project.id, mode]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (clock.current.running)
        setElapsed((clock.current.accumulated + performance.now() - clock.current.started) / 1000);
    }, 250);
    return () => clearInterval(timer);
  }, []);
  const savePose = () => {
    const pose = bridge.current.pose;
    const composition = latest.current?.composition;
    if (!pose || composition?.tracking !== 'free' || composition.playing) return;
    const before = composition.pose;
    if (
      Math.abs(pose.fov - before.fov) < 1e-5 &&
      Math.abs(pose.roll - before.roll) < 1e-5 &&
      pose.position.every((v, i) => Math.abs(v - before.position[i]) < 1e-5) &&
      pose.lookAt.every((v, i) => Math.abs(v - before.lookAt[i]) < 1e-5)
    )
      return;
    void update((old) => ({ ...old, pose }));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClean(false);
      if (e.key === 'F11' && !embedded) {
        e.preventDefault();
        void windowAction('fullscreen');
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', savePose);
    window.addEventListener('pointerup', savePose);
    const stopFocus = observeWindowFocus((focused) => {
      if (!focused) savePose();
    });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', savePose);
      window.removeEventListener('pointerup', savePose);
      stopFocus();
    };
  }, [session?.revision]);
  useEffect(
    () => () => {
      feed?.getTracks().forEach((track) => track.stop());
    },
    [feed],
  );
  useEffect(
    () => () => {
      starting.current?.abort();
      ownedCanvas.current?.dispose();
    },
    [],
  );
  async function windowAction(action: string, monitor?: number) {
    try {
      await call('director_window', { projectId, action, monitor: monitor ?? null });
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function share() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia)
        throw new Error('This WebView has no screen-capture picker. Use OBS to capture the game window.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: fps }, audio });
      feed?.getTracks().forEach((track) => track.stop());
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        active.current?.stop();
        setFeed(null);
        setMessage('Game feed ended. The recording is being saved.');
      });
      setFeed(stream);
      setMessage(
        stream.getAudioTracks().length
          ? 'Permissioned live game feed with shared audio.'
          : 'Permissioned live video feed. No game audio was supplied.',
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function record() {
    if (starting.current || active.current) return;
    const controller = new AbortController();
    starting.current = controller;
    setRecording('preparing');
    clock.current = { started: 0, accumulated: 0, running: false };
    setElapsed(0);
    try {
      if(mode==='editor'&&bridge.current.canvas)ownedCanvas.current=directorCanvasCapture(bridge.current.canvas,fps);
      const stream = mode === 'capture' ? feed : ownedCanvas.current?.stream;
      if (!stream)
        throw new Error(
          mode === 'capture' ? 'Choose the game window first.' : 'Wait for the map view to render.',
        );
      active.current = await recordDirector(
        projectId,
        stream,
        quality,
        (state, detail) => {
          const time = performance.now();
          if (clock.current.running) {
            clock.current.accumulated += time - clock.current.started;
            clock.current.running = false;
          }
          if (state === 'recording') {
            clock.current.started = time;
            clock.current.running = true;
          }
          setElapsed(clock.current.accumulated / 1000);
          setRecording(state);
          setMessage(detail);
          if (state === 'idle') {
            ownedCanvas.current?.dispose();
            ownedCanvas.current = null;
            active.current = null;
          }
        },
        { countdown, signal: controller.signal, outputDirectory, fileName:takeName, onSaved:()=>setTakeName(nextTakeName()),beforeStart:mode==='editor'?signal=>ownedCanvas.current!.start(signal):undefined },
      );
      if (!active.current) {
        ownedCanvas.current?.dispose();
        ownedCanvas.current = null;
      }
    } catch (e) {
      ownedCanvas.current?.dispose();
      ownedCanvas.current = null;
      setRecording('idle');
      setMessage(String(e));
    } finally {
      starting.current = null;
    }
  }
  const composition = session?.composition,
    locked = !!composition && (composition.tracking !== 'free' || composition.playing),
    duration = composition ? takeDuration(composition.shots.map((shot) => ({ ...shot, subtitle: '' }))) : 0;
  const objects = linked && live ? runtimeScene(live) : (opened?.project.scene ?? []);
  const player = linked && live?.snapshot.objects.find((object) => object.player);
  const cameraObjects = player
    ? [
        ...objects,
        {
          ...runtimeScene({
            ...live!,
            snapshot: { ...live!.snapshot, objects: [{ ...player, parentDatum: 4294967295 }] },
          })[0],
          id: 'connected-player',
          name: 'Your connected player (follows respawns)',
        },
      ]
    : objects;
  const displayedProject = opened && linked && live ? { ...opened.project, scene: objects } : opened?.project;
  function capture() {
    if (!bridge.current.pose) return;
    try {
      const shot = poseShot(bridge.current.pose, `Camera ${(composition?.shots.length ?? 0) + 1}`);
      const key = {
        id: shot.id,
        name: shot.name,
        durationMs: shot.durationMs,
        cameraPosition: shot.cameraPosition,
        lookAt: shot.lookAt,
        fov: shot.fov,
        roll: shot.roll ?? 0,
        easing: shot.easing ?? 'smooth',
      };
      void update((old) => ({
        ...old,
        pose: bridge.current.pose!,
        shots: [...old.shots, key],
        selected: key.id,
      }));
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <div data-embedded={embedded} className={`gs-director-window ${clean ? 'gs-director-clean' : ''}`}>
      {!embedded && !clean && !fullscreen && <ResizeEdges />}
      {!clean && embedded && (
        <header>
          <strong>Recording Director · {opened?.project.title ?? 'Loading map'}</strong>
          <button onClick={onPopout}>Pop out Director ↗</button>
          <button onClick={onClose}>Camera tracks &amp; actors</button>
          <button onClick={() => setClean(true)}>Hide interface</button>
        </header>
      )}
      {!clean && !embedded && (
        <header onPointerDown={(e) => void dragWindow(e).catch(() => {})}>
          <strong>Recording Director · {opened?.project.title ?? 'Loading map'}</strong>
          <button onClick={() => void windowAction('dock')}>Dock back</button>
          <button onClick={() => void windowAction('maximize')}>Maximize / restore</button>
          <button onClick={() => void windowAction('fullscreen')}>Borderless fullscreen · F11</button>
          <select
            aria-label="Director display"
            onChange={(e) => void windowAction('monitor', Number(e.target.value))}
          >
            <option value="">Move to display…</option>
            {displays.map((display) => (
              <option value={display.index} key={display.index}>
                {display.name} · {display.width}×{display.height}
              </option>
            ))}
          </select>
          <button onClick={() => setClean(true)}>Hide interface</button>
        </header>
      )}
      {!clean && (
        <nav>
          <label>
            View
            <select
              aria-label="Director viewing mode"
              disabled={recording !== 'idle'}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="editor">Editor Render</option>
              <option value="capture">Live Game Capture</option>
              <option disabled>Connected Cinematic Camera · requires an engine spectator adapter</option>
            </select>
          </label>
          <span>
            {mode === 'editor'
              ? linked && live
                ? 'Spark render · linked live object transforms · static poses'
                : 'Independent Spark camera · editor assets'
              : 'Actual selected game feed · uses the game’s camera'}
          </span>
          {mode === 'editor' && (
            <label>
              <input
                type="checkbox"
                checked={linked}
                onChange={(e) => {
                  setLinked(e.target.checked);
                  if (!e.target.checked) setLive(null);
                }}
              />
              Link connected Halo objects (read only)
            </label>
          )}
          {mode === 'capture' && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={audio}
                  disabled={!!feed}
                  onChange={(e) => setAudio(e.target.checked)}
                />
                Request shared game audio
              </label>
              <button disabled={recording !== 'idle'} onClick={() => void share()}>
                Choose game window…
              </button>
            </>
          )}
          <button
            disabled={embedded || recording !== 'idle'}
            title={embedded ? 'Pop out the Director to save a video recording.' : undefined}
            onClick={() => void record()}
          >
            Record video…
          </button>
          <button
            disabled={recording === 'idle' || recording === 'saving'}
            onClick={() => {
              starting.current?.abort();
              active.current?.stop();
            }}
          >
            {recording === 'preparing' ? 'Cancel recording' : 'Stop & save'}
          </button>
          <button
            disabled={!['paused', 'recording'].includes(recording)}
            onClick={() => (recording === 'paused' ? active.current?.resume() : active.current?.pause())}
          >
            {recording === 'paused' ? 'Resume' : 'Pause'}
          </button>
          <output aria-live="polite">
            {recording} · {elapsed.toFixed(1)}s
          </output>
        </nav>
      )}
      {!clean && (
        <div className="gs-director-settings">
          <label>
            Frame rate
            <select
              aria-label="Frame rate"
              value={fps}
              disabled={recording !== 'idle'}
              onChange={(e) => setFps(Number(e.target.value))}
            >
              {[24, 30, 60].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Render width
            <select
              aria-label="Render width"
              value={resolution}
              disabled={recording !== 'idle'}
              onChange={(e) => setResolution(Number(e.target.value))}
            >
              <option value="0">Window resolution</option>
              <option value="1920">1920 pixels</option>
              <option value="2560">2560 pixels</option>
              <option value="3840">3840 pixels</option>
            </select>
          </label>
          <label>
            Quality
            <select
              aria-label="Quality"
              value={quality}
              disabled={recording !== 'idle'}
              onChange={(e) => setQuality(Number(e.target.value))}
            >
              <option value="6000000">6 Mbps</option>
              <option value="12000000">12 Mbps</option>
              <option value="24000000">24 Mbps</option>
            </select>
          </label>
          <label>
            Countdown
            <select aria-label="Countdown" value={countdown} disabled={recording!=='idle'} onChange={(e) => setCountdown(Number(e.target.value))}>
              <option value="0">None</option>
              <option value="3">3 seconds</option>
              <option value="5">5 seconds</option>
            </select>
          </label>
          <details className="gs-director-output">
            <summary>Recording output · {outputDirectory?'named takes':'choose each time'}</summary>
            <div className="gs-director-output-menu" role="group" aria-label="Recording output settings" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();const details=e.currentTarget.closest('details');if(details){details.open=false;details.querySelector('summary')?.focus();}}}}>
            <label>Recording folder<input aria-label="Recording folder" value={outputDirectory} disabled={recording!=='idle'} onChange={e=>setOutputDirectory(e.target.value)} placeholder="Empty: show Save dialog · or enter an existing absolute folder"/></label>
            <label>Next take filename<input aria-label="Next take filename" value={takeName} disabled={recording!=='idle'} onChange={e=>setTakeName(e.target.value)} maxLength={160}/></label>
            <small>The folder is remembered for this map. Each successful take gets a fresh name; existing files stay protected. Leave the folder empty to choose a file in the Save dialog.</small>
            </div>
          </details>
          <span>
            Hide the interface with the button above; press Esc to restore it. OBS can capture this window
            directly. An independent engine spectator feed is not implemented for MCC.
          </span>
        </div>
      )}
      <div className="gs-director-stage">
        {mode === 'capture' ? (
          <video ref={video} autoPlay playsInline muted />
        ) : opened ? (
          <Suspense fallback={<p>Preparing map…</p>}>
            {opened.project.quickForge ? (
              <SourceStage
                projectId={projectId}
                document={opened.project.quickForge}
                sourceId={opened.project.quickForge.placements[0]?.sourceProjectId ?? ''}
                animation={null}
                onError={setMessage}
                cinema={{
                      externalAuthority:true,
                  locked,
                  rig: composition ? (
                    <DirectorRig
                      composition={composition}
                      objects={cameraObjects}
                      bridge={bridge}
                      resolution={resolution}
                      onEnded={(pose) =>
                        void update((old) => ({ ...old, playing: false, playheadMs: duration, pose }))
                      }
                    />
                  ) : null,
                }}
              />
            ) : (
              <World
                    externalCameraAuthority
                project={displayedProject!}
                inspection={opened.inspection}
                assetMeshes={{}}
                edit={() => setMessage('Edit the map in the main Spark window.')}
                notify={setMessage}
                selectedId={null}
                cinematic
                cameraLocked={locked}
                viewportChildren={
                  composition ? (
                    <DirectorRig
                      composition={composition}
                      objects={cameraObjects}
                      bridge={bridge}
                      resolution={resolution}
                      onEnded={(pose) =>
                        void update((old) => ({ ...old, playing: false, playheadMs: duration, pose }))
                      }
                    />
                  ) : null
                }
              />
            )}
          </Suspense>
        ) : (
          <p>Opening your preserved map…</p>
        )}
      </div>
      {!clean && composition && mode === 'editor' && (
        <section className="gs-director-cameras">
          <label>
            Camera
            <select
              value={composition.selected ?? ''}
              onChange={(e) => {
                const shot = composition.shots.find((shot) => shot.id === e.target.value);
                if (shot)
                  void update((old) => ({
                    ...old,
                    selected: shot.id,
                    pose: {
                      position: shot.cameraPosition,
                      lookAt: shot.lookAt,
                      fov: shot.fov,
                      roll: shot.roll,
                    },
                    tracking: 'fixed',
                    playing: false,
                  }));
              }}
            >
              <option value="">Free composition</option>
              {composition.shots.map((shot) => (
                <option value={shot.id} key={shot.id}>
                  {shot.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={capture}>Save camera / keyframe</button>
          <label>
            Movement
            <select
              value={composition.tracking}
              onChange={(e) => {
                const tracking = e.target.value as DirectorComposition['tracking'];
                void update((old) => ({
                  ...old,
                  tracking,
                  pose: bridge.current.pose ?? old.pose,
                  startedAtMs: Date.now(),
                }));
              }}
            >
              <option value="free">Free camera</option>
              <option value="fixed">Fixed shot</option>
              <option value="follow">Follow object</option>
              <option value="lookAt">Look at object</option>
              <option value="orbit">Orbit object</option>
            </select>
          </label>
          <label>
            Target
            <select
              value={composition.target ?? ''}
              onChange={(e) =>
                void update((old) => ({ ...old, target: e.target.value || null, startedAtMs: Date.now() }))
              }
            >
              <option value="">Choose object…</option>
              {cameraObjects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            FOV
            <NumberField
              label="Director field of view"
              min={10}
              max={140}
              value={composition.pose.fov}
              onCommit={(fov) =>
                void update((old) => ({
                  ...old,
                  pose: { ...(bridge.current.pose ?? old.pose), fov },
                }))
              }
            />
          </label>
          <label>
            Roll
            <NumberField
              label="Director camera roll"
              min={-180}
              max={180}
              value={composition.pose.roll}
              onCommit={(roll) =>
                void update((old) => ({
                  ...old,
                  pose: { ...(bridge.current.pose ?? old.pose), roll },
                }))
              }
            />
          </label>
          <button
            disabled={!composition.shots.length}
            onClick={() =>
              void update((old) => ({
                ...old,
                playing: !old.playing,
                playheadMs: old.playing
                  ? Math.min(duration, old.playheadMs + Date.now() - old.startedAtMs)
                  : old.playheadMs,
                startedAtMs: Date.now(),
              }))
            }
          >
            {composition.playing ? 'Pause timeline' : 'Play camera path'}
          </button>
          <input
            aria-label="Director timeline"
            type="range"
            min="0"
            max={duration || 1}
            value={composition.playheadMs}
            onChange={(e) =>
              void update((old) => ({ ...old, playing: false, playheadMs: Number(e.target.value) }))
            }
          />
          <span>{bridge.current.pose?.position.map((v) => v.toFixed(2)).join(', ')}</span>
        </section>
      )}
      {!clean && composition?.selected && mode === 'editor' && (
        <div className="gs-director-key-editor">
          {composition.shots
            .filter((shot) => shot.id === composition.selected)
            .map((shot) => (
              <div key={shot.id} className="gs-director-key-editor">
                <label>
                  Name
                  <input
                    aria-label="Camera name"
                    value={shot.name}
                    maxLength={120}
                    onChange={(e) => {
                      const name = e.target.value;
                      if (name.trim())
                        void update((old) => ({
                          ...old,
                          shots: old.shots.map((key) => (key.id === shot.id ? { ...key, name } : key)),
                        }));
                    }}
                  />
                </label>
                <label>
                  Duration (seconds)
                  <input
                    aria-label="Camera shot duration"
                    type="number"
                    min="0.1"
                    max="600"
                    step="0.1"
                    value={shot.durationMs / 1000}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      if (Number.isFinite(seconds) && seconds >= 0.1 && seconds <= 600)
                        void update((old) => ({
                          ...old,
                          shots: old.shots.map((key) =>
                            key.id === shot.id ? { ...key, durationMs: Math.round(seconds * 1000) } : key,
                          ),
                        }));
                    }}
                  />
                </label>
                <label>
                  Transition
                  <select
                    aria-label="Camera transition"
                    value={shot.easing}
                    onChange={(e) =>
                      void update((old) => ({
                        ...old,
                        shots: old.shots.map((key) =>
                          key.id === shot.id ? { ...key, easing: e.target.value as typeof key.easing } : key,
                        ),
                      }))
                    }
                  >
                    <option value="smooth">Smooth</option>
                    <option value="linear">Linear</option>
                    <option value="cut">Cut</option>
                  </select>
                </label>
                <button
                  disabled={!bridge.current.pose}
                  onClick={() => {
                    const pose = bridge.current.pose;
                    if (pose)
                      void update((old) => ({
                        ...old,
                        pose,
                        shots: old.shots.map((key) =>
                          key.id === shot.id
                            ? {
                                ...key,
                                cameraPosition: pose.position,
                                lookAt: pose.lookAt,
                                fov: pose.fov,
                                roll: pose.roll,
                              }
                            : key,
                        ),
                      }));
                  }}
                >
                  Update camera from view
                </button>
                <button
                  onClick={() =>
                    void update((old) => ({
                      ...old,
                      selected: null,
                      playing: false,
                      shots: old.shots.filter((key) => key.id !== shot.id),
                    }))
                  }
                >
                  Delete camera
                </button>
              </div>
            ))}
        </div>
      )}
      {!clean && (message || error) && (
        <p className="gs-director-message" role="status">
          {error || message}
        </p>
      )}
    </div>
  );
}
