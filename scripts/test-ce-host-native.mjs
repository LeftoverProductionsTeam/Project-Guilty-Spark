// Opt-in real Spark -> checked private game copy -> CE dedicated process test.
// No mocked IPC, original game writes, public host, client join or gameplay claim.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import dgram from 'node:dgram';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 45000 });
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (
    !['--app', '--runtime', '--output', '--map'].includes(process.argv[i]) ||
    !process.argv[i + 1] ||
    args.has(process.argv[i])
  )
    throw Error(
      'Use unique --app Spark.exe --runtime owned-CE --output fresh-short-folder [--map compiled-CE.map]',
    );
  args.set(process.argv[i], path.resolve(process.argv[i + 1]));
}
for (const key of ['--app', '--runtime', '--output']) if (!args.has(key)) throw Error('Missing ' + key);
const output = args.get('--output'),
  original = args.get('--runtime');
if (output.length > 115) throw Error('Choose a short fresh output directory for CE');
await fs.mkdir(output);
const hash = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
async function inventory(root, relative = '', result = {}) {
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Owned input contains a link');
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) await inventory(root, name, result);
    else if (entry.isFile()) result[name.replaceAll('\\', '/')] = await hash(path.join(root, name));
    if (Object.keys(result).length > 2000) throw Error('Owned input exceeds the QA inventory bound');
  }
  return result;
}
const before = await inventory(original),
  receipt = {
    schemaVersion: 1,
    appSha256: await hash(args.get('--app')),
    mockedIpc: false,
    network: '127.0.0.1 only',
    publicListingRequested: false,
    clientJoined: false,
    gameplayVerified: false,
    complete: false,
    cases: [],
    errors: [],
  };
const runtime = path.join(output, 'runtime');
await fs.cp(original, runtime, { recursive: true, force: false, errorOnExist: true });
if (args.has('--map'))
  await fs.copyFile(
    args.get('--map'),
    path.join(runtime, 'maps', path.basename(args.get('--map'))),
    fs.constants.COPYFILE_EXCL,
  );
