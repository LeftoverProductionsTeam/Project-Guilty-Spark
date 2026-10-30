// Opt-in native loose-tag import/placement -> Spark detection/build/reopen.
// Uses a fresh qa_runtime_library replica. Never launches Halo or edits SDK tags.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  if (
    !['--app', '--data', '--output', '--kit', '--invader', '--compile'].includes(process.argv[at]) ||
    !process.argv[at + 1] ||
    args.has(process.argv[at])
  )
    throw Error('Use unique named arguments');
  args.set(process.argv[at], process.argv[at + 1]);
}
if (args.size !== 6 || args.get('--compile') !== 'true')
  throw Error(
    'Required: --app built.exe --data fresh-qa-library --output fresh-directory --kit HCEEK --invader Invader --compile true',
  );
const data = path.resolve(args.get('--data')),
  output = path.resolve(args.get('--output'));
const fixture = JSON.parse(await fs.readFile(path.join(data, 'spark-native-ui-fixture.json'), 'utf8'));
const seed = JSON.parse(await fs.readFile(path.join(data, 'qa-seed-receipt.json'), 'utf8'));
if (
  !fixture.nativeFixture ||
  fixture.schemaVersion !== 1 ||
  fixture.projectId !== seed.projectId ||
  path.resolve(seed.library) !== data
)
  throw Error('Only an explicit isolated QA replica is accepted');
await fs.mkdir(output);
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const readHash = async (p) => hash(await fs.readFile(p));
async function inventory(root, relative = '', result = {}) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name),
      file = path.join(root, name);
    if (entry.isSymbolicLink()) throw Error('QA source contains a link');
    if (entry.isDirectory()) await inventory(root, name, result);
    else if (entry.isFile()) {
      if (Object.keys(result).length >= 20000) throw Error('QA source exceeds file bound');
      result[name] = await readHash(file);
    } else throw Error('QA source contains a special file');
  }
  return result;
}
const originalTags = path.join(seed.sourceJob, 'workspace', 'tags'),
  originalInventory = await inventory(originalTags);
