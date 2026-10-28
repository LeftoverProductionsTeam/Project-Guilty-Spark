import { useEffect, useRef, useState } from 'react';
import { call, native } from '../api';
import { animationMapping } from '../animation';
import type { AnimationAsset, AnimationClip, AnimationPreview, AnimationAssignment } from '../animation';
import type { Project, MapInspection, MeshData } from '../types';
import { sourceSpartan } from '../sourceSpartan';
import '../features.css';
import { useMapState } from '../mapSession';
export default function AnimationStudio({
  project,
  inspection,
  edit,
  onPreview,
  notify,
}: {
  project: Project;
  inspection: MapInspection | null;
  edit: (p: Project, description: string) => void;
  onPreview: (p: AnimationPreview | null) => void;
  notify: (message: string) => void;
}) {
  const assets = project.animations ?? [];
  const [id, setId] = useMapState(project.id, 'animation.selected', assets[0]?.id ?? ''),
    [target, setTarget] = useMapState(project.id, 'animation.target', sourceSpartan(inspection)?.id ?? 0),
    [clip, setClip] = useState<AnimationClip | null>(null),
    [busy, setBusy] = useState(false),
    [actorReady, setActorReady] = useState(false),
    [message, setMessage] = useState(''),
    [playing, setPlaying] = useState(false),
    [loop, setLoop] = useMapState(project.id, 'animation.loop', true),
    [speed, setSpeed] = useMapState(project.id, 'animation.speed', 1),
    [rootMotion, setRootMotion] = useMapState(project.id, 'animation.rootMotion', false),
    [time, setTime] = useMapState(project.id, `animation.time.${id || 'none'}`, 0),
    [shownTime, setShownTime] = useState(0),
    [seek, setSeek] = useState(0);
  const latest = useRef(project);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setActorReady(!!document.querySelector<HTMLCanvasElement>('.director-stage canvas')?.dataset.gsActor),
      100,
    );
    return () => clearInterval(timer);
  }, []);
  latest.current = project;
  const asset = assets.find((a) => a.id === id),
    bipeds = inspection?.tags.filter((t) => t.class === 'bipd' && !t.external) ?? [];
  useEffect(() => {
    if (!playing || !clip) return;
    const timer = setInterval(() => {
      try {
        const frame = JSON.parse(
          document.querySelector<HTMLCanvasElement>('.director-stage canvas')?.dataset.gsAnimation ?? '{}',
        );
        if (frame.name === clip.name) {
          const duration = (clip.frameCount - 1) / clip.fps;
          setShownTime(loop && duration > 0 ? frame.time % duration : Math.min(frame.time, duration));
        }
      } catch {
        /* telemetry can be absent while a model loads */
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing, clip, loop]);
  useEffect(() => {
    if (!assets.some((a) => a.id === id)) setId(assets.at(-1)?.id ?? '');
  }, [assets, id]);
  useEffect(() => {
    let alive = true;
    setClip(null);
    setPlaying(false);
    setSeek((s) => s + 1);
    if (asset?.kind === 'clip')
      void call<AnimationClip>('preview_animation_clip', { projectId: project.id, asset })
        .then((c) => {
          if (alive) setClip(c);
        })
        .catch((e) => {
          if (alive) setMessage(String(e));
        });
    else if (asset)
      setMessage(
        'Animation graphs can replace a compatible biped graph. Drop their JMA/JMM sources to preview individual clips.',
      );
    return () => {
      alive = false;
    };
  }, [project.id, asset?.id, asset?.dataSha256]);
  useEffect(() => {
    onPreview(clip ? { clip, targetTagId: target, playing, loop, speed, rootMotion, time, seek } : null);
  }, [clip, target, playing, loop, speed, rootMotion, time, seek, onPreview]);
  async function importFiles() {
    setBusy(true);
    try {
      const imported = await call<AnimationAsset[]>('import_animation_sources', {
        projectId: project.id,
        paths: null,
      });
      if (imported.length && latest.current.id === project.id) {
        edit(
          { ...latest.current, animations: [...(latest.current.animations ?? []), ...imported] },
          'Import animation sources',
        );
        setId(imported.at(-1)!.id);
        setMessage(
          `Imported ${imported.length} animation source${imported.length === 1 ? '' : 's'}. Select a biped to preview or assign.`,
        );
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function assign() {
    if (!asset || !project.source || !inspection) return;
    setBusy(true);
    try {
      const tag = bipeds.find((t) => t.id === target);
      if (!tag) throw Error('Choose a biped from this map.');
      const response = await call<{ mesh: MeshData }>('preview_owned_object_model', {
        projectId: project.id,
        tagId: tag.id,
        sourceSha256: project.source.sha256,
      });
      const rig = response.mesh.rig;
      if (!rig) throw Error('This biped has no verified rig.');
      if (asset.nodeNames.length !== rig.nodes.length || asset.checksum !== rig.checksum)
        throw Error(
          'Native animation assignment requires the same skeleton checksum and node count. Re-export on this biped’s original rig.',
        );
      if (clip) animationMapping(clip, rig);
      const binding: AnimationAssignment = {
        id: crypto.randomUUID(),
        assetId: asset.id,
        targetTagId: tag.id,
        targetTagPath: tag.path,
        sourceSha256: project.source.sha256,
        mode: asset.kind === 'graph' ? 'replace-graph' : 'custom',
        playOnTake: false,
      };
      const p = latest.current;
      edit(
        {
          ...p,
          animationAssignments: [
            ...(p.animationAssignments ?? []).filter(
              (a) =>
                !(
                  a.targetTagId === tag.id &&
                  (a.assetId === asset.id || (asset.kind === 'graph' && a.mode === 'replace-graph'))
                ),
            ),
            binding,
          ],
        },
        asset.kind === 'graph' ? 'Assign replacement biped animation graph' : 'Assign custom biped animation',
      );
      setMessage(
        asset.kind === 'graph'
          ? 'Replacement graph assigned to the next native MCC build. The preserved source stays intact.'
          : 'Custom animation assigned. Enable Play during native take to perform it in the compiled camera variant.',
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="animation-studio" open>
      <summary>Biped animations · import, assign &amp; perform</summary>
      <p>
        Drop Halo JMA/JMM animation sources, FBX, or a complete model_animations graph into Spark. FBX uses
        your installed MCC converter. Bones must match the selected biped.
      </p>
      <button disabled={!native || busy} onClick={() => void importFiles()}>
        {busy ? 'Checking animation…' : 'Import animations…'}
      </button>
      <button
        disabled={!actorReady}
        onClick={() => window.dispatchEvent(new Event('gs:frame-director-actor'))}
      >
        {actorReady ? 'Frame biped' : 'Loading biped…'}
      </button>
      <label>
        Animation library
        <select aria-label="Animation library" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Choose an animation…</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.kind === 'clip' ? `${a.frameCount} frames` : `${a.animationNames.length} clips`}
            </option>
          ))}
        </select>
      </label>
      {bipeds.length > 0 && (
        <label>
          Biped
          <select
            aria-label="Animation biped"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          >
            {bipeds.map((t) => (
              <option key={t.id} value={t.id}>
                {t.path}
              </option>
            ))}
          </select>
        </label>
      )}
      {asset && (
        <p>
          {asset.nodeNames.length} bones · {asset.fps} fps ·{' '}
          {asset.kind === 'graph'
            ? 'complete graph'
            : `${(Math.max(0, asset.frameCount - 1) / asset.fps).toFixed(2)} seconds`}
        </p>
      )}
      {clip && (
        <>
          <div className="analysis-actions">
            <button
              onClick={() => {
                if (playing) {
                  setTime(shownTime);
                  setSeek((s) => s + 1);
                }
                setPlaying((p) => !p);
              }}
            >
              {playing ? 'Pause animation' : 'Play animation'}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setTime(0);
                setSeek((s) => s + 1);
              }}
            >
              Restart animation
            </button>
          </div>
          <label>
            Animation time
            <input
              aria-label="Animation time"
              type="range"
              min={0}
              max={Math.max(0, (clip.frameCount - 1) / clip.fps)}
              step={1 / clip.fps}
              value={playing ? shownTime : time}
              onChange={(e) => {
                setPlaying(false);
                setTime(Number(e.target.value));
                setSeek((s) => s + 1);
              }}
            />
          </label>
          <label>
            Playback speed
            <select
              aria-label="Animation speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
            Loop animation
          </label>
          <label>
            <input type="checkbox" checked={rootMotion} onChange={(e) => setRootMotion(e.target.checked)} />
            Apply animation root motion in the preview
          </label>
        </>
      )}
      {asset && (
        <button disabled={busy || !project.source || !target} onClick={() => void assign()}>
          {asset.kind === 'graph' ? 'Assign replacement graph' : 'Assign custom animation to biped'}
        </button>
      )}
      {(project.animationAssignments ?? []).map((a) => (
        <div key={a.id} className="animation-assignment">
          <strong>{assets.find((x) => x.id === a.assetId)?.name}</strong>
          <small>
            {a.targetTagPath} · {a.mode === 'replace-graph' ? 'replace complete graph' : 'custom action'}
          </small>
          {a.mode === 'custom' && (
            <label>
              <input
                type="checkbox"
                checked={a.playOnTake}
                onChange={(e) =>
                  edit(
                    {
                      ...project,
                      animationAssignments: project.animationAssignments!.map((x) =>
                        x.id === a.id
                          ? { ...x, playOnTake: e.target.checked }
                          : e.target.checked && x.mode === 'custom'
                            ? { ...x, playOnTake: false }
                            : x,
                      ),
                    },
                    'Set native take animation',
                  )
                }
              />
              Play on your character during the native camera take
            </label>
          )}
          <button
            className="small-button"
            onClick={() =>
              edit(
                {
                  ...project,
                  animationAssignments: project.animationAssignments!.filter((x) => x.id !== a.id),
                },
                'Remove animation assignment',
              )
            }
          >
            Remove assignment
          </button>
        </div>
      ))}
      <p className="subtle">
        Complete graphs replace the target biped’s graph in a rebuilt map. Individual clips compile into
        separate custom-action graphs so existing locomotion and weapon animations are preserved. Build and
        reload are required for in-game changes.
      </p>
      {message && <p role="status">{message}</p>}
      {asset && (
        <button
          className="small-button"
          disabled={busy}
          onClick={() => {
            edit(
              {
                ...project,
                animations: assets.filter((a) => a.id !== asset.id),
                animationAssignments: (project.animationAssignments ?? []).filter(
                  (a) => a.assetId !== asset.id,
                ),
              },
              'Remove animation from project',
            );
            setId('');
          }}
        >
          Remove animation from project
        </button>
      )}
    </details>
  );
}
