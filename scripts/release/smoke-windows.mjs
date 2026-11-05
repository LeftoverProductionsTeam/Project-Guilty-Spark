import { assertQaOutputPath } from '../native-qa-storage.mjs';
// Real packaged WebView2 + native IPC. A fresh isolated library, no Halo required.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const [application, commit, output] = process.argv.slice(2);
if (process.platform !== 'win32' || !application || !/^[a-f0-9]{40}$/.test(commit ?? '') || !output)
  throw Error('smoke-windows <packaged executable> <full source commit> <fresh evidence directory>');
const app = path.resolve(application),
  root = path.resolve(output);
await fs.mkdir(await assertQaOutputPath(root), { recursive: false });
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
const version = JSON.parse(await fs.readFile('package.json')).version;
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const launchedAt = performance.now();
const child = spawn(app, [], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  cwd: path.dirname(app),
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(root, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
  },
});
let browser;
const errors = [],
  chunks = [],
  receipt = {
    schemaVersion: 1,
    sourceCommit: commit,
    applicationVersion: version,
    executableSha256: hash(await fs.readFile(app)),
    mockedIpc: false,
    complete: false,
    platform: 'windows-x64',
    checks: [],
  };
for (const stream of [child.stdout, child.stderr]) stream.on('data', (b) => chunks.push(b));
try {
  await expect
    .poll(
      () =>
        fetch(`http://127.0.0.1:${port}/json/version`).then(
          (r) => r.ok,
          () => false,
        ),
      { timeout: 90000 },
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
  page.on('pageerror', (e) => errors.push(String(e)));
  await expect(page.locator('.application')).toBeVisible({ timeout: 90000 });
  receipt.windowShellMs = performance.now() - launchedAt;
  const boot = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('bootstrap'));
  receipt.nativeBootstrapMs = performance.now() - launchedAt;
  if (!boot?.settings || !Array.isArray(boot.entries))
    throw Error('Native bootstrap did not return a real library');
  const nativeVersion = boot.applicationVersion;
  if (nativeVersion !== version) throw Error('Packaged native version differs from source');
  // A visible shell and successful IPC do not prove that lazy workspace chunks loaded.
  await expect(page.getByText('Loading workspace…', { exact: true })).toBeHidden({ timeout: 90000 });
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 90000 });
  receipt.workspaceReadyMs = performance.now() - launchedAt;
  receipt.workspaceReady = true;
  receipt.checks.push('initial workspace finished loading and its heading is visible');
  receipt.checks.push(
    'native window and frontend visible',
    'native bootstrap returned',
    'native application version matches',
  );
  const scripts = await page.locator('script[src]').evaluateAll((nodes) => nodes.map((n) => n.src));
  const cdp = await page.context().newCDPSession(page),
    parsed = [];
  cdp.on('Debugger.scriptParsed', (e) => parsed.push(e));
  await cdp.send('Debugger.enable');
  if (!scripts.length) throw Error('No packaged frontend scripts');
  for (const url of scripts) {
    const entry = parsed.find((e) => e.url === url);
    if (!entry) throw Error('Packaged frontend source unavailable');
    const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId: entry.scriptId });
    const file = path.join('dist', new URL(url).pathname.replace(/^\//, ''));
    if (hash(scriptSource) !== hash(await fs.readFile(file)))
      throw Error('Portable frontend differs from this build');
  }
  await cdp.detach();
  receipt.checks.push('embedded frontend bytes match build');
  await page.screenshot({ path: path.join(root, 'startup.png') });
  await page.waitForTimeout(1500);
  if (errors.length) throw Error(errors.join('\n'));
  receipt.complete = true;
} finally {
  receipt.errors = errors;
  await fs.writeFile(path.join(root, 'startup.json'), JSON.stringify(receipt, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'process.log'), Buffer.concat(chunks));
  await browser?.close();
  child.kill();
}
