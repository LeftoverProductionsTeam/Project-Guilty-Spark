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
          const catalog = {
            executableSha256: 'a'.repeat(64),
            projectId: args?.projectId ?? null,
            projectIssue:
              w.projectBuildMissing || location.search.includes('needs-build')
                ? 'No validated build of the current saved project is available'
                : null,
            maps: [
              { name: 'bloodgulch', sha256: 'b'.repeat(64) },
              { name: 'sidewinder', sha256: 'c'.repeat(64) },
            ],
          } as any;
          if (args?.projectId && !catalog.projectIssue)
            catalog.maps.unshift({
              name: 'bloodgulch',
              sha256: 'd'.repeat(64),
              sourceBuild: {
                projectId: args.projectId,
                buildId:
                  w.newProjectBuildId ??
                  (args.projectId === '33333333-3333-4333-8333-333333333333'
                    ? '44444444-4444-4444-8444-444444444444'
                    : '22222222-2222-4222-8222-222222222222'),
                projectTitle: 'My Workshop',
                projectFingerprint: 'e'.repeat(64),
              },
            });
          if (
            location.search.includes('delayed') &&
            args?.projectId === '11111111-1111-4111-8111-111111111111'
          )
            return new Promise((resolve) => {
              w.releaseOldCatalog = () => resolve(catalog);
            });
          return catalog;
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
        if (command === 'ce_host_client_action') {
          if (location.search.includes('bad-client'))
            throw Error('Private input failed integrity: haloce.exe');
          const phase =
            args.action === 'prepare'
              ? 'ready'
              : ['launch', 'setup'].includes(args.action)
                ? 'open'
                : 'stopped';
          w.ceHostSession.client = {
            phase,
            detail:
              phase === 'open'
                ? 'CE playtest opened. Connection and gameplay unverified.'
                : 'Matching files checked.',
            processId: phase === 'open' ? 123 : null,
            gameDirectory: 'owned/game',
            profileDirectory: 'owned/client-profile',
            verifiedFiles: 67,
            verifiedBytes: 1000000,
            verificationMs: 120,
            executableSha256: 'f'.repeat(64),
            launchCount: phase === 'open' ? 1 : 0,
            exitCode: null,
            connectionVerified: false,
            mode: args.action === 'setup' ? 'setup' : 'playtest',
            elapsedMs: 0,
          };
          if (args.action === 'prepare' && location.search.includes('slow-client')) {
            const prepared = structuredClone(w.ceHostSession.client);
            w.ceHostSession.client.phase = 'checking';
            return new Promise((resolve) => {
              w.releaseClient = () => {
                w.ceHostSession.client = prepared;
                resolve(structuredClone(w.ceHostSession));
              };
            });
          }
          return structuredClone(w.ceHostSession);
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
test('managed builds with stock filenames remain distinct and send only native lookup IDs', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project');
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  const request = await page.evaluate(
    () => (window as any).ceHostCalls.find((c: any) => c.command === 'ce_host_start').args.request,
  );
  expect(request.mapSha256).toBe('d'.repeat(64));
  expect(request.sourceBuild).toEqual({
    projectId: '11111111-1111-4111-8111-111111111111',
    buildId: '22222222-2222-4222-8222-222222222222',
  });
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:22222222-2222-4222-8222-222222222222');
});
test('unsaved changes block the project snapshot and keep installed-map hosting available', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project');
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:22222222-2222-4222-8222-222222222222');
  await page.getByRole('button', { name: 'Toggle unsaved changes' }).click();
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Build this map', exact: true }).click();
  await expect(page.getByText('Build visits 1')).toBeVisible();
  await page.getByLabel('Private CE map').selectOption('bloodgulch');
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeEnabled();
});
test('missing current builds guide the user back to their map build workspace', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project&needs-build');
  await page.getByRole('button', { name: 'Build this map', exact: true }).click();
  await expect(page.getByText('Build visits 1')).toBeVisible();
  await expect(page.getByRole('option', { name: /saved CE build/ })).toHaveCount(0);
});
test('a late catalog cannot replace the newly selected project build', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project&delayed');
  await expect.poll(() => page.evaluate(() => !!(window as any).releaseOldCatalog)).toBe(true);
  await page.getByRole('button', { name: 'Switch project', exact: true }).click();
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:44444444-4444-4444-8444-444444444444');
  await page.evaluate(() => (window as any).releaseOldCatalog());
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).ceHostCalls.find((c: any) => c.command === 'ce_host_start').args.request.sourceBuild
          .projectId,
    ),
  ).toBe('33333333-3333-4333-8333-333333333333');
});
test('losing a project build keeps it unavailable instead of choosing its stock namesake', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project');
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:22222222-2222-4222-8222-222222222222');
  await page.evaluate(() => {
    (window as any).projectBuildMissing = true;
  });
  await page.getByRole('button', { name: 'Refresh maps', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Build this map', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:22222222-2222-4222-8222-222222222222');
  await page.evaluate(() => {
    (window as any).projectBuildMissing = false;
    (window as any).newProjectBuildId = '55555555-5555-4555-8555-555555555555';
  });
  await page.getByRole('button', { name: 'Refresh maps', exact: true }).click();
  await expect(page.getByLabel('Private CE map')).toHaveValue('build:55555555-5555-4555-8555-555555555555');
  await expect(page.getByRole('button', { name: 'Start private server', exact: true })).toBeEnabled();
});

