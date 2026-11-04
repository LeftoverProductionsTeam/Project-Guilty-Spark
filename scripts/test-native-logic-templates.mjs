// Extend the accepted C63/C66 Workshop source through real desktop controls.
// No mocked IPC, new geometry system, game automation or copied complete SDK.
// The executable must embed its frontend (tauri/custom-protocol), not require Vite.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium, expect as assertion } from '@playwright/test';
import { openDrawer, chooseTool } from '../tests/ui/helpers/navigation.ts';
import { PerspectiveCamera, Vector3 } from 'three';
const expect = assertion.configure({ timeout: 60000 });
const args = process.argv.slice(2);
const resume = args.length === 8 && args[7] === '--resume-build';
const syntaxOnly = args.length === 8 && args[7] === '--check-syntax';
if (args.length !== 7 && !resume && !syntaxOnly)
  throw Error(
    'test-native-logic-templates <Spark.exe> <accepted Workshop project> <accepted cache> <bounded tags> <H1A kit> <Invader> <fresh output> [--resume-build | --check-syntax]',
  );
const [app, seed, cache, tags, kit, invader, output] = args.slice(0, 7).map((p) => path.resolve(p));
if (!resume && !syntaxOnly) await fs.mkdir(output);
const hash = async (p) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(p))
    .digest('hex');
