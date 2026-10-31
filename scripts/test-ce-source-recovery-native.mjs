// Opt-in real desktop/native IPC/geometry acceptance. No synthetic mesh or game proof.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 }),
  a = process.argv.slice(2);
if (a.length !== 5)
  throw Error(
    'test-ce-source-recovery-native <built Spark exe> <fresh acceptance root> <H1A kit> <original extracted CE source tags> <Invader>',
  );
const app = path.resolve(a[0]),
  root = path.resolve(a[1]);
await fs.mkdir(root, { recursive: false });
const data = path.join(root, 'library');
await fs.mkdir(data);
const hash = async (p) =>
    crypto
      .createHash('sha256')
      .update(await fs.readFile(p))
      .digest('hex'),
  receipt = {
    schemaVersion: 1,
    appSha256: await hash(app),
    mockedIpc: false,
    actualNativeGeometry: true,
    gameplayVerified: false,
    complete: false,
  },
  errors = [];
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const exe = path.join(root, 'GuiltySpark-workshop-qa.exe');
await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: data,
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser, page, call;
try {
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
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
  page.on('pageerror', (e) => errors.push(String(e)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      ...(a.length === 5
        ? {
            hekDirectory: path.resolve(a[2]),
            hekTagsDirectory: path.resolve(a[3]),
            invaderDirectory: path.resolve(a[4]),
            hekFlavor: 'h1aEk',
          }
        : {}),
    },
  });
  const created = await call('create_quickforge_project', {
    title: 'Reviewed CE source recovery',
    template: 'customBlank',
    target: 'mccSteam',
  });
  receipt.projectId = created.project.id;
  const open = async () => {
    await page.reload();
    await page
      .locator('.map-card')
      .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
      .click();
  };
  const saved = async () => (await call('open_project', { id: created.project.id })).project;
  const save = async () => {
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible();
  };

  const input = path.join(root, 'reviewed-input');
  await fs.cp(path.resolve(a[3]), input, { recursive: true, errorOnExist: true, force: false });
  await open();
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  await save();
  const p = await saved();
  const targetId = crypto.randomUUID();
  p.quickForge.runtimeId = 'haloCustomEdition';
  p.quickForge.skyPath = 'levels/test/bloodgulch/bloodgulch';
  p.quickForge.materials[0].name = 'cap_metal';
  p.quickForge.materials[0].shaderPath = 'levels/test/bloodgulch/shaders/cap_metal';
  p.activeBuildTarget = targetId;
  p.buildTargets = [
    {
      id: targetId,
      name: 'Reviewed CE source',
      runtimeId: 'haloCustomEdition',
      builder: 'invader-ce',
      hekDirectory: path.resolve(a[2]),
      hekFlavor: 'h1aEk',
      tagsDirectory: input,
      invaderDirectory: path.resolve(a[4]),
      ceCompatibleTagset: false,
      openSauce: false,
    },
  ];
  await call('save_project', { project: p });
  await open();
  let refused = false;
  try {
    await call('prepare_ce_source_recovery', { projectId: p.id, targetId: crypto.randomUUID() });
  } catch (e) {
    refused = /target.*exists/i.test(String(e));
  }
  expect(refused).toBe(true);
  receipt.unknownTargetRefused = true;
  const stale = await call('prepare_ce_source_recovery', { projectId: p.id, targetId });
  refused = false;
  try {
    await call('create_ce_source_recovery', { planId: stale.planId, confirmed: false });
  } catch (e) {
    refused = /Review.*changes/i.test(String(e));
  }
  expect(refused).toBe(true);
  receipt.unconfirmedRecoveryRefused = true;
  const extra = path.join(input, 'review-staleness.txt');
  await fs.writeFile(extra, 'isolated test harness edit after review');
  try {
    const failed = await call('create_ce_source_recovery', { planId: stale.planId, confirmed: true });
    await expect
      .poll(
        async () =>
          (await call('ce_source_recovery_status', { projectId: p.id, jobId: failed.jobId })).status,
        { timeout: 90000 },
      )
      .toBe('failed');
    receipt.staleReview = await call('ce_source_recovery_status', { projectId: p.id, jobId: failed.jobId });
    expect(receipt.staleReview.message).toMatch(/source changed since review/i);
  } finally {
    await fs.unlink(extra);
  }
  await page.getByRole('button', { name: 'Toggle Project setup', exact: true }).click();
  const setup = page.getByLabel('Project setup panel', { exact: true });
  const tools = setup.locator('details.gs-map-tools');
  if (!(await tools.locator('> p').first().isVisible())) await tools.locator('> summary').click();
  const targets = setup.locator('details.gs-build-targets');
  if (!(await targets.getByRole('combobox', { name: 'New engine target runtime', exact: true }).isVisible()))
    await targets.locator('> summary').click();
  const recovery = setup.getByLabel('Stock CE source recovery', { exact: true });
  await recovery.locator('> summary').click();
  await recovery.getByRole('button', { name: 'Review known CE corrections', exact: true }).click();
  await expect(
    recovery.getByRole('button', { name: 'Create separate corrected CE tagset', exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(recovery.locator('li')).toHaveCount(3);
  await page.screenshot({ path: path.join(root, 'ce-recovery-review.png') });
  await recovery.getByRole('button', { name: 'Create separate corrected CE tagset', exact: true }).click();
  const use = recovery.getByRole('button', { name: 'Use corrected source for this CE target', exact: true });
  await expect(use).toBeVisible({ timeout: 120000 });
  await open();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  const setupToggle = page.getByRole('button', { name: 'Toggle Project setup', exact: true });
  if ((await setupToggle.getAttribute('aria-expanded')) !== 'true') await setupToggle.click();
  await expect(setup).toBeVisible();
  if (!(await tools.evaluate((el) => el.open))) await tools.locator('> summary').click();
  if (!(await targets.evaluate((el) => el.open))) await targets.locator('> summary').click();
  if (!(await recovery.evaluate((el) => el.open))) await recovery.locator('> summary').click();
  await expect(use).toBeVisible({ timeout: 45000 });
  const panelWidth = await setup
    .locator('.gs-panel-content')
    .evaluate((el) => ({ scroll: el.scrollWidth, visible: el.clientWidth }));
  expect(panelWidth.scroll).toBeLessThanOrEqual(panelWidth.visible + 1);
  receipt.drawerFitsItsOwnWidth = panelWidth;
  receipt.recoverySurvivesWorkspaceRemount = true;
  const jobs = await fs.readdir(path.join(data, 'ce-source-recoveries'));
  const recovered = jobs.filter((j) => j !== receipt.staleReview.jobId);
  expect(recovered).toHaveLength(1);
  const jobId = recovered[0];
  const status = await call('ce_source_recovery_status', { projectId: p.id, jobId });
  const anotherReview = await call('prepare_ce_source_recovery', { projectId: p.id, targetId });
  const anotherJob = await call('create_ce_source_recovery', {
    planId: anotherReview.planId,
    confirmed: true,
  });
  await expect
    .poll(
      async () =>
        (await call('ce_source_recovery_status', { projectId: p.id, jobId: anotherJob.jobId })).status,
      { timeout: 120000 },
    )
    .toBe('ready');
  expect((await call('check_ce_source_recovery', { projectId: p.id, jobId })).status).toBe('ready');
  receipt.anotherRecoveryDoesNotDiscardPriorReadyResult = true;
  const native = JSON.parse(await fs.readFile(status.receiptPath, 'utf8'));
  expect(native.lossless).toBe(false);
  expect(native.compilationVerified).toBe(false);
  expect(native.nativeRecords).toHaveLength(6);
  const changed = Object.entries(native.originalInventory)
    .filter(([n, h]) => native.recoveredInventory[n] !== h)
    .map(([n]) => n);
  expect(changed).toEqual(native.corrections.map((c) => c.tag).sort());
  for (const c of native.corrections) {
    expect(await hash(path.join(path.resolve(a[3]), c.tag))).toBe(c.beforeSha256);
    expect(await hash(path.join(native.originalsDirectory, c.tag))).toBe(c.beforeSha256);
    expect(await hash(path.join(native.tagsDirectory, c.tag))).toBe(c.afterSha256);
  }
  const modified = path.join(native.tagsDirectory, native.corrections[1].tag),
    exact = await fs.readFile(modified);
  try {
    await fs.writeFile(modified, 'isolated modified recovery candidate');
    refused = false;
    try {
      await call('check_ce_source_recovery', { projectId: p.id, jobId });
    } catch (e) {
      refused = /changed after recovery/i.test(String(e));
    }
    expect(refused).toBe(true);
    receipt.modifiedRecoveryRefusedBeforeSelection = true;
  } finally {
    await fs.writeFile(modified, exact);
  }
  await use.click();
  await expect(targets.getByRole('textbox').nth(2)).toHaveValue(status.tagsDirectory);
  await targets.getByRole('checkbox').first().check();
  await save();
  const selected = await saved();
  expect(selected.buildTargets[0].tagsDirectory).toBe(status.tagsDirectory);
  expect(selected.buildTargets[0].ceCompatibleTagset).toBe(true);
  await page.screenshot({ path: path.join(root, 'ce-recovery-selected.png') });
  await page.getByRole('button', { name: 'Close Project setup', exact: true }).click();
  await page.getByRole('button', { name: 'Objects & gameplay', exact: true }).click();
  await page.getByRole('button', { name: 'Build & check playtest', exact: true }).click();
  await expect
    .poll(async () => (await call('quickforge_build_report', { projectId: p.id }))?.status, {
      timeout: 180000,
      intervals: [1000],
    })
    .toBe('validated');
  const build = await call('quickforge_build_report', { projectId: p.id });
  expect(build.current).toBe(true);
  expect(build.build.target).toBe('gbx-custom');
  const inspected = (await call('import_paths', { paths: [build.build.output] }))[0];
  expect(inspected.inspection.header.version).toBe(609);
  expect(inspected.inspection.mesh.indices.length / 3).toBeGreaterThan(40);
  receipt.ceCacheNativeReadback = {
    version: inspected.inspection.header.version,
    triangles: inspected.inspection.mesh.indices.length / 3,
    objects: inspected.inspection.objects.length,
  };
  receipt.nativeBuild = build;
  receipt.recovery = {
    jobId,
    sourceFiles: native.originalInventory ? Object.keys(native.originalInventory).length : 0,
    changedTags: changed,
    fieldChanges: 7,
    lossless: false,
    exactOriginalsPreserved: true,
    receiptPath: status.receiptPath,
    nativeToolHashes: [...new Set(native.nativeRecords.map((r) => r.executableSha256))],
  };
  expect(errors).toEqual([]);
  receipt.pageErrors = errors;
  receipt.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS real reviewed CE recovery, stale/corrupt rejection, preserved originals, GUI selection, native build and v609 readback',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.keyEvents = await page?.evaluate(() => window.__gsQaKeys).catch(() => null);
  receipt.pageErrors = errors;
  await page?.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
