// Opt-in owned-source C36 acceptance. Fresh libraries, native UI, real H1A Tool.
// No game launch, public joining, SDK-master edit or installation.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 60000 }),
  args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  if (
    ![
      '--app',
      '--baseline-app',
      '--source',
      '--mcc',
      '--sdk',
      '--kit',
      '--invader',
      '--output',
      '--compile',
    ].includes(process.argv[at]) ||
    !process.argv[at + 1] ||
    args.has(process.argv[at])
  )
    throw Error('Use unique named arguments');
  args.set(process.argv[at], process.argv[at + 1]);
}
if (args.size !== 9 || args.get('--compile') !== 'true')
  throw Error(
    'Required: --app built.exe --baseline-app frozen-C35.exe --source owned-CE.map --mcc owned-MCC.map --sdk verified-editable-tags --kit HCEEK --invader Invader --output fresh-directory --compile true',
  );
const output = path.resolve(args.get('--output')),
  source = path.resolve(args.get('--source')),
  mcc = path.resolve(args.get('--mcc')),
  sdk = path.resolve(args.get('--sdk')),
  kit = path.resolve(args.get('--kit')),
  invader = path.resolve(args.get('--invader')),
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex'),
  before = { source: hash(await fs.readFile(source)), mcc: hash(await fs.readFile(mcc)) },
  receipt = {
    schemaVersion: 1,
    checks: {},
    errors: [],
    sourceSha256: before.source,
    mccSha256: before.mcc,
    gameLaunched: false,
    gameMemoryTouched: false,
  };
await fs.mkdir(output);
const median = (rows) => [...rows].sort((a, b) => a - b)[Math.floor(rows.length / 2)];
async function launch(input, name) {
  const root = path.join(output, name);
  await fs.mkdir(root);
  const executable = path.join(root, 'GuiltySpark-qa.exe');
  await fs.copyFile(path.resolve(input), executable, fs.constants.COPYFILE_EXCL);
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const child = spawn(executable, [], {
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GUILTY_SPARK_DATA_DIR: path.join(root, 'library'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  await fs.writeFile(path.join(root, 'owned-process.json'), JSON.stringify({ pid: child.pid, port }));
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      invaderDirectory: invader,
    },
  });
  return { root, child, browser, page, call, errors, appSha256: hash(await fs.readFile(executable)) };
}
async function benchmark(app) {
  const start = performance.now(),
    opened = (await app.call('import_paths', { paths: [mcc] }))[0],
    coldImportMs = performance.now() - start;
  const openMs = [],
    compatibilityMs = [];
  for (let i = 0; i < 5; i++) {
    let start = performance.now();
    const value = await app.call('open_project', { id: opened.project.id });
    openMs.push(performance.now() - start);
    if (value.inspection.sha256 !== before.mcc) throw Error('Benchmark source identity changed');
    start = performance.now();
    await app.call('compatibility', { id: opened.project.id });
    compatibilityMs.push(performance.now() - start);
  }
  return {
    appSha256: app.appSha256,
    sourceSha256: before.mcc,
    coldImportMs,
    warmOpenProjectMs: openMs,
    compatibilityMs,
    medianWarmOpenMs: median(openMs),
    medianCompatibilityMs: median(compatibilityMs),
    scope:
      'Same owned MCC fixture; fresh library/profile per executable; 5 warm IPC samples. Cold import includes preservation copy and inspection; these are observations, not a general speedup claim.',
  };
}
let baseline,
  app,
  building = false,
  buildCompleted = false;
