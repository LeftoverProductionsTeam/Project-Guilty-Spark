// Central native copy helper. Missing helper or quota = fail before copying.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { assertQaOutputPath } from './native-qa-storage.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = new Set([
  '.local',
  '.git',
  'jobs',
  'archives',
  'target',
  'dist',
  'node_modules',
  'storage-v1',
  '.spark-storage-v1',
  'artifacts',
  'preserved',
]);
export async function safeQaCopy(source, destination, options = {}) {
  source = path.resolve(source);
  destination = path.resolve(destination);
  await assertQaOutputPath(destination);
  if (options.dereference) throw Error('QA copies cannot follow source links');
  if ((await fs.lstat(source)).isSymbolicLink()) throw Error('QA copy refuses a linked source root');
  if ((await fs.realpath(source)).toLowerCase() !== source.toLowerCase())
    throw Error('QA copy refuses a linked or aliased source ancestor');
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return (
      relative === '' ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  if (contains(source, destination) || contains(destination, source))
    throw Error('QA source and destination must not contain one another');
  const maximum = Number(process.env.SPARK_QA_COPY_BUDGET_BYTES ?? 256 * 1024 * 1024);
  if (!Number.isSafeInteger(maximum) || maximum <= 0 || maximum > 4 * 1024 * 1024 * 1024)
    throw Error('QA copy budget must be 1 byte to 4 GiB');
  const stack = [source],
    files = [];
  let bytes = 0,
    directories = 0;
  while (stack.length) {
    const directory = stack.pop();
    if (++directories > 20000 || path.relative(source, directory).split(path.sep).length > 32)
      throw Error('QA copy exceeds its directory or depth budget');
    const rows = await fs.readdir(directory, { withFileTypes: true });
    for (const row of rows) {
      const file = path.join(directory, row.name),
        relative = path.relative(source, file),
        output = path.join(destination, relative);
      if (options.filter && !(await options.filter(file, output))) continue;
      if (forbidden.has(row.name.toLowerCase()))
        throw Error(`QA copy source contains generated data: ${relative}`);
      if (row.isSymbolicLink()) throw Error(`QA copy refuses links: ${relative}`);
      if (row.isDirectory()) {
        stack.push(file);
        continue;
      }
      if (!row.isFile()) throw Error('QA copy requires regular files');
      const metadata = await fs.stat(file);
      bytes += metadata.size;
      if (bytes > maximum || files.length >= 200000)
        throw Error(
          `QA copy needs ${bytes} bytes, above its ${maximum}-byte limit. Reuse source inputs or explicitly review SPARK_QA_COPY_BUDGET_BYTES before a larger isolated trial.`,
        );
      files.push({ path: relative.replaceAll('\\', '/'), bytes: metadata.size });
    }
  }
  const executable =
    process.env.SPARK_QA_COPY_HELPER ??
    path.join(
      root,
      'target/release/examples',
      process.platform === 'win32' ? 'qa_safe_copy.exe' : 'qa_safe_copy',
    );
  if (path.resolve(executable).split(path.sep).some((part) => part.toLowerCase() === '.local'))
    throw Error('Use the current native copy helper in target/release/examples, not the obsolete .local tree');
  await fs.access(executable).catch(() => {
    throw Error(
      'Build the shared qa_safe_copy helper before an isolated recursive trial: node scripts/cargo.mjs build -p spark-core --example qa_safe_copy --release --locked',
    );
  });
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (b) => {
      stdout += b;
      if (stdout.length > 32 * 1024 * 1024) child.kill();
    });
    child.stderr.on('data', (b) => {
      stderr += b;
      if (stderr.length > 1024 * 1024) child.kill();
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) reject(Error(stderr || `Native QA copy refused (${code})`));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          reject(e);
        }
      }
    });
    child.stdin.end(JSON.stringify({ source, destination, plan: { files, bytes }, maxBytes: maximum }));
  });
}
