// Opt-in real desktop/native IPC/geometry acceptance. No synthetic mesh or game proof.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 }),
  a = process.argv.slice(2);
if (a.length !== 3)
  throw Error('measure-workshop-native <built Spark exe> <fresh acceptance root> <source document.json>');
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
  const document = JSON.parse(await fs.readFile(path.resolve(a[2]), 'utf8')),
    room = document.workshop.brushes.find((b) => b.role === 'space');
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 5; y++)
      document.workshop.brushes.push({
        ...structuredClone(room),
        id: 'perf-' + x + '-' + y,
        name: 'Static test solid',
        role: 'solid',
        position: [22 + 2 * x, -4 + 2 * y, 0],
        rotation: [0, 0, 0],
        scale: [0.05, 0.05, 0.04],
      });
  receipt.documentSha256 = crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex');
  receipt.brushes = document.workshop.brushes.length;
  const samples = [];
  let triangles, coldMs;
  for (let i = 0; i < 31; i++) {
    const current = structuredClone(document);
    current.spawns[0].name = 'Authored source edit ' + i;
    const measured = await page.evaluate(async (document) => {
      const began = performance.now(),
        [mesh, report] = await Promise.all([
          window.__TAURI_INTERNALS__.invoke('quickforge_preview', { document }),
          window.__TAURI_INTERNALS__.invoke('quickforge_validate', { document }),
        ]);
      return {
        durationMs: performance.now() - began,
        previewTriangles: mesh.indices.length / 3,
        triangles: report.triangles,
        valid: report.valid,
      };
    }, current);
    expect(measured.valid).toBe(true);
    expect(measured.previewTriangles).toBe(measured.triangles);
    triangles = measured.triangles;
    if (i === 0) coldMs = measured.durationMs;
    else samples.push(measured.durationMs);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  Object.assign(receipt, {
    samplesMs: samples,
    coldMs,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    triangles,
    measurement:
      'WebView performance.now: concurrent real native preview + validation; full mesh remains inside WebView; one discarded cold sample; 30 warm samples',
    pageErrors: errors,
    complete: true,
  });
  expect(errors).toEqual([]);
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      coldMs,
      medianMs: receipt.medianMs,
      p95Ms: receipt.p95Ms,
      brushes: receipt.brushes,
      triangles,
    }),
  );
} catch (e) {
  receipt.error = String(e);
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(receipt, null, 2));
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
