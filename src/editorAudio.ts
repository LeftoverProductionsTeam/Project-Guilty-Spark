import { call, native } from './api';
import { observeWindowFocus } from './windowFocus';
import {
  followAudioListener,
  emptySoundScene,
  sourceSoundEmitters,
  SpatialSoundMixer,
  distanceGain,
} from './spatialAudio';
import type { ListenerPose, SoundEmitter, SoundScene } from './spatialAudio';
import { loadMapSoundClip } from './soundClipLoader';
import { librarySoundEmitter } from './viewportAssets';
import type { MapInspection, Project, Vec3 } from './types';
import { soundKey } from './soundPlayback';
export interface AmbienceBsp {
  index: number;
  tagPath: string;
  backgroundPalette: { tagPath: string | null }[];
  clusters: { index: number; background: number | null }[];
  listenerTree?: {
    nodes: [number, number, number][];
    planes: [number, number, number, number][];
    leafClusters: (number | null)[];
  };
}
interface Ambience {
  sourceSha256: string;
  bsps: AmbienceBsp[];
}
export interface EditorAudioStatus {
  phase: 'idle' | 'loading' | 'playing' | 'muted' | 'paused' | 'needsGesture' | 'unavailable' | 'finishing';
  voices: number;
  cachedBytes: number;
  cachedClips: number;
  rms: number;
  detail: string;
}
/** Query the actual bounded BSP partition; no nearest-cluster or tag-name guesses. */
export function ambienceCluster(bsp: AmbienceBsp, point: Vec3): number | null {
  const tree = bsp.listenerTree;
  if (!tree || !point.every(Number.isFinite)) return null;
  let child = 0;
  const seen = new Set<number>();
  for (let step = 0; step < 1024; step++) {
    if (child === 0xffffffff) return null;
    if ((child & 0x80000000) !== 0) return tree.leafClusters[child & 0x7fffffff] ?? null;
    if (seen.has(child)) return null;
    seen.add(child);
    const node = tree.nodes[child],
      plane = node && tree.planes[node[0]];
    if (!node || !plane) return null;
    const distance = point[0] * plane[0] + point[1] * plane[1] + point[2] * plane[2] - plane[3];
    child = node[distance >= 0 ? 2 : 1] >>> 0;
  }
  return null;
}
interface Configuration {
  project: Project;
  inspection: MapInspection | null;
  active: boolean;
  muted: boolean;
  volume: number;
  bspIndex: number;
  resourceScope: string;
}

