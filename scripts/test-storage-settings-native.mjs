// Real desktop IPC and source preflight. No native compile, SDK copy, cleanup,
// game launch or mocked commands. Existing source files remain read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
const [app, output, map, kit, invader, sdk, priorOutput] = process.argv
  .slice(2)
  .map((value) => path.resolve(value));
if (!sdk)
  throw Error(
    'test-storage-settings-native <built.exe> <fresh-output> <owned-Demo-map> <H1A-kit> <Invader> <SDK-tags> [prior-passing-output]',
  );
await fs.mkdir(output);
const hash = async (file) => {
  const h = crypto.createHash('sha256');
  const handle = await fs.open(file, 'r');
  try {
    for await (const part of handle.createReadStream()) h.update(part);
  } finally {
    await handle.close().catch(() => {});
  }
  return h.digest('hex');
};
const sourceHash = await hash(map),
  appHash = await hash(app);
let library = path.join(output, 'library');
if (priorOutput) {
  const prior = JSON.parse(await fs.readFile(path.join(priorOutput, 'acceptance.json'), 'utf8'));
  if (
    !prior.complete ||
    prior.mockedIpc ||
    prior.sourceHash !== sourceHash ||
    !prior.checks.demoPreflight.noExtractionOrSdkStaging
  )
    throw Error("Only this source's previously accepted isolated storage fixture may be reused");
  library = path.join(priorOutput, 'library');
  if ((await fs.realpath(library)).toLowerCase() !== library.toLowerCase())
    throw Error('A reused QA library must be a physical directory');
}
const endpoint = net.createServer();
await new Promise((resolve) => endpoint.listen(0, '127.0.0.1', resolve));
const port = endpoint.address().port;
await new Promise((resolve) => endpoint.close(resolve));
const child = spawn(app, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: library,
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
const record = {
  complete: false,
  mockedIpc: false,
  appSha256: appHash,
  sourceHash,
  reusedAcceptedLibrary: priorOutput ?? null,
  pid: child.pid,
  port,
  checks: {},
  errors: [],
  limitations: ['No game playback or gameplay acceptance. No accumulated files were removed.'],
};
await fs.writeFile(path.join(output, 'owned-process.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
let browser, page;
const children = async (name) => {
  try {
    return (await fs.readdir(path.join(library, name))).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};
async function refused(run) {
  try {
    await run();
    throw Error('Operation unexpectedly accepted');
  } catch (error) {
    if (String(error).includes('unexpectedly accepted')) throw error;
    return String(error);
  }
}
try {
  await expect
    .poll(
      () =>
        fetch(`http://127.0.0.1:${port}/json/version`).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 60000 },
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
      { timeout: 60000 },
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (error) => record.errors.push(String(error)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      hekDirectory: kit,
      hekTagsDirectory: sdk,
      hekFlavor: 'h1aEk',
      invaderDirectory: invader,
    },
  });
  await page.reload();
  const navigation = page.locator('.gs-navigation-drawer');
  if (!(await navigation.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await navigation.getByRole('button', { name: 'Settings & tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Storage & Cache', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Storage and cache settings', exact: true });
  const opening = performance.now();
  await expect(panel.getByText('Storage limits', { exact: true })).toBeVisible({ timeout: 30000 });
  record.checks.settingsReadyMs = performance.now() - opening;
  const report = await call('storage_overview');
  expect(report.managed.limits.totalBytes).toBeGreaterThan(0);
  expect(report.managed.entries.every((row) => row.state !== 'ready' || row.logicalBytes >= 0)).toBe(true);
  record.checks.storage = {
    root: report.managed.root,
    limits: report.managed.limits,
    managedEntries: report.managed.entries.length,
    accountedBytes: report.managed.accountedBytes,
    folders: report.folders,
  };
  expect(report.folders.every((folder) => folder.measurement === null)).toBe(true);
  const halos = report.folders.filter((folder) => folder.group === 'halo');
  expect(halos.length).toBeGreaterThanOrEqual(4);
  const labels = halos.map((folder) => folder.label).join(' | ');
  for (const name of ['MCC', 'Custom Edition', 'OpenCE', 'Chupathingy']) expect(labels).toContain(name);
  const haloPanel = page.getByRole('region', { name: 'Halo directory storage', exact: true });
  const measured = performance.now();
  await haloPanel.getByRole('button', { name: 'Measure all Halo folders', exact: true }).click();
  await expect(haloPanel.getByText(/across \d+ connected folders/)).toBeVisible({ timeout: 120000 });
  const haloUsage = await call('storage_measure_halos');
  expect(haloUsage.total.logicalBytes).toBeGreaterThan(0);
  expect(haloUsage.folders.every((folder) => folder.measurement !== null)).toBe(true);
  expect(haloUsage.total.logicalBytes).toBeLessThanOrEqual(
    haloUsage.folders.reduce((n, folder) => n + folder.measurement.logicalBytes, 0),
  );
  record.checks.haloDirectories = { ...haloUsage, elapsedMs: performance.now() - measured };
  await expect(haloPanel.getByText(/protected/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(output, 'storage-settings.png') });
  const before = {
    jobs: await children('jobs'),
    exchanges: await children('tag-exchanges'),
    sdk: await children('sdk-cache'),
  };
  const opened = (await call('import_paths', { paths: [map] }))[0];
  expect(opened.inspection.header.version).toBe(6);
  expect(opened.inspection.sha256).toBe(sourceHash);
  expect(opened.inspection.resources.some((resource) => resource.required)).toBe(true);
  const compatibility = await call('compatibility', { id: opened.project.id });
  expect(compatibility.ready).toBe(false);
  expect(compatibility.blockers.join('\n')).toMatch(/original|resource|source/i);
  const buildError = await refused(() => call('start_build', { id: opened.project.id }));
  const tag = opened.inspection.tags.find((tag) => tag.class === 'scen');
  expect(tag).toBeTruthy();
  const extractError = await refused(() =>
    call('extract_selected_tag_tree', { projectId: opened.project.id, tagId: tag.id }),
  );
  const after = {
    jobs: await children('jobs'),
    exchanges: await children('tag-exchanges'),
    sdk: await children('sdk-cache'),
  };
  expect(after).toEqual(before);
  expect(await hash(map)).toBe(sourceHash);
  expect(await hash(opened.project.source.preservedPath)).toBe(sourceHash);
  record.checks.demoPreflight = {
    projectId: opened.project.id,
    sourceVersion: 6,
    sourceSha256: sourceHash,
    resources: opened.inspection.resources,
    diagnostics: opened.inspection.diagnostics,
    compatibility,
    buildError,
    extractError,
    before,
    after,
    noExtractionOrSdkStaging: true,
  };
  expect(record.errors).toEqual([]);
  record.complete = true;
} catch (error) {
  record.errors.push(String(error));
  if (page && !page.isClosed()) record.visibleText = (await page.locator('body').innerText()).slice(0, 12000);
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed())
    await page.screenshot({ path: path.join(output, 'final.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 5000);
    });
  }
  console.log(JSON.stringify({ ...record, checks: Object.keys(record.checks) }));
}
