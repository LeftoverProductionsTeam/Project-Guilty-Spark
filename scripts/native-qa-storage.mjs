// Bounded native QA ownership. Source/unknown files stay protected. A harness
// may declare a NEW scratch namespace before any writer starts; that namespace
// is disposable on success, failure or recovery, with explicit retained files.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
const policy = JSON.parse(
  await fs.readFile(new URL('./maintenance/retention-policy.json', import.meta.url), 'utf8'),
);
const ordinary = (value) =>
  process.platform === 'win32' && value.startsWith('\\\\?\\')
    ? value.slice(0, 8).toUpperCase() === '\\\\?\\UNC\\'
      ? '\\\\' + value.slice(8)
      : value.slice(4)
    : value;
const key = (value) => (process.platform === 'win32' ? ordinary(value).toLowerCase() : value);
const contains = (parent, child) => {
  const relative = path.relative(key(parent), key(child));
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
  );
};
const isLive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
};
async function noLinks(file) {
  for (let current = path.resolve(ordinary(file)); ; current = path.dirname(current)) {
    const info = await fs.lstat(current).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info?.isSymbolicLink())
      throw Error('QA output cannot follow symbolic links, junctions or reparse aliases');
    if (path.dirname(current) === current) break;
  }
}
// Resolve even an uncreated output through its nearest existing, non-linked
// ancestor. Windows TEMP commonly contains an 8.3 username: that spelling and
// a verbatim prefix are not a junction or permission to escape the source guard.
async function canonicalOutputPath(file) {
  const absolute = path.resolve(ordinary(file));
  await noLinks(absolute);
  const missing = [];
  for (let ancestor = absolute; ; ancestor = path.dirname(ancestor)) {
    const info = await fs.lstat(ancestor).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info) {
      if (missing.length && !info.isDirectory()) throw Error('QA output ancestor is not a directory');
      const real = path.resolve(ordinary(await fs.realpath(ancestor)));
      await noLinks(real);
      return path.join(real, ...missing.reverse());
    }
    if (path.dirname(ancestor) === ancestor) throw Error('QA output has no trusted existing ancestor');
    missing.push(path.basename(ancestor));
  }
}
const projectRoot = await canonicalOutputPath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const defaultQaRoot =
  process.env.SPARK_QA_STORAGE_ROOT ??
  path.join(
    os.tmpdir(),
    'GuiltySpark-QA-' +
      crypto.createHash('sha256').update(key(projectRoot)).digest('hex').slice(0, 12),
  );
/** Runs before a harness creates its output, including legacy copied commands. */
export async function assertQaOutputPath(
  root,
  { reservationBytes = policy.qaRunBytes, operation = 'qa' } = {},
) {
  if (!['qa', 'build'].includes(operation)) throw Error('Unknown temporary operation');
  const maximum = operation === 'build' ? policy.cargoCacheBytes : policy.qaRunBytes;
  if (!Number.isSafeInteger(reservationBytes) || reservationBytes < 0 || reservationBytes > maximum)
    throw Error('QA path admission exceeds the canonical per-run reservation');
  const absolute = await canonicalOutputPath(root);
  if (absolute.split(path.sep).some((part) => part.toLowerCase() === '.local'))
    throw Error('Obsolete .local output is disabled. Use an owned external disposable workspace.');
  if (
    contains(absolute, projectRoot) ||
    [
      'src',
      'src-tauri',
      'crates',
      'scripts',
      'tests',
      'docs',
      'public',
      '.git',
      '.toolchain',
      'node_modules',
      'tools',
      'preserved',
      'releases',
      'Halo Custom Edition',
      'opencehalo-windows-release',
      'chupathingyce-windows64-release',
    ].some((name) => contains(path.join(projectRoot, name), absolute))
  )
    throw Error(
      'QA output cannot contain or overwrite canonical source, dependencies, tools or protected data',
    );
  await noLinks(absolute);
  if (contains(projectRoot, absolute)) {
    if (reservationBytes > 0)
      throw Error('Source-only checkout: generated output must use an owned external disposable workspace');
    const generated = path.join(projectRoot, policy.artifactsDirectory);
    if (!contains(generated, absolute))
      throw Error(
        'Only reviewed legacy artifacts may be read here; all new output belongs in an external disposable workspace',
      );
    // Every historical harness goes through admission before mkdir, even if it
    // does not opt into disposable cleanup. Retained evidence is never evicted
    // to make a new run fit; stop generation and require an ownership review.
    // Honor the caller's tighter run budget. A successful small admission
    // must not exempt a later, larger operation from its own check.
    if (reservationBytes > 0) {
      const existing = await fs.stat(generated).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      const used = existing ? await measure(generated, policy.qaTotalBytes) : { bytes: 0 };
      const volume = await fs.statfs(existing ? generated : projectRoot);
      if (used.bytes + reservationBytes > policy.qaTotalBytes)
        throw Error('Canonical QA storage budget is exhausted; no new output admitted');
      if (Number(volume.bavail) * Number(volume.bsize) < reservationBytes + policy.qaMinimumFreeBytes)
        throw Error('QA admission would violate the minimum free-disk budget');
    }
  }
  return absolute;
}
const fileHash = async (file) => {
  const digest = crypto.createHash('sha256');
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  return digest.digest('hex');
};
async function snapshot(root, maxBytes = policy.qaRunBytes) {
  await noLinks(root);
  const rows = [],
    pending = [root];
  let bytes = 0;
  while (pending.length) {
    const file = pending.pop();
    const info = await fs.lstat(file, { bigint: true });
    if (info.isSymbolicLink()) throw Error('QA disposable inventory refuses links or junctions');
    if (rows.length >= 100000 || path.relative(root, file).split(path.sep).length > 32)
      throw Error('QA inventory exceeds its bounded file/depth limit');
    const row = {
      path: path.relative(root, file),
      dev: String(info.dev),
      ino: String(info.ino),
      bytes: Number(info.size),
      modified: String(info.mtimeNs),
      directory: info.isDirectory(),
    };
    if (info.isDirectory()) {
      rows.push(row);
      for (const name of await fs.readdir(file)) pending.push(path.join(file, name));
    } else if (info.isFile()) {
      bytes += row.bytes;
      if (bytes > maxBytes) throw Error('QA output exceeds its reserved storage budget; evidence retained');
      row.sha256 = await fileHash(file);
      const after = await fs.lstat(file, { bigint: true });
      if (
        after.size !== info.size ||
        after.mtimeNs !== info.mtimeNs ||
        after.ino !== info.ino ||
        after.dev !== info.dev
      )
        throw Error('QA file changed during inspection; evidence retained');
      rows.push(row);
    } else throw Error('QA inventory requires regular files and directories');
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return { rows, bytes, files: rows.filter((row) => !row.directory).length };
}
async function measure(root, maxBytes) {
  // WebView can atomically rename its last temp file after the app exits.
  // Restart the entire bounded measurement; never skip an unknown file or
  // weaken the hash/identity checks used for disposable deletion.
  for (let attempt = 0; ; attempt++) {
    try {
      return await measureOnce(root, maxBytes);
    } catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}
async function measureOnce(root, maxBytes) {
  await noLinks(root);
  let bytes = 0,
    files = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      const info = await fs.lstat(file);
      if (info.isSymbolicLink()) throw Error('QA output contains a link; no cleanup or traversal attempted');
      if (info.isDirectory()) {
        if (path.relative(root, file).split(path.sep).length > 32)
          throw Error('QA output exceeds its depth limit');
        pending.push(file);
      } else if (info.isFile()) {
        bytes += info.size;
        files++;
      } else throw Error('QA output contains a non-regular file');
      if (bytes > maxBytes || files > 200000)
        throw Error('QA output exceeds its hard byte/file budget; preserved for review');
    }
  }
  return { bytes, files };
}
/** The shared compiler cache is retained, never automatically purged. Refuse
 * another compilation before its reserve can consume the remaining budget. */
