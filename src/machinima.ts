import type { CameraShot } from './creatorStudio';
import type { Vec3 } from './types';

export interface MachinimaSettings {
  fps: 24 | 30 | 60;
  aspect: '16:9' | '2.39:1' | '1:1' | '9:16';
  thirds: boolean;
  safeFrame: boolean;
  center: boolean;
  showPath: boolean;
  loopPlayback: boolean;
  speed: number;
  depthOfField: boolean;
  focusDistance: number;
  blur: number;
}
export const DEFAULT_MACHINIMA: MachinimaSettings = {
  fps: 30,
  aspect: '16:9',
  thirds: true,
  safeFrame: true,
  center: false,
  showPath: true,
  loopPlayback: false,
  speed: 1,
  depthOfField: false,
  focusDistance: 20,
  blur: 0.35,
};
export interface CameraPose {
  position: Vec3;
  lookAt: Vec3;
  fov: number;
  roll: number;
}
const finite = (n: unknown, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const vec = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => finite(n, -4096, 4096));
export function validMachinimaSettings(value: unknown): value is MachinimaSettings {
  if (!value || typeof value !== 'object') return false;
  const m = value as MachinimaSettings;
  return (
    [24, 30, 60].includes(m.fps) &&
    ['16:9', '2.39:1', '1:1', '9:16'].includes(m.aspect) &&
    ['thirds', 'safeFrame', 'center', 'showPath', 'loopPlayback', 'depthOfField'].every(
      (k) => typeof m[k as keyof MachinimaSettings] === 'boolean',
    ) &&
    finite(m.speed, 0.25, 2) &&
    finite(m.focusDistance, 0.1, 4096) &&
    finite(m.blur, 0, 1)
  );
}
export function aspectRatio(aspect: MachinimaSettings['aspect']): number {
  return { '16:9': 16 / 9, '2.39:1': 2.39, '1:1': 1, '9:16': 9 / 16 }[aspect];
}
/** One duration per key: transition to the next key, then hold the final key. */
export function takeDuration(shots: readonly CameraShot[]): number {
  return shots.reduce((n, s) => n + s.durationMs, 0);
}
export function shotStart(shots: readonly CameraShot[], index: number): number {
  return takeDuration(shots.slice(0, index));
}
export function sampleCamera(
  shots: readonly CameraShot[],
  timeMs: number,
): { pose: CameraPose; index: number } | null {
  if (!shots.length) return null;
  let index = 0,
    t = Math.max(0, Number.isFinite(timeMs) ? timeMs : 0);
  while (index < shots.length - 1 && t >= shots[index].durationMs) {
    t -= shots[index].durationMs;
    index++;
  }
  const a = shots[index],
    b = shots[Math.min(index + 1, shots.length - 1)],
    raw = Math.min(1, t / a.durationMs);
  const u = a.easing === 'cut' ? 0 : a.easing === 'linear' ? raw : raw * raw * (3 - 2 * raw);
  const mix = (x: number, y: number) => x + (y - x) * u;
  const blend = (x: Vec3, y: Vec3) => x.map((n, i) => mix(n, y[i])) as Vec3;
  // Choose the shortest roll arc across the -180/180 seam.
  const roll = a.roll ?? 0,
    delta = (((b.roll ?? 0) - roll + 540) % 360) - 180;
  return {
    index,
    pose: {
      position: blend(a.cameraPosition, b.cameraPosition),
      lookAt: blend(a.lookAt, b.lookAt),
      fov: mix(a.fov, b.fov),
      roll: roll + delta * u,
    },
  };
}
export function poseShot(pose: CameraPose, name: string): CameraShot {
  if (!vec(pose.position) || !vec(pose.lookAt) || !finite(pose.fov, 10, 140) || !finite(pose.roll, -180, 180))
    throw new Error('Camera is outside the supported 4096-unit scene bounds.');
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 120),
    durationMs: 3000,
    cameraPosition: [...pose.position],
    lookAt: [...pose.lookAt],
    fov: pose.fov,
    roll: pose.roll,
    easing: 'smooth',
    subtitle: '',
  };
}
/** Import only bounded camera data. Never accepts scripts, paths or engine commands. */
export function parseCameraTake(text: string): { shots: CameraShot[]; settings: MachinimaSettings } {
  if (text.length > 512 * 1024) throw new Error('Camera take exceeds 512 KiB.');
  const data = JSON.parse(text);
  if (
    !data ||
    data.schemaVersion !== 1 ||
    data.kind !== 'sparkCameraTake' ||
    !Array.isArray(data.shots) ||
    data.shots.length > 256 ||
    !validMachinimaSettings(data.settings)
  )
    throw new Error('Unsupported camera take or lens settings.');
  const shots = data.shots.map((s: CameraShot) => {
    if (
      !s ||
      typeof s.name !== 'string' ||
      s.name.length > 120 ||
      /[\x00-\x1f\x7f]/.test(s.name) ||
      typeof s.subtitle !== 'string' ||
      s.subtitle.length > 2048 ||
      /[\x00-\x1f\x7f]/.test(s.subtitle) ||
      !Number.isInteger(s.durationMs) ||
      !finite(s.durationMs, 100, 600000) ||
      !vec(s.cameraPosition) ||
      !vec(s.lookAt) ||
      !finite(s.fov, 10, 140) ||
      (s.roll !== undefined && !finite(s.roll, -180, 180)) ||
      (s.easing !== undefined && !['linear', 'smooth', 'cut'].includes(s.easing))
    )
      throw new Error('Invalid shot in camera take.');
    return {
      ...poseShot({ position: s.cameraPosition, lookAt: s.lookAt, fov: s.fov, roll: s.roll ?? 0 }, s.name),
      durationMs: s.durationMs,
      easing: s.easing ?? 'smooth',
      subtitle: s.subtitle,
    };
  });
  return { shots, settings: data.settings };
}
export function encodeCameraTake(shots: CameraShot[], settings: MachinimaSettings): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'sparkCameraTake',
      viewportPlayback: true,
      gamePlaybackVerified: false,
      shots,
      settings,
    },
    null,
    2,
  );
}
export function shotListCsv(shots: CameraShot[]): string {
  const quote = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  return [
    'Shot,Start seconds,Duration seconds,Camera X,Camera Y,Camera Z,FOV,Roll,Transition,Subtitle',
    ...shots.map((s, i) =>
      [
        quote(s.name),
        (shotStart(shots, i) / 1000).toFixed(3),
        (s.durationMs / 1000).toFixed(3),
        ...s.cameraPosition,
        s.fov,
        s.roll ?? 0,
        s.easing ?? 'smooth',
        quote(s.subtitle),
      ].join(','),
    ),
  ].join('\r\n');
}
