// Actual Director UI -> native reservation/chunks/publication -> independent video decode.
// Uses the visible named-take workflow. Does not drive the OS Save/capture pickers or a game.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { probeEditorCapture } from './native-editor-capture-probe.mjs';
const args = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--data', '--output', '--decoder'].includes(process.argv[n]) ||
    !process.argv[n + 1] ||
    args.has(process.argv[n])
  )
    throw Error('Provide unique named paths');
  args.set(process.argv[n], process.argv[n + 1]);
}
if (args.size !== 4)
  throw Error(
    'Required: --app built.exe --data fresh-recording-fixture --output fresh-dir --decoder ffmpeg.exe',
  );
const data = path.resolve(args.get('--data')),
  output = path.resolve(args.get('--output')),
  decoder = path.resolve(args.get('--decoder'));
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-recording-fixture.json'), 'utf8'));
if (!fixture.nativeFixture || fixture.schemaVersion !== 1)
  throw Error('Use qa_recording_library with an owned map');
await fs.mkdir(output);
const takes = path.join(output, 'takes');
await fs.mkdir(takes);
const executable = path.join(output, 'GuiltySpark-recording-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), executable, fs.constants.COPYFILE_EXCL);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const appSha256 = hash(await fs.readFile(executable)),
  decoderSha256 = hash(await fs.readFile(decoder));
const run = promisify(execFile),
  decoderVersion = (await run(decoder, ['-version'], { windowsHide: true, timeout: 10000 })).stdout
    .split('\n')[0]
    .trim();
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
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
let browser, page, director, call, request, detached;
const errors = [];
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
      { timeout: 15000 },
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.setDefaultTimeout(25000);
  page.on('pageerror', (error) => errors.push(String(error)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  await expect(page.getByTestId('viewport')).toBeVisible();
  await expect
    .poll(() => page.locator('.world-layout').getAttribute('data-material-loading'), {
      timeout: 120000,
      intervals: [1000],
    })
    .toBe('false');
  const original = (await call('open_project', { id: fixture.projectId })).project;
  expect(hash(await fs.readFile(original.source.preservedPath))).toBe(fixture.sourceSha256);
  await page.getByRole('button', { name: 'Recording Director ↗', exact: true }).click();
  await expect
    .poll(
      () =>
        browser
          .contexts()
          .flatMap((c) => c.pages())
          .some((p) => p.url().includes('?director=')),
      { timeout: 30000 },
    )
    .toBe(true);
  director = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('?director='));
  director.setDefaultTimeout(25000);
  director.on('pageerror', (error) => errors.push(String(error)));
  request = (command, args = {}) =>
    director.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
      command,
      args,
    });
  detached = (await call('director_session', { projectId: fixture.projectId })).window;
  await expect(director.locator('canvas')).toBeVisible();
  await expect
    .poll(async () => Number(await director.locator('.world-layout').getAttribute('data-source-shaders')), {
      timeout: 120000,
      intervals: [1000],
    })
    .toBeGreaterThan(10);
  await expect
    .poll(() => director.locator('.world-layout').getAttribute('data-material-loading'), {
      timeout: 120000,
      intervals: [1000],
    })
    .toBe('false');
  let wrongWindowRejected = false;
  try {
    await call('director_record_open', {
      projectId: fixture.projectId,
      outputDirectory: takes,
      fileName: 'wrong-window.webm',
    });
  } catch (error) {
    wrongWindowRejected = /Director/.test(String(error));
  }
  expect(wrongWindowRejected).toBe(true);
  let traversalRejected = false;
  try {
    await request('director_record_open', {
      projectId: fixture.projectId,
      outputDirectory: takes,
      fileName: '../escape.webm',
    });
  } catch (error) {
    traversalRejected = /relative|filename|Unsafe/.test(String(error));
  }
  expect(traversalRejected).toBe(true);
  await director.getByLabel('Frame rate', { exact: true }).selectOption('24');
  await director.getByLabel('Render width', { exact: true }).selectOption('1920');
  await director.getByLabel('Quality', { exact: true }).selectOption('6000000');
  const summary = director.locator('.gs-director-output > summary');
  await summary.click();
  await director.getByRole('textbox', { name: 'Recording folder', exact: true }).fill(takes);
  await director.getByRole('textbox', { name: 'Next take filename', exact: true }).fill('cancelled.webm');
  await director.getByLabel('Countdown', { exact: true }).selectOption('3');
  await summary.click();
  await director.getByRole('button', { name: 'Record video…', exact: true }).click();
  await expect(director.locator('.gs-director-message')).toContainText('Recording in 3');
  expect((await call('director_session', { projectId: fixture.projectId })).recording).toBe(true);
  await director.getByRole('button', { name: 'Cancel recording', exact: true }).click();
  await expect(director.getByRole('button', { name: 'Record video…', exact: true })).toBeEnabled();
  await expect
    .poll(async () => (await fs.readdir(takes)).filter((f) => f.endsWith('.partial')).length)
    .toBe(0);
  expect(await fs.readdir(takes)).toEqual([]);
  expect((await call('director_session', { projectId: fixture.projectId })).recording).toBe(false);
  await summary.click();
  await director.getByRole('textbox', { name: 'Next take filename', exact: true }).fill('accepted-take.webm');
  await director.getByLabel('Countdown', { exact: true }).selectOption('0');
  await summary.click();
  const dimensions = await director.locator('canvas').evaluate((c) => ({ width: c.width, height: c.height }));
  expect(dimensions.width).toBe(1920);
  const reference = await director.locator('canvas').evaluate((c) => c.toDataURL('image/png'));
  await fs.writeFile(
    path.join(output, 'source-before-take.png'),
    Buffer.from(reference.split(',')[1], 'base64'),
    { flag: 'wx' },
  );
  await director.getByRole('button', { name: 'Record video…', exact: true }).click();
  await expect(director.locator('.gs-director-message')).toContainText('Recording to');
  await expect.poll(() => director.locator('nav output').innerText()).toMatch(/^recording · [1-9]/);
  let closeBlocked = false;
  try {
    await request('director_window', { projectId: fixture.projectId, action: 'dock', monitor: null });
  } catch (error) {
    closeBlocked = /recording/i.test(String(error));
  }
  expect(closeBlocked).toBe(true);
  await director.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(director.locator('nav output')).toContainText('paused');
  const paused = await director.locator('nav output').textContent();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(await director.locator('nav output').textContent()).toBe(paused);
  await director.getByRole('button', { name: 'Resume', exact: true }).click();
  await director.getByRole('button', { name: 'Hide interface', exact: true }).click();
  await expect(director.locator('.gs-director-window')).toHaveClass(/gs-director-clean/);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await director.keyboard.press('Escape');
  await call('plugin:window|set_focus', { label: 'main' });
  await expect.poll(() => request('plugin:window|is_focused', { label: detached })).toBe(false);
  await expect.poll(() => director.locator('nav output').innerText()).toMatch(/^recording · [3-9]/);
  await director.getByRole('button', { name: 'Stop & save', exact: true }).click();
  await expect(director.locator('.gs-director-message')).toContainText('Saved ', { timeout: 45000 });
  const movie = path.join(takes, 'accepted-take.webm'),
    bytes = await fs.readFile(movie),
    movieSha256 = hash(bytes),
    savedMessage = await director.locator('.gs-director-message').innerText();
  expect(savedMessage).toContain(movieSha256);
  expect((await call('director_session', { projectId: fixture.projectId })).recording).toBe(false);
  await summary.click();
  const nextName = await director
    .getByRole('textbox', { name: 'Next take filename', exact: true })
    .inputValue();
  expect(nextName).not.toBe('accepted-take.webm');
  await director.getByRole('textbox', { name: 'Next take filename', exact: true }).fill('accepted-take.webm');
  await summary.click();
  await director.getByRole('button', { name: 'Record video…', exact: true }).click();
  await expect(director.locator('.gs-director-message')).toContainText(
    'existing files are never overwritten',
  );
  expect(hash(await fs.readFile(movie))).toBe(movieSha256);
  await director.screenshot({ path: path.join(output, 'native-recording-saved.png') });
  const decode = await run(
    decoder,
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      movie,
      '-fps_mode',
      'passthrough',
      '-f',
      'null',
      '-',
      '-progress',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  );
  const fields = Object.fromEntries(
    decode.stdout
      .trim()
      .split(/\r?\n/)
      .filter((s) => s.includes('='))
      .map((s) => s.split('=')),
  );
  const geometry = await run(
    decoder,
    [
      '-nostdin',
      '-hide_banner',
      '-i',
      movie,
      '-vf',
      'showinfo',
      '-fps_mode',
      'passthrough',
      '-f',
      'null',
      '-',
    ],
    { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  );
  const decodedFrameSizes = [
    ...new Set([...geometry.stderr.matchAll(/\bs:(\d+x\d+)/g)].map((match) => match[1])),
  ];
  expect(decodedFrameSizes).toEqual([`${dimensions.width}x${dimensions.height}`]);
  const first = await run(
    decoder,
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      movie,
      '-frames:v',
      '1',
      '-vf',
      'scale=128:72',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024, encoding: 'buffer' },
  );
  expect(first.stdout.length).toBe(128 * 72 * 3);
  const image = first.stdout;
  let sum = 0,
    squared = 0;
  for (let n = 0; n < image.length; n += 3) {
    const luma = (image[n] + image[n + 1] + image[n + 2]) / 3;
    sum += luma;
    squared += luma * luma;
  }
  const count = image.length / 3,
    deviation = Math.sqrt(squared / count - (sum / count) ** 2);
  expect(deviation).toBeGreaterThan(2);
  await run(
    decoder,
    [
      '-nostdin',
      '-v',
      'error',
      '-i',
      movie,
      '-frames:v',
      '1',
      '-n',
      path.join(output, 'first-decoded-frame.png'),
    ],
    { windowsHide: true, timeout: 30000 },
  );
  const browserProbe = await probeEditorCapture(director);
  expect(browserProbe.metadata.decoded).toBe(true);
  await fs.writeFile(
    path.join(output, 'presentation-probe.webm'),
    Buffer.from(browserProbe.encoded.split(',')[1], 'base64'),
    { flag: 'wx' },
  );
  const after = (await call('open_project', { id: fixture.projectId })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge'])
    expect(JSON.parse(JSON.stringify(after[key] ?? null))).toEqual(
      JSON.parse(JSON.stringify(original[key] ?? null)),
    );
  expect(hash(await fs.readFile(original.source.preservedPath))).toBe(fixture.sourceSha256);
  expect(hash(await fs.readFile(original.source.originalPath))).toBe(fixture.sourceSha256);
  expect((await fs.readdir(takes)).filter((f) => f.endsWith('.partial'))).toHaveLength(0);
  const preferenceKey = 'guilty-spark-map-session-v1:' + fixture.projectId;
  await fs.writeFile(
    path.join(output, 'preferences-before-dock.json'),
    JSON.stringify(
      {
        main: await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
        director: await director.evaluate((key) => localStorage.getItem(key), preferenceKey),
      },
      null,
      2,
    ),
  );
  await request('director_window', { projectId: fixture.projectId, action: 'dock', monitor: null });
  await expect.poll(() => director.isClosed()).toBe(true);
  const again = await call('director_popout', { projectId: fixture.projectId });
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
  request = (command, args = {}) =>
    director.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
      command,
      args,
    });
  detached = again.window;
  await director.locator('.gs-director-output > summary').click();
  await expect(director.getByRole('textbox', { name: 'Recording folder', exact: true })).toHaveValue(takes);
  const receipt = {
    schemaVersion: 1,
    nativeDesktop: true,
    appSha256,
    sourceSha256: fixture.sourceSha256,
    nativeUiRecordAndSave: true,
    explicitNamedTakeWorkflow: true,
    osSavePickerTested: false,
    osCapturePickerTested: false,
    countdownCancellationRemovesEmptyPartial: true,
    pausedClockStable: true,
    backgroundRecording: true,
    cleanViewToggledDuringTake: true,
    closeBlockedWhileRecording: closeBlocked,
    existingTakeProtected: true,
    wrongWindowRejected,
    traversalRejected,
    folderRememberedAfterReopen: true,
    freshNameAfterSuccess: true,
    videoOnly: true,
    requestedFps: 24,
    dimensions,
    decodedFrameSizes,
    bytes: bytes.length,
    sha256: movieSha256,
    decoderSha256,
    decoderVersion,
    decodedFrames: Number(fields.frame),
    decodedSeconds: Number(fields.out_time_us) / 1000000,
    firstDecodedLumaMean: sum / count,
    firstDecodedLumaDeviation: deviation,
    browserPresentationProbe: browserProbe.metadata,
    sourcePreserved: true,
    authoredDocumentPreserved: true,
    gameLaunched: false,
    gameplayAccepted: false,
    errors,
  };
  expect(receipt.decodedFrames).toBeGreaterThan(24);
  await fs.writeFile(
    path.join(output, 'native-director-recording-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(JSON.stringify(receipt));
  if (errors.length) throw Error(errors.join('; '));
} catch (error) {
  if (director && !director.isClosed()) {
    await director.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await fs
      .writeFile(path.join(output, 'failure-ui.txt'), await director.locator('body').innerText())
      .catch(() => {});
  }
  throw error;
} finally {
  if (director && !director.isClosed() && call)
    await call('plugin:window|close', { label: detached }).catch(() => {});
  if (call) await call('close_application').catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([new Promise((r) => child.once('exit', r)), new Promise((r) => setTimeout(r, 5000))]);
    if (child.exitCode === null) child.kill();
  }
}
