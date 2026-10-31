// Opt-in real CE engine smoke test. Copies an already inspected runtime into a
// fresh short path; binds only loopback, disables public listing, never edits
// the original runtime or claims movement/gameplay from a responding process.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import dgram from 'node:dgram';
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (
    !['--runtime', '--output', '--client', '--map'].includes(process.argv[i]) ||
    !process.argv[i + 1] ||
    args.has(process.argv[i])
  )
    throw Error(
      'Use --runtime checked-CE-folder --output fresh-short-folder [--client true] [--map native-CE.map]',
    );
  args.set(
    process.argv[i],
    process.argv[i] === '--client' ? process.argv[i + 1] : path.resolve(process.argv[i + 1]),
  );
}
if (
  !args.has('--runtime') ||
  !args.has('--output') ||
  (args.has('--client') && args.get('--client') !== 'true')
)
  throw Error('Runtime/output required; optional client must be true');
const root = args.get('--output'),
  runtime = args.get('--runtime');
if (root.length > 130) throw Error('Use a short fresh output folder for this legacy game');
const relative = path.relative(runtime, root);
if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
  throw Error('Output must be outside the original game');
await fs.mkdir(root);
const hash = async (file) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex');
const original = await hash(path.join(runtime, 'haloceded.exe'));
const game = path.join(root, 'game'),
  profile = path.join(root, 'profile');
await fs.cp(runtime, game, { recursive: true, force: false, errorOnExist: true });
await fs.mkdir(profile);
const mapName = args.has('--map') ? path.basename(args.get('--map'), '.map') : 'bloodgulch';
if (!/^[a-z0-9_]{1,31}$/.test(mapName))
  throw Error('Use the actual short native map filename (letters, digits, underscore)');
let mapSha256;
if (args.has('--map')) {
  const file = await fs.open(args.get('--map'), 'r');
  const header = Buffer.alloc(2048);
  try {
    await file.read(header, 0, header.length, 0);
  } finally {
    await file.close();
  }
  if (
    header.toString('ascii', 0, 4) !== 'daeh' ||
    header.readUInt32LE(4) !== 609 ||
    header.readUInt16LE(96) !== 1 ||
    header.toString('ascii', 2044, 2048) !== 'toof'
  )
    throw Error(
      'This server test requires an actual CE v609 multiplayer cache; changing a header is not conversion',
    );
  const authoredName = header.toString('ascii', 32, 64).split(String.fromCharCode(0))[0];
  if (authoredName !== mapName) throw Error('Preserve the native compiler map filename');
  mapSha256 = await hash(args.get('--map'));
  await fs.copyFile(args.get('--map'), path.join(game, 'maps', mapName + '.map'), fs.constants.COPYFILE_EXCL);
}
const reportsMap = (text) =>
  text.includes('\\mapname\\' + mapName + '\\') && text.includes('\\gamemode\\openplaying\\');
const sock = dgram.createSocket('udp4');
await new Promise((r) => sock.bind(0, '127.0.0.1', r));
const port = sock.address().port;
await new Promise((r) => sock.close(r));
await fs.writeFile(
  path.join(root, 'init.txt'),
  [
    'sv_name "Spark private acceptance"',
    'sv_public false',
    'sv_maxplayers 2',
    'sv_log_enabled true',
    'sv_log_file "spark-test"',
    `sv_map ${mapName} slayer`,
    'sv_status',
    '',
  ].join('\r\n'),
);
let stdout = '',
  stderr = '';