export async function admitCargoOutput(
  output,
  {
    budget = policy.cargoCacheBytes,
    reserve = policy.cargoAdmissionBytes,
    minimumFree = policy.cargoMinimumFreeBytes,
  } = {},
) {
  const absolute = path.resolve(output);
  if (absolute.split(path.sep).some((part) => part.toLowerCase() === '.local'))
    throw Error('Obsolete .local Cargo output is disabled');
  if (
    contains(absolute, projectRoot) ||
    (contains(projectRoot, absolute) &&
      !contains(path.join(projectRoot, policy.cargoOutputDirectory), absolute) &&
      !contains(path.join(projectRoot, policy.artifactsDirectory), absolute))
  )
    throw Error('Cargo output cannot overlap canonical source, dependencies or protected data');
  if (
    ![budget, reserve, minimumFree].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    !budget ||
    reserve > budget
  )
    throw Error('Invalid compiler storage reservation');
  await noLinks(absolute);
  const exists = await fs.stat(absolute).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const used = exists ? await measure(absolute, budget) : { bytes: 0, files: 0 };
  if (used.bytes + reserve > budget)
    throw Error('Shared Cargo cache budget exhausted; cache and accepted applications retained for review');
  let volumeRoot = absolute;
  while (
    !(await fs.stat(volumeRoot).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    }))
  )
    volumeRoot = path.dirname(volumeRoot);
  const volume = await fs.statfs(volumeRoot);
  if (Number(volume.bavail) * Number(volume.bsize) < reserve + minimumFree)
    throw Error('Insufficient compiler reserve and minimum free-disk space');
  return { path: absolute, ...used, budget, reserve };
}
async function atomicJson(file, value) {
  const temporary = file + '.tmp-' + crypto.randomUUID();
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
  await fs.rename(temporary, file);
}
/** Sampling is a stop threshold, not an OS disk quota: a native tool can write
 * between samples. Never advertise it as a hard per-write filesystem limit. */
