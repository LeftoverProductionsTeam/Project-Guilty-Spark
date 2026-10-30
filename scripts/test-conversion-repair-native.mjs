// Explicit owned native QA: review classic tags -> separate SDK -> MCC conversion -> editor.
// Never launches Halo, runs archive contents, or changes the original cache/SDK tagset.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const options = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--data', '--output', '--kit', '--invader', '--sdk', '--classic'].includes(process.argv[n]) ||
    !process.argv[n + 1] ||
    options.has(process.argv[n])
  )
    throw Error('Provide unique named arguments');
  options.set(process.argv[n], process.argv[n + 1]);
}
if (options.size !== 7)
  throw Error(
    'Required: --app built.exe --data fresh-conversion-library --output fresh-directory --kit HCEEK --invader Invader --sdk original-SDK-tags --classic matching-classic-tags',
  );
const data = path.resolve(options.get('--data')),
  output = path.resolve(options.get('--output'));
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-conversion-ui-fixture.json'), 'utf8'));
if (fixture.nativeFixture !== true || fixture.schemaVersion !== 1 || fixture.sourceCacheVersion !== 609)
  throw Error('Only a fresh qa_conversion_library fixture is accepted');
await fs.mkdir(output);
const executable = path.join(output, 'GuiltySpark-conversion-qa.exe');
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
let browser, call, page, director;
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
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekFlavor: 'h1aEk',
      hekDirectory: path.resolve(options.get('--kit')),
      hekTagsDirectory: path.resolve(options.get('--sdk')),
      invaderDirectory: path.resolve(options.get('--invader')),
      resourceDirectory: null,
    },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  const original = (await call('open_project', { id: fixture.projectId })).project;
  if (original.builds.length || original.activeBuildTarget)
    throw Error('Use a fresh unconverted source fixture');
  expect(hash(await fs.readFile(original.source.preservedPath))).toBe(fixture.sourceSha256);
  expect(hash(await fs.readFile(original.source.originalPath))).toBe(fixture.sourceSha256);
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Build & playtest', exact: true }).click();
  const repair = page.getByRole('region', { name: 'Classic bitmap dependency repair', exact: true });
  await expect(repair).toContainText('427 of 430', { timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Convert map to MCC', exact: true })).toBeDisabled();
  const initial = await call('compatibility', { id: fixture.projectId });
  expect(initial.bitmapDependencies.missing).toHaveLength(3);
  expect(initial.bitmapDependencies.invalid).toHaveLength(0);
  const reviewArgs = { projectId: fixture.projectId, sourceTags: path.resolve(options.get('--classic')) };
  const preview = await call('prepare_bitmap_tagset_repair', reviewArgs);
  let unconfirmedRejected = false,
    wrongWindowRejected = false;
  try {
    await call('create_bitmap_tagset_repair', { planId: preview.planId, confirmed: false });
  } catch (error) {
    unconfirmedRejected = /Review the matching/.test(String(error));
  }
  expect(unconfirmedRejected).toBe(true);
  const detached = await call('director_popout', { projectId: fixture.projectId });
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
  try {
    await director.evaluate(
      (planId) =>
        window.__TAURI_INTERNALS__.invoke('create_bitmap_tagset_repair', { planId, confirmed: true }),
      preview.planId,
    );
  } catch (error) {
    wrongWindowRejected = /another window/.test(String(error));
  }
  expect(wrongWindowRejected).toBe(true);
  await call('plugin:window|close', { label: detached.window });
  await expect.poll(() => director.isClosed()).toBe(true);
  await page.getByRole('checkbox', { name: 'Use MCC multiplayer UI dependencies', exact: true }).check();
  await repair
    .getByRole('textbox', { name: 'Matching classic tags folder', exact: true })
    .fill(reviewArgs.sourceTags);
  await repair.getByRole('button', { name: 'Save & review matching bitmap tags', exact: true }).click();
  await expect(
    repair.getByRole('heading', { name: 'Review 3 matching source files', exact: true }),
  ).toBeVisible({ timeout: 45000 });
  await page.screenshot({ path: path.join(output, 'native-bitmap-review.png') });
  const repairStarted = performance.now();
  await repair.getByRole('button', { name: 'Create separate repaired tagset', exact: true }).click();
  await expect(repair.getByText('Repaired source tagset ready', { exact: true })).toBeVisible({
    timeout: 240000,
  });
  const repairElapsedMs = performance.now() - repairStarted;
  const repairFolder = await repair.locator('.path-text').textContent();
  const receipt = JSON.parse(
    await fs.readFile(path.join(path.dirname(repairFolder), 'tagset-repair-receipt.json'), 'utf8'),
  );
  expect(receipt.status).toBe('ready-source-tagset');
  expect(receipt.playableOutput).toBe(false);
  expect(receipt.files).toHaveLength(3);
  expect((await call('open_project', { id: fixture.projectId })).project.builds).toHaveLength(0);
  const auditSdk = JSON.parse(
    await fs.readFile(path.join(path.dirname(repairFolder), 'input-sdk-tags.json'), 'utf8'),
  );
  for (const candidate of receipt.files) {
    expect(hash(await fs.readFile(candidate.source))).toBe(candidate.sha256);
    expect(hash(await fs.readFile(path.join(repairFolder, candidate.path)))).toBe(candidate.sha256);
    const absent = await fs.stat(path.join(receipt.originalSdk, candidate.path)).then(
      () => false,
      (e) => e.code === 'ENOENT',
    );
    expect(absent).toBe(true);
  }
  console.log(
    'Native separate tagset ready:',
    JSON.stringify({ sdkFiles: receipt.sdkFiles, files: receipt.files.length, repairElapsedMs }),
  );
  await repair.getByRole('button', { name: 'Use repaired tagset for this map', exact: true }).click();
  await page.getByRole('button', { name: 'Save & refresh checks', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Convert map to MCC', exact: true })).toBeEnabled({
    timeout: 45000,
  });
  const ready = await call('compatibility', { id: fixture.projectId });
  expect(ready.bitmapDependencies.available).toBe(430);
  expect(ready.ready).toBe(true);
  const buildStarted = performance.now();
  await page.getByRole('button', { name: 'Convert map to MCC', exact: true }).click();
  let record;
  const deadline = performance.now() + 240000;
  while (performance.now() < deadline) {
    record = (await call('open_project', { id: fixture.projectId })).project.builds.at(-1);
    if (record && ['validated', 'failed'].includes(record.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  expect(record?.status, record?.message).toBe('validated');
  const buildElapsedMs = performance.now() - buildStarted;
  expect(hash(await fs.readFile(record.output))).toBe(record.sha256);
  console.log('Native UI conversion validated:', record.id, record.sha256);
  await expect(page.getByRole('button', { name: 'Open compiled map', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Open compiled map', exact: true }).click();
  let opened;
  await expect
    .poll(
      async () => {
        const state = await call('bootstrap'),
          entry = state.entries.find((e) => e.sha256 === record.sha256);
        if (!entry) return false;
        opened = await call('open_project', { id: entry.id });
        return !!opened.inspection;
      },
      { timeout: 45000, intervals: [1000] },
    )
    .toBe(true);
  expect(opened.inspection.header.version).toBe(13);
  expect(opened.inspection.header.scenarioType).toBe(1);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect
    .poll(async () => Number(await page.locator('.world-layout').getAttribute('data-source-shaders')), {
      timeout: 150000,
      intervals: [2000],
    })
    .toBeGreaterThan(10);
  await expect
    .poll(() => page.locator('.world-layout').getAttribute('data-material-loading'), {
      timeout: 150000,
      intervals: [2000],
    })
    .toBe('false');
  const materialCounts = await page.locator('.world-layout').evaluate((e) => ({ ...e.dataset }));
  await page.screenshot({ path: path.join(output, 'native-converted-map.png') });
  const after = (await call('open_project', { id: fixture.projectId })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge'])
    expect(JSON.parse(JSON.stringify(after[key] ?? null))).toEqual(
      JSON.parse(JSON.stringify(original[key] ?? null)),
    );
  expect(hash(await fs.readFile(original.source.preservedPath))).toBe(fixture.sourceSha256);
  expect(hash(await fs.readFile(original.source.originalPath))).toBe(fixture.sourceSha256);
  // Verify every original SDK input against the inventory recorded by the native copy.
  for (const [relative, expected] of Object.entries(auditSdk))
    expect(hash(await fs.readFile(path.join(receipt.originalSdk, relative)))).toBe(expected);
  expect(after.conversionProfile).toBe('mcc-multiplayer-ui');
  expect(after.buildTargets.find((t) => t.id === after.activeBuildTarget).tagsDirectory).toBe(repairFolder);
  const result = {
    schemaVersion: 1,
    nativeDesktop: true,
    appSha256,
    sourceSha256: fixture.sourceSha256,
    sourceCacheVersion: 609,
    requiredIndexedBitmaps: 430,
    missingBefore: 3,
    availableAfter: 430,
    repairFiles: receipt.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
    sdkFilesVerified: Object.keys(auditSdk).length,
    repairElapsedMs,
    buildElapsedMs,
    unconfirmedRejected,
    wrongWindowRejected,
    sourceTagsetNotPlayable: true,
    explicitMccUiProfile: true,
    compiledSha256: record.sha256,
    compiledBytes: (await fs.stat(record.output)).size,
    cacheVersion: opened.inspection.header.version,
    scenarioType: opened.inspection.header.scenarioType,
    tags: opened.inspection.tags.length,
    separateMapTab: true,
    materialCounts,
    originalSdkInputsUnchanged: true,
    originalClassicInputsUnchanged: true,
    originalSourceUnchanged: true,
    sparkAuthoredDocumentUnchanged: true,
    gameLaunched: false,
    gameMemoryTouched: false,
    gameplayAccepted: false,
    errors,
  };
  await fs.writeFile(
    path.join(output, 'native-conversion-repair-receipt.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(JSON.stringify(result));
  if (errors.length) throw Error(errors.join('; '));
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await fs
      .writeFile(path.join(output, 'failure-ui.txt'), await page.locator('body').innerText())
      .catch(() => {});
  }
  throw error;
} finally {
  if (director && !director.isClosed() && call)
    await call('plugin:window|close', {
      label: await director
        .evaluate(() => window.__TAURI_INTERNALS__.metadata.currentWindow.label)
        .catch(() => null),
    }).catch(() => {});
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
