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
  it('keeps fades and shield feedback optional and preserves them with reduced motion',()=>{
    const prefs=sanitizeInterfacePreferences({schemaVersion:1,workspaceTransitions:false,shieldLoading:false,reducedMotion:true});
    const values=new Map<string,string>();const root={dataset:{},style:{setProperty:(key:string,value:string)=>values.set(key,value)}} as unknown as HTMLElement;
    applyInterfacePreferences(prefs,root);expect(root.dataset.gsWorkspaceTransitions).toBe('false');expect(root.dataset.gsShieldLoading).toBe('false');expect(root.dataset.gsReducedMotion).toBe('true');
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

it('saves the menu eye tint safely without changing native source references',()=>{
 const prefs=sanitizeInterfacePreferences({...DEFAULT_INTERFACE,monitorEyeColor:'#F07ABB'});expect(prefs.monitorEyeColor).toBe('#f07abb');
 expect(sanitizeInterfacePreferences({...prefs,monitorEyeColor:'url(bad)'}).monitorEyeColor).toBe(DEFAULT_INTERFACE.monitorEyeColor);
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)};saveInterfacePreferences(prefs,storage);expect(readInterfacePreferences(storage).monitorEyeColor).toBe('#f07abb');
 const root={dataset:{},style:{setProperty:(key:string,value:string)=>values.set(key,value)}} as unknown as HTMLElement;applyInterfacePreferences(prefs,root);expect(values.get('--gs-monitor-eye-color')).toBe('#f07abb');expect(prefs.bitmap).toBeNull();
});
