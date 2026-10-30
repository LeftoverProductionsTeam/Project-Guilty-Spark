// Opt-in real Windows/Invader/Tool acceptance. Requires a fresh owned QA replica.
// No synthetic result, game launch, public upload or original-source write.
import { chromium, expect as playwrightExpect } from '@playwright/test';
const expect = playwrightExpect.configure({ timeout: 45000 });
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const args = new Map();
for (let n = 2; n < process.argv.length; n += 2) {
  if (
    !['--app', '--data', '--output', '--kit', '--invader', '--baboon', '--legacy'].includes(
      process.argv[n],
    ) ||
    !process.argv[n + 1] ||
    args.has(process.argv[n])
  )
    throw Error('Use unique app/data/output/kit/invader/baboon/legacy arguments');
  args.set(process.argv[n], path.resolve(process.argv[n + 1]));
}
if (args.size !== 7) throw Error('All seven named arguments are required');
const data = args.get('--data'),
  output = args.get('--output'),
  fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8')),
  seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
if (
  !fixture.nativeFixture ||
  fixture.schemaVersion !== 1 ||
  fixture.projectId !== seed.projectId ||
  path.resolve(seed.library) !== data
)
  throw Error('Only an explicit isolated QA replica is accepted');
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-native-operations-qa.exe');
await fs.copyFile(args.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  readHash = async (file) => hash(await fs.readFile(file));
async function inventory(root) {
  const rows = {};
  async function visit(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('QA source contains a link');
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else rows[path.relative(root, file).replaceAll('\\', '/')] = await readHash(file);
    }
  }
  await visit(root);
  return rows;
}
const run = promisify(execFile),
  edit = path.join(args.get('--invader'), 'invader-edit.exe');