try {
  baseline = await launch(args.get('--baseline-app'), 'baseline');
  receipt.checks.baselinePerformance = await benchmark(baseline);
  await baseline.browser.close();
  baseline.child.kill();
  baseline = null;
  app = await launch(args.get('--app'), 'current');
  receipt.appSha256 = app.appSha256;
  receipt.checks.currentPerformance = await benchmark(app);
  const { page, call } = app,
    opened = (await call('import_paths', { paths: [source] }))[0];
  expect(opened.inspection.header.version).toBe(609);
  expect(opened.inspection.sha256).toBe(before.source);
  await call('claim_project_document', { id: opened.project.id });
  const noop = await call('verify_native_preservation', { projectId: opened.project.id });
  expect(noop.byteIdentical).toBe(true);
  const tag = opened.inspection.tags.find(
    (tag) =>
      tag.class === 'weap' &&
      tag.fields.some((field) => field.key === 'bounding-radius' && field.kind === 'f32'),
  );
  if (!tag) throw Error('Fixture needs a real editable weapon bounding radius');
  const field = tag.fields.find((field) => field.key === 'bounding-radius'),
    value = field.value + 0.125;
  const targetId = crypto.randomUUID();
  const authored = {
    ...opened.project,
    title: 'C36 Portability QA',
    conversionProfile: 'mcc-multiplayer-ui',
    tagEdits: [...opened.project.tagEdits, { tagId: tag.id, fieldKey: field.key, value }],
    buildTargets: [
      {
        id: targetId,
        name: 'C36 native MCC proof',
        runtimeId: 'mccSteam',
        builder: 'h1a-tool',
        hekDirectory: kit,
        hekFlavor: 'h1aEk',
        tagsDirectory: sdk,
        invaderDirectory: invader,
        ceCompatibleTagset: false,
        openSauce: false,
      },
    ],
    activeBuildTarget: targetId,
  };
  await call('save_project', { project: authored });
  const edited = await call('verify_native_preservation', { projectId: authored.id });
  expect(edited.untouchedBytesPreserved).toBe(true);
  expect(edited.changedBytes).toBeGreaterThan(0);
  expect(edited.changedBytes).toBeLessThanOrEqual(4);
  receipt.checks.nativePreservation = {
    noop,
    edited,
    tagPath: tag.path,
    field: field.key,
    before: field.value,
    after: value,
  };
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: authored.title, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await page
    .locator('.gs-navigation-drawer')
    .getByRole('button', { name: 'Build & playtest', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Portability Lab', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Halo Custom Edition', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Halo Xbox (preservation)', exact: true }).check();
  await page.getByRole('button', { name: 'Inspect portability', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Halo Custom Edition', exact: true })).toBeVisible();
  await expect(page.getByText('Model tags require an explicit conversion', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Verify untouched native bytes', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Untouched native bytes are preserved', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save JSON & readable report', exact: true }).click();
  await expect(
    page.getByText('Reports saved in this project’s portability-reports folder.', { exact: false }),
  ).toBeVisible();
  const reportRoot = path.join(app.root, 'library', 'projects', authored.id, 'portability-reports'),
    reportFolders = await fs.readdir(reportRoot),
    reportFolder = path.join(reportRoot, reportFolders[0]);
  const report = JSON.parse(await fs.readFile(path.join(reportFolder, 'portability.json'), 'utf8'));
  expect(report.sourceSha256).toBe(before.source);
  expect(report.targets.map((t) => t.profile.profileId)).toEqual([
    'halo1-mcc-steam',
    'halo1-custom-edition',
    'halo1-xbox',
  ]);
  expect(await fs.readFile(path.join(reportFolder, 'portability.md'), 'utf8')).toContain(
    'Model tags require an explicit conversion',
  );
  receipt.checks.lab = {
    profiles: report.targets.map((t) => ({
      id: t.profile.profileId,
      cacheFamilyMatches: t.cacheFamilyMatches,
      findings: t.findings.map((f) => f.code),
      buildReady: t.buildPreflight?.ready,
    })),
    jsonAndMarkdownSaved: true,
    noConversionOnInspect: true,
  };
  expect((await call('open_project', { id: authored.id })).project.builds).toHaveLength(0);
  await page.screenshot({ path: path.join(output, 'portability-lab.png') });
  await page.getByRole('button', { name: 'MCC build workflow', exact: true }).click();
  const convert = page.getByRole('button', { name: 'Convert map to MCC', exact: true });
  await expect(convert).toBeEnabled();
  const started = performance.now();
  await convert.click();
  building = true;
  let completed;
  await expect
    .poll(
      async () => {
        const p = (await call('open_project', { id: authored.id })).project;
        completed = p.builds[0];
        return completed?.status === 'failed' || completed?.status === 'cancelled'
          ? 'failed'
          : completed?.status === 'validated'
            ? 'done'
            : 'pending';
      },
      { timeout: 600000, intervals: [1000, 2000, 3000] },
    )
    .not.toBe('pending');
  buildCompleted = true;
  if (completed.status !== 'validated') throw Error('Actual native conversion failed: ' + completed.message);
  receipt.checks.conversion = {
    elapsedMs: performance.now() - started,
    buildId: completed.id,
    sha256: completed.sha256,
    status: completed.status,
    target: completed.target,
  };
  const job = path.join(app.root, 'library', 'jobs', completed.id),
    workspace = job;
  const semantic = JSON.parse(await fs.readFile(path.join(job, 'semantic-changes.json'), 'utf8'));
  const tagProof = JSON.parse(
    await fs.readFile(path.join(workspace, 'native-tag-preservation.json'), 'utf8'),
  );
  expect(semantic.sourceCacheVersion).toBe(609);
  expect(semantic.targetCacheVersion).toBe(13);
  expect(tagProof.allInputTagBytesUnchanged).toBe(true);
  expect(
    semantic.fieldChanges.some(
      (change) =>
        change.tagPath.toLowerCase() === tag.path.toLowerCase() &&
        change.field === field.key &&
        Math.abs(change.after - value) < 0.00001,
    ),
  ).toBe(true);
  expect(await fs.readFile(path.join(job, 'semantic-changes.md'), 'utf8')).toContain(
    'Native Halo semantic change report',
  );
  receipt.checks.nativeTagCompilation = tagProof;
  receipt.checks.semanticDiff = {
    sourceCacheVersion: semantic.sourceCacheVersion,
    targetCacheVersion: semantic.targetCacheVersion,
    unchangedAuditedFields: semantic.unchangedAuditedFields,
    fieldChangeCount: semantic.fieldChangeCount,
    unpairedAuditedFields: semantic.unpairedAuditedFields,
    missingTagCount: semantic.missingTagCount,
    addedTagCount: semantic.addedTagCount,
    controlledFieldVerified: true,
    readableAndMachineReports: true,
    scope: semantic.scope,
  };
  await page.getByRole('tab', { name: 'Portability Lab', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Portability comparison build', exact: true })
    .selectOption(completed.id);
  await page.getByRole('button', { name: 'Compare semantic changes', exact: true }).click();
  await expect(
    page.getByText(`${semantic.unchangedAuditedFields.toLocaleString()} unchanged inspected fields`, {
      exact: false,
    }),
  ).toBeVisible();
  const comparison = await call('compare_portability', { projectId: authored.id, buildId: completed.id });
  expect(comparison.targetSha256).toBe(completed.sha256);
  await expect(
    call('compare_portability', { projectId: authored.id, buildId: crypto.randomUUID() }),
  ).rejects.toBeTruthy();
  receipt.checks.ownedBuildComparison = { ui: true, unknownBuildRejected: true };
  await page.screenshot({ path: path.join(output, 'semantic-comparison.png') });
  expect(hash(await fs.readFile(source))).toBe(before.source);
  expect(hash(await fs.readFile(mcc))).toBe(before.mcc);
  expect(app.errors).toEqual([]);
  receipt.originalsUnchanged = true;
  receipt.errors = app.errors;
  receipt.limitations = [
    'Native compiler/cache and Spark editor acceptance only; no Halo runtime load, gameplay, multiplayer or AI agreement.',
    'Semantic diff covers inspected fields; compiled repacking is not byte identity. Native tag proof covers compiler input files only.',
    'Private source audio/images/cache/SDK data stay in the fresh QA library; no proprietary files belong in the source package.',
  ];
  await fs.writeFile(path.join(output, 'native-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify({
      appSha256: receipt.appSha256,
      conversion: receipt.checks.conversion,
      semantic: receipt.checks.semanticDiff,
      nativeTagFiles: tagProof.nativeFiles,
      originalsUnchanged: true,
      errors: [],
    }),
  );
} catch (error) {
  receipt.failure = String(error);
  if (app?.page) await app.page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify(receipt, null, 2) + '\n');
  throw error;
} finally {
  await baseline?.browser.close();
  baseline?.child.kill();
  await app?.browser.close();
  if (app && (!building || buildCompleted)) app.child.kill();
  else if (app)
    console.log(
      'QA application retained to avoid interrupting an active native tag-writing job; inspect owned-process.json.',
    );
}
