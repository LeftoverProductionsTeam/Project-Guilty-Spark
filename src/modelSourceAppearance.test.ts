import { expect, it, vi } from 'vitest';
import { DEFAULT_ENVIRONMENT } from './environment';
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('./api', () => ({ call }));
import { modelSourceAppearance } from './modelSourceAppearance';
it('shares exact source lighting across models and excludes the native sky mesh from retained preview metadata', async () => {
  call.mockResolvedValueOnce({
    sourceSha256: 'a'.repeat(64),
    environment: DEFAULT_ENVIRONMENT,
    fogMaximumDensity: 0.3,
    skyPath: 'sky/source',
    skyMesh: { positions: [1, 2, 3] },
  });
  const first = modelSourceAppearance('source-a', 'a'.repeat(64)),
    second = modelSourceAppearance('source-a', 'a'.repeat(64));
  expect(first).toBe(second);
  const value = await first;
  expect(value.environment).toEqual(DEFAULT_ENVIRONMENT);
  expect(value).not.toHaveProperty('skyMesh');
  expect(call).toHaveBeenLastCalledWith('inspect_source_appearance', { projectId: 'source-a' });
});
it('refuses foreign or corrupt lighting and permits a source-verified retry rather than retaining a bad cache', async () => {
  call.mockResolvedValueOnce({
    sourceSha256: 'wrong',
    environment: DEFAULT_ENVIRONMENT,
    fogMaximumDensity: 1,
  });
  await expect(modelSourceAppearance('source-b', 'b'.repeat(64))).rejects.toThrow(/different source/);
  call.mockResolvedValueOnce({
    sourceSha256: 'b'.repeat(64),
    environment: { ...DEFAULT_ENVIRONMENT, sunIntensity: NaN },
    fogMaximumDensity: 1,
  });
  await expect(modelSourceAppearance('source-b', 'b'.repeat(64))).rejects.toThrow(/sunIntensity/);
  call.mockResolvedValueOnce({
    sourceSha256: 'b'.repeat(64),
    environment: null,
    fogMaximumDensity: 0,
    skyPath: null,
  });
  expect((await modelSourceAppearance('source-b', 'b'.repeat(64))).environment).toBeNull();
});