const exe = path.join(output, 'GuiltySpark-combined-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), exe, fs.constants.COPYFILE_EXCL);
const endpoint = net.createServer();
await new Promise((r) => endpoint.listen(0, '127.0.0.1', r));
const port = endpoint.address().port;
await new Promise((r) => endpoint.close(r));
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
let browser, call;
const errors = [],
  run = promisify(execFile);
const receipt = {
  schemaVersion: 1,
  nativeDesktop: true,
  gameLaunched: false,
  gameMemoryTouched: false,
  gameplayAccepted: false,
  scope:
    'Native loose-tag edit/import/placement through Invader; Spark save detection, native compilation, cache readback and tab reopening. This does not certify arbitrary imported OBJ placement builds.',
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
      hekDirectory: path.resolve(args.get('--kit')),
      hekFlavor: 'h1aEk',
      invaderDirectory: path.resolve(args.get('--invader')),
    },
  });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
    .click();
  const original = (await call('open_project', { id: fixture.projectId })).project;
  const parent = original.builds.find((b) => b.id === fixture.workingBuildId);
  expect(parent.status).toBe('validated');
  const parentHash = await readHash(parent.output);
  const before = (await call('open_built_map', { projectId: original.id, buildId: parent.id })).inspection;
  const watch = await call('working_tag_watch_start', { projectId: original.id });
  expect(watch.changedFiles).toBe(0);
  const plan = await call('prepare_runtime_tool', {
    runtimeId: 'mccSteam',
    projectId: original.id,
    actionId: 'editTags',
  });
  const tags = await fs.realpath(plan.tagsDirectory),
    jobs = await fs.realpath(path.join(data, 'jobs'));
  if (!tags.startsWith(jobs + path.sep)) throw Error('Source is outside the explicit QA replica');
  const scenario = path.relative(tags, await fs.realpath(plan.scenarioFile));
  if (scenario.startsWith('..') || path.isAbsolute(scenario) || !scenario.endsWith('.scenario'))
    throw Error('Invalid scenario source');
  const edit = path.resolve(args.get('--invader'), 'invader-edit.exe');
  const native = async (tag, ...options) =>
    (
      await run(edit, ['-t', tags, ...options, tag], {
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
    ).stdout.trim();
  const pistol = 'weapons/pistol/pistol.weapon',
    radius = Number(await native(pistol, '-G', 'bounding_radius')),
    expected = radius + 0.125;
  const equipmentCount = Number(await native(scenario, '-C', 'netgame_equipment'));
  if (!Number.isSafeInteger(equipmentCount) || equipmentCount < 0 || equipmentCount > 10000)
    throw Error('Invalid native equipment count');
  const starts = Number(await native(scenario, '-C', 'player_starting_locations'));
  await native(pistol, '-S', 'bounding_radius', String(expected));
  expect(Number(await native(pistol, '-G', 'bounding_radius'))).toBeCloseTo(expected, 6);
  const imported = 'weapons/spark_qa/imported_pistol.weapon';
  await fs.mkdir(path.dirname(path.join(tags, imported)), { recursive: true });
  await fs.copyFile(path.join(tags, pistol), path.join(tags, imported), fs.constants.COPYFILE_EXCL);
  expect(await readHash(path.join(tags, imported))).toBe(await readHash(path.join(tags, pistol)));
  const collection = 'item_collections/spark_qa/imported_pistol.item_collection';
  await fs.mkdir(path.dirname(path.join(tags, collection)), { recursive: true });
  await native(
    collection,
    '-N',
    '-I',
    'permutations',
    '1',
    'end',
    '-S',
    'permutations[0].weight',
    '1',
    '-S',
    'permutations[0].item',
    imported,
    '-S',
    'default_spawn_time',
    '30',
  );
  const prefix = `netgame_equipment[${equipmentCount}]`,
    position = [2, 0, 0.1];
  await native(
    scenario,
    '-I',
    'netgame_equipment',
    '1',
    'end',
    '-S',
    `${prefix}.position`,
    position.join(','),
    '-S',
    `${prefix}.facing`,
    '0',
    '-S',
    `${prefix}.team_index`,
    '0',
    '-S',
    `${prefix}.spawn_time`,
    '30',
    '-S',
    `${prefix}.type_0`,
    'all_games',
    '-S',
    `${prefix}.item_collection`,
    collection,
  );
  expect(Number(await native(scenario, '-C', 'netgame_equipment'))).toBe(equipmentCount + 1);
  expect(Number(await native(scenario, '-C', 'player_starting_locations'))).toBe(starts);
  let observed;
  const detectionStarted = performance.now();
  await expect
    .poll(
      async () => {
        observed = await call('working_tag_watch_poll', { watchId: watch.watchId, force: false });
        return (
          observed.status !== 'saving' &&
          observed.changedFiles === 4 &&
          observed.integrity.pendingFiles === 0 &&
          observed.integrity.nativeParserCheckedFiles === 4
        );
      },
      { timeout: 45000, intervals: [500, 1500] },
    )
    .toBe(true);
  expect(observed.integrity.invalidFiles).toBe(0);
  receipt.externalEdits = {
    writer: 'Invader',
    executableSha256: await readHash(edit),
    changedFiles: observed.changes,
    nativeValidation: observed.integrity,
    stableDetectionMs: performance.now() - detectionStarted,
  };
  await expect(page.getByRole('button', { name: '4 saved tool edits', exact: true })).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole('button', { name: '4 saved tool edits', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Build working tag edits', exact: true })).toBeEnabled();
  await page.screenshot({ path: path.join(output, 'native-import-placement-review.png') });
  const started = performance.now();
  await page.getByRole('button', { name: 'Build working tag edits', exact: true }).click();
  let built;
  await expect
    .poll(
      async () => {
        const state = await call('bootstrap'),
          failed = state.logs.find((e) => e.projectId === original.id && e.phase === 'failed');
        if (failed) throw Error(failed.message);
        built = (await call('open_project', { id: original.id })).project.builds.find(
          (b) => b.id !== parent.id && b.timestamp > parent.timestamp,
        );
        return built?.status;
      },
      { timeout: 240000, intervals: [1000, 2500] },
    )
    .toBe('validated');
  receipt.nativeBuildMs = performance.now() - started;
  const reopened = await call('open_built_map', { projectId: original.id, buildId: built.id });
  const weapon = reopened.inspection.tags.find(
    (t) => t.class === 'weap' && t.path.replaceAll('\\', '/').endsWith('weapons/spark_qa/imported_pistol'),
  );
  const item = reopened.inspection.tags.find(
    (t) =>
      t.class === 'itmc' &&
      t.path.replaceAll('\\', '/').endsWith('item_collections/spark_qa/imported_pistol'),
  );
  expect(weapon).toBeTruthy();
  expect(item).toBeTruthy();
  expect(
    weapon.fields.find((f) => f.label === 'Bounding radius' || f.key === 'bounding_radius')?.value,
  ).toBeCloseTo(expected, 6);
  const placed = reopened.inspection.objects.find(
    (o) =>
      [weapon.id, item.id].includes(o.tagId) &&
      o.position.every((v, i) => Math.abs(v - position[i]) < 0.00001),
  );
  expect(placed).toBeTruthy();
  for (const old of before.objects) {
    const retained = reopened.inspection.objects.find((o) => o.id === old.id);
    expect(retained).toBeTruthy();
    for (const key of ['kind', 'name', 'position', 'rotation', 'scale'])
      expect(retained[key]).toEqual(old[key]);
  }
  const compiledTags = path.join(data, 'jobs', built.id, 'workspace', 'tags');
  const editedHashes = await inventory(tags),
    compiledHashes = await inventory(compiledTags);
  expect(compiledHashes).toEqual(editedHashes);
  expect(await inventory(originalTags)).toEqual(originalInventory);
  expect(await readHash(parent.output)).toBe(parentHash);
  const after = (await call('open_project', { id: original.id })).project;
  for (const key of ['scene', 'tagEdits', 'quickForge']) expect(after[key]).toEqual(original[key]);
  await page.getByRole('button', { name: 'Runtime and tool details', exact: true }).click();
  await page.getByRole('button', { name: 'Open working-tags build', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('tab').first().click();
  await page.reload();
  // Open-tab restoration at application startup is not implemented. Exercise
  // the supported, explicit saved-project reopen route through the library.
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: original.title, exact: true }) })
    .click();
  await page.getByRole('button', { name: 'Guilty Spark home', exact: true }).click();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: reopened.project.title, exact: true }) })
    .click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  receipt.workflow = {
    nativeTagEditedAndSaved: true,
    nativeWeaponImported: true,
    nativeScenarioItemPlaced: true,
    compiledRadius: weapon.fields.find((f) => f.label === 'Bounding radius')?.value,
    compiledPlacement: { kind: placed.kind, position: placed.position },
    existingObjectsPreserved: before.objects.length,
    initialPlayerStarts: starts,
    originalSourceFilesVerified: Object.keys(originalInventory).length,
    allCompilerInputTagBytesPreserved: true,
    priorCacheUnchanged: true,
    projectOverlayUnchanged: true,
    twoTabsReopened: true,
    explicitLibraryReopen: true,
    automaticStartupTabRestoration: false,
  };
  receipt.appSha256 = await readHash(exe);
  receipt.compiledSha256 = built.sha256;
  receipt.errors = errors;
  expect(errors).toEqual([]);
  await page.screenshot({ path: path.join(output, 'native-combined-workflow-reopened.png') });
  await fs.writeFile(
    path.join(output, 'native-combined-workflow-receipt.json'),
    JSON.stringify(receipt, null, 2),
  );
  console.log('PASS', JSON.stringify(receipt));
} catch (error) {
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), receipt, errors }, null, 2),
  );
  throw error;
} finally {
  if (call) await call('request_close_window').catch(() => {});
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
