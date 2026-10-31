// Opt-in real desktop home-model check. Actual IPC, source pixels and native
// skeletal animation; no substitute model or mocked native content.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect as assertion } from '@playwright/test';
const expect = assertion.configure({ timeout: 120000 }),
  args = new Map();
for (let n = 2; n < process.argv.length; n += 2) args.set(process.argv[n], process.argv[n + 1]);
if (
  !args.get('--app') ||
  !args.get('--output') ||
  [...args.keys()].some((k) => !['--app', '--output', '--baseline'].includes(k))
)
  throw Error('Use --app built.exe --output fresh-directory [--baseline true]');
const output = path.resolve(args.get('--output'));
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-home-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), exe, fs.constants.COPYFILE_EXCL);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const receipt = {
  schemaVersion: 1,
  appSha256: hash(await fs.readFile(exe)),
  mockedIpc: false,
  complete: false,
  errors: [],
  baseline: args.has('--baseline'),
};
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const child = spawn(exe, [], {
  stdio: 'ignore',
  windowsHide: true,
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(output, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser, page;
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
  page.on('pageerror', (e) => receipt.errors.push(String(e)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, preferredHalo: 'mccSteam', autoBuild: false },
  });
  const at = performance.now();
  await page.reload();
  const preview = page.locator('.home-native-model .native-model-preview');
  await expect(page.locator('.home-model-caption')).toContainText('monitor');
  await expect(preview).toHaveAttribute('data-model-ready', 'true');
  await expect(preview).toHaveAttribute('data-model-textures', /^[1-9]\d*$/);
  await expect(preview).toHaveAttribute('data-model-reflections', /^[1-9]\d*$/);
  const canvas = preview.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.getAttribute('data-gs-animation')).not.toBeNull();
  receipt.coldMs = performance.now() - at;
  receipt.model = await preview.evaluate((e) => ({ ...e.dataset }));
  receipt.render = await canvas.evaluate((e) => ({
    width: e.width,
    height: e.height,
    cssWidth: e.getBoundingClientRect().width,
    cssHeight: e.getBoundingClientRect().height,
    environment: JSON.parse(e.dataset.gsEnvironment),
    effects: JSON.parse(e.dataset.gsRenderFeatures),
  }));
  const before = JSON.parse(await canvas.getAttribute('data-gs-animation'));
  await expect
    .poll(async () => JSON.parse(await canvas.getAttribute('data-gs-animation')).time)
    .toBeGreaterThan(before.time + 0.1);
  await page.mouse.move(5, 300);
  if (!receipt.baseline) {
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-gs-showcase-pose')) ?? '{}').yaw)
      .toBeLessThan(-0.9);
    await expect
      .poll(
        async () => JSON.parse((await canvas.getAttribute('data-gs-showcase-pose')) ?? '{}').screenHeading,
      )
      .toBeLessThan(-0.05);
    receipt.leftPose = JSON.parse(await canvas.getAttribute('data-gs-showcase-pose'));
    expect(receipt.render.width / receipt.render.cssWidth).toBeGreaterThanOrEqual(1.49);
    expect(receipt.render.effects.bloomStrength).toBeLessThan(0.15);
    expect(receipt.render.environment.sunIntensity).toBeLessThan(1.4);
  }
  await page.screenshot({ path: path.join(output, 'monitor-left.png') });
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width + 10, bounds.y + bounds.height / 2);
  if (!receipt.baseline) {
    await expect
      .poll(async () => JSON.parse((await canvas.getAttribute('data-gs-showcase-pose')) ?? '{}').yaw)
      .toBeGreaterThan(-0.2);
    receipt.rightPose = JSON.parse(await canvas.getAttribute('data-gs-showcase-pose'));
  }
  await page.screenshot({ path: path.join(output, 'monitor-right.png') });
  const navigation = page.getByRole('button', { name: 'Toggle workspace navigation', exact: true });
  await navigation.click();
  await page
    .locator('.gs-navigation-drawer')
    .getByRole('button', { name: 'Features & workflows', exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  const revisit = performance.now();
  await navigation.click();
  await page
    .locator('.gs-navigation-drawer')
    .getByRole('button', { name: 'Map library', exact: true })
    .click();
  await expect(preview).toHaveAttribute('data-model-ready', 'true');
  await expect(canvas).toBeVisible();
  receipt.revisitMs = performance.now() - revisit;
  expect(await preview.getAttribute('data-model-source-hash')).toBe(receipt.model.modelSourceHash);
  receipt.sameNativeSourceOnReturn = true;
  receipt.ipcCallCounts =
    'Not measured: the native invoke binding is immutable. Loading policy is tested separately.';
  expect(receipt.errors).toEqual([]);
  receipt.complete = true;
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      complete: true,
      baseline: receipt.baseline,
      coldMs: receipt.coldMs,
      revisitMs: receipt.revisitMs,
      model: receipt.model,
      render: receipt.render,
      leftPose: receipt.leftPose,
      rightPose: receipt.rightPose,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), receipt }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    const closed = once(child, 'exit');
    child.kill();
    await closed;
  }
}
