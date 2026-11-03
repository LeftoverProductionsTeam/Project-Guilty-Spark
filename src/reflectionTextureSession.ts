import type * as THREE from 'three';
import { MAX_REFLECTION_BATCH } from './ownedReflectionCube';
import type { DecodedReflectionItem, DecodedReflectionCube } from './ownedReflectionCube';
const MAX_RESIDENT_CUBES=32;

/** One map/resource epoch owns its pending reads and GPU textures. New shaders
 * join the next bounded batch instead of adding another full resource audit. */
export class ReflectionTextureSession {
  private alive = true;
  private running = false;
  private pending: number[] = [];
  private attempted = new Set<number>();
  private bytes = 0;
  readonly cubes = new Map<number, THREE.CubeTexture>();
  readonly errors = new Map<number, string>();
  get loading(){return this.alive&&(this.running||this.pending.length>0);}
  constructor(
    private read: (ids: number[]) => Promise<Map<number, DecodedReflectionItem>>,
    private create: (cube: DecodedReflectionCube, id: number) => THREE.CubeTexture,
    private publish: () => void,
  ) {}
  enqueue(ids: readonly number[]) {
    if (!this.alive) return;
    for (const id of ids) {
      if (this.attempted.has(id)) continue;
      this.attempted.add(id);
      this.pending.push(id);
    }
    if (!this.running && this.pending.length) void this.drain();
  }
  dispose() {
    this.alive = false;
    this.pending = [];
    this.cubes.forEach((texture) => texture.dispose());
    this.cubes.clear();
  }
  private async drain() {
    this.running = true;
    this.publish();
    try {
      while (this.alive && this.pending.length) {
        const ids = this.pending.splice(0, MAX_REFLECTION_BATCH);
        if (this.cubes.size >= MAX_RESIDENT_CUBES) {
          for (const id of ids)
            this.errors.set(
              id,
              'Thirty-two reflection cubes are loaded; remaining cubes exceed the active preview budget.',
            );
        } else {
          try {
            const decoded = await this.read(ids);
            // A response from a retired map/pin epoch never creates GPU data.
            if (!this.alive) return;
            for (const id of ids) {
              const item = decoded.get(id);
              if (!item?.cube) {
                this.errors.set(id, item?.error ?? 'Reflection batch omitted a requested cube.');
                continue;
              }
              if (this.cubes.size >= MAX_RESIDENT_CUBES || this.bytes + item.cube.bytes > 64 * 1024 * 1024) {
                this.errors.set(id, 'Reflection cubes exceed the active preview budget.');
                continue;
              }
              try {
                const texture = this.create(item.cube, id);
                this.cubes.set(id, texture);
                this.bytes += item.cube.bytes;
              } catch (error) {
                this.errors.set(id, String(error));
              }
            }
          } catch (error) {
            if (!this.alive) return;
            for (const id of ids) this.errors.set(id, String(error));
          }
        }
        if (this.alive) this.publish();
      }
    } finally {
      this.running = false;
      if(this.alive)this.publish();
    }
  }
}
