import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { call } from '../api';
import type { AudioPreview, SoundInspection, SoundPermutation } from '../types';
import type { CueName, LocalCueReference } from '../interfacePreferences';
import { Notice, Pill } from './ui';

export default function Sound({ projectId, tagId, sourceHash = '', onAssign }: { projectId: string; tagId: number; sourceHash?: string; onAssign?: (cue: CueName, ref: LocalCueReference) => void }) {
  const [inspection, setInspection] = useState<SoundInspection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState<{ url: string; name: string; sha256: string } | null>(null);
  const request = useRef(0);
  const url = useRef<string | null>(null);
  useEffect(() => {
    const token = ++request.current;
    setInspection(null);
    setClip(null);
    setError('');
    setBusy(true);
    call<SoundInspection>('inspect_sound', { projectId, tagId })
      .then((result) => {
        if (request.current === token) setInspection(result);
      })
      .catch((e) => {
        if (request.current === token) setError(String(e));
      })
      .finally(() => {
        if (request.current === token) setBusy(false);
      });
    return () => {
      ++request.current;
      if (url.current) {
        URL.revokeObjectURL(url.current);
        url.current = null;
      }
    };
  }, [projectId, tagId]);
  async function preview(permutation: SoundPermutation) {
    const token = ++request.current;
    setBusy(true);
    setError('');
    setClip(null);
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    try {
      const result = await call<AudioPreview>('preview_sound', {
        projectId,
        tagId,
        pitchRange: permutation.pitchRange,
        permutation: permutation.permutation,
      });
      if (request.current !== token) return;
      const blob = new Blob([new Uint8Array(result.bytes)], { type: result.mime });
      const objectUrl = URL.createObjectURL(blob);
      url.current = objectUrl;
      setClip({ url: objectUrl, name: result.name, sha256: result.sha256 });
    } catch (e) {
      if (request.current === token) setError(String(e));
    } finally {
      if (request.current === token) setBusy(false);
    }
  }
  return (
    <section className="analysis-card sound-inspector">
      <h3>
        <Volume2 size={18} />
        Source sound permutations
      </h3>
      <p className="subtle">
        Preview uses actual embedded, validated Ogg/Vorbis data. Unsupported codecs and unavailable external
        samples remain explicit. Audio does not start automatically.
      </p>
      {busy && <p role="status">Reading bounded audio data…</p>}
      {error && <Notice>{error}</Notice>}
      {inspection?.warnings.map((value, i) => (
        <Notice key={i}>{value}</Notice>
      ))}
      {inspection?.permutations.map((p) => (
        <div className="sound-row" key={`${p.pitchRange}:${p.permutation}`}>
          <div>
            <strong>{p.name || `Range ${p.pitchRange} / permutation ${p.permutation}`}</strong>
            <small>
              {p.format} · {p.channels} channel(s) · {p.sampleRate} Hz · {p.byteLength.toLocaleString()} bytes
              {p.durationSeconds !== null && ` · ${p.durationSeconds.toFixed(2)} s`}
            </small>
            {p.reason && <p>{p.reason}</p>}
          </div>
          <Pill tone={p.available ? 'green' : 'muted'}>{p.embedded ? 'Embedded' : 'External'}</Pill>
          <button disabled={!p.available || busy} onClick={() => void preview(p)}>
            Load preview
          </button>
          {onAssign && p.available && p.embedded && <div className="sound-assign">
            <small>Assign local cue:</small>
            {([['select', 'Navigate'], ['confirm', 'Confirm'], ['warning', 'Warning']] as const).map(([cue, label]) => (
              <button key={cue} type="button" className="small-button" onClick={() => onAssign(cue, {
                projectId, tagId, pitchRange: p.pitchRange, permutation: p.permutation,
                sourceHash, label: `${p.name || `Tag ${tagId}`} (${label})`,
              })}>{label}</button>
            ))}
          </div>}

        </div>
      ))}
      {inspection && !inspection.permutations.length && <p>No bounded sound permutations were decoded.</p>}
      {clip && (
        <div className="sound-player">
          <strong>{clip.name}</strong>
          <audio
            controls
            preload="metadata"
            src={clip.url}
            onError={() =>
              setError(
                'The webview could not decode this source audio. Container validation is not a playback guarantee.',
              )
            }
          >
            Audio playback is unavailable in this webview.
          </audio>
          <small>
            SHA-256 <code>{clip.sha256}</code>
          </small>
        </div>
      )}
    </section>
  );
}
