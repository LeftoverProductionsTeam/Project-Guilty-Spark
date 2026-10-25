import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
const root = (await readFile('.local/qa/restoration-temp-root.txt', 'utf8')).trim();
const candidates = JSON.parse(await readFile('.local/qa/candidates.json', 'utf8')).filter(
  (c) => c.scenarioType === 1,
);
const resources = path.resolve('Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps');
const hash = async (file) => {
  const h = createHash('sha256');
  for await (const b of createReadStream(file)) h.update(b);
  return h.digest('hex');
};
const seen = new Map();
const results = [];
for (const candidate of candidates) {
  const before = await hash(candidate.path);
  if (seen.has(before)) {
    results.push({ ...candidate, sha256: before, duplicateOf: seen.get(before) });
    continue;
  }
  seen.set(before, candidate.path);
  const args = [root, candidate.path, path.resolve('.local/tools/invader'), resources];
  console.log(`Testing ${path.relative(process.cwd(), candidate.path)}`);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(path.resolve('target/debug/examples/qa_build.exe'), args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (b) => {
      stdout += b;
    });
    child.stderr.on('data', (b) => {
      stderr += b;
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
  const after = await hash(candidate.path);
  if (before !== after) throw new Error('Source integrity changed during test');
  results.push({ ...candidate, sha256: before, sourceUnchanged: true, ...result });
  console.log(result.stdout.slice(-2200) || result.stderr);
  await writeFile('.local/qa/restoration-build-results.json', JSON.stringify(results, null, 2));
}
await writeFile('.local/qa/restoration-build-results.json', JSON.stringify(results, null, 2));
console.log('Candidate report complete. No source file was modified or game package installed.');
