import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { EditorAudioSession } from '../editorAudio';
import { useMapState } from '../mapSession';
import type { MapInspection, Project } from '../types';
import '../viewportAssets.css';
const Context = createContext<EditorAudioSession | null>(null);
export const useEditorAudio = () => useContext(Context);
export function EditorAudioProvider({
  project,
  inspection,
  active,
  resourceScope,
  children,
}: {
  project: Project | null;
  inspection: MapInspection | null;
  active: boolean;
  resourceScope: string;
  children: ReactNode;
}) {
  const id = project?.id ?? 'no-map';
  const session = useMemo(() => new EditorAudioSession(id), [id]);
  const knownResources = useRef(new Map<string, string>());
  for (const [owner, resources] of JSON.parse(resourceScope) as [string, unknown][])
    knownResources.current.set(owner, JSON.stringify(resources ?? {}));
  const owners = new Set([
    id,
    ...(project?.audioPreview?.emitters.map((emitter) => emitter.sourceProjectId ?? id) ?? []),
  ]);
  const soundScope = JSON.stringify(
    [...owners].sort().map((owner) => [owner, knownResources.current.get(owner) ?? '']),
  );
  const [muted] = useMapState(id, 'editor-sound.muted', false),
    [volume] = useMapState(id, 'editor-sound.volume', 0.35),
    [bspIndex] = useMapState(id, 'world.bsp', 0),
    [target] = useMapState(id, 'level.target', 'auto');
  useEffect(() => {
    if (!project) return;
    session.connect();
    return () => session.dispose();
  }, [session, !!project]);
  useEffect(() => {
    if (project)
      session.update({
        project,
        inspection,
        active: active && target !== 'live',
        muted,
        volume:
          typeof volume === 'number' && Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.35,
        bspIndex,
        resourceScope: soundScope,
      });
  }, [session, project, inspection, active, muted, volume, bspIndex, target, soundScope]);
  return <Context.Provider value={project && active ? session : null}>{children}</Context.Provider>;
}
export function EditorSoundControls({ projectId }: { projectId: string }) {
  const session = useEditorAudio();
  const [muted, setMuted] = useMapState(projectId, 'editor-sound.muted', false),
    [volume, setVolume] = useMapState(projectId, 'editor-sound.volume', 0.35);
  if (!session) return null;
  return (
    <AudioControls
      session={session}
      muted={muted}
      volume={Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.35}
      setMuted={setMuted}
      setVolume={setVolume}
    />
  );
}
function AudioControls({
  session,
  muted,
  volume,
  setMuted,
  setVolume,
}: {
  session: EditorAudioSession;
  muted: boolean;
  volume: number;
  setMuted: (value: boolean) => void;
  setVolume: (value: number) => void;
}) {
  const status = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return (
    <div
      className="editor-sound-controls"
      role="group"
      aria-label="Editor map sound"
      title="Editor ambience and audition volume. Halo and recording output have separate audio controls."
    >
      <button
        aria-label={muted ? 'Unmute map sounds' : 'Mute map sounds'}
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <input
        type="range"
        aria-label="Map sound volume"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        aria-valuetext={`${Math.round(volume * 100)} percent`}
        onChange={(event) => setVolume(Number(event.target.value))}
      />
      <meter
        min="0"
        max="1"
        value={Math.min(1, status.rms * 4)}
        aria-label="Map sound activity"
        data-rms={status.rms}
        data-voices={status.voices}
        data-phase={status.phase}
        title={status.detail}
      />
      {(status.phase === 'needsGesture' || status.phase === 'paused') && (
        <button onClick={() => void session.resume().catch(() => {})}>Play map ambience</button>
      )}
      {status.phase === 'unavailable' && (
        <span className="editor-sound-issue" title={status.detail}>
          Sound unavailable
        </span>
      )}
    </div>
  );
}
