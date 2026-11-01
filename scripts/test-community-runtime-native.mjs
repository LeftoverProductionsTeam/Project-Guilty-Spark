// Opt-in private native game QA using exact publisher-verified release files.
// Supply lawfully owned Xbox data already extracted by the runtime or another
// reviewed source. This script never imports an ISO, downloads content or installs.
// Actual engine test hooks drive scripted player input, not human play or AI.
// Inspect both logs with analyze-community-runtime-native.mjs after execution.
// No public discovery, downloads, UPnP or arbitrary process/command input.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  if (
    ![
      '--host-id',
      '--host-dir',
      '--client-id',
      '--client-dir',
      '--maps',
      '--output',
      '--mode',
      '--ce-map',
      '--ai-symbols',
    ].includes(process.argv[at]) ||
    !process.argv[at + 1] ||
    args.has(process.argv[at])
  )
    throw Error('Use unique reviewed named arguments');
  args.set(process.argv[at], process.argv[at + 1]);
}
if (
  !['--host-id', '--host-dir', '--client-id', '--client-dir', '--maps', '--output'].every((key) =>
    args.has(key),
  )
)
  throw Error(
    'Required: --host-id pinned-id --host-dir official-release-folder --client-id pinned-id --client-dir official-release-folder --maps owned-Xbox-maps-folder --output fresh-directory [--mode bloodgulch:slayer|a30:coop|b30:coop|ce:slayer] [--ai-symbols verified-PDB-directory]',
  );
const hostId = args.get('--host-id'),
  clientId = args.get('--client-id'),
  mode = args.get('--mode') ?? 'bloodgulch:slayer';
const allowed = ['opence-build-329', 'chupathingy-v0.8.1c', 'opence-build-335', 'chupathingy-v0.8.1d'];
const isOpenCe = (id) => id.startsWith('opence-build-');
if (
  ![hostId, clientId].every((id) => allowed.includes(id)) ||
  !['bloodgulch:slayer', 'a30:coop', 'b30:coop', 'ce:slayer'].includes(mode)
)
  throw Error('Use the exact pinned test releases and reviewed game modes');
if ((mode === 'ce:slayer') !== args.has('--ce-map'))
  throw Error('ce:slayer requires an explicitly selected native Custom Edition cache');
const output = path.resolve(args.get('--output')),
  fixtures = path.resolve(args.get('--maps')),
  label = path.basename(output);
