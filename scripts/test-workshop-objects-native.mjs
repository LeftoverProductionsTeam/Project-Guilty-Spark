// Opt-in real desktop/native IPC/geometry acceptance. No synthetic mesh or game proof.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 }),
  a = process.argv.slice(2);
if (a.length !== 2 && a.length !== 5)
  throw Error(
    'test-workshop-objects-native <built Spark exe> <fresh acceptance root> [H1A kit source-tags Invader]',
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
    title: 'Integrated Workshop custom scenery',
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
  await open();
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  if (a.length === 5) {
    const details = page
      .locator('.bsp-source-fields details')
      .filter({ has: page.locator('summary', { hasText: 'Halo material paths & player starts' }) });
    await details.locator('summary').click();
    const shader = page.getByRole('textbox', { name: 'Shader path surface', exact: true });
    await shader.fill('levels/test/tutorial/shaders/example_tutorial_metal_floor');
    await shader.press('Tab');
    await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
    const sky = details.getByRole('textbox').last();
    await sky.fill('levels/test/bloodgulch/bloodgulch');
    await sky.press('Tab');
    await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  }
  await save();
  const source = (await saved()).quickForge;
  expect((await call('quickforge_validate', { document: source })).valid).toBe(true);
  const obj = path.join(root, 'original_wedge.obj');
  await fs.copyFile(path.resolve('crates/spark-core/tests/fixtures/static_wedge.obj'), obj);
  const objHash = await hash(obj);
  const imported = await call('import_asset', { id: created.project.id, path: obj });
  expect(imported.asset.triangles).toBe(8);
  receipt.realObjImported = { originalSha256: objHash, managedSha256: imported.asset.sha256 };
  await open();
  await page.getByRole('button', { name: 'Objects & gameplay', exact: true }).click();
  await expect(page.locator('.forge-viewport canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle Build tools', exact: true }).click();
  await page.locator('.forge-tree-select').filter({ hasText: 'original_wedge.obj' }).click();
  await expect(page.getByRole('button', { name: 'Close Custom model', exact: true })).toBeVisible();
  for (const [axis, value] of [
    [0, 4],
    [1, 3],
    [2, 2],
  ]) {
    const field = page.getByRole('spinbutton', { name: 'Custom model position ' + axis, exact: true });
    await field.fill(String(value));
    await field.press('Tab');
  }
  const native = page.locator('.custom-native-materials');
  await native.locator('summary').click();
  if (a.length === 5)
    await page
      .getByRole('combobox', { name: 'Native shader for example_tutorial_metal_floor', exact: true })
      .selectOption('surface');
  await save();
  await expect.poll(async () => (await saved()).scene[0].position).toEqual([4, 3, 2]);
  await page.getByRole('button', { name: 'Remove custom model', exact: true }).focus();
  receipt.endInputContext = await page.evaluate(() => ({
    active: document.activeElement?.tagName,
    dialogs: [...document.querySelectorAll('[role=dialog]')].map((e) => ({
      hidden: e.hidden,
      visible: e.checkVisibility(),
      label: e.getAttribute('aria-label'),
    })),
  }));
  await page.evaluate(() => {
    window.__gsQaKeys = [];
    window.addEventListener(
      'keydown',
      (e) => window.__gsQaKeys.push({ key: e.key, prevented: e.defaultPrevented, target: e.target.tagName }),
      true,
    );
  });
  await page.keyboard.press('End');
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('spinbutton', { name: 'Custom model position 2', exact: true }).inputValue(),
      ),
    )
    .toBeLessThan(0.01);
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('spinbutton', { name: 'Custom model position 2', exact: true })).toHaveValue(
    '2',
  );
  await page.keyboard.press('Control+y');
  await expect
    .poll(async () =>
      Number(
        await page.getByRole('spinbutton', { name: 'Custom model position 2', exact: true }).inputValue(),
      ),
    )
    .toBeLessThan(0.01);
  receipt.endToWorkshopFloorWithUndoRedo = true;
  await save();
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  await page.getByRole('button', { name: 'Objects & gameplay', exact: true }).click();
  await save();
  const after = await saved();
  expect(after.quickForge.workshop).toEqual(source.workshop);
  expect(after.quickForge.spawns).toEqual(source.spawns);
  expect(after.scene[0].position.slice(0, 2)).toEqual([4, 3]);
  receipt.geometryAndObjectsShareProject = true;
  await page.screenshot({ path: path.join(root, 'workshop-custom-controls.png') });
  await page.getByRole('button', { name: 'Close Custom model', exact: true }).click();
  await expect
    .poll(async () => page.locator('.forge-viewport canvas').getAttribute('data-gs-performance'))
    .not.toBeNull();
  const gpu = JSON.parse(await page.locator('.forge-viewport canvas').getAttribute('data-gs-performance'));
  expect(gpu.triangles).toBeGreaterThanOrEqual(58);
  receipt.actualGpu = gpu;
  await page.screenshot({ path: path.join(root, 'workshop-objects.png') });
  if (a.length === 5) {
    const build = page.getByRole('button', { name: 'Build & check playtest', exact: true });
    await expect(build).toBeEnabled();
    await build.click();
    await expect
      .poll(async () => (await call('quickforge_build_report', { projectId: created.project.id }))?.status, {
        timeout: 180000,
        intervals: [1000],
      })
      .toBe('validated');
    const compiled = await call('quickforge_build_report', { projectId: created.project.id });
    expect(compiled.current).toBe(true);
    receipt.nativeBuild = compiled;
    const verify = JSON.parse(
      await fs.readFile(
        path.join(path.dirname(compiled.build.output), 'custom-model-verification.json'),
        'utf8',
      ),
    );
    expect(verify).toHaveLength(1);
    expect(verify[0].renderTriangles).toBe(8);
    expect(verify[0].collisionTriangles).toBeGreaterThan(0);
    receipt.nativeModelReadback = verify;
    const outputHash = await hash(compiled.build.output),
      raw = await fs.readFile(imported.asset.path);
    try {
      await fs.writeFile(imported.asset.path, 'corrupted external OBJ save');
      let rejected = false;
      try {
        await call('quickforge_export', { projectId: created.project.id });
      } catch (e) {
        rejected = /changed|re.import/i.test(String(e));
      }
      expect(rejected).toBe(true);
      expect(await hash(compiled.build.output)).toBe(outputHash);
      receipt.corruptSourceRejectedWithoutChangingGoodBuild = true;
    } finally {
      await fs.writeFile(imported.asset.path, raw);
    }
    expect(await hash(imported.asset.path)).toBe(imported.asset.sha256);
    expect(await hash(obj)).toBe(objHash);
    const restored = await call('quickforge_export', { projectId: created.project.id });
    expect(restored.status).toBe('exported');
    receipt.exactSourceRecoveryAndExport = true;
  }
  const expected = await saved();
  await open();
  await page.getByRole('button', { name: 'Objects & gameplay', exact: true }).click();
  expect((await saved()).scene).toEqual(expected.scene);
  expect((await saved()).quickForge).toEqual(expected.quickForge);
  receipt.reopenPreservesGeometryObjectsAndMaterials = true;
  receipt.pageErrors = errors;
  expect(errors).toEqual([]);
  receipt.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS native Workshop + object editor, OBJ import, material binding, End/history/reopen and production Halo build',
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
