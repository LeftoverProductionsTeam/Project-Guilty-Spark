// Opt-in real Windows acceptance. Requires the owner's MCC map, installed
// Invader/H1A tools and a fresh QA library. No game memory or stock writes.
import { chromium, expect as pwExpect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const expect = pwExpect.configure({ timeout: 45000 }),
  run = promisify(execFile),
  args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (
    !['--app', '--data', '--output', '--map', '--kit', '--invader', '--legacy'].includes(key) ||
    !process.argv[i + 1] ||
    args.has(key)
  )
    throw Error('Use all seven unique named arguments');
  args.set(key, path.resolve(process.argv[i + 1]));
}
if (args.size !== 7) throw Error('All seven named arguments are required');
const data = args.get('--data'),
  output = args.get('--output'),
  fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8')),
  seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
if (!fixture.nativeFixture || fixture.projectId !== seed.projectId || path.resolve(seed.library) !== data)
  throw Error('Only an isolated QA replica is accepted');
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-smart-edit-qa.exe');
await fs.copyFile(args.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
  readHash = async (f) => hash(await fs.readFile(f));
const mapBefore = await readHash(args.get('--map'));
async function inventory(root) {
  const result = {};
  async function visit(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (e.isSymbolicLink()) throw Error('Source link');
      const file = path.join(dir, e.name);
      if (e.isDirectory()) await visit(file);
      else result[path.relative(root, file).replaceAll('\\', '/')] = await readHash(file);
    }
  }
  await visit(root);
  return result;
}
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
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
const receipt = {
  schemaVersion: 1,
  nativeDesktop: true,
  executableSha256: await readHash(exe),
  gameLaunched: false,
  gameMemoryTouched: false,
  gameplayAccepted: false,
  assetGameImportAccepted: false,
};
let browser, page, call;
const pageErrors = [];
async function nav(name) {
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name, exact: true }).click();
}
async function openCard(title) {
  await nav('Map library');
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .filter({ hasText: 'CACHE 13' })
    .click();

}
async function save(project) {
  await call('claim_project_document', { id: project.id });
  return call('save_project', { project });
}
async function preview(projectId, preference = 'automatic', runtimeId = 'mccSteam') {
  return call('smart_edit_plan', { projectId, runtimeId, preference });
}
async function directProof(projectId, result, tagPath, value) {
  expect(result.route).toBe('directCache');
  expect(result.status).toBe('validated');
  const proof = JSON.parse(
    await fs.readFile(path.join(data, 'jobs', result.jobId, 'smart-edit-receipt.json'), 'utf8'),
  );
  expect(proof.compilerRan).toBe(false);
  expect(proof.extractedTags).toBe(false);
  expect(proof.allOtherBytesPreserved).toBe(true);
  const source = (await call('open_project', { id: projectId })).project.source;
  const before = await fs.readFile(source.preservedPath),
    after = await fs.readFile(result.record.output);
  expect(hash(before)).toBe(source.sha256);
  expect(hash(after)).toBe(result.record.sha256);
  expect(after.length).toBe(before.length);
  const allowed = new Set([0x64, 0x65, 0x66, 0x67]);
  for (const cell of proof.cells)
    for (let i = 0; i < 4; i++) {
      expect(before[cell.offset + i]).toBe(cell.before[i]);
      expect(after[cell.offset + i]).toBe(cell.after[i]);
      allowed.add(cell.offset + i);
    }
  let changes = 0;
  for (let i = 0; i < before.length; i++)
    if (before[i] !== after[i]) {
      if (!allowed.has(i)) throw Error(`Unplanned byte at ${i.toString(16)}`);
      changes++;
    }
  const validation = await run(
    path.join(args.get('--invader'), 'invader-info.exe'),
    ['-T', 'crc32_mismatched', result.record.output],
    { windowsHide: true, timeout: 30000 },
  );
  expect(validation.stdout.trim()).toBe('0');
  const opened = await call('open_built_map', { projectId, buildId: result.jobId });
  if (tagPath) {
    const tag = opened.inspection.tags.find((t) => t.class === 'weap' && t.path === tagPath);
    expect(tag.fields.find((f) => f.key === 'bounding-radius').value).toBeCloseTo(value, 6);
  }
  return { proof, opened, totalChangedBytes: changes };
}
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
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => pageErrors.push(String(e)));
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
  const imported = await call('import_paths', { paths: [args.get('--map')] }),
    stock = imported.find((v) => v.project.source?.cacheVersion === 13);
  if (!stock) throw Error('Actual MCC map required');
  await page.reload();
  await openCard(stock.project.title);
  expect(stock.project.tagEdits).toEqual([]);
  const discoveryStarted = performance.now();
  await expect
    .poll(
      async () => {
        const p = (await call('open_project', { id: stock.project.id })).project;
        return p.source.resourceSha256?.['mcc-textures'] ?? null;
      },
      { timeout: 120000, intervals: [200, 500, 1000] },
    )
    .not.toBe(null);
  const connected = (await call('open_project', { id: stock.project.id })).project;
  receipt.automaticSourceDiscovery = {
    ms: performance.now() - discoveryStarted,
    texturePackSha256: connected.source.resourceSha256['mcc-textures'],
    originalCacheUnchanged: connected.source.sha256 === stock.project.source.sha256,
  };
  // Load the now-canonical binding before making the first authoring edit. A
  // dependency scan finishing after review correctly expires the older plan.
  await page.reload();
  await openCard(stock.project.title);
  await call('claim_project_document', { id: stock.project.id });
  const pistol = stock.inspection.tags.find(
    (t) => t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/pistol/pistol'),
  );
  if (!pistol) throw Error('Real pistol tag required');
  await nav('Tag editor');
  await page.getByRole('textbox', { name: 'Search tags' }).fill(pistol.path);
  await page.getByRole('combobox', { name: 'Filter tag class', exact: true }).selectOption('weap');
  await page
    .locator('.tag-row')
    .filter({ has: page.locator('strong', { hasText: /^pistol$/ }) })
    .click();
  const radius = page.getByRole('spinbutton', { name: 'Bounding radius', exact: true });
  await radius.fill('0.225');
  await radius.press('Tab');
  const panel = page.locator('.smart-edit').first();
  await panel.locator('summary').first().click();
  const directBegan = performance.now();
  receipt.sourceBindingRefreshes = [];
  // A real asynchronous dependency pin can expire a plan. Retry only that
  // explicitly diagnosed case after verifying authored content was unchanged.
  // Other invalidations/errors fail this acceptance rather than being hidden.
  for (let attempt = 0; attempt < 3; attempt++) {
    await panel.getByRole('button', { name: 'Review save plan', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await panel.locator('.smart-edit-plan').count()) ||
          ((await panel.getAttribute('data-smart-edit-invalidated')) ? 2 : 0),
      )
      .not.toBe(0);
    try {
      if (await panel.locator('.smart-edit-plan').count()) {
        await expect(panel.locator('.smart-edit-plan>strong')).toHaveText('Direct map copy');
        receipt.uiPlanMs = performance.now() - directBegan;
        await panel.getByRole('button', { name: 'Save validated map copy', exact: true }).click();
        await expect
          .poll(
            async () =>
              (await panel.locator('.smart-edit-result').count()) ||
              ((await panel.getAttribute('data-smart-edit-invalidated')) ? 2 : 0),
          )
          .not.toBe(0);
        if (await panel.locator('.smart-edit-result').count()) break;
      }
    } catch (error) {
      if ((await panel.getAttribute('data-smart-edit-invalidated')) !== 'Source bindings') throw error;
    }
    const why = await panel.getAttribute('data-smart-edit-invalidated');
    expect(why).toBe('Source bindings');
    const actual = (await call('open_project', { id: stock.project.id })).project;
    expect(actual.source.sha256).toBe(stock.project.source.sha256);
    expect(actual.tagEdits).toEqual([{ tagId: pistol.id, fieldKey: 'bounding-radius', value: 0.225 }]);
    expect(JSON.stringify(actual.scene)).toBe(JSON.stringify(stock.project.scene)); // native signed-zero normalization is semantically harmless
    receipt.sourceBindingRefreshes.push({
      attempt: attempt + 1,
      reason: why,
      sourceSha256: actual.source.sha256,
      resources: actual.source.resourceSha256,
      authoredContentUnchanged: true,
    });
  }
  await expect(panel.locator('.smart-edit-result>strong')).toHaveText('Validated copy ready');
  const edited = (await call('open_project', { id: stock.project.id })).project,
    direct = edited.builds.at(-1);
  receipt.directUiMs = performance.now() - directBegan;
  const directCheck = await directProof(
    stock.project.id,
    { route: 'directCache', status: 'validated', jobId: direct.id, record: direct },
    pistol.path,
    0.225,
  );
  receipt.direct = {
    jobId: direct.id,
    sha256: direct.sha256,
    changedNativeBytes: directCheck.proof.changedNativeBytes,
    totalChangedBytes: directCheck.totalChangedBytes,
    compilerRan: false,
    extractedTags: false,
    sourceSha256: stock.project.source.sha256,
    output: direct.output,
  };
  await page.screenshot({ path: path.join(output, 'direct-save.png') });
  await panel.getByRole('button', { name: 'Open edited copy in a new tab', exact: true }).click();
  await expect(page.locator('.map-tab').filter({ hasText: 'edited copy' })).toHaveCount(1);

  // Real stale-plan refusal, no output job or build record for the refused request.
  let current = (await call('open_project', { id: stock.project.id })).project;
  const stale = await preview(current.id, 'directCache');
  current.tagEdits[0].value = 0.3;
  await save(current);
  await expect(call('smart_edit_execute', { planId: stale.id })).rejects.toThrow(/changed after preview/);
  receipt.stalePlanRejected = true;
  // Manual routing cannot turn a readable reference into direct cache support.
  const ref = pistol.fields.find((f) => f.kind === 'reference' && f.targetClass === 'proj'),
    replacement = stock.inspection.tags.find((t) => t.class === 'proj' && t.id !== ref?.value);
  if (!ref || !replacement) throw Error('Real existing projectile alternative required');
  current.tagEdits.push({ tagId: pistol.id, fieldKey: ref.key, value: replacement.id });
  await save(current);
  const structural = await preview(current.id, 'directCache');
  expect(structural.selectedRoute).toBe(null);
  expect(structural.choices.find((c) => c.route === 'directCache').available).toBe(false);
  await expect(call('smart_edit_execute', { planId: structural.id })).rejects.toThrow(
    /No verified execution route/,
  );
  receipt.unsafeReferenceRefused = true;
  current.tagEdits = [];
  await save(current);
  const wrongRuntime = await preview(current.id, 'directCache', 'haloCustomEdition');
  expect(wrongRuntime.selectedRoute).toBe(null);
  receipt.editionOverrideRefused = true;

  // Actual viewport gizmo drag, preserving the same saved scene and tag state.
  await page.reload();
  await openCard(stock.project.title);
  const vehicle = stock.project.scene.find((o) => o.kind === 'Vehicle' && o.tagId !== null),
    vehicleTag = stock.inspection.tags.find((t) => t.id === vehicle?.tagId);
  if (!vehicle || !vehicleTag) throw Error('Actual vehicle placement and tag required');
  const vehicleRadius = vehicleTag.fields.find((f) => f.key === 'bounding-radius').value + 0.125;
  await nav('Tag editor');
  await page.getByRole('combobox', { name: 'Filter tag class', exact: true }).selectOption('vehi');
  await page.getByRole('textbox', { name: 'Search tags' }).fill(vehicleTag.path);
  await page.locator('.tag-row').first().click();
  await page.getByRole('spinbutton', { name: 'Bounding radius', exact: true }).fill(String(vehicleRadius));
  await page.getByRole('spinbutton', { name: 'Bounding radius', exact: true }).press('Tab');
  await nav('Level editor');
  await page.getByRole('button', { name: 'Toggle Objects', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search scene objects' }).fill(vehicle.name);
  await page.locator('.object-name').filter({ hasText: vehicle.name }).first().click();
  const vehicleDrawer = page.getByRole('region', { name: 'Object tags panel', exact: true });
  // Numeric controls deliberately shorten insignificant float32 tail digits.
  // Verify the shared native value rather than a particular display spelling.
  await expect.poll(async () => Number(await vehicleDrawer.getByRole('spinbutton', { name: 'Bounding radius', exact: true }).inputValue())).toBeCloseTo(vehicleRadius, 6);
  const modelRef = vehicleTag.references.find((r) => r.label === 'Model'),
    modelTag = stock.inspection.tags.find((t) => t.id === modelRef?.targetId);
  if (!modelTag) throw Error('Actual vehicle model dependency required');
  await vehicleDrawer
    .getByRole('button', { name: `Model → ${modelTag.path.split(/[\\/]/).at(-1)}`, exact: true })
    .click();
  await expect(vehicleDrawer.locator('.viewport-tag-path')).toHaveText(modelTag.path);
  receipt.crossView = {
    vehicleId: vehicle.id,
    tagId: vehicleTag.id,
    value: vehicleRadius,
    modelTagId: modelTag.id,
    modelPath: modelTag.path,
    sharedProject: true,
  };
  const scenery = stock.project.scene.find(
    (o) => o.kind === 'Scenery' && o.sourceOffset !== null && stock.inspection.modelMeshes?.[String(o.tagId)],
  );
  if (!scenery) throw Error('Actual rendered source scenery required');
  if (!(await page.getByRole('textbox', { name: 'Search scene objects' }).isVisible()))
    await page.getByRole('button', { name: 'Toggle Objects', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search scene objects' }).fill(scenery.name);
  await page.locator('.object-name').filter({ hasText: scenery.name }).first().click();
  const objectTags = page.getByRole('region', { name: 'Object tags panel', exact: true });
  if (await objectTags.isVisible())
    await page.getByRole('button', { name: 'Toggle Object tags', exact: true }).click();
  const canvas = page.locator('.viewport canvas').first();
  await canvas.focus();
  await page.keyboard.press('f');
  await expect.poll(async () => {
    const raw=await canvas.getAttribute('data-gs-gizmo');
    if(!raw)return false;
    const sample=JSON.parse(raw);
    receipt.lastGizmoSample=sample;
    return sample.mode==='translate' && ['X','Y','Z'].some(a=>sample.handles[a]?.every(v=>Number.isFinite(v)&&Math.abs(v)<0.85));
  }).toBe(true);
  // Rendered native object and transform controls determine the drag coordinates.
  let gizmo = JSON.parse(await canvas.getAttribute('data-gs-gizmo')),
    box = await canvas.boundingBox();
  const axis = ['X', 'Y', 'Z'].find(
    (a) => gizmo.handles[a] && gizmo.handles[a].every((v) => Math.abs(v) < 0.85),
  );
  if (!axis) throw Error('No visible gizmo axis after object framing');
  const h = gizmo.handles[axis],
    origin = gizmo.origin,
    px = box.x + ((h[0] + 1) * box.width) / 2,
    py = box.y + ((1 - h[1]) * box.height) / 2,
    dx = ((h[0] - origin[0]) * box.width) / 2,
    dy = (-(h[1] - origin[1]) * box.height) / 2,
    length = Math.hypot(dx, dy);
  if (length < 2) throw Error('Gizmo axis is too small for a meaningful drag');
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + (dx / length) * 40, py + (dy / length) * 40, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.press('Control+s');
  await expect
    .poll(async () => {
      const p = (await call('open_project', { id: current.id })).project;
      return JSON.stringify(p.scene.find((o) => o.id === scenery.id).position);
    })
    .not.toBe(JSON.stringify(scenery.position));
  const moved = (await call('open_project', { id: current.id })).project,
    movedObject = moved.scene.find((o) => o.id === scenery.id),
    movePlan = await preview(current.id, 'directCache');
  expect(movePlan.intents.some((i) => i.kind === 'transformPlacement' && i.objectId === scenery.id)).toBe(
    true,
  );
  const moveResult = await call('smart_edit_execute', { planId: movePlan.id }),
    moveCheck = await directProof(current.id, moveResult);
  const loadedObject = moveCheck.opened.inspection.objects.find((o) => o.id === scenery.id);
  expect(loadedObject.position).toEqual(movedObject.position);
  expect(
    moveCheck.opened.inspection.tags
      .find((t) => t.id === vehicleTag.id)
      .fields.find((f) => f.key === 'bounding-radius').value,
  ).toBeCloseTo(vehicleRadius, 6);
  receipt.viewport = {
    actualGizmoDrag: true,
    axis,
    id: scenery.id,
    before: scenery.position,
    after: movedObject.position,
    reopened: loadedObject.position,
    jobId: moveResult.jobId,
  };
  await page.screenshot({ path: path.join(output, 'viewport-move.png') });

  // Same semantic radius on the exact native parent through both storage routes.
  const nativeOriginal = (await call('open_project', { id: fixture.projectId })).project,
    parent = nativeOriginal.builds.find((b) => b.id === fixture.workingBuildId),
    sourceReport = await call('runtime_workbench_report', {
      runtimeId: 'mccSteam',
      projectId: nativeOriginal.id,
    }),
    tagRoot = sourceReport.workingSource.tagsDirectory,
    beforeTags = await inventory(tagRoot),
    parentMap = await call('open_built_map', { projectId: nativeOriginal.id, buildId: parent.id }),
    samePistol = parentMap.inspection.tags.find(
      (t) => t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/pistol/pistol'),
    );
  if (!samePistol) throw Error('Native parent needs the actual pistol');
  const p = parentMap.project;
  p.tagEdits = [{ tagId: samePistol.id, fieldKey: 'bounding-radius', value: 0.225 }];
  await save(p);
  const equivalentPlan = await preview(p.id, 'directCache'),
    equivalent = await call('smart_edit_execute', { planId: equivalentPlan.id }),
    equivalentCheck = await directProof(p.id, equivalent, samePistol.path, 0.225);
  const extractionPlan = await preview(p.id, 'nativeRebuild');
  expect(extractionPlan.selectedRoute).toBe('nativeRebuild');
  const extractionStarted = performance.now(),
    extractionBuild = await call('smart_edit_execute', { planId: extractionPlan.id });
  await expect
    .poll(
      async () => {
        const current = (await call('open_project', { id: p.id })).project;
        return current.builds.find((b) => b.id === extractionBuild.jobId)?.status ?? 'building';
      },
      { timeout: 240000, intervals: [500, 1000, 1500] },
    )
    .toBe('validated');
  const extractionOutput = await call('open_built_map', { projectId: p.id, buildId: extractionBuild.jobId });
  expect(
    extractionOutput.inspection.tags
      .find((t) => t.class === 'weap' && t.path === samePistol.path)
      .fields.find((f) => f.key === 'bounding-radius').value,
  ).toBeCloseTo(0.225, 6);
  const extractionValue = extractionOutput.inspection.tags
    .find((t) => t.class === 'weap' && t.path === samePistol.path)
    .fields.find((f) => f.key === 'bounding-radius').value;
  receipt.extractionRebuild = {
    jobId: extractionBuild.jobId,
    ms: performance.now() - extractionStarted,
    actualNativeCompiler: true,
    value: extractionValue,
  };
  const anotherDirect = await preview(p.id, 'directCache');
  const afterSourceCopy = await call('smart_edit_execute', { planId: anotherDirect.id });
  expect(afterSourceCopy.status).toBe('validated');
  const retainedContext = await call('native_tag_context', { projectId: p.id, tagId: samePistol.id });
  expect(retainedContext.buildId).toBe(extractionBuild.jobId);
  receipt.nativeToolsSurviveDirectSave = true;
  await call('claim_project_document', { id: nativeOriginal.id });
  const tag = await call('native_operation_preview', {
    projectId: nativeOriginal.id,
    tagId: samePistol.id,
    operation: { kind: 'boundingRadius', value: 0.225 },
  });
  expect(tag.fieldChanges).toHaveLength(1);
  await call('native_operation_accept', {
    projectId: nativeOriginal.id,
    operationId: tag.id,
    restore: false,
  });
  const sourcePlan = await preview(nativeOriginal.id);
  expect(sourcePlan.selectedRoute).toBe('workingTags');
  expect(sourcePlan.choices.find((c) => c.route === 'directCache').available).toBe(false);
  const buildStart = performance.now(),
    built = await call('smart_edit_execute', { planId: sourcePlan.id });
  expect(built.status).toBe('building');
  await expect
    .poll(
      async () => {
        const p = (await call('open_project', { id: nativeOriginal.id })).project;
        return p.builds.find((b) => b.id === built.jobId)?.status ?? 'building';
      },
      { timeout: 240000, intervals: [500, 1000, 1500] },
    )
    .toBe('validated');
  receipt.nativeBuildMs = performance.now() - buildStart;
  const nativeOutput = await call('open_built_map', { projectId: nativeOriginal.id, buildId: built.jobId }),
    nativePistol = nativeOutput.inspection.tags.find((t) => t.class === 'weap' && t.path === samePistol.path),
    nativeValue = nativePistol.fields.find((f) => f.key === 'bounding-radius').value,
    directValue = equivalentCheck.opened.inspection.tags
      .find((t) => t.class === 'weap' && t.path === samePistol.path)
      .fields.find((f) => f.key === 'bounding-radius').value;
  expect(nativeValue).toBe(directValue);
  expect(await inventory(tagRoot)).toEqual(beforeTags);
  receipt.equivalent = {
    directJobId: equivalent.jobId,
    nativeJobId: built.jobId,
    operation: 'bounding-radius',
    value: nativeValue,
    sameOriginalParent: true,
    binaryIdentical: equivalent.record.sha256 === nativeOutput.project.source.sha256,
    originalTagFilesPreserved: Object.keys(beforeTags).length,
  };
  const legacy = (await call('import_paths', { paths: [args.get('--legacy')] })).find(
    (p) => p.project.source?.cacheVersion !== 13,
  );
  await call('claim_project_document', { id: legacy.project.id });
  const legacyPlan = await preview(legacy.project.id, 'directCache');
  expect(legacyPlan.selectedRoute).toBe(null);
  receipt.legacyDirectWriteRefused = true;
  expect(await readHash(args.get('--map'))).toBe(mapBefore);
  receipt.originalMccMapUnchanged = true;
  expect(pageErrors).toEqual([]);
  receipt.pageErrors = pageErrors;
  receipt.status = 'passed';
  await fs.writeFile(path.join(output, 'smart-edit-native-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error);
  receipt.pageErrors = pageErrors;
  await fs.writeFile(path.join(output, 'smart-edit-native-failure.json'), JSON.stringify(receipt, null, 2));
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (call)
    await Promise.race([
      call('request_close_window').catch(() => {}),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