async function setField(tags, tag, key, value) {
  return run(edit, ['-t', tags, '-S', key, String(value), tag], { windowsHide: true, timeout: 15000 });
}
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
let browser, call, page;
const errors = [];
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
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.setDefaultTimeout(30000);
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
  await call('baboon_register', { directory: args.get('--baboon') });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  await call('claim_project_document', { id: fixture.projectId });
  const original = (await call('open_project', { id: fixture.projectId })).project;
  const projectId = original.id,
    parent = original.builds.find((b) => b.id === fixture.workingBuildId);
  receipt.parentSha256 = await readHash(parent.output);
  const sourceBefore = await call('runtime_workbench_report', { runtimeId: 'mccSteam', projectId }),
    originalRoot = sourceBefore.workingSource.tagsDirectory;
  const inventoryBefore = await inventory(originalRoot);
  receipt.originalNativeFiles = Object.keys(inventoryBefore).length;
  const catalogBegan = performance.now(),
    catalog = await call('tool_ecosystem_report', { runtimeId: 'mccSteam', projectId });
  receipt.toolDiscoveryMs = performance.now() - catalogBegan;
  for (const id of ['baboon', 'invaderNative', 'invaderDependency', 'invaderRepair'])
    expect(catalog.tools.find((t) => t.definition.id === id).assessment.canUseWorkflow).toBe(true);
  for (const runtimeId of ['haloCustomEdition', 'haloPc', 'macDemo', 'haloXbox']) {
    const report = await call('tool_ecosystem_report', { runtimeId, projectId });
    expect(report.tools.find((t) => t.definition.id === 'baboon').assessment.canUseWorkflow).toBe(false);
  }
  const imported = await call('import_paths', { paths: [args.get('--legacy')] }),
    legacy = imported.find((p) => p.project.source?.cacheVersion !== 13);
  if (!legacy) throw Error('An actual legacy cache is required');
  const legacyReport = await call('tool_ecosystem_report', {
    runtimeId: 'mccSteam',
    projectId: legacy.project.id,
  });
  expect(legacyReport.context.ownedNativeTags).toBe(false);
  expect(legacyReport.tools.find((t) => t.definition.id === 'baboon').assessment.state).toBe(
    'sourceUnsupported',
  );
  receipt.sourceAwareProfiles = {
    runtimes: 5,
    legacyCacheVersion: legacy.project.source.cacheVersion,
    installedBaboonRefusesLegacyCache: true,
    researchProfilesCannotExecute: catalog.tools
      .filter((t) => t.definition.integration === 'upstreamOnly')
      .every((t) => !t.assessment.canUseWorkflow),
  };
  const tags = await call('native_tag_inventory', { projectId }),
    pistol = tags.find(
      (t) => t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/pistol/pistol'),
    ),
    other = tags.find(
      (t) =>
        t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/assault rifle/assault rifle'),
    ),
    flare = tags.find((t) => t.class === 'lens');
  if (!pistol || !other || !flare)
    throw Error('Fixture requires real pistol, assault rifle and lens flare tags');
  const tagId = pistol.id;
  const model = tags.find((t) => t.class === 'mod2' && t.path === pistol.path);
  if (!model) throw Error('Fixture requires the native pistol render model');
  const initial = await call('native_tag_context', { projectId, tagId });
  expect(initial.boundingRadius).toBeCloseTo(0.1, 6);
  const dependencyBegan = performance.now(),
    dependencies = await call('native_dependency_check', { projectId, tagId: model.id });
  receipt.dependencyMs = performance.now() - dependencyBegan;
  expect(dependencies.complete).toBe(true);
  expect(dependencies.dependencies.length).toBeGreaterThan(5);
  const missing = dependencies.dependencies.find((d) => d.path.endsWith('.bitmap'));
  if (!missing) throw Error('A real bitmap dependency is needed');
  const missingPath = path.join(originalRoot, ...missing.path.split('/'));
  await fs.rename(missingPath, missingPath + '.qa-held');
  try {
    const incomplete = await call('native_dependency_check', { projectId, tagId: model.id });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.dependencies.some((d) => !d.present || d.reportedBroken)).toBe(true);
    receipt.missingDependencyRejected = true;
  } finally {
    await fs.rename(missingPath + '.qa-held', missingPath);
  }
  receipt.dependencies = {
    count: dependencies.dependencies.length,
    tool: dependencies.tool,
    sha256: dependencies.executableSha256,
  };
  const nav = page.locator('.gs-navigation-drawer');
  if (!(await nav.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await nav.getByRole('button', { name: 'Tag editor', exact: true }).click();
  const panel = page.locator('.native-tag-operations').first();
  await panel.locator('summary').first().click();
  await panel.getByRole('combobox', { name: 'Native tag', exact: true }).selectOption(String(tagId));
  await expect(panel.getByRole('spinbutton', { name: 'Native bounding radius', exact: true })).toHaveValue(
    '0.1',
  );
  await panel.getByRole('spinbutton', { name: 'Native bounding radius', exact: true }).fill('0.35');
  const previewBegan = performance.now();
  await panel.getByRole('button', { name: 'Preview radius edit', exact: true }).click();
  await expect(panel.locator('[aria-label="Native edit preview"]')).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Accept as new source revision', exact: true }),
  ).toBeEnabled();
  receipt.previewMs = performance.now() - previewBegan;
  let preview = (await call('native_tag_context', { projectId, tagId })).history[0];
  expect(preview.fieldChanges).toHaveLength(1);
  expect(await inventory(originalRoot)).toEqual(inventoryBefore);
  const candidate = path.join(
      data,
      'jobs',
      'invader-' + preview.id,
      'candidate',
      'tags',
      ...preview.tag.split('/'),
    ),
    candidateBytes = await fs.readFile(candidate);
  const damaged = Buffer.from(candidateBytes);
  damaged[damaged.length - 1] ^= 1;
  await fs.writeFile(candidate, damaged);
  try {
    await expect(
      call('native_operation_accept', { projectId, operationId: preview.id, restore: false }),
    ).rejects.toThrow(/changed/);
    receipt.tamperedCandidateRejected = true;
  } finally {
    await fs.writeFile(candidate, candidateBytes);
  }
  const watchBefore = await call('working_tag_watch_start', { projectId }),
    acceptBegan = performance.now();
  await panel.getByRole('button', { name: 'Accept as new source revision', exact: true }).click();
  await expect
    .poll(async () => (await call('native_tag_context', { projectId, tagId })).boundingRadius)
    .toBeCloseTo(0.35, 6);
  receipt.acceptMs = performance.now() - acceptBegan;
  let selected = await call('native_tag_context', { projectId, tagId });
  expect(selected.tagsDirectory).not.toBe(originalRoot);
  const watchAfter = await call('working_tag_watch_start', { projectId });
  expect(watchAfter.watchId).not.toBe(watchBefore.watchId);
  receipt.sourceWatcherRebound = true;
  const otherPath = other.path.replaceAll('\\', '/') + '.weapon';
  await setField(selected.tagsDirectory, otherPath, 'bounding_radius', 0.7);
  const independentHash = await readHash(path.join(selected.tagsDirectory, ...otherPath.split('/')));
  await panel.getByRole('button', { name: 'Restore before-edit tag', exact: true }).click();
  await expect
    .poll(async () => (await call('native_tag_context', { projectId, tagId })).boundingRadius)
    .toBeCloseTo(0.1, 6);
  selected = await call('native_tag_context', { projectId, tagId });
  expect(await readHash(path.join(selected.tagsDirectory, ...otherPath.split('/')))).toBe(independentHash);
  receipt.recoveryPreservesIndependentNativeEdit = true;
  await panel.getByRole('button', { name: 'Accept as new source revision', exact: true }).click();
  await expect
    .poll(async () => (await call('native_tag_context', { projectId, tagId })).boundingRadius)
    .toBeCloseTo(0.35, 6);
  selected = await call('native_tag_context', { projectId, tagId });
  const flareContext = await call('native_tag_context', { projectId, tagId: flare.id });
  const flareBefore = await fs.readFile(path.join(selected.tagsDirectory, ...flareContext.tag.split('/')));
  await setField(selected.tagsDirectory, flareContext.tag, 'rotation_function_scale', 360);
  const badFlare = await call('native_tag_context', { projectId, tagId: flare.id });
  expect(badFlare.canRepair).toBe(true);
  const repair = await call('native_operation_preview', {
    projectId,
    tagId: flare.id,
    operation: { kind: 'lensFlareScaleRepair' },
  });
  expect(repair.fieldChanges).toHaveLength(1);
  await call('native_operation_accept', { projectId, operationId: repair.id, restore: false });
  expect((await call('native_tag_context', { projectId, tagId: flare.id })).lensFlareScale).toBe(0);
  receipt.lensFlareRepair = {
    controlledLegacyStyleValue: 360,
    repairedNativeValue: 0,
    writer: 'Reviewed Invader bludgeon',
    exposedFieldChanges: repair.fieldChanges,
  };
  await expect(
    call('native_operation_preview', {
      projectId,
      tagId: flare.id,
      operation: { kind: 'lensFlareScaleRepair' },
    }),
  ).rejects.toThrow(/already matches|precondition/);
  receipt.nonMatchingRepairRefused = true;
  const handoff = await call('baboon_prepare', { projectId, tagId }),
    handoffRoot = path.join(data, 'jobs', 'baboon-' + handoff.sessionId, 'HCEEK', 'tags');
  selected = await call('native_tag_context', { projectId, tagId });
  expect(await readHash(path.join(handoffRoot, ...handoff.tag.split('/')))).toBe(
    await readHash(path.join(selected.tagsDirectory, ...handoff.tag.split('/'))),
  );
  await setField(handoffRoot, handoff.tag, 'bounding_radius', 0.45);
  let observation;
  await expect
    .poll(
      async () => {
        observation = await call('baboon_poll', { projectId, sessionId: handoff.sessionId });
        return (
          observation.changes.status !== 'saving' &&
          observation.changes.changedFiles === 1 &&
          observation.integrity.pendingFiles === 0
        );
      },
      { timeout: 30000, intervals: [500, 1000] },
    )
    .toBe(true);
  expect(observation.integrity.invalidFiles).toBe(0);
  const reconciled = await call('baboon_reconcile', { projectId, sessionId: handoff.sessionId });
  expect(reconciled.accepted).toBe(true);
  selected = await call('native_tag_context', { projectId, tagId });
  expect(selected.boundingRadius).toBeCloseTo(0.45, 6);
  expect(selected.tagsDirectory).toContain('baboon-');
  const final = await call('native_operation_preview', {
    projectId,
    tagId,
    operation: { kind: 'boundingRadius', value: 0.55 },
  });
  await call('native_operation_accept', { projectId, operationId: final.id, restore: false });
  selected = await call('native_tag_context', { projectId, tagId });
  expect(selected.boundingRadius).toBeCloseTo(0.55, 6);
  expect(selected.tagsDirectory).toContain('invader-');
  receipt.baboonInteroperation = {
    preparedFromAcceptedInvaderSource: true,
    files: handoff.files,
    controlledWriter: 'Invader in the Baboon fork; no fresh Baboon GUI edit is claimed',
    laterBaboonRevisionSupersedesInvader: true,
    nextInvaderRevisionUsesBaboonSource: true,
  };
  await expect(call('quickforge_build', { projectId })).rejects.toThrow(/native|working/i);
  await expect(call('quickforge_export', { projectId })).rejects.toThrow(/native|working/i);
  receipt.destructiveRegenerationAndExportProtected = true;
  const geometry = path.join(output, 'external-geometry.jms');
  const { exportMeshJms } = await import('../src/haloJms.ts');
  const mesh = {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 0, 1],
    parts: [{ name: 'geometry', indexStart: 0, indexCount: 3 }],
    label: 'owned QA geometry',
    source: 'obj',
  };
  await fs.writeFile(geometry, exportMeshJms(mesh).text);
  const geometryBefore = await readHash(geometry);
  mesh.positions[3] = 1.25;
  await fs.writeFile(geometry, exportMeshJms(mesh).text);
  expect(await readHash(geometry)).not.toBe(geometryBefore);
  receipt.externalGeometry = {
    realJmsVertexChanged: true,
    protectedConflict: true,
    generalGeometryImportNotImplemented: true,
  };
  const selectedInventory = await inventory(selected.tagsDirectory),
    buildBegan = performance.now(),
    jobId = await call('build_working_tags', { projectId, bspAudio: null });
  await expect(
    call('native_operation_accept', { projectId, operationId: final.id, restore: true }),
  ).rejects.toThrow(/build/);
  receipt.sourceCannotChangeDuringBuild = true;
  let built;
  await expect
    .poll(
      async () => {
        const boot = await call('bootstrap'),
          failed = boot.logs.find((e) => e.jobId === jobId && e.phase === 'failed');
        if (failed) throw Error(failed.message);
        built = (await call('open_project', { id: projectId })).project.builds.find((b) => b.id === jobId);
        return built?.status;
      },
      { timeout: 240000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  receipt.nativeBuildMs = performance.now() - buildBegan;
  const reopened = await call('open_built_map', { projectId, buildId: jobId }),
    compiledPistol = reopened.inspection.tags.find((t) => t.class === 'weap' && t.path === pistol.path),
    compiledRadius = compiledPistol?.fields.find(
      (f) => f.label === 'Bounding radius' || f.key === 'bounding_radius',
    );
  expect(compiledRadius?.value).toBeCloseTo(0.55, 6);
  expect(await inventory(path.join(data, 'jobs', jobId, 'workspace', 'tags'))).toEqual(selectedInventory);
  expect(await inventory(originalRoot)).toEqual(inventoryBefore);
  expect(await readHash(parent.output)).toBe(receipt.parentSha256);
  const current = (await call('open_project', { id: projectId })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge']) expect(current[key]).toEqual(original[key]);
  receipt.nativeCompilation = {
    compiledRadius: compiledRadius.value,
    sha256: built.sha256,
    allInputTagsByteIdentical: true,
    files: Object.keys(selectedInventory).length,
    sourceAndDraftUnchanged: true,
  };
  const restored = await call('native_operation_accept', { projectId, operationId: final.id, restore: true });
  expect(restored.restored).toBe(true);
  expect((await call('native_tag_context', { projectId, tagId })).boundingRadius).toBeCloseTo(0.45, 6);
  expect(await readHash(built.output)).toBe(built.sha256);
  receipt.recoveryAfterCompilation = true;
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name: 'Tag editor', exact: true }).click();
  const reopenedPanel = page.locator('.native-tag-operations').first();
  await reopenedPanel.locator('summary').first().click();
  await reopenedPanel.getByRole('combobox', { name: 'Native tag', exact: true }).selectOption(String(tagId));
  await expect(
    reopenedPanel.getByRole('combobox', { name: 'Retained native previews', exact: true }),
  ).toBeVisible();
  receipt.retainedHistoryAfterUiReload = true;
  for (const size of [
    { width: 1500, height: 950 },
    { width: 1024, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.screenshot({ path: path.join(output, `native-tools-${size.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  receipt.errors = errors;
  expect(errors).toEqual([]);
  receipt.appSha256 = await readHash(exe);
  await fs.writeFile(path.join(output, 'native-operations-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log('PASS native operations', JSON.stringify(receipt));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ ...receipt, error: String(error), stack: error.stack }, null, 2),
  );
  throw error;
} finally {
  if (call)
    await Promise.race([
      call('request_close_window').catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
