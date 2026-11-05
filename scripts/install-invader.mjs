// Optional development dependency. Never bundled with Guilty Spark. No game assets are downloaded.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDevelopmentWorkspace, runDevelopmentCommand } from './native-qa-storage.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'tools/invader');
const url =
  'https://github.com/SnowyMouse/invader/releases/download/0.55.0/invader-0.55.0-r4134-33518109-win32.7z';
// Pin the already owner-installed upstream distribution. This is a byte
// identity, not a publisher signature. No installer archive stays in source.
const expected = '62ba9002055c328248c09ec4081acccd2093f7734754c32a227f02ab5636ec19';
if (await fs.stat(directory).catch(() => null))
  throw Error('Invader already exists; the installed tools are protected. Use their registered path.');
await withDevelopmentWorkspace(
  'install-invader',
  async (context) => {
    const archive = path.join(context.directory, 'invader.7z');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of r.body) {
      total += chunk.length;
      if (total > 64 * 1024 ** 2) throw Error('Invader download exceeds its explicit budget');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
      throw Error('Invader distribution identity differs; no installation attempted');
    await fs.writeFile(archive, bytes, { flag: 'wx' });
    const inventory = execFileSync('tar.exe', ['-tf', archive], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 1024 ** 2,
    });
    const entries = inventory.split(/\r?\n/).filter(Boolean);
    if (entries.some((p) => /^[\\/]|^[a-z]:/i.test(p) || p.split(/[\\/]/).includes('..')))
      throw new Error('Unsafe archive path');
    console.log('Extracting separately installed Invader 0.55.0 to', directory, 'entries:', entries.length);
    await fs.mkdir(directory, { recursive: false });
    await runDevelopmentCommand('tar.exe', ['-xf', archive, '-C', directory], context);
    console.log(
      'Installed. Inspect its LICENSE files before redistributing any part of this separate toolset.',
    );
  },
  { reservationBytes: 128 * 1024 ** 2 },
);
