// Opt-in, single private-host experiment. No downloads, installation, public
// servers, joining, MCC DLL loading, process attachment or game-file changes.
// The MCC-content case tests the community runtime's bootstrap, not cross-play.
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  const key = process.argv[at];
  if (
    !['--mode', '--client-dir', '--maps', '--output'].includes(key) ||
    !process.argv[at + 1] ||
    args.has(key)
  )
    throw Error('Use unique named arguments');
  args.set(key, process.argv[at + 1]);
}
if (args.size !== 4 || !['discovery', 'mcc-content'].includes(args.get('--mode')))
  throw Error(
    'Use --mode discovery|mcc-content --client-dir verified-v0.8.1c-folder --maps owned-native-maps-folder --output fresh-directory',
  );
if (process.platform !== 'win32') throw Error('This pinned native release is a Windows test dependency');
const mode = args.get('--mode'),
  requestedOutput = path.resolve(args.get('--output'));
const output = path.join(await fs.realpath(path.dirname(requestedOutput)), path.basename(requestedOutput));
const release = await fs.realpath(path.resolve(args.get('--client-dir'))),
  maps = await fs.realpath(path.resolve(args.get('--maps')));
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
};
if (
  contains(release, output) ||
  contains(maps, output) ||
  contains(output, release) ||
  contains(output, maps)
)
  throw Error('Use a fresh, isolated output directory outside both sources');
const publisher = JSON.parse(
  await fs.readFile(new URL('../docs/fixtures/c36-community-client-files.json', import.meta.url), 'utf8'),
).clients.find((client) => client.id === 'chupathingy-v0.8.1c');
if (!publisher || publisher.revision !== '880a933ec33b2ae2dbbeb4018a9090c528a075bc')
  throw Error('Pinned publisher inventory missing');
const ownedRead = async (filename, maximum) => {
  const before = await fs.lstat(filename);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum)
    throw Error('Expected bounded ordinary input file');
  const bytes = await fs.readFile(filename),
    after = await fs.lstat(filename);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size)
    throw Error('Source changed during read');
  return bytes;
};
// Validate every executable dependency and map before creating or launching.
const binaries = [];
for (const file of publisher.files) {
  if (!/^[A-Za-z0-9_. -]+$/.test(file.name)) throw Error('Unexpected release member');
  const bytes = await ownedRead(path.join(release, file.name), 64 * 1024 * 1024);
  if (bytes.length !== file.bytes || hash(bytes) !== file.sha256)
    throw Error('Publisher file changed: ' + file.name);
  binaries.push({ file, bytes });
}
const input = [];
for (const name of mode === 'discovery'
  ? ['ui.map', 'bloodgulch.map', 'carousel.map']
  : ['ui.map', 'bloodgulch.map']) {
  const bytes = await ownedRead(path.join(maps, name), 512 * 1024 * 1024);
  const version = mode === 'discovery' ? 5 : 13;
  if (
    bytes.length < 2048 ||
    bytes.subarray(0, 4).toString('ascii') !== 'daeh' ||
    bytes.readUInt32LE(4) !== version
  )
    throw Error(`Expected original cache-${version} content; headers must not be rewritten`);
  input.push({ name, bytes, sha256: hash(bytes), cacheVersion: version });
}
const probe = fileURLToPath(new URL('../target/debug/examples/one_halo_discovery.exe', import.meta.url));
if (mode === 'discovery') await fs.access(probe);
await fs.mkdir(output);
for (const dir of ['data', 'data/maps', 'save', 'logs']) await fs.mkdir(path.join(output, dir));
for (const { file, bytes } of binaries)
  await fs.writeFile(path.join(output, file.name), bytes, { flag: 'wx' });
for (const file of input)
  await fs.writeFile(path.join(output, 'data/maps', file.name), file.bytes, { flag: 'wx' });
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('HALO_')));
Object.assign(env, {
  HALO_DATA_ROOT: path.join(output, 'data'),
  HALO_SAVE_ROOT: path.join(output, 'save'),
  HALO_LOG_ROOT: path.join(output, 'logs'),
  HALO_NET_ADDRESS: '127.0.0.210',
  HALO_NET_BROADCAST: '127.0.0.212',
  HALO_NET_ONLINE: 'false',
  HALO_NET_PUBLIC_LOBBY: 'false',
  HALO_NET_HOST_PUBLIC: 'false',
  HALO_NET_COOP_PUBLIC: 'false',
  HALO_NET_ALLOW_UPNP: 'false',
  HALO_NET_MAP_DOWNLOADS: 'never',
  HALO_NET_JOIN_FROM_CLIPBOARD: 'never',
  HALO_NET_COPY_TO_CLIPBOARD: 'false',
  HALO_NET_LIST_GAMES: 'false',
  HALO_NET_REPORT_HOSTED: 'false',
  HALO_NET_REPORT_GAMES: 'false',
  HALO_NET_REPORT_EVENTS: 'false',
  HALO_NET_SHARE_PROFILE: 'false',
  HALO_NET_BROWSER: '',
  HALO_DISCORD_APPLICATION: '',
  HALO_DISCORD_PRESENCE: 'off',
  HALO_UPDATE_AUTO: 'false',
  HALO_CRASH_REPORTS: 'no',
  HALO_CONSOLE_LOG: 'all',
  HALO_HIDDEN_WINDOW: 'true',
  HALO_NULL_RENDERER: 'false',
  HALO_EXIT_AFTER: mode === 'discovery' ? '35' : '10',
  SDL_AUDIO_DRIVER: 'dummy',
});
if (mode === 'discovery')
  Object.assign(env, { HALO_NETWORK_TEST: 'host:bloodgulch:slayer', HALO_NETWORK_TEST_START: '45' });
