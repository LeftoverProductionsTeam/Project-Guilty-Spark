// Opt-in native Blood Gulch rendering and workflow regression. Fresh library/profile; originals are read-only.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium, expect as baseExpect } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
const expect = baseExpect.configure({ timeout: 45000 }),
  args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
if (
  ['--app', '--output', '--demo', '--mcc'].some((k) => !args.has(k)) ||
  [...args.keys()].some((k) => !['--app', '--output', '--demo', '--mcc', '--closeups'].includes(k))
)
  throw Error(
    'Required: --app built.exe --output fresh-directory --demo owned-demo-bloodgulch.map --mcc installed-bloodgulch.map [--closeups yes]',
  );
const output = path.resolve(args.get('--output')),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-render-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), exe, fs.constants.COPYFILE_EXCL);
const inputs = [path.resolve(args.get('--demo')), path.resolve(args.get('--mcc'))],
  before = await Promise.all(inputs.map(async (p) => ({ path: p, sha256: hash(await fs.readFile(p)) })));
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
await fs.writeFile(path.join(output, 'process.json'), JSON.stringify({ pid: child.pid, port }));
let browser, page;
const receipt = {
  appSha256: hash(await fs.readFile(exe)),
  inputs: before,
  maps: [],
  errors: [],
  limitations: [
    'Editor WebView2 rendering and read-only owned-cache inspection; no Halo game process or claim of full engine parity.',
  ],
};
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
  page.on('console', (m) => {
    if (m.type() === 'error' && /THREE|WebGL|shader/i.test(m.text())) receipt.errors.push(m.text());
  });
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await page.evaluate(() =>
    localStorage.setItem(
      'guilty-spark-map-session-v1:global',
      JSON.stringify({ 'chrome.compact-header': true }),
    ),
  );
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false, preferredHalo: 'mccSteam' },
  });
  let maps = await call('import_paths', { paths: inputs });
  for (let n = 0; n < maps.length; n++) {
    let o = maps[n];
    await call('claim_project_document', { id: o.project.id });
    if (n === 1) o = await call('connect_mcc_texture_resources', { projectId: o.project.id });
    o.project.title = n === 0 ? 'Render QA Zombie Demo' : 'Render QA MCC Blood Gulch';
    await call('save_project', { project: o.project });
    maps[n] = o;
    await fs.writeFile(path.join(output, `map-${n}.json`), JSON.stringify(o));
    const pose = new PerspectiveCamera();
    pose.up.set(0, 0, 1);
    const closeups = args.has('--closeups'),
      position = closeups
        ? n === 0
          ? [100, -143, 2]
          : [40, -81.2, 2.3]
        : n === 0
          ? [31, -96, 2.1]
          : [47, -85, 4.4],
      target = closeups
        ? n === 0
          ? [97.2749, -139.50827, 0.8]
          : [40.05, -83.1, 2.3]
        : n === 0
          ? [35.6, -90.8, 1.8]
          : [40, -80.5, 2.3];
    pose.position.fromArray(position);
    pose.lookAt(new Vector3(...target));
    const tree = o.project.scene.find(
      (s) => s.name === (closeups ? 'boulder_doublewide · 2' : 'tree_leafy · 106'),
    );
    await page.evaluate(
      ({ id, pose, tree }) =>
        localStorage.setItem(
          'guilty-spark-map-session-v1:' + id,
          JSON.stringify({
            'world.playerView': false,
            'world.grid': false,
            'camera.world.PerspectiveCamera': pose,
            ...(tree
              ? {
                  'world.selection': tree.id,
                  'viewport.tags.request': tree.tagId,
                  'viewport.tags.source': id,
                }
              : {}),
            'layout.level': {
              version: 1,
              focus: false,
              panels: {
                'object-tags': {
                  open: !!tree,
                  dock: 'right',
                  width: 360,
                  height: 420,
                  x: 60,
                  y: 40,
                  pinned: false,
                },
              },
            },
          }),
        ),
      {
        id: o.project.id,
        pose: { type: 'PerspectiveCamera', position, quaternion: pose.quaternion.toArray(), target, zoom: 1 },
        tree,
      },
    );
    const ids = new Set([
        ...o.inspection.decals.map((d) => d.bitmapTagId),
        ...o.inspection.tags
          .filter((t) => /teleporter_shield|cap_moss/.test(t.path))
          .flatMap((t) => t.references)
          .filter((r) => r.class === 'bitm')
          .map((r) => r.targetId),
      ]),
      items = [];
    const requests = [...ids].map((bitmapTagId) => ({ bitmapTagId, imageIndex: 0 }));
    for (let k = 0; k < requests.length; k += 12) {
      const batch = await call('preview_owned_cache_bitmap_batch', {
        projectId: o.project.id,
        requests: requests.slice(k, k + 12),
      });
      items.push(...batch.items);
    }
    await fs.writeFile(path.join(output, `images-${n}.json`), JSON.stringify(items));
    receipt.maps.push({
      sourceSha256: o.inspection.sha256,
      sourceShaders: o.inspection.tags
        .filter((t) => /teleporter_shield|cap_moss/.test(t.path) && t.class !== 'bitm')
        .map((t) => ({ id: t.id, class: t.class, path: t.path, metadata: t.shaderPreview })),
      sourceDecals: o.inspection.decals.length,
      previewImages: items.map((e) => ({ id: e.bitmapTagId, ok: !!e.preview, error: e.error ?? null })),
    });
  }
  await page.reload();
  await call('plugin:window|maximize', { label: 'main' });
  await expect.poll(()=>call('plugin:window|is_maximized',{label:'main'})).toBe(true);
  const choose = async (name) => {
    const drawer = page.locator('.gs-navigation-drawer');
    if (!(await drawer.isVisible()))
      await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
    await drawer.getByRole('button', { name, exact: true }).click();
  };
  for (let n = 0; n < maps.length; n++) {
    await choose('Map library');
    await page
      .locator('.map-card')
      .filter({ has: page.getByRole('heading', { name: maps[n].project.title, exact: true }) })
      .click();
    const canvas = page.getByTestId('viewport').locator('canvas');
    await expect(canvas).toBeVisible();
    await expect
      .poll(() => page.locator('.world-layout').getAttribute('data-material-loading'), { timeout: 90000 })
      .toBe('false');
    await expect
      .poll(() => page.locator('.world-layout').getAttribute('data-pending-materials'), { timeout: 90000 })
      .toBe('0');
    await expect.poll(() => canvas.getAttribute('data-gs-camera-pose')).toBeTruthy();
    await page.screenshot({
      path: path.join(output, n === 0 ? 'zombie-models.png' : 'mcc-base-teleporter-decals.png'),
    });
    receipt.maps[n].viewport = await page.locator('.world-layout').evaluate((e) => ({ ...e.dataset }));
    receipt.maps[n].camera = JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
    console.log('captured', n, receipt.maps[n].viewport);
  }
  const controls = page.getByRole('group', { name: 'Window controls', exact: true });
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(1);
  receipt.windowControls = { normal: await controls.boundingBox() };
  receipt.headerBounds={normal:await page.locator('#gs-window-header').boundingBox()};
  receipt.windowControls.combinedHeader = await controls.boundingBox();
  await page.getByRole('button', { name: 'Close window', exact: true }).click({ trial: true });
  await page.keyboard.press('F11');
  await expect(page.locator('html')).toHaveAttribute('data-gs-fullscreen', 'true');
  receipt.windowControls.fullscreen = await controls.boundingBox();
  receipt.headerBounds.fullscreen=await page.locator('#gs-window-header').boundingBox();
  await page.getByRole('button', { name: 'Close window', exact: true }).click({ trial: true });
  await page.screenshot({ path: path.join(output, 'fullscreen-controls.png') });
  await page.keyboard.press('Escape');
  await choose('Tag editor');
  const weaponClass = page.getByRole('button', { name: /class \(weap\)/ });
  if ((await weaponClass.getAttribute('aria-expanded')) !== 'true') await weaponClass.click();
  const weaponTags = page.locator('.tag-class-group').filter({ has: weaponClass });
  await weaponTags
    .locator('.tag-row')
    .filter({ has: page.getByText('pistol', { exact: true }) })
    .first()
    .click();
  receipt.tagTree = {
    classes: await page.locator('.tag-class-toggle').count(),
    weaponTags: await weaponTags.locator('.tag-row').count(),
    editableFields: await page.locator('.field-table .property-row').count(),
  };
  await expect(page.locator('.tag-duplicate-panel')).toHaveCount(1);
  expect(receipt.tagTree.classes).toBeGreaterThan(10);
  expect(receipt.tagTree.weaponTags).toBeGreaterThan(1);
  expect(receipt.tagTree.editableFields).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(output, 'tag-class-editor.png') });
  for (const [key,rectangle] of Object.entries(receipt.windowControls)) {
    const header=key==='fullscreen'?receipt.headerBounds.fullscreen:receipt.headerBounds.normal;
    expect(Math.abs(rectangle.y+rectangle.height/2-header.y-header.height/2)).toBeLessThanOrEqual(1);
    expect(rectangle.height).toBeLessThanOrEqual(28);
  }
  await expect(page.getByRole('button', { name: 'Focus mode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tablist', { name: 'Open maps', exact: true })).toBeVisible();
  for (const map of receipt.maps) {
    const assigned = new Set(map.viewport.sourceShaderIds.split(',').map(Number));
    for (const shader of map.sourceShaders.filter((shader) => shader.metadata))
      expect(assigned.has(shader.id)).toBe(true);
  }
  for (const map of receipt.maps) expect(map.previewImages.every((image) => image.ok)).toBe(true);
  for (const i of before) expect(hash(await fs.readFile(i.path))).toBe(i.sha256);
  expect(receipt.errors).toEqual([]);
  await fs.writeFile(path.join(output, 'native-verification.json'), JSON.stringify(receipt, null, 2));
 } catch (e) {
  if(page)await fs.writeFile(path.join(output,'tag-dom-diagnostic.json'),JSON.stringify(await page.locator('.tag-duplicate-panel').evaluateAll(elements=>elements.map(element=>{
    const parents=[];let parent=element;for(let i=0;i<6&&parent;i++,parent=parent.parentElement)parents.push(parent.tagName+'.'+parent.className);
    const key=Object.keys(element).find(key=>key.startsWith('__reactFiber'));let fiber=element[key];const owners=[];for(let i=0;i<10&&fiber;i++,fiber=fiber.return)if(typeof fiber.type==='function')owners.push({name:fiber.type.name,code:String(fiber.type).slice(0,1200),source:fiber.memoizedProps?.source?.id});
    return {parents,owners,visible:!!element.getClientRects().length,html:element.outerHTML.slice(0,1500)};
  })),null,2)).catch(()=>{});
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(e), receipt }, null, 2),
  );
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
