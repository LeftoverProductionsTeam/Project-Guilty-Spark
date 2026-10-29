// Opt-in native SDK QA in an isolated qa_runtime_library replica.
// Rebuilds copied BSP tags, opens the new cache and checks the native window controls.
import { chromium, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const expect = baseExpect.configure({ timeout: 60000 });
const options = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  const key = process.argv[n];
  if (
    !['--app', '--data', '--output', '--kit', '--invader', '--compile'].includes(key) ||
    !process.argv[n + 1] ||
    options.has(key)
  )
    throw Error('Use unique named arguments');
  options.set(key, process.argv[n + 1]);
}
if (options.size !== 6 || options.get('--compile') !== 'true')
  throw Error(
    'Required: --app built.exe --data fresh-qa-library --output fresh-dir --kit HCEEK --invader Invader --compile true',
  );
const data = path.resolve(options.get('--data')),
  output = path.resolve(options.get('--output'));
const normalize = (value) => path.toNamespacedPath(path.resolve(value));
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
const seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
if (
  !fixture.nativeFixture ||
  fixture.schemaVersion !== 1 ||
  fixture.projectId !== seed.projectId ||
  normalize(seed.library) !== normalize(data) ||
  normalize(seed.sourceJob) === normalize(data)
)
  throw Error('Only the explicit replica fixture is accepted');
