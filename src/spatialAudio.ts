import type { AudioPreview, MapInspection, SceneObject, SoundInspection, Vec3 } from './types';
import { soundBytes, soundKey, soundPlayback } from './soundPlayback';
import type { LoadedSound, SoundPlayback } from './soundPlayback';
export type SoundBus = 'ambience' | 'music' | 'effects' | 'dialogue';
export type SoundEvent =
  'ambient' | 'mapStart' | 'manual' | 'weaponFire' | 'pickup' | 'explosion' | 'footstep' | 'interaction';
export const SOUND_BUSES: SoundBus[] = ['ambience', 'music', 'effects', 'dialogue'];
export const SOUND_EVENTS: SoundEvent[] = [
  'ambient',
  'mapStart',
  'manual',
  'weaponFire',
  'pickup',
  'explosion',
  'footstep',
  'interaction',
];
export interface SoundEmitter {
  id: string;
  name: string;
  tagId: number;
  sourceProjectId?: string | null;
  sourceSha256?: string | null;
  pitchRange: number;
  permutation: number;
  /** Missing in older documents means true. */
  followChain?: boolean;
  event: SoundEvent;
  bus: SoundBus;
  position: Vec3;
  gain: number;
  pitch: number;
  loop: boolean;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  rolloff: number;
  priority: number;
  cooldownMs: number;
  spatial: boolean;
  loopingSource?: { tagId: number; track: number } | null;
}
export interface SoundScene {
  schemaVersion: 1;
  master: number;
  muted: boolean;
  maxVoices: number;
  buses: Record<SoundBus, { gain: number; muted: boolean; solo: boolean }>;
  emitters: SoundEmitter[];
}
export interface ListenerPose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
}
export function emptySoundScene(): SoundScene {
  return {
    schemaVersion: 1,
    master: 0.5,
    muted: false,
    maxVoices: 24,
    buses: {
      ambience: { gain: 1, muted: false, solo: false },
      music: { gain: 1, muted: false, solo: false },
      effects: { gain: 1, muted: false, solo: false },
      dialogue: { gain: 1, muted: false, solo: false },
    },
    emitters: [],
  };
}
export function createEmitter(tagId: number, name: string, position: Vec3 = [0, 0, 0]): SoundEmitter {
  return {
    id: crypto.randomUUID(),
    name,
    tagId,
    pitchRange: 0,
    permutation: 0,
    followChain: true,
    event: 'ambient',
    bus: 'ambience',
    position: [...position],
    gain: 1,
    pitch: 0,
    loop: true,
    enabled: true,
    minDistance: 1,
    maxDistance: 40,
    rolloff: 1,
    priority: 50,
    cooldownMs: 100,
    spatial: true,
  };
}
export async function sourceSoundEmitters(
  inspection: MapInspection,
  objects: SceneObject[],
): Promise<SoundEmitter[]> {
  const tags = new Map(inspection.tags.map((t) => [t.id, t])),
    out: SoundEmitter[] = [];
  for (const object of objects) {
    const tag = object.tagId === null ? undefined : tags.get(object.tagId);
    if (tag?.class !== 'ssce') continue;
    for (const attached of tag.references) {
      const loop = tags.get(attached.targetId);
      if (loop?.class !== 'lsnd') continue;
      for (const reference of loop.references.filter((r) => /^Track \d+ · Loop$/.test(r.label))) {
        const sound = tags.get(reference.targetId);
        if (sound?.class !== 'snd!') continue;
        const digest = new Uint8Array(
          await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(
              `${inspection.sha256}/${object.id}/${attached.label}/${loop.id}/${reference.label}/${sound.id}`,
            ),
          ),
        );
        digest[6] = (digest[6] & 15) | 0x80;
        digest[8] = (digest[8] & 63) | 0x80;
        const hex = Array.from(digest.slice(0, 16), (v) => v.toString(16).padStart(2, '0')).join(''),
          id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        const emitter = createEmitter(sound.id, object.name.slice(0, 120), object.position);
        emitter.id = id;
        const field = (key: string) => sound.fields.find((f) => f.key === key)?.value;
        const min = field('sound-min-distance'),
          max = field('sound-max-distance');
        if (typeof min === 'number' && min > 0 && min <= 10000) emitter.minDistance = min;
        if (typeof max === 'number' && max >= emitter.minDistance && max <= 10000) emitter.maxDistance = max;
        emitter.maxDistance = Math.max(emitter.minDistance, emitter.maxDistance);
        const index = Number(reference.label.match(/^Track (\d+)/)?.[1]) - 1,
          gain = loop.fields.find((f) => f.key === `loop-${index}-gain`)?.value;
        if (typeof gain === 'number' && gain >= 0 && gain <= 1) emitter.gain = gain;
        emitter.loopingSource = { tagId: loop.id, track: index };
        out.push(emitter);
        if (out.length >= 64) return out;
      }
    }
  }
  return out;
}
const finite = (value: number, min: number, max: number) =>
  Number.isFinite(value) && value >= min && value <= max;
