import { assertQaOutputPath } from './native-qa-storage.mjs';
// Explicit owner-run benchmark. Reads existing tags through a pinned local
// Invader, replays only recorded -G/-C requests, and never edits or launches Halo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readNativeTagValues } from './native-tag-readback.mjs';

const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i],
    value = process.argv[i + 1];
  if (
    !['--tag-root', '--read-receipt', '--invader-edit', '--output'].includes(key) ||
    !value ||
    options.has(key)
  )
    throw Error('Use four unique required named arguments');
  options.set(key, value);
}
if (options.size !== 4 || process.platform !== 'win32') throw Error('Windows native benchmark only');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function read(file, limit = 16 * 1024 * 1024) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw Error('Expected bounded regular input');
  const bytes = await fs.readFile(file),
    after = await fs.lstat(file);
  if (bytes.length !== stat.size || stat.mtimeMs !== after.mtimeMs || stat.size !== after.size)
    throw Error('Input changed during read');
  return bytes;
}
const tags = await fs.realpath(options.get('--tag-root'));
const exe = await fs.realpath(options.get('--invader-edit'));
const pins = JSON.parse(
  await fs.readFile(new URL('../docs/fixtures/c45-carrier-inputs.json', import.meta.url)),
);
if (hash(await read(exe)) !== pins.tools.invaderEdit) throw Error('Unreviewed native tool');
const receiptBytes = await read(options.get('--read-receipt'), 1024 * 1024);
const receipt = JSON.parse(receiptBytes);
if (
  receipt.complete !== true ||
  receipt.originalsUnchanged !== true ||
  !Array.isArray(receipt.steps) ||
  receipt.steps.length > 4096
)
  throw Error('Complete preserved native recipe receipt required');
const groups = [];
let previous;
for (const step of receipt.steps) {
  const args = step.args;
  if (!Array.isArray(args) || args.length !== 5 || args[0] !== '-t' || !['-G', '-C'].includes(args[2]))
    continue;
  const [key, tag] = args.slice(3);
  if (
    typeof tag !== 'string' ||
    tag.length > 240 ||
    /[:\\\0-\x1f]/.test(tag) ||
    path.isAbsolute(tag) ||
    tag.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw Error('Invalid native tag identity');
  const request = { op: args[2] === '-G' ? 'get' : 'count', key };
  const id = request.op + ':' + key;
  if (!previous || previous.tag !== tag || previous.seen.has(id) || previous.requests.length >= 4096) {
    previous = { tag, requests: [], seen: new Set() };
    groups.push(previous);
  }
  previous.requests.push(request);
  previous.seen.add(id);
}
if (!groups.length || groups.length > 256) throw Error('Bounded recorded native read plan required');
const inputs = new Map();
for (const { tag } of groups) {
  const file = path.join(tags, tag),
    actual = await fs.realpath(file);
  if (actual !== file || !path.relative(tags, actual) || path.relative(tags, actual).startsWith('..'))
    throw Error('Native input must stay within its exact tag tree');
  inputs.set(tag, hash(await read(file, 512 * 1024 * 1024)));
}
// Validate every key/count request before any native process is started.
for (const group of groups)
  await readNativeTagValues(group.requests, {
    read: async () => Buffer.from('plan validation'),
    run: async (args) =>
      Array.from({ length: args.length / 2 }, (_, i) => (args[i * 2] === '-C' ? '0' : '')).join('\n') + '\n',
  });
const output = path.resolve(options.get('--output'));
await fs.mkdir(await assertQaOutputPath(output));
let serial = 0,
  invocations = 0;
async function native(tag, args) {
  const r = spawnSync(exe, ['-t', tags, ...args, tag], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 2 * 1024 * 1024,
  });
  invocations++;
  const file = `native-${String(serial++).padStart(5, '0')}.json`;
  await fs.writeFile(
    path.join(output, file),
    JSON.stringify({ tag, args, status: r.status, stdout: r.stdout, stderr: r.stderr }) + '\n',
    { flag: 'wx' },
  );
  if (r.status !== 0 || r.error) throw Error('Native readback failed: ' + file);
  return r.stdout;
}
const runs = [];
for (let pair = 0; pair < 3; pair++)
  for (const mode of pair % 2 ? ['batch', 'sequential'] : ['sequential', 'batch']) {
    for (const [tag, sha] of inputs)
      if (hash(await read(path.join(tags, tag), 512 * 1024 * 1024)) !== sha)
        throw Error('Native input changed before benchmark pass');
    const start = performance.now(),
      firstInvocation = invocations,
      values = [];
    for (const group of groups) {
      if (mode === 'sequential') {
        for (const { op, key } of group.requests)
          values.push((await native(group.tag, [op === 'get' ? '-G' : '-C', key])).trim());
      } else
        values.push(
          ...(await readNativeTagValues(group.requests, {
            read: () => read(path.join(tags, group.tag), 512 * 1024 * 1024),
            run: (args) => native(group.tag, args),
          })),
        );
    }
    const elapsedMs = performance.now() - start;
    for (const [tag, sha] of inputs)
      if (hash(await read(path.join(tags, tag), 512 * 1024 * 1024)) !== sha)
        throw Error('Native input changed during benchmark pass');
    const result = {
      pair,
      mode,
      elapsedMs,
      invocations: invocations - firstInvocation,
      values: values.length,
      valuesSha256: hash(JSON.stringify(values)),
    };
    runs.push(result);
    if (runs.some((run) => run.valuesSha256 !== result.valuesSha256 || run.values !== result.values))
      throw Error('Sequential and batched native values differ');
    await fs.writeFile(path.join(output, `${pair}-${mode}-values.json`), JSON.stringify(values) + '\n', {
      flag: 'wx',
    });
    console.log(JSON.stringify(result));
  }
const median = (mode) =>
  runs
    .filter((run) => run.mode === mode)
    .map((run) => run.elapsedMs)
    .sort((a, b) => a - b)[1];
const report = {
  schemaVersion: 1,
  benchmarkSourceSha256: hash(await fs.readFile(new URL(import.meta.url))),
  nativeReadbackSourceSha256: hash(await fs.readFile(new URL('./native-tag-readback.mjs', import.meta.url))),
  measuredAt: new Date().toISOString(),
  nativeToolSha256: pins.tools.invaderEdit,
  readReceiptSha256: hash(receiptBytes),
  sourceTags: [...inputs],
  runs,
  sequentialMedianMs: median('sequential'),
  batchMedianMs: median('batch'),
  improvementPercent: (1 - median('batch') / median('sequential')) * 100,
  everyValueIdentical: true,
  sourceTagsUnchanged: true,
  gameLaunched: false,
  scope:
    'Native conversion readback phase under a warm OS file cache. Fresh output, alternating order; all native outputs retained. Not total conversion time or desktop/rendering performance.',
};
await fs.writeFile(path.join(output, 'benchmark.json'), JSON.stringify(report, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    sequentialMedianMs: report.sequentialMedianMs,
    batchMedianMs: report.batchMedianMs,
    improvementPercent: report.improvementPercent,
    everyValueIdentical: true,
    sourceTagsUnchanged: true,
  }),
);
