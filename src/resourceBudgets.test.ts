import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodedPreviewBudget,
  defaultPreviewBudgets,
  previewBudgets,
  savePreviewBudgets,
  texturePreviewBudget,
} from './resourceBudgets';
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe('bounded preview resources', () => {
  it('persists reviewed RAM/texture/retained-view limits and rejects unbounded values', () => {
    savePreviewBudgets({ decodedMiB: 32, textureMiB: 128, warmEditors: 1 });
    expect(decodedPreviewBudget()).toBe(32 * 1024 ** 2);
    expect(texturePreviewBudget()).toBe(128 * 1024 ** 2);
    expect(previewBudgets().warmEditors).toBe(1);
    expect(() => savePreviewBudgets({ decodedMiB: Infinity, textureMiB: 128, warmEditors: 1 })).toThrow();
    expect(() => savePreviewBudgets({ decodedMiB: 32, textureMiB: 128, warmEditors: 100 })).toThrow();
  });
  it('ignores malformed stored settings without raising limits', () => {
    localStorage.setItem('spark.previewBudgets.v1', '{"decodedMiB":999999}');
    expect(previewBudgets()).toEqual(defaultPreviewBudgets);
  });
});

it('splits the saved reusable CPU limit across native responses and decoded pixels',async()=>{
 const {nativePreviewBudget,pixelPreviewBudget}=await import('./resourceBudgets');
 savePreviewBudgets({decodedMiB:16,textureMiB:64,warmEditors:1,inspectionMiB:16});
 expect(nativePreviewBudget()+pixelPreviewBudget()).toBe(decodedPreviewBudget());
 expect(previewBudgets().inspectionMiB).toBe(16);
 expect(()=>savePreviewBudgets({...previewBudgets(),inspectionMiB:Infinity})).toThrow();
});