export function validateSoundScene(s: SoundScene): string[] {
  if (
    !s ||
    s.schemaVersion !== 1 ||
    !finite(s.master, 0, 1) ||
    typeof s.muted !== 'boolean' ||
    !Number.isInteger(s.maxVoices) ||
    !finite(s.maxVoices, 1, 32) ||
    !s.buses ||
    typeof s.buses !== 'object' ||
    Object.keys(s.buses).length !== SOUND_BUSES.length ||
    !Array.isArray(s.emitters) ||
    s.emitters.length > 64
  )
    return ['Invalid sound mixer or emitter limit.'];
  const errors: string[] = [],
    ids = new Set<string>();
  for (const b of SOUND_BUSES) {
    const bus = s.buses[b];
    if (!bus || !finite(bus.gain, 0, 1) || typeof bus.muted !== 'boolean' || typeof bus.solo !== 'boolean')
      errors.push('Invalid sound bus settings.');
  }
  for (const e of s.emitters) {
    if (
      !e ||
      typeof e.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id) ||
      ids.has(e.id) ||
      typeof e.name !== 'string' ||
      !e.name.trim() ||
      e.name.length > 120 ||
      /[\x00-\x1f\x7f]/.test(e.name) ||
      !Number.isInteger(e.tagId) ||
      !finite(e.tagId, 0, 0xffffffff) ||
      !Number.isInteger(e.pitchRange) ||
      !finite(e.pitchRange, 0, 7) ||
      !Number.isInteger(e.permutation) ||
      !finite(e.permutation, 0, 255) ||
      !SOUND_EVENTS.includes(e.event) ||
      !SOUND_BUSES.includes(e.bus) ||
      !Array.isArray(e.position) ||
      e.position.length !== 3 ||
      !e.position.every((n) => finite(n, -1e6, 1e6)) ||
      !finite(e.gain, 0, 2) ||
      !finite(e.pitch, -12, 12) ||
      !finite(e.minDistance, 0.01, 10000) ||
      !finite(e.maxDistance, e.minDistance, 10000) ||
      !finite(e.rolloff, 0, 10) ||
      !Number.isInteger(e.priority) ||
      !finite(e.priority, 0, 100) ||
      !Number.isInteger(e.cooldownMs) ||
      !finite(e.cooldownMs, 0, 60000) ||
      typeof e.loop !== 'boolean' ||
      typeof e.enabled !== 'boolean' ||
      (e.followChain !== undefined && typeof e.followChain !== 'boolean') ||
      typeof e.spatial !== 'boolean' ||
      (e.loopingSource != null &&
        (!Number.isInteger(e.loopingSource.tagId) ||
          !finite(e.loopingSource.tagId, 0, 0xffffffff) ||
          !Number.isInteger(e.loopingSource.track) ||
          !finite(e.loopingSource.track, 0, 3)))
    )
      errors.push('Invalid positional sound emitter.');
    if (e && typeof e.id === 'string') ids.add(e.id);
  }
  for (const e of s.emitters) {
    if (!e) continue;
    if (
      (e.sourceProjectId != null &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.sourceProjectId)) ||
      (e.sourceSha256 != null && !/^[0-9a-f]{64}$/i.test(e.sourceSha256)) ||
      !!e.sourceProjectId !== !!e.sourceSha256
    )
      errors.push('Linked sounds require a valid source project and exact SHA-256.');
  }
  return [...new Set(errors)];
}
/** Same attenuation curve used by the mixer; max distance is a hard cull. */
export function distanceGain(e: SoundEmitter, distance: number): number {
  if (!e.spatial) return 1;
  if (!Number.isFinite(distance) || distance > e.maxDistance) return 0;
  return e.minDistance / (e.minDistance + e.rolloff * (Math.max(distance, e.minDistance) - e.minDistance));
}
export function busGain(s: SoundScene, bus: SoundBus): number {
  const anySolo = SOUND_BUSES.some((b) => s.buses[b].solo),
    b = s.buses[bus];
  return s.muted || b.muted || (anySolo && !b.solo) ? 0 : s.master * b.gain;
}