export function watchOutputBudget(
  root,
  { budget, minimumFree = 0, intervalMs = policy.qaSampleIntervalMs, onExceeded = async () => {} },
) {
  if (
    ![budget, minimumFree, intervalMs].every(Number.isSafeInteger) ||
    budget < 1 ||
    minimumFree < 0 ||
    intervalMs < 10
  )
    throw Error('Invalid output monitor limits');
  const state = { peakLogicalBytes: 0, peakFiles: 0, samples: 0, error: null, stopped: false };
  let pending, timer;
  const sample = () => {
    if (pending) return pending;
    pending = (async () => {
      try {
        const exists = await fs.lstat(root).catch((error) => {
          if (error.code === 'ENOENT') return null;
          throw error;
        });
        const used = exists ? await measure(root, Number.MAX_SAFE_INTEGER) : { bytes: 0, files: 0 };
        let volumeRoot = path.resolve(root);
        while (
          !(await fs.stat(volumeRoot).catch((error) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          }))
        )
          volumeRoot = path.dirname(volumeRoot);
        const volume = await fs.statfs(volumeRoot);
        state.samples++;
        state.peakLogicalBytes = Math.max(state.peakLogicalBytes, used.bytes);
        state.peakFiles = Math.max(state.peakFiles, used.files);
        if (used.bytes > budget || Number(volume.bavail) * Number(volume.bsize) < minimumFree)
          throw Error('Generated output crossed its storage budget or minimum free-disk floor');
      } catch (error) {
        // Rust and WebView atomically rename short-lived files while running.
        // Missing entries invalidate this live sample, not the operation. Final
        // cleanup still inventories exact bytes after every writer has exited.
        if (error.code === 'ENOENT') {
          state.transientReadRetries = (state.transientReadRetries ?? 0) + 1;
          return;
        }
        if (!state.error) {
          state.error = String(error);
          clearInterval(timer);
          try {
            await onExceeded(error);
          } catch (stopError) {
            state.stopError = String(stopError);
          }
        }
      }
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
  timer = setInterval(() => {
    void sample();
  }, intervalMs);
  timer.unref();
  return {
    state,
    sample,
    async stop() {
      clearInterval(timer);
      if (pending) await pending;
      state.stopped = true;
      return { ...state };
    },
  };
}
/** Stop only a child explicitly launched by this harness, including its native
 * descendants on Windows. Never discover/kill processes by a generic name. */
export async function stopQaProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) =>
      execFile(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        { windowsHide: true, timeout: 30000 },
        (error) => {
          if (error && child.exitCode === null && child.signalCode === null) reject(error);
          else resolve();
        },
      ),
    );
  } else child.kill('SIGTERM');
  await waitForQaExit(child);
}
async function scratchRegistry(root, value) {
  await atomicJson(path.join(root, 'scratch-ownership.json'), value);
}
async function unlinkOwned(file, row) {
  try {
    await fs.unlink(file);
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    // copyFile can inherit Windows' read-only attribute from preserved tags.
    // Clear it only on this independently owned exact file, never a hardlink
    // to an original. Locked/active files still fail and remain protected.
    const current = await fs.lstat(file, { bigint: true });
    if (
      current.nlink !== 1n ||
      String(current.dev) !== row.dev ||
      String(current.ino) !== row.ino ||
      Number(current.size) !== row.bytes ||
      (await fileHash(file)) !== row.sha256
    )
      throw Error('Read-only scratch is shared or changed; retained');
    await fs.chmod(file, 0o600);
    await fs.unlink(file);
  }
}
async function retireDeclaredScratch(root, registry) {
  if (
    registry.schemaVersion !== 1 ||
    key(registry.root) !== key(root) ||
    !Array.isArray(registry.directories) ||
    !Array.isArray(registry.retained)
  )
    throw Error('Unknown scratch ownership is protected');
  let bytes = 0,
    files = 0;
  for (const declaration of registry.directories) {
    const target = path.resolve(root, declaration.relative);
    if (target === root || !contains(root, target)) throw Error('Scratch ownership escaped its run');
    await noLinks(target);
    const info = await fs.lstat(target, { bigint: true }).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!info) continue;
    if (!info.isDirectory() || String(info.dev) !== declaration.dev || String(info.ino) !== declaration.ino)
      throw Error('Scratch root identity changed; retained for review');
    const maximum = registry.budgetBytes ?? policy.qaRunBytes;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > policy.cargoCacheBytes)
      throw Error('Invalid owned scratch budget');
    const inventory = await snapshot(target, maximum);
    const kept = registry.retained.filter((row) => contains(target, path.resolve(root, row.relative)));
    for (const row of kept) {
      const actual = inventory.rows.find(
        (item) => key(path.resolve(target, item.path)) === key(path.resolve(root, row.relative)),
      );
      if (!actual || actual.directory || actual.sha256 !== row.sha256 || actual.bytes !== row.bytes)
        throw Error('Retained fixture changed; scratch cleanup refused');
    }
    for (const row of [...inventory.rows].sort((a, b) => b.path.length - a.path.length)) {
      const file = path.join(target, row.path);
      if (kept.some((keep) => contains(file, path.resolve(root, keep.relative)))) continue;
      await noLinks(file);
      const current = await fs.lstat(file, { bigint: true });
      if (
        String(current.dev) !== row.dev ||
        String(current.ino) !== row.ino ||
        current.isDirectory() !== row.directory
      )
        throw Error('Scratch file identity changed; cleanup stopped');
      if (row.directory) await fs.rmdir(file);
      else {
        if (
          Number(current.size) !== row.bytes ||
          String(current.mtimeNs) !== row.modified ||
          (await fileHash(file)) !== row.sha256
        )
          throw Error('Scratch file changed during cleanup; cleanup stopped');
        await unlinkOwned(file, row);
        bytes += row.bytes;
        files++;
      }
    }
  }
  return { bytes, files };
}
/** Explicit restart recovery, never an automatic eviction of old libraries.
 * Only previously declared fresh namespaces and dead recorded writers qualify. */
