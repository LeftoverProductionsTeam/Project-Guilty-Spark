// Native C35 desktop verification. Owned QA library only; no game attach or memory writes.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { probeEditorCapture } from './native-editor-capture-probe.mjs';
const args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  if (
    !['--app', '--data', '--output'].includes(process.argv[at]) ||
    !process.argv[at + 1] ||
    args.has(process.argv[at])
  )
    throw Error('Provide unique --app, --data and --output paths');
  args.set(process.argv[at], process.argv[at + 1]);
}
if (args.size !== 3)
  throw Error(
    'Usage: node scripts/test-living-workbench-native.mjs --app built.exe --data C35-fixture --output fresh-directory',
  );
const data = path.resolve(args.get('--data')),
  output = path.resolve(args.get('--output'));
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-c35-fixture.json'), 'utf8'));
if (fixture.nativeFixture !== true || fixture.schemaVersion !== 1)
  throw Error('Only an explicit C35 QA library is accepted');
await fs.mkdir(output);
const executable = path.join(output, 'GuiltySpark-C35-native-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), executable, fs.constants.COPYFILE_EXCL);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const appSha256 = sha(await fs.readFile(executable));
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
let browser, call, director;
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
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(String(error)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, preferredHalo: 'mccSteam' },
  });
  const before = await call('open_project', { id: fixture.projectId });
  const original = await call('open_project', { id: fixture.matchingProjectId });
  const originalMapHash = sha(await fs.readFile(original.project.source.originalPath));
  const resourcePath = path.join(original.project.source.resourceDirectory, 'bitmaps.map');
  const resourceHash = sha(await fs.readFile(resourcePath));
  const candidates = await call('bitmap_resource_candidates', { projectId: fixture.projectId });
  expect(candidates.some((candidate) => candidate.reason.includes('identical preserved map'))).toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your worlds, reimagined.', exact: true })).toBeVisible();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator('.world-layout').getAttribute('data-source-shaders')), {
      timeout: 150000,
      intervals: [2000],
    })
    .toBeGreaterThan(10);
  await expect
    .poll(async () => await page.locator('.world-layout').getAttribute('data-material-loading'), {
      timeout: 150000,
      intervals: [2000],
    })
    .toBe('false');
  const recovered = await call('open_project', { id: fixture.projectId });
  expect(recovered.project.source.resourceSha256['bitmaps.map']).toBe(resourceHash);
  const materialCounts = await page.locator('.world-layout').evaluate((e) => ({ ...e.dataset }));
  await page.getByRole('button', { name: 'Frame scene (F)', exact: true }).click();
  const editorFocusTime = Date.now();
  await call('plugin:window|set_focus', { label: 'main' });
  await expect
    .poll(
      async () =>
        JSON.parse((await page.locator('canvas').getAttribute('data-gs-performance')) ?? 'null')?.sampledAt ??
        0,
      { timeout: 10000 },
    )
    .toBeGreaterThan(editorFocusTime + 600);
  const editorPerformance = JSON.parse(await page.locator('canvas').getAttribute('data-gs-performance'));
  console.log('Native Demo textures recovered:', JSON.stringify(materialCounts));
  await page.screenshot({ path: path.join(output, 'native-zombie-textures.png') });
  await expect(page.locator('#gs-window-header')).toBeHidden();
  const headerClosed = await page.getByTestId('viewport').boundingBox();
  await page.getByRole('button', { name: 'Toggle window and project header', exact: true }).click();
  await expect(page.locator('#gs-window-header')).toBeVisible();
  const headerOpened = await page.getByTestId('viewport').boundingBox();
  expect(headerOpened.height).toBeCloseTo(headerClosed.height, 0);
  await page.screenshot({ path: path.join(output, 'native-header-drawer.png') });
  await page.keyboard.press('Escape');
  const box = async () => page.getByTestId('viewport').boundingBox();
  const sizes = [];
  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await call('plugin:window|set_size', { label: 'main', value: { Logical: { width, height } } });
    await expect.poll(() => page.evaluate(() => innerWidth), { timeout: 10000 }).toBe(width);
    await expect(page.locator('.gs-navigation-drawer')).toBeHidden();
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
    const expanded = await box();
    await page.keyboard.press('Escape');
    await expect(page.locator('.gs-navigation-drawer')).toBeHidden();
    const closed = await box();
    expect(expanded.width).toBeCloseTo(closed.width, 0);
    await page.screenshot({ path: path.join(output, `native-${width}x${height}.png`) });
    sizes.push({
      requestedLogical: { width, height },
      actual: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpi: devicePixelRatio })),
      viewport: closed,
    });
  }
  await call('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1280, height: 720 } } });
  await page.getByRole('button', { name: 'Toggle Inspector', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inspector panel', exact: true })).toBeVisible();
  await page.getByLabel('Inspector position').selectOption('float');
  await page.getByLabel('Inspector size').fill('430');
  const normal = await box();
  await page.keyboard.press('F11');
  await expect.poll(() => call('plugin:window|is_fullscreen', { label: 'main' })).toBe(true);
  const full = await box(),
    client = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(full.width).toBeGreaterThan(client.width - 6);
  expect(full.height).toBeGreaterThan(client.height - 20);
  await page.screenshot({ path: path.join(output, 'native-immersive-fullscreen.png') });
  await page.mouse.move(100, 2);
  await page.getByRole('button', { name: 'Toggle Inspector', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inspector panel', exact: true })).toBeVisible();
  expect(await call('plugin:window|is_fullscreen', { label: 'main' })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Inspector panel', exact: true })).toBeHidden();
  expect(await call('plugin:window|is_fullscreen', { label: 'main' })).toBe(true);
  await page.keyboard.press('Control+Backslash');
  await expect(page.locator('.gs-navigation-drawer')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await call('plugin:window|is_fullscreen', { label: 'main' })).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => call('plugin:window|is_fullscreen', { label: 'main' })).toBe(false);
  await expect(page.getByRole('region', { name: 'Inspector panel', exact: true })).toBeVisible();
  await expect(page.getByLabel('Inspector position')).toHaveValue('float');
  await page.getByRole('button', { name: 'Close Inspector', exact: true }).click();
  const prepared = JSON.parse(await page.locator('canvas').getAttribute('data-gs-camera'));
  await page.getByRole('button', { name: 'Recording Director ↗', exact: true }).click();
  await expect
    .poll(async () => !!(await call('director_session', { projectId: fixture.projectId })).window, {
      timeout: 30000,
    })
    .toBe(true);
  const session = await call('director_session', { projectId: fixture.projectId });
  for (let axis = 0; axis < 3; axis++)
    expect(session.composition.pose.position[axis]).toBeCloseTo(prepared.position[axis], 3);
  const composition = { ...session.composition, pose: { ...session.composition.pose, fov: 65 } };
  const edited = await call('director_update', {
    projectId: fixture.projectId,
    revision: session.revision,
    composition,
    save: true,
  });
  const detached = await call('director_popout', { projectId: fixture.projectId });
  expect(detached.id).toBe(session.id);
  await expect
    .poll(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .some((p) => p.url().includes('?director=')),
      { timeout: 30000 },
    )
    .toBe(true);
  director = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('?director='));
  director.on('pageerror', (error) => errors.push(String(error)));
  await expect(director.getByRole('button', { name: 'Record video…', exact: true })).toBeVisible();
  await expect(director.locator('canvas')).toBeVisible();
  const authoritative = (await call('open_project', { id: fixture.projectId })).project;
  await call('save_project', {
    project: { ...authoritative, title: authoritative.title + ' · saved-change probe' },
  });
  await expect(director.locator('header strong')).toContainText('saved-change probe');
  await call('save_project', { project: authoritative });
  await expect(director.locator('header strong')).toHaveText(`Recording Director · ${authoritative.title}`);
  await expect
    .poll(async () => Number(await director.locator('.world-layout').getAttribute('data-source-shaders')), {
      timeout: 120000,
      intervals: [1000],
    })
    .toBeGreaterThan(10);
  await expect
    .poll(() => director.locator('.world-layout').getAttribute('data-material-loading'), {
      timeout: 120000,
      intervals: [1000],
    })
    .toBe('false');
  const request = (command, args = {}) =>
    director.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
      command,
      args,
    });
  let wrongOwner = false;
  try {
    await request('director_update', {
      projectId: fixture.matchingProjectId,
      revision: 0,
      composition,
      save: true,
    });
  } catch (error) {
    wrongOwner = /different Director/.test(String(error));
  }
  expect(wrongOwner).toBe(true);
  let stale = false;
  try {
    await request('director_update', {
      projectId: fixture.projectId,
      revision: edited.revision - 1,
      composition,
      save: true,
    });
  } catch (error) {
    stale = /another window/.test(String(error));
  }
  expect(stale).toBe(true);
  const displays = await request('director_displays');
  expect(displays.length).toBeGreaterThan(0);
  const movedDisplays = [];
  for (const display of displays.slice(1)) {
    await request('director_window', {
      projectId: fixture.projectId,
      action: 'monitor',
      monitor: display.index,
    });
    await expect
      .poll(() => director.evaluate(() => innerWidth), { timeout: 10000 })
      .toBe(Math.round(display.width / display.scale));
    movedDisplays.push({
      index: display.index,
      width: display.width,
      height: display.height,
      scale: display.scale,
      actual: await director.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpi: devicePixelRatio,
      })),
    });
  }
  await director.getByRole('button', { name: 'Borderless fullscreen · F11', exact: true }).click();
  await expect.poll(() => request('plugin:window|is_fullscreen', { label: detached.window })).toBe(true);
  await director.getByRole('button', { name: 'Hide interface', exact: true }).click();
  await expect(director.locator('.gs-director-window')).toHaveClass(/gs-director-clean/);
  await expect(director.getByRole('button')).toHaveCount(0);
  await director.screenshot({ path: path.join(output, 'native-director-clean-fullscreen.png') });
  const directorPerformance = JSON.parse(
    (await director.locator('canvas').getAttribute('data-gs-performance')) ?? 'null',
  );
  // Verify the real render continues while another Spark view owns focus. This is not Halo actor acceptance.
  const stamp = JSON.parse(await director.locator('canvas').getAttribute('data-gs-performance')).sampledAt;
  const capture = probeEditorCapture(director);
  await expect.poll(() => director.evaluate(() => window.__sparkQARecording === true)).toBe(true);
  await call('plugin:window|set_focus', { label: 'main' });
  await expect.poll(() => call('plugin:window|is_focused', { label: 'main' })).toBe(true);
  await expect.poll(() => request('plugin:window|is_focused', { label: detached.window })).toBe(false);
  await expect
    .poll(
      async () => JSON.parse(await director.locator('canvas').getAttribute('data-gs-performance')).sampledAt,
      { timeout: 15000, intervals: [500] },
    )
    .toBeGreaterThan(stamp + 500);
  const directorStillRendering = await director.locator('canvas').getAttribute('data-gs-director');
  const recorded = await capture,
    videoBytes = Buffer.from(recorded.encoded.slice(recorded.encoded.indexOf(',') + 1), 'base64');
  await fs.writeFile(path.join(output, 'editor-capture-probe.webm'), videoBytes, { flag: 'wx' });
  await fs.writeFile(
    path.join(output, 'editor-capture-decoded.png'),
    Buffer.from(recorded.frameImage.split(',')[1], 'base64'),
    { flag: 'wx' },
  );
  const editorCapture = {
    ...recorded.metadata,
    sha256: sha(videoBytes),
    savedByQaHarness: true,
    applicationSavePickerTested: false,
  };
  await fs.writeFile(
    path.join(output, 'editor-capture-receipt.json'),
    JSON.stringify(editorCapture, null, 2),
  );
  expect(editorCapture.decoded, 'A real decoded native recording must contain visible map detail').toBe(true);
  await director.keyboard.press('Escape');
  await request('director_window', { projectId: fixture.projectId, action: 'fullscreen', monitor: null });
  await director.getByRole('button', { name: 'Dock back', exact: true }).click();
  await expect.poll(() => director.isClosed()).toBe(true);
  await expect(page.getByRole('button', { name: 'Pop out Director ↗', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pop out Director ↗', exact: true }).click();
  const reopened = await call('director_session', { projectId: fixture.projectId });
  expect(reopened.id).toBe(session.id);
  expect(reopened.composition.pose.fov).toBe(65);
  await expect
    .poll(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .some((p) => p.url().includes('?director=')),
      { timeout: 20000 },
    )
    .toBe(true);
  director = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('?director='));
  await director.waitForLoadState('domcontentloaded');
  await director.evaluate(
    ({ id }) =>
      window.__TAURI_INTERNALS__.invoke('director_window', { projectId: id, action: 'dock', monitor: null }),
    { id: fixture.projectId },
  );
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await page
    .locator('.gs-navigation-drawer')
    .getByRole('button', { name: 'Community maps', exact: true })
    .click();
  const alpine = page.getByRole('article', { name: 'Alpine map', exact: true });
  await expect(alpine).toBeVisible();
  await expect
    .poll(() => alpine.locator('img').evaluate((img) => img.complete && img.naturalWidth > 0), {
      timeout: 30000,
    })
    .toBe(true);
  await page.screenshot({ path: path.join(output, 'native-map-catalog.png') });
  await alpine.getByRole('button', { name: 'Download into Spark…', exact: true }).click();
  await expect(page.getByLabel('Direct map download URL')).toHaveValue(
    'https://github.com/csauve/alpine/releases/download/1.0.0/alpine.zip',
  );
  await page.getByRole('button', { name: 'Download & import map', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'alpine', exact: true })).toBeVisible({ timeout: 120000 });
  const download = await call('bootstrap'),
    alpineEntry = download.entries.find((entry) => entry.title === 'alpine');
  expect(alpineEntry).toBeTruthy();
  const alpineProject = await call('open_project', { id: alpineEntry.id });
  expect(alpineProject.inspection.header.version).toBe(609);
  expect(alpineProject.inspection.tags.length).toBeGreaterThan(100);
  await expect
    .poll(async () => Number(await page.locator('.world-layout').getAttribute('data-source-shaders')), {
      timeout: 120000,
      intervals: [2000],
    })
    .toBeGreaterThan(0);
  await page.screenshot({ path: path.join(output, 'native-alpine-downloaded.png') });
  const downloadEvidence = {
    source: 'https://github.com/csauve/alpine/releases/download/1.0.0/alpine.zip',
    projectId: alpineEntry.id,
    sourceSha256: alpineProject.project.source.sha256,
    cacheVersion: alpineProject.inspection.header.version,
    tags: alpineProject.inspection.tags.length,
    sourceShaders: Number(await page.locator('.world-layout').getAttribute('data-source-shaders')),
    mccBuildVerified: false,
    gameplayVerified: false,
  };
  const after = await call('open_project', { id: fixture.projectId });
  expect(JSON.parse(JSON.stringify(after.project.scene))).toEqual(
    JSON.parse(JSON.stringify(before.project.scene)),
  );
  expect(after.project.tagEdits).toEqual(before.project.tagEdits);
  expect(sha(await fs.readFile(original.project.source.originalPath))).toBe(originalMapHash);
  expect(sha(await fs.readFile(resourcePath))).toBe(resourceHash);
  const receipt = {
    schemaVersion: 1,
    nativeDesktop: true,
    appSha256,
    sourceSha256: originalMapHash,
    resourceSha256: resourceHash,
    materialCounts,
    sizes,
    headerDrawer: { overlays: true, closedViewport: headerClosed, openViewport: headerOpened },
    normalViewport: normal,
    fullscreenViewport: full,
    fullscreenClient: client,
    displays,
    movedDisplays,
    editorPerformance,
    directorPerformance,
    editorCapture,
    downloadEvidence,
    drawerPreservesViewport: true,
    escapeRestoresPanels: true,
    toolsOpenInsideFullscreen: true,
    singleCameraAuthority: true,
    savedMapChangesRefreshDirector: true,
    staleCameraRejected: stale,
    wrongDirectorRejected: wrongOwner,
    compositionSurvivesReopen: true,
    directorRendersWhenOtherEditorFocused: !!directorStillRendering,
    originalMapAndResourcesUnchanged: true,
    authoredSceneAndTagsUnchanged: true,
    gameConnected: false,
    gameplayCaptureTested: false,
    nativeSavePickerTested: false,
    errors,
  };
  await fs.writeFile(path.join(output, 'native-ui-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  if (errors.length) throw Error('Native page errors: ' + errors.join('; '));
} finally {
  if (director && !director.isClosed())
    await director
      .evaluate(() =>
        window.__TAURI_INTERNALS__.invoke('plugin:window|close', {
          label: window.__TAURI_INTERNALS__.metadata.currentWindow.label,
        }),
      )
      .catch(() => {});
  if (call) await call('close_application').catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null) child.kill();
  }
}
