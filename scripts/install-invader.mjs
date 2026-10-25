// Optional development dependency. Never bundled with Guilty Spark. No game assets are downloaded.
import { mkdir, writeFile, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const directory = path.resolve('.local/tools/invader');
await promisify(mkdir)(directory, { recursive: true });
const url =
  'https://github.com/SnowyMouse/invader/releases/download/0.55.0/invader-0.55.0-r4134-33518109-win32.7z';
const archive = path.resolve('.local/tools/invader-0.55.0.7z');
if (!existsSync(archive)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  await promisify(writeFile)(archive, Buffer.from(await r.arrayBuffer()));
}
const inventory = spawnSync('tar.exe', ['-tf', archive], { encoding: 'utf8', windowsHide: true });
if (inventory.status !== 0) throw new Error(inventory.stderr);
const entries = inventory.stdout.split(/\r?\n/).filter(Boolean);
if (entries.some((p) => /^[\\/]|^[a-z]:/i.test(p) || p.split(/[\\/]/).includes('..')))
  throw new Error('Unsafe archive path');
console.log('Extracting separately installed Invader 0.55.0 to', directory, 'entries:', entries.length);
const extract = spawnSync('tar.exe', ['-xf', archive, '-C', directory], {
  stdio: 'inherit',
  windowsHide: true,
});
if (extract.status !== 0) process.exit(extract.status ?? 1);
console.log('Installed. Inspect its LICENSE files before redistributing any part of this separate toolset.');
