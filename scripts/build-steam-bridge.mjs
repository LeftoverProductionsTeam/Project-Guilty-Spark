// Optional, explicitly invoked module build. Normal desktop builds do not run this.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const outputIndex = process.argv.indexOf('--output');
if (process.platform !== 'win32' || outputIndex < 0 || !process.argv[outputIndex + 1])
  throw Error('Use on Windows: node scripts/build-steam-bridge.mjs --output releases/<fresh-module-folder>');
const output = path.resolve(process.argv[outputIndex + 1]),
  root = process.cwd();
if (
  ![path.resolve('releases'), path.resolve('.local')].some((base) => output.startsWith(base + path.sep)) ||
  fs.existsSync(output)
)
  throw Error('Choose a fresh module folder under releases/ or .local/');
const build = spawnSync(
  process.execPath,
  [
    'scripts/cargo.mjs',
    'build',
    '-p',
    'spark-steam-bridge',
    '--release',
    '--locked',
    '--message-format=json',
  ],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, cwd: root },
);
if (build.status !== 0) {
  process.stderr.write(build.stderr || build.stdout);
  process.exit(build.status ?? 1);
}
const messages = build.stdout.split(/\r?\n/).flatMap((line) => {
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
});
const sdk = messages.find(
  (item) => item.reason === 'build-script-executed' && item.package_id?.includes('steamworks-sys'),
);
const helper = messages.find(
  (item) =>
    item.reason === 'compiler-artifact' && item.target?.name === 'SparkSteamBridge' && item.executable,
);
if (!sdk || !helper) throw Error('The compiled helper and SDK runtime were not recorded');
fs.mkdirSync(output);
const files = [];
for (const [source, name] of [
  [helper.executable, 'SparkSteamBridge.exe'],
  [path.join(sdk.out_dir, 'steam_api64.dll'), 'steam_api64.dll'],
]) {
  const bytes = fs.readFileSync(source),
    sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx' });
  if (!fs.readFileSync(path.join(output, name)).equals(bytes)) throw Error('Module copy differs');
  files.push({ name, sha256, bytes: bytes.length });
}
fs.writeFileSync(
  path.join(output, 'spark-steam-module.json'),
  JSON.stringify({ schemaVersion: 1, sdkVersion: '1.64', appId: 480, testMode: true, files }, null, 2) + '\n',
  { flag: 'wx' },
);
fs.writeFileSync(
  path.join(output, 'README.txt'),
  'Optional Spark Spacewar test module. App ID 480 is development/test mode. Select this folder in Shared QuickForge before enabling Steam. Two-user relay and game-peer behavior require separate testing.\nSteamworks SDK runtime copyright Valve Corporation. Steamworks documentation: https://partner.steamgames.com/doc/sdk/api/example\n',
  { flag: 'wx' },
);
const inventory = JSON.parse(fs.readFileSync('docs/DEPENDENCY_LICENSES.json', 'utf8'));
const packages = inventory.packages.filter(
  (pkg) => pkg.ecosystem === 'cargo' && ['steamworks', 'steamworks-sys', 'paste'].includes(pkg.name),
);
if (packages.length !== 3) throw Error('Regenerate dependency notices before packaging this optional module');
fs.mkdirSync(path.join(output, 'licenses'));
for (const notice of new Set(packages.flatMap((pkg) => pkg.notices)))
  fs.copyFileSync(notice, path.join(output, 'licenses', path.basename(notice)), fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(output, 'licenses', 'inventory.json'), JSON.stringify(packages, null, 2) + '\n', {
  flag: 'wx',
});
process.stdout.write(
  JSON.stringify({
    module: path.relative(root, output),
    appId: 480,
    files: files.map((file) => ({ name: file.name, sha256: file.sha256 })),
  }) + '\n',
);
