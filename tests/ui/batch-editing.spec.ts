import { test, expect } from '@playwright/test';
import { chooseTool } from './helpers/navigation';

test('batch review builds only the compatible maps explicitly reviewed', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('guilty-spark-first-run-seen-v1', 'yes');
    const w = window as typeof window & Record<string, any>;
    const map = (id: string, title: string) => ({
      id, title, engine: 'MCC', version: 13, sha256: 'a'.repeat(64),
      modifiedAt: '2026-11-24', creator: 'Test fixture', tagCount: 1, objectCount: 0,
      status: 'imported', projectPath: 'fixture', scenarioType: 0,
    });
    const entries = [map('a', 'Alpha'), map('b', 'Bravo'), map('c', 'Charlie')];
    const digest = 'b'.repeat(64);
    w.isTauri = true;
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    w.batchCalls = [];
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: () => 1,
      invoke: async (command: string, args: { ids?: string[]; reviewSha256?: string }) => {
        if (command === 'bootstrap') return {
          entries, managed: null, settings: { preferredHalo: 'mccSteam', onboardingCompleted: true },
          installation: { libraries: [], diagnostics: [], halo1Installed: false },
          dataDirectory: 'Fixture', inboxDirectory: 'Fixture', diagnostics: [], logs: [],
        };
        if (command === 'search_batch_fields') return {
          fields: [{ class: 'weap', path: 'weapons/pistol', field: 'velocity', label: 'Velocity', matchingProjectIds: ['a', 'c'] }],
          unreadableMaps: [{ projectId: 'b', problem: 'Save this map and review again' }],
        };
        if (command === 'preview_numeric_batch') {
          w.batchCalls.push({ command, ids: args.ids });
          const edit = { before: 10, after: 25, kind: 'f32', unit: 'wu/s', sourceSha256: 'a'.repeat(64), cacheVersion: 13 };
          return {
            rows: args.ids?.map((projectId) => projectId === 'b'
              ? { projectId, edit: null, problem: 'Save this map and review again' }
              : { projectId, edit, problem: null }),
            reviewSha256: args.ids?.includes('b') ? null : digest,
            recoverable: false,
          };
        }
        if (command === 'build_numeric_batch') {
          w.batchCalls.push({ command, ids: args.ids, reviewSha256: args.reviewSha256 });
          return { batchId: 'fixture', published: true, recoverable: false, problem: null, rows: [] };
        }
        if (command === 'plugin:window|scale_factor') return devicePixelRatio;
        if (command === 'plugin:window|inner_size') return { width: innerWidth, height: innerHeight };
        if (command === 'plugin:event|listen') return 1;
        if (['runtime_report', 'discover_halo_connections', 'list_runtime_registrations', 'workspace_layout_names'].includes(command)) return [];
        return null;
      },
    };
  });
  await page.goto('/');
  await chooseTool(page, 'Map library');
  await page.getByText('Multi Map Batch Editing', { exact: true }).click();
  await page.getByRole('button', { name: 'Select saved solo maps' }).click();
  await page.getByRole('button', { name: 'Find fields and check selected maps' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Bravo · Save this map' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Numeric tag field', exact: true }).selectOption({ label: 'Velocity · weapons/pistol (weap) · 2/3 maps' });
  await page.getByRole('spinbutton', { name: 'New value' }).fill('25');
  await page.getByRole('button', { name: 'Review every map' }).click();
  const review = page.getByRole('list', { name: 'Per-map review' });
  await expect(review).toContainText('Bravo · Save this map and review again');
  await expect(page.getByRole('button', { name: 'Build and verify batch' })).toBeDisabled();

  await page.getByRole('button', { name: 'Review 2 compatible maps' }).click();
  await expect(page.getByRole('checkbox', { name: /Bravo/ })).not.toBeChecked();
  await expect(review.getByRole('listitem')).toHaveCount(2);
  await expect(review).toContainText('Alpha');
  await expect(review).toContainText('Charlie');
  await expect(review).not.toContainText('Bravo');
  await page.getByRole('button', { name: 'Build and verify batch' }).click();
  await expect(page.getByRole('button', { name: 'Open batch output' })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & Record<string, any>).batchCalls)).toEqual([
    { command: 'preview_numeric_batch', ids: ['a', 'b', 'c'] },
    { command: 'preview_numeric_batch', ids: ['a', 'c'] },
    { command: 'build_numeric_batch', ids: ['a', 'c'], reviewSha256: 'b'.repeat(64) },
  ]);
});