export async function recoverQaScratch(root, { storageRoot = defaultQaRoot } = {}) {
  const absolute = await assertQaOutputPath(root, { reservationBytes: 0 });
  const record = JSON.parse(await fs.readFile(path.join(absolute, 'storage-run.json'), 'utf8'));
  if (
    record.schemaVersion !== 3 ||
    !Array.isArray(record.writers) ||
    key(record.root) !== key(absolute) ||
    isLive(record.ownerPid) ||
    record.writers.some(isLive) ||
    !record.active
  )
    throw Error('Unknown or active QA ownership protects recovery data');
  await noLinks(path.join(absolute, 'scratch-ownership.json'));
  const registry = JSON.parse(await fs.readFile(path.join(absolute, 'scratch-ownership.json'), 'utf8'));
  if (registry.nonce !== record.nonce) throw Error('Scratch recovery nonce differs');
  const leases = path.join(await assertQaOutputPath(storageRoot, { reservationBytes: 0 }), '.leases');
  const leaseFile = path.join(
    leases,
    crypto.createHash('sha256').update(key(absolute)).digest('hex') + '.json',
  );
  await noLinks(leaseFile);
  const lease = JSON.parse(await fs.readFile(leaseFile, 'utf8'));
  if (lease.nonce !== record.nonce || key(lease.root) !== key(absolute))
    throw Error('Recovery lease differs; retained');
  let sealedBytes = 0;
  const sealsFile = path.join(absolute, 'disposable-seals.json');
  if (await fs.stat(sealsFile).catch(() => null)) {
    await noLinks(sealsFile);
    if ((await fs.stat(sealsFile)).size > 8 * 1024 ** 2)
      throw Error('Recovery seal inventory exceeds its bound');
    const seals = JSON.parse(await fs.readFile(sealsFile, 'utf8'));
    if (
      !Array.isArray(seals) ||
      seals.length > 128 ||
      seals.some((seal) => seal.ownerPid !== record.ownerPid)
    )
      throw Error('Recovery disposable owner differs');
    for (const seal of seals) sealedBytes += (await disposeQaScratch(absolute, seal)).bytes;
  }
  const disposed = await retireDeclaredScratch(absolute, registry);
  const measured = await measure(absolute, record.reservedBytes);
  const result = {
    ...record,
    status: 'interrupted',
    active: false,
    recoveredAt: new Date().toISOString(),
    logicalBytes: measured.bytes,
    files: measured.files,
    disposedBytes: disposed.bytes + sealedBytes,
  };
  await atomicJson(path.join(absolute, 'storage-run.json'), result);
  await atomicJson(leaseFile, result);
  return result;
}
/** Refuses active, changed, linked and unrelated files before deleting anything.
 * Recovery never guesses that an abandoned or unsealed job is disposable. */
export async function disposeQaScratch(runRoot, seal, { ownerFinished = false } = {}) {
  const absolute = await assertQaOutputPath(runRoot, { reservationBytes: 0 }),
    target = await canonicalOutputPath(seal.path);
  if (
    seal.schemaVersion !== 1 ||
    key(seal.root) !== key(absolute) ||
    target === absolute ||
    !contains(absolute, target) ||
    !Array.isArray(seal.inventory?.rows)
  )
    throw Error('Disposable ownership does not match this QA run');
  if (seal.ownerPid !== process.pid || !ownerFinished) {
    if (isLive(seal.ownerPid)) throw Error('Active QA owner protects its disposable files');
  }
  const current = await snapshot(target, seal.inventory.bytes + 1);
  if (JSON.stringify(current) !== JSON.stringify(seal.inventory))
    throw Error('QA disposable files changed after sealing; no files removed');
  // No recursive delete: recheck file identity/hash immediately before each
  // unlink, then remove only the inventoried empty directories.
  for (const row of [...current.rows].sort((a, b) => b.path.length - a.path.length)) {
    const file = path.join(target, row.path);
    await noLinks(file);
    const info = await fs.lstat(file, { bigint: true });
    if (String(info.dev) !== row.dev || String(info.ino) !== row.ino || info.isDirectory() !== row.directory)
      throw Error('QA disposable filesystem identity changed; cleanup stopped');
    if (row.directory) await fs.rmdir(file);
    else {
      if (
        Number(info.size) !== row.bytes ||
        String(info.mtimeNs) !== row.modified ||
        (await fileHash(file)) !== row.sha256
      )
        throw Error('QA disposable content changed; cleanup stopped');
      await unlinkOwned(file, row);
    }
  }
  return { bytes: current.bytes, files: current.files };
}
export async function sealQaScratch(runRoot, file, maximumBytes = policy.qaRunBytes) {
  const absolute = await assertQaOutputPath(runRoot, { reservationBytes: 0 }),
    target = await canonicalOutputPath(file);
  if (
    target === absolute ||
    !contains(absolute, target) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > policy.qaRunBytes
  )
    throw Error('Disposable ownership requires a bounded descendant of its run');
  return {
    schemaVersion: 1,
    root: absolute,
    path: target,
    ownerPid: process.pid,
    inventory: await snapshot(target, maximumBytes),
  };
}
export async function waitForQaExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const finish = () => {
      clearTimeout(timer);
      child.off('exit', finish);
      resolve();
    };
    const timer = setTimeout(() => {
      child.off('exit', finish);
      reject(Error('Owned QA process did not exit; its executable and checkpoint remain protected'));
    }, 30000);
    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}
