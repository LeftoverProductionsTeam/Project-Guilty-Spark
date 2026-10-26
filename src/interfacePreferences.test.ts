import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERFACE, INTERFACE_STORAGE_KEY, readInterfacePreferences,
  sanitizeInterfacePreferences, saveInterfacePreferences, validCueRef,
} from './interfacePreferences';

describe('local Halo interface profiles', () => {
  it('defaults to quiet and an original-asset-free Halo CE-inspired theme', () => {
    expect(sanitizeInterfacePreferences(null)).toEqual(DEFAULT_INTERFACE);
    expect(DEFAULT_INTERFACE.uiAudioEnabled).toBe(false);
  });
  it('validates and clamps untrusted persisted preferences', () => {
    const prefs = sanitizeInterfacePreferences({ schemaVersion: 1, theme: 'evil', uiAudioEnabled: true, uiVolume: 50, reducedMotion: true, cues: { select: { tagId: -10 } } });
    expect(prefs.theme).toBe('halo-ce');
    expect(prefs.uiVolume).toBe(1);
    expect(prefs.cues.select).toBeUndefined();
    expect(prefs.reducedMotion).toBe(true);
  });
  it('persists only references to user-supplied local resources', () => {
    const ref = { projectId: 'local-1', tagId: 123, pitchRange: 0, permutation: 0, sourceHash: 'abc123', label: 'UI select' };
    expect(validCueRef(ref)).toBe(true);
    const data = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => { data.set(k, v); }, getItem: (k: string) => data.get(k) ?? null };
    saveInterfacePreferences({ ...DEFAULT_INTERFACE, theme: 'covenant', cues: { select: ref } }, storage);
    expect(data.get(INTERFACE_STORAGE_KEY)).not.toContain('audioBytes');
    const loaded = readInterfacePreferences(storage);
    expect(loaded.cues.select).toEqual(ref);
    expect(loaded.theme).toBe('covenant');
    expect(loaded.uiAudioEnabled).toBe(false);
  });
  it('does not crash on malformed saved data', () => {
    expect(readInterfacePreferences({ getItem: () => '{broken' })).toEqual(DEFAULT_INTERFACE);
  });
});
