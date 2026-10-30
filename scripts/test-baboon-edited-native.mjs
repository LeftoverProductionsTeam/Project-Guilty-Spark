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
  const prepared = await call('baboon_prepare', { projectId: project.id, tagId: pistol.id });
  const dir = path.join(data, 'jobs', 'baboon-' + prepared.sessionId),
    tags = path.join(dir, 'HCEEK', 'tags'),
    file = path.join(tags, ...prepared.tag.split('/'));
  const before = await fs.readFile(file),
    editor = path.join(args.get('--invader'), 'invader-edit.exe');
  const get = () =>
    run(editor, ['-t', tags, '-G', 'bounding_radius', prepared.tag], { windowsHide: true, timeout: 10000 });
  const originalRadius = Number((await get()).stdout.trim()),
    expected = 0.5;
  const originalFields = (
    await run(editor, ['-t', tags, '-L', prepared.tag], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout
    .replaceAll('\r\n', '\n')
    .split('\n');
  const launched = await call('baboon_launch', { projectId: project.id, sessionId: prepared.sessionId });
  expect(launched.running).toBe(true);
  baboonPid = launched.processId;
  const ready = {
    projectId: project.id,
    sessionId: prepared.sessionId,
    tag: prepared.tag,
    pid: baboonPid,
    from: originalRadius,
    to: expected,
    output,
  };
  await fs.writeFile(path.join(output, 'ready-for-real-edit.json'), JSON.stringify(ready, null, 2));
  console.log('READY_FOR_REAL_EDIT', JSON.stringify(ready));
  await expect
    .poll(
      async () => {
        try {
          return (
            JSON.parse(await fs.readFile(path.join(output, 'manual-edited-confirmation.json'), 'utf8'))
              .editedSavedClosed === true
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
  expect(Number((await get()).stdout.trim())).toBeCloseTo(expected, 6);
  const editedFields = (
    await run(editor, ['-t', tags, '-L', prepared.tag], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout
    .replaceAll('\r\n', '\n')
    .split('\n');
  const fieldDifferences = Array.from(
    { length: Math.max(originalFields.length, editedFields.length) },
    (_, index) => ({ before: originalFields[index] ?? null, after: editedFields[index] ?? null }),
  ).filter((row) => row.before !== row.after);
  receipt.exposedFieldDifferences = fieldDifferences;
  expect(fieldDifferences).toHaveLength(1);
  expect(fieldDifferences[0].before).toContain('bounding_radius');
  expect(fieldDifferences[0].after).toContain('bounding_radius');
  let saved;
  await expect
    .poll(
      async () => {
        saved = await call('baboon_poll', { projectId: project.id, sessionId: prepared.sessionId });
        return saved.changes.status !== 'saving' && saved.integrity.pendingFiles === 0;
      },
      { timeout: 30000, intervals: [500, 1000] },
    )
    .toBe(true);
  if (saved.integrity.invalidFiles)
    throw Error(
      'Baboon saved a field value but failed native validation: ' + JSON.stringify(saved.integrity.findings),
    );
  const kept = await call('baboon_reconcile', { projectId: project.id, sessionId: prepared.sessionId });
  expect(kept.accepted).toBe(true);
  const began = performance.now(),
    jobId = await call('build_working_tags', { projectId: project.id, bspAudio: null });
  let built;
  await expect
    .poll(
      async () => {
        const state = await call('bootstrap'),
          failed = state.logs.find((e) => e.jobId === jobId && e.phase === 'failed');
        if (failed) throw Error(failed.message);
        built = (await call('open_project', { id: project.id })).project.builds.find((b) => b.id === jobId);
        return built?.status;
      },
      { timeout: 240000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  const reopened = await call('open_built_map', { projectId: project.id, buildId: built.id }),
    weapon = reopened.inspection.tags.find((t) => t.class === 'weap' && t.path === pistol.path),
    field = weapon?.fields.find((f) => f.label === 'Bounding radius' || f.key === 'bounding_radius');
  expect(field?.value).toBeCloseTo(expected, 6);
  expect(await readHash(path.join(dir, 'baseline', ...prepared.tag.split('/')))).toBe(hash(before));
  const journal = JSON.parse(await fs.readFile(path.join(dir, 'handoff.json'), 'utf8'));
  for (const [relative, expectedHash] of Object.entries(journal.initialBaseline))
    expect(await readHash(path.join(dir, 'baseline', ...relative.split('/')))).toBe(expectedHash);
  receipt.startingInventoryVerified = Object.keys(journal.initialBaseline).length;
  receipt.baboon = {
    version: installed.version,
    exeSha256: installed.executableSha256,
    humanEditedSavedClosed: true,
    field: 'bounding_radius',
    before: originalRadius,
    expected,
    compiled: field.value,
    nativeValidation: saved.integrity,
    nativeBuildMs: performance.now() - began,
  };
  receipt.reconciled = true;
  receipt.compiledSha256 = built.sha256;
  receipt.appSha256 = await readHash(exe);
  receipt.errors = errors;
  expect(errors).toEqual([]);
  await fs.writeFile(path.join(output, 'baboon-real-edit-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('PASS', JSON.stringify(receipt));
} catch (e) {
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(e), receipt, baboonPid, errors }, null, 2),
  );
  throw e;
} finally {
  if (!baboonPid) {
    if (call) await call('request_close_window').catch(() => {});
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }
}
