import { describe, expect, it } from 'vitest';
import { browserBootstrap } from './api';
import { reconcileSettingsDraft } from './settings';

describe('preference draft reconciliation', () => {
  it('retains a browsed path across an unrelated bootstrap refresh', () => {
    const previous = browserBootstrap.settings;
    const draft = { ...previous, invaderDirectory: 'C:/Installed/Invader' };
    expect(reconcileSettingsDraft(draft, previous, { ...previous })).toEqual(draft);
  });
  it('adopts external changes only for fields the user has not edited', () => {
    const previous = browserBootstrap.settings;
    const draft = { ...previous, resourceDirectory: 'C:/Original resources' };
    const next = reconcileSettingsDraft(draft, previous, {
      ...previous,
      autoBuild: false,
      resourceDirectory: 'C:/Other',
    });
    expect(next.resourceDirectory).toBe(draft.resourceDirectory);
    expect(next.autoBuild).toBe(false);
  });
});
