import type { DdsImage } from './haloDds';

/** CPU pixels only. A hit requires an already validated identity and exactly
 * the same freshly returned DDS bytes; this never replaces a native read. */
export class DecodedBitmapCache {
  private entries = new Map<string, { dds: string; image: DdsImage; bytes: number }>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;
  private changes = 0;
  private evictions = 0;
  private budget: number;
  private readonly limit: number;
  constructor(budget = 64 * 1024 * 1024, limit = 128) {
    this.budget = budget;
    this.limit = limit;
  }
  setBudget(bytes:number){
    if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('A finite decoded-cache budget is required.');
    this.budget=bytes;
    while(this.bytes>bytes&&this.entries.size){const oldest=this.entries.keys().next().value!;this.bytes-=this.entries.get(oldest)!.bytes;this.entries.delete(oldest);this.evictions++;}
  }
  get(key: string, dds: string): DdsImage | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    this.entries.delete(key);
    if (entry.dds !== dds) {
      this.bytes -= entry.bytes;
      this.misses++;
      this.changes++;
      return null;
    }
    this.entries.set(key, entry);
    this.hits++;
    return { ...entry.image, pixels: entry.image.pixels.slice() };
  }
  put(key: string, dds: string, image: DdsImage) {
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.bytes -= previous.bytes;
    }
    const bytes = key.length * 2 + dds.length * 2 + image.pixels.byteLength;
    // A single large image must not evict the useful small-image working set.
    if (bytes > Math.min(this.budget, 16 * 1024 * 1024)) return;
    while (this.entries.size && (this.bytes + bytes > this.budget || this.entries.size >= this.limit)) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
      this.evictions++;
    }
    this.entries.set(key, { dds, image: { ...image, pixels: image.pixels.slice() }, bytes });
    this.bytes += bytes;
  }
  stats() {
    return {
      entries: this.entries.size,
      estimatedBytes: this.bytes,
      maxBytes: this.budget,
      maxEntries: this.limit,
      hits: this.hits,
      misses: this.misses,
      changedPayloads: this.changes,
      evictions: this.evictions,
    };
  }
}
