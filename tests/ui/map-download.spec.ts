// Synthetic IPC contract only. Native HTTP/filesystem coverage is in map_download.rs.
import { test, expect } from '@playwright/test';
async function desktop(page: import('@playwright/test').Page, slow = false) {
  await page.addInitScript(
    ({ slow }) => {
      const w = window as any;
      w.isTauri = true;
      w.downloadCalls = [];
      let phase = 'queued',
        rejectDownload: ((error: string) => void) | null = null;
      const id = '00000000-0000-0000-0000-000000000123';
      const status = () => ({
        id,
        phase,
        bytes: 8192,
        total: 8192,
        sourceUrl: 'https://example.com /… (path and query kept private)',
        detail: phase === 'cancelled' ? 'Download cancelled' : 'Preserved maps ready',
        projectIds: phase === 'imported' ? ['map-a', 'map-b'] : [],
      });
      w.__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          w.downloadCalls.push(command);
          if (command === 'prepare_map_download') return status();
          if (command === 'map_download_status') return status();
          if (command === 'download_and_import_maps')
            return new Promise((resolve, reject) => {
              rejectDownload = reject;
              setTimeout(
                () => {
                  if (phase === 'cancelled') return;
                  phase = 'imported';
                  resolve([
                    { project: { id: 'map-a' }, inspection: null },
                    { project: { id: 'map-b' }, inspection: null },
                  ]);
                },
                slow ? 30000 : 20,
              );
            });
          if (command === 'cancel_map_download') {
            phase = 'cancelled';
            rejectDownload?.('Download cancelled');
            return true;
          }
          if (command === 'open_project') return { project: { id: args.id }, inspection: null };
          throw new Error('Unexpected fixture command ' + command);
        },
      };
    },
    { slow },
  );
}
test('direct download imports all maps and routes the requested editor action', async ({ page }) => {
  await desktop(page);
  await page.goto('/tests/ui/fixtures/mapDownload.html');
  const button = page.getByRole('button', { name: 'Download & import map' });
  await expect(button).toBeDisabled();
  await page.getByLabel('Direct map download URL').fill('https://example.com/catalog.html');
  await expect(button).toBeDisabled();
  await page.getByLabel('Direct map download URL').fill('https://example.com/arena.zip?key=synthetic');
  await page.getByLabel('Downloaded map action').selectOption('tags');
  await button.click();
  await expect(page.getByTestId('download-opened')).toHaveText(
    JSON.stringify({ ids: ['map-a', 'map-b'], action: 'tags' }),
  );
  expect(await page.evaluate(() => (window as any).downloadCalls)).toContain('download_and_import_maps');
});
test('cancelled transfer does not open maps or display a false import success', async ({ page }) => {
  await desktop(page, true);
  await page.goto('/tests/ui/fixtures/mapDownload.html');
  await page.getByLabel('Direct map download URL').fill('https://example.com/arena.map');
  await page.getByRole('button', { name: 'Download & import map' }).click();
  await page.getByRole('button', { name: 'Cancel download', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Map download status' })).toContainText('Download cancelled');
  await expect(page.getByTestId('download-opened')).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Open imported maps' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download & import map' })).toBeEnabled();
});