/** One audio owner per editing map, independent of hidden/shown utility drawers. */
export class EditorAudioSession {
  private configuration: Configuration | null = null;
  private context: AudioContext | null = null;
  private mixer: SpatialSoundMixer | null = null;
  private analyser: AnalyserNode | null = null;
  private meter = new Float32Array(256);
  private pose: ListenerPose = { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 0, 1] };
  private placed: SoundEmitter[] = [];
  private background: SoundEmitter | null = null;
  private metadata: Ambience | null = null;
  private backgroundKey = '';
  private sourceKey = '';
  private placedKey = '';
  private cache = new Map<number, Promise<SoundEmitter>>();
  private failures = new Set<string>();
  private played = new Set<string>();
  private callbacks = new Set<() => void>();
  private snapshot: EditorAudioStatus = {
    phase: 'idle',
    voices: 0,
    cachedBytes: 0,
    cachedClips: 0,
    rms: 0,
    detail: 'No active map sound.',
  };
  private closed = false;
  private focused = false;
  private paused = false;
  private ending = false;
  private live = false;
  private starting: Promise<SpatialSoundMixer> | null = null;
  private generation = 0;
  private backgroundRevision = 0;
  private sourceRevision = 0;
  private syncBusy = false;
  private failedClips = new Set<string>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private stopListener: (() => void) | null = null;
  private stopFocus: (() => void) | null = null;
  constructor(readonly projectId: string) {}
  connect() {
    if (this.interval) return;
    this.closed = false;
    this.sourceKey = '';
    this.stopListener = followAudioListener(this.projectId, (pose) => {
      if (pose.position.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) return;
      this.pose = pose;
      this.mixer?.setListener(pose);
    });
    this.stopFocus = observeWindowFocus((focused) => {
      this.focused = focused;
      if (!focused) this.release();
      else void this.synchronize();
    });
    this.interval = setInterval(() => {
      void this.synchronize();
      this.publish();
    }, 200);
  }
  subscribe = (callback: () => void) => {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(detail?: string) {
    if (this.closed) return;
    const stats = this.mixer?.stats;
    let rms = 0;
    if (this.analyser && this.context?.state === 'running') {
      this.analyser.getFloatTimeDomainData(this.meter);
      rms = Math.sqrt(this.meter.reduce((total, value) => total + value * value, 0) / this.meter.length);
    }
    const phase: EditorAudioStatus['phase'] =
      !this.configuration?.active || this.live || !this.focused
        ? 'idle'
        : this.configuration.muted || this.configuration.volume === 0
          ? 'muted'
          : this.ending
            ? 'finishing'
            : this.paused
              ? 'paused'
              : this.context?.state === 'suspended'
                ? 'needsGesture'
                : stats?.voices
                  ? 'playing'
                  : stats?.loading || this.starting
                    ? 'loading'
                    : this.failures.size
                      ? 'unavailable'
                      : 'idle';
    const next = {
      phase,
      voices: stats?.voices ?? 0,
      cachedBytes: stats?.cachedBytes ?? 0,
      cachedClips: stats?.cachedClips ?? 0,
      rms: Number.isFinite(rms) ? Math.round(rms * 10000) / 10000 : 0,
      detail:
        detail ??
        (this.failures.size
          ? [...this.failures].at(-1)!
          : phase === 'playing'
            ? 'Map ambience and saved sound scene.'
            : phase === 'needsGesture'
              ? 'Use Play map ambience to enable audio in this window.'
              : 'Editor ambience follows the active map and viewport listener.'),
    };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    for (const callback of this.callbacks) callback();
  }
  update(configuration: Configuration) {
    if (this.closed) return;
    this.configuration = configuration;
    const key = `${configuration.project.source?.sha256 ?? ''}:${configuration.resourceScope}`;
    if (this.sourceKey !== key) {
      this.sourceKey = key;
      this.sourceRevision++;
      this.backgroundRevision++;
      this.release();
      this.metadata = null;
      this.background = null;
      this.backgroundKey = '';
      this.cache.clear();
      this.placedKey = '';
      this.placed = [];
      this.failures.clear();
      this.failedClips.clear();
      this.paused = false;
      const inspection = configuration.inspection,
        project = configuration.project,
        revision = this.sourceRevision;
      if (
        native &&
        project.source &&
        inspection?.sha256 === project.source.sha256 &&
        inspection.tags.some((tag) => tag.class === 'sbsp')
      )
        void call<Ambience>('inspect_map_ambience', { projectId: project.id })
          .then((metadata) => {
            if (this.closed || revision !== this.sourceRevision) return;
            if (metadata.sourceSha256 !== project.source!.sha256 || metadata.bsps.length > 16)
              throw Error('Map ambience source identity changed.');
            this.metadata = metadata;
            void this.synchronize();
          })
          .catch((reason) => {
            if (!this.closed && revision === this.sourceRevision) {
              this.failures.add(`Background ambience: ${String(reason)}`);
              this.publish();
            }
          });
    }
    const inspection = configuration.inspection;
    const placedKey = JSON.stringify(
      configuration.project.scene
        .filter((object) => inspection?.tags.some((tag) => tag.id === object.tagId && tag.class === 'ssce'))
        .map((object) => [object.id, object.tagId, object.position]),
    );
    if (placedKey !== this.placedKey) {
      this.placedKey = placedKey;
      const revision = this.sourceRevision;
      if (inspection)
        void sourceSoundEmitters(inspection, configuration.project.scene)
          .then((emitters) => {
            if (!this.closed && revision === this.sourceRevision && this.placedKey === placedKey) {
              this.placed = emitters.map((emitter) => ({
                ...emitter,
                sourceProjectId: this.projectId,
                sourceSha256: inspection.sha256,
              }));
              void this.synchronize();
            }
          })
          .catch((reason) => {
            if (!this.closed && revision === this.sourceRevision) this.failures.add(String(reason));
          });
    }
    if (!configuration.active || this.live || !this.focused) this.release();
    else {
      this.configure();
      void this.synchronize();
    }
    this.publish();
  }
  setLive(live: boolean) {
    this.live = live;
    if (live) this.release();
    else void this.synchronize();
    this.publish();
  }
  private backgroundForListener() {
    const configuration = this.configuration,
      metadata = this.metadata;
    if (!configuration || !metadata) return;
    const candidates = metadata.bsps
      .filter((bsp) => configuration.bspIndex < 0 || bsp.index === configuration.bspIndex)
      .flatMap((bsp) => {
        const cluster = ambienceCluster(bsp, this.pose.position),
          index = cluster === null ? null : bsp.clusters.find((value) => value.index === cluster)?.background;
        // An overview camera can be outside every collision leaf. In that case
        // audition the sole actually assigned loop; entering any cluster uses
        // that cluster's binding, including silence for an unassigned cluster.
        const overview =
          cluster === null
            ? [
                ...new Set(
                  bsp.clusters.flatMap((value) =>
                    value.background == null
                      ? []
                      : bsp.backgroundPalette[value.background]?.tagPath
                        ? [bsp.backgroundPalette[value.background].tagPath!]
                        : [],
                  ),
                ),
              ]
            : [];
        const path =
          cluster === null && overview.length === 1
            ? overview[0]
            : index == null
              ? null
              : bsp.backgroundPalette[index]?.tagPath;
        return path ? [{ bsp, path }] : [];
      });
    const chosen = candidates.length === 1 ? candidates[0] : null;
    const tag =
      chosen &&
      configuration.inspection?.tags.find(
        (tag) =>
          tag.class === 'lsnd' &&
          tag.path.replaceAll('\\', '/').toLowerCase() === chosen.path.replaceAll('\\', '/').toLowerCase(),
      );
    const key = tag ? `${chosen!.bsp.index}:${tag.id}` : '';
    if (key === this.backgroundKey) return;
    this.backgroundKey = key;
    this.background = null;
    this.backgroundRevision++;
    if (!tag) return;
    const revision = this.backgroundRevision,
      sourceRevision = this.sourceRevision;
    let promise = this.cache.get(tag.id);
    if (!promise) {
      promise = librarySoundEmitter(
        {
          key,
          kind: 'sound',
          sourceId: this.projectId,
          sourceTitle: configuration.project.title,
          name: tag.path.split(/[\\/]/).at(-1) ?? 'Map ambience',
          path: tag.path,
          tagId: tag.id,
          sourceSha256: metadata.sourceSha256,
          looping: true,
        },
        [0, 0, 0],
      ).then((emitter) => ({
        ...emitter,
        spatial: false,
        bus: 'ambience' as const,
        event: 'ambient' as const,
        priority: 75,
      }));
      this.cache.set(tag.id, promise);
    }
    void promise
      .then((emitter) => {
        if (!this.closed && sourceRevision === this.sourceRevision && revision === this.backgroundRevision) {
          this.background = emitter;
          this.configure();
          void this.synchronize();
        }
      })
      .catch((reason) => {
        if (!this.closed && sourceRevision === this.sourceRevision) {
          this.failures.add(`Assigned map ambience: ${String(reason)}`);
          this.publish();
        }
      });
  }
  private scene(): SoundScene {
    const configuration = this.configuration,
      base = configuration?.project.audioPreview ?? emptySoundScene();
    const authored = base.emitters,
      ids = new Set(authored.map((emitter) => emitter.id));
    const native = this.placed
      .filter(
        (emitter) =>
          !ids.has(emitter.id) &&
          distanceGain(
            emitter,
            Math.hypot(...emitter.position.map((value, axis) => value - this.pose.position[axis])),
          ) > 0,
      )
      .sort(
        (a, b) =>
          Math.hypot(...a.position.map((value, axis) => value - this.pose.position[axis])) -
          Math.hypot(...b.position.map((value, axis) => value - this.pose.position[axis])),
      );
    const automatic = [...(this.background ? [this.background] : []), ...native]
      .filter((emitter) => !ids.has(emitter.id))
      .slice(0, Math.max(0, 64 - authored.length));
    return {
      ...base,
      master: base.master * (configuration?.volume ?? 1),
      muted: base.muted || !!configuration?.muted,
      emitters: [...authored, ...automatic],
    };
  }
  private configure() {
    if (this.mixer) {
      try {
        this.mixer.configure(this.scene());
        this.mixer.setListener(this.pose);
      } catch (reason) {
        this.failures.add(String(reason));
      }
    }
  }
  private async synchronize() {
    if (
      this.closed ||
      !native ||
      !this.configuration?.active ||
      this.live ||
      !this.focused ||
      this.paused ||
      this.syncBusy
    )
      return;
    this.backgroundForListener();
    this.configure();
    const scene = this.scene();
    if (scene.muted || scene.master === 0) return;
    const emitters = scene.emitters.filter(
      (emitter) => emitter.enabled && (emitter.event === 'ambient' || emitter.event === 'mapStart'),
    );
    if (!emitters.length) return;
    this.syncBusy = true;
    const generation = this.generation;
    try {
      const mixer = await this.ensure(false);
      if (this.closed || generation !== this.generation) return;
      for (const emitter of emitters) {
        if (this.closed || generation !== this.generation || this.paused || !this.configuration?.active)
          return;
        if (this.failedClips.has(soundKey(emitter))) continue;
        if (this.played.has(emitter.id) && (!emitter.loop || !mixer.repeats(emitter))) continue;
        try {
          await mixer.play(emitter);
          if (generation === this.generation) this.played.add(emitter.id);
        } catch (reason) {
          if (this.closed || generation !== this.generation) return;
          const message = String(reason);
          this.failures.add(message);
          this.failedClips.add(soundKey(emitter));
          this.played.add(emitter.id);
        }
      }
    } catch (reason) {
      if (!this.closed && generation === this.generation) this.failures.add(String(reason));
    } finally {
      this.syncBusy = false;
      this.publish();
    }
  }
  async ensure(explicit = true): Promise<SpatialSoundMixer> {
    if (this.ending) throw Error('Wait for the source ending or stop map sounds before restarting.');
    if (this.closed || !this.configuration?.active || this.live || !this.focused)
      throw Error('Map sound playback is inactive in this window.');
    if (explicit) {
      this.paused = false;
      if (this.context?.state === 'suspended') await this.context.resume();
    }
    if (this.mixer) return this.mixer;
    if (this.starting) return this.starting;
    const generation = this.generation;
    const starting = (async () => {
      const context = new AudioContext();
      this.context = context;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.resume(),
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, 500);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      if (this.closed || generation !== this.generation) {
        await context.close().catch(() => {});
        throw Error('Map sound playback was stopped.');
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(context.destination);
      this.analyser = analyser;
      let mixer: SpatialSoundMixer;
      mixer = new SpatialSoundMixer(
        context,
        (emitter) =>
          loadMapSoundClip(
            context,
            emitter,
            this.projectId,
            this.configuration?.project.source?.sha256 ?? '',
            () => this.closed || generation !== this.generation || this.mixer !== mixer,
          ),
        () => this.publish(),
        analyser,
      );
      this.mixer = mixer;
      this.configure();
      this.publish();
      return mixer;
    })();
    this.starting = starting;
    try {
      return await starting;
    } finally {
      if (this.starting === starting) this.starting = null;
    }
  }
  resume = async () => {
    this.paused = false;
    await this.ensure(true);
    await this.synchronize();
    this.publish();
  };
  stop = () => {
    this.paused = true;
    this.release();
    this.publish();
  };
  finish = async () => {
    const mixer = this.mixer;
    this.paused = true;
    this.ending = true;
    this.publish();
    try {
      await mixer?.finish();
    } finally {
      this.ending = false;
      if (this.mixer === mixer) this.stop();
    }
  };
  private release() {
    this.generation++;
    this.mixer?.dispose();
    this.mixer = null;
    this.analyser?.disconnect();
    this.analyser = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
    this.starting = null;
    this.played.clear();
  }
  dispose() {
    this.closed = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.stopListener?.();
    this.stopListener = null;
    this.stopFocus?.();
    this.stopFocus = null;
    this.release();
  }
}
