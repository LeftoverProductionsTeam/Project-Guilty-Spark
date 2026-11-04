// Read-only attribution of an existing repository-health inventory. No deletes,
// cache migration, extraction, database copies or automatic approval decisions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function physicalPath(value, root) {
  const p = value.replaceAll('\\', '/');
  for (const name of ['c39-native-collaboration', 'ci-manifest-paths', 'integration-all-continuations']) {
    const catalog = `${root.replaceAll('\\', '/')}/.local/artifacts/history/${name}`;
    if (p === catalog || p.startsWith(catalog + '/'))
      return path.resolve(root, '.local', name, p.slice(catalog.length + 1));
  }
  return path.resolve(value);
}
const walkStrings = (value, out) => {
  if (typeof value === 'string') {
    if (/^(?:[A-Za-z]:[\\/]|\\\\\?\\[A-Za-z]:\\)/.test(value)) out.add(value);
  } else if (Array.isArray(value)) for (const item of value) walkStrings(item, out);
  else if (value && typeof value === 'object')
    for (const item of Object.values(value)) walkStrings(item, out);
};
function boundedJson(file, limit = 34 * 1024 * 1024) {
  try {
    const m = fs.lstatSync(file);
    if (!m.isFile() || m.isSymbolicLink() || m.size > limit) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}
export function attributeStorage(report, root, processes = []) {
  const dirs = report.storage.directories.map((row) => ({ ...row, path: physicalPath(row.path, root) }));
  const references = new Map(),
    projects = [],
    receipts = [];
  const addReferences = (object, from) => {
    const paths = new Set();
    walkStrings(object, paths);
    for (const p of paths) {
      const key = physicalPath(p, root).toLowerCase();
      const refs = references.get(key) || [];
      refs.push(from);
      references.set(key, refs);
    }
  };
  for (const dir of dirs) {
    if (/[/\\]projects[/\\][0-9a-f-]{36}$/i.test(dir.path)) {
      const file = path.join(dir.path, 'project.gsproject'),
        p = boundedJson(file);
      if (p) {
        projects.push({ path: file, id: p.id, title: p.title, builds: p.builds?.length ?? 0 });
        addReferences(p, file);
      }
    }
    if (/[/\\]jobs[/\\](?:baboon-)?[0-9a-f-]{36}$/i.test(dir.path)) {
      for (const leaf of ['receipt.json', 'quickforge-receipt.json', 'handoff.json']) {
        const file = path.join(dir.path, leaf),
          r = boundedJson(file);
        if (r) {
          receipts.push({
            path: file,
            job: dir.path,
            status: r.status ?? null,
            selectedTag: r.selectedTag ?? null,
          });
          addReferences(r, file);
        }
      }
    }
  }
  const major = dirs
    .filter((d) => d.logicalBytes >= 256 * 1024 * 1024)
    .map((dir) => {
      const prefix = dir.path.toLowerCase(),
        refs = [];
      for (const [p, owners] of references)
        if (p === prefix || p.startsWith(prefix + path.sep)) refs.push(...owners);
      const owners = processes.filter((p) =>
        String(p.CommandLine ?? p.commandLine ?? '')
          .toLowerCase()
          .includes(prefix),
      );
      const children = dirs.filter((c) => path.dirname(c.path) === dir.path);
      const relative = path.relative(root, dir.path).replaceAll('\\', '/');
      const generatedBy = relative.includes('/jobs/baboon-')
        ? 'baboon_native prepare/reconcile; immutable baseline + writable tool fork + revision'
        : relative.includes('/jobs/')
          ? 'forge_build/build run; isolated compiler inputs and output'
          : relative.includes('/sdk-cache')
            ? 'conversion::prepare_sdk_tags; reusable owner SDK input'
            : relative.includes('c63-universal-halo-')
              ? 'C63 native acceptance harnesses; each trial has its own library and jobs'
              : relative.startsWith('.local/archives')
                ? 'Historical cleanup/archive runs; contents and relationships require review'
                : relative.startsWith('.local/build/cargo')
                  ? 'scripts/cargo.mjs; shared Rust compiler output'
                  : relative.includes('node_modules')
                    ? 'Frontend dependency manager'
                    : dir.purpose;
      return {
        path: dir.path,
        logicalBytes: dir.logicalBytes,
        files: dir.files,
        lastModifiedUtc: dir.lastModifiedUtc,
        generatingSubsystem: generatedBy,
        currentProcessOwners: owners.map((p) => ({ pid: p.ProcessId ?? p.pid, name: p.Name ?? p.name })),
        directNestedLocal: children.some((c) => path.basename(c.path) === '.local'),
        nestedRepositories: (report.storage.repositories ?? [])
          .filter((r) => physicalPath(r.path, root).startsWith(dir.path + path.sep))
          .map((r) => r.path),
        referencedBy: [...new Set(refs)].slice(0, 32),
        referenceCount: new Set(refs).size,
        classification:
          dir.classification === 'Preserve'
            ? 'A/B/G - preserve pending content review'
            : dir.classification === 'Reusable Cache'
              ? 'C - shared reusable input'
              : dir.classification === 'Regenerable'
                ? 'D candidate - verify process and protected outputs before cleanup'
                : 'G - unknown or mixed; retain',
        reproducible:
          dir.classification === 'Regenerable'
            ? 'compiler output from retained source; no deletion approved'
            : 'not established for the whole folder',
      };
    });
  return {
    schemaVersion: 1,
    readOnly: true,
    at: new Date().toISOString(),
    inventoryAt: report.at,
    root,
    measured: {
      logicalBytes: report.storage.logicalBytes,
      hardlinkUniqueBytes: report.storage.uniqueFileBytes,
      files: report.storage.files,
      freeBytes: report.storage.freeBytes,
      allocationNote: report.storage.lastUseNote,
    },
    allLocalDirectories: dirs
      .filter((d) => path.basename(d.path) === '.local')
      .map((d) => ({ path: d.path, logicalBytes: d.logicalBytes, files: d.files })),
    majorDirectories: major,
    projects,
    receipts,
    linksSkipped: report.storage.links,
    errors: report.storage.errors,
    note: 'Nested totals overlap; do not add parent and child sizes. No folder is approved for deletion by this attribution. SDK/tag copies may contain accepted native source.',
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, processFile] = process.argv.slice(2);
  if (!input) throw Error('storage-forensics <existing health.json> [processes.json]');
  const report = boundedJson(path.resolve(input), 128 * 1024 * 1024);
  if (!report?.storage) throw Error('Expected a complete read-only storage inventory');
  const processes = processFile ? boundedJson(path.resolve(processFile), 2 * 1024 * 1024) : [];
  process.stdout.write(
    JSON.stringify(
      attributeStorage(
        report,
        path.resolve(report.canonicalDirectory),
        Array.isArray(processes) ? processes : processes ? [processes] : [],
      ),
      null,
      2,
    ) + '\n',
  );
}
