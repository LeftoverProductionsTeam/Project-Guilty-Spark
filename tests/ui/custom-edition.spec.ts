import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    w.ceCalls = [];
    w.ce = {
      sourceUrl: 'https://archive.org/download/halo-custom-edition-v-1.10/Halo%20Custom%20Edition%20v1.10.7z',
      archiveSha256: '33cf0e24551db62a08239d29077afbf9cdb2aec5c13234022c38ef144d486a3a',
      archiveBytes: 97046282,
      installation: null,
      canExtract: true,
      job: null,
    };
    const params = new URLSearchParams(location.search);
    if (params.has('found'))
      w.ce.installation = {
        root: 'C:/owned/Halo Custom Edition',
        executableSha256: 'a'.repeat(64),
        registered: false,
      };
    if (params.has('no-tar')) w.ce.canExtract = false;
    w.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        w.ceCalls.push({ command, args });
        if (command === 'custom_edition_setup') return structuredClone(w.ce);
        if (command === 'install_custom_edition') {
          w.ce.job = {
            id: 'job-own',
            phase: 'downloading',
            bytes: 1024,
            total: 97046282,
            detail: 'Downloading into a separate folder…',
            root: null,
          };
          return structuredClone(w.ce.job);
        }
        if (command === 'connect_custom_edition') {
          w.ce.installation = {
            root: 'C:/owned/Halo Custom Edition',
            executableSha256: 'a'.repeat(64),
            registered: true,
          };
          return w.ce.installation;
        }
        if (command === 'cancel_custom_edition_setup') {
          w.ce.job.phase = 'cancelled';
          w.ce.job.detail = 'Installation cancelled; existing installations were not changed';
          return null;
        }
        if (command === 'open_external_url') return null;
        throw Error('Unexpected IPC: ' + command);
      },
    };
  });
});
test('connects a detected game without downloading or replacing it', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/customEdition.html?found');
  await page.getByRole('button', { name: 'Use detected Custom Edition' }).click();
  await expect(page.getByText('Connections 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use detected Custom Edition' })).toHaveCount(0);
  const calls = await page.evaluate(() => (window as any).ceCalls);
  expect(calls.some((c: any) => c.command === 'install_custom_edition')).toBe(false);
  expect(calls.find((c: any) => c.command === 'connect_custom_edition').args).toEqual({
    chooseFolder: false,
    expectedSha256: 'a'.repeat(64),
  });
});
test('reviews the community source then tracks installation without blocking editing', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/customEdition.html');
  await page.getByRole('button', { name: 'Install Custom Edition…', exact: true }).click();
  await expect(page.getByText(/not publisher authentication/)).toBeVisible();
  await page.getByRole('button', { name: 'Download & install Custom Edition' }).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.getByRole('button', { name: 'Editor still responds 0' }).click();
  await expect(page.getByRole('button', { name: 'Editor still responds 1' })).toBeVisible();
  await page.evaluate(() => {
    const w = window as any;
    w.ce.job.phase = 'complete';
    w.ce.job.detail = 'Custom Edition installed and connected.';
    w.ce.installation = { root: 'C:/new/Custom Edition', executableSha256: 'a'.repeat(64), registered: true };
  });
  await expect(page.getByText('Custom Edition installed and connected.', { exact: true })).toBeVisible();
  await expect(page.getByText('Connections 1', { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as any).ceCalls);
  expect(calls.filter((c: any) => c.command === 'install_custom_edition').map((c: any) => c.args)).toEqual([
    { confirmed: true },
  ]);
});
test('offers browser extraction when the Windows tool is missing', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/customEdition.html?no-tar');
  await page.getByRole('button', { name: 'Install Custom Edition…', exact: true }).click();
  await expect(page.getByText(/Windows archive extraction is unavailable/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download & install Custom Edition' })).toHaveCount(0);
  await page.getByRole('link', { name: /Download source in your browser/ }).click();
  expect(await page.evaluate(() => (window as any).ceCalls.at(-1).command)).toBe('open_external_url');
});
test('cancel keeps the existing game and targets only this installation job', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/customEdition.html?found');
  await page.getByRole('button', { name: 'Install separate copy…' }).click();
  await page.getByRole('button', { name: 'Download & install Custom Edition' }).click();
  await page.getByRole('button', { name: 'Cancel installation' }).click();
  await expect(page.getByText(/Installation cancelled; existing installations/)).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).ceCalls.find((c: any) => c.command === 'cancel_custom_edition_setup').args,
    ),
  ).toEqual({ jobId: 'job-own' });
  await expect(page.getByText('C:/owned/Halo Custom Edition', { exact: true })).toBeVisible();
});
test('a failed archive remains a failure and can be retried explicitly', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/customEdition.html');
  await page.getByRole('button', { name: 'Install Custom Edition…', exact: true }).click();
  await page.getByRole('button', { name: 'Download & install Custom Edition' }).click();
  await page.evaluate(() => {
    const job = (window as any).ce.job;
    job.phase = 'failed';
    job.detail = 'Custom Edition download differs from the reviewed archive';
  });
  await expect(page.getByRole('alert')).toContainText('differs from the reviewed archive');
  await expect(page.getByText('Connections 0', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Install Custom Edition…', exact: true })).toBeEnabled();
});
