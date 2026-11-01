// Fixed release gates, real subprocesses, durable private logs. No supplied commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const [commit, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !output) throw Error('gates <full commit> <fresh log directory>');
const git = (...args) => execFileSync('git', args, { windowsHide: true }).toString().trim();
if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain'))
  throw Error('Release gates require the exact clean committed source');
await fs.mkdir(output, { recursive: false });
const python = process.env.SPARK_RELEASE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const node = (...args) => [process.execPath, args];
const commands = [
  ['rust-workspace', ...node('scripts/cargo.mjs', 'test', '--workspace', '--locked')],
  ['typescript', ...node('node_modules/typescript/bin/tsc', '-b')],
  ['frontend', ...node('node_modules/vitest/vitest.mjs', 'run')],
  [
    'offline',
    ...(process.platform === 'win32'
      ? [process.env.ComSpec ?? 'C:/Windows/System32/cmd.exe', ['/d', '/s', '/c', 'pnpm run test:offline']]
      : ['pnpm', ['run', 'test:offline']]),
  ],
  ['browser', ...node('node_modules/@playwright/test/cli.js', 'test')],
  [
    'native-diagnostics',
    ...node(
      '--test',
      'scripts/probe-mcc-h1-interface.test.mjs',
      'scripts/analyze-opence-ai.test.mjs',
      'scripts/native-runtime-health.test.mjs',
      'scripts/recover-zombie-carriers-native.test.mjs',
      'scripts/native-tag-readback.test.mjs',
      'scripts/verify-native-sound-chains.test.mjs',
      'scripts/prepare-native-adpcm-waves.test.mjs',
    ),
  ],
  ['release-pipeline', ...node('scripts/release/test-pipeline.mjs', python)],
];
const receipt = {
  schemaVersion: 1,
  sourceCommit: commit,
  platform: process.platform === 'win32' ? 'windows-x64' : 'linux-x64',
  startedAt: new Date().toISOString(),
  complete: false,
  gates: [],
};
for (const [id, executable, args] of commands) {
  const chunks = [],
    started = performance.now();
  console.log('Running release gate:', id);
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => {
      chunks.push(b);
      process.stdout.write(b);
    });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (c) => resolve(c ?? -1));
  });
  const bytes = Buffer.concat(chunks);
  await fs.writeFile(path.join(output, id + '.log'), bytes, { flag: 'wx' });
  receipt.gates.push({
    id,
    exitCode,
    durationMs: performance.now() - started,
    logSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
  await fs.writeFile(path.join(output, 'gates.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (exitCode !== 0) throw Error(`Release gate failed: ${id} (${exitCode}). Evidence retained.`);
}
if (git('status', '--porcelain')) throw Error('Tests changed tracked source; receipt is not accepted');
receipt.complete = true;
receipt.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(output, 'gates.json'), JSON.stringify(receipt, null, 2) + '\n');
