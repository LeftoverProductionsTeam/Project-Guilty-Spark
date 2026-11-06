// Read-only repository/storage inventory. No deletion, pruning, checkout,
// hooks, network access or Git configuration changes are performed here.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDevelopmentStorage } from './native-qa-storage.mjs';

const retention = JSON.parse(
  fs.readFileSync(new URL('./maintenance/retention-policy.json', import.meta.url), 'utf8'),
);
export const DEFAULT_STORAGE_BUDGET_GIB = retention.warnProjectLogicalBytes / 2 ** 30;
const slash = (p) => p.replaceAll('\\', '/');
export function parseWorktrees(text) {
  return text
    .trim()
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const rows = block.split(/\r?\n/);
      return {
        path: rows.find((x) => x.startsWith('worktree '))?.slice(9),
        head: rows.find((x) => x.startsWith('HEAD '))?.slice(5),
        branch: rows.find((x) => x.startsWith('branch '))?.slice(7) ?? null,
        detached: rows.includes('detached'),
      };
    });
}
export function classifyStorage(relative) {
  const p = slash(relative),
    parts = p.toLowerCase().split('/');
  if (parts.includes('.git'))
    return { classification: 'Preserve', purpose: 'Git history, refs and worktree administration' };
  if (
    parts.includes('.research') ||
    parts.includes('preserved') ||
    parts.includes('archives') ||
    parts.includes('releases') ||
    parts.some((x) => /^c49-preview-|^pyros zombie|^sample code$/.test(x))
  )
    return {
      classification: 'Preserve',
      purpose: 'Research, source recovery or previous-good release; review contents before any change',
    };
  if (
    parts.includes('node_modules') ||
    parts.includes('.toolchain') ||
    parts.includes('sdk-cache') ||
    parts.includes('tools')
  )
    return {
      classification: 'Reusable Cache',
      purpose: 'Shared dependency/tool/source cache; never share writable native tags',
    };
  if (
    parts.some((x) =>
      ['halo custom edition', 'opencehalo-windows-release', 'chupathingyce-windows64-release'].includes(x),
    )
  )
    return { classification: 'Preserve', purpose: 'User-owned runtime installation/content' };
  if (
    parts.includes('target') ||
    parts.includes('validation-target') ||
    p.startsWith('.local/build/cargo/')
  ) {
    if (parts.includes('release') || parts.includes('examples'))
      return {
        classification: 'Preserve',
        purpose: 'Compiled applications/native diagnostics; accepted binaries require hash review',
      };
    if (parts.some((x) => ['deps', 'build', '.fingerprint', 'incremental'].includes(x)))
      return {
        classification: 'Regenerable',
        purpose: 'Cargo-generated intermediate output; review owners and protected artifacts before cleanup',
      };
    return {
      classification: 'Requires Review',
      purpose: 'Mixed compiler cache and potentially previous-good applications',
    };
  }
  if (parts.includes('dist') || parts.includes('playwright-report'))
    return {
      classification: 'Regenerable',
      purpose: 'Frontend build/report output; source and acceptance records remain separate',
    };
  if (parts.includes('.local') || parts.includes('artifacts') || parts.includes('test-results'))
    return {
      classification: 'Requires Review',
      purpose:
        'Owned jobs, tags, maps, logs or evidence; only explicitly sealed disposable output can be removed automatically',
    };
  return { classification: 'Preserve', purpose: 'Source, documentation or unclassified user input' };
}

/** Counts regular files without following reparse points. Logical bytes are
 * exact metadata totals, not a claim about compressed NTFS allocation. */
