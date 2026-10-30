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
    'test-bsp-workshop-native <built Spark exe> <fresh acceptance root> [H1A kit source-tags Invader]',
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
    title: 'BSP Workshop native UI',
    template: 'customBlank',
    target: 'mccSteam',
  });
  receipt.projectId = created.project.id;
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  await expect(page.locator('.bsp-view')).toHaveCount(4);
  await expect(page.locator('.bsp-workshop footer')).toContainText('4 editable volumes');
  await expect
    .poll(() =>
      page
        .locator('.bsp-workshop canvas')
        .evaluate((c) => (c.getContext('webgl2') ?? c.getContext('webgl'))?.getContextAttributes().antialias),
    )
    .toBe(true);
  const save = async () => {
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible();
  };
  const state = async () => (await call('open_project', { id: created.project.id })).project.quickForge;
  await save();
  await expect.poll(async () => !!(await state()).workshop).toBe(true);
  const original = await state();
  const valid = await call('quickforge_validate', { document: original });
  expect(valid.valid).toBe(true);
  await page.getByRole('button', { name: 'Maximize top', exact: true }).click();
  await expect(page.locator('.bsp-view')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore four views top', exact: true }).click();
  await expect(page.locator('.bsp-view')).toHaveCount(4);
  await page.locator('.bsp-source-list button').first().click();
  const position = page
    .locator('.bsp-source-fields fieldset')
    .filter({ has: page.locator('legend', { hasText: 'Position' }) })
    .first()
    .getByRole('spinbutton', { name: 'X', exact: true });
  // Scope exact first position field rather than similarly named rotation/scale controls.
  const x = page
    .locator('.bsp-source-fields .bsp-workshop-vector')
    .first()
    .getByRole('spinbutton', { name: 'X', exact: true });
  const axisBoxes=await page.locator('.bsp-source-fields .bsp-workshop-vector').first().getByRole('spinbutton').evaluateAll(inputs=>inputs.map(input=>{const r=input.getBoundingClientRect();return {x:r.x,y:r.y};}));
  expect(axisBoxes.length).toBe(3);expect(axisBoxes[1].x).toBeGreaterThan(axisBoxes[0].x);expect(axisBoxes[2].x).toBeGreaterThan(axisBoxes[1].x);expect(Math.max(...axisBoxes.map(p=>p.y))-Math.min(...axisBoxes.map(p=>p.y))).toBeLessThan(1);receipt.compactAxisRow=true;
  await x.fill('0.5');
  await x.press('Tab');
  await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  await save();
  await expect.poll(async () => (await state()).workshop.brushes[0].position[0]).toBe(0.5);
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue('0');
  await save();
  await expect.poll(async () => (await state()).workshop.brushes[0].position[0]).toBe(0);
  await page.keyboard.press('Control+y');
  await expect(x).toHaveValue('0.5');
  await page.keyboard.press('Control+z');
  await expect(x).toHaveValue('0');
  receipt.nativeTransformUndoRedo = true;
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  const top = page.getByLabel('top orthographic editing view'),
    box = await top.boundingBox();
  const world = (x, y) => ({
    x: box.x + ((x + 24) / 72) * box.width,
    y: box.y + ((18 - y) / 36) * box.height,
  });
  const lo = world(-10, -2),
    hi = world(-6, 2);
  await page.mouse.move(lo.x, lo.y);
  await page.mouse.down();
  await page.mouse.move(hi.x, hi.y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.bsp-workshop footer')).toContainText('5 editable volumes');
  await save();
  await expect.poll(async () => (await state()).workshop.brushes.length).toBe(5);
  receipt.orthographicBrushDrawing = true;
  await page.keyboard.press('Control+z');
  await expect(page.locator('.bsp-workshop footer')).toContainText('4 editable volumes');
  await page.locator('.bsp-source-list button').first().click();
  await page.getByRole('button', { name: 'Clip', exact: true }).click();
  await page.getByRole('button', { name: 'Clip and cap brush', exact: true }).click();
  await expect(page.locator('.bsp-source-fields[aria-busy="false"]')).toBeVisible();
  await save();
  await expect
    .poll(async () => (await state()).workshop.brushes[0].faces.some((f) => f.id.startsWith('cap-')))
    .toBe(true);
  receipt.clippedSourceRetained = true;
  await page.keyboard.press('Control+z');
  await save();
  await expect
    .poll(async () => (await state()).workshop.brushes[0].faces.some((f) => f.id.startsWith('cap-')))
    .toBe(false);
  // Invalid extrusion depth is rejected in the source controller, preserving the file.
  const before = await state(),
    bad = structuredClone(before);
  bad.workshop.brushes[0].faces[0].vertices.reverse();
  let refused = false;
  try {
    await call('quickforge_validate', { document: bad });
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
  expect((await state()).workshop).toEqual(before.workshop);
  receipt.invalidEditRefusedWithoutSourceMutation = true;
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
    await details.locator('summary').click();
    const portals = page
      .locator('.bsp-source-fields details')
      .filter({ has: page.locator('summary', { hasText: 'Doorway portal' }) });
    await portals.locator('summary').click();
    await page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
    await expect(page.locator('.bsp-workshop footer')).toContainText('1 authored portals');
    const doorX = page.getByRole('spinbutton', { name: 'Doorway X', exact: true });
    await doorX.fill('20');
    await doorX.press('Tab');
    await page.getByRole('button', { name: 'Add exact doorway portal', exact: true }).click();
    await expect(page.locator('.bsp-workshop footer')).toContainText('2 authored portals');
    await save();
    const started = Date.now();
    await expect(page.getByRole('button', { name: 'Build & check playtest', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Build & check playtest', exact: true }).click();
    await expect
      .poll(async () => (await call('quickforge_build_report', { projectId: created.project.id }))?.status, {
        timeout: 180000,
        intervals: [1000],
      })
      .toBe('validated');
    const compiled = await call('quickforge_build_report', { projectId: created.project.id });
    receipt.nativeBuild = { durationMs: Date.now() - started, ...compiled };
    const imported = await call('import_paths', { paths: [compiled.build.output] });
    const textureSource = imported.find((p) => p.inspection?.header.version === 13);
    expect(textureSource).toBeTruthy();
    receipt.compiledTextureSource = textureSource.project.source.sha256;
    await page.reload();
    await page
      .locator('.map-card')
      .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
      .click();
    const sources = page
      .locator('.bsp-source-fields details')
      .filter({ has: page.locator('summary', { hasText: 'Halo material paths & player starts' }) });
    await sources.locator('summary').click();
    await page
      .getByRole('combobox', { name: 'Workshop texture source', exact: true })
      .selectOption(textureSource.project.id);
    await expect(page.getByLabel('Native BSP Workshop')).toHaveAttribute('data-textures', '1', {
      timeout: 60000,
    });
    receipt.exactCompiledTextureRendered = true;
    await sources.locator('summary').click();
  }
  await page.screenshot({ path: path.join(root, 'workshop-four-views.png') });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  const final = await state();
  expect(final.workshop.brushes).toEqual(before.workshop.brushes);
  expect(final.workshop.portals.length).toBe(a.length === 5 ? 2 : 0);
  receipt.reopenPreservesTopology = true;
  receipt.geometry = valid;
  receipt.pageErrors = errors;
  expect(errors).toEqual([]);
  receipt.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    'PASS real Workshop four views, native geometry, history, clipping, corruption rejection and reopen',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  receipt.pageErrors = errors;
  await page?.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
