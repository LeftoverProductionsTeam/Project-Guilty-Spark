import { expect, test } from 'vitest';
import { DEFAULT_NAVIGATION, flightVelocity, navigationConfig, scrollFlightSpeed } from './editorFlight';
test('Halo Z-up uses E to rise and Q to descend, with normalized diagonal speed', () => {
  expect(flightVelocity({ yaw: 0, pitch: 0 }, new Set(['KeyE']))).toEqual([0, 0, 12]);
  expect(flightVelocity({ yaw: 0, pitch: 0 }, new Set(['KeyQ']))).toEqual([0, 0, -12]);
  const v = flightVelocity({ yaw: 0, pitch: 0 }, new Set(['KeyW', 'KeyD', 'KeyE', 'ShiftLeft']));
  expect(Math.hypot(...v)).toBeCloseTo(36);
});
test('remapped vertical controls are unique and invalid persisted bindings restore safe defaults', () => {
  const config = navigationConfig({
    ...DEFAULT_NAVIGATION,
    bindings: { ...DEFAULT_NAVIGATION.bindings, up: 'KeyR', down: 'KeyF' },
  });
  expect(flightVelocity({ yaw: 0, pitch: 0 }, new Set(['KeyR']), config.speed, config.bindings)).toEqual([
    0, 0, 12,
  ]);
  expect(navigationConfig({ bindings: { ...DEFAULT_NAVIGATION.bindings, up: 'KeyW' } })).toEqual(
    DEFAULT_NAVIGATION,
  );
});
test('RMB wheel speed is bounded and rejects invalid events', () => {
  expect(scrollFlightSpeed(12, -120)).toBeGreaterThan(12);
  expect(scrollFlightSpeed(12, 120)).toBeLessThan(12);
  expect(scrollFlightSpeed(100, -1000)).toBe(100);
  expect(scrollFlightSpeed(0.2, 1000)).toBe(0.2);
  expect(() => scrollFlightSpeed(12, Infinity)).toThrow();
});
