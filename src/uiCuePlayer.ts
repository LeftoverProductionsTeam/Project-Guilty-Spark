import { call, native } from './api';
import type { AudioPreview } from './types';
import type { CueName, InterfacePreferences, LocalCueReference } from './interfacePreferences';

/** User-triggered local playback of an already-imported Halo sound tag.
 * Source references are stored in local preferences, never the audio bytes.
 * No cloud services, file mutation, or unsolicited autoplay.
 */
export class UiCuePlayer {
  private cache = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();
  private active: HTMLAudioElement | null = null;
  private lastPlay = 0;
  private disposed = false;

  private key(ref: LocalCueReference): string {
    return `${ref.projectId}:${ref.tagId}:${ref.pitchRange}:${ref.permutation}:${ref.sourceHash}`;
  }

  private async url(ref: LocalCueReference): Promise<string> {
    const key = this.key(ref);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const active = this.inflight.get(key);
    if (active) return active;
    const task = (async () => {
      const result = await call<AudioPreview>('preview_sound', {
        projectId: ref.projectId, tagId: ref.tagId,
        pitchRange: ref.pitchRange, permutation: ref.permutation,
      });
      if (!['audio/ogg', 'audio/wav', 'audio/mpeg'].includes(result.mime) || result.bytes.length > 2_000_000)
        throw new Error('Unsupported or oversized UI sound');
      if (this.disposed) throw new Error('Audio preferences closed');
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: result.mime }));
      // A small bounded cache; do not fill webview memory with large decoded game samples.
      if (this.cache.size >= 6) {
        const first = this.cache.keys().next().value;
        if (first) { URL.revokeObjectURL(this.cache.get(first)!); this.cache.delete(first); }
      }
      this.cache.set(key, url);
      return url;
    })();
    this.inflight.set(key, task);
    try { return await task; } finally { this.inflight.delete(key); }
  }

  async play(cue: CueName, preferences: InterfacePreferences): Promise<void> {
    if (this.disposed || !native || !preferences.uiAudioEnabled || preferences.uiVolume <= 0) return;
    const ref = preferences.cues[cue];
    if (!ref) return;
    const now = Date.now();
    if (now - this.lastPlay < 110) return;
    this.lastPlay = now;
    try {
      const source = await this.url(ref);
      if (this.disposed) return;
      this.active?.pause();
      const audio = new Audio(source);
      audio.volume = preferences.uiVolume;
      this.active = audio;
      await audio.play();
    } catch {
      // A removed project or unsupported codec should never block navigation.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.active?.pause();
    for (const url of this.cache.values()) URL.revokeObjectURL(url);
    this.cache.clear();
    this.inflight.clear();
  }
}
