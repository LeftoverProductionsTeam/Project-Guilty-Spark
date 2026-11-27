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
        if (command === 'import_map_sources') return { entries: [entries[0], entries[1], {...map('xbox','Legacy Xbox'),engine:'Halo Xbox',version:5}], failures: [] };
        if (command === 'search_batch_fields') {
          w.batchCalls.push({ command, ids: args.ids });
          return {
            fields: [{ class: 'weap', path: 'weapons/pistol', field: 'velocity', label: 'Velocity', kind: 'f32', unit: 'wu/s', matchingProjectIds: ['b', 'c'] }],
            unreadableMaps: [{ projectId: 'a', problem: 'Save this map and review again' }],
            totalMatches: 1,
          };
        }
        if (command === 'preview_numeric_batch') {
          w.batchCalls.push({ command, ids: args.ids });
          const edit = { before: 10, after: 25, kind: 'f32', unit: 'wu/s', sourceSha256: 'a'.repeat(64), cacheVersion: 13 };
          return {
            rows: args.ids?.map((projectId) => projectId === 'a'
              ? { projectId, edit: null, problem: 'Save this map and review again' }
              : { projectId, edit, problem: null }),
            reviewSha256: args.ids?.includes('a') ? null : digest,
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
  await page.locator('.multi-map-batch > summary').click();
  await page.getByRole('button', { name: 'Select saved solo maps' }).click();
  await page.getByRole('button', { name: 'Find fields and check selected maps' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alpha · Save this map' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Numeric tag field', exact: true }).selectOption({ label: 'Velocity · weapons/pistol (weap) · f32 · wu/s · 2/3 maps' });
  await page.getByRole('spinbutton', { name: 'New value' }).fill('25');
  await page.getByRole('button', { name: 'Review every map' }).click();
  const review = page.getByRole('list', { name: 'Per-map review' });
  await expect(review).toContainText('Alpha · Save this map and review again');
  await expect(page.getByRole('button', { name: 'Build and verify batch' })).toBeDisabled();

  await page.getByRole('button', { name: 'Review 2 compatible maps' }).click();
  await expect(page.getByRole('checkbox', { name: /Alpha/ })).not.toBeChecked();
  await expect(review.getByRole('listitem')).toHaveCount(2);
  await expect(review).toContainText('Bravo');
  await expect(review).toContainText('Charlie');
  await expect(review).not.toContainText('Alpha');
  await page.getByRole('button', { name: 'Build and verify batch' }).click();
  await expect(page.getByRole('button', { name: 'Open batch output' })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & Record<string, any>).batchCalls)).toEqual([
    { command: 'search_batch_fields', ids: ['a', 'b', 'c'] },
    { command: 'preview_numeric_batch', ids: ['a', 'b', 'c'] },
    { command: 'preview_numeric_batch', ids: ['b', 'c'] },
    { command: 'build_numeric_batch', ids: ['b', 'c'], reviewSha256: 'b'.repeat(64) },
  ]);
  const target = page.getByText('Drop map files here', {exact:true});
  await target.scrollIntoViewIfNeeded();
  const bounds = (await target.boundingBox())!;
  const consumed = await page.evaluate(({x,y}) => !window.dispatchEvent(new CustomEvent('guilty-spark-map-source-drop', {
    cancelable:true, detail:{paths:['alpha.map','bravo.map','legacy.map'],x,y},
  })), {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2});
  expect(consumed).toBe(true);
  await expect(page.getByRole('status').filter({hasText:'3 added to tabs. 2 eligible'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Legacy Xbox', includeHidden:true})).toHaveCount(1);
  await expect(page.getByRole('checkbox',{name:'Alpha · cache 13'})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Bravo · cache 13'})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:/Legacy Xbox/})).toHaveCount(0);

});
