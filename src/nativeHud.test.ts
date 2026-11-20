import { describe, expect, it } from 'vitest';
import { ceHudArtworkScale } from './nativeHud';

describe('CE HUD artwork preview scale', () => {
  it('combines scale flags without applying high resolution twice', () => {
    const shield = 'hud:shield_panel_background_';
    expect(ceHudArtworkScale('unhi', shield, 0, 0)).toBe(1);
    expect(ceHudArtworkScale('unhi', shield, 4, 128)).toBe(0.5);
    expect(ceHudArtworkScale('unhi', shield, 4, 16 | 128)).toBe(0.25);
    expect(ceHudArtworkScale('unhi', shield, 3, 16)).toBe(0.5);
  });

  it('uses placement flags only on the corresponding native element types', () => {
    expect(ceHudArtworkScale('wphi', 'hud:static_elements[0].', 4, 0)).toBe(0.5);
    expect(ceHudArtworkScale('wphi', 'hud:crosshairs[0].crosshair_overlays[0].', 4, 0)).toBe(1);
    expect(ceHudArtworkScale('grhi', 'hud:total_grenades_overlays[0].', 4, 128)).toBe(0.5);
    expect(ceHudArtworkScale('grhi', 'hud:total_grenades_background_', 4, 0)).toBe(0.5);
    expect(ceHudArtworkScale('hudg', 'hud:messaging_', 4, 128)).toBe(1);
  });

  it('keeps raw scaling when an older metadata reply omits bitmap flags', () => {
    expect(ceHudArtworkScale('unhi', 'hud:motion_sensor_background_', 4, undefined)).toBe(1);
  });
});