const exe = path.join(output, 'GuiltySpark-CE-host-qa.exe');
await fs.copyFile(args.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const endpoint = net.createServer();
await new Promise((r) => endpoint.listen(0, '127.0.0.1', r));
const debugPort = endpoint.address().port;
await new Promise((r) => endpoint.close(r));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(output, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
      '--remote-debugging-port=' +
      debugPort +
      ' --disable-background-timer-throttling --disable-renderer-backgrounding',
  },
});
let browser;
const invoke = (page, command, a = {}) =>
  page.evaluate(({ command, a }) => window.__TAURI_INTERNALS__.invoke(command, a), { command, a });
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const step = (name, data = {}) => {
  receipt.cases.push({ name, ...data });
  console.log(JSON.stringify({ passed: name, ...data }));
};
async function waitNative(page) {
  let view;
  await expect
    .poll(
      async () => {
        view = await invoke(page, 'ce_host_status');
        if (view?.phase === 'failed') throw Error(view.detail + '\n' + view.consoleTail);
        return view?.phase === 'running' && !!view.status;
      },
      { timeout: 60000, intervals: [100, 250, 500] },
    )
    .toBe(true);
  return view;
}
async function stop(page, id) {
  await invoke(page, 'ce_host_stop', { sessionId: id });
  await expect.poll(async () => (await invoke(page, 'ce_host_status'))?.phase).toBe('stopped');
}
try {
  await expect
    .poll(() =>
      fetch('http://127.0.0.1:' + debugPort + '/json/version').then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + debugPort);
  const pages = () =>
    browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((page) => page.url().includes('tauri.localhost'));
  await expect.poll(() => pages().length).toBeGreaterThan(0);
  const page = pages()[0];
  page.on('pageerror', (e) => receipt.errors.push(String(e)));
  const call = (command, a = {}) => invoke(page, command, a);
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      preferredHalo: 'haloCustomEdition',
      onboardingCompleted: true,
      autoBuild: false,
    },
  });
  await call('register_runtime', {
    registration: {
      id: crypto.randomUUID(),
      runtimeId: 'haloCustomEdition',
      root: runtime,
      executable: path.join(runtime, 'haloce.exe'),
      dataRoot: runtime,
      version: null,
      networkVersion: null,
    },
  });
  await page.reload();
  const catalogStart = performance.now();
  const catalog = await call('ce_host_catalog');
  const catalogMs = Math.round(performance.now() - catalogStart);
  const bloodgulch = catalog.maps.find((map) => map.name === 'bloodgulch');
  expect(bloodgulch).toBeTruthy();
  expect(catalog.executableSha256).toBe(await hash(path.join(runtime, 'haloceded.exe')));
  const request = {
    map: bloodgulch.name,
    mapSha256: bloodgulch.sha256,
    executableSha256: catalog.executableSha256,
    gameType: 'slayer',
    maximumPlayers: 2,
    port: 0,
    name: 'Spark private',
  };
  for (const invalid of [
    { ...request, mapSha256: '0'.repeat(64) },
    { ...request, executableSha256: '0'.repeat(64) },
    { ...request, maximumPlayers: 128 },
    { ...request, name: 'bad\nquit' },
    { ...request, map: '../bloodgulch' },
    { ...request, command: 'quit' },
  ])
    expect(await call('ce_host_start', { request: invalid }).then(() => '', String)).not.toBe('');
  expect(await call('ce_host_status')).toBeNull();
  step('catalog and unsafe/stale request refusal', { maps: catalog.maps.length, catalogMs });
  const drawer = page.locator('.gs-navigation-drawer');
  if (!(await drawer.isVisible()))
    await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await drawer.getByRole('button', { name: 'Online', exact: true }).click();
  await page.getByRole('button', { name: 'Host game', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Runtime adapter', exact: true })
    .selectOption('haloCustomEdition');
  const panel = page.getByRole('region', { name: 'Custom Edition private host', exact: true });
  await expect(panel).toBeVisible();
  const began = performance.now();
  await panel.getByRole('button', { name: 'Start private server', exact: true }).click();
  const editorHeartbeatMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const began = performance.now();
        setTimeout(() => resolve(Math.round(performance.now() - began)), 50);
      }),
  );
  const initial = await waitNative(page);
  expect(initial.status.players).toBe(0);
  expect(initial.status.dedicated).toBe(true);
  expect(initial.status.map).toBe('bloodgulch');
  await expect(panel.getByRole('status')).toHaveText('Map loaded');
  expect(await hash(path.join(initial.sessionDirectory, 'game/maps/bloodgulch.map'))).toBe(bloodgulch.sha256);
  const config = await fs.readFile(path.join(initial.sessionDirectory, 'init.txt'), 'utf8');
  expect(config).toContain('sv_public false');
  expect(config).not.toContain('rcon');
  expect(await call('ce_host_start', { request }).then(() => '', String)).toContain('existing private');
  step('real UI start and native Blood Gulch status', {
    editorHeartbeatMs,
    startupMs: Math.round(performance.now() - began),
    id: initial.id,
    processId: initial.processId,
    port: initial.port,
    status: initial.status,
    mapSha256: initial.mapSha256,
    serverSha256: initial.executableSha256,
    copiedBytes: initial.copiedBytes,
  });
  await panel.getByText('Session details & output', { exact: true }).click();
  await page.screenshot({ path: path.join(output, 'native-host.png') });
  // Reload preserves native ownership even though the React workspace remounts.
  await page.reload();
  expect((await call('ce_host_status')).id).toBe(initial.id);
  step('workspace reload retains the owned native session');
  const priorPages = pages();
  await call('open_workspace_window', { workspace: 'runtimes', context: null });
  await expect.poll(() => pages().length).toBe(priorPages.length + 1);
  const other = pages().find((candidate) => !priorPages.includes(candidate));
  await expect.poll(() => other.evaluate(() => !!window.__TAURI_INTERNALS__)).toBe(true);
  expect(await invoke(other, 'ce_host_status')).toBeNull();
  expect(await invoke(other, 'ce_host_stop', { sessionId: initial.id }).then(() => '', String)).toContain(
    'another window',
  );
  await invoke(other, 'ce_host_start', {
    request: {
      ...request,
      map: 'sidewinder',
      mapSha256: catalog.maps.find((map) => map.name === 'sidewinder').sha256,
      name: 'Spark second',
    },
  });
  const secondary = await waitNative(other);
  expect(secondary.port).not.toBe(initial.port);
  await other.reload();
  await other.getByRole('button', { name: 'Host game', exact: true }).click();
  await other
    .getByRole('combobox', { name: 'Runtime adapter', exact: true })
    .selectOption('haloCustomEdition');
  await expect(other.getByLabel('Private CE map')).toHaveValue('sidewinder');
  await expect(other.getByLabel('Private CE player limit')).toHaveValue('2');
  await other.getByText('Name & port', { exact: true }).click();
  await expect(other.getByLabel('Private CE server name')).toHaveValue('Spark second');
  await invoke(other, 'close_application').catch((e) => {
    if (!/closed|destroyed/i.test(String(e))) throw e;
  });
  await expect.poll(() => alive(secondary.processId)).toBe(false);
  expect((await call('ce_host_status')).id).toBe(initial.id);
  await waitNative(page);
  step('separate windows cannot stop each other and closing a window stops only its own server');
  await stop(page, initial.id);
  await expect.poll(() => alive(initial.processId)).toBe(false);
  for (const gameType of ['ctf', 'oddball', 'king', 'race']) {
    await call('ce_host_start', { request: { ...request, gameType } });
    const view = await waitNative(page);
    await stop(page, view.id);
    step('native game type ' + gameType, {
      reportedGameType: view.status.gameType,
      observations: view.observations,
    });
  }
  if (args.has('--map')) {
    const name = path.basename(args.get('--map'), '.map');
    const selected = catalog.maps.find((map) => map.name === name);
    expect(selected).toBeTruthy();
    await call('ce_host_start', { request: { ...request, map: name, mapSha256: selected.sha256 } });
    const view = await waitNative(page);
    await stop(page, view.id);
    expect(view.mapSha256).toBe(await hash(args.get('--map')));
    step('unchanged compiler-produced CE map loads', {
      map: name,
      mapSha256: view.mapSha256,
      status: view.status,
    });
  }
  const occupied = dgram.createSocket('udp4');
  await new Promise((r) => occupied.bind(0, '127.0.0.1', r));
  const port = occupied.address().port;
  try {
    await call('ce_host_start', { request: { ...request, port } });
    let failed;
    await expect
      .poll(async () => {
        failed = await call('ce_host_status');
        return failed.phase;
      })
      .toBe('failed');
    expect(failed.processId).toBeNull();
    expect(failed.detail).toContain('already in use');
  } finally {
    occupied.close();
  }
  step('occupied private port fails without launching a process');
  const cache = path.join(runtime, 'maps/bloodgulch.map'),
    bytes = await fs.readFile(cache);
  try {
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 1;
    await fs.writeFile(cache, changed);
    expect(await call('ce_host_start', { request }).then(() => '', String)).toContain('changed');
  } finally {
    await fs.writeFile(cache, bytes);
  }
  step('actual changed selected cache refuses a stale start');
  await call('ce_host_start', { request });
  const final = await waitNative(page);
  child.kill(); // Real abrupt parent exit tests Windows job-object cleanup.
  await expect.poll(() => alive(final.processId)).toBe(false);
  step('abrupt Spark exit kills its owned dedicated server');
  expect(await inventory(original)).toEqual(before);
  expect(receipt.errors).toEqual([]);
  receipt.originalFilesUnchanged = Object.keys(before).length;
  receipt.complete = true;
} catch (e) {
  receipt.errors.push(String(e));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({ complete: receipt.complete, cases: receipt.cases.length, errors: receipt.errors }),
  );
}
