// Comparable native application profiling. Existing content/validation remains enabled.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile),
  expect = assertion.configure({ timeout: 120000 }),
  args = process.argv.slice(2);
if (args.length !== 5)
  throw Error('profile-native-workbench <Spark.exe> <fresh-root> <owned-map-A> <owned-map-B> <label>');
const [app, root, mapA, mapB] = args.slice(0, 4).map((p) => path.resolve(p));
const label = args[4];
await fs.mkdir(root, { recursive: false });
const data = path.join(root, 'library');
await fs.mkdir(data);
const hash = async (p) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(p))
    .digest('hex');
const report = {
  schemaVersion: 1,
  label,
  appSha256: await hash(app),
  complete: false,
  mockedIpc: false,
  conditions: {
    profile: 'fresh library and WebView profile; process-cold, not flushed OS disk cache',
    viewport: { width: 1440, height: 900 },
    focusEmulation: true,
    qualityUnchanged: true,
  },
  phases: [],
  errors: [],
};
let child, browser, page, call, cdp, processBegan, startupMeasurement, mapViewport;
const exe = path.join(root, 'GuiltySpark-profile.exe');
await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
const save = () => fs.writeFile(path.join(root, 'profile.json'), JSON.stringify(report, null, 2));
const proc = async () =>
  JSON.parse(
    (
      await exec(
        'pwsh.exe',
        [
          '-NoProfile',
          '-File',
          path.resolve('scripts/profile-process-tree.ps1'),
          '-RootProcessId',
          String(child.pid),
        ],
        { windowsHide: true, maxBuffer: 1024 * 1024 },
      )
    ).stdout,
  );
const frames = async (count = 8) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        let n = 0;
        const next = () => (++n >= count ? resolve(true) : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    count,
  );
const metrics = async () =>
  Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const entries = async () =>
  page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith('spark.'))
      .map((e) => ({ name: e.name, ms: e.duration, start: e.startTime })),
  );
