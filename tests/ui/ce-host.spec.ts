import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    w.isTauri = true;
    w.ceHostCalls = [];
    w.ceHostSession = null;
    w.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        w.ceHostCalls.push({ command, args });
        if (command === 'ce_host_catalog') {
          if (location.search.includes('missing'))
            throw Error('Register a separately installed runtime first');
          return {
            executableSha256: 'a'.repeat(64),
            maps: [
              { name: 'bloodgulch', sha256: 'b'.repeat(64) },
              { name: 'sidewinder', sha256: 'c'.repeat(64) },
            ],
          };
        }
        if (command === 'ce_host_status') return structuredClone(w.ceHostSession);
        if (command === 'ce_host_start') {
          if (location.search.includes('stale'))
            throw Error('The selected CE executable or map changed. Refresh before starting.');
          w.ceHostSession = {
            id: 'owned-host',
            phase: 'preparing',
            detail: 'Copying a private game…',
            ...args.request,
            requestedPort: args.request.port,
            port: 25000,
            processId: null,
            copiedBytes: 0,
            sessionDirectory: null,
            status: null,
            observations: 0,
            elapsedMs: 0,
            consoleTail: '',
          };
          return structuredClone(w.ceHostSession);
        }
        if (command === 'ce_host_stop') {
          w.ceHostSession.phase = 'stopped';
          w.ceHostSession.status = null;
          return;
        }
        throw Error('Unexpected command ' + command);
      },
    };
  });
});
test('compact selection carries exact file identities and stays private', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await page.getByLabel('Private CE map').selectOption('sidewinder');
  await page.getByLabel('Private CE game type').selectOption('ctf');
  await page.getByLabel('Private CE player limit').fill('4');
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Custom Edition private host' }).getByRole('status'),
  ).toHaveText('Preparing private copy');
  const request = await page.evaluate(
    () => (window as any).ceHostCalls.find((c: any) => c.command === 'ce_host_start').args.request,
  );
  expect(request).toEqual({
    map: 'sidewinder',
    mapSha256: 'c'.repeat(64),
    executableSha256: 'a'.repeat(64),
    gameType: 'ctf',
    maximumPlayers: 4,
    port: 0,
    name: 'Spark private',
  });
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeDisabled();
  await expect(page.getByText('On this computer', { exact: true })).toBeVisible();
  await expect(page.getByText('Session details & output')).toBeVisible();
  await expect(page.getByText('Dedicated executable', { exact: true })).not.toBeVisible();
});
test('switching workspaces recovers its native session and stops only its session ID', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await page.getByLabel('Private CE map').selectOption('sidewinder');
  await page.getByLabel('Private CE game type').selectOption('ctf');
  await page.getByLabel('Private CE player limit').fill('4');
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await expect(page.getByRole('button', { name: 'Stop private server', exact: true })).toBeVisible();
  await expect(page.getByLabel('Private CE map')).toHaveValue('sidewinder');
  await expect(page.getByLabel('Private CE game type')).toHaveValue('ctf');
  await expect(page.getByLabel('Private CE player limit')).toHaveValue('4');
  await page.getByRole('button', { name: 'Stop private server', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Custom Edition private host' }).getByRole('status'),
  ).toHaveText('Stopped');
  expect(
    await page.evaluate(
      () => (window as any).ceHostCalls.find((c: any) => c.command === 'ce_host_stop').args,
    ),
  ).toEqual({ sessionId: 'owned-host' });
});
test('stale identities stay a failed start and offer refresh', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?stale');
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByRole('button', { name: 'Stop private server' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh maps' })).toBeEnabled();
});
test('a missing installation gives a setup action without a false start button', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?missing');
  await page.getByRole('button', { name: 'Connect Custom Edition' }).click();
  await expect(page.getByText('Setup visits 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start private server' })).toHaveCount(0);
});
test('host controls fit a narrow workspace without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await expect(page.getByLabel('Private CE map')).toBeVisible();
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Custom Edition private host' });
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(panel.getByRole('button', { name: 'Stop private server', exact: true })).toBeInViewport();
});
