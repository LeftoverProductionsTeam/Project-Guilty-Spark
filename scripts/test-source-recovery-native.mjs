import { assertQaOutputPath } from './native-qa-storage.mjs';
// Actual desktop UI + native IPC against a previously accepted, isolated
// recovery library. No mocked backend, full SDK copy, game or public session.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
const [app, prior, output, invader] = process.argv.slice(2).map((value) => path.resolve(value));
if (!invader)
  throw Error('test-source-recovery-native <built.exe> <accepted-qa-output> <fresh-output> <Invader>');
const baseline = JSON.parse(await fs.readFile(path.join(prior, 'acceptance.json'), 'utf8'));
if (!baseline.complete || baseline.mockedNativeTools || !baseline.originalSourceUnchanged)
  throw Error('A genuine accepted native recovery fixture is required');
const library = path.join(prior, 'library');
if ((await fs.realpath(library)).toLowerCase() !== library.toLowerCase())
  throw Error('Native QA library must be a physical directory');
await fs.mkdir(await assertQaOutputPath(output));
const hash = async (file) => {
  const sum = crypto.createHash('sha256'),
    handle = await fs.open(file, 'r');
  try {
    for await (const bytes of handle.createReadStream()) sum.update(bytes);
  } finally {
    await handle.close().catch(() => {});
  }
  return sum.digest('hex');
};
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
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
  pid: child.pid,
  port,
  sourceSha256: baseline.sourceSha256,
  appSha256: await hash(app),
  checks: {},
  errors: [],
  limitations: ['Native recovery UI acceptance only; no new game or human gameplay acceptance.'],
};
await fs.writeFile(path.join(output, 'owned-process.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
let browser, page;
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
          .flatMap((context) => context.pages())
          .some((p) => p.url().includes('tauri.localhost')),
      { timeout: 60000 },
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (error) => record.errors.push(String(error)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false, invaderDirectory: invader },
  });
  await page.reload();
  await expect(page.locator('.map-card').first()).toBeVisible({ timeout: 60000 });
  const target = boot.entries.find(
    (entry) => entry.id === baseline.plan.projectId && entry.sha256 === baseline.sourceSha256,
  );
  expect(target).toBeTruthy();
  // Inbox discovery may add other maps. Never assume the first tile is the
  // controlled native fixture or silently test a different source edition.
  await page
    .locator('.map-card')
    .filter({ has: page.getByText(target.title, { exact: true }) })
    .first()
    .click();
  const navigate = async (name) => {
    const drawer = page.locator('.gs-navigation-drawer');
    if (!(await drawer.isVisible()))
      await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
    await drawer.getByRole('button', { name, exact: true }).click();
  };
  await navigate('Preservation record');
  const panel = page.getByRole('region', { name: 'Source Guardian recovery', exact: true });
  await expect(panel.getByRole('heading', { name: 'Recover a Halo Project' })).toBeVisible({
    timeout: 30000,
  });
  await panel.getByLabel('Recovery root', { exact: true }).selectOption(String(baseline.plan.tagId));
  const before = await fs.readdir(path.join(library, 'recoveries'));
  const start = performance.now();
  await panel.getByRole('button', { name: 'Review recovery', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Recover into a separate project', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  expect(await fs.readdir(path.join(library, 'recoveries'))).toEqual(before);
  record.checks.reviewReadOnly = true;
  record.checks.reviewMs = performance.now() - start;
  await panel.locator('summary').filter({ hasText: 'Identity, dependencies' }).click();
  await expect(panel.getByText(baseline.plan.sourceEdition, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, 'recovery-review.png') });
  await panel.locator('summary').filter({ hasText: 'Identity, dependencies' }).click();
  const recover = performance.now();
  await panel.getByRole('button', { name: 'Recover into a separate project', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Open recovered project', exact: true })).toBeVisible({
    timeout: 120000,
  });
  record.checks.recoveryUiMs = performance.now() - recover;
  const opened = await call('open_project', { id: baseline.plan.projectId });
  const review = await call('review_project_recovery', {
    projectId: baseline.plan.projectId,
    tagId: baseline.plan.tagId,
  });
  const receipt = await call('recover_halo_project', {
    projectId: baseline.plan.projectId,
    tagId: baseline.plan.tagId,
    planIdentity: review.identity,
  });
  expect(receipt.reused).toBe(true);
  expect(receipt.nativeTags).toHaveLength(23);
  expect(receipt.recoveredData.length).toBeGreaterThan(0);
  expect(receipt.nativeCompilationVerified).toBe(false);
  expect(receipt.gameplayVerified).toBe(false);
  expect(opened.project.source.sha256).toBe(baseline.sourceSha256);
  expect(await hash(opened.project.source.preservedPath)).toBe(baseline.sourceSha256);
  record.checks.receipt = receipt;
  await page.screenshot({ path: path.join(output, 'recovery-result.png') });
  await navigate('Tag editor');
  await navigate('Preservation record');
  await expect(panel.getByRole('button', { name: 'Open recovered project', exact: true })).toBeVisible({
    timeout: 60000,
  });
  record.checks.navigateAndRestore = true;
  // The default scenario path is tested separately from the selected door.
  // It is still recovery evidence, not a compiled/gameplay acceptance claim.
  const scenario = opened.inspection.tags.find((tag) => tag.class === 'scnr');
  expect(scenario).toBeTruthy();
  await panel.getByLabel('Recovery root', { exact: true }).selectOption(String(scenario.id));
  await panel.getByRole('button', { name: 'Review recovery', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Recover into a separate project', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  const scenarioStart = performance.now();
  await panel.getByRole('button', { name: 'Recover into a separate project', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Open recovered project', exact: true })).toBeVisible({
    timeout: 120000,
  });
  const scenarioPlan = await call('review_project_recovery', {
    projectId: baseline.plan.projectId,
    tagId: scenario.id,
  });
  const scenarioRecovery = await call('recover_halo_project', {
    projectId: baseline.plan.projectId,
    tagId: scenario.id,
    planIdentity: scenarioPlan.identity,
  });
  expect(scenarioRecovery.reused).toBe(true);
  expect(scenarioRecovery.nativeTags.some((file) => file.path.endsWith('.scenario'))).toBe(true);
  expect(scenarioRecovery.nativeTags.some((file) => file.path.endsWith('.scenario_structure_bsp'))).toBe(
    true,
  );
  record.checks.scenario = { elapsedMs: performance.now() - scenarioStart, receipt: scenarioRecovery };
  await page.screenshot({ path: path.join(output, 'scenario-recovery.png') });
  await panel.getByLabel('Recovery root', { exact: true }).selectOption(String(baseline.plan.tagId));
  await expect(panel.getByRole('button', { name: 'Open recovered project', exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(await panel.locator('.recovery-result').innerText()).toContain(receipt.directory);
  record.checks.perRootRecoveryRetained = true;
  await expect(page.locator('.runtime-dock-save')).not.toContainText('Working…');
  record.checks.operationIndicatorCompleted = true;
  expect(record.errors).toEqual([]);
  record.complete = true;
} catch (error) {
  record.errors.push(String(error));
  process.exitCode = 1;
  if (page && !page.isClosed()) record.visibleText = (await page.locator('body').innerText()).slice(0, 12000);
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
  console.log(
    JSON.stringify({ complete: record.complete, errors: record.errors, checks: Object.keys(record.checks) }),
  );
}
