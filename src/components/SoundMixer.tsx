import { useEffect, useMemo, useRef, useState } from 'react';
import { call, native } from '../api';
import type { MapInspection, Project, SoundInspection, Vec3 } from '../types';
import { loadMapSoundClip } from '../soundClipLoader';
import type { LoopingInspection } from '../soundClipLoader';
import {
  createEmitter,
  emptySoundScene,
  followAudioListener,
  SOUND_BUSES,
  SOUND_EVENTS,
  sourceSoundEmitters,
  SpatialSoundMixer,
  validateSoundScene,
} from '../spatialAudio';
import type { SoundEmitter, SoundEvent, SoundScene } from '../spatialAudio';
import { Notice, NumberField } from './ui';
import { useMapState } from '../mapSession';
import {useEditorAudio} from './EditorAudio';
export default function SoundMixer({
  project,
  inspection,
  sourceProjectId,
  tagId,
  edit,
}: {
  project: Project;
  inspection: MapInspection | null;
  sourceProjectId: string;
  tagId: number | null;
  edit: (p: Project, description: string) => void;
}) {
  const shared=useEditorAudio();
  const fallback = useMemo(emptySoundScene, []),
    scene = project.audioPreview ?? fallback,
    sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [selected, select] = useMapState(project.id, 'sound-emitter-selection', ''),
    [event, setEvent] = useState<SoundEvent>('manual'),
    [active, setActive] = useState(false),
    [scenePlaying, setScenePlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [stats, setStats] = useState({ voices: 0, loading: 0, cachedClips: 0, cachedBytes: 0 });
  const [loopTrack, setLoopTrack] = useMapState(project.id, 'sound-loop-track', 0);
  const loopOptions =
    inspection?.tags
      .find((tag) => tag.id === tagId && tag.class === 'lsnd')
      ?.references.filter((reference) => /^Track \d+ · Loop$/.test(reference.label))
      .map((reference) => ({
        index: Number(reference.label.match(/^Track (\d+)/)![1]) - 1,
        id: reference.targetId,
      })) ?? [];
  const chosenTrack =
    loopOptions.find((option) => option.index === loopTrack)?.index ?? loopOptions[0]?.index ?? 0;
  const mixer = useRef<SpatialSoundMixer | null>(null),
    context = useRef<AudioContext | null>(null),
    unsubscribe = useRef<(() => void) | null>(null),
    mounted = useRef(true),
    epoch = useRef(0),
    playingScene = useRef(false),
    working = useRef(false);
  function stop() {
    epoch.current++;
    playingScene.current = false;
    unsubscribe.current?.();
    unsubscribe.current = null;
    const old = mixer.current;
    mixer.current = null;
    if(shared)shared.stop();else old?.dispose();
    const ctx = context.current;
    context.current = null;
    if (ctx) void ctx.close().catch(() => {});
    if (mounted.current) {
      setActive(false);
      setScenePlaying(false);
      setStats({ voices: 0, loading: 0, cachedClips: 0, cachedBytes: 0 });
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if(shared){mixer.current=null;unsubscribe.current?.();unsubscribe.current=null;}else stop();
    };
  }, [project.id, (inspection?.sha256??project.source?.sha256??''),shared]);
  useEffect(()=>{if(!shared)return;const update=()=>{const status=shared.getSnapshot();setActive(status.voices>0||status.phase==='loading'||status.phase==='needsGesture');setStats({voices:status.voices,loading:status.phase==='loading'?1:0,cachedClips:status.cachedClips,cachedBytes:status.cachedBytes});};update();return shared.subscribe(update);},[shared]);
  useEffect(() => {
    try {
      if(!shared)mixer.current?.configure(scene);
      if (playingScene.current && mixer.current) {
        const current = mixer.current;
        void (async () => {
          for (const emitter of scene.emitters.filter((e) => e.enabled && e.loop && e.event === 'ambient')) {
            if (mixer.current !== current || !playingScene.current) return;
            if (!current.repeats(emitter)) continue;
            try {
              await current.play(emitter);
            } catch (error) {
              if (mounted.current && mixer.current === current) setError(String(error));
            }
          }
        })();
      }
    } catch (error) {
      setError(String(error));
    }
  }, [scene]);
  function change(next: SoundScene) {
    const problems = validateSoundScene(next);
    if (problems.length) {
      setError(problems.join(' '));
      return;
    }
    setError('');
    edit({ ...project, audioPreview: next }, 'Edit map sound rehearsal');
  }
  function update(patch: Partial<SoundEmitter>) {
    if (emitter)
      change({
        ...scene,
        emitters: scene.emitters.map((e) => (e.id === emitter.id ? { ...e, ...patch } : e)),
      });
  }
  async function action(task: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    const request = epoch.current;
    try {
      await task();
    } catch (error) {
      if (mounted.current && request === epoch.current) setError(String(error));
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function ensure() {
    if(shared){const value=await shared.ensure();mixer.current=value;setActive(true);return value;}
    if (mixer.current) return mixer.current;
    const request = epoch.current,
      ctx = new AudioContext();
    context.current = ctx;
    try {
      await ctx.resume();
      if (!mounted.current || request !== epoch.current) {
        await ctx.close();
        throw Error('Sound rehearsal was stopped.');
      }
      let value: SpatialSoundMixer;
      value = new SpatialSoundMixer(
        ctx,
        (e) =>
          loadMapSoundClip(
            ctx,
            e,
            sourceProjectId,
            (inspection?.sha256??project.source?.sha256??''),
            () => mixer.current !== value || request !== epoch.current,
          ),
        () => {
          if (mounted.current && mixer.current === value) setStats({ ...value.stats });
          if (mounted.current && mixer.current === value && value.error) setError(value.error);
        },
      );
      value.configure(sceneRef.current);
      mixer.current = value;
      unsubscribe.current = followAudioListener(project.id, (pose) => value.setListener(pose));
      setActive(true);
      return value;
    } catch (error) {
      if (context.current === ctx) context.current = null;
      if (ctx.state !== 'closed') await ctx.close().catch(() => {});
      throw error;
    }
  }
  async function add() {
    if (tagId === null || !inspection) return;
    const request = epoch.current;
    let looping: LoopingInspection | null = null;
    if (inspection?.tags.find((tag) => tag.id === tagId)?.class === 'lsnd') {
      looping = await call<LoopingInspection>('inspect_looping_sound', { projectId: sourceProjectId, tagId });
      if (looping.sourceSha256 !== (inspection?.sha256??project.source?.sha256??'')) throw Error('Looping source changed.');
    }
    const track = looping?.tracks.find((track) => track.index === chosenTrack && track.loopTagId !== null);
    if (looping && !track)
      throw Error(
        'This looping tag has no main loop. Choose its individual sound tags to audition its clips.',
      );
    const soundId = track?.loopTagId ?? tagId;
    const report = await call<SoundInspection>('inspect_sound', {
      projectId: sourceProjectId,
      tagId: soundId,
    });
    if (!mounted.current || request !== epoch.current) return;
    if (report.sourceSha256 !== (inspection?.sha256??project.source?.sha256??'')) throw Error('Sound source changed.');
    const sample = report.permutations.find((p) => p.available && p.chainStart !== false);
    if (!sample)
      throw Error(
        report.permutations[0]?.reason ??
          'No playable sound permutation. Connect this map’s original sound resources.',
      );
    const origin = project.quickForge?.spawns[0]?.position ??
        project.scene.find((o) => o.kind === 'Player spawn')?.position ?? [0, 0, 0],
      next = createEmitter(
        soundId,
        (report.tagPath.split(/[\\/]/).at(-1) ?? 'Map sound').slice(0, 120),
        origin as Vec3,
      );
    if (sourceProjectId !== project.id) {
      next.sourceProjectId = sourceProjectId;
      next.sourceSha256 = (inspection?.sha256??project.source?.sha256??'');
    }
    next.pitchRange = sample.pitchRange;
    next.permutation = sample.permutation;
    const ambience = /ambient|wind|rain|water|loop|music/i.test(report.tagPath);
    if (!ambience) {
      next.loop = false;
      next.event = 'manual';
      next.bus = 'effects';
    }
    if (/music/i.test(report.tagPath)) {
      next.bus = 'music';
      next.spatial = false;
    }
    if (looping && track) {
      next.name = (looping.tagPath.split(/[\\/]/).at(-1) ?? 'Looping sound').slice(0, 120);
      next.loopingSource = { tagId: looping.tagId, track: track.index };
      next.loop = looping.loops;
      next.gain = track.gain;
      next.event = 'ambient';
    }
    change({ ...sceneRef.current, emitters: [...sceneRef.current.emitters, next] });
    select(next.id);
  }
  const emitter = scene.emitters.find((e) => e.id === selected) ?? scene.emitters[0];
  return (
    <section className="sound-mixer" aria-label="Spatial sound rehearsal">
      <h3>Sound events &amp; spatial mixer</h3>
      <p>
        Audition verified map samples in 3D. The viewport camera is the listener; moving around changes
        left/right placement and distance falloff.
      </p>
      <div className="analysis-actions">
        {loopOptions.length > 0 && (
          <label>
            Source track
            <select
              aria-label="Looping sound track"
              value={chosenTrack}
              disabled={busy}
              onChange={(event) => setLoopTrack(Number(event.target.value))}
            >
              {loopOptions.map((option) => (
                <option key={option.index} value={option.index}>
                  Track {option.index + 1} ·{' '}
                  {inspection?.tags
                    .find((tag) => tag.id === option.id)
                    ?.path.split(/[\\/]/)
                    .at(-1)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={!native || busy || tagId === null || scene.emitters.length >= 64}
          onClick={() => void action(add)}
        >
          Add selected sound emitter
        </button>
        <button
          disabled={busy || !inspection || scene.emitters.length >= 64 || sourceProjectId !== project.id}
          onClick={() =>
            void action(async () => {
              if(!inspection)return;
              const request = epoch.current,
                found = await sourceSoundEmitters(inspection, project.scene);
              if (request !== epoch.current || !mounted.current) return;
              const current = sceneRef.current,
                added = found.filter((e) => !current.emitters.some((old) => old.id === e.id));
              let upgraded = 0;
              const existing = current.emitters.map((old) => {
                const native = found.find((e) => e.id === old.id && e.tagId === old.tagId);
                if (native?.loopingSource && !old.loopingSource) {
                  upgraded++;
                  return { ...old, loopingSource: native.loopingSource };
                }
                return old;
              });
              if (!added.length && !upgraded)
                throw Error(
                  'No new placed sound-scenery loops were found. BSP cluster ambience and scripted sounds need their own bindings.',
                );
              if (added.length + current.emitters.length > 64)
                throw Error('Import would exceed 64 emitters. Remove unused emitters before importing.');
              change({ ...current, emitters: [...existing, ...added] });
            })
          }
        >
          Import placed map sound emitters
        </button>
        <button
          disabled={!native || busy || scenePlaying || !scene.emitters.length}
          onClick={() =>
            void action(async () => {
              const m = await ensure();
              playingScene.current = true;
              setScenePlaying(true);
              await m.event('ambient');
              await m.event('mapStart');
            })
          }
        >
          Start sound scene
        </button>
        <button disabled={!active && !busy} onClick={stop}>
          Stop all map sounds
        </button>
        <button
          disabled={!active || busy}
          onClick={() =>
            void action(async () => {
              playingScene.current = false;
              setScenePlaying(false);
              if(shared)await shared.finish();else await mixer.current?.finish();
              stop();
            })
          }
        >
          Finish sound end clips
        </button>
      </div>
      {emitter?.loopingSource && (
        <>
          <p className="subtle">
            Authored main track {emitter.loopingSource.track + 1} includes source intro/end clips, repeat
            flags and flagged fades. Stop all cuts immediately; Finish plays the source ending.
            Alternate/detail sounds and global script/music effects are not sequenced.
          </p>
          <button className="small-button" disabled={busy} onClick={() => update({ loopingSource: null })}>
            Use loop sample only
          </button>
        </>
      )}
      <NumberField
        label="Map sound master volume"
        min={0}
        max={1}
        step={0.05}
        value={scene.master}
        onCommit={(master) => change({ ...scene, master })}
      />
      <label>
        <input
          type="checkbox"
          checked={scene.muted}
          onChange={(e) => change({ ...scene, muted: e.target.checked })}
        />
        Mute sound scene
      </label>
      <div className="sound-buses">
        {SOUND_BUSES.map((bus) => (
          <fieldset key={bus}>
            <legend>{bus}</legend>
            <NumberField
              label={`${bus} bus volume`}
              value={scene.buses[bus].gain}
              min={0}
              max={1}
              step={0.05}
              onCommit={(gain) =>
                change({ ...scene, buses: { ...scene.buses, [bus]: { ...scene.buses[bus], gain } } })
              }
            />
            {(['muted', 'solo'] as const).map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={scene.buses[bus][key]}
                  onChange={(e) =>
                    change({
                      ...scene,
                      buses: { ...scene.buses, [bus]: { ...scene.buses[bus], [key]: e.target.checked } },
                    })
                  }
                />
                {key === 'muted' ? 'Mute' : 'Solo'}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <NumberField
        label="Maximum sound voices"
        value={scene.maxVoices}
        min={1}
        max={32}
        step={1}
        onCommit={(maxVoices) => change({ ...scene, maxVoices })}
      />
      <label>
        Audition an event
        <select
          aria-label="Sound event to audition"
          value={event}
          onChange={(e) => setEvent(e.target.value as SoundEvent)}
        >
          {SOUND_EVENTS.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!native || busy || !scene.emitters.some((e) => e.event === event && e.enabled)}
        onClick={() =>
          void action(async () => {
            await (await ensure()).event(event);
          })
        }
      >
        Play sound event
      </button>
      {!!scene.emitters.length && (
        <label>
          Emitter
          <select aria-label="Map sound emitter" value={emitter?.id} onChange={(e) => select(e.target.value)}>
            {scene.emitters.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {emitter && (
        <div className="sound-emitter-fields">
          <p>{emitter.customSound?`Custom sound · ${emitter.name}`:emitter.sourceProjectId&&emitter.sourceProjectId!==sourceProjectId?`Linked map sound · ${emitter.name}`:inspection?.tags.find((t) => t.id === emitter.tagId)?.path ?? 'Source sound unavailable'}</p>
          <label>
            Event
            <select
              aria-label="Emitter sound event"
              value={emitter.event}
              onChange={(e) => update({ event: e.target.value as SoundEvent })}
            >
              {SOUND_EVENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bus
            <select
              aria-label="Emitter sound bus"
              value={emitter.bus}
              onChange={(e) => update({ bus: e.target.value as SoundEmitter['bus'] })}
            >
              {SOUND_BUSES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {(['enabled', 'loop', 'spatial'] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={emitter[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
              />
              {key === 'spatial' ? 'Positional 3D audio' : key === 'loop' ? 'Loop sample' : 'Emitter enabled'}
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={emitter.followChain !== false}
              onChange={(e) => update({ followChain: e.target.checked })}
            />
            Follow linked sound segments
          </label>
          <div className="vector-fields">
            {(['X', 'Y', 'Z'] as const).map((axis, i) => (
              <NumberField
                key={axis}
                label={`Sound emitter ${axis}`}
                value={emitter.position[i]}
                onCommit={(n) =>
                  update({ position: emitter.position.map((v, j) => (i === j ? n : v)) as Vec3 })
                }
              />
            ))}
          </div>
          <NumberField
            label="Sound emitter gain"
            value={emitter.gain}
            min={0}
            max={2}
            step={0.05}
            onCommit={(gain) => update({ gain })}
          />
          <NumberField
            label="Sound pitch (semitones)"
            value={emitter.pitch}
            min={-12}
            max={12}
            step={1}
            onCommit={(pitch) => update({ pitch })}
          />
          <NumberField
            label="Sound reference distance"
            value={emitter.minDistance}
            min={0.01}
            max={emitter.maxDistance}
            onCommit={(minDistance) => update({ minDistance })}
          />
          <NumberField
            label="Sound maximum distance"
            value={emitter.maxDistance}
            min={emitter.minDistance}
            max={10000}
            onCommit={(maxDistance) => update({ maxDistance })}
          />
          <NumberField
            label="Sound distance rolloff"
            value={emitter.rolloff}
            min={0}
            max={10}
            onCommit={(rolloff) => update({ rolloff })}
          />
          <NumberField
            label="Sound voice priority"
            value={emitter.priority}
            min={0}
            max={100}
            step={1}
            onCommit={(priority) => update({ priority })}
          />
          <NumberField
            label="Sound event cooldown (ms)"
            value={emitter.cooldownMs}
            min={0}
            max={60000}
            step={1}
            onCommit={(cooldownMs) => update({ cooldownMs })}
          />
          <div className="analysis-actions">
            <button
              disabled={!native || busy}
              onClick={() =>
                void action(async () => {
                  await (await ensure()).play(emitter);
                })
              }
            >
              Audition selected emitter
            </button>
            <button
              onClick={() =>
                change({ ...scene, emitters: scene.emitters.filter((e) => e.id !== emitter.id) })
              }
            >
              Remove sound emitter
            </button>
          </div>
        </div>
      )}
      <p role="status">
        {active ? 'Spatial sound rehearsal active' : 'Sound scene stopped'} · {stats.voices}/{scene.maxVoices}{' '}
        voices · {stats.loading} loading · {(stats.cachedBytes / 1048576).toFixed(1)} MiB cached
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="subtle">
        These settings rehearse the editor’s sounds and events. They do not change Halo’s sound classes,
        script events or looping-track transitions. Acoustic occlusion/reverb and engine-event timing still
        require implementation and acceptance. Stop releases all voices; switching maps or tools stops
        playback.
      </p>
    </section>
  );
}