export async function beginQaStorage(
  root,
  {
    workflow,
    appSha256,
    reservationBytes = policy.qaRunBytes,
    storageRoot = defaultQaRoot,
    minimumFreeBytes = policy.qaMinimumFreeBytes,
    totalBytes = policy.qaTotalBytes,
    operation = 'qa',
  },
) {
  const absolute = await assertQaOutputPath(root, { reservationBytes, operation }),
    real = ordinary(await fs.realpath(absolute));
  if (key(real) !== key(absolute)) throw Error('QA evidence must use an independent non-aliased directory');
  if (!/^[\w.-]{1,80}$/.test(workflow) || !/^[a-f0-9]{64}$/.test(appSha256))
    throw Error('QA workflow/application identity is invalid');
  if (
    ![reservationBytes, minimumFreeBytes, totalBytes].every(Number.isSafeInteger) ||
    reservationBytes < 1 ||
    reservationBytes > (operation === 'build' ? policy.cargoCacheBytes : policy.qaRunBytes) ||
    totalBytes < reservationBytes ||
    totalBytes > policy.qaTotalBytes ||
    minimumFreeBytes < 0
  )
    throw Error('QA reservation exceeds the canonical storage limits');
  storageRoot = await assertQaOutputPath(storageRoot, { reservationBytes, operation });
  await fs.mkdir(storageRoot, { recursive: true });
  const leases = path.join(storageRoot, '.leases');
  await fs.mkdir(leases, { recursive: true });
  const lock = path.join(leases, 'admission.lock');
  let guard;
  for (let attempt = 0; !guard; attempt++) {
    try {
      guard = await fs.open(lock, 'wx');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Brief contention is expected with independent QA processes. Wait only
      // for a well-formed live owner; never delete/adopt an interrupted lock.
      let owner;
      try {
        await noLinks(lock);
        if ((await fs.stat(lock)).size > 4096) throw Error('Unknown lock');
        owner = JSON.parse(await fs.readFile(lock, 'utf8'));
      } catch {
        throw Error('QA admission is already active or interrupted; inspect the owned lock before retrying');
      }
      if (
        attempt >= 50 ||
        owner.schemaVersion !== 1 ||
        typeof owner.nonce !== 'string' ||
        !Number.isSafeInteger(owner.ownerPid) ||
        !isLive(owner.ownerPid)
      )
        throw Error('QA admission is already active or interrupted; inspect the owned lock before retrying');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const lockText = JSON.stringify({
    schemaVersion: 1,
    ownerPid: process.pid,
    nonce: crypto.randomUUID(),
    root: absolute,
    startedAt: new Date().toISOString(),
  });
  await guard.writeFile(lockText);
  await guard.sync();
  const lockIdentity = await guard.stat({ bigint: true });
  const id = crypto.createHash('sha256').update(key(absolute)).digest('hex');
  const leaseFile = path.join(leases, id + '.json'),
    output = path.join(absolute, 'storage-run.json');
  let record;
  try {
    const entries = await fs.readdir(leases);
    if (entries.length > 2048)
      throw Error('QA reservation ledger is full; preserve/archive reviewed evidence before another run');
    let reserved = 0;
    for (const entry of entries.filter((name) => name.endsWith('.json'))) {
      const file = path.join(leases, entry);
      await noLinks(file);
      if ((await fs.stat(file)).size > 65536) throw Error('QA reservation metadata exceeds its bound');
      const row = JSON.parse(await fs.readFile(file, 'utf8'));
      if (
        ![2, 3].includes(row.schemaVersion) ||
        !Number.isSafeInteger(row.reservedBytes) ||
        !Number.isSafeInteger(row.logicalBytes ?? 0)
      )
        throw Error('Unknown QA reservation is protected');
      reserved +=
        row.active || row.status === 'incomplete'
          ? Math.max(row.reservedBytes, row.logicalBytes ?? 0)
          : row.logicalBytes;
    }
    const existing = await measure(storageRoot, totalBytes),
      own = await measure(absolute, reservationBytes);
    const free = await fs.statfs(storageRoot),
      freeBytes = Number(free.bavail) * Number(free.bsize);
    if (Math.max(existing.bytes, reserved) + reservationBytes > totalBytes)
      throw Error('QA aggregate storage budget is exhausted; no new run admitted');
    if (freeBytes < reservationBytes + minimumFreeBytes)
      throw Error('QA reservation would violate the minimum free-disk budget');
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    const sourceDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: projectRoot,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    const harness = process.argv[1]
      ? path.resolve(process.argv[1])
      : fileURLToPath(import.meta.url);
    record = {
      schemaVersion: 3,
      nonce: crypto.randomUUID(),
      workflow,
      harnessOrigin: process.argv[1] ? 'script' : 'storage-api-inline',
      root: absolute,
      sourceCommit,
      sourceDirty,
      harness,
      harnessSha256: await fileHash(harness),
      appSha256,
      ownerPid: process.pid,
      writers: [],
      startedAt: new Date().toISOString(),
      status: 'incomplete',
      active: true,
      reservedBytes: reservationBytes,
      logicalBytes: own.bytes,
      files: own.files,
      automaticDeletion: 'sealed-or-declared-fresh-scratch-only',
    };
    await fs.writeFile(output, JSON.stringify(record, null, 2), { flag: 'wx' });
    await fs.writeFile(leaseFile, JSON.stringify(record), { flag: 'wx' });
  } finally {
    await guard.close();
    await noLinks(lock);
    const current = await fs.lstat(lock, { bigint: true });
    if (
      current.dev !== lockIdentity.dev ||
      current.ino !== lockIdentity.ino ||
      (await fs.readFile(lock, 'utf8')) !== lockText
    )
      throw Error('QA admission lock changed; unrelated replacement retained');
    await fs.unlink(lock);
  }
  const disposables = [];
  // A writer can overshoot its reservation between monitor samples. Permit
  // exact cleanup up to the operation's hard inventory ceiling after it stops.
  const registry = {
    schemaVersion: 1,
    root: absolute,
    nonce: record.nonce,
    budgetBytes: operation === 'build' ? policy.cargoCacheBytes : policy.qaRunBytes,
    directories: [],
    retained: [],
  };
  const writers = new Set();
  const monitor = watchOutputBudget(absolute, {
    budget: reservationBytes,
    minimumFree: minimumFreeBytes,
    onExceeded: async () => {
      await Promise.all([...writers].map(stopQaProcess));
    },
  });
  let finished = false;
  const finish = async (status) => {
    if (finished || !['passed', 'failed', 'interrupted'].includes(status))
      throw Error('One explicit native QA outcome required');
    if ([...writers].some((child) => child.exitCode === null && child.signalCode === null))
      throw Error('Active QA writer protects scratch');
    await monitor.sample();
    const monitoring = await monitor.stop();
    let disposedBytes = 0;
    for (const seal of disposables)
      disposedBytes += (await disposeQaScratch(absolute, seal, { ownerFinished: true })).bytes;
    const scratch = await retireDeclaredScratch(absolute, registry);
    disposedBytes += scratch.bytes;
    const measured = await measure(absolute, reservationBytes);
    const evidenceOverBudget =
      measured.bytes > policy.qaEvidenceBytes + registry.retained.reduce((sum, row) => sum + row.bytes, 0);
    const result = {
      ...record,
      status: monitoring.error || evidenceOverBudget ? 'failed' : status,
      active: false,
      finishedAt: new Date().toISOString(),
      logicalBytes: measured.bytes,
      files: measured.files,
      disposedBytes,
      retained: registry.retained,
      monitoring,
      evidenceOverBudget,
    };
    await atomicJson(output, result);
    await atomicJson(leaseFile, result);
    finished = true;
    if (monitoring.error || evidenceOverBudget)
      throw Error(monitoring.error ?? 'QA diagnostic evidence exceeds its defined retention budget');
    return result;
  };
  finish.createScratch = async (relative) => {
    const target = path.resolve(absolute, relative);
    if (
      finished ||
      target === absolute ||
      !contains(absolute, target) ||
      path.dirname(target) !== absolute ||
      !/^[\w.-]{1,80}$/.test(relative)
    )
      throw Error('Fresh scratch must be a named direct child of its run');
    await noLinks(target);
    await fs.mkdir(target); // EEXIST: never adopt user data.
    const info = await fs.lstat(target, { bigint: true });
    registry.directories.push({ relative, dev: String(info.dev), ino: String(info.ino) });
    await scratchRegistry(absolute, registry);
    return target;
  };
  finish.retain = async (file, reason) => {
    const target = await canonicalOutputPath(file),
      relative = path.relative(absolute, target);
    if (
      finished ||
      typeof reason !== 'string' ||
      reason.length < 8 ||
      reason.length > 256 ||
      registry.retained.length >= 128 ||
      !registry.directories.some((row) => contains(path.resolve(absolute, row.relative), target))
    )
      throw Error('Retained fixture needs an owned scratch file and an explicit bounded reason');
    await noLinks(target);
    const info = await fs.stat(target);
    if (
      !info.isFile() ||
      registry.retained.some((row) => key(row.relative) === key(relative)) ||
      registry.retained.reduce((sum, row) => sum + row.bytes, 0) + info.size > policy.qaRetainedFixtureBytes
    )
      throw Error('Retained fixture exceeds its bound or repeats an entry');
    registry.retained.push({ relative, bytes: info.size, sha256: await fileHash(target), reason });
    await scratchRegistry(absolute, registry);
  };
  finish.trackProcess = async (child) => {
    if (finished || !child?.pid || typeof child.kill !== 'function')
      throw Error('QA writer must be an owned child process');
    writers.add(child);
    record.writers = [...writers].map((child) => child.pid);
    await atomicJson(output, record);
    await atomicJson(leaseFile, record);
  };
  finish.sample = monitor.sample;
  finish.interrupt = async () => {
    await Promise.all([...writers].map(stopQaProcess));
    return finish('interrupted');
  };
  finish.registerDisposable = async (file) => {
    const target = await canonicalOutputPath(file);
    if (
      finished ||
      target === absolute ||
      !contains(absolute, target) ||
      target === output ||
      disposables.some((seal) => contains(seal.path, target) || contains(target, seal.path))
    )
      throw Error('Only distinct owned QA scratch descendants may be registered');
    const seal = await sealQaScratch(absolute, target, reservationBytes);
    disposables.push(seal);
    await atomicJson(path.join(absolute, 'disposable-seals.json'), disposables);
    return seal;
  };
  return finish;
}

/** Build/test output shares the existing ownership and interruption protocol.
 * No cache survives a completed operation. Nested wrappers reuse ONLY the
 * live nonce-bound workspace supplied by their parent, never an arbitrary path.
 */
export async function withDevelopmentWorkspace(
  workflow,
  action,
  {
    reservationBytes = workflow.startsWith('frontend') || workflow === 'vite' ? 1024 ** 3 : 12 * 1024 ** 3,
  } = {},
) {
  if (!/^[\w.-]{1,64}$/.test(workflow)) throw Error('Invalid development workflow');
  if (process.env.CARGO_TARGET_DIR && !process.env.SPARK_BUILD_WORKSPACE)
    throw Error(
      'Explicit Cargo output is disabled: obsolete .local and retained caches are not allowed. Use an owned disposable parent operation.',
    );
  if (process.env.SPARK_BUILD_WORKSPACE) {
    const run = await assertQaOutputPath(process.env.SPARK_BUILD_WORKSPACE, { reservationBytes: 0 });
    if (contains(projectRoot, run)) throw Error('Build workspace must be outside source');
    const record = JSON.parse(await fs.readFile(path.join(run, 'storage-run.json'), 'utf8'));
    if (
      record.schemaVersion !== 3 ||
      record.workflow !== 'source-development' ||
      !record.active ||
      !isLive(record.ownerPid) ||
      record.nonce !== process.env.SPARK_BUILD_NONCE ||
      key(record.root) !== key(run)
    )
      throw Error('Build workspace owner/nonce is not active');
    const directory = path.join(run, 'output');
    await noLinks(directory);
    if (key(await canonicalOutputPath(process.env.SPARK_GENERATED_ROOT ?? '')) !== key(directory))
      throw Error('Generated output escaped its build owner');
    if (key(await canonicalOutputPath(process.env.CARGO_TARGET_DIR ?? '')) !== key(path.join(directory, 'target')))
      throw Error(
        'Compiler output escaped its build owner; obsolete .local and retained cache overrides are refused',
      );
    return action({ directory, env: { ...process.env }, trackProcess: async () => {} });
  }
  const identity = crypto.createHash('sha256').update(key(projectRoot)).digest('hex').slice(0, 12);
  const base = await assertQaOutputPath(path.join(os.tmpdir(), `GuiltySpark-Development-${identity}`), { reservationBytes: 0 });
  await fs.mkdir(base, { recursive: true });
  // Recover ONLY declared scratch from dead owners. Unknown files and running
  // compilers stay protected; do not evict them to satisfy a new reservation.
  for (const name of await fs.readdir(base)) {
    if (!/^run-[\w-]+$/.test(name)) continue;
    const prior = path.join(base, name),
      file = path.join(prior, 'storage-run.json');
    await noLinks(file);
    const text = await fs.readFile(file, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (text === null) {
      // Admission can fail before its receipt exists. An actually empty
      // namespace contains no source to preserve; rmdir refuses new contents.
      if ((await fs.readdir(prior)).length === 0) {
        await fs.rmdir(prior);
        continue;
      }
      throw Error('Unrecognized temporary build contents are protected');
    }
    const row = JSON.parse(text);
    if (
      row.workflow === 'source-development' &&
      row.active &&
      !isLive(row.ownerPid) &&
      !row.writers.some(isLive)
    )
      await recoverQaScratch(prior, { storageRoot: base });
    const final = JSON.parse(await fs.readFile(file, 'utf8'));
    if (final.workflow === 'source-development' && !final.active)
      await removeDevelopmentReceipt(base, prior, final);
  }
  const run = await fs.mkdtemp(path.join(base, 'run-'));
  const finish = await beginQaStorage(run, {
    workflow: 'source-development',
    operation: 'build',
    appSha256: await fileHash(new URL('./native-qa-storage.mjs', import.meta.url)),
    reservationBytes,
    storageRoot: base,
  });
  const directory = await finish.createScratch('output');
  // Pinned Tauri still emits four ACL schemas at a hard-coded source-relative
  // path. Preserve pre-existing bytes in RAM and retire only this build's new
  // output, even though its supported compiler/frontend paths are external.
  const restoreSchemas = reservationBytes > 1024 ** 3 ? await retainGeneratedSchemaState() : async () => {};
  const record = JSON.parse(await fs.readFile(path.join(run, 'storage-run.json'), 'utf8'));
  const env = {
    ...process.env,
    SPARK_BUILD_WORKSPACE: run,
    SPARK_BUILD_NONCE: record.nonce,
    SPARK_GENERATED_ROOT: directory,
    CARGO_TARGET_DIR: path.join(directory, 'target'),
    SPARK_BROWSER_EVIDENCE_DIR: path.join(directory, 'browser'),
    SPARK_QA_STORAGE_ROOT: path.join(directory, 'qa'),
    SPARK_FRONTEND_DIST: path.join(directory, 'web'),
    SPARK_VITE_CACHE: path.join(directory, 'vite-cache'),
  };
  let interrupted = false,
    interruption;
  const stop = () => {
    interrupted = true;
    interruption ??= finish.interrupt();
    void interruption.catch((error) => console.error(String(error)));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  let ok = false;
  try {
    const result = await action({ directory, env, trackProcess: finish.trackProcess });
    ok = true;
    return result;
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    if (interruption) await interruption;
    const current = JSON.parse(await fs.readFile(path.join(run, 'storage-run.json'), 'utf8'));
    const result = current.active
      ? await finish(interrupted ? 'interrupted' : ok ? 'passed' : 'failed')
      : current;
    await removeDevelopmentReceipt(base, run, result);
    await restoreSchemas();
    console.log(
      JSON.stringify({
        workflow,
        temporaryOutputDisposed: true,
        disposedLogicalBytes: result.disposedBytes,
        peakLogicalBytes: result.monitoring?.peakLogicalBytes,
      }),
    );
  }
}
export async function retainGeneratedSchemaState(checkout = projectRoot) {
  const directory = path.join(checkout, 'src-tauri', 'gen', 'schemas'),
    saved = [];
  for (const name of [
    'acl-manifests.json',
    'capabilities.json',
    'desktop-schema.json',
    'windows-schema.json',
  ]) {
    const file = path.join(directory, name);
    await noLinks(file);
    const info = await fs.stat(file).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info && (!info.isFile() || info.size > 2 * 1024 ** 2))
      throw Error('Unexpected native schema input protected');
    saved.push({ file, bytes: info ? await fs.readFile(file) : null });
  }
  return async () => {
    for (const row of saved) {
      await noLinks(row.file);
      const info = await fs.stat(row.file).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (info && (!info.isFile() || info.size > 2 * 1024 ** 2))
        throw Error('Unexpected native schema output protected');
      if (row.bytes) {
        if (!info || !(await fs.readFile(row.file)).equals(row.bytes)) {
          await fs.mkdir(directory, { recursive: true });
          await fs.writeFile(row.file, row.bytes);
        }
      } else if (info) {
        JSON.parse(await fs.readFile(row.file, 'utf8'));
        await fs.unlink(row.file);
      }
    }
    for (const parent of [directory, path.dirname(directory)])
      await fs.rmdir(parent).catch((error) => {
        if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
      });
  };
}
async function removeDevelopmentReceipt(base, run, record) {
  if (record.active || record.workflow !== 'source-development' || key(record.root) !== key(run))
    throw Error('Active/unknown build receipt protected');
  const lease = path.join(
    base,
    '.leases',
    crypto.createHash('sha256').update(key(run)).digest('hex') + '.json',
  );
  await noLinks(lease);
  const saved = JSON.parse(await fs.readFile(lease, 'utf8'));
  if (saved.nonce !== record.nonce || saved.active || key(saved.root) !== key(run))
    throw Error('Build cleanup lease changed');
  const seal = await sealQaScratch(base, run, policy.qaEvidenceBytes);
  await disposeQaScratch(base, seal, { ownerFinished: true });
  if (JSON.parse(await fs.readFile(lease, 'utf8')).nonce !== record.nonce)
    throw Error('Build cleanup lease replaced');
  await fs.unlink(lease);
}
export async function runDevelopmentCommand(command, args, context, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: context.env,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (child.pid) await context.trackProcess(child);
  const code = await exited;
  if (code !== 0) throw Error(`Development command failed with exit ${code}: ${path.basename(command)}`);
  return code;
}
// A bare Windows drive path is a valid URL to Tauri's untagged config parser.
// Its explicit Files representation also accepts directories and embeds their
// contents with the directory as the asset prefix (pinned Tauri codegen).
export const embeddedFrontendConfig = (directory) => ({ build: { frontendDist: [path.resolve(directory)] } });
/** Explicit artifact export is distinct from retaining a compiler cache. Only
 * the application and package files are admitted; never copy a target tree. */
export async function exportDevelopmentBuild(release, destination) {
  if (!path.isAbsolute(destination)) throw Error('Choose an absolute build export folder');
  const output = await canonicalOutputPath(destination);
  if (contains(projectRoot, output) || contains(output, projectRoot))
    throw Error('Build exports must be outside the source checkout');
  release = await canonicalOutputPath(release);
  if (contains(release, output) || contains(output, release))
    throw Error('Build export and disposable compiler output must be separate');
  await noLinks(release);
  await noLinks(output);
  const files = [];
  for (const name of ['GuiltySpark.exe', 'GuiltySpark']) {
    const source = path.join(release, name);
    if (await fs.stat(source).catch(() => null)) files.push({ source, relative: name });
  }
  const bundle = path.join(release, 'bundle');
  async function packages(directory) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const source = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw Error('Linked build package refused');
      if (item.isDirectory()) await packages(source);
      else if (item.isFile() && /\.(exe|msi|deb|AppImage)$/i.test(item.name))
        files.push({ source, relative: path.relative(release, source) });
    }
  }
  if (await fs.stat(bundle).catch(() => null)) await packages(bundle);
  if (!files.length || files.length > 32)
    throw Error('Build export needs a bounded application/package inventory');
  const rows = [];
  let total = 0;
  for (const file of files) {
    await noLinks(file.source);
    const info = await fs.lstat(file.source);
    if (!info.isFile() || info.size > 512 * 1024 ** 2)
      throw Error('Build artifact exceeds its export budget');
    total += info.size;
    if (total > 1024 ** 3) throw Error('Build artifacts exceed their total export budget');
    const hash = await fileHash(file.source),
      target = path.resolve(output, file.relative);
    if (!contains(output, target)) throw Error('Build export path escaped');
    await noLinks(target);
    if (await fs.stat(target).catch(() => null)) {
      if ((await fileHash(target)) !== hash)
        throw Error('Existing different build export is protected; choose a new folder');
    }
    rows.push({
      file: file.relative.replaceAll(path.sep, '/'),
      bytes: info.size,
      sha256: hash,
      source: file.source,
      target,
    });
  }
  for (const row of rows) {
    await noLinks(row.target);
    await fs.mkdir(path.dirname(row.target), { recursive: true });
    if (!(await fs.stat(row.target).catch(() => null)))
      await fs.copyFile(row.source, row.target, fs.constants.COPYFILE_EXCL);
    if ((await fileHash(row.target)) !== row.sha256) throw Error('Build export readback differs');
  }
  const git = (...args) =>
    execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim();
  return {
    sourceCommit: git('rev-parse', 'HEAD'),
    workingTreeDirty: Boolean(git('status', '--porcelain')),
    files: rows.map(({ source, target, ...row }) => row),
  };
}
