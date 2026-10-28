import { validLocalInterfaceBitmapRef } from './ownedInterfaceBitmap.ts';
import type { LocalInterfaceBitmapRef } from './ownedInterfaceBitmap.ts';
/** Local-only Halo CE-inspired appearance and UI-audio preferences.
 *
 * This configuration contains source references only. Never cache or export
 * copyrighted Halo bitmap/audio bytes as part of a theme profile.
 */
export const themeNames = ['halo-ce', 'unsc', 'covenant', 'forerunner', 'dark-glow'] as const;
export type ThemeName = typeof themeNames[number];
export const cueNames = ['select', 'confirm', 'warning'] as const;
export type CueName = typeof cueNames[number];
export interface LocalCueReference {
  projectId: string;
  tagId: number;
  pitchRange: number;
  permutation: number;
  sourceHash: string;
  label: string;
}
export interface InterfacePreferences {
  schemaVersion: 1;
  theme: ThemeName;
  uiAudioEnabled: boolean;
  uiVolume: number;
  reducedMotion: boolean;
  windowOpacity:number;
  windowTint:string;
  windowTintStrength:number;
  glowPrimary:string;
  glowSecondary:string;
  glowIntensity:number;
  cues: Partial<Record<CueName, LocalCueReference>>;
  /** A user-selected Halo tag ID and exact source hash, NEVER image bytes. */
  bitmap: LocalInterfaceBitmapRef | null;
}
export const DEFAULT_INTERFACE: InterfacePreferences = {
  schemaVersion: 1,
  theme: 'covenant',
  uiAudioEnabled: false, // Never autoplay or assume user consent for local game sounds.
  uiVolume: 0.3,
  reducedMotion: false,
  windowOpacity:1,
  windowTint:'#65c5ff',
  windowTintStrength:0,
  glowPrimary:'#57dfff',
  glowSecondary:'#bb83ff',
  glowIntensity:0.65,
  cues: {},
  bitmap: null,
};
export const INTERFACE_STORAGE_KEY = 'guilty-spark:interface-v1';
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function color(v:unknown,fallback:string):string {
  return typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():fallback;
}
export function validCueRef(v: unknown): v is LocalCueReference {
  if (!isRecord(v)) return false;
  return typeof v.projectId === 'string' && v.projectId.length > 0 && v.projectId.length < 160 &&
    Number.isSafeInteger(v.tagId) && (v.tagId as number) >= 0 &&
    Number.isSafeInteger(v.pitchRange) && (v.pitchRange as number) >= 0 && (v.pitchRange as number) < 65536 &&
    Number.isSafeInteger(v.permutation) && (v.permutation as number) >= 0 && (v.permutation as number) < 65536 &&
    typeof v.sourceHash === 'string' && v.sourceHash.length <= 128 &&
    typeof v.label === 'string' && v.label.length <= 256;
}
export function sanitizeInterfacePreferences(v: unknown): InterfacePreferences {
  if (!isRecord(v) || v.schemaVersion !== 1) return { ...DEFAULT_INTERFACE, cues: {} };
  const rawCues = isRecord(v.cues) ? v.cues : {};
  const cues: InterfacePreferences['cues'] = {};
  for (const cue of cueNames) if (validCueRef(rawCues[cue])) cues[cue] = rawCues[cue];
  return {
    schemaVersion: 1,
    theme: typeof v.theme === 'string' && (themeNames as readonly string[]).includes(v.theme)
      ? v.theme as ThemeName : DEFAULT_INTERFACE.theme,
    uiAudioEnabled: v.uiAudioEnabled === true,
    uiVolume: typeof v.uiVolume === 'number' && Number.isFinite(v.uiVolume)
      ? Math.max(0, Math.min(1, v.uiVolume)) : DEFAULT_INTERFACE.uiVolume,
    reducedMotion: v.reducedMotion === true,
    windowOpacity:typeof v.windowOpacity==='number'&&Number.isFinite(v.windowOpacity)?Math.max(.1,Math.min(1,v.windowOpacity)):1,
    windowTint:typeof v.windowTint==='string'&&/^#[0-9a-f]{6}$/i.test(v.windowTint)?v.windowTint.toLowerCase():DEFAULT_INTERFACE.windowTint,
    windowTintStrength:typeof v.windowTintStrength==='number'&&Number.isFinite(v.windowTintStrength)?Math.max(0,Math.min(.5,v.windowTintStrength)):0,
    glowPrimary:color(v.glowPrimary,DEFAULT_INTERFACE.glowPrimary),
    glowSecondary:color(v.glowSecondary,DEFAULT_INTERFACE.glowSecondary),
    glowIntensity:typeof v.glowIntensity==='number'&&Number.isFinite(v.glowIntensity)?Math.max(0,Math.min(1,v.glowIntensity)):DEFAULT_INTERFACE.glowIntensity,
    cues,
    bitmap: validLocalInterfaceBitmapRef(v.bitmap) ? {
      projectId:v.bitmap.projectId,bitmapTagId:v.bitmap.bitmapTagId,sourceSha256:v.bitmap.sourceSha256.toLowerCase(),
    } : null,
  };
}
export function readInterfacePreferences(storage?: Pick<Storage, 'getItem'>): InterfacePreferences {
  try {
    const raw = (storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage))
      ?.getItem(INTERFACE_STORAGE_KEY);
    return raw ? sanitizeInterfacePreferences(JSON.parse(raw)) : { ...DEFAULT_INTERFACE, cues: {} };
  } catch {
    return { ...DEFAULT_INTERFACE, cues: {} };
  }
}
export function saveInterfacePreferences(preferences: InterfacePreferences, storage?: Pick<Storage,'setItem'>): void {
  try {
    (storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage))
      ?.setItem(INTERFACE_STORAGE_KEY, JSON.stringify(sanitizeInterfacePreferences(preferences)));
  } catch {
    // Storage may be blocked/full. Never crash or mutate a Halo project over UI preferences.
  }
}
export function applyInterfacePreferences(preferences: InterfacePreferences, root: HTMLElement): void {
  root.dataset.gsTheme = preferences.theme;
  root.dataset.gsReducedMotion = preferences.reducedMotion ? 'true' : 'false';
  root.style.setProperty('--gs-window-opacity',String(preferences.windowOpacity));
  root.style.setProperty('--gs-window-tint',preferences.windowTint);
  root.style.setProperty('--gs-window-tint-strength',String(preferences.windowTintStrength));
  root.style.setProperty('--gs-glow-primary',preferences.glowPrimary);
  root.style.setProperty('--gs-glow-secondary',preferences.glowSecondary);
  root.style.setProperty('--gs-glow-percent',`${Math.round(preferences.glowIntensity*35)}%`);
  root.style.setProperty('--gs-glow-blur',`${Math.round(preferences.glowIntensity*22)}px`);
}
