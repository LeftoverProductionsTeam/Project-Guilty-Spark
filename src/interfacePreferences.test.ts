import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERFACE, INTERFACE_STORAGE_KEY, readInterfacePreferences,
  sanitizeInterfacePreferences, saveInterfacePreferences, validCueRef,
  applyInterfacePreferences,
} from './interfacePreferences';

describe('local Halo interface profiles', () => {
  it('defaults to quiet and an original-asset-free Halo CE-inspired theme', () => {
    expect(sanitizeInterfacePreferences(null)).toEqual(DEFAULT_INTERFACE);
    expect(DEFAULT_INTERFACE.uiAudioEnabled).toBe(false);
  });
  it('validates and clamps untrusted persisted preferences', () => {
    const prefs = sanitizeInterfacePreferences({ schemaVersion: 1, theme: 'evil', uiAudioEnabled: true, uiVolume: 50, reducedMotion: true, cues: { select: { tagId: -10 } } });
    expect(prefs.theme).toBe('covenant');
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
  it('keeps legacy profiles and sanitizes editable glow colors and intensity',()=>{
    const legacy=sanitizeInterfacePreferences({schemaVersion:1,theme:'unsc'});
    expect(legacy.theme).toBe('unsc');
    expect(legacy.glowPrimary).toBe(DEFAULT_INTERFACE.glowPrimary);
    const invalid=sanitizeInterfacePreferences({schemaVersion:1,theme:'dark-glow',glowPrimary:'url(javascript:bad)',glowSecondary:'#ABCDEF',glowIntensity:20});
    expect(invalid.theme).toBe('dark-glow');
    expect(invalid.glowPrimary).toBe(DEFAULT_INTERFACE.glowPrimary);
    expect(invalid.glowSecondary).toBe('#abcdef');
    expect(invalid.glowIntensity).toBe(1);
    expect(sanitizeInterfacePreferences({schemaVersion:1,glowIntensity:NaN}).glowIntensity).toBe(DEFAULT_INTERFACE.glowIntensity);
  });
  it('persists custom glow and applies it independently of window glass',()=>{
    const data=new Map<string,string>(),storage={setItem:(k:string,v:string)=>{data.set(k,v);},getItem:(k:string)=>data.get(k)??null};
    saveInterfacePreferences({...DEFAULT_INTERFACE,theme:'dark-glow',glowPrimary:'#ff5d9c',glowSecondary:'#83ffcd',glowIntensity:0.8},storage);
    const loaded=readInterfacePreferences(storage),values=new Map<string,string>();
    const root={dataset:{},style:{setProperty:(k:string,v:string)=>values.set(k,v)}} as unknown as HTMLElement;
    applyInterfacePreferences(loaded,root);
    expect(root.dataset.gsTheme).toBe('dark-glow');
    expect(values.get('--gs-glow-primary')).toBe('#ff5d9c');
    expect(values.get('--gs-glow-secondary')).toBe('#83ffcd');
    expect(values.get('--gs-glow-percent')).toBe('28%');
    expect(values.get('--gs-window-opacity')).toBe('1');
    applyInterfacePreferences({...loaded,glowIntensity:0},root);
    expect(values.get('--gs-glow-percent')).toBe('0%');
    expect(values.get('--gs-glow-blur')).toBe('0px');
  });
});
