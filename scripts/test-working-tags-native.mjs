// Explicit owned QA: real external tag save -> stable observation -> native build -> new cache.
// Requires a fresh qa_runtime_library fixture. Never writes SDK masters or launches Halo.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
const seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
if (
  !fixture.nativeFixture ||
  fixture.schemaVersion !== 1 ||
  fixture.projectId !== seed.projectId ||
  path.resolve(seed.library) !== data ||
  path.resolve(seed.sourceJob) === data
)
  throw Error('Only the explicit replica fixture is accepted');
await fs.mkdir(output);
const executable = path.join(output, 'GuiltySpark-working-tags-qa.exe');
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
let browser, call, director;
const errors = [];
const run = promisify(execFile);
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
  const connectedAt = performance.now();
  const watch = await call('working_tag_watch_start', { projectId: fixture.projectId });
  expect(watch.basis).toBe('compiledBuild');
  expect(watch.changedFiles).toBe(0);
  const initial = {
    files: watch.totalFiles,
    hashesRead: watch.hashesReadLastScan,
    elapsedMs: performance.now() - connectedAt,
  };
  const idle = await call('working_tag_watch_poll', { watchId: watch.watchId, force: false });
  expect(idle.revision).toBe(0);
  // Another native window cannot borrow this editor's watch.
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
  let wrongWindow = false;
  try {
    await director.evaluate(
      ({ watchId }) => window.__TAURI_INTERNALS__.invoke('working_tag_watch_poll', { watchId, force: false }),
      { watchId: watch.watchId },
    );
  } catch (error) {
    wrongWindow = /another window/.test(String(error));
  }
  expect(wrongWindow).toBe(true);
  await call('plugin:window|close', { label: detached.window });
  await expect.poll(() => director.isClosed()).toBe(true);
  console.log('Native tag monitor connected; wrong-window access refused.', JSON.stringify(initial));
  const plan = await call('prepare_runtime_tool', {
    runtimeId: 'mccSteam',
    projectId: fixture.projectId,
    actionId: 'editTags',
  });
  const tags = await fs.realpath(plan.tagsDirectory),
    scenario = await fs.realpath(plan.scenarioFile),
    ownedJobs = await fs.realpath(path.join(data, 'jobs'));
  const relative = path.relative(tags, scenario);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !tags.startsWith(ownedJobs + path.sep) ||
    !relative.endsWith('.scenario')
  )
    throw Error('Scenario is outside the explicit QA replica');
  const sourceScenario = path.join(seed.sourceJob, 'workspace', 'tags', relative),
    sourceBefore = hash(await fs.readFile(sourceScenario)),
    tagBefore = await fs.readFile(scenario);
  const edit = path.resolve(options.get('--invader'), 'invader-edit.exe'),
    editSha256 = hash(await fs.readFile(edit));
  const get = await run(edit, ['-t', tags, '-G', 'player_starting_locations[0].position', relative], {
    windowsHide: true,
    timeout: 30000,
  });
  const before = get.stdout.trim().split(',').map(Number);
  if (before.length !== 3 || before.some((n) => !Number.isFinite(n)))
    throw Error('Native editor did not read a real player start');
  const expected = [before[0] + 0.5, before[1], before[2]];
  await run(edit, ['-t', tags, '-S', 'player_starting_locations[0].position', expected.join(','), relative], {
    windowsHide: true,
    timeout: 30000,
  });
  const tagSavedHash = hash(await fs.readFile(scenario));
  expect(tagSavedHash).not.toBe(hash(tagBefore));
  await expect
    .poll(
      async () => {
        const value = await call('working_tag_watch_poll', { watchId: watch.watchId, force: false });
        return value.status === 'changed' ? value.changedFiles : 0;
      },
      { timeout: 20000, intervals: [200, 1000, 2000] },
    )
    .toBe(1);
  const saved = await call('working_tag_watch_poll', { watchId: watch.watchId, force: false });
  expect(saved.changes).toEqual([{ kind: 'modified', path: relative.replaceAll('\\', '/') }]);
  expect(saved.hashesReadLastScan).toBe(1);
  await expect(page.getByRole('button', { name: '1 saved tool edit', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('button', { name: '1 saved tool edit', exact: true }).click();
  const changes = page.getByRole('region', { name: 'Saved tool tag changes', exact: true });
  await expect(changes).toContainText('1 changed tag file');
  await changes.locator('summary').click();
  await page.screenshot({ path: path.join(output, 'native-saved-tag-review.png') });
  const buildStarted = performance.now();
  await page.getByRole('button', { name: 'Build working tag edits', exact: true }).click();
  try {
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20000 });
  } catch (error) {
    const messages = await page.locator('.runtime-details-dialog .notice').allTextContents();
    throw Error('Native build did not start: ' + messages.join('; '));
  }
  let record;
  await expect
    .poll(
      async () => {
        const logs = (await call('bootstrap')).logs.filter((event) => event.projectId === fixture.projectId);
        const failed = logs.find((event) => event.phase === 'failed');
        if (failed) throw Error(failed.message);
        const project = (await call('open_project', { id: fixture.projectId })).project;
        record = project.builds.find((build) => build.id !== parent.id && build.timestamp > parent.timestamp);
        if (record?.status === 'failed') throw Error(record.message);
        return record?.status;
      },
      { timeout: 240000, intervals: [1000, 3000] },
    )
    .toBe('validated');
  const buildElapsedMs = performance.now() - buildStarted;
  console.log('Native working-tag compilation validated:', record.id);
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open working-tags build', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open working-tags build', exact: true }).click();
  let opened;
  await expect
    .poll(
      async () => {
        const state = await call('bootstrap');
        const entry = state.entries.find((entry) => entry.sha256 === record.sha256);
        if (!entry) return false;
        opened = await call('open_project', { id: entry.id });
        return !!opened.inspection;
      },
      { timeout: 45000, intervals: [1000] },
    )
    .toBe(true);
  const actual = opened.inspection.objects.find((object) => object.id === 'spawn-0')?.position;
  expect(actual).toBeTruthy();
  for (let n = 0; n < 3; n++) expect(actual[n]).toBeCloseTo(expected[n], 4);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.screenshot({ path: path.join(output, 'native-rebuilt-tag-revision.png') });
  const after = (await call('open_project', { id: fixture.projectId })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge'])
    expect(JSON.parse(JSON.stringify(after[key]))).toEqual(JSON.parse(JSON.stringify(original[key])));
  expect(hash(await fs.readFile(parent.output))).toBe(parentHash);
  expect(hash(await fs.readFile(sourceScenario))).toBe(sourceBefore);
  expect(hash(await fs.readFile(scenario))).toBe(tagSavedHash);
  const receipt = {
    schemaVersion: 1,
    nativeDesktop: true,
    appSha256,
    initial,
    wrongWindowRejected: wrongWindow,
    changedFiles: saved.changedFiles,
    changedFile: saved.changes[0].path,
    stableScanHashesRead: saved.hashesReadLastScan,
    externalEditToolSha256: editSha256,
    field: 'player_starting_locations[0].position',
    before,
    expected,
    compiled: actual,
    buildElapsedMs,
    cacheVersion: opened.inspection.header.version,
    scenarioType: opened.inspection.header.scenarioType,
    tags: opened.inspection.tags.length,
    parentSha256: parentHash,
    compiledSha256: record.sha256,
    separateMapTab: true,
    originalSdkScenarioUnchanged: true,
    parentCacheUnchanged: true,
    editedInputRetained: true,
    sparkAuthoredDocumentUnchanged: true,
    gameLaunched: false,
    gameMemoryTouched: false,
    gameplayAccepted: false,
    errors,
  };
  await fs.writeFile(
    path.join(output, 'native-working-tags-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
  if (errors.length) throw Error(errors.join('; '));
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
