import { call } from './api';
import { createEmitter } from './spatialAudio';
import type { SoundEmitter } from './spatialAudio';
import type { LoopingInspection } from './soundClipLoader';
import type { SoundInspection, Vec3 } from './types';

export interface LoopingSoundSource {
  projectId: string;
  sha256: string;
  tagId: number;
  name: string;
}

/** All main tracks share one verified source; a failed track cannot publish half a group. */
export async function loopingSoundEmitters(
  source: LoopingSoundSource,
  position: Vec3,
  namespace?: string,
  cancelled: () => boolean = () => false,
): Promise<SoundEmitter[]> {
  const check = () => {
    if (cancelled()) throw Error('Looping sound loading was stopped.');
  };
  check();
  if (
    !/^[a-f\d]{64}$/i.test(source.sha256) ||
    !Number.isInteger(source.tagId) ||
    source.tagId < 0 ||
    source.tagId > 0xffffffff ||
    position.length !== 3 ||
    !position.every((value) => Number.isFinite(value) && Math.abs(value) <= 1e6)
  )
    throw Error('The looping sound needs its exact source identity and a finite position.');
  const report = await call<LoopingInspection>('inspect_looping_sound', {
    projectId: source.projectId,
    tagId: source.tagId,
  });
  check();
  if (
    report.sourceSha256 !== source.sha256 ||
    report.tagId !== source.tagId ||
    typeof report.loops !== 'boolean' ||
    !Array.isArray(report.tracks) ||
    report.tracks.length > 4
  )
    throw Error('The looping sound source identity or track limit changed.');
  const indices = new Set<number>();
  for (const track of report.tracks) {
    if (
      !Number.isInteger(track.index) ||
      track.index < 0 ||
      track.index > 3 ||
      indices.has(track.index) ||
      !Number.isFinite(track.gain) ||
      track.gain < 0 ||
      track.gain > 1 ||
      (track.loopTagId !== null &&
        (!Number.isInteger(track.loopTagId) || track.loopTagId < 0 || track.loopTagId > 0xffffffff))
    )
      throw Error('The looping sound has an invalid or duplicate main track.');
    indices.add(track.index);
  }
  const tracks = report.tracks.filter((track) => track.loopTagId !== null);
  if (!tracks.length)
    throw Error('This looping sound has no main loop tracks. Choose its individual sound tags.');
  const samples = new Map<number, Promise<SoundInspection>>();
  const output: SoundEmitter[] = [];
  for (const track of tracks) {
    check();
    const tagId = track.loopTagId!;
    let pending = samples.get(tagId);
    if (!pending) {
      pending = call<SoundInspection>('inspect_sound', { projectId: source.projectId, tagId });
      samples.set(tagId, pending);
    }
    const sound = await pending;
    check();
    if (sound.sourceSha256 !== source.sha256 || sound.tagId !== tagId)
      throw Error(`Track ${track.index + 1} belongs to a different source sound.`);
    const sample = sound.permutations.find((value) => value.available && value.chainStart !== false);
    if (!sample)
      throw Error(
        `Track ${track.index + 1}: no playable source sample. Connect this map's original sound resources.`,
      );
    if (
      !Number.isInteger(sample.pitchRange) ||
      sample.pitchRange < 0 ||
      sample.pitchRange > 7 ||
      !Number.isInteger(sample.permutation) ||
      sample.permutation < 0 ||
      sample.permutation > 255
    )
      throw Error(`Track ${track.index + 1} has an invalid source permutation.`);
    const name =
      tracks.length > 1
        ? `${source.name.slice(0, 100)} · Track ${track.index + 1}`
        : source.name.slice(0, 120);
    const emitter = createEmitter(tagId, name, position);
    emitter.sourceProjectId = source.projectId;
    emitter.sourceSha256 = source.sha256;
    emitter.pitchRange = sample.pitchRange;
    emitter.permutation = sample.permutation;
    emitter.loop = report.loops;
    emitter.loopingSource = { tagId: source.tagId, track: track.index };
    emitter.gain = track.gain;
    if (namespace !== undefined) {
      const bytes = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`${source.sha256}/${namespace}/${source.tagId}/${track.index}/${tagId}`),
        ),
      );
      check();
      bytes[6] = (bytes[6] & 15) | 0x80;
      bytes[8] = (bytes[8] & 63) | 0x80;
      const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
      emitter.id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    output.push(emitter);
  }
  check();
  return output;
}
