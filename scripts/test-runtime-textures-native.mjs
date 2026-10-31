// Real desktop/WebView2 IPC and GPU materials. No compiler tools or original
// bitmap pack are configured for the standalone first-load phase.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, expect as assertion } from '@playwright/test';
const expect = assertion.configure({ timeout: 120000 }),
  args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
if (args.size !== 3 || !['--app', '--output', '--map'].every((k) => args.has(k)))
  throw Error('Use --app built.exe --output fresh-directory --map owned-Zombie-Apocalypse.map');
const output = path.resolve(args.get('--output')),
  input = path.resolve(args.get('--map'));
await fs.mkdir(output);
await fs.mkdir(path.join(output, 'download'));
const hash = async (p) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(p))
    .digest('hex');
const before = await hash(input);
if (before !== 'b38f35508188872b2535888193de80f766d92d3b8d53a8ada7be4fc9808a996d')
  throw Error('Use the exact owned Demo restoration source');
const standalone = path.join(output, 'download', 'bloodgulch.map');
await fs.copyFile(input, standalone, fs.constants.COPYFILE_EXCL);
const exe = path.join(output, 'GuiltySpark-runtime-textures.exe');
await fs.copyFile(path.resolve(args.get('--app')), exe, fs.constants.COPYFILE_EXCL);
const server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(output, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
const receipt = {
  schemaVersion: 1,
  appSha256: await hash(exe),
  sourceSha256: before,
  mockedIpc: false,
  complete: false,
  errors: [],
  limitations: [
    'Compatible pixels are editor previews. They are not compiler resources or a lossless runtime conversion.',
    'No game rendering, physics, audio or peer replication acceptance is claimed.',
  ],
};
let browser, page;
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
  page.on('pageerror', (e) => receipt.errors.push(String(e)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: null,
      hekTagsDirectory: null,
      invaderDirectory: null,
      resourceDirectory: null,
    },
  });
  const [open] = await call('import_paths', { paths: [standalone] });
  await call('claim_project_document', { id: open.project.id });
  expect(open.project.source.resourceSha256).toEqual({});
  await page.reload();
  await page.getByRole('tablist', { name: 'Open maps' }).waitFor({ state: 'hidden' });
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: open.project.title, exact: true }) })
    .click();
  const start = performance.now(),
    world = page.locator('.world-layout');
  await expect(world).toBeVisible();
  await expect
    .poll(async () => Number(await world.getAttribute('data-compatible-shaders')))
    .toBeGreaterThan(50);
  await expect.poll(() => world.getAttribute('data-material-loading')).toBe('false');
  await expect.poll(() => world.getAttribute('data-pending-materials')).toBe('0');
  receipt.standalone = {
    elapsedMs: performance.now() - start,
    viewport: await world.evaluate((e) => ({ ...e.dataset })),
    sourceDescriptor: (await call('open_project', { id: open.project.id })).project.source,
  };
  expect(receipt.standalone.sourceDescriptor.resourceSha256).toEqual({});
  await page.screenshot({ path: path.join(output, 'standalone-compatible-runtime-textures.png') });
  console.log('standalone', JSON.stringify(receipt.standalone.viewport));
  const embedded = await call('preview_owned_cache_bitmap_batch', {
    projectId: open.project.id,
    requests: [{ bitmapTagId: 3867149580, imageIndex: 0 }],
  });
  expect(embedded.items[0].preview.sourceKind).toBe('internal-cache');
  const native = await call('runtime_texture_source', { runtimeId: 'mccSteam' });
  const matches = await call('compatible_bitmap_targets', {
    projectId: open.project.id,
    runtimeProjectId: native.project.id,
    requests: [{ bitmapTagId: 3867149580, imageIndex: 0 }],
  });
  expect(matches).toEqual([]);
  receipt.embeddedSourceRetainsPriority = true;
  // Native descriptors with null material paths gain actual owned shaders in
  // the normal workspace, without extracting tags or configuring a compiler.
  const created = await call('create_quickforge_project', {
    title: 'Unconfigured arena defaults QA',
    template: 'emptyArena',
    target: 'mccSteam',
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await expect(page.locator('.forge-viewport [data-native-material-count]')).toHaveAttribute(
    'data-native-material-count',
    '2',
  );
  const saved = (await call('open_project', { id: created.project.id })).project;
  // Autosave may lag the GPU frame; compare the actual editor's saved state.
  await expect
    .poll(async () =>
      (await call('open_project', { id: created.project.id })).project.quickForge.materials.every(
        (m) => m.shaderPath != null,
      ),
    )
    .toBe(true);
  const defaults = (await call('open_project', { id: created.project.id })).project;
  expect(defaults.quickForge.materials.find((m) => m.id === 'surface').shaderPath).toBe(
    'levels/test/bloodgulch/shaders/cap_metal',
  );
  expect(defaults.quickForge.materials.find((m) => m.id === 'grass').shaderPath).toBe(
    'levels/test/bloodgulch/shaders/blood ground',
  );
  expect(defaults.nativeAssetImports ?? []).toHaveLength(0);
  receipt.defaultMaterials = {
    materials: defaults.quickForge.materials,
    gpuPreviewCount: 2,
    nativeToolsConfigured: false,
    nativeImportsCreated: 0,
  };
  await page.screenshot({ path: path.join(output, 'tool-free-native-default-materials.png') });
  // Connecting the genuine historical resources must invalidate compatible
  // previews and restore exact original map pixels on the next open.
  await call('claim_project_document', { id: open.project.id });
  await call('connect_halo_textures', {
    projectId: open.project.id,
    mode: 'path',
    path: path.join(path.dirname(input), 'bitmaps.map'),
  });
  const navigation=page.getByRole('button',{name:'Toggle workspace navigation',exact:true});
  if(await navigation.getAttribute('aria-expanded')!=='true')await navigation.click();
  await page.locator('.gs-navigation-drawer').getByRole('button',{name:'Map library',exact:true}).click();
  await page.locator('.map-card').filter({has:page.getByRole('heading',{name:open.project.title,exact:true})}).filter({hasText:'Halo Demo / Trial'}).click();
  await expect.poll(() => world.getAttribute('data-source-shaders')).toBe('132');
  await expect.poll(() => world.getAttribute('data-compatible-shaders')).toBe('0');
  receipt.originalPack = {
    viewport: await world.evaluate((e) => ({ ...e.dataset })),
    compatiblePreviewsReplacedByOriginals: true,
  };
  expect(await hash(input)).toBe(before);
  expect(await hash(standalone)).toBe(before);
  expect(await hash(open.project.source.preservedPath)).toBe(before);
  expect(receipt.errors).toEqual([]);
  receipt.originalsUnchanged = true;
  receipt.complete = true;
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      complete: true,
      defaultMaterials: receipt.defaultMaterials,
      originalPack: receipt.originalPack.viewport,
    }),
  );
} catch (error) {
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), receipt }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    const closed = once(child, 'exit');
    child.kill();
    await closed;
  }
}
