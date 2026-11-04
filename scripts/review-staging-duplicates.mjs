// Read-only review of one failed compiler's staged SDK copies. Unknown/changed
// files are retained. A plan is evidence for a separate human cleanup decision.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const digest = (file) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', (b) => h.update(b))
      .on('end', () => resolve(h.digest('hex')));
  });
function regularAncestors(p) {
  for (let at = path.resolve(p); ; at = path.dirname(at)) {
    const s = fs.lstatSync(at);
    if (s.isSymbolicLink()) throw Error(`Refusing linked path: ${at}`);
    if (path.dirname(at) === at) break;
  }
}
export async function reviewStagedCopies(candidate, source) {
  candidate = path.resolve(candidate);
  source = path.resolve(source);
  regularAncestors(candidate);
  regularAncestors(source);
  if (
    candidate === source ||
    candidate.startsWith(source + path.sep) ||
    source.startsWith(candidate + path.sep)
  )
    throw Error('Candidate must be separate from source');
  const pending = [candidate],
    duplicates = [],
    retained = [];
  let logicalBytes = 0,
    files = 0;
  while (pending.length) {
    const dir = pending.pop();
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name),
        relative = path.relative(candidate, file).replaceAll('\\', '/');
      if (item.isSymbolicLink()) {
        retained.push({ path: relative, reason: 'linked entry' });
        continue;
      }
      if (item.isDirectory()) {
        pending.push(file);
        continue;
      }
      const s = fs.lstatSync(file);
      if (!s.isFile()) {
        retained.push({ path: relative, reason: 'nonregular' });
        continue;
      }
      files++;
      logicalBytes += s.size;
      const original = path.join(source, ...relative.split('/'));
      try {
        regularAncestors(original);
        const a = fs.lstatSync(original);
        if (!a.isFile() || a.size !== s.size) throw Error('size or file type differs');
        const [left, right] = await Promise.all([digest(file), digest(original)]);
        const after = fs.statSync(file),
          sourceAfter = fs.statSync(original);
        if (
          left !== right ||
          after.size !== s.size ||
          after.mtimeMs !== s.mtimeMs ||
          sourceAfter.size !== a.size ||
          sourceAfter.mtimeMs !== a.mtimeMs
        )
          throw Error('hash differs or input changed');
        // Native file identity distinguishes separate allocations from hardlinks.
        duplicates.push({
          path: relative,
          bytes: s.size,
          sha256: left,
          source: original,
          hardlinked: s.ino === a.ino && s.dev === a.dev,
          mtimeMs: s.mtimeMs,
        });
      } catch (e) {
        retained.push({ path: relative, bytes: s.size, reason: String(e) });
      }
    }
  }
  return {
    schemaVersion: 1,
    readOnly: true,
    at: new Date().toISOString(),
    candidate,
    source,
    files,
    logicalBytes,
    duplicateBytes: duplicates.reduce((n, f) => n + f.bytes, 0),
    separatelyAllocatedLogicalBytes: duplicates.reduce((n, f) => n + (f.hardlinked ? 0 : f.bytes), 0),
    duplicates,
    retained,
    deletionApproved: false,
    note: 'No deletion performed. Recheck source hashes, current references and process ownership immediately before any approved cleanup. Unique files and failed-run evidence stay preserved.',
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [candidate, source] = process.argv.slice(2);
  if (!source) throw Error('review-staging-duplicates <failed tags folder> <preserved source tags>');
  process.stdout.write(JSON.stringify(await reviewStagedCopies(candidate, source)) + '\n');
}