async function loadedServer(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Start private server', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare matching client' })).toBeDisabled();
  await page.evaluate(() => {
    const session = (window as any).ceHostSession;
    session.phase = 'running';
    session.status = { players: 0, maximumPlayers: 2 };
  });
  await expect(page.getByRole('button', { name: 'Prepare matching client' })).toBeEnabled();
}
test('matching-client actions stay scoped, retain workspace state and do not claim a joined player', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await loadedServer(page);
  await page.getByRole('button', { name: 'Prepare matching client' }).click();
  await expect(page.getByRole('button', { name: 'Launch CE playtest' })).toBeEnabled();
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Switch workspace' }).click();
  await page.getByRole('button', { name: 'Launch CE playtest' }).click();
  await expect(page.getByText('CE playtest opened. Connection and gameplay unverified.')).toBeVisible();
  await expect(page.getByText('0 / 2 players', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop playtest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop private server', exact: true })).toBeEnabled();
  const calls = await page.evaluate(() =>
    (window as any).ceHostCalls
      .filter((c: any) => c.command === 'ce_host_client_action')
      .map((c: any) => c.args),
  );
  expect(calls).toEqual(['prepare', 'launch', 'stop'].map((action) => ({ sessionId: 'owned-host', action })));
});
test('client integrity failure stays visible without changing the running server', async ({ page }) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?bad-client');
  await loadedServer(page);
  await page.getByRole('button', { name: 'Prepare matching client' }).click();
  await expect(page.getByRole('alert')).toContainText('integrity');
  await expect(page.getByRole('button', { name: 'Launch CE playtest' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop private server', exact: true })).toBeEnabled();
});
test('client controls fit a narrow panel with the full status available', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await loadedServer(page);
  await page.getByRole('button', { name: 'Prepare matching client' }).click();
  const region = page.getByRole('region', { name: 'Matching CE playtest' });
  expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(region.getByRole('button', { name: 'Launch CE playtest' })).toBeInViewport();
});
test('switching project during preparation does not leave client controls permanently busy', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html?project&slow-client');
  await loadedServer(page);
  await page.getByRole('button', { name: 'Prepare matching client' }).click();
  await expect.poll(() => page.evaluate(() => !!(window as any).releaseClient)).toBe(true);
  await page.getByRole('button', { name: 'Switch project', exact: true }).click();
  await page.evaluate(() => (window as any).releaseClient());
  await expect(page.getByRole('button', { name: 'Launch CE playtest' })).toBeEnabled();
});
test('first-run help opens only the owned setup mode and keeps installation guidance reachable', async ({
  page,
}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await loadedServer(page);
  await page.getByText('First-run help', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open CE setup', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Prepare matching client', exact: true }).click();
  await page.getByRole('button', { name: 'Open CE setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop playtest', exact: true })).toBeVisible();
  const action = await page.evaluate(
    () =>
      (window as any).ceHostCalls.find(
        (c: any) => c.command === 'ce_host_client_action' && c.args.action === 'setup',
      ).args,
  );
  expect(action).toEqual({ sessionId: 'owned-host', action: 'setup' });
  await page.getByRole('button', { name: 'Check CE installation', exact: true }).click();
  await expect(page.getByText('Setup visits 1')).toBeVisible();
});
test('a running client without a visible window warns in setup and keeps stop and checks available', async ({page}) => {
  await page.goto('/tests/ui/fixtures/ceHost.html');
  await loadedServer(page);
  await page.getByRole('button', {name:'Prepare matching client',exact:true}).click();
  await page.getByRole('button', {name:'Launch CE playtest',exact:true}).click();
  await page.evaluate(()=>{const c=(window as any).ceHostSession.client;c.visibleWindow=false;c.elapsedMs=18000;c.mode='setup';c.detail='Process running; no visible window detected.';});
  const warning=page.getByRole('alert').filter({hasText:'Halo has no visible game window'});
  await expect(warning).toBeVisible();
  await expect(page.getByRole('button',{name:'Stop playtest',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Stop private server',exact:true})).toBeEnabled();
  await warning.getByRole('button',{name:'Open CE checks',exact:true}).click();
  await expect(page.getByText('Setup visits 1')).toBeVisible();
  await page.evaluate(()=>{(window as any).ceHostSession.client.visibleWindow=true;});
  await expect(warning).toHaveCount(0);
});
