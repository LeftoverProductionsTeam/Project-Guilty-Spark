// Fixed release gates, real subprocesses, durable private logs. No supplied commands.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { assertQaOutputPath } from '../native-qa-storage.mjs';
const [commit, output] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit ?? '') || !output) throw Error('gates <full commit> <fresh log directory>');
const git = (...args) => execFileSync('git', args, { windowsHide: true }).toString().trim();
if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain'))
  throw Error('Release gates require the exact clean committed source');
await assertQaOutputPath(output, { reservationBytes: 64 * 1024 ** 2 });
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.mkdir(output, { recursive: false });
const python = process.env.SPARK_RELEASE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const node = (...args) => [process.execPath, args];
const commands = [
  ['source-interfaces', ...node('--test', 'scripts/check-source-entrypoints.test.mjs')],
  ['storage-ownership', ...node('--test', 'scripts/native-qa-storage.test.mjs', 'scripts/repository-health.test.mjs')],
  ['rust-workspace', ...node('scripts/cargo.mjs', 'test', '--workspace', '--locked')],
  ['typescript', ...node('node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false')],
  ['frontend', ...node('scripts/frontend-tests.mjs', 'unit')],
  [
    'offline',
    ...(process.platform === 'win32'
      ? [process.env.ComSpec ?? 'C:/Windows/System32/cmd.exe', ['/d', '/s', '/c', 'pnpm run test:offline']]
      : ['pnpm', ['run', 'test:offline']]),
  ],
  ['browser', ...node('scripts/frontend-tests.mjs', 'browser')],
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
const required = JSON.parse(await fs.readFile(new URL('./required-gates.json', import.meta.url), 'utf8'));
if (new Set(required).size !== required.length || JSON.stringify(required) !== JSON.stringify(commands.map(([id]) => id)))
  throw Error('Release runner and package-verification gate contracts differ; no release gate was run');
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
  const env = { ...process.env, SPARK_RELEASE_GATES: '1' };
  if (id === 'browser') {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    env.SPARK_UI_TEST_PORT = String(server.address().port);
    env.SPARK_BROWSER_EVIDENCE_DIR = path.resolve(output, 'browser-artifacts');
    await new Promise((resolve) => server.close(resolve));
  }
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
