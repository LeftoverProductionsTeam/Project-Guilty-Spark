import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { call } from '../api';
import type { AudioPreview, SoundInspection, SoundPermutation } from '../types';
import type { CueName, LocalCueReference } from '../interfacePreferences';
import { Notice, Pill } from './ui';
import {useEditorAudio} from './EditorAudio';
import {useMapState} from '../mapSession';

export default function Sound({ projectId, tagId, sourceHash = '', onAssign }: { projectId: string; tagId: number; sourceHash?: string; onAssign?: (cue: CueName, ref: LocalCueReference) => void }) {
  const shared=useEditorAudio();
  const [mapMuted]=useMapState(shared?.projectId??projectId,'editor-sound.muted',false),[mapVolume]=useMapState(shared?.projectId??projectId,'editor-sound.volume',.35);
  const [inspection, setInspection] = useState<SoundInspection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState<{ url: string; name: string; sha256: string } | null>(null);
  const [playing,setPlaying]=useState(false),[repeat,setRepeat]=useState(false),[volume,setVolume]=useState(0.5);
  const [clock,setClock]=useState({position:0,duration:0});
  const player=useRef<HTMLAudioElement>(null);
  const effectiveVolume=volume*(shared?Math.max(0,Math.min(1,mapVolume)):1);
  useEffect(()=>{if(player.current)player.current.volume=effectiveVolume;},[effectiveVolume,clip]);
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
      if(sourceHash&&result.sourceSha256!==sourceHash)throw new Error('Sound source changed; reopen this map.');
      const bytes=new Uint8Array(result.bytes);
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
      if(digest!==result.sha256||!['audio/ogg','audio/wav'].includes(result.mime)||bytes.length>16*1024*1024)throw new Error('Sound playback payload failed verification.');
      const blob = new Blob([bytes], { type: result.mime });
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
        Play original Vorbis or decoded PCM / Xbox ADPCM from this map. Matching installed sound resources
        connect automatically, including MCC's classic sound bank. Missing original resources can be chosen
        in the map library. MCC music/dialogue codecs and native sound functions remain separate.
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
          <Pill tone={p.available ? 'green' : 'muted'}>{p.embedded ? 'Map sample' : p.available?'Verified sounds.map':'Needs sounds.map'}</Pill>
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
          <audio ref={player}
            preload="metadata"
            src={clip.url}
            loop={repeat}
            muted={!!shared&&mapMuted}
            onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)}
            onTimeUpdate={event=>setClock({position:event.currentTarget.currentTime,duration:event.currentTarget.duration||0})}
            onLoadedMetadata={event=>{event.currentTarget.volume=effectiveVolume;setClock({position:0,duration:event.currentTarget.duration});}}
            onError={() =>
              setError(
                'The webview could not decode this source audio. Container validation is not a playback guarantee.',
              )
            }
          >
            Audio playback is unavailable in this webview.
          </audio>
          <div className="analysis-actions">
            <button className="small-button" onClick={()=>{if(!player.current)return;if(playing)player.current.pause();else void player.current.play().catch(e=>setError(`Playback failed: ${String(e)}`));}}>{playing?'Pause sample':'Play sample'}</button>
            <button className="small-button" onClick={()=>{if(player.current){player.current.pause();player.current.currentTime=0;}}}>Stop sample</button>
            <span>{clock.position.toFixed(1)} / {clock.duration.toFixed(1)} s</span>
          </div>
          <label><input type="checkbox" checked={repeat} onChange={event=>setRepeat(event.target.checked)}/> Repeat this sample</label>
          <label className="field-label">Preview volume<input aria-label="Sound preview volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={event=>setVolume(Number(event.target.value))}/></label>
          <small>
            SHA-256 <code>{clip.sha256}</code>
          </small>
        </div>
      )}
    </section>
  );
}
