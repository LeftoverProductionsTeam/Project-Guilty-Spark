import { call } from './api';
import type { AudioPreview, SoundInspection } from './types';

export interface AuditionTrack { projectId: string; tagId: number; sourceHash: string; pitchRange?: number; permutation?: number }
export interface AuditionState { owner: string | null; phase: 'idle' | 'loading' | 'playing'; name: string; duration: number; error: string }
const idle: AuditionState = { owner: null, phase: 'idle', name: '', duration: 0, error: '' };

/** One cancellable, identity-checked audition bus per window. Requested samples
 * are independent of the map mix and never change game-authored audio. */
export function createSoundAuditionBus(dependencies: {
  context: () => AudioContext; invoke: typeof call;
  digest: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}) {
  let context: AudioContext | undefined, source: AudioBufferSourceNode | undefined;
  let gain: GainNode | undefined, generation = 0, state = idle;
  let settings = {volume:.65, repeat:false};
  const listeners = new Set<() => void>();
  const publish = (next: AuditionState) => { state = next; for (const listener of listeners) listener(); };
  function disconnect() {
    if (source) { source.onended = null; try { source.stop(); } catch { /* A failed start has no playing source. */ } source.disconnect(); source = undefined; }
    gain?.disconnect(); gain = undefined;
  }
  function stop(owner?: string) {
    if (owner !== undefined && state.owner !== owner) return;
    generation++; disconnect(); publish(idle);
  }
  async function play(owner: string, tracks: () => Promise<AuditionTrack[]>, options = { volume: .65, repeat: false }) {
    stop();
    settings={...options};
    const token = generation;
    publish({ ...idle, owner, phase: 'loading' });
    const current = () => token === generation;
    try {
      // Resume during the click, before native IPC consumes user activation.
      context ??= dependencies.context(); await context.resume();
      if (!current()) return;
      if (context.state !== 'running') throw Error('Audio device is paused. Focus Spark and click Play again.');
      const choices = await tracks();
      let chosen: { track: AuditionTrack; pitch: number; permutation: number } | undefined;
      for (const track of choices.slice(0, 8)) {
        if (!current()) return;
        const report = await dependencies.invoke<SoundInspection>('inspect_sound', { projectId: track.projectId, tagId: track.tagId });
        if (!current()) return;
        if (!/^[a-f0-9]{64}$/i.test(track.sourceHash) || report.sourceSha256 !== track.sourceHash) throw Error('Sound source changed. Refresh the asset library.');
        const explicit = track.pitchRange !== undefined || track.permutation !== undefined;
        const sample = explicit ? report.permutations.find(p => p.pitchRange === track.pitchRange && p.permutation === track.permutation)
          : report.permutations.find(p => p.available && p.chainStart) ?? report.permutations.find(p => p.available);
        if (sample?.available) { chosen = { track, pitch: sample.pitchRange, permutation: sample.permutation }; break; }
        if (explicit || choices.length === 1) throw Error(sample?.reason ?? report.permutations.find(p => p.reason)?.reason ?? report.warnings[0] ?? 'No playable sample. Connect this map’s original sound resources.');
      }
      if (!current()) return;
      if (!chosen) throw Error('No playable sample in the connected sound resources.');
      const preview = await dependencies.invoke<AudioPreview>('preview_sound', { projectId: chosen.track.projectId, tagId: chosen.track.tagId, pitchRange: chosen.pitch, permutation: chosen.permutation });
      if (!current()) return;
      if (preview.sourceSha256 !== chosen.track.sourceHash || !['audio/ogg', 'audio/wav'].includes(preview.mime) || !preview.bytes.length || preview.bytes.length > 16 * 1024 * 1024) throw Error('Native sound identity or format failed verification.');
      const bytes = new Uint8Array(preview.bytes);
      if (await dependencies.digest(bytes) !== preview.sha256) throw Error('Sound checksum differs from the native sample.');
      if (!current()) return;
      let buffer: AudioBuffer;
      try { buffer = await context.decodeAudioData(bytes.buffer); }
      catch { throw Error('This audio device cannot decode the verified sample codec.'); }
      if (!current()) return;
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw Error('Decoded sound has no playable frames.');
      source = context.createBufferSource(); source.buffer = buffer; source.loop = settings.repeat;
      gain = context.createGain(); gain.gain.value = Number.isFinite(settings.volume)?Math.max(0, Math.min(1, settings.volume)):.65;
      source.connect(gain); gain.connect(context.destination);
      source.onended = () => {
        if (current()) { source?.disconnect(); source = undefined; gain?.disconnect(); gain = undefined; publish({ ...state, phase: 'idle' }); }
      };
      source.start(); publish({ owner, phase: 'playing', name: preview.name, duration: buffer.duration, error: '' });
    } catch (error) {
      if (current()) { disconnect(); publish({ ...idle, owner, error: String(error) }); }
    }
  }
  function configure(owner:string,options:{volume:number;repeat:boolean}){
    if(state.owner!==owner)return;
    settings={...options};
    if(gain&&Number.isFinite(options.volume))gain.gain.value=Math.max(0,Math.min(1,options.volume));
    if(source)source.loop=options.repeat;
  }
  return { play, stop, configure, getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
export const soundAuditionBus = createSoundAuditionBus({
  context: () => new AudioContext(), invoke: call,
  digest: async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join(''),
});
