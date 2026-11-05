import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { call } from '../api';
import type { SoundInspection } from '../types';
import type { CueName, LocalCueReference } from '../interfacePreferences';
import { Notice } from './ui';
import SoundAudition from './SoundAudition';
import '../soundInspector.css';

export default function Sound({ projectId, tagId, sourceHash = '', onAssign,onResources, active = true }: { projectId: string; tagId: number; sourceHash?: string; onAssign?: (cue: CueName, ref: LocalCueReference) => void;onResources?:()=>void;active?:boolean }) {
  const [inspection, setInspection] = useState<SoundInspection | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected,setSelected]=useState(''),[repeat,setRepeat]=useState(false),[volume,setVolume]=useState(.65);
  const request = useRef(0);
  useEffect(() => {
    const token = ++request.current;
    setInspection(null);
    setSelected('');
    setError('');
    setBusy(true);
    call<SoundInspection>('inspect_sound', { projectId, tagId })
      .then((result) => {
        if (request.current !== token) return;
        if(sourceHash&&result.sourceSha256!==sourceHash)throw Error('Sound source changed; reopen this map.');
        setInspection(result);
        const sample=result.permutations.find(p=>p.available&&p.chainStart)??result.permutations.find(p=>p.available)??result.permutations[0];
        if(sample)setSelected(`${sample.pitchRange}:${sample.permutation}`);
      })
      .catch((e) => {
        if (request.current === token) setError(String(e));
      })
      .finally(() => {
        if (request.current === token) setBusy(false);
      });
    return () => {
      ++request.current;
    };
  }, [projectId, tagId, sourceHash]);
  const sample=inspection?.permutations.find(p=>`${p.pitchRange}:${p.permutation}`===selected);
  return (
    <section className="analysis-card sound-inspector">
      <div className="sound-preview-strip">
        <Volume2 size={16} aria-hidden />
        <select aria-label="Sound sample" value={selected} disabled={busy||!inspection?.permutations.length} onChange={event=>setSelected(event.target.value)}>
          {!sample&&<option value="">{busy?'Reading sound…':'No decoded samples'}</option>}
          {inspection?.permutations.map(p=><option key={`${p.pitchRange}:${p.permutation}`} value={`${p.pitchRange}:${p.permutation}`}>
            {p.name||`Range ${p.pitchRange} / ${p.permutation}`}{p.durationSeconds!==null?` · ${p.durationSeconds.toFixed(2)} s`:''}
          </option>)}
        </select>
        {sample?.available&&<SoundAudition key={`${projectId}:${tagId}:${selected}`} label="Play sample" volume={volume} repeat={repeat} enabled={active}
          tracks={async()=>[{projectId,tagId,sourceHash:sourceHash||inspection!.sourceSha256,pitchRange:sample.pitchRange,permutation:sample.permutation}]}/>}
      </div>
      {busy && <p role="status">Reading bounded audio data…</p>}
      {error && <Notice>{error}</Notice>}
      {inspection&&!sample?.available&&<Notice>{sample?.reason??inspection.warnings[0]??'No playable sample. Connect this map’s original sound resources.'}</Notice>}
      <details className="sound-preview-details">
        <summary>Sample details &amp; options</summary>
        {sample&&<small>{sample.format} · {sample.channels} channel(s) · {sample.sampleRate} Hz · {sample.byteLength.toLocaleString()} bytes · {sample.embedded?'Embedded sample':'Verified shared resource'}</small>}
        <div className="sound-preview-options">
          <label><input type="checkbox" checked={repeat} onChange={event=>setRepeat(event.target.checked)}/> Repeat sample</label>
          <label>Preview volume <input aria-label="Sound preview volume" type="range" min="0" max="1" step=".01" value={volume} onChange={event=>setVolume(Number(event.target.value))}/></label>
        </div>
        {onResources&&<button className="small-button" onClick={onResources}>Locate Halo Sounds folder</button>}
          {onAssign && sample?.available && sample.embedded && <div className="sound-assign">
            <small>Assign local cue:</small>
            {([['select', 'Navigate'], ['confirm', 'Confirm'], ['warning', 'Warning']] as const).map(([cue, label]) => (
              <button key={cue} type="button" className="small-button" onClick={() => onAssign(cue, {
                projectId, tagId, pitchRange: sample.pitchRange, permutation: sample.permutation,
                sourceHash:sourceHash||inspection!.sourceSha256, label: `${sample.name || `Tag ${tagId}`} (${label})`,
              })}>{label}</button>
            ))}
          </div>}
        {inspection?.warnings.map((value,i)=><p className="subtle" key={i}>{value}</p>)}
        <small>Audition is independent of map mute. Repeat and volume here do not change Halo’s sound tags, classes or looping tracks.</small>
      </details>
    </section>
  );
}