await fs.mkdir(output);
const executable = path.join(output, 'GuiltySpark-bsp-audio-qa.exe');
await fs.copyFile(path.resolve(options.get('--app')), executable, fs.constants.COPYFILE_EXCL);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const appSha256 = hash(await fs.readFile(executable));
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const child = spawn(executable, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: data,
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
await fs.writeFile(
  path.join(output, 'owned-process.json'),
  JSON.stringify({ pid: child.pid, port }, null, 2),
);
let browser, page, call;
const errors = [];
try {
  await expect
    .poll(
      () =>
        fetch(`http://127.0.0.1:${port}/json/version`).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 45000 },
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .some((p) => p.url().includes('tauri.localhost')),
      { timeout: 20000 },
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(String(error)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const windowArgs = await page.evaluate(() => ({
    label: window.__TAURI_INTERNALS__.metadata.currentWindow.label,
  }));
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: path.resolve(options.get('--kit')),
      hekFlavor: 'h1aEk',
      invaderDirectory: path.resolve(options.get('--invader')),
    },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  const original = (await call('open_project', { id: fixture.projectId })).project;
  const parent = original.builds.find((build) => build.id === fixture.workingBuildId);
  expect(parent.status).toBe('validated');
  const parentHash = hash(await fs.readFile(parent.output));
  const report = await call('runtime_workbench_report', {
    runtimeId: 'mccSteam',
    projectId: fixture.projectId,
  });
  expect(report.sourceIssue).toBeNull();
  expect(report.toolsIssue).toBeNull();
  expect(report.workingSource.buildId).toBe(parent.id);
  const workspace = await call('inspect_bsp_audio_workspace', { projectId: fixture.projectId });
  console.log(
    'Native BSP audio inspection:',
    workspace.inspection.bsps.length,
    'BSPs;',
    workspace.backgrounds.length,
    'loops;',
    workspace.environments.length,
    'environments.',
  );
  const bsp = workspace.inspection.bsps[0];
  expect(bsp.clusters.length).toBe(11);
  expect(bsp.portalCount).toBe(10);
  const existing = bsp.environmentPalette[bsp.clusters[0].environment]?.tagPath
    ?.replaceAll('\\', '/')
    .toLowerCase();
  const environment = workspace.environments.find(
    (d) => d.path.toLowerCase().includes('stone_room') && !d.path.toLowerCase().startsWith(existing + '.'),
  );
  if (!environment) throw Error('The accepted challenge must have a different owned stone_room preset');
  const bspFile =
    path.join(report.workingSource.tagsDirectory, ...bsp.tagPath.replaceAll('\\', '/').split('/')) +
    '.scenario_structure_bsp';
  const bspHash = hash(await fs.readFile(bspFile));
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await page.locator('.bsp-audio-editor > summary').click();
  await page.getByRole('button', { name: 'Inspect BSP audio', exact: true }).click();
  await expect(page.getByLabel('BSP audio cluster', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByLabel('BSP audio cluster', { exact: true }).selectOption('0');
  await page.getByLabel('BSP sound environment', { exact: true }).selectOption(environment.path);
  await page.getByRole('button', { name: 'Stage cluster binding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove cluster 0 binding', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'native-staged-bsp-audio.png') });
  await page.getByRole('button', { name: 'Close runtime details', exact: true }).click();
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await page.locator('.bsp-audio-editor > summary').click();
  await expect(page.getByRole('button', { name: 'Remove cluster 0 binding', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect BSP audio', exact: true }).click();
  const buildStarted = performance.now();
  await page.getByRole('button', { name: 'Build BSP audio revision', exact: true }).click();
  console.log('BSP audio draft retained and submitted through the native desktop.');
  let record;
  await expect
    .poll(
      async () => {
        const project = (await call('open_project', { id: fixture.projectId })).project;
        record = project.builds.find((build) => build.id !== parent.id && build.timestamp > parent.timestamp);
        if (record?.status === 'failed') throw Error(record.message);
        return record?.status;
      },
      { timeout: 600000, intervals: [2000, 5000] },
    )
    .toBe('validated');
  const buildElapsedMs = performance.now() - buildStarted;
  const proof = JSON.parse(
    await fs.readFile(path.join(data, 'jobs', record.id, 'bsp-audio-verification.json'), 'utf8'),
  );
  expect(proof.collisionUnchanged).toBe(true);
  expect(proof.output.bsps[0].pvsSha256).toBe(bsp.pvsSha256);
  expect(proof.output.bsps[0].pasSha256).toBe(bsp.pasSha256);
  const compiled = proof.output.bsps[0];
  expect(
    compiled.environmentPalette[compiled.clusters[0].environment].tagPath
      .replaceAll('\\', '/')
      .toLowerCase() + '.sound_environment',
  ).toBe(environment.path.toLowerCase());
  console.log('Native BSP audio revision validated', record.id, buildElapsedMs);
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await page.getByRole('button', { name: 'Open working-tags build', exact: true }).click();
  let opened;
  await expect
    .poll(
      async () => {
        const entry = (await call('bootstrap')).entries.find((e) => e.sha256 === record.sha256);
        if (!entry) return false;
        opened = await call('open_project', { id: entry.id });
        return !!opened.inspection;
      },
      { timeout: 45000, intervals: [1000] },
    )
    .toBe(true);
  await expect(page.getByRole('tab')).toHaveCount(2);
  const after = (await call('open_project', { id: fixture.projectId })).project;
  for (const key of ['source', 'scene', 'tagEdits', 'quickForge']) expect(after[key]).toEqual(original[key]);
  expect(hash(await fs.readFile(parent.output))).toBe(parentHash);
  expect(hash(await fs.readFile(bspFile))).toBe(bspHash);
  // Exercise actual window state, with a fresh native build and no mock IPC.
  if (await call('plugin:window|is_fullscreen', windowArgs))
    await call('plugin:window|set_fullscreen', { ...windowArgs, value: false });
  if (await call('plugin:window|is_maximized', windowArgs))
    await call('plugin:window|unmaximize', windowArgs);
  await expect(page.getByRole('button', { name: 'Maximize window', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Maximize window', exact: true }).click();
  await expect.poll(() => call('plugin:window|is_maximized', windowArgs)).toBe(true);
  await page.getByRole('button', { name: 'Fullscreen editing', exact: true }).click();
  await expect.poll(() => call('plugin:window|is_fullscreen', windowArgs)).toBe(true);
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toBeInViewport();
  const fullscreenMetrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    screenWidth: screen.width,
    screenHeight: screen.height,
    toolbar: document.querySelector('.gs-workspace-tools').getBoundingClientRect().toJSON(),
  }));
  expect(fullscreenMetrics.toolbar.y).toBeGreaterThanOrEqual(0);
  for (const theme of ['dark-glow', 'covenant']) {
    await page.evaluate((theme) => (document.documentElement.dataset.gsTheme = theme), theme);
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
    await expect(page.locator('#gs-workspace-navigation')).toBeVisible();
    await expect(page.locator('.gs-navigation-backdrop,.gs-header-backdrop')).toHaveCount(0);
    await page.screenshot({ path: path.join(output, `native-fullscreen-${theme}-drawer.png`) });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Toggle window and project header', exact: true }).click();
    await expect(page.locator('#gs-window-header')).toBeVisible();
    expect(await page.locator('#gs-window-header').evaluate((e) => getComputedStyle(e).position)).toBe(
      'fixed',
    );
    await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(1);
    expect(
      await page.getByRole('button', { name: 'Close window', exact: true }).evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.gs-window-close') === e
        );
      }),
    ).toBe(true);
    await page.getByRole('button', { name: 'Hide window and project header', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => call('plugin:window|is_fullscreen', windowArgs)).toBe(false);
  await expect.poll(() => call('plugin:window|is_maximized', windowArgs)).toBe(true);
  await page.keyboard.press('F11');
  await expect.poll(() => call('plugin:window|is_fullscreen', windowArgs)).toBe(true);
  const receipt = {
    schemaVersion: 1,
    nativeDesktop: true,
    appSha256,
    clusters: bsp.clusters.length,
    portals: bsp.portalCount,
    ownedBackgrounds: workspace.backgrounds.length,
    ownedEnvironments: workspace.environments.length,
    buildElapsedMs,
    inputSha256: parentHash,
    compiledSha256: record.sha256,
    cacheVersion: opened.inspection.header.version,
    tags: opened.inspection.tags.length,
    cluster: 0,
    environment: environment.path,
    collisionUnchanged: true,
    pvsUnchanged: true,
    pasUnchanged: true,
    inputBspUnchanged: true,
    parentCacheUnchanged: true,
    separateMapTab: true,
    documentUnchanged: true,
    draftSurvivesDetails: true,
    window: {
      nativeMaximizedToFullscreen: true,
      restoresMaximized: true,
      controlsVisible: true,
      closeButtons: 1,
      themes: ['dark-glow', 'covenant'],
      drawersWithoutBackdrop: true,
      fullscreenMetrics,
    },
    gameLaunched: false,
    gameMemoryTouched: false,
    gameplayAccepted: false,
    errors,
  };
  await fs.writeFile(
    path.join(output, 'native-bsp-audio-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  if (errors.length) throw Error(errors.join('; '));
  // The single visible close button must still exit the real app in fullscreen.
  await page.getByRole('button', { name: 'Close window', exact: true }).click();
  await expect.poll(() => child.exitCode, { timeout: 15000 }).not.toBeNull();
  receipt.window.closeInFullscreen = true;
  await fs.writeFile(
    path.join(output, 'native-bsp-audio-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
} finally {
  if (call && !page?.isClosed()) await call('close_application').catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null) child.kill();
  }
}
