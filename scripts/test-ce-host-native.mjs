// Opt-in real Spark -> checked private game copy -> CE dedicated process test.
// No mocked IPC, original game writes, public host, client join or gameplay claim.
// --client-seconds opts into actual GUI client launches and owned-child cleanup.
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
    ![
      '--app',
      '--runtime',
      '--output',
      '--map',
      '--kit',
      '--invader',
      '--recovery',
      '--client-seconds',
    ].includes(process.argv[i]) ||
    !process.argv[i + 1] ||
    args.has(process.argv[i])
  )
    throw Error(
      'Use unique --app Spark.exe --runtime owned-CE --output fresh-short-folder [--map compiled-CE.map]',
    );
  args.set(
    process.argv[i],
    process.argv[i] === '--client-seconds' ? process.argv[i + 1] : path.resolve(process.argv[i + 1]),
  );
}
const clientSeconds = Number(args.get('--client-seconds') ?? 0);
if (
  args.has('--client-seconds') &&
  (!Number.isInteger(clientSeconds) || clientSeconds < 5 || clientSeconds > 120)
)
  throw Error('Client observation requires an integer from 5 to 120 seconds');
for (const key of ['--app', '--runtime', '--output']) if (!args.has(key)) throw Error('Missing ' + key);
const projectChallenge = ['--kit', '--invader', '--recovery'].some((key) => args.has(key));
if (projectChallenge && !['--kit', '--invader', '--recovery'].every((key) => args.has(key)))
  throw Error('The project challenge requires --kit, --invader and a genuine prior --recovery receipt');
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
    if (Object.keys(result).length > 5000) throw Error('Owned input exceeds the QA inventory bound');
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
let recovery, recoveredBefore;
if (projectChallenge) {
  recovery = JSON.parse(await fs.readFile(args.get('--recovery'), 'utf8'));
  if (recovery.schemaVersion !== 1 || !recovery.tagsDirectory || !recovery.recoveredInventory)
    throw Error('Select a genuine reviewed CE source-recovery receipt');
  recoveredBefore = await inventory(recovery.tagsDirectory);
  expect(recoveredBefore).toEqual(recovery.recoveredInventory);
}
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
async function waitNative(page, previousSessionId) {
  let view;
  await expect
    .poll(
      async () => {
        view = await invoke(page, 'ce_host_status');
        if (previousSessionId && view?.id === previousSessionId) return false;
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
async function prepareClient(page, session) {
  const ready = await invoke(page, 'ce_host_client_action', { sessionId: session.id, action: 'prepare' });
  expect(ready.client.phase).toBe('ready');
  expect(ready.client.connectionVerified).toBe(false);
  expect(ready.client.gameDirectory).toBe(path.join(session.sessionDirectory, 'game'));
  expect(ready.client.profileDirectory).toBe(path.join(session.sessionDirectory, 'client-profile'));
  expect(ready.client.executableSha256).toBe(before['haloce.exe']);
  expect(ready.client.verifiedFiles).toBeGreaterThan(16);
  return ready;
}
async function launchClient(page, session) {
  await prepareClient(page, session);
  const opened = await invoke(page, 'ce_host_client_action', { sessionId: session.id, action: 'launch' });
  expect(opened.client.phase).toBe('open');
  expect(opened.client.connectionVerified).toBe(false);
  expect(alive(opened.client.processId)).toBe(true);
  return opened;
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
  const clientBegan = performance.now();
  expect(
    await call('ce_host_client_action', { sessionId: initial.id, action: 'launch' }).then(() => '', String),
  ).toContain('Prepare');
  const preparing = panel.getByRole('button', { name: 'Prepare matching client', exact: true }).click();
  const clientHeartbeatMs = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const began = performance.now();
        setTimeout(() => resolve(Math.round(performance.now() - began)), 50);
      }),
  );
  await preparing;
  await expect(panel.getByRole('button', { name: 'Launch CE playtest', exact: true })).toBeEnabled();
  const matched = await call('ce_host_status');
  expect(matched.client.phase).toBe('ready');
  expect(matched.client.executableSha256).toBe(before['haloce.exe']);
  expect(matched.client.processId).toBeNull();
  expect(await fs.readdir(matched.client.profileDirectory)).toEqual([]);
  for (const file of [
    'maps/bloodgulch.map',
    'maps/bitmaps.map',
    'maps/sounds.map',
    'maps/loc.map',
    'haloce.exe',
  ])
    expect(await hash(path.join(matched.client.gameDirectory, file))).toBe(before[file]);
  step('real UI prepares the exact server map/resources and a fresh separate client profile', {
    preparationMs: Math.round(performance.now() - clientBegan),
    clientHeartbeatMs,
    verifiedFiles: matched.client.verifiedFiles,
    verifiedBytes: matched.client.verifiedBytes,
    verificationMs: matched.client.verificationMs,
    executableSha256: matched.client.executableSha256,
  });
  const privateClient = path.join(matched.client.gameDirectory, 'haloce.exe');
  const clientBytes = await fs.readFile(privateClient);
  const copyManifest = path.join(initial.sessionDirectory, 'copied-files.json');
  const manifestBytes = await fs.readFile(copyManifest);
  try {
    const changed = Buffer.from(clientBytes);
    changed[changed.length - 1] ^= 1;
    await fs.writeFile(privateClient, changed);
    const forged = JSON.parse(manifestBytes);
    forged['haloce.exe'] = await hash(privateClient);
    await fs.writeFile(copyManifest, JSON.stringify(forged));
    expect(
      await call('ce_host_client_action', { sessionId: initial.id, action: 'launch' }).then(() => '', String),
    ).toContain('integrity');
    const refused = await call('ce_host_status');
    expect(refused.client.phase).toBe('failed');
    expect(refused.client.processId).toBeNull();
  } finally {
    await fs.writeFile(privateClient, clientBytes);
    await fs.writeFile(copyManifest, manifestBytes);
  }
  step('changed client bytes refuse even with a forged copy manifest and no client is launched');
  const plugin = path.join(matched.client.gameDirectory, 'winmm.dll');
  try {
    await fs.writeFile(plugin, 'controlled QA invalid file', { flag: 'wx' });
    expect(
      await call('ce_host_client_action', { sessionId: initial.id, action: 'prepare' }).then(
        () => '',
        String,
      ),
    ).toContain('unapproved');
  } finally {
    await fs.unlink(plugin);
  }
  await prepareClient(page, initial);
  step('unapproved private DLL refuses and restoring exact inputs allows matching-client preparation');
  const pendingClient = call('ce_host_client_action', { sessionId: initial.id, action: 'prepare' }).then(
    () => '',
    String,
  );
  await expect
    .poll(async () => (await call('ce_host_status')).client?.phase, { intervals: [5, 10] })
    .toBe('checking');
  expect(
    await call('ce_host_client_action', { sessionId: initial.id, action: 'prepare' }).then(() => '', String),
  ).toContain('already in progress');
  await call('ce_host_client_action', { sessionId: initial.id, action: 'stop' });
  expect(await pendingClient).toContain('cancelled');
  expect((await call('ce_host_status')).client.phase).toBe('stopped');
  await waitNative(page);
  await prepareClient(page, initial);
  step(
    'concurrent preparation refuses and cancellation leaves the server running without launching a client',
  );
  if (clientSeconds) {
    const setup = await call('ce_host_client_action', { sessionId: initial.id, action: 'setup' });
    expect(setup.client.mode).toBe('setup');
    expect(setup.client.phase).toBe('open');
    expect(alive(setup.client.processId)).toBe(true);
    expect(await hash(path.join(setup.client.gameDirectory, 'Eula.dll'))).toBe(before['Eula.dll']);
    expect(await hash(path.join(setup.client.gameDirectory, 'Eula.rtf'))).toBe(before['Eula.rtf']);
    const setupSeconds = Math.max(60, clientSeconds);
    console.log(JSON.stringify({ observingSetup: setup.client.processId, seconds: setupSeconds }));
    await new Promise((resolve) => setTimeout(resolve, setupSeconds * 1000));
    const observed = await call('ce_host_status');
    expect(observed.client.mode).toBe('setup');
    await call('ce_host_client_action', { sessionId: initial.id, action: 'stop' });
    await expect.poll(() => alive(setup.client.processId)).toBe(false);
    await prepareClient(page, initial);
    step('actual CE menu-only setup has its first-run resources and uses the separate profile', {
      mode: observed.client.mode,
      elapsedMs: observed.client.elapsedMs,
      lastPhase: observed.client.phase,
      firstRunFiles: ['Eula.dll', 'Eula.rtf'],
      clientJoinRequested: false,
      visualAcceptance: false,
    });
  }
  await panel.getByText('Session details & output', { exact: true }).click();
  await page.screenshot({ path: path.join(output, 'native-host.png') });
  // Reload preserves native ownership even though the React workspace remounts.
  await page.reload();
  expect((await call('ce_host_status')).id).toBe(initial.id);
  expect((await call('ce_host_status')).client.phase).toBe('ready');
  step('workspace reload retains the owned native session');
  const priorPages = pages();
  await call('open_workspace_window', { workspace: 'runtimes', context: null });
  await expect.poll(() => pages().length).toBe(priorPages.length + 1);
  const other = pages().find((candidate) => !priorPages.includes(candidate));
  await expect.poll(() => other.evaluate(() => !!window.__TAURI_INTERNALS__)).toBe(true);
  expect(await invoke(other, 'ce_host_status')).toBeNull();
  for (const action of ['prepare', 'launch', 'stop'])
    expect(
      await invoke(other, 'ce_host_client_action', { sessionId: initial.id, action }).then(() => '', String),
    ).toContain('another window');
  expect(
    await call('ce_host_client_action', { sessionId: 'stale', action: 'prepare' }).then(() => '', String),
  ).toContain('no longer current');
  step('client actions reject other windows and stale session IDs');
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
  const secondaryClient = clientSeconds ? await launchClient(other, secondary) : null;
  await invoke(other, 'close_application').catch((e) => {
    if (!/closed|destroyed/i.test(String(e))) throw e;
  });
  await expect.poll(() => alive(secondary.processId)).toBe(false);
  if (secondaryClient) {
    await expect.poll(() => alive(secondaryClient.client.processId)).toBe(false);
    step('closing the owning Spark window stops its actual CE client and server');
  }
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
  const startupFile = path.join(runtime, 'Eula.dll'),
    startupBytes = await fs.readFile(startupFile);
  try {
    const corrupt = Buffer.from(startupBytes);
    corrupt[0] = 0;
    await fs.writeFile(startupFile, corrupt);
    const startup = await call('custom_edition_setup');
    expect(startup.installation.startupIssues).toContain('Eula.dll');
    await call('ce_host_start', { request });
    const unaffected = await waitNative(page);
    const refused = await call('ce_host_client_action', { sessionId: unaffected.id, action: 'prepare' }).then(
      () => '',
      String,
    );
    expect(refused).toContain('Eula.dll');
    expect(refused).toContain('Dependencies & setup');
    expect((await call('ce_host_status')).client.processId).toBeNull();
    expect((await waitNative(page)).status.map).toBe('bloodgulch');
    await stop(page, unaffected.id);
  } finally {
    await fs.writeFile(startupFile, startupBytes);
  }
  step('invalid client startup files get named setup guidance while dedicated hosting stays usable');
  if (projectChallenge) {
    await call('save_settings', {
      settings: {
        ...boot.settings,
        preferredHalo: 'haloCustomEdition',
        onboardingCompleted: true,
        autoBuild: false,
        hekDirectory: args.get('--kit'),
        hekTagsDirectory: recovery.tagsDirectory,
        hekFlavor: 'h1aEk',
        invaderDirectory: args.get('--invader'),
      },
    });
    const showWorkspace = async (name) => {
      const drawer = page.locator('.gs-navigation-drawer');
      if (!(await drawer.isVisible()))
        await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
      await drawer.getByRole('button', { name, exact: true }).click();
    };
    const created = await call('create_quickforge_project', {
      title: 'bloodgulch',
      template: 'customBlank',
      target: 'mccSteam',
    });
    const openCreated = async () => {
      await page.reload();
      await showWorkspace('Map library');
      await page
        .locator('.map-card')
        .filter({ has: page.getByRole('heading', { name: created.project.title, exact: true }) })
        .filter({ has: page.getByText('WORKSPACE', { exact: true }) })
        .click();
    };
    await openCreated();
    await page.getByRole('button', { name: 'BSP Workshop', exact: true }).click();
    await page.getByRole('button', { name: 'Two rooms + corridor + ramp', exact: true }).click();
    await expect(page.getByLabel('Native BSP Workshop', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Saved', { exact: true }).last()).toBeVisible();
    await expect
      .poll(
        async () => !!(await call('open_project', { id: created.project.id })).project.quickForge?.workshop,
      )
      .toBe(true);
    const project = (await call('open_project', { id: created.project.id })).project;
    expect(project.quickForge.workshop).toBeTruthy();
    const targetId = crypto.randomUUID();
    project.quickForge.runtimeId = 'haloCustomEdition';
    project.quickForge.skyPath = 'levels/test/bloodgulch/bloodgulch';
    project.quickForge.materials[0].name = 'cap_metal';
    project.quickForge.materials[0].shaderPath = 'levels/test/bloodgulch/shaders/cap_metal';
    project.activeBuildTarget = targetId;
    project.buildTargets = [
      {
        id: targetId,
        name: 'Previously reviewed CE source',
        runtimeId: 'haloCustomEdition',
        builder: 'invader-ce',
        hekDirectory: args.get('--kit'),
        hekFlavor: 'h1aEk',
        tagsDirectory: recovery.tagsDirectory,
        invaderDirectory: args.get('--invader'),
        ceCompatibleTagset: true,
        openSauce: false,
      },
    ];
    await call('save_project', { project });
    await page.reload();
    await openCreated();
    await page.getByRole('button', { name: 'Objects & gameplay', exact: true }).click();
    const compileBegan = performance.now();
    await page.getByRole('button', { name: 'Build & check playtest', exact: true }).click();
    let nativeBuild;
    await expect
      .poll(
        async () => {
          nativeBuild = await call('quickforge_build_report', { projectId: project.id });
          if (nativeBuild?.status === 'failed') throw Error(JSON.stringify(nativeBuild.blockers));
          return nativeBuild?.status;
        },
        { timeout: 180000, intervals: [500, 1000] },
      )
      .toBe('validated');
    const build = nativeBuild.build;
    expect(nativeBuild.current).toBe(true);
    expect(build.target).toBe('gbx-custom');
    expect(await hash(build.output)).toBe(build.sha256);
    expect(build.sha256).not.toBe(bloodgulch.sha256);
    const header = (await fs.readFile(build.output)).subarray(0, 2048);
    expect(header.readUInt32LE(4)).toBe(609);
    expect(header.toString('ascii', 32, 64).split(String.fromCharCode(0))[0]).toBe('bloodgulch');
    step('genuine Workshop source compiles a CE project cache through the native UI/toolchain', {
      buildId: build.id,
      target: build.target,
      mapSha256: build.sha256,
      projectFingerprint: build.projectFingerprint,
      compileMs: Math.round(performance.now() - compileBegan),
      toolIdentities: nativeBuild.toolIdentities,
    });
    const projectCatalog = await call('ce_host_catalog', { projectId: project.id });
    const managed = projectCatalog.maps.find((map) => map.sourceBuild?.buildId === build.id);
    expect(managed?.sha256).toBe(build.sha256);
    expect(projectCatalog.maps.filter((map) => map.name === 'bloodgulch')).toHaveLength(2);
    const managedRequest = {
      ...request,
      map: managed.name,
      mapSha256: managed.sha256,
      sourceBuild: { projectId: project.id, buildId: build.id },
    };
    await showWorkspace('Online');
    await page.getByRole('button', { name: 'Host game', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Runtime adapter', exact: true })
      .selectOption('haloCustomEdition');
    await expect(page.getByLabel('Private CE map')).toHaveValue('build:' + build.id);
    const managedBegan = performance.now();
    const previousSession = await call('ce_host_status');
    await page.getByRole('button', { name: 'Start private server', exact: true }).click();
    const hosted = await waitNative(page, previousSession?.id);
    expect(hosted.sourceBuild.buildId).toBe(build.id);
    expect(hosted.sourceBuild.projectFingerprint).toBe(build.projectFingerprint);
    await expect(
      page.getByText('CE clients need this saved map copy to join. The installed stock map is unchanged.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(await hash(path.join(hosted.sessionDirectory, 'game/maps/bloodgulch.map'))).toBe(build.sha256);
    expect(await hash(path.join(runtime, 'maps/bloodgulch.map'))).toBe(bloodgulch.sha256);
    step(
      'managed build with a stock filename loads from its own snapshot without replacing the installed map',
      {
        projectStartupMs: Math.round(performance.now() - managedBegan),
        mapSha256: hosted.mapSha256,
        sourceBuild: hosted.sourceBuild,
        nativeStatus: hosted.status,
      },
    );
    const preparedBuild = await prepareClient(page, hosted);
    expect(await hash(path.join(preparedBuild.client.gameDirectory, 'maps/bloodgulch.map'))).toBe(
      build.sha256,
    );
    expect(build.sha256).not.toBe(before['maps/bloodgulch.map']);
    step('matching client uses the genuine newly compiled Workshop map rather than its stock namesake', {
      mapSha256: build.sha256,
      verifiedFiles: preparedBuild.client.verifiedFiles,
      verificationMs: preparedBuild.client.verificationMs,
    });
    let stopWithServerClient;
    if (clientSeconds) {
      const opened = await launchClient(page, hosted);
      const endpoint = path.join(output, 'active-client.json');
      await fs.writeFile(
        endpoint,
        JSON.stringify(
          {
            processId: opened.client.processId,
            map: opened.map,
            gameDirectory: opened.client.gameDirectory,
            port: opened.port,
          },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({ observingClient: opened.client.processId, seconds: clientSeconds, map: opened.map }),
      );
      const locked = await fs
        .writeFile(path.join(opened.client.gameDirectory, 'haloce.exe'), clientBytes)
        .then(
          () => false,
          () => true,
        );
      expect(locked).toBe(true);
      expect(
        await call('ce_host_client_action', { sessionId: hosted.id, action: 'launch' }).then(
          () => '',
          String,
        ),
      ).toContain('current CE window');
      let maximumPlayersObserved = 0,
        replies = 0;
      const deadline = Date.now() + clientSeconds * 1000;
      while (Date.now() < deadline) {
        const observation = await call('ce_host_status');
        if (observation.status) {
          replies++;
          maximumPlayersObserved = Math.max(maximumPlayersObserved, observation.status.players);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      const observed = await call('ce_host_status');
      await call('ce_host_client_action', { sessionId: hosted.id, action: 'stop' });
      await expect.poll(() => alive(opened.client.processId)).toBe(false);
      await waitNative(page);
      step('actual CE client opens with matching native content, holds input locks and stops independently', {
        executableSha256: opened.client.executableSha256,
        mapSha256: build.sha256,
        seconds: clientSeconds,
        serverReplies: replies,
        maximumPlayersObserved,
        lastClientPhase: observed.client.phase,
        visibleRequested: true,
        clientJoinVerified: false,
        gameplayVerified: false,
      });
      stopWithServerClient = await launchClient(page, hosted);
    }
    await page.screenshot({ path: path.join(output, 'native-project-host.png') });
    const savedProject = (await call('open_project', { id: project.id })).project;
    const edited = structuredClone(savedProject);
    edited.quickForge.spawns[0].position[0] += 0.25;
    await call('save_project', { project: edited });
    const staleCatalog = await call('ce_host_catalog', { projectId: project.id });
    expect(staleCatalog.projectIssue).not.toBeNull();
    expect(staleCatalog.maps.some((map) => map.sourceBuild)).toBe(false);
    expect((await waitNative(page)).mapSha256).toBe(build.sha256);
    await stop(page, hosted.id);
    if (stopWithServerClient) {
      await expect.poll(() => alive(stopWithServerClient.client.processId)).toBe(false);
      step('stopping the private server also stops its actual matching client');
    }
    expect(await call('ce_host_start', { request: managedRequest }).then(() => '', String)).toContain(
      'stale',
    );
    step('saved edits invalidate new starts while the existing private snapshot remains unchanged');
    await call('save_project', { project: savedProject });
    expect(
      await call('ce_host_start', {
        request: { ...managedRequest, sourceBuild: { projectId: project.id, buildId: crypto.randomUUID() } },
      }).then(() => '', String),
    ).not.toBe('');
    step('unowned build IDs refuse without falling back to the stock map');
    const builtBytes = await fs.readFile(build.output);
    try {
      const corrupt = Buffer.from(builtBytes);
      corrupt[corrupt.length - 1] ^= 1;
      await fs.writeFile(build.output, corrupt);
      expect(await call('ce_host_start', { request: managedRequest }).then(() => '', String)).toContain(
        'integrity',
      );
    } finally {
      await fs.writeFile(build.output, builtBytes);
    }
    step('a genuinely corrupted managed cache refuses before process launch');
    const buildReceipt = path.join(path.dirname(path.dirname(build.output)), 'receipt.json');
    const receiptBytes = await fs.readFile(buildReceipt);
    try {
      const forged = JSON.parse(receiptBytes);
      forged.output = path.join(runtime, 'maps/bloodgulch.map');
      forged.sha256 = bloodgulch.sha256;
      await fs.writeFile(buildReceipt, JSON.stringify(forged));
      expect(await call('ce_host_start', { request: managedRequest }).then(() => '', String)).toContain(
        'integrity',
      );
    } finally {
      await fs.writeFile(buildReceipt, receiptBytes);
    }
    step('a redirected build receipt cannot select an output outside its owned job');
    await call('ce_host_start', { request: managedRequest });
    const restored = await waitNative(page);
    expect(restored.mapSha256).toBe(build.sha256);
    await stop(page, restored.id);
    expect(await inventory(recovery.tagsDirectory)).toEqual(recoveredBefore);
    step('restored valid native output can host again and the reviewed base source remains byte-identical', {
      preservedReviewedTags: Object.keys(recoveredBefore).length,
    });
  }
  await call('ce_host_start', { request });
  const final = await waitNative(page);
  const finalClient = clientSeconds ? await launchClient(page, final) : null;
  child.kill(); // Real abrupt parent exit tests Windows job-object cleanup.
  await expect.poll(() => alive(final.processId)).toBe(false);
  if (finalClient) {
    await expect.poll(() => alive(finalClient.client.processId)).toBe(false);
    step('abrupt Spark exit kills its actual owned CE client as well as its server');
  }
  step('abrupt Spark exit kills its owned dedicated server');
  expect(await inventory(original)).toEqual(before);
  expect(receipt.errors).toEqual([]);
  receipt.originalFilesUnchanged = Object.keys(before).length;
  receipt.complete = true;
} catch (e) {
  receipt.errors.push(String(e));
  receipt.failureStack = e.stack;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({ complete: receipt.complete, cases: receipt.cases.length, errors: receipt.errors }),
  );
}
