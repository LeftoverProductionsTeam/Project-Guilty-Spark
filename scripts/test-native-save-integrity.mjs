// Native save-integrity acceptance using an isolated QA library and approved tools.
// This test does not launch Baboon. Its human GUI acceptance is recorded separately.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
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
const exe = path.join(output, 'GuiltySpark-save-integrity-qa.exe');
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

  await call('baboon_register', { directory: args.get('--baboon') });
  const prepared = await call('baboon_prepare', { projectId: project.id, tagId: pistol.id });
  const sessionRoot = path.join(data, 'jobs', 'baboon-' + prepared.sessionId),
    tags = path.join(sessionRoot, 'HCEEK', 'tags'),
    relative = prepared.tag;
  const tag = path.join(tags, ...relative.split('/')),
    starting = await fs.readFile(tag),
    startingHash = hash(starting);
  const edit = path.join(args.get('--invader'), 'invader-edit.exe'),
    editOptions = { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 };
  const fields = (root) => run(edit, ['-t', root, '-L', relative], editOptions).then((r) => r.stdout);
  const beforeFields = await fields(tags),
    radius = Number(
      (await run(edit, ['-t', tags, '-G', 'bounding_radius', relative], editOptions)).stdout.trim(),
    );
  await run(edit, ['-t', tags, '-S', 'bounding_radius', String(radius), relative], editOptions);
  const normalized = await fs.readFile(tag);
  expect(hash(normalized)).not.toBe(startingHash);
  expect(await fields(tags)).toBe(beforeFields);
  let observation;
  const observed = async (id = prepared.sessionId) => {
    observation = await call('baboon_poll', { projectId: project.id, sessionId: id });
    return observation;
  };
  await expect
    .poll(async () => (await observed()).integrity.equivalentFieldFiles, {
      timeout: 30000,
      intervals: [500, 1500],
    })
    .toBe(1);
  expect(observation.integrity.invalidFiles).toBe(0);
  expect(observation.writerEvidence.writerConfidence).toBe('unknown');
  expect(observation.writerEvidence.associations[0].tool).toBe('Baboon');
  expect(observation.writerEvidence.associations[0].processId).toBeNull();
  expect(observation.writerEvidence.associations[0].executableSha256).toHaveLength(64);
  expect(observation.writerEvidence.files[0].observedSha256).toBe(hash(normalized));
  const normalizedAccepted = await call('baboon_reconcile', {
    projectId: project.id,
    sessionId: prepared.sessionId,
  });
  expect(normalizedAccepted.accepted).toBe(true);
  receipt.normalization = {
    changedBytes: Array.from(starting).filter((v, n) => normalized[n] !== v).length,
    exposedFieldsEquivalent: true,
    acceptedAsEquivalent: true,
    scope: 'Pinned Invader field-output comparison; opaque bytes/unprinted precision are not certified.',
  };
  const malformed = Buffer.from(normalized),
    reference = malformed.indexOf(Buffer.from('mod2'), 64);
  if (reference < 64 || malformed.readUInt32BE(reference + 8) > 1024)
    throw Error('Canonical model reference is unavailable');
  malformed.writeUInt32BE(0x7fffffff, reference + 8);
  malformed.writeUInt32BE(~zlib.crc32(malformed.subarray(64)) >>> 0, 40);
  await fs.writeFile(path.join(output, 'controlled-malformed-tag.weapon'), malformed);
  await fs.writeFile(tag, malformed);
  await expect
    .poll(async () => (await observed()).integrity.invalidFiles, { timeout: 30000, intervals: [500, 1500] })
    .toBe(1);
  expect(
    observation.integrity.findings.some((f) => f.detail.includes('Invader') && f.detail.includes('rejected')),
  ).toBe(true);
  let rejected = false;
  try {
    await call('baboon_reconcile', { projectId: project.id, sessionId: prepared.sessionId });
  } catch (e) {
    rejected = String(e).includes('integrity');
  }
  expect(rejected).toBe(true);
  expect(await readHash(path.join(normalizedAccepted.source, ...relative.split('/')))).toBe(hash(normalized));
  await page.getByRole('tab', { name: fixture.title, exact: true }).click();
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  const panel = page.locator('.baboon-tools').last();
  if ((await panel.getAttribute('open')) === null) await panel.locator('summary').first().click();
  await panel.getByRole('button', { name: 'Recheck', exact: true }).click();
  await expect(panel).toContainText('Verified 0.3.2');
  await expect(panel).toContainText('Native save failed integrity checks', { timeout: 15000 });
  await page.screenshot({ path: path.join(output, 'native-semantic-rejection.png') });
  await page.getByRole('button', { name: 'Close runtime details', exact: true }).click();
  receipt.semanticCorruption = {
    validChecksum: true,
    invalidDependencyLength: true,
    detectedByNativeParser: true,
    reconciliationRejected: true,
    writerContext: observation.writerContext,
    writerEvidence: observation.writerEvidence,
    actualControlledWriter: 'QA Node process, intentionally malformed fixture; not Baboon or Invader',
  };
  const crcBad = Buffer.from(normalized);
  crcBad[crcBad.length - 1] ^= 1;
  await fs.writeFile(tag, crcBad);
  await expect
    .poll(async () => (await observed()).integrity.findings.some((f) => f.detail.includes('CRC')), {
      timeout: 30000,
      intervals: [500, 1500],
    })
    .toBe(true);
  receipt.crcFailureDetected = true;
  await call('baboon_restore_start', { projectId: project.id, sessionId: prepared.sessionId });
  const restored = await call('working_tag_watch_start', { projectId: project.id });
  expect(await readHash(path.join(restored.tagsDirectory, ...relative.split('/')))).toBe(startingHash);
  expect(await readHash(tag)).toBe(hash(crcBad)); // damaged evidence remains, recovery is a new source
  receipt.recovery = {
    startingBytesRestored: true,
    damagedExternalEvidenceRetained: true,
    priorAcceptedSourceIntact: true,
  };
  const next = await call('baboon_prepare', { projectId: project.id, tagId: pistol.id });
  const nextRoot = path.join(data, 'jobs', 'baboon-' + next.sessionId),
    nextTags = path.join(nextRoot, 'HCEEK', 'tags'),
    nextTag = path.join(nextTags, ...relative.split('/'));
  const expected = radius + 0.125,
    editStarted = performance.now();
  await run(edit, ['-t', nextTags, '-S', 'bounding_radius', String(expected), relative], editOptions);
  await expect
    .poll(async () => (await observed(next.sessionId)).integrity.changedFieldFiles, {
      timeout: 30000,
      intervals: [500, 1500],
    })
    .toBe(1);
  expect(observation.integrity.invalidFiles).toBe(0);
  receipt.validEditDetectionMs = performance.now() - editStarted;
  const accepted = await call('baboon_reconcile', { projectId: project.id, sessionId: next.sessionId });
  expect(accepted.accepted).toBe(true);
  const savedHash = await readHash(nextTag);
  expect(await readHash(path.join(accepted.source, ...relative.split('/')))).toBe(savedHash);
  const buildStarted = performance.now(),
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
  receipt.nativeBuildMs = performance.now() - buildStarted;
  const reopened = await call('open_built_map', { projectId: project.id, buildId: built.id }),
    weapon = reopened.inspection.tags.find((t) => t.class === 'weap' && t.path === pistol.path);
  const field = weapon?.fields.find((f) => f.label === 'Bounding radius' || f.key === 'bounding_radius');
  if (!field) throw Error('Native compiled radius field missing');
  expect(field.value).toBeCloseTo(expected, 6);
  const originalAfter = (await call('open_project', { id: project.id })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge']) expect(originalAfter[key]).toEqual(project[key]);
  const journal = JSON.parse(await fs.readFile(path.join(nextRoot, 'handoff.json'), 'utf8'));
  for (const [name, expectedHash] of Object.entries(journal.initialBaseline))
    expect(await readHash(path.join(nextRoot, 'baseline', ...name.split('/')))).toBe(expectedHash);
  expect(await readHash(parent.output)).toBe(receipt.parentSha256);
  expect(await readHash(path.join(data, 'jobs', jobId, 'workspace', 'tags', ...relative.split('/')))).toBe(
    savedHash,
  );
  receipt.validEdit = {
    writer: 'Invader',
    toolSha256: await readHash(edit),
    field: 'bounding_radius',
    before: radius,
    expected,
    compiled: field.value,
    reconciled: true,
    nativeCompiled: true,
    compiledTagBytesPreserved: true,
  };
  receipt.nativeRecoveryInventoryVerified = Object.keys(journal.initialBaseline).length;
  receipt.compiledSha256 = built.sha256;
  receipt.appSha256 = await readHash(exe);
  receipt.errors = errors;
  expect(errors).toEqual([]);
  await page.getByRole('tab', { name: fixture.title, exact: true }).click();
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open working-tags build', exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Open working-tags build', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  receipt.compiledMapOpenedInSeparateTab = true;
  await page.screenshot({ path: path.join(output, 'native-valid-edit-compiled.png') });
  await fs.writeFile(
    path.join(output, 'native-save-integrity-receipt.json'),
    JSON.stringify(receipt, null, 2),
  );
  console.log('PASS', JSON.stringify(receipt));
} catch (e) {
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(e), receipt, errors }, null, 2),
  );
  throw e;
} finally {
  if (call) await Promise.race([
    call('request_close_window').catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]);
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
