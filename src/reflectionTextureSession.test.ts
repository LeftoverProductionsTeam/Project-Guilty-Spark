import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ReflectionTextureSession } from './reflectionTextureSession';
import type { DecodedReflectionItem } from './ownedReflectionCube';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const result = (ids: number[], bytes = 384): Map<number, DecodedReflectionItem> =>
  new Map(
    ids.map((id) => [
      id,
      {
        cube: { faces: [], bytes },
        error: null,
      },
    ]),
  );
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
it('batches incremental shader arrivals and shares both failures and successful textures', async () => {
  const first = deferred<Map<number, DecodedReflectionItem>>();
  const read = vi.fn(async (ids: number[]) => result(ids));
  read.mockImplementationOnce(() => first.promise);
  const create = vi.fn(() => new THREE.CubeTexture()),
    publish = vi.fn();
  const session = new ReflectionTextureSession(read, create, publish);
  session.enqueue([1, 1]);
  session.enqueue([2, 3, 4, 5, 6, 7, 8, 2]);
  first.resolve(new Map([[1, { cube: null, error: 'Missing exact original cube' }]]));
  await settle();
  expect(read.mock.calls.map(([ids]) => ids)).toEqual([[1], [2, 3, 4, 5], [6, 7, 8]]);
  expect(create).toHaveBeenCalledTimes(7);
  expect(session.errors.get(1)).toContain('original');
  session.enqueue([1, 3]);
  await settle();
  expect(read).toHaveBeenCalledTimes(3);
  const dispose = [...session.cubes.values()].map((cube) => vi.spyOn(cube, 'dispose'));
  session.dispose();
  expect(dispose.every((spy) => spy.mock.calls.length === 1)).toBe(true);
});
it('retires pending work without admitting GPU textures from a late map response', async () => {
  const pending = deferred<Map<number, DecodedReflectionItem>>();
  const read = vi.fn(() => pending.promise),
    create = vi.fn(() => new THREE.CubeTexture()),
    publish = vi.fn();
  const session = new ReflectionTextureSession(read, create, publish);
  session.enqueue([1]);
  session.enqueue([2, 3]);
  session.dispose();
  pending.resolve(result([1]));
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(create).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  // A fresh resource epoch retries the same identity through a new verified read.
  const nextRead = vi.fn(async (ids: number[]) => result(ids));
  const next = new ReflectionTextureSession(nextRead, create, publish);
  next.enqueue([1]);
  await settle();
  expect(nextRead).toHaveBeenCalledWith([1]);
  next.dispose();
});
it('keeps the resident 16-cube and 64 MiB limits under batched reads', async () => {
  const create = vi.fn(() => new THREE.CubeTexture());
  const session = new ReflectionTextureSession(
    async (ids) => result(ids, 16 * 1024 * 1024),
    create,
    () => {},
  );
  session.enqueue([1, 2, 3, 4, 5]);
  await settle();
  expect(create).toHaveBeenCalledTimes(4);
  expect(session.errors.get(5)).toContain('budget');
  session.dispose();
  const count = new ReflectionTextureSession(
    async (ids) => result(ids),
    create,
    () => {},
  );
  count.enqueue(Array.from({ length: 20 }, (_, i) => i));
  await settle();
  expect(count.cubes.size).toBe(16);
  expect(count.errors.size).toBe(4);
  count.dispose();
});
it('reports a rejected native transaction for every affected request without retry loops', async () => {
  const read = vi.fn(async () => {
    throw Error('Resource SHA-256 changed');
  });
  const create = vi.fn(() => new THREE.CubeTexture());
  const session = new ReflectionTextureSession(read, create, () => {});
  session.enqueue([1, 2, 3]);
  await settle();
  session.enqueue([1, 2, 3]);
  expect(read).toHaveBeenCalledTimes(1);
  expect([...session.errors.values()]).toEqual(Array(3).fill('Error: Resource SHA-256 changed'));
  expect(create).not.toHaveBeenCalled();
  session.dispose();
});
