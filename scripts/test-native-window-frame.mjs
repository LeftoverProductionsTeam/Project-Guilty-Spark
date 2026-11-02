// Actual WebView/Tauri title-bar events and OS maximize state. No mocked IPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, expect as assertion } from '@playwright/test';
const expect = assertion.configure({ timeout: 45000 }),
  args = process.argv.slice(2);
if (args.length !== 2) throw Error('test-native-window-frame <built Spark.exe> <fresh-root>');
const [app, root] = args.map((p) => path.resolve(p));
await fs.mkdir(root);
const exe = path.join(root, 'GuiltySpark-window-qa.exe');
await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
const report = {
  schemaVersion: 1,
  applicationSha256: crypto
    .createHash('sha256')
    .update(await fs.readFile(exe))
    .digest('hex'),
  mockedIpc: false,
  complete: false,
  errors: [],
};
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(root, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser;
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
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (e) => report.errors.push(String(e)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false },
  });
  await page.reload();
  const header = page.locator('#gs-window-header');
  await expect(header).toBeVisible();
  report.restored = await page.locator('.application').evaluate((e) => {
    const box = e.getBoundingClientRect(),
      style = getComputedStyle(e);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      viewport: [innerWidth, innerHeight],
      margin: style.margin,
      borderRadius: style.borderRadius,
    };
  });
  // Symmetric top/left headroom lets the source-derived monitor protrude
  // beyond the curved application without crossing native window bounds.
  expect(report.restored.x).toBe(16);
  expect(report.restored.y).toBe(16);
  expect(report.restored.width).toBe(report.restored.viewport[0]-16);
  expect(report.restored.height).toBe(report.restored.viewport[1]-16);
  expect(report.restored.borderRadius).not.toBe('0px');
  expect(await call('plugin:window|is_maximized')).toBe(false);
  const point = await header.evaluate((e) => {
    const box = e.getBoundingClientRect();
    for (let x = box.width / 3; x < box.width - 300; x += 10) {
      const target = document.elementFromPoint(box.x + x, box.y + box.height / 2);
      if (
        target &&
        e.contains(target) &&
        !target.closest('button,a,input,select,textarea,[role="button"],[role="tab"]')
      )
        return { x, y: box.height / 2 };
    }
    throw Error('No unoccupied title-bar surface');
  });
  await header.dblclick({ position: point, delay: 70 });
  await expect.poll(() => call('plugin:window|is_maximized')).toBe(true);
  report.doubleClickMaximized = true;
  await expect.poll(()=>page.locator('.application').evaluate(e=>{const r=e.getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;})).toBe(true);
  await page.getByRole('button', { name: 'Restore window', exact: true }).click();
  await expect.poll(() => call('plugin:window|is_maximized')).toBe(false);
  // Same documented framework route, independent of the restored window size.
  await header.dispatchEvent('mousedown', { button: 0, detail: 2, bubbles: true, cancelable: true });
  await expect.poll(() => call('plugin:window|is_maximized')).toBe(true);
  await header.dispatchEvent('mousedown', { button: 0, detail: 2, bubbles: true, cancelable: true });
  await expect.poll(() => call('plugin:window|is_maximized')).toBe(false);
  report.frameworkDoubleClickRoundTrip = true;
  expect(await page.getByRole('button', { name: 'Close window', exact: true }).count()).toBe(1);
  expect(report.errors).toEqual([]);
  await page.screenshot({ path: path.join(root, 'curved-frame.png'), omitBackground: true });
  const config = JSON.parse(await fs.readFile('src-tauri/tauri.conf.json', 'utf8'));
  expect(config.app.windows[0].shadow).toBe(false);
  report.nativeShadowEnabledInSource = config.app.windows[0].shadow;
  report.osCompositeVisualVerification = false;
  report.complete = true;
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
  await browser?.close();
  if (child.exitCode === null) child.kill();
}