export function scanStorage(root) {
  const absolute = path.resolve(root),
    stack = [{ directory: absolute, relative: '' }],
    directories = [],
    links = [],
    errors = [],
    repositories = [];
  const unique = new Set();
  let logicalBytes = 0,
    uniqueFileBytes = 0,
    files = 0;
  while (stack.length) {
    const { directory, relative } = stack.pop();
    const record = {
      path: directory,
      relative: slash(relative),
      directBytes: 0,
      directFiles: 0,
      logicalBytes: 0,
      files: 0,
      lastModifiedUtc: null,
      ...classifyStorage(relative),
    };
    let rows;
    try {
      rows = fs.readdirSync(path.toNamespacedPath(directory), { withFileTypes: true });
    } catch (e) {
      errors.push({ path: directory, error: e.code ?? String(e) });
      continue;
    }
    for (const item of rows) {
      const file = path.join(directory, item.name),
        rel = path.join(relative, item.name);
      if (item.isSymbolicLink()) {
        let target;
        try {
          target = fs.readlinkSync(path.toNamespacedPath(file));
        } catch (e) {
          target = e.code;
        }
        links.push({ path: file, target });
        continue;
      }
      if (item.name === '.git') {
        let kind = item.isDirectory() ? 'repository' : 'worktree-pointer',
          remote = null;
        try {
          if (item.isDirectory())
            remote =
              fs
                .readFileSync(path.toNamespacedPath(path.join(file, 'config')), 'utf8')
                .match(/url\s*=\s*(.+)/)?.[1]
                ?.replace(/(:\/\/)[^/@\s]+@/, '$1[redacted]@') ?? null;
        } catch {}
        repositories.push({
          path: directory,
          marker: file,
          kind,
          remote,
          scope: slash(rel).split('/').includes('.research')
            ? 'version-pinned-research'
            : relative === ''
              ? 'canonical'
              : 'review',
        });
      }
      if (item.isDirectory()) stack.push({ directory: file, relative: rel });
      else if (item.isFile())
        try {
          const s = fs.statSync(path.toNamespacedPath(file), { bigint: true }),
            size = Number(s.size);
          record.directBytes += size;
          record.directFiles++;
          logicalBytes += size;
          files++;
          const id = s.ino ? `${s.dev}:${s.ino}` : file;
          if (!unique.has(id)) {
            unique.add(id);
            uniqueFileBytes += size;
          }
          const modified = s.mtime.toISOString();
          if (!record.lastModifiedUtc || modified > record.lastModifiedUtc) record.lastModifiedUtc = modified;
        } catch (e) {
          errors.push({ path: file, error: e.code ?? String(e) });
        }
    }
    directories.push(record);
  }
  const byPath = new Map(directories.map((d) => [d.path, d]));
  for (const d of [...directories].sort((a, b) => b.path.length - a.path.length)) {
    d.logicalBytes += d.directBytes;
    d.files += d.directFiles;
    const parent = byPath.get(path.dirname(d.path));
    if (parent) {
      parent.logicalBytes += d.logicalBytes;
      parent.files += d.files;
      if (d.lastModifiedUtc && (!parent.lastModifiedUtc || d.lastModifiedUtc > parent.lastModifiedUtc))
        parent.lastModifiedUtc = d.lastModifiedUtc;
    }
  }
  const stat = fs.statfsSync(path.toNamespacedPath(absolute));
  return {
    root: absolute,
    logicalBytes,
    uniqueFileBytes,
    files,
    freeBytes: Number(stat.bavail) * Number(stat.bsize),
    directories: directories.sort((a, b) => b.logicalBytes - a.logicalBytes),
    repositories,
    links,
    errors,
    lastUseNote:
      'LastModifiedUtc is latest file modification, not reliable last access/use. NTFS compressed/allocation sizes are not measured. Hardlinked regular files are also totaled once by native file identity.',
  };
}

export function repositoryHealth(root, { storage = false, budgetGiB = DEFAULT_STORAGE_BUDGET_GIB } = {}) {
  const directory = path.resolve(root);
  const git = (args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  const top = git(['rev-parse', '--show-toplevel']),
    worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain']));
  const branches = git(['for-each-ref', '--format=%(refname:short)|%(objectname)', 'refs/heads'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((row) => {
      const [name, head] = row.split('|');
      return { name, head, uniqueToMaster: Number(git(['rev-list', '--count', name, '--not', 'master'])) };
    });
  const report = {
    schemaVersion: 1,
    at: new Date().toISOString(),
    readOnly: true,
    canonicalDirectory: top,
    currentBranch: git(['branch', '--show-current']),
    head: git(['rev-parse', 'HEAD']),
    worktrees,
    branches,
    trackedStatus: git(['status', '--porcelain=v1', '--untracked-files=no']),
    gitObjects: git(['count-objects', '-vH']),
    storageBudgetGiB: budgetGiB,
    retention: {
      artifactsDirectory: retention.artifactsDirectory,
      cargoOutputDirectory: retention.cargoOutputDirectory,
      successfulRunsPerWorkflow: retention.successfulRunsPerWorkflow,
      failedRunsPerWorkflow: retention.failedRunsPerWorkflow,
      archiveSuccessfulAfterDays: retention.archiveSuccessfulAfterDays,
      archiveFailedAfterDays: retention.archiveFailedAfterDays,
      automaticDeletion: false,
    },
    warnings: [],
    storage: null,
  };
  if (worktrees.length !== 1)
    report.warnings.push(`${worktrees.length} registered worktrees; expected one canonical checkout.`);
  if (branches.length !== 1 || branches[0]?.name !== 'master')
    report.warnings.push(
      `${branches.length} local branches; preserve unique work and review historical names before removal.`,
    );
  if (report.currentBranch !== 'master')
    report.warnings.push(
      'Canonical development is not on master. Do not reset or overwrite unfinished work.',
    );
  if (report.trackedStatus)
    report.warnings.push('Uncommitted tracked source exists; preserve it before consolidation or cleanup.');
  if (storage) {
    report.storage = scanStorage(top);
    if (report.storage.logicalBytes > budgetGiB * 2 ** 30)
      report.warnings.push(
        `Measured logical storage exceeds ${budgetGiB} GiB. Review ownership and retained evidence before cleanup.`,
      );
    for (const r of report.storage.repositories)
      if (r.scope === 'review' && r.kind === 'repository')
        report.warnings.push(`Nested repository requires review: ${r.path}`);
    if (report.storage.errors.length)
      report.warnings.push('Storage scan has unreadable paths; its totals are incomplete.');
  }
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let root = process.cwd(),
    budget = DEFAULT_STORAGE_BUDGET_GIB,
    storage = false,
    active = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--storage') storage = true;
    else if (args[i] === '--active') active = true;
    else if (args[i] === '--root' || args[i] === '--budget-gib') {
      const name = args[i],
        value = args[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for ${name}`);
      if (name === '--root') root = value;
      else budget = Number(value);
    } else throw Error(`Unknown option: ${args[i]}`);
  }
  if (!Number.isFinite(budget) || budget < 1) throw Error('Storage warning budget must be at least 1 GiB');
  const report = repositoryHealth(root, { storage, budgetGiB: budget });
  if (active) report.developmentStorage = await readDevelopmentStorage(root);
  console.log(JSON.stringify(report, null, 2));
}
