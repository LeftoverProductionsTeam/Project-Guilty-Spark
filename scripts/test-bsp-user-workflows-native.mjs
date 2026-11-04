// Real Spark/WebView + native source operations. No injected selection or mesh.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, expect as assertion } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
const [app, destination, kit, tags, invader] = process.argv.slice(2);
if (!destination)
  throw Error('test-bsp-user-workflows-native <Spark.exe> <fresh-output> [H1A-kit tags Invader]');
const root = path.resolve(destination),
  expect = assertion.configure({ timeout: 60000 });
await fs.mkdir(root);
const data = path.join(root, 'library'),
  exe = path.join(root, 'Spark-workflows.exe');
await fs.copyFile(path.resolve(app), exe, fs.constants.COPYFILE_EXCL);
const hash = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const report = {
  schemaVersion: 1,
  appSha256: await hash(exe),
  mockedIpc: false,
  gameplayTested: false,
  complete: false,
  errors: [],
};
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
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser, page;
const call = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
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
  page.on('pageerror', (error) => report.errors.push(String(error)));
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      ...(kit && tags && invader
        ? {
            hekDirectory: path.resolve(kit),
            hekTagsDirectory: path.resolve(tags),
            invaderDirectory: path.resolve(invader),
            hekFlavor: 'h1aEk',
          }
        : {}),
    },
  });
  const created = await call('create_quickforge_project', {
    title: 'Workshop user workflow',
    template: 'customBlank',
    target: 'mccSteam',
  });
  report.projectId = created.project.id;
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
  const workshop = page.getByLabel('Native BSP Workshop', { exact: true });
  await expect(workshop).toBeVisible();
  const state = async () => (await call('open_project', { id: created.project.id })).project.quickForge;
  const save = async () => {
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible();
  };
  const settled = async () =>
    expect(workshop.locator('.bsp-source-fields')).toHaveAttribute('aria-busy', 'false');
  const volume = (name) => workshop.locator('.bsp-source-list').getByRole('button').filter({ hasText: name });
  await volume('Room A').click();
  const name = page.getByRole('textbox', { name: 'Volume name', exact: true });
  await name.fill('Control room');
  await name.press('Enter');
  await settled();
  await save();
  await expect.poll(async () => (await state()).workshop.brushes[0].name).toBe('Control room');
  await page.keyboard.press('Control+z');
  await save();
  await expect.poll(async () => (await state()).workshop.brushes[0].name).toBe('Room A');
  await page.keyboard.press('Control+y');
  await save();
  await expect.poll(async () => (await state()).workshop.brushes[0].name).toBe('Control room');
  report.renameUndoImmediateSave = true;
  await workshop.locator('.bsp-workflow-guide>summary').click();
  await expect(workshop.locator('.bsp-workflow-guide')).toContainText('Cover both sides');
  await workshop.getByRole('button', { name: 'Draw corridor', exact: true }).click();
  await expect(workshop).toHaveAttribute('data-geometry-tool', 'drawPassage');
  await workshop.locator('.bsp-workflow-guide>summary').click();
  // Draw through the real orthographic pointer handler, not a source API setter.
  const top = page.getByLabel('top orthographic editing view');
  async function draw(tool, lo, hi, height) {
    await workshop.getByRole('button', { name: tool, exact: true }).click();
    const h = page.getByRole('spinbutton', { name: 'New volume height / depth', exact: true });
    await h.fill(String(height));
    await h.press('Tab');
    const box = await top.boundingBox();
    const p = ([x, y]) => ({
      x: box.x + ((x + 24) / 72) * box.width,
      y: box.y + ((18 - y) / 36) * box.height,
    });
    const a = p(lo),
      b = p(hi);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 10 });
    await page.mouse.up();
    await settled();
    await save();
  }
  await draw('Room', [-12, -2], [-7, 2], 4);
  await expect.poll(async () => (await state()).workshop.brushes.some((b) => b.name === 'Room 1')).toBe(true);
  await draw('Corridor', [35, -1], [42, 1], 3);
  await expect
    .poll(async () => (await state()).workshop.brushes.some((b) => b.name === 'Corridor 1'))
    .toBe(true);
  await draw('Ramp', [-3, -3], [3, 1], 1);
  await expect.poll(async () => (await state()).workshop.brushes.some((b) => b.name === 'Ramp 1')).toBe(true);
  const drawn = (await state()).workshop.brushes.slice(-3);
  expect(drawn.map((b) => [b.name, b.role, b.worldUv])).toEqual([
    ['Room 1', 'space', true],
    ['Corridor 1', 'space', true],
    ['Ramp 1', 'solid', true],
  ]);
  report.drawnSource = drawn;
  // Undo each drawing as one complete source operation.
  for (let count = 6; count >= 4; count--) {
    await page.keyboard.press('Control+z');
    await save();
    await expect.poll(async () => (await state()).workshop.brushes.length).toBe(count);
  }
  report.oneActionShapeUndo = true;
  for (const title of ['Corridor', 'Ramp']) {
    await volume(title).click();
    await workshop.getByRole('button', { name: 'Delete volume', exact: true }).click();
    await settled();
  }
  await save();
  await expect.poll(async () => (await state()).workshop.brushes.length).toBe(2);
  await volume('Control room').click();
  await workshop.getByRole('button', { name: 'Face', exact: true }).click();
  await page.getByRole('combobox', { name: 'BSP source face', exact: true }).selectOption('face-3');
  await expect(workshop).toHaveAttribute('data-part-gizmo', 'true');
  await workshop.locator('.bsp-seam-tools>summary').click();
  await page.getByRole('combobox', { name: 'Join target volume', exact: true }).selectOption('room-b');
  await page.getByRole('combobox', { name: 'Join target face', exact: true }).selectOption('face-5');
  await workshop.getByRole('button', { name: 'Create connecting corridor', exact: true }).click();
  await settled();
  await save();
  const joined = await state();
  expect(joined.workshop.brushes).toHaveLength(3);
  const validation = await call('quickforge_validate', { document: joined });
  expect(validation.valid).toBe(true);
  expect(validation.closedComponents).toBe(1);
  report.joined = { source: joined.workshop, validation };
  await page.keyboard.press('Control+z');
  await save();
  expect((await state()).workshop.brushes).toHaveLength(2);
  await page.keyboard.press('Control+y');
  await save();
  expect((await state()).workshop.brushes).toHaveLength(3);
  report.oneActionJoinUndoRedo = true;
  // Click a known outside wall. Its inward-rendered far wall used to intercept this ray.
  await workshop.getByRole('button', { name: 'Face', exact: true }).click();
  const canvas = workshop.locator('canvas');
  await expect(canvas).toHaveAttribute('data-gs-camera-pose', /position/);
  await page.waitForTimeout(250);
  const pose = JSON.parse(await canvas.getAttribute('data-gs-camera-pose')),
    box = await canvas.boundingBox();
  const camera = new PerspectiveCamera(60, box.width / box.height, 0.03, 20000);
  camera.position.fromArray(pose.position);
  camera.quaternion.fromArray(pose.quaternion);
  camera.updateMatrixWorld();
  const point = new Vector3(0, -6, 2.5).project(camera),
    click = { x: box.x + ((point.x + 1) * box.width) / 2, y: box.y + ((1 - point.y) * box.height) / 2 };
  await page.mouse.click(click.x, click.y);
  await expect(workshop).toHaveAttribute('data-selected-brush', 'room-a');
  await expect(workshop).toHaveAttribute('data-selected-face', 'face-2');
  await expect(workshop).toHaveAttribute('data-part-gizmo', 'true');
  report.nearestFacePointer = { pose, box, click, expected: 'room-a:face-2' };
  // Move this real face with its world Y handle. The saved source, not a
  // DOM label or simulated pointer event, is the assertion's authority.
  const projectPoint = (p) => {
    const q = new Vector3(...p).project(camera);
    return {x: box.x + (q.x + 1) * box.width / 2, y: box.y + (1 - q.y) * box.height / 2};
  };
  const pivot = new Vector3(0, -6, 2.5);
  // drei currently uses three-stdlib's handle scale (/7), not three/examples (/4).
  const factor = camera.position.distanceTo(pivot) * Math.min(1.9 * Math.tan(Math.PI / 6), 7) / 7;
  const direction = Math.sign(camera.position.y - pivot.y);
  const start = projectPoint([0, -6 + direction * factor * .7, 2.5]);
  const end = projectPoint([0, -5 + direction * factor * .7, 2.5]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, {steps: 18});
  await page.mouse.up();
  await settled();
  await save();
  const moved = (await state()).workshop.brushes.find(b => b.id === 'room-a');
  const original = joined.workshop.brushes.find(b => b.id === 'room-a');
  const selected = original.faces.find(f => f.id === 'face-2').vertices;
  for(let i=0;i<moved.vertices.length;i++) {
    expect(moved.vertices[i][0]).toBeCloseTo(original.vertices[i][0], 4);
    expect(moved.vertices[i][1]).toBeCloseTo(original.vertices[i][1] + (selected.includes(i) ? 1 : 0), 4);
    expect(moved.vertices[i][2]).toBeCloseTo(original.vertices[i][2], 4);
  }
  report.faceAxisPointerDrag = {start,end,movedVertices:selected};
  await page.keyboard.press('Control+z');
  await save();
  expect((await state()).workshop).toEqual(joined.workshop);
  report.oneActionFaceDragUndo = true;
  await workshop.getByRole('button', {name:'Edge', exact:true}).click();
  const edgePoint = projectPoint([0,-6,4.98]);
  await page.mouse.click(edgePoint.x, edgePoint.y);
  await expect(workshop).toHaveAttribute('data-selected-brush','room-a');
  await expect.poll(async()=>(await workshop.getAttribute('data-selected-vertices')).split(',').filter(Boolean).length).toBe(2);
  await expect(workshop).toHaveAttribute('data-part-gizmo','true');
  report.nearestEdgePointer = true;
  await workshop.getByRole('button', {name:'Face', exact:true}).click();
  await page.screenshot({ path: path.join(root, 'named-room-face-gizmo.png') });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
    .click();
  await expect(page.getByLabel('Native BSP Workshop')).toBeVisible();
  expect((await state()).workshop).toEqual(joined.workshop);
  report.reopenedSourceIdentical = true;
  if (kit && tags && invader) {
    const controls = page
      .locator('.bsp-source-fields details')
      .filter({ has: page.locator('summary', { hasText: 'Halo material paths & player starts' }) });
    await controls.locator('summary').click();
    const shader = page.getByRole('textbox', { name: 'Shader path surface', exact: true });
    await shader.fill('levels/test/tutorial/shaders/example_tutorial_metal_floor');
    await shader.press('Tab');
    await settled();
    const sky = controls.getByRole('textbox').last();
    await sky.fill('levels/test/bloodgulch/bloodgulch');
    await sky.press('Tab');
    await settled();
    await save();
    await controls.locator('summary').click();
    await page.getByRole('button', { name: 'Build & check playtest', exact: true }).click();
    const began = performance.now();
    await expect
      .poll(
        async () => {
          const status = await call('quickforge_build_report', { projectId: created.project.id });
          const logs = (await call('bootstrap')).logs,
            failure = logs.find((l) => l.projectId === created.project.id && l.phase === 'failed');
          if (failure) throw Error(failure.message);
          return status?.status;
        },
        { timeout: 900000, intervals: [1500] },
      )
      .toBe('validated');
    const receipt = await call('quickforge_build_report', { projectId: created.project.id });
    report.nativeBuild = { elapsedMs: performance.now() - began, ...receipt };
    const cache = receipt.build.output;
    expect(await hash(cache)).toBe(receipt.build.sha256);
    const [readback] = await call('import_paths', { paths: [cache] });
    expect(readback.inspection.mesh.indices.length).toBeGreaterThan(0);
    expect(readback.inspection.renderMesh.indices.length).toBeGreaterThan(0);
    report.nativeRenderAndCollisionReadback = {
      sourceSha256: readback.inspection.sha256,
      renderTriangles: readback.inspection.renderMesh.indices.length / 3,
      collisionTriangles: readback.inspection.mesh.indices.length / 3,
    };
  }
  expect(report.errors).toEqual([]);
  report.complete = true;
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(report, null, 2));
  console.log(
    'PASS actual named-volume drawing, source-face picking, seam join, Undo/Save/reopen and optional native build.',
  );
} catch (error) {
  report.error = String(error);
  report.stack = error.stack;
  await page?.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(root, 'failure.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close().catch(() => {});
  child.kill();
}
