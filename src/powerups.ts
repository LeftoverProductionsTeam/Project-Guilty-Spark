import type { Vec3 } from './types';
export type PowerupEffect =
  'camouflage' | 'overshield' | 'health' | 'fragGrenade' | 'plasmaGrenade' | 'doubleSpeed';
export interface CustomPowerup {
  id: string;
  name: string;
  effect: PowerupEffect;
  durationSeconds: number;
  respawnSeconds: number;
  position: Vec3;
  facingDegrees: number;
  levitate: boolean;
  modelTag: string | null;
  pickupSound: string | null;
}
export const POWERUP_EFFECTS: { value: PowerupEffect; label: string }[] = [
  { value: 'camouflage', label: 'Active camouflage' },
  { value: 'overshield', label: 'Overshield' },
  { value: 'health', label: 'Health pickup' },
  { value: 'fragGrenade', label: 'Frag grenade pickup' },
  { value: 'plasmaGrenade', label: 'Plasma grenade pickup' },
  { value: 'doubleSpeed', label: 'Native double speed · experimental' },
];
export function createPowerup(position: Vec3 = [0, 0, 0]): CustomPowerup {
  return {
    id: crypto.randomUUID(),
    name: 'Custom camouflage',
    effect: 'camouflage',
    durationSeconds: 60,
    respawnSeconds: 90,
    position: [...position],
    facingDegrees: 0,
    levitate: true,
    modelTag: null,
    pickupSound: null,
  };
}
export function validatePowerups(items: CustomPowerup[]): string[] {
  const errors: string[] = [],
    ids = new Set<string>();
  if (!Array.isArray(items) || items.length > 64) return ['At most 64 custom power-up pickups per map.'];
  for (const p of items) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id) || ids.has(p.id))
      errors.push('Invalid or duplicate power-up identity.');
    ids.add(p.id);
    if (
      !p.name.trim() ||
      new TextEncoder().encode(p.name).length > 80 ||
      /[\x00-\x1f\x7f]/.test(p.name) ||
      !POWERUP_EFFECTS.some((e) => e.value === p.effect) ||
      typeof p.levitate !== 'boolean'
    )
      errors.push('Choose a power-up name and a supported native effect.');
    if (
      !Number.isFinite(p.durationSeconds) ||
      p.durationSeconds < 1 ||
      p.durationSeconds > 600 ||
      !Number.isInteger(p.respawnSeconds) ||
      p.respawnSeconds < 1 ||
      p.respawnSeconds > 3600
    )
      errors.push('Duration must be 1–600 seconds; respawn must be 1–3600 whole seconds.');
    if (
      p.position.length !== 3 ||
      p.position.some((n) => !Number.isFinite(n) || Math.abs(n) > 4096) ||
      !Number.isFinite(p.facingDegrees) ||
      Math.abs(p.facingDegrees) > 360
    )
      errors.push('Use finite map coordinates and facing from -360 to 360 degrees.');
    for (const [tag, extension] of [
      [p.modelTag, /\.(gbxmodel|model)$/i],
      [p.pickupSound, /\.sound$/i],
    ] as const) {
      if (
        tag !== null &&
        (!tag ||
          tag.length > 240 ||
          !extension.test(tag) ||
          /^[\\/]|[:\x00-\x1f\x7f]/.test(tag) ||
          tag
            .replaceAll('\\', '/')
            .split('/')
            .some((part) => !part || part === '.' || part === '..'))
      )
        errors.push('Use a relative .gbxmodel/.model or .sound tag path without parent folders.');
    }
  }
  return [...new Set(errors)];
}