async function phase(name, action) {
  await page.evaluate(() => performance.clearMeasures());
  const at = performance.now(),
    result = await action();
  const elapsedMs = performance.now() - at;
  const row = { name, elapsedMs, result, nativeAndDecode: await entries(), metrics: await metrics() };
  report.phases.push(row);
  await save();
  console.log(name, Math.round(elapsedMs));
  return row;
}
async function launch(warm) {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  const at = performance.now();
  processBegan = at;
  child = spawn(exe, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: data,
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await browser.contexts()[0].addInitScript(() => {
    globalThis.__GS_PROFILE__ = true;
  });
  await expect
    .poll(() =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (error) => report.errors.push(String(error)));
  cdp = await browser.contexts()[0].newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  try {
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch {
    report.conditions.focusEmulation = false;
  }
  await page.evaluate(() => {
    globalThis.__GS_PROFILE__ = true;
  });
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await expect(page.locator('.application')).toBeVisible();
  const inset = await page.locator('.application').evaluate((e) => {
    const box = e.getBoundingClientRect();
    return { width: innerWidth - box.width, height: innerHeight - box.height };
  });
  // Keep the rendered work area equal across the six-pixel-gutter removal.
  // This also holds the camera's aspect/frustum constant for geometry checks.
  mapViewport = { width: 1428 + Math.round(inset.width), height: 888 + Math.round(inset.height) };
  report.conditions.mapViewport = mapViewport;
  report.conditions.contentViewport = { width: 1428, height: 888 };
  const shellMs = performance.now() - at;
  const status = await call('startup_status');
  const polling = [];
  for (let n = 0; n < 10; n++) {
    const start = performance.now();
    await call('startup_status');
    polling.push(performance.now() - start);
  }
  if (!warm) {
    await call('save_settings', {
      settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false, preferredHalo: 'mccSteam' },
    });
    await page.reload();
  }
  startupMeasurement = { shellMs, status, pollingRoundTripMs: polling };
  report[warm ? 'warmStartup' : 'coldStartup'] = startupMeasurement;
  await save();
  return boot;
}
async function homeReady() {
  const preview = page.locator('.home-native-model .native-model-preview');
  await expect(preview).toHaveAttribute('data-model-ready', 'true');
  await expect(preview).toHaveAttribute('data-model-textures', /^[1-9]\d*$/);
  await expect(preview).toHaveAttribute('data-model-reflections', /^[1-9]\d*$/);
  await frames();
  startupMeasurement.processToShowcaseReadyMs ??= performance.now() - processBegan;
  return preview.evaluate((e) => ({
    model: { ...e.dataset },
    canvas: {
      width: e.querySelector('canvas').width,
      height: e.querySelector('canvas').height,
      environment: e.querySelector('canvas').dataset.gsEnvironment,
      effects: e.querySelector('canvas').dataset.gsRenderFeatures,
    },
    focused: document.hasFocus(),
    visibility: document.visibilityState,
  }));
}
async function nav(name) {
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await page.locator('.gs-navigation-drawer').getByRole('button', { name, exact: true }).click();
}
async function worldReady() {
  const world = page.locator('.world-layout');
  await expect(world).toBeVisible();
  // One transient idle render can precede a map's material effect. Require all
  // authored decals and a stable, fully settled resource signature as well.
  let signature = '',
    stableSince = 0;
  await expect
    .poll(
      async () => {
        const state = await world.evaluate((e) => {
          const decals = JSON.parse(e.querySelector('canvas')?.dataset.gsDecals ?? 'null');
          return { world: { ...e.dataset }, decals };
        });
        const ready =
          state.world.materialLoading === 'false' &&
          state.world.pendingMaterials === '0' &&
          Number(state.world.sourceShaders) > 0 &&
          state.decals &&
          state.decals.rendered + state.decals.omitted === state.decals.source;
        const next = JSON.stringify(state);
        if (!ready || next !== signature) {
          signature = next;
          stableSince = performance.now();
          return false;
        }
        return performance.now() - stableSince >= 750;
      },
      { intervals: [100, 100, 100, 100] },
    )
    .toBe(true);
  return world.evaluate((e) => ({
    world: { ...e.dataset },
    render: JSON.parse(e.querySelector('canvas').dataset.gsPerformance ?? 'null'),
    decals: JSON.parse(e.querySelector('canvas').dataset.gsDecals ?? 'null'),
    canvas: {
      width: e.querySelector('canvas').width,
      height: e.querySelector('canvas').height,
      environment: e.querySelector('canvas').dataset.gsEnvironment,
      effects: e.querySelector('canvas').dataset.gsRenderFeatures,
    },
    focused: document.hasFocus(),
    visibility: document.visibilityState,
  }));
}
async function idle(name) {
  const before = await proc();
  const start = performance.now();
  await frames(120);
  const after = await proc();
  const seconds = (after.timestamp - before.timestamp) / 1000;
  report.phases.push({
    name,
    elapsedMs: performance.now() - start,
    before,
    after,
    cpuOneCorePercent: (100 * (after.cpuSeconds - before.cpuSeconds)) / seconds,
    cpuMachinePercent: (100 * (after.cpuSeconds - before.cpuSeconds)) / seconds / after.logicalProcessors,
    metrics: await metrics(),
  });
  await save();
}
try {
  await launch(false);
  const showcase = await phase('showcase-first-initialization', homeReady);
  report.showcase = showcase.result;
  await idle('showcase-process-cpu-gpu-memory');
  const opens = [];
  for (const [index, file] of [mapA, mapB].entries()) {
    const row = await phase(`native-import-${index + 1}`, async () => {
      const open = (await call('import_paths', { paths: [file] }))[0];
      open.project.title = `Profile map ${index + 1}`;
      await call('save_project', { project: open.project });
      opens.push(open);
      return {
        id: open.project.id,
        sha256: open.inspection.sha256,
        version: open.inspection.header.version,
        tags: open.inspection.tags.length,
        objects: open.inspection.objects.length,
        renderTriangles: open.inspection.renderMesh?.indices.length / 3,
        modelTypes: Object.keys(open.inspection.modelMeshes).length,
        decals: open.inspection.decals.length,
      };
    });
    expect(row.result.sha256).toBe(await hash(file));
  }
  await page.reload();
  await homeReady();
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    ...mapViewport,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await frames(2);
  for (let index = 0; index < opens.length; index++) {
    if (index) await nav('Map library');
    await phase(`first-textured-map-${index + 1}`, async () => {
      await page
        .locator('.map-card')
        .filter({ has: page.getByRole('heading', { name: `Profile map ${index + 1}`, exact: true }) })
        .click();
      return worldReady();
    });
    await idle(`map-${index + 1}-process-cpu-gpu-memory`);
  }
  for (let turn = 0; turn < 4; turn++) {
    const index = turn % 2;
    await phase(`map-switch-${turn + 1}-to-${index + 1}`, async () => {
      await page.getByRole('tab', { name: `Profile map ${index + 1}`, exact: true }).click();
      return worldReady();
    });
  }
  await idle('repeat-switch-memory');
  const native = [];
  for (let n = 0; n < 4; n++) {
    const at = performance.now();
    const opened = await call('open_project', { id: opens[0].project.id });
    native.push({
      elapsedMs: performance.now() - at,
      tags: opened.inspection.tags.length,
      sha256: opened.inspection.sha256,
    });
  }
  report.openProjectRoundTrips = native;
  await phase('large-asset-catalog', async () => {
    await page.getByRole('button', { name: 'Toggle Asset library', exact: true }).click();
    const browse = page.locator('.viewport-asset-library .asset-source-browser');
    await browse.locator('summary').click();
    await expect(browse.getByLabel('Discovered asset source')).toContainText('c40.map');
    const options = await browse
      .getByLabel('Discovered asset source')
      .locator('option')
      .evaluateAll((list) => list.map((e) => ({ value: e.value, text: e.textContent })));
    const selected = options.find((o) => o.text.includes('c40.map') && o.text.includes('MCC'));
    expect(selected).toBeTruthy();
    await browse.getByLabel('Discovered asset source').selectOption(selected.value);
    await browse.getByRole('button', { name: 'Load assets', exact: true }).click();
    await expect(browse.getByRole('button', { name: 'Load assets', exact: true })).toBeEnabled();
    await expect.poll(() => page.locator('.viewport-asset-list article').count()).toBeGreaterThan(0);
    await page.getByLabel('Search loaded assets').fill('monitor');
    await expect.poll(() => page.locator('.viewport-asset-list article img').count()).toBeGreaterThan(0);
    await frames();
    const nativePreviewCount = await page.locator('.viewport-asset-list article img').count();
    await page.getByLabel('Search loaded assets').fill('');
    await frames();
    return {
      nativePreviewCount,
      visibleCards: await page.locator('.viewport-asset-list article').count(),
      text: await page.locator('.viewport-asset-library').innerText(),
    };
  });
  await page.screenshot({ path: path.join(root, 'catalog.png') });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await frames(2);
  await nav('Map library');
  await phase('showcase-warm-return', homeReady);
  await idle('after-maps-home-memory');
  await browser.close();
  child.kill();
  await new Promise((r) => child.once('exit', r));
  browser = null;
  await launch(true);
  await phase('showcase-warm-process', homeReady);
  await idle('warm-process-memory');
  for (const [index, file] of [mapA, mapB].entries())
    expect(await hash(file)).toBe(
      report.phases.find((p) => p.name === `native-import-${index + 1}`).result.sha256,
    );
  expect(report.errors).toEqual([]);
  report.complete = true;
} catch (error) {
  report.error = String(error);
  if (page) await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await save();
  if (browser) await browser.close();
  if (child?.exitCode === null) child.kill();
}
