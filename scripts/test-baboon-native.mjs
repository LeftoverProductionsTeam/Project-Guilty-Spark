// Opt-in native test. Requires approved Baboon installation and an isolated QA library.
// A human checks the real Baboon window; automation controls only Spark's own test API.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const args = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--data', '--output', '--kit', '--invader', '--baboon'].includes(process.argv[n]) ||
    !process.argv[n + 1] ||
    args.has(process.argv[n])
  )
    throw Error('Provide unique app/data/output/kit/invader/baboon arguments.');
  args.set(process.argv[n], path.resolve(process.argv[n + 1]));
}
if (args.size !== 6) throw Error('All six named arguments are required.');
const data = args.get('--data'),
  output = args.get('--output');
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
if (!fixture.nativeFixture || fixture.schemaVersion !== 1)
  throw Error('Only an explicit private replica is accepted.');
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-baboon-qa.exe');
await fs.copyFile(args.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readHash = async (p) => hash(await fs.readFile(p));
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(exe, [], {
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
let browser, call, baboonPid;
const run = promisify(execFile),
  errors = [];
const receipt = {
  schemaVersion: 1,
  nativeDesktop: true,
  gameLaunched: false,
  gameMemoryTouched: false,
  gameplayAccepted: false,
};
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
      { timeout: 20000 },
    )
    .toBe(true);
  const page = browser
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
      preferredHalo: 'mccSteam',
      hekDirectory: args.get('--kit'),
      hekFlavor: 'h1aEk',
      invaderDirectory: args.get('--invader'),
    },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  await call('claim_project_document', { id: fixture.projectId });
  const project = (await call('open_project', { id: fixture.projectId })).project;
  const parent = project.builds.find((b) => b.id === fixture.workingBuildId);
  receipt.parentSha256 = await readHash(parent.output);
  const compiled = await call('open_built_map', { projectId: project.id, buildId: parent.id });
  const pistol = compiled.inspection.tags.find(
    (t) => t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/pistol/pistol'),
  );
  if (!pistol) throw Error('Fixture needs the real native pistol dependency.');
  const installed = await call('baboon_register', { directory: args.get('--baboon') });
  receipt.installed = {
    version: installed.version,
    exeSha256: installed.executableSha256,
    definitionsSha256: installed.definitionsSha256,
  };
  const started = performance.now();
  const prepared = await call('baboon_prepare', { projectId: project.id, tagId: pistol.id });
  receipt.preparationMs = performance.now() - started;
  receipt.preparedFiles = prepared.files;
  const handoff = path.join(data, 'jobs', `baboon-${prepared.sessionId}`),
    tags = path.join(handoff, 'HCEEK', 'tags');
  const selected = path.join(tags, ...prepared.tag.split('/'));
  const before = await fs.readFile(selected),
    baselineHash = hash(before);
  receipt.tag = prepared.tag;
  const launched = await call('baboon_launch', { projectId: project.id, sessionId: prepared.sessionId });
  expect(launched.running).toBe(true);
  baboonPid = launched.processId;
  const ready = {
    projectId: project.id,
    sessionId: prepared.sessionId,
    tag: prepared.tag,
    pid: baboonPid,
    output,
    request:
      'Confirm the real Baboon window opened pistol.weapon; save without changing values, then close it. Write manual-confirmation.json only after human confirmation.',
  };
  await fs.writeFile(path.join(output, 'ready-for-human.json'), JSON.stringify(ready, null, 2));
  console.log('READY_FOR_HUMAN', JSON.stringify(ready));
  await expect
    .poll(
      async () => {
        try {
          return (
            JSON.parse(await fs.readFile(path.join(output, 'manual-confirmation.json'), 'utf8'))
              .openedSavedClosed === true
          );
        } catch {
          return false;
        }
      },
      { timeout: 3600000, intervals: [2000] },
    )
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId })).running,
      { timeout: 30000 },
    )
    .toBe(false);
  baboonPid = null;
  receipt.baboonHumanConfirmed = true;
  receipt.baboonNoOpByteIdentical = (await readHash(selected)) === baselineHash;
  if (!receipt.baboonNoOpByteIdentical)
    throw Error('Baboon no-op changed native bytes; review before accepting a supported edit.');
  const editor = path.join(args.get('--invader'), 'invader-edit.exe');
  const current = Number(
    (
      await run(editor, ['-t', tags, '-G', 'bounding_radius', prepared.tag], {
        windowsHide: true,
        timeout: 30000,
      })
    ).stdout.trim(),
  );
  expect(current).toBeCloseTo(before.readFloatBE(68), 6);
  const expected = current + 0.125;
  const editStarted = performance.now();
  await run(editor, ['-t', tags, '-S', 'bounding_radius', String(expected), prepared.tag], {
    windowsHide: true,
    timeout: 30000,
  });
  await expect
    .poll(
      async () => {
        const p = await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId });
        return p.changes.status === 'changed' ? p.changes.changedFiles : 0;
      },
      { timeout: 25000, intervals: [250, 750, 1500] },
    )
    .toBe(1);
  receipt.externalDetectionMs = performance.now() - editStarted;
  const changed = await fs.readFile(selected);
  const spans = [
    [40, 44],
    [68, 72],
  ];
  expect(changed.length).toBe(before.length);
  const otherChangedBytes = [];
  for (let n = 0; n < before.length; n++)
    if (changed[n] !== before[n] && !spans.some(([a, b]) => n >= a && n < b)) otherChangedBytes.push(n);
  receipt.supportedEdit = {
    writer: 'Invader',
    field: 'bounding_radius',
    before: current,
    expected,
    unrelatedBytesPreserved: otherChangedBytes.length === 0,
    otherChangedBytes,
    scope:
      'Whole external file accepted as a new revision. Writer-side byte normalization is measured, never presented as byte-preserving.',
  };
  // Deliberately damage only this owned QA copy, then restore the exact saved bytes.
  const damaged = Buffer.from(changed);
  damaged[damaged.length - 1] ^= 1;
  await fs.writeFile(selected, damaged);
  await expect
    .poll(
      async () =>
        (await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId })).integrity
          ?.invalidFiles ?? 0,
      { timeout: 25000, intervals: [250, 1000] },
    )
    .toBe(1);
  const invalidSave = await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId });
  expect(invalidSave.writerContext).toContain('actual writer unconfirmed');
  let integrityRejected = false;
  try {
    await call('baboon_reconcile', { projectId: project.id, sessionId: prepared.sessionId });
  } catch (e) {
    integrityRejected = String(e).includes('integrity');
  }
  expect(integrityRejected).toBe(true);
  await fs.writeFile(selected, changed);
  await expect
    .poll(
      async () => {
        const p = await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId });
        return p.changes.status !== 'saving' && (p.integrity?.invalidFiles ?? 0) === 0;
      },
      { timeout: 25000, intervals: [250, 1000] },
    )
    .toBe(true);
  receipt.liveCorruption = {
    crcFailureDetected: true,
    reconciliationBlocked: true,
    restoredBytesAccepted: true,
    writerContext: invalidSave.writerContext,
    actualTestWriter: 'QA Node process; no OS writer attribution is claimed',
  };
  const accepted = await call('baboon_reconcile', { projectId: project.id, sessionId: prepared.sessionId });
  expect(accepted.accepted).toBe(true);
  expect(await readHash(path.join(accepted.source, ...prepared.tag.split('/')))).toBe(hash(changed));
  expect(await readHash(path.join(handoff, 'baseline', ...prepared.tag.split('/')))).toBe(baselineHash);
  receipt.reconciled = true;
  let blocked = false;
  try {
    await call('quickforge_build', { projectId: project.id });
  } catch (e) {
    blocked = String(e).includes('retained native tag revisions');
  }
  expect(blocked).toBe(true);
  receipt.regenerationProtected = true;
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  const panel = page.locator('.baboon-tools').last();
  if (await panel.count()) await panel.locator('summary').first().click();
  await page.screenshot({ path: path.join(output, 'native-baboon-working-revision.png') });
  const buildStarted = performance.now();
  const jobId = await call('build_working_tags', { projectId: project.id, bspAudio: null });
  let built;
  await expect
    .poll(
      async () => {
        const state = await call('bootstrap');
        const failure = state.logs.find((l) => l.jobId === jobId && l.phase === 'failed');
        if (failure) throw Error(failure.message);
        built = (await call('open_project', { id: project.id })).project.builds.find((b) => b.id === jobId);
        return built?.status;
      },
      { timeout: 240000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  receipt.nativeBuildMs = performance.now() - buildStarted;
  receipt.compiledSha256 = built.sha256;
  const rebuilt = await call('open_built_map', { projectId: project.id, buildId: built.id });
  const newPistol = rebuilt.inspection.tags.find((t) => t.class === 'weap' && t.path === pistol.path);
  expect(newPistol).toBeTruthy();
  const newSource = path.join(data, 'jobs', jobId, 'workspace', 'tags', ...prepared.tag.split('/'));
  expect(await readHash(newSource)).toBe(hash(changed));
  receipt.compiledNativeTagRetained = true;
  await call('baboon_restore_start', { projectId: project.id, sessionId: prepared.sessionId });
  const restored = await call('working_tag_watch_start', { projectId: project.id });
  expect(await readHash(path.join(restored.tagsDirectory, ...prepared.tag.split('/')))).toBe(baselineHash);
  receipt.restoredStartingSource = true;
  const after = (await call('open_project', { id: project.id })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge']) expect(after[key]).toEqual(project[key]);
  expect(await readHash(parent.output)).toBe(receipt.parentSha256);
  expect(await readHash(selected)).toBe(hash(changed));
  receipt.originalProjectPreserved = true;
  receipt.parentCachePreserved = true;
  receipt.externalSourceRetained = true;
  receipt.errors = errors;
  expect(errors).toEqual([]);
  receipt.appSha256 = await readHash(exe);
  await fs.writeFile(path.join(output, 'native-baboon-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('PASS', JSON.stringify(receipt));
} catch (e) {
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(e), receipt, errors, baboonPid }, null, 2),
  );
  throw e;
} finally {
  // Never kill an external editor with potentially unsaved work.
  if (!baboonPid) {
    if (call) await call('request_close_window').catch(() => {});
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }
}
