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
    !['--host-id', '--host-dir', '--client-id', '--client-dir', '--maps', '--output', '--mode'].includes(
      process.argv[at],
    ) ||
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
    'Required: --host-id pinned-id --host-dir official-release-folder --client-id pinned-id --client-dir official-release-folder --maps owned-Xbox-maps-folder --output fresh-directory [--mode bloodgulch:slayer|a30:coop]',
  );
const hostId = args.get('--host-id'),
  clientId = args.get('--client-id'),
  mode = args.get('--mode') ?? 'bloodgulch:slayer';
const allowed = ['opence-build-329', 'chupathingy-v0.8.1c'];
if (
  ![hostId, clientId].every((id) => allowed.includes(id)) ||
  !['bloodgulch:slayer', 'a30:coop'].includes(mode)
)
  throw Error('Use the exact pinned test releases and reviewed game modes');
const output = path.resolve(args.get('--output')),
  fixtures = path.resolve(args.get('--maps')),
  label = path.basename(output);
await fs.mkdir(output);
const publisher = JSON.parse(
  await fs.readFile(new URL('../docs/fixtures/c36-community-client-files.json', import.meta.url), 'utf8'),
);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourceNames = ['ui.map', 'carousel.map', mode === 'a30:coop' ? 'a30.map' : 'bloodgulch.map'];
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
  async function copyDirectory(relative = '') {
    for (const row of await fs.readdir(path.join(client, relative), { withFileTypes: true })) {
      if (
        row.isSymbolicLink() ||
        (!row.isDirectory() && !row.isFile()) ||
        !/^[A-Za-z0-9_. -]+$/.test(row.name)
      )
        throw Error('Unexpected release member');
      const member = path.join(relative, row.name);
      if (row.isDirectory()) {
        await fs.mkdir(path.join(root, member));
        await copyDirectory(member);
      } else {
        const known = publisher.clients
          .find((release) => release.id === id)
          ?.files.find((file) => file.name === member.replaceAll('\\', '/'));
        if (!known || hash(await fs.readFile(path.join(client, member))) !== known.sha256)
          throw Error('Release member not in verified publisher inventory');
        await fs.copyFile(path.join(client, member), path.join(root, member), fs.constants.COPYFILE_EXCL);
      }
    }
  }
  await copyDirectory();
  const executable = path.join(root, 'halo.exe');
  if (hash(await fs.readFile(executable)) !== expected[id]) throw Error('Release EXE identity differs');
  const inputs = [];
  for (const file of extraction.files.filter(
    (file) =>
      file.name === 'ui.map' ||
      file.name === 'carousel.map' ||
      file.name === (mode === 'a30:coop' ? 'a30.map' : 'bloodgulch.map'),
  )) {
    const original = path.join(fixtures, file.name),
      target = path.join(root, 'data', 'maps', file.name);
    if (hash(await fs.readFile(original)) !== file.sha256) throw Error('Derived source map changed');
    await fs.copyFile(original, target, fs.constants.COPYFILE_EXCL);
    if (hash(await fs.readFile(target)) !== file.sha256) throw Error('Game copy identity differs');
    inputs.push(file);
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('HALO_')));
  Object.assign(
    env,
    plan.proposedTwoGameTest.sharedEnvironment,
    id === allowed[0]
      ? plan.proposedTwoGameTest.openCeAdditionalEnvironment
      : plan.proposedTwoGameTest.chupathingyAdditionalEnvironment,
    {
      HALO_DATA_ROOT: path.join(root, 'data'),
      HALO_SAVE_ROOT: path.join(root, 'save'),
      HALO_LOG_ROOT: path.join(root, 'logs'),
      HALO_NETWORK_TEST: role === 'host' ? `host:${mode}` : 'join',
      HALO_NETWORK_TEST_START: '12',
      HALO_NETWORK_TEST_SHOOT: '4',
      HALO_NETWORK_TEST_KILL: '17',
      HALO_TEST_INPUT: role === 'host' ? 'bot:1' : 'bot:2',
      HALO_EXIT_AFTER: role === 'host' ? '80' : '60',
      HALO_NET_ADDRESS: role === 'host' ? '127.0.0.210' : '127.0.0.211',
      HALO_NET_BROADCAST: role === 'host' ? '127.0.0.211' : '127.0.0.210',
      HALO_HIDDEN_WINDOW: 'true',
      HALO_NULL_RENDERER: id === allowed[0] ? 'true' : 'false',
      HALO_CONSOLE_LOG: 'all',
      HALO_DISCORD_PRESENCE: 'false',
      HALO_UPDATE_AUTO: 'false',
      HALO_CRASH_REPORTS: 'no',
      SDL_AUDIO_DRIVER: 'dummy',
    },
  );
  if (id === allowed[0]) env.SDL_VIDEO_DRIVER = 'dummy';
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
    renderer: id === allowed[0] ? 'native-null' : 'hidden-native-window',
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
      record.exitCode = code;
      record.signal = signal;
      record.forced = forced;
      record.exitedAt = new Date().toISOString();
      await new Promise((finish) => log.end(finish));
      record.inputsUnchanged = true;
      try {
        for (const file of inputs)
          if (hash(await fs.readFile(path.join(root, 'data', 'maps', file.name))) !== file.sha256)
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