const log = createWriteStream(path.join(output, 'stdio.log'), { flags: 'wx' });
const child = spawn(path.join(output, 'halo.exe'), [], {
  cwd: output,
  env,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let forced = false,
  logBytes = 0,
  spawnError;
const started = Date.now();
const capture = (bytes) => {
  logBytes += bytes.length;
  if (logBytes > 8 * 1024 * 1024) {
    forced = true;
    child.kill();
  } else log.write(bytes);
};
child.stdout.on('data', capture);
child.stderr.on('data', capture);
const watchdog = setTimeout(
  () => {
    forced = true;
    child.kill();
  },
  mode === 'discovery' ? 45000 : 15000,
);
const completed = new Promise((resolve) => {
  child.once('error', (error) => {
    spawnError = String(error);
  });
  child.once('close', (code, signal) => {
    clearTimeout(watchdog);
    log.end(() => resolve({ code, signal, forced, elapsedMs: Date.now() - started }));
  });
});
const receipt = {
  schemaVersion: 1,
  mode,
  runtime: publisher.id,
  revision: publisher.revision,
  exeSha256: publisher.files.find((file) => file.name === 'halo.exe').sha256,
  probeSha256: mode === 'discovery' ? hash(await fs.readFile(probe)) : null,
  input: input.map(({ name, sha256, cacheVersion, bytes }) => ({
    name,
    sha256,
    cacheVersion,
    bytes: bytes.length,
  })),
  privateLoopback: true,
  publicDiscovery: false,
  mccAttached: false,
  sessionAdmissionAttempted: false,
  mccClientJoined: false,
  crossPlayEstablished: false,
  settings: Object.fromEntries(
    Object.entries(env).filter(([name]) => name.startsWith('HALO_') || name === 'SDL_AUDIO_DRIVER'),
  ),
};
if (mode === 'discovery') {
  try {
    await Promise.race([
      new Promise((resolve) => setTimeout(resolve, 12000)),
      completed.then(() => {
        throw Error('Host exited before discovery');
      }),
    ]);
    const result = await run(probe, ['127.0.0.210:5150'], {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    receipt.discovery = JSON.parse(result.stdout);
    if (receipt.discovery.advertisement.mapName !== 'levels\\test\\bloodgulch\\bloodgulch')
      throw Error('Unexpected advertised map');
  } catch (error) {
    receipt.failure = String(error);
  }
}
receipt.exit = await completed;
if (spawnError) receipt.spawnError = spawnError;
receipt.inputsUnchanged = true;
for (const file of input) {
  if (
    hash(await fs.readFile(path.join(output, 'data/maps', file.name))) !== file.sha256 ||
    hash(await ownedRead(path.join(maps, file.name), 512 * 1024 * 1024)) !== file.sha256
  )
    receipt.inputsUnchanged = false;
}
const nativeLog = await fs.readFile(path.join(output, 'stdio.log'), 'utf8');
if (mode === 'mcc-content') {
  // Source-backed preflight rejection is the expected experiment result. It
  // proves this exact unmodified release cannot bootstrap from MCC-only files.
  receipt.cache13BootstrapRejected =
    receipt.exit.code === 1 &&
    !receipt.exit.forced &&
    /is not the Xbox maps \(ui\.map version 13\): quitting/.test(nativeLog);
  receipt.expectedResultObserved = receipt.cache13BootstrapRejected;
} else
  receipt.expectedResultObserved =
    !receipt.failure && !!receipt.discovery && receipt.exit.code === 0 && !receipt.exit.forced;
await fs.writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    mode,
    expectedResultObserved: receipt.expectedResultObserved,
    exit: receipt.exit,
    inputsUnchanged: receipt.inputsUnchanged,
  }),
);
if (!receipt.expectedResultObserved || !receipt.inputsUnchanged || spawnError)
  throw Error('Native boundary experiment failed; inspect retained receipt');