type Listener = (pose: ListenerPose) => void;
const poses = new Map<string, ListenerPose>(),
  listeners = new Map<string, Set<Listener>>();
export function publishAudioListener(mapId: string, pose: ListenerPose) {
  if (!poses.has(mapId) && poses.size >= 64) poses.delete(poses.keys().next().value!);
  poses.set(mapId, pose);
  for (const listener of listeners.get(mapId) ?? []) listener(pose);
}
export function followAudioListener(mapId: string, listener: Listener): () => void {
  let set = listeners.get(mapId);
  if (!set) {
    set = new Set();
    listeners.set(mapId, set);
  }
  set.add(listener);
  const pose = poses.get(mapId);
  if (pose) listener(pose);
  return () => {
    set!.delete(listener);
    if (!set!.size) listeners.delete(mapId);
  };
}

export async function verifiedAudioBytes(payload: AudioPreview, sourceHash: string): Promise<ArrayBuffer> {
  if (
    payload.sourceSha256 !== sourceHash ||
    !['audio/ogg', 'audio/wav'].includes(payload.mime) ||
    !payload.bytes.length ||
    payload.bytes.length > 16 * 1024 * 1024
  )
    throw Error('Sound source or payload bounds changed. Reopen this map.');
  const bytes = new Uint8Array(payload.bytes),
    digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
  if (digest !== payload.sha256) throw Error('Sound playback checksum did not match.');
  return bytes.buffer;
}
export function checkedPermutation(report: SoundInspection, e: SoundEmitter, sourceHash: string) {
  if (report.sourceSha256 !== sourceHash || report.tagId !== e.tagId)
    throw Error('Sound inspection belongs to a different source.');
  const p = report.permutations.find((p) => p.pitchRange === e.pitchRange && p.permutation === e.permutation);
  if (!p?.available) throw Error(p?.reason ?? 'This sound permutation is unavailable.');
  if (
    p.durationSeconds === null ||
    !finite(p.durationSeconds, 0.001, 180) ||
    p.durationSeconds * p.channels * p.sampleRate * 4 > 32 * 1024 * 1024
  )
    throw Error('Use a sound of at most 180 seconds and 32 MiB decoded audio for spatial rehearsal.');
  return p;
}
/** The real next-permutation links, never adjacent chunks guessed from tag names. */
export function checkedSoundChain(report: SoundInspection, emitter: SoundEmitter, sourceHash: string) {
  const chunks = [checkedPermutation(report, emitter, sourceHash)],
    seen = new Set([emitter.permutation]);
  while (emitter.followChain !== false && chunks.at(-1)!.nextPermutation != null) {
    const next = chunks.at(-1)!.nextPermutation!;
    if (!Number.isInteger(next) || next < 0 || next > 255 || seen.has(next) || chunks.length >= 64)
      throw Error('Sound segment chain is cyclic, invalid or exceeds 64 segments.');
    seen.add(next);
    chunks.push(checkedPermutation(report, { ...emitter, permutation: next }, sourceHash));
  }
  const duration = chunks.reduce((n, p) => n + p.durationSeconds!, 0),
    first = chunks[0];
  if (
    chunks.some((p) => p.channels !== first.channels || p.sampleRate !== first.sampleRate) ||
    duration > 180 ||
    duration * first.channels * first.sampleRate * 4 > 32 * 1024 * 1024
  )
    throw Error('Linked sound must keep one format and fit 180 seconds and 32 MiB decoded audio.');
  return chunks;
}
export async function decodeSoundChain(
  context: BaseAudioContext,
  emitter: SoundEmitter,
  report: SoundInspection,
  sourceHash: string,
  preview: (permutation: number) => Promise<AudioPreview>,
  cancelled: () => boolean = () => false,
): Promise<AudioBuffer> {
  const chunks = checkedSoundChain(report, emitter, sourceHash),
    buffers: AudioBuffer[] = [];
  let bytesDecoded = 0;
  for (const chunk of chunks) {
    if (cancelled()) throw Error('Sound rehearsal was stopped.');
    const payload = await preview(chunk.permutation);
    if (cancelled()) throw Error('Sound rehearsal was stopped.');
    if (payload.sourceSampleSha256 !== chunk.sha256)
      throw Error('Source sound segment changed. Reopen the map.');
    const buffer = await context.decodeAudioData(await verifiedAudioBytes(payload, sourceHash));
    if (cancelled()) throw Error('Sound rehearsal was stopped.');
    if (
      buffer.numberOfChannels !== chunk.channels ||
      Math.abs(buffer.duration - chunk.durationSeconds!) > 0.05
    )
      throw Error('Decoded sound dimensions differ from the verified source.');
    bytesDecoded += buffer.length * buffer.numberOfChannels * 4;
    if (bytesDecoded > 32 * 1024 * 1024) throw Error('Resampled sound chain exceeds the 32 MiB clip limit.');
    buffers.push(buffer);
  }
  if (buffers.length === 1) return buffers[0];
  const length = buffers.reduce((n, b) => n + b.length, 0),
    combined = context.createBuffer(buffers[0].numberOfChannels, length, context.sampleRate);
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < combined.numberOfChannels; channel++)
      combined.copyToChannel(buffer.getChannelData(channel), channel, offset);
    offset += buffer.length;
  }
  return combined;
}
interface Voice {
  emitter: SoundEmitter;
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: PannerNode | null;
  started: number;
  clip: SoundPlayback;
  envelope: GainNode;
  sources: Set<AudioBufferSourceNode>;
  ending: boolean;
  finished: Promise<void>;
  resolve: () => void;
}
/** Bounded Web Audio rehearsal. This does not intercept or replace MCC audio. */
export class SpatialSoundMixer {
  private buses = new Map<SoundBus, GainNode>();
  private master: GainNode;
  private voices: Voice[] = [];
  private generation = 0;
  private request = 0;
  private inFlight = new Map<string, number>();
  private cooldown = new Map<string, number>();
  private cache = new Map<string, SoundPlayback>();
  private loadingBuffers = new Map<string, Promise<SoundPlayback>>();
  private finishing: Promise<void> | null = null;
  private playbackFailure: Error | null = null;
  private cacheBytes = 0;
  private disposed = false;
  private pose: ListenerPose = { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 0, 1] };
  private scene: SoundScene = emptySoundScene();
  constructor(
    readonly context: BaseAudioContext,
    private load: (emitter: SoundEmitter) => Promise<LoadedSound>,
    private changed: () => void = () => {},
    destination: AudioNode = context.destination,
  ) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(destination);
    for (const bus of SOUND_BUSES) {
      const node = context.createGain();
      node.gain.value = 0;
      node.connect(this.master);
      this.buses.set(bus, node);
    }
    this.configure(this.scene);
    this.setListener(this.pose);
  }
  get stats() {
    return {
      voices: this.voices.length,
      loading: this.inFlight.size,
      cachedClips: this.cache.size,
      cachedBytes: this.cacheBytes,
    };
  }
  get error() {
    return this.playbackFailure?.message ?? null;
  }
  repeats(emitter: SoundEmitter) {
    return emitter.loop && this.cache.get(soundKey(emitter))?.canLoop !== false;
  }
  configure(scene: SoundScene) {
    const errors = validateSoundScene(scene);
    if (errors.length) throw Error(errors.join(' '));
    this.scene = structuredClone(scene);
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(scene.muted ? 0 : scene.master, now, 0.015);
    for (const bus of SOUND_BUSES) {
      const target = scene.master > 0 ? busGain(scene, bus) / scene.master : 0;
      this.buses.get(bus)!.gain.setTargetAtTime(target, now, 0.015);
    }
    for (const voice of [...this.voices]) {
      const next = scene.emitters.find((e) => e.id === voice.emitter.id);
      if (
        !next ||
        !next.enabled ||
        next.tagId !== voice.emitter.tagId ||
        next.sourceProjectId !== voice.emitter.sourceProjectId ||
        next.sourceSha256 !== voice.emitter.sourceSha256 ||
        next.pitchRange !== voice.emitter.pitchRange ||
        next.permutation !== voice.emitter.permutation ||
        (next.followChain !== false) !== (voice.emitter.followChain !== false) ||
        soundKey(next) !== soundKey(voice.emitter) ||
        next.spatial !== voice.emitter.spatial ||
        next.loop !== voice.emitter.loop
      ) {
        this.stopVoice(voice);
        continue;
      }
      const oldBus = voice.emitter.bus;
      voice.emitter = next;
      for (const source of voice.sources)
        source.playbackRate.setTargetAtTime(2 ** (next.pitch / 12), now, 0.015);
      voice.gain.gain.setTargetAtTime(this.gain(next), now, 0.015);
      if (voice.panner) this.position(voice.panner, next.position);
      if (oldBus !== next.bus) {
        voice.gain.disconnect();
        voice.gain.connect(this.buses.get(next.bus)!);
      }
    }
    while (this.voices.length > scene.maxVoices)
      this.stopVoice(
        [...this.voices].sort((a, b) => a.emitter.priority - b.emitter.priority || a.started - b.started)[0],
      );
    this.changed();
  }
  private position(node: PannerNode, p: Vec3, initial = false) {
    const now = this.context.currentTime;
    [node.positionX, node.positionY, node.positionZ].forEach((parameter, i) => {
      if (initial) parameter.value = p[i];
      else parameter.setTargetAtTime(p[i], now, 0.015);
    });
  }
  private gain(e: SoundEmitter) {
    const distance = Math.hypot(...e.position.map((n, i) => n - this.pose.position[i]));
    return e.gain * distanceGain(e, distance);
  }
  setListener(pose: ListenerPose) {
    if ([...pose.position, ...pose.forward, ...pose.up].some((n) => !Number.isFinite(n))) return;
    this.pose = pose;
    const listener = this.context.listener,
      now = this.context.currentTime;
    const params = [
      listener.positionX,
      listener.positionY,
      listener.positionZ,
      listener.forwardX,
      listener.forwardY,
      listener.forwardZ,
      listener.upX,
      listener.upY,
      listener.upZ,
    ];
    [...pose.position, ...pose.forward, ...pose.up].forEach((n, i) =>
      params[i].setTargetAtTime(n, now, 0.015),
    );
    for (const voice of this.voices) voice.gain.gain.setTargetAtTime(this.gain(voice.emitter), now, 0.015);
  }
  async event(event: SoundEvent) {
    const generation = this.generation,
      selected = this.scene.emitters
        .filter((e) => e.enabled && e.event === event)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 32);
    const errors: string[] = [];
    for (let i = 0; i < selected.length; i += 2) {
      if (generation !== this.generation) return;
      await Promise.all(
        selected.slice(i, i + 2).map((e) =>
          this.play(e).catch((error) => {
            errors.push(`${e.name}: ${String(error)}`);
          }),
        ),
      );
    }
    if (errors.length) throw Error(errors.join('\n'));
  }
  async play(emitter: SoundEmitter) {
    if (this.disposed || this.finishing || !emitter.enabled) return;
    if (!this.voices.length && !this.inFlight.size) this.playbackFailure = null;
    if (this.inFlight.has(emitter.id) || this.voices.some((v) => v.emitter.id === emitter.id && emitter.loop))
      return;
    const generation = this.generation,
      token = ++this.request,
      now = this.context.currentTime;
    if (now - (this.cooldown.get(emitter.id) ?? -Infinity) < emitter.cooldownMs / 1000) return;
    this.inFlight.set(emitter.id, token);
    this.changed();
    try {
      const key = soundKey(emitter);
      let buffer = this.cache.get(key);
      if (!buffer) {
        let pending = this.loadingBuffers.get(key);
        if (!pending) {
          if (this.loadingBuffers.size >= 2)
            throw Error('Two sound clips are already loading. Retry after they finish.');
          pending = this.load(emitter).then(soundPlayback);
          this.loadingBuffers.set(key, pending);
        }
        try {
          buffer = await pending;
        } finally {
          if (this.loadingBuffers.get(key) === pending) this.loadingBuffers.delete(key);
        }
        const bytes = soundBytes(buffer);
        if (bytes > 32 * 1024 * 1024) throw Error('Decoded sound exceeds the 32 MiB clip limit.');
        if (generation !== this.generation) return;
        const active = new Set<LoadedSound>(this.voices.map((v) => v.clip));
        const held = () => new Set([...active, ...this.cache.values()]);
        const size = () => [...held()].reduce((n, b) => n + soundBytes(b), 0);
        if (!this.cache.has(key)) {
          while (size() + bytes > 64 * 1024 * 1024) {
            const candidate = [...this.cache].find(([, b]) => !active.has(b));
            if (!candidate)
              throw Error(
                'Active sounds fill the 64 MiB audio budget. Stop a voice before loading another clip.',
              );
            this.cache.delete(candidate[0]);
            this.cacheBytes -= soundBytes(candidate[1]);
          }
          this.cache.set(key, buffer);
          this.cacheBytes += bytes;
        }
      }
      if (generation !== this.generation) return;
      const current = this.scene.emitters.find((e) => e.id === emitter.id);
      if (
        !current?.enabled ||
        current.tagId !== emitter.tagId ||
        current.sourceProjectId !== emitter.sourceProjectId ||
        current.sourceSha256 !== emitter.sourceSha256 ||
        current.pitchRange !== emitter.pitchRange ||
        current.permutation !== emitter.permutation ||
        (current.followChain !== false) !== (emitter.followChain !== false) ||
        soundKey(current) !== key
      )
        return;
      emitter = current;
      if (this.voices.length >= this.scene.maxVoices) {
        const victim = [...this.voices].sort(
          (a, b) => a.emitter.priority - b.emitter.priority || a.started - b.started,
        )[0];
        if (victim.emitter.priority > emitter.priority) return;
        this.stopVoice(victim);
      }
      const clip = buffer;
      const source = this.context.createBufferSource(),
        envelope = this.context.createGain(),
        gain = this.context.createGain();
      source.buffer = clip.buffer;
      source.loop = emitter.loop && clip.canLoop !== false;
      if (clip.loopStart !== undefined) source.loopStart = clip.loopStart;
      if (clip.loopEnd !== undefined) source.loopEnd = clip.loopEnd;
      source.playbackRate.value = 2 ** (emitter.pitch / 12);
      gain.gain.value = this.gain(emitter);
      let panner: PannerNode | null = null;
      if (emitter.spatial) {
        panner = this.context.createPanner();
        panner.panningModel = 'HRTF';
        panner.rolloffFactor = 0;
        this.position(panner, emitter.position, true);
        source.connect(envelope);
        envelope.connect(panner);
        panner.connect(gain);
      } else {
        source.connect(envelope);
        envelope.connect(gain);
      }
      gain.connect(this.buses.get(emitter.bus)!);
      let resolve!: () => void;
      const finished = new Promise<void>((done) => {
        resolve = done;
      });
      const voice: Voice = {
        emitter,
        source,
        gain,
        panner,
        started: token,
        clip,
        envelope,
        sources: new Set([source]),
        ending: false,
        finished,
        resolve,
      };
      envelope.gain.value = clip.fadeInSeconds ? 0 : 1;
      if (clip.fadeInSeconds)
        envelope.gain.linearRampToValueAtTime(1, this.context.currentTime + clip.fadeInSeconds);
      this.voices.push(voice);
      source.onended = () => {
        this.release(voice);
      };
      this.cooldown.set(emitter.id, this.context.currentTime);
      try {
        source.start();
      } catch (error) {
        this.stopVoice(voice);
        throw error;
      }
      this.changed();
    } finally {
      if (this.inFlight.get(emitter.id) === token) this.inFlight.delete(emitter.id);
      this.changed();
    }
  }
  private release(voice: Voice) {
    const index = this.voices.indexOf(voice);
    if (index < 0) return;
    this.voices.splice(index, 1);
    for (const source of voice.sources) {
      source.onended = null;
      source.disconnect();
    }
    voice.sources.clear();
    voice.envelope.disconnect();
    voice.panner?.disconnect();
    voice.gain.disconnect();
    voice.resolve();
    this.changed();
  }
  private stopVoice(voice: Voice) {
    for (const source of voice.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.release(voice);
  }
  private endVoice(voice: Voice, fade: boolean) {
    if (voice.ending) return;
    try {
      voice.ending = true;
      const now = this.context.currentTime,
        at = now + (fade ? (voice.clip.fadeOutSeconds ?? 0) : 0);
      const original = voice.source;
      original.onended = () => {
        original.disconnect();
        voice.sources.delete(original);
      };
      if (at > now) {
        const parameter = voice.envelope.gain;
        const held = parameter.value;
        if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
        else parameter.cancelScheduledValues(now);
        // With no future event, cancelAndHold need not insert an event at `now`.
        // Anchor explicitly so the new ramp cannot begin at an old startup point.
        parameter.setValueAtTime(held, now);
        parameter.linearRampToValueAtTime(0, at);
      }
      try {
        original.stop(at);
      } catch {
        /* Already ended. */
      }
      if (voice.clip.outroStart === undefined) {
        original.onended = () => this.release(voice);
        if (at === now) this.release(voice);
        return;
      }
      const tail = this.context.createBufferSource();
      tail.buffer = voice.clip.buffer;
      tail.playbackRate.value = 2 ** (voice.emitter.pitch / 12);
      tail.connect(voice.envelope);
      voice.envelope.gain.setValueAtTime(1, at);
      voice.sources.add(tail);
      voice.source = tail;
      tail.onended = () => this.release(voice);
      tail.start(at, voice.clip.outroStart);
    } catch (error) {
      this.playbackFailure = new Error(`Could not finish ${voice.emitter.name}: ${String(error)}`);
      this.stopVoice(voice);
    }
  }
  finish(): Promise<void> {
    if (this.finishing) return this.finishing;
    this.generation++;
    this.inFlight.clear();
    this.cooldown.clear();
    const voices = [...this.voices];
    for (const voice of voices) this.endVoice(voice, true);
    const done = Promise.all(voices.map((voice) => voice.finished)).then(() => {
      if (this.finishing === done) this.finishing = null;
      if (this.playbackFailure) throw this.playbackFailure;
    });
    this.finishing = done;
    return done;
  }
  stop() {
    this.generation++;
    this.finishing = null;
    this.playbackFailure = null;
    for (const voice of [...this.voices]) this.stopVoice(voice);
    this.inFlight.clear();
    this.cooldown.clear();
    this.changed();
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.cache.clear();
    this.cacheBytes = 0;
    this.master.disconnect();
    for (const node of this.buses.values()) node.disconnect();
  }
}