await fs.mkdir(output);
const publisher = JSON.parse(
  await fs.readFile(new URL('../docs/fixtures/c36-community-client-files.json', import.meta.url), 'utf8'),
);
const installedPublisher = JSON.parse(
  await fs.readFile(
    new URL('../docs/fixtures/c41-installed-community-runtimes.json', import.meta.url),
    'utf8',
  ),
);
publisher.clients.push(
  ...installedPublisher.clients.filter(
    (release) =>
      ['opence-build-335', 'chupathingy-v0.8.1d'].includes(release.id) && release.publisherDigestVerified,
  ),
);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
let aiObserver;
if (args.has('--ai-symbols')) {
  if (process.platform !== 'win32' || hostId !== 'opence-build-335' || clientId !== hostId)
    throw Error('AI observation requires two exact OpenCE build-335 Windows copies');
  const executable = path.resolve('target/debug/examples/qa_opence_ai.exe');
  const symbols = path.resolve(args.get('--ai-symbols'));
  const identity = async (file, limit) => {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
      throw Error('Expected bounded local QA input');
    return hash(await fs.readFile(file));
  };
  const pdbSha256 = await identity(path.join(symbols, 'halo.pdb'), 32 * 1024 * 1024);
  if (pdbSha256 !== 'b3755a3d5a7864e0ba30be6dd457c3f361c62a2bc0a04c18860a713f1931c800')
    throw Error('Use the publisher-matching build-335 PDB; no guessed runtime offsets');
  aiObserver = { executable, symbols, pdbSha256, sha256: await identity(executable, 64 * 1024 * 1024) };
}
let ceMap;
if (args.has('--ce-map')) {
  const source = path.resolve(args.get('--ce-map')),
    stat = await fs.lstat(source);
  const name = path.basename(source, '.map');
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2048 ||
    stat.size > 512 * 1024 * 1024 ||
    !/^[a-z][a-z0-9_]{0,30}$/.test(name)
  )
    throw Error('Choose a bounded CE cache with a safe native map name');
  const bytes = await fs.readFile(source);
  if (
    bytes.subarray(0, 4).toString('ascii') !== 'daeh' ||
    bytes.readUInt32LE(4) !== 609 ||
    bytes.readUInt16LE(0x60) !== 1 ||
    bytes.subarray(0x20, 0x40).toString('ascii').split('\0')[0] !== name
  )
    throw Error('The selected map must be an actual CE multiplayer cache with its native filename');
  ceMap = { source, name, bytes: bytes.length, sha256: hash(bytes), cacheVersion: 609 };
}
const selectedMapName = mode.endsWith(':coop') ? mode.split(':')[0] + '.map' : 'bloodgulch.map';
const sourceNames = ['ui.map', 'carousel.map', selectedMapName];
const extraction = { files: [] };
for (const name of sourceNames) {
  const file = path.join(fixtures, name);
  const stat = await fs.lstat(file).catch(() => {
    throw Error(
      name === 'carousel.map'
        ? 'Missing original Xbox carousel.map. These pinned runtimes use stock Carousel during fast-host setup before selecting the requested map. Supply the matching owned maps folder.'
        : `Missing required owned Xbox ${name}; supply the matching runtime's native maps folder.`,
    );
  });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2048 || stat.size > 512 * 1024 * 1024)
    throw Error('Missing or unsupported owned native map: ' + name);
  const bytes = await fs.readFile(file);
  if (bytes.subarray(0, 4).toString('ascii') !== 'daeh' || bytes.readUInt32LE(4) !== 5)
    throw Error('Use matching original Xbox cache-5 content; PC/CE/MCC is not a substitute');
  extraction.files.push({ name, bytes: bytes.length, sha256: hash(bytes), cacheVersion: 5 });
}
const plan = {
  proposedTwoGameTest: {
    sharedEnvironment: {
      HALO_NET_ONLINE: 'false',
      HALO_NET_PUBLIC_LOBBY: 'false',
      HALO_NET_HOST_PUBLIC: 'false',
      HALO_NET_COOP_PUBLIC: 'false',
      HALO_NET_ALLOW_UPNP: 'false',
      HALO_DISCORD_APPLICATION: '',
      HALO_UPDATE_AUTO: 'false',
      HALO_CRASH_REPORTS: 'no',
    },
    chupathingyAdditionalEnvironment: {
      HALO_NET_COPY_TO_CLIPBOARD: 'false',
      HALO_NET_MAP_DOWNLOADS: 'never',
      HALO_NET_JOIN_FROM_CLIPBOARD: 'never',
      HALO_NET_LIST_GAMES: 'false',
      HALO_NET_REPORT_HOSTED: 'false',
      HALO_NET_REPORT_GAMES: 'false',
      HALO_NET_REPORT_EVENTS: 'false',
      HALO_NET_SHARE_PROFILE: 'false',
      HALO_NET_BROWSER: '',
    },
    openCeAdditionalEnvironment: {
      HALO_NET_MAP_SHARE: 'false',
      HALO_NET_MAP_SEED: 'false',
      HALO_NET_MAP_DOWNLOAD: 'false',
      HALO_NET_JOIN_FROM_CLIPBOARD: 'false',
    },
  },
};
const expected = {
  'opence-build-329': 'b581be3dacc832621624b0af86b6c5c73ce98dce8b6927552c1aca3e0810185c',
  'chupathingy-v0.8.1c': 'bd01e38996ec9787d8413ce84033d4cd3e1878099d3af27630a7d7ea493a1c4a',
  'opence-build-335': '788fb4095664b9417f64f9d40a5668e6d0775823407e9d5a7b517587536766a0',
  'chupathingy-v0.8.1d': 'b2f8ea992ed4031461bc638f8af80c08ec8905c5f73c97c483e86f25273b18d4',
};
const report = {
  schemaVersion: 1,
  label,
  mode,
  private: true,
  renderer: 'OpenCE native null renderer; Chupathingy hidden native window renderer',
  humanInput: false,
  twoComputers: false,
  publicListing: false,
  routerFirewallChanges: false,
  executed: [],
  errors: [],
  ...(ceMap
    ? { customEditionMap: ceMap, compatibilityDeployment: true, nativeCompilationPerformedByRunner: false }
    : {}),
};
const children = [];
const completions = [];
async function launch(role, id) {
  const root = path.join(output, role),
    client = path.resolve(args.get(role === 'host' ? '--host-dir' : '--client-dir'));
  await fs.mkdir(root);
  await fs.mkdir(path.join(root, 'data'));
  await fs.mkdir(path.join(root, 'data', 'maps'));
  await fs.mkdir(path.join(root, 'save'));
  await fs.mkdir(path.join(root, 'logs'));
  // Installed folders now contain user maps, profiles and configuration. Copy
  // ONLY the exact publisher inventory; never copy or rewrite those user files.
  const release = publisher.clients.find((entry) => entry.id === id);
  if (!release?.files.length) throw Error('Missing pinned publisher inventory');
  for (const known of release.files) {
    const parts = known.name.split('/');
    if (parts.some((part) => !/^[A-Za-z0-9_. -]+$/.test(part) || part === '.' || part === '..'))
      throw Error('Unsafe publisher member path');
    for (let n = 0; n <= parts.length; n++) {
      const stat = await fs.lstat(path.join(client, ...parts.slice(0, n)));
      if (stat.isSymbolicLink() || (n < parts.length ? !stat.isDirectory() : !stat.isFile()))
        throw Error('Linked or invalid publisher member');
    }
    const original = path.join(client, ...parts),
      target = path.join(root, ...parts);
    if (hash(await fs.readFile(original)) !== known.sha256)
      throw Error('Release member differs from verified publisher inventory');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(original, target, fs.constants.COPYFILE_EXCL);
    if (hash(await fs.readFile(target)) !== known.sha256) throw Error('Copied publisher member differs');
  }
  const executable = path.join(root, 'halo.exe');
  if (hash(await fs.readFile(executable)) !== expected[id]) throw Error('Release EXE identity differs');
  const inputs = [];
  for (const file of extraction.files.filter(
    (file) => file.name === 'ui.map' || file.name === 'carousel.map' || file.name === selectedMapName,
  )) {
    const original = path.join(fixtures, file.name),
      target = path.join(root, 'data', 'maps', file.name);
    if (hash(await fs.readFile(original)) !== file.sha256) throw Error('Derived source map changed');
    await fs.copyFile(original, target, fs.constants.COPYFILE_EXCL);
    if (hash(await fs.readFile(target)) !== file.sha256) throw Error('Game copy identity differs');
    inputs.push(file);
  }
  if (ceMap) {
    const folder = isOpenCe(id) ? 'custom_maps' : 'maps_ce';
    const relativePath = path.join(folder, ceMap.name + '.map');
    const target = path.join(root, 'data', relativePath);
    await fs.mkdir(path.dirname(target));
    if (hash(await fs.readFile(ceMap.source)) !== ceMap.sha256) throw Error('Selected CE cache changed');
    await fs.copyFile(ceMap.source, target, fs.constants.COPYFILE_EXCL);
    if (hash(await fs.readFile(target)) !== ceMap.sha256) throw Error('CE deployment hash differs');
    inputs.push({
      name: ceMap.name + '.map',
      relativePath,
      bytes: ceMap.bytes,
      sha256: ceMap.sha256,
      cacheVersion: 609,
    });
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('HALO_')));
  Object.assign(
    env,
    plan.proposedTwoGameTest.sharedEnvironment,
    isOpenCe(id)
      ? plan.proposedTwoGameTest.openCeAdditionalEnvironment
      : plan.proposedTwoGameTest.chupathingyAdditionalEnvironment,
    {
      HALO_DATA_ROOT: path.join(root, 'data'),
      HALO_SAVE_ROOT: path.join(root, 'save'),
      HALO_LOG_ROOT: path.join(root, 'logs'),
      HALO_NETWORK_TEST:
        role === 'host'
          ? `host:${ceMap ? (isOpenCe(id) ? 'custom_maps\\' + ceMap.name : ceMap.name + '@ce') + ':slayer' : mode}`
          : 'join',
      HALO_NETWORK_TEST_START: '12',
      HALO_NETWORK_TEST_SHOOT: aiObserver ? '0' : '4',
      HALO_NETWORK_TEST_KILL: aiObserver ? '0' : '17',
      HALO_TEST_INPUT: role === 'host' ? 'bot:1' : 'bot:2',
      HALO_EXIT_AFTER: role === 'host' ? '80' : '60',
      HALO_NET_ADDRESS: role === 'host' ? '127.0.0.210' : '127.0.0.211',
      HALO_NET_BROADCAST: role === 'host' ? '127.0.0.211' : '127.0.0.210',
      HALO_HIDDEN_WINDOW: 'true',
      HALO_NULL_RENDERER: isOpenCe(id) ? 'true' : 'false',
      HALO_CONSOLE_LOG: 'all',
      HALO_DISCORD_PRESENCE: 'off',
      HALO_UPDATE_AUTO: 'false',
      HALO_CRASH_REPORTS: 'no',
      SDL_AUDIO_DRIVER: 'dummy',
    },
  );
  if (isOpenCe(id)) env.SDL_VIDEO_DRIVER = 'dummy';
  const log = createWriteStream(path.join(root, 'stdio.log'), { flags: 'wx' });
  const child = spawn(executable, [], {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const record = {
    role,
    renderer: isOpenCe(id) ? 'native-null' : 'hidden-native-window',
    runtime: id,
    pid: child.pid,
    exeSha256: expected[id],
    inputs,
    startedAt: new Date().toISOString(),
    settings: Object.fromEntries(
      Object.entries(env).filter(([name]) => name.startsWith('HALO_') || name === 'SDL_AUDIO_DRIVER'),
    ),
  };
  report.executed.push(record);
  let observer, observerDone;
  if (aiObserver) {
    const log = createWriteStream(path.join(root, 'ai-observer.ndjson'), { flags: 'wx' });
    const errors = createWriteStream(path.join(root, 'ai-observer.stderr.log'), { flags: 'wx' });
    record.aiObserver = {
      schemaVersion: 1,
      sha256: aiObserver.sha256,
      pdbSha256: aiObserver.pdbSha256,
      readOnly: true,
    };
    observer = spawn(aiObserver.executable, [executable, aiObserver.symbols, String(child.pid), role], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let size = 0;
    observer.stdout.on('data', (bytes) => {
      size += bytes.length;
      if (size > 32 * 1024 * 1024) {
        record.aiObserver.forced = true;
        observer.kill();
      } else log.write(bytes);
    });
    observer.stderr.on('data', (bytes) => {
      if (bytes.length < 65536) errors.write(bytes);
    });
    observer.once('error', (error) => report.errors.push(role + ' AI observer failed: ' + String(error)));
    observerDone = new Promise((resolve) =>
      observer.once('close', async (code) => {
        record.aiObserver.exitCode = code;
        await Promise.all([new Promise((r) => log.end(r)), new Promise((r) => errors.end(r))]);
        record.aiObserver.logSha256 = hash(await fs.readFile(path.join(root, 'ai-observer.ndjson')));
        resolve();
      }),
    );
  }
  console.log(JSON.stringify({ started: role, runtime: id, pid: child.pid }));
  let bytes = 0,
    forced = false;
  const capture = (data) => {
    bytes += data.length;
    if (bytes > 32 * 1024 * 1024) {
      forced = true;
      child.kill();
      report.errors.push(role + ' log limit');
    } else log.write(data);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const watchdog = setTimeout(() => {
    forced = true;
    report.errors.push(role + ' exceeded native timeout');
    child.kill();
  }, 105000);
  const done = new Promise((resolve) => {
    child.once('error', (error) => {
      record.spawnError = String(error);
      report.errors.push(role + ' spawn failed');
    });
    child.once('close', async (code, signal) => {
      clearTimeout(watchdog);
      if (observerDone) {
        const timer = setTimeout(() => {
          record.aiObserver.forced = true;
          observer.kill();
        }, 2000);
        await observerDone;
        clearTimeout(timer);
        if (record.aiObserver.exitCode !== 0 || record.aiObserver.forced)
          report.errors.push(role + ' AI observer did not finish cleanly');
      }
      record.exitCode = code;
      record.signal = signal;
      record.forced = forced;
      record.exitedAt = new Date().toISOString();
      await new Promise((finish) => log.end(finish));
      record.inputsUnchanged = true;
      try {
        for (const file of inputs)
          if (
            hash(
              await fs.readFile(path.join(root, 'data', file.relativePath ?? path.join('maps', file.name))),
            ) !== file.sha256
          )
            record.inputsUnchanged = false;
      } catch (error) {
        record.inputsUnchanged = false;
        record.inputReadbackError = String(error);
      }
      console.log(
        JSON.stringify({
          exited: role,
          code,
          signal,
          forced,
          bytes,
          inputsUnchanged: record.inputsUnchanged,
        }),
      );
      resolve(record);
    });
  });
  completions.push(done);
  return { child, done };
}
try {
  const host = await launch('host', hostId);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (host.child.exitCode !== null) throw Error('Host exited before client launch');
  const client = await launch('client', clientId);
  await Promise.all([host.done, client.done]);
  for (const record of report.executed)
    if (record.exitCode !== 0 || record.forced || !record.inputsUnchanged)
      report.errors.push(record.role + ' did not exit cleanly with unchanged map input');
  report.simulationAcceptance =
    'Pending analysis of both native game logs; a zero exit is not connection/gameplay proof.';
} catch (error) {
  report.errors.push(String(error));
  for (const child of children) if (child.exitCode === null) child.kill();
  await Promise.allSettled(completions);
}
for (const file of extraction.files) {
  if (hash(await fs.readFile(path.join(fixtures, file.name))) !== file.sha256)
    report.errors.push('Original input map changed: ' + file.name);
}
if (aiObserver && hash(await fs.readFile(aiObserver.executable)) !== aiObserver.sha256)
  report.errors.push('Native observer changed during execution');
report.originalInputMapsUnchanged = !report.errors.some((error) =>
  error.startsWith('Original input map changed:'),
);
await fs.writeFile(path.join(output, 'execution.json'), JSON.stringify(report, null, 2) + '\n', {
  flag: 'wx',
});
if (report.errors.length) throw Error(report.errors.join('; '));
console.log(
  JSON.stringify({
    label,
    executed: report.executed.length,
    errors: report.errors,
    acceptance: report.simulationAcceptance,
  }),
);