const server = spawn(
  path.join(game, 'haloceded.exe'),
  ['-ip', '127.0.0.1', '-port', String(port), '-path', profile, '-exec', path.join(root, 'init.txt')],
  { cwd: game, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
);
server.stdout.on('data', (b) => {
  stdout = (stdout + b.toString()).slice(-65536);
});
server.stderr.on('data', (b) => {
  stderr = (stderr + b.toString()).slice(-65536);
});
const replies = [];
async function query(port) {
  const socket = dgram.createSocket('udp4');
  socket.on('message', (bytes, remote) => {
    if (remote.address === '127.0.0.1' && bytes.length <= 32768) replies.push(bytes.toString('latin1'));
  });
  await new Promise((resolve) => {
    socket.bind(0, '127.0.0.1', () => {
      socket.send(Buffer.from('\\status\\'), port, '127.0.0.1', resolve);
    });
  });
  await new Promise((r) => setTimeout(r, 500));
  socket.close();
}
const receipt = {
  schemaVersion: 1,
  engine: 'Halo Custom Edition',
  serverSha256: original,
  mapName,
  mapSha256,
  gameProcessId: server.pid,
  bind: '127.0.0.1',
  port,
  publicListingRequested: false,
  gameplayVerified: false,
  complete: false,
};
let client;
try {
  for (let n = 0; n < 16; n++) {
    await new Promise((r) => setTimeout(r, 500));
    if (server.exitCode !== null) break;
    if (n % 4 === 3) {
      await query(port);
      await query(port + 1);
    }
    if (replies.some(reportsMap)) break;
  }
  if (args.has('--client') && replies.some(reportsMap)) {
    const clientProfile = path.join(root, 'client-profile');
    await fs.mkdir(clientProfile);
    client = spawn(
      path.join(game, 'haloce.exe'),
      [
        '-windowed',
        '-vidmode',
        '800,600,60',
        '-novideo',
        '-nosound',
        '-path',
        clientProfile,
        '-connect',
        `127.0.0.1:${port}`,
      ],
      { cwd: game, windowsHide: true, stdio: 'ignore' },
    );
    receipt.clientProcessId = client.pid;
    for (let n = 0; n < 24; n++) {
      await new Promise((r) => setTimeout(r, 500));
      await query(port);
      if (replies.some((text) => /\\numplayers\\[1-9]/.test(text))) break;
      if (client.exitCode !== null) break;
    }
    receipt.nativeClientJoined = replies.some((text) => /\\numplayers\\[1-9]/.test(text));
    receipt.clientExitCode = client.exitCode;
  }
  const logs = [];
  for (const folder of [game, profile]) {
    for (const file of await fs.readdir(folder)) {
      if (/\.log$/i.test(file)) {
        const bytes = await fs.readFile(path.join(folder, file));
        logs.push({
          name: file,
          text:
            bytes[0] === 255 && bytes[1] === 254
              ? bytes.subarray(2).toString('utf16le')
              : bytes.toString('utf8'),
        });
      }
    }
  }
  await fs.writeFile(path.join(root, 'stdout.txt'), stdout);
  await fs.writeFile(path.join(root, 'stderr.txt'), stderr);
  receipt.processResponding = server.exitCode === null;
  receipt.exitCode = server.exitCode;
  receipt.queryReplies = replies;
  receipt.logs = logs;
  receipt.nativeMapReported = replies.some(reportsMap);
  if (args.has('--map'))
    receipt.authoredMapUnchanged =
      mapSha256 === (await hash(args.get('--map'))) &&
      mapSha256 === (await hash(path.join(game, 'maps', mapName + '.map')));
  receipt.originalExecutableUnchanged = original === (await hash(path.join(runtime, 'haloceded.exe')));
  receipt.complete =
    receipt.nativeMapReported &&
    receipt.originalExecutableUnchanged &&
    (!args.has('--client') || receipt.nativeClientJoined === true);
  await fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      complete: receipt.complete,
      processResponding: receipt.processResponding,
      queryReplies: replies.length,
      nativeMapReported: receipt.nativeMapReported,
      nativeClientJoined: receipt.nativeClientJoined,
      clientExitCode: receipt.clientExitCode,
      logFiles: logs.map((l) => l.name),
    }),
  );
  if (!receipt.complete) process.exitCode = 1;
} finally {
  if (client?.exitCode === null) client.kill();
  if (server.exitCode === null) {
    server.stdin.write('quit\r\n');
    await new Promise((r) => setTimeout(r, 300));
    if (server.exitCode === null) server.kill();
  }
}