// Native syntax failure/recovery needs only one copied scenario and its three
// source files. Never run this check against an accepted writable source tree.
async function checkNativeSyntax(accepted) {
  const root = path.join(output, 'syntax-trial');
  await fs.mkdir(root);
  const scenario = accepted.nativeBuild.sources.scenarioPath,
    workspace = accepted.nativeBuild.sources.directory,
    tagName = `${scenario.replaceAll('\\', '/')}.scenario`,
    dataPath = scenario.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  const names = ['gs_logic.hsc', ...accepted.sourceDocument.logic.handwrittenSources.map((s) => s.filename)];
  const originals = new Map();
  for (const relative of [
    `tags/${tagName}`,
    'data/global_scripts.hsc',
    ...names.map((name) => `data/${dataPath}/scripts/${name}`),
  ]) {
    const input = path.join(workspace, relative),
      target = path.join(root, relative);
    originals.set(input, await hash(input));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(input, target, fs.constants.COPYFILE_EXCL);
  }
  const run = promisify(execFile),
    compiler = path.join(invader, 'invader-script.exe'),
    editor = path.join(invader, 'invader-edit.exe'),
    compileArgs = [
      '-g',
      'mcc-cea',
      '-t',
      path.toNamespacedPath(path.join(root, 'tags')),
      '-d',
      path.toNamespacedPath(path.join(root, 'data')),
      scenario,
    ],
    tag = path.join(root, 'tags', tagName),
    manual = path.join(root, 'data', dataPath, 'scripts/manual_original.hsc'),
    original = await fs.readFile(manual, 'utf8');
  if (!original.includes('(c68_manual_value)'))
    throw Error('Requires the original C68 handwritten test function');
  const compile = async () =>
    run(compiler, compileArgs, { cwd: root, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  const before = performance.now();
  const valid = await compile();
  await fs.writeFile(path.join(root, 'valid-compiler.log'), valid.stdout + valid.stderr, { flag: 'wx' });
  const validScenarioHash = await hash(tag);
  const bad = original.replace('(c68_manual_value)', '(c68_unknown_native_function)');
  await fs.writeFile(manual, bad);
  let refused;
  try {
    await compile();
  } catch (error) {
    refused = error;
  }
  if (!refused || !Number.isInteger(refused.code) || refused.code === 0)
    throw Error('The real native compiler did not reject the invalid handwritten call');
  const diagnostic = String(refused.stdout ?? '') + String(refused.stderr ?? '');
  expect(diagnostic).toMatch(/c68_unknown_native_function/);
  expect(diagnostic).toMatch(/manual_original\.hsc/);
  await fs.writeFile(path.join(root, 'invalid-compiler.log'), diagnostic, { flag: 'wx' });
  expect(await hash(tag)).toBe(validScenarioHash);
  expect(await fs.readFile(manual, 'utf8')).toBe(bad);
  await fs.writeFile(manual, original);
  const restored = await compile();
  await fs.writeFile(path.join(root, 'restored-compiler.log'), restored.stdout + restored.stderr, {
    flag: 'wx',
  });
  const readback = await run(
    editor,
    ['-t', path.toNamespacedPath(path.join(root, 'tags')), '-G', 'scripts[*].name', `${scenario}.scenario`],
    { cwd: root, windowsHide: true, timeout: 30000 },
  );
  expect(readback.stdout.trim().split(/\r?\n/)).toEqual(expect.arrayContaining(accepted.nativeScriptNames));
  for (const [file, expected] of originals) expect(await hash(file)).toBe(expected);
  expect(await hash(accepted.nativeBuild.build.output)).toBe(accepted.nativeOutputSha256);
  return {
    complete: true,
    compilerSha256: await hash(compiler),
    copiedFiles: originals.size,
    elapsedMs: performance.now() - before,
    invalidExit: refused.code,
    diagnostic,
    previousGoodScenarioUnchanged: true,
    originalBuildAndSourcesUnchanged: true,
    restoredNativeScripts: readback.stdout.trim().split(/\r?\n/),
    gameplayVerified: false,
  };
}
if (syntaxOnly) {
  const accepted = JSON.parse(await fs.readFile(path.join(output, 'acceptance.json'), 'utf8'));
  if (
    !accepted.complete ||
    accepted.mockedIpc !== false ||
    accepted.appSha256 !== (await hash(app)) ||
    accepted.seedProjectSha256 !== (await hash(seed)) ||
    accepted.sourceCacheSha256 !== (await hash(cache))
  )
    throw Error('Syntax check requires unchanged completed genuine native authoring evidence');
  const result = await checkNativeSyntax(accepted);
  await fs.writeFile(path.join(output, 'syntax-acceptance.json'), JSON.stringify(result, null, 2), {
    flag: 'wx',
  });
  console.log(
    'PASS real Invader rejection of invalid handwritten source, preserved good scenario/cache, corrected-source compilation and script readback.',
  );
  process.exit(0);
}
const seedProject = JSON.parse(await fs.readFile(seed, 'utf8'));
if (
  !seedProject.quickForge?.workshop ||
  seedProject.quickForge.logic?.devices.length !== 1 ||
  seedProject.quickForge.logic?.rules.length !== 1 ||
  seedProject.quickForge.native
)
  throw Error('Requires the isolated accepted one-door Workshop source, not a shared or arbitrary project');
const receipt = {
  schemaVersion: 1,
  complete: false,
  mockedIpc: false,
  gameplayVerified: false,
  externalGuiEdited: false,
  seedProjectSha256: await hash(seed),
  sourceCacheSha256: await hash(cache),
  appSha256: await hash(app),
  projectTitle: seedProject.title,
  logicRuleCount: 4,
  checks: {},
  pageErrors: [],
};
if (resume) {
  const prior = JSON.parse(await fs.readFile(path.join(output, 'failure.json'), 'utf8'));
  if (
    prior.appSha256 !== receipt.appSha256 ||
    prior.sourceCacheSha256 !== receipt.sourceCacheSha256 ||
    prior.seedProjectSha256 !== receipt.seedProjectSha256 ||
    prior.mockedIpc !== false ||
    !prior.oneActionConnectionUndoRedo ||
    !prior.triggerTransformUndo ||
    !prior.saveReopenPreservesLogic ||
    !prior.sourceDocument ||
    prior.nativeBuild
  )
    throw Error(
      'Resume requires unchanged inputs and recorded genuine UI authoring through save/reopen, before native build',
    );
  Object.assign(receipt, prior, { error: undefined, stack: undefined, resumedAuthoring: true });
}
// An explicit Save-As source fixture avoids colliding with the seed's existing
// compiled namespace in the bounded tag set. No geometry, native tags or old
// accepted project is altered. Creators can start the same layout using the
// existing Two rooms + corridor + ramp action and a fresh map name.
const derived = structuredClone(seedProject);
derived.title = 'C68 native device templates';
derived.quickForge.name = derived.title;
derived.builds = [];
derived.quickForge.placements = [];
delete derived.quickForge.logic;
derived.nativeAssetImports = [];
const importedSeed = path.join(output, 'seed-copy.gsproject');
if (!resume) await fs.writeFile(importedSeed, JSON.stringify(derived, null, 2), { flag: 'wx' });
receipt.seedAdaptation =
  'Separate source copy: fresh name/build history, accepted room geometry retained. Remove inherited device/reference metadata in this copy only; a real door is dragged from the imported cache through native dependency admission.';
const socket = net.createServer();
await new Promise((r) => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const data = path.join(output, 'library');
const child = spawn(app, [], {
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
    .poll(() => {
      receipt.browserPages = browser
        .contexts()
        .flatMap((c) => c.pages())
        .map((p) => p.url());
      return receipt.browserPages.some((url) => url.includes('tauri.localhost'));
    })
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (e) => receipt.pageErrors.push(String(e)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      preferredHalo: 'mccSteam',
      hekDirectory: kit,
      hekTagsDirectory: tags,
      invaderDirectory: invader,
      hekFlavor: 'h1aEk',
    },
  });
  const [source] = resume ? [null] : await call('import_paths', { paths: [cache] });
  if (!resume) {
    const [imported] = await call('import_paths', { paths: [importedSeed] });
    receipt.projectId = imported.project.id;
    receipt.projectTitle = imported.project.title;
  }
  const state = async () => (await call('open_project', { id: receipt.projectId })).project.quickForge;
  const open = async () => {
    await page.reload();
    await page
      .locator('.map-card')
      .filter({ has: page.getByText(receipt.projectTitle, { exact: true }) })
      .first()
      .click();
    await chooseTool(page, 'Level editor');
  };
  const save = async () => {
    await page.keyboard.press('Control+s');
    await expect(page.locator('.runtime-dock-save')).toContainText('Saved');
  };
  const select = async (name) => {
    await openDrawer(page, 'Build tools');
    await page
      .locator('.forge-tree-select')
      .filter({ hasText: new RegExp(`^${name}$`) })
      .click();
    await openDrawer(page, 'Inspector');
    await page.getByRole('button', { name: 'Properties', exact: true }).click();
  };
  const field = async (label, value) => {
    const e = page.getByRole('spinbutton', { name: label, exact: true });
    await e.fill(String(value));
    await e.press('Tab');
  };
  const originalManual = (
    await fs.readFile(new URL('../docs/fixtures/c68-handwritten-original.hsc', import.meta.url), 'utf8')
  )
    .replaceAll('\r\n', '\n')
    .replaceAll('\n', '\r\n');
  let copied;
  await open();
  if (!resume) {
    const objectMode = page.getByRole('button', { name: 'Objects & gameplay', exact: true });
    if (await objectMode.isVisible()) await objectMode.click();
    const baseGeometry = await state();
    expect(baseGeometry.workshop).toEqual(seedProject.quickForge.workshop);
    await chooseTool(page, 'Map library');
    await page
      .locator('.map-card')
      .filter({ has: page.locator('h3', { hasText: source.project.title }) })
      .click();
    await page.getByRole('tab', { name: receipt.projectTitle, exact: true }).click();
    await chooseTool(page, 'Level editor');
    await openDrawer(page, 'Asset library');
    const assets = page.getByRole('region', { name: 'Asset library panel', exact: true });
    await assets
      .getByRole('combobox', { name: 'Asset library map', exact: true })
      .selectOption(source.project.id);
    await assets.getByRole('combobox', { name: 'Asset library type', exact: true }).selectOption('doors');
    const paletteDoor = assets.getByRole('button', { name: 'Add door small at view', exact: true });
    await paletteDoor.scrollIntoViewIfNeeded();
    const canvas = page.locator('.forge-viewport canvas');
    await expect(canvas).toHaveAttribute('data-gs-camera-pose', /position/);
    const rect = await canvas.boundingBox(),
      pose = JSON.parse(await canvas.getAttribute('data-gs-camera-pose'));
    const camera = new PerspectiveCamera(55, rect.width / rect.height, 0.03, 20000);
    camera.position.fromArray(pose.position);
    camera.quaternion.fromArray(pose.quaternion);
    camera.zoom = pose.zoom;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const point = new Vector3(6, 2, 0.05).project(camera),
      drop = { x: rect.x + ((point.x + 1) * rect.width) / 2, y: rect.y + ((1 - point.y) * rect.height) / 2 },
      from = await paletteDoor.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(drop.x, drop.y, { steps: 12 });
    await page.mouse.up();
    await expect.poll(async () => (await state()).placements.length, { timeout: 180000 }).toBe(1);
    await save();
    const nameFirst = page.getByRole('textbox', { name: 'Selected object name', exact: true });
    await nameFirst.fill('Corridor door');
    await nameFirst.press('Tab');
    await save();
    const baseline = await state(),
      first = baseline.placements[0];
    receipt.nativeAssetPointerDrop = { from, drop, pose };
    await select(first.name);
    await field('Position X', 12);
    await field('Position Y', 0);
    await field('Position Z', 0);
    await field('Rotation Z', 0);
    await page.getByRole('button', { name: 'Add trigger volume', exact: true }).click();
    await page.getByRole('button', { name: 'Cover both sides', exact: true }).click();
    await page.getByRole('button', { name: 'Enter → Open', exact: true }).click();
    await page.getByRole('button', { name: 'Leave → Close', exact: true }).click();
    await save();
    await fs.writeFile(path.join(output, 'original-handwritten.hsc'), originalManual, { flag: 'wx' });
    await page.locator('.forge-handwritten-sources > summary').click();
    await page.getByLabel('Import handwritten HaloScript', { exact: true }).setInputFiles({
      name: 'manual_original.hsc',
      mimeType: 'text/plain',
      buffer: Buffer.from(originalManual),
    });
    await expect(
      page.getByRole('textbox', { name: 'Handwritten HaloScript source', exact: true }),
    ).toHaveValue(originalManual.replaceAll('\r\n', '\n'));
    await save();
    expect((await state()).logic.handwrittenSources[0].content).toBe(originalManual);
    receipt.checks.originalCommentsAndCrLfRetained = true;
    await select(first.name);
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect(page.getByRole('textbox', { name: 'Selected object name', exact: true })).toHaveValue(
      `${first.name} copy`,
      { timeout: 120000 },
    );
    await save();
    const afterPaste = await state();
    expect(afterPaste.placements).toHaveLength(baseline.placements.length + 1);
    const second = afterPaste.placements.find((p) => !baseline.placements.some((b) => b.id === p.id));
    expect(second).toBeTruthy();
    const name = page.getByRole('textbox', { name: 'Selected object name', exact: true });
    await name.fill('Second corridor door');
    await name.press('Tab');
    for (const [axis, value] of [
      ['X', 18],
      ['Y', 0],
      ['Z', 0],
    ])
      await field(`Position ${axis}`, value);
    await page
      .getByRole('combobox', { name: 'Copy behavior from device', exact: true })
      .selectOption(first.id);
    const beforeCopy = await state();
    await page.getByRole('button', { name: 'Copy behavior', exact: true }).click();
    await save();
    copied = await state();
    expect(copied.logic.rules).toHaveLength(4);
    expect(copied.logic.devices).toHaveLength(2);
    expect(copied.logic.triggers).toHaveLength(2);
    const targetRules = copied.logic.rules.filter((r) =>
      r.actions.some((a) => a.kind !== 'delay' && a.targetId === second.id),
    );
    expect(targetRules).toHaveLength(2);
    expect(new Set(copied.logic.rules.map((r) => r.id)).size).toBe(4);
    expect(copied.logic.triggers[0].position).toEqual([12, 0, 1.5]);
    expect(copied.logic.triggers[1].position).toEqual([18, 0, 1.5]);
    await page.keyboard.press('Control+z');
    await save();
    expect((await state()).logic).toEqual(beforeCopy.logic);
    await page.keyboard.press('Control+y');
    await save();
    expect((await state()).logic).toEqual(copied.logic);
    receipt.oneActionConnectionUndoRedo = true;
    receipt.checks.independentBindings = true;
    const copiedTrigger = copied.logic.triggers[1];
    await select(copiedTrigger.name);
    await field('Trigger width', 8);
    await save();
    expect((await state()).logic.triggers.find((t) => t.id === copiedTrigger.id).dimensions[0]).toBe(8);
    await page.keyboard.press('Control+z');
    await save();
    // Numeric drafts commit on blur; Undo and immediate Save deliberately run
    // in the next animation frame. Wait for the persisted revision, not the
    // already-visible Saved label from the preceding revision.
    await expect.poll(async () => (await state()).logic).toEqual(copied.logic);
    receipt.triggerTransformUndo = true;
    receipt.placedDoor = copied.placements.find((p) => p.id === first.id);
    await page.screenshot({ path: path.join(output, 'logic-instances.png') });
    await open();
    expect((await state()).logic).toEqual(copied.logic);
    receipt.saveReopenPreservesLogic = true;
    receipt.sourceDocument = await state();
    expect(receipt.sourceDocument.workshop).toEqual(baseGeometry.workshop);
  } else {
    copied = receipt.sourceDocument;
    expect(await state()).toEqual(copied);
    expect(await fs.readFile(path.join(output, 'original-handwritten.hsc'), 'utf8')).toBe(originalManual);
  }
  // Build through the same visible action used by creators, not a substitute compiler.
  await expect(page.getByRole('button', { name: 'Build & check playtest', exact: true })).toBeEnabled();
  for (const label of ['Build tools', 'Asset library', 'Inspector']) {
    const panel = page.getByRole('region', { name: `${label} panel`, exact: true });
    if (await panel.isVisible())
      await panel.getByRole('button', { name: `Close ${label}`, exact: true }).click();
    await expect(panel).toBeHidden();
  }
  await page.getByRole('button', { name: 'Build & check playtest', exact: true }).click();
  const began = performance.now(),
    phases = [];
  let last = '';
  await expect
    .poll(
      async () => {
        const b = await call('bootstrap'),
          log = b.logs.findLast((l) => l.projectId === receipt.projectId);
        if (log?.phase !== last) {
          last = log?.phase ?? '';
          phases.push({ phase: last, elapsedMs: performance.now() - began, message: log?.message });
          console.log(JSON.stringify(phases.at(-1)));
        }
        const failure = b.logs.find((l) => l.projectId === receipt.projectId && l.phase === 'failed');
        if (failure) throw Error(failure.message);
        const report = await call('quickforge_build_report', { projectId: receipt.projectId });
        if (report?.status === 'blocked') throw Error(report.blockers.join('\n'));
        return report?.status;
      },
      { timeout: 900000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  receipt.nativeBuild = await call('quickforge_build_report', { projectId: receipt.projectId });
  receipt.nativeBuildMs = performance.now() - began;
  receipt.nativePhases = phases;
  receipt.nativeOutputSha256 = await hash(receipt.nativeBuild.build.output);
  const sources = receipt.nativeBuild.sources,
    scripts = path.join(
      sources.directory,
      'data',
      ...sources.scenarioPath.replaceAll('\\', '/').split('/').slice(0, -1),
      'scripts',
    );
  expect(await fs.readFile(path.join(scripts, 'manual_original.hsc'), 'utf8')).toBe(originalManual);
  receipt.generatedHsc = await fs.readFile(path.join(scripts, 'gs_logic.hsc'), 'utf8');
  const [built] = await call('import_paths', { paths: [receipt.nativeBuild.build.output] });
  receipt.nativeScriptNames = built.inspection.scripts.map((s) => s.name);
  expect(receipt.nativeScriptNames).toEqual(
    expect.arrayContaining(['gs_logic_init', 'c68_manual_value', 'c68_manual_init']),
  );
  const nativeName = (prefix, id) =>
    `gs_${prefix}_${crypto.createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
  expect(receipt.nativeScriptNames).toEqual(
    expect.arrayContaining(copied.logic.rules.map((r) => nativeName('evt', r.id))),
  );
  const run = promisify(execFile),
    values = {};
  const read = async (field) => {
    const r = await run(
      path.join(invader, 'invader-edit.exe'),
      [
        '-t',
        path.toNamespacedPath(path.join(sources.directory, 'tags')),
        '-G',
        field,
        `${sources.scenarioPath}.scenario`,
      ],
      { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 },
    );
    return r.stdout.trim();
  };
  expect((await read('object_names[*].name')).split(/\r?\n/)).toEqual(
    copied.logic.devices.map((b) => nativeName('obj', b.placementId)),
  );
  for (let i = 0; i < 2; i++) {
    for (const field of [
      `machines[${i}].name`,
      `trigger_volumes[${i}].type`,
      `trigger_volumes[${i}].name`,
      `trigger_volumes[${i}].starting_corner`,
    ])
      values[field] = await read(field);
    expect(values[`machines[${i}].name`]).toBe(String(i));
    expect(values[`trigger_volumes[${i}].type`]).toBe('rotational');
    expect(values[`trigger_volumes[${i}].name`]).toBe(nativeName('tv', copied.logic.triggers[i].id));
  }
  receipt.independentNativeReadback = values;
  expect(await hash(seed)).toBe(receipt.seedProjectSha256);
  expect(await hash(cache)).toBe(receipt.sourceCacheSha256);
  receipt.originalCacheUnchanged = true;
  receipt.checks.handwrittenExportUnchanged = true;
  receipt.syntaxCheck = await checkNativeSyntax(receipt);
  expect(receipt.pageErrors).toEqual([]);
  receipt.complete = true;
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(
    'PASS actual desktop template copy, source preservation, native compilation and independent instance readback; new gameplay is unverified.',
  );
} catch (e) {
  receipt.error = String(e);
  receipt.stack = e.stack;
  const failure = resume ? `failure-resume-${Date.now()}` : 'failure';
  await fs.writeFile(path.join(output, `${failure}.json`), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  await page?.screenshot({ path: path.join(output, `${failure}.png`) }).catch(() => {});
  throw e;
} finally {
  await browser?.close();
  child.kill();
}
