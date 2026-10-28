import { describe, expect, it } from 'vitest';
import { createPowerup, validatePowerups } from './powerups';
describe('custom native power-ups', () => {
  it('keeps independent recipe positions and rejects duplicate identities and escaping tags', () => {
    const position: [number, number, number] = [1, 2, 3],
      a = createPowerup(position),
      b = createPowerup(position);
    a.position[0] = 10;
    expect(b.position).toEqual([1, 2, 3]);
    expect(position).toEqual([1, 2, 3]);
    expect(validatePowerups([a, b])).toEqual([]);
    expect(validatePowerups([a, a])).not.toEqual([]);
    expect(validatePowerups([{ ...a, modelTag: '../private.gbxmodel' }])).not.toEqual([]);
  });
  it('accepts real model and sound dependencies while rejecting nonfinite timing and incomplete paths', () => {
    const p = createPowerup();
    expect(
      validatePowerups([
        {
          ...p,
          modelTag: 'powerups/over shield/over shield.gbxmodel',
          pickupSound: 'sound/sfx/pickup.sound',
        },
      ]),
    ).toEqual([]);
    for (const patch of [
      { durationSeconds: NaN },
      { respawnSeconds: 2.5 },
      { modelTag: 'powerups/' },
      { position: [Infinity, 0, 0] as [number, number, number] },
    ])
      expect(validatePowerups([{ ...p, ...patch }])).not.toEqual([]);
  });
});
