import { validLocalInterfaceBitmapRef } from './ownedInterfaceBitmap.ts';
import type { LocalInterfaceBitmapRef } from './ownedInterfaceBitmap.ts';
/** Local-only Halo CE-inspired appearance and UI-audio preferences.
 *
 * This configuration contains source references only. Never cache or export
 * copyrighted Halo bitmap/audio bytes as part of a theme profile.
 */
export const themeNames = ['halo-ce', 'unsc', 'covenant', 'forerunner'] as const;
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
  cues: Partial<Record<CueName, LocalCueReference>>;
  /** A user-selected Halo tag ID and exact source hash, NEVER image bytes. */
  bitmap: LocalInterfaceBitmapRef | null;
}
export const DEFAULT_INTERFACE: InterfacePreferences = {
  schemaVersion: 1,
  theme: 'halo-ce',
  uiAudioEnabled: false, // Never autoplay or assume user consent for local game sounds.
  uiVolume: 0.3,
  reducedMotion: false,
  cues: {},
  bitmap: null,
};
export const INTERFACE_STORAGE_KEY = 'guilty-spark:interface-v1';
function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
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
}
