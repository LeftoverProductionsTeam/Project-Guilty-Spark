// Opt-in real desktop/native IPC/geometry acceptance. No synthetic mesh or game proof.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 }),
  a = process.argv.slice(2);
if (a.length !== 5)
  throw Error(
    'test-assets-startup-native <built Spark exe> <fresh acceptance root> H1A kit source-tags Invader',
  );
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
const exe = path.join(root, 'GuiltySpark-assets-qa.exe');
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
  page.on('console', (message) => {
    if (message.type() === 'error' && /THREE\.WebGL|VALIDATE_STATUS|GL_INVALID/.test(message.text()))
      errors.push(message.text());
  });
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });

  const boot = await call('bootstrap');
  receipt.startup = await call('startup_status');
  const statusTimes = [];
  for (let n = 0; n < 12; n++) {
    const at = performance.now();
    await call('startup_status');
    statusTimes.push(performance.now() - at);
  }
  receipt.startup.statusRoundTripMs = statusTimes;
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      hekDirectory: path.resolve(a[2]),
      hekTagsDirectory: path.resolve(a[3]),
      invaderDirectory: path.resolve(a[4]),
      hekFlavor: 'h1aEk',
    },
  });
  const found = await call('discover_asset_sources');
  receipt.discovery = {
    maps: found.maps.map((row) => ({
      name: row.name,
      location: row.location,
      cacheVersion: row.cacheVersion,
    })),
    elapsedMs: found.elapsedMs,
    notices: found.notices,
  };
  const blood = found.maps.find(
    (row) => row.cacheVersion === 13 && row.name.toLowerCase() === 'bloodgulch.map',
  );
  expect(blood).toBeTruthy();
  let opened = (await call('open_asset_source', { sourceId: blood.id }))[0];
  opened = await call('connect_mcc_texture_resources', { projectId: opened.project.id });
  const source = opened.project,
    inspection = opened.inspection;
  receipt.source = { id: source.id, sha256: source.source.sha256, tags: inspection.tags.length };
  const hull = inspection.tags.find(
    (tag) => tag.class === 'soso' && /vehicles[\\/]warthog[\\/]shaders[\\/]warthog hull$/i.test(tag.path),
  );
  expect(hull.shaderPreview.reflection.perpendicularBrightness).toBeCloseTo(0.7, 5);
  expect(hull.shaderPreview.reflection.parallelBrightness).toBeCloseTo(1, 5);
  const cube = await call('preview_owned_reflection_cube', {
    projectId: source.id,
    sourceSha256: inspection.sha256,
    bitmapTagId: hull.shaderPreview.reflection.bitmapTagId,
  });
  expect(cube.faces).toHaveLength(6);
  receipt.reflection = {
    shader: hull.path,
    metadata: hull.shaderPreview.reflection,
    faces: cube.faces.map((face) => ({
      width: face.width,
      height: face.height,
      format: face.format,
      ddsSha256: crypto.createHash('sha256').update(Buffer.from(face.ddsBase64, 'base64')).digest('hex'),
    })),
  };
  await page.reload();
  if (found.maps.some((map) => map.cacheVersion === 13 && /^c40\.map$/i.test(map.name)))
    await expect(page.locator('.home-model-caption')).toContainText('monitor', { timeout: 120000 });
  await expect(page.locator('.home-native-model [data-model-triangles]').first()).toHaveAttribute(
    'data-model-triangles',
    /^[1-9]\d*$/,
    { timeout: 90000 },
  );
  await expect(page.locator('.home-native-model [data-model-textures]').first()).toHaveAttribute(
    'data-model-textures',
    /^[1-9]\d*$/,
    { timeout: 90000 },
  );
  receipt.home = await page
    .locator('.home-native-model .native-model-preview')
    .evaluate((element) => ({ ...element.dataset }));
  expect(receipt.home.transparentBackground).toBe('true');
  await expect(page.locator('.home-native-model [data-model-ready]').first()).toHaveAttribute(
    'data-model-ready',
    'true',
    { timeout: 90000 },
  );
  receipt.home.caption = await page.locator('.home-model-caption').innerText();
  if (receipt.home.caption.includes('monitor')) {
    const preview = page.locator('.home-native-model .native-model-preview');
    await expect(preview).toHaveAttribute('data-native-animation-count', '3', { timeout: 90000 });
    const identity = await preview.evaluate((element) => ({ ...element.dataset }));
    const decoded = await call('preview_owned_object_animations', {
      projectId: identity.modelSource,
      sourceSha256: identity.modelSourceHash,
      tagId: Number(identity.modelTag),
    });
    expect(decoded.sourceSha256).toBe(identity.modelSourceHash);
    expect(decoded.animations.clips.map((clip) => clip.name).sort()).toEqual(
      ['idle overlay', 'monitor_talking-loop', 'stand unarmed idle'].sort(),
    );
    await expect(
      call('preview_owned_object_animations', {
        projectId: identity.modelSource,
        sourceSha256: '0'.repeat(64),
        tagId: Number(identity.modelTag),
      }),
    ).rejects.toThrow(/SHA-256|identity/i);
    const playback = async () =>
      preview.locator('canvas').evaluate((canvas) => JSON.parse(canvas.dataset.gsAnimation ?? 'null'));
    await expect.poll(async () => (await playback())?.name).toBe('idle overlay');
    const first = await playback();
    await expect
      .poll(async () => {
        const sample = await playback();
        return (
          sample?.time > first.time &&
          sample.samplePosition.some((v, i) => Math.abs(v - first.samplePosition[i]) > 0.000001)
        );
      })
      .toBe(true);
    const moved = await playback();
    await page.locator('.home-native-model').hover();
    await page.getByRole('button', { name: 'Pause showcase animation', exact: true }).click();
    await expect.poll(async () => (await playback())?.playing).toBe(false);
    const paused = await playback();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const tick = () => (++frames >= 8 ? resolve(true) : requestAnimationFrame(tick));
          requestAnimationFrame(tick);
        }),
    );
    expect((await playback()).time).toBe(paused.time);
    await page
      .getByLabel('Showcase animation', { exact: true })
      .selectOption({ label: 'monitor_talking-loop' });
    await page.getByRole('button', { name: 'Play showcase animation', exact: true }).click();
    await expect.poll(async () => (await playback())?.name).toBe('monitor_talking-loop');
    await page.getByLabel('Showcase animation', { exact: true }).selectOption({ label: 'idle overlay' });
    await expect.poll(async () => (await playback())?.name).toBe('idle overlay');
    receipt.homeAnimation = {
      nativeGraphTag: decoded.animations.graphTagId,
      clips: decoded.animations.clips.map((clip) => ({
        name: clip.name,
        frames: clip.frameCount,
        bones: clip.nodes.length,
        fps: clip.fps,
        sha256: crypto.createHash('sha256').update(JSON.stringify(clip)).digest('hex'),
      })),
      firstVertex: first.samplePosition,
      laterVertex: moved.samplePosition,
      actualSkinnedVerticesMove: true,
      pauseFreezesTime: true,
      nativeTalkingClipSelected: true,
      wrongSourceHashRejected: true,
    };
  }
  await page.screenshot({ path: path.join(root, 'home-native-model.png') });
  const created = await call('create_quickforge_project', {
    title: 'Recursive native drop acceptance',
    template: 'emptyArena',
    target: 'mccSteam',
  });
  const defaults = await call('prepare_default_halo_materials', { projectId: created.project.id });
  created.project.nativeAssetImports = defaults.bindings;
  created.project.quickForge.materials = defaults.materials;
  receipt.defaultMaterials = { materials: defaults.materials, bindings: defaults.bindings };
  const initialImports = defaults.bindings.length;
  created.project.quickForge.skyPath = 'levels/test/bloodgulch/bloodgulch';
  await call('save_project', { project: created.project });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await expect(page.locator('.forge-viewport canvas').first()).toBeVisible();
  await expect(page.locator('.forge-viewport [data-native-material-count]')).toHaveAttribute(
    'data-native-material-count',
    '2',
    { timeout: 90000 },
  );
  receipt.defaultMaterials.previewCount = 2;
  await page.screenshot({ path: path.join(root, 'native-default-materials.png') });
  await page.getByRole('button', { name: 'Toggle Asset library', exact: true }).click();
  const drawer = page
    .locator('.gs-workspace-panel')
    .filter({ has: page.getByRole('heading', { name: 'Asset library', exact: true }) });
  const browse = page.locator('.viewport-asset-library .asset-source-browser');
  await browse.locator('summary').click();
  await expect(browse.getByLabel('Discovered asset source')).toContainText('bloodgulch.map');
  await browse.getByLabel('Discovered asset source').selectOption(blood.id);
  await browse.getByRole('button', { name: 'Load assets', exact: true }).click();
  await expect(browse.getByRole('button', { name: 'Load assets', exact: true })).toBeEnabled({
    timeout: 90000,
  });
  await page.getByLabel('Search loaded assets').fill('scenery\\rocks\\boulder\\boulder');
  const card = page
    .locator('.viewport-asset-list article')
    .filter({ has: page.getByRole('button', { name: 'Add boulder at view', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: path.join(root, 'asset-preview-before-drop.png') });
  const from = await card.locator('img').boundingBox(),
    to = await page.locator('.forge-viewport canvas').first().boundingBox();
  await page.mouse.move(from.x + from.width * 0.5, from.y + from.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.5, to.y + to.height * 0.6, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Control+s');
        return (
          (await call('open_project', { id: created.project.id })).project.nativeAssetImports?.length ?? 0
        );
      },
      { timeout: 90000 },
    )
    .toBe(initialImports + 1);
  let placed = (await call('open_project', { id: created.project.id })).project;
  expect(placed.quickForge.placements).toHaveLength(1);
  expect(placed.nativeAssetImports.at(-1).fileCount).toBe(5);
  receipt.drop = {
    imports: placed.nativeAssetImports,
    placement: placed.quickForge.placements[0],
    actualPointerDrag: true,
  };
  await page.getByRole('button', { name: 'Toggle Changes', exact: true }).click();
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Redo (Ctrl+Y / Ctrl+Shift+Z)', exact: true })).toBeEnabled();
  await page.keyboard.press('Control+s');
  await expect(
    page.getByText('Project saved. Your original map is unchanged.', { exact: true }).last(),
  ).toBeVisible();
  let undo = (await call('open_project', { id: created.project.id })).project;
  expect(undo.quickForge.placements).toHaveLength(0);
  expect(undo.nativeAssetImports ?? []).toHaveLength(initialImports);
  await page.getByRole('button', { name: 'Redo (Ctrl+Y / Ctrl+Shift+Z)', exact: true }).focus();
  await page.keyboard.press('Control+y');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        (await call('open_project', { id: created.project.id })).project.quickForge.placements.length,
    )
    .toBe(1);
  placed = (await call('open_project', { id: created.project.id })).project;
  expect(placed.quickForge.placements).toHaveLength(1);
  expect(placed.nativeAssetImports).toHaveLength(initialImports + 1);
  receipt.drop.singleUndoRedo = true;
  receipt.sourceValidation = await call('quickforge_validate', { document: placed.quickForge });
  await fs.writeFile(
    path.join(root, 'source-validation.json'),
    JSON.stringify(receipt.sourceValidation, null, 2),
  );
  const job = await call('quickforge_build', { projectId: placed.id });
  await expect
    .poll(
      async () => {
        const r = await call('quickforge_build_report', { projectId: placed.id });
        return r?.jobId === job ? r.status : 'pending';
      },
      { timeout: 240000, intervals: [1000, 1500, 2000] },
    )
    .not.toBe('pending');
  const build = await call('quickforge_build_report', { projectId: placed.id });
  receipt.build = build;
  await fs.writeFile(path.join(root, 'build-report.json'), JSON.stringify(build, null, 2));
  expect(build.status).toBe('validated');
  const importRoot = path.join(data, 'asset-imports', placed.id, placed.nativeAssetImports.at(-1).id),
    importReceipt = JSON.parse(await fs.readFile(path.join(importRoot, 'import.json'), 'utf8'));
  const output = build.build.output;
  const rebuilt = (await call('import_paths', { paths: [output] }))[0];
  const nativePath = placed.nativeAssetImports.at(-1).nativePath.toLowerCase();
  const tag = rebuilt.inspection.tags.find(
    (tag) => tag.class === 'scen' && tag.path.replaceAll('\\', '/').toLowerCase() === nativePath,
  );
  expect(tag).toBeTruthy();
  const placement = rebuilt.inspection.objects.find((object) => object.tagId === tag.id);
  expect(placement).toBeTruthy();
  for (let axis = 0; axis < 3; axis++)
    expect(placement.position[axis]).toBeCloseTo(placed.quickForge.placements[0].position[axis], 4);
  receipt.compiled = {
    sha256: rebuilt.inspection.sha256,
    nativeTagPath: tag.path,
    position: placement.position,
    collisionTriangles: rebuilt.inspection.mesh.indices.length / 3,
  };
  receipt.sourcePreserved = (await hash(source.source.originalPath)) === inspection.sha256;
  expect(receipt.sourcePreserved).toBe(true);
  const inputFile = path.join(importRoot, 'tags', importReceipt.files[0].path),
    original = await fs.readFile(inputFile);
  const damaged = Buffer.from(original);
  damaged[63] ^= 1;
  await fs.writeFile(inputFile, damaged);
  try {
    const rejectedJob = await call('quickforge_build', { projectId: placed.id });
    await expect
      .poll(
        async () => {
          const r = await call('quickforge_build_report', { projectId: placed.id });
          return r?.jobId === rejectedJob ? r.status : 'pending';
        },
        { timeout: 90000, intervals: [1000] },
      )
      .not.toBe('pending');
    const refused = await call('quickforge_build_report', { projectId: placed.id });
    expect(refused.status).toBe('failed');
    expect(refused.blockers.join(' ')).toMatch(/changed|incomplete/i);
    receipt.changedImportRejected = refused.blockers;
  } finally {
    await fs.writeFile(inputFile, original);
  }
  expect(await hash(inputFile)).toBe(importReceipt.files[0].sha256);
  expect(await hash(output)).toBe(rebuilt.inspection.sha256);
  receipt.previousBuildPreserved = true;

  // A compiled source map is a different editing path from QuickForge. Rebuild
  // it with its actual editable source tree, then inspect the new native entry.
  const rootTag = inspection.tags.find((row) => row.id === placed.nativeAssetImports.at(-1).tagId);
  const binding = await call('prepare_native_asset_import', {
    projectId: rebuilt.project.id,
    sourceProjectId: source.id,
    sourceSha256: inspection.sha256,
    tagId: rootTag.id,
  });
  const edited = rebuilt.project,
    targetId = crypto.randomUUID();
  edited.nativeAssetImports = [binding];
  edited.buildTargets = [
    {
      id: targetId,
      name: 'Verified matching MCC source',
      runtimeId: 'mccSteam',
      builder: 'h1a-tool',
      hekDirectory: path.resolve(a[2]),
      hekFlavor: 'h1aEk',
      tagsDirectory: path.join(build.sources.directory, 'tags'),
      invaderDirectory: path.resolve(a[4]),
      ceCompatibleTagset: false,
      openSauce: false,
    },
  ];
  edited.activeBuildTarget = targetId;
  edited.scene.push({
    id: crypto.randomUUID(),
    name: 'Imported second boulder',
    kind: 'Source model',
    position: [-3, 2, 0.01],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    tagId: null,
    assetId: null,
    sourceOffset: null,
    rotationOffset: null,
    sourceModel: {
      projectId: source.id,
      sourceSha256: inspection.sha256,
      tagId: rootTag.id,
      path: rootTag.path,
      class: rootTag.class,
    },
  });
  await call('save_project', { project: edited });
  const sourceJob = await call('start_build', { id: edited.id });
  let sourceBuild;
  await expect
    .poll(
      async () => {
        const current = (await call('open_project', { id: edited.id })).project;
        sourceBuild = current.builds.find((row) => row.id === sourceJob);
        return sourceBuild?.status ?? 'pending';
      },
      { timeout: 240000, intervals: [1000, 1500, 2000] },
    )
    .not.toBe('pending');
  receipt.sourceMapBuild = sourceBuild;
  expect(sourceBuild.status).toBe('validated');
  const sourceResult = (await call('import_paths', { paths: [sourceBuild.output] }))[0];
  const addedTag = sourceResult.inspection.tags.find(
    (row) => row.class === 'scen' && row.path.replaceAll('\\', '/').toLowerCase() === binding.nativePath,
  );
  expect(addedTag).toBeTruthy();
  const added = sourceResult.inspection.objects.find((row) => row.tagId === addedTag.id);
  expect(added).toBeTruthy();
  expect(added.position).toEqual([-3, 2, expect.closeTo(0.01, 5)]);
  expect(await hash(output)).toBe(rebuilt.inspection.sha256);
  receipt.sourceMapAddition = {
    matchingEditableSource: true,
    outputSha256: sourceResult.inspection.sha256,
    nativeTag: addedTag.path,
    position: added.position,
    originalSourcePreserved: true,
  };

  receipt.complete = true;
  await page.screenshot({ path: path.join(root, 'native-drop-compiled.png') });
  expect(errors).toEqual([]);
} catch (error) {
  receipt.failure = String(error?.stack ?? error);
  throw error;
} finally {
  receipt.javascriptErrors = errors;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  await browser?.close();
  child.kill();
}
