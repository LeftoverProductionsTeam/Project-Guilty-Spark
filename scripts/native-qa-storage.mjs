// Bounded native QA ownership. Evidence and unfinished libraries are retained;
// only explicitly sealed, unchanged disposable files can be removed.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(await fs.readFile(new URL('./maintenance/retention-policy.json', import.meta.url), 'utf8'));
let canonicalBudgetChecked = false;
const key = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
const contains = (parent, child) => {
  const relative = path.relative(key(parent), key(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
};
const isLive = (pid) => {
  if (!Number.isSafeInteger(pid) || pid < 1) return true;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
async function noLinks(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    const info = await fs.lstat(current).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
    if (info?.isSymbolicLink()) throw Error('QA output cannot follow symbolic links, junctions or reparse aliases');
    if (path.dirname(current) === current) break;
  }
}
/** Runs before a harness creates its output, including legacy copied commands. */
export async function assertQaOutputPath(root) {
  const absolute = path.resolve(root);
  if (absolute.split(path.sep).some((part) => part.toLowerCase() === '.local'))
    throw Error('Obsolete .local output is disabled. Use artifacts/qa/<run> or a reviewed external QA directory.');
  if (contains(absolute, projectRoot) || ['src','src-tauri','crates','scripts','tests','docs','public','.git','.toolchain','node_modules','tools','preserved','releases','Halo Custom Edition','opencehalo-windows-release','chupathingyce-windows64-release']
    .some((name) => contains(path.join(projectRoot, name), absolute)))
    throw Error('QA output cannot contain or overwrite canonical source, dependencies, tools or protected data');
  await noLinks(absolute);
  if (contains(projectRoot, absolute)) {
    const generated = path.join(projectRoot, policy.artifactsDirectory);
    if (!contains(generated, absolute))
      throw Error('Repository QA output belongs under artifacts/; target/ is reserved for shared compiler output');
    // Every historical harness goes through admission before mkdir, even if it
    // does not opt into disposable cleanup. Retained evidence is never evicted
    // to make a new run fit; stop generation and require an ownership review.
    if (!canonicalBudgetChecked) {
      const existing = await fs.stat(generated).catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
      const used = existing ? await measure(generated, policy.qaTotalBytes) : { bytes: 0 };
      const volume = await fs.statfs(existing ? generated : projectRoot);
      if (used.bytes + policy.qaRunBytes > policy.qaTotalBytes)
        throw Error('Canonical QA storage budget is exhausted; no new output admitted');
      if (Number(volume.bavail) * Number(volume.bsize) < policy.qaRunBytes + policy.qaMinimumFreeBytes)
        throw Error('QA admission would violate the minimum free-disk budget');
      canonicalBudgetChecked = true;
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
  const rows = [], pending = [root];
  let bytes = 0;
  while (pending.length) {
    const file = pending.pop();
    const info = await fs.lstat(file, { bigint: true });
    if (info.isSymbolicLink()) throw Error('QA disposable inventory refuses links or junctions');
    if (rows.length >= 100000 || path.relative(root, file).split(path.sep).length > 32)
      throw Error('QA inventory exceeds its bounded file/depth limit');
    const row = { path: path.relative(root, file), dev: String(info.dev), ino: String(info.ino), bytes: Number(info.size), modified: String(info.mtimeNs), directory: info.isDirectory() };
    if (info.isDirectory()) {
      rows.push(row);
      for (const name of await fs.readdir(file)) pending.push(path.join(file, name));
    } else if (info.isFile()) {
      bytes += row.bytes;
      if (bytes > maxBytes) throw Error('QA output exceeds its reserved storage budget; evidence retained');
      row.sha256 = await fileHash(file);
      const after = await fs.lstat(file, { bigint: true });
      if (after.size !== info.size || after.mtimeNs !== info.mtimeNs || after.ino !== info.ino || after.dev !== info.dev)
        throw Error('QA file changed during inspection; evidence retained');
      rows.push(row);
    } else throw Error('QA inventory requires regular files and directories');
  }
  rows.sort((a,b) => a.path.localeCompare(b.path));
  return { rows, bytes, files: rows.filter((row) => !row.directory).length };
}
async function measure(root, maxBytes) {
  await noLinks(root);
  let bytes = 0, files = 0;
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      const info = await fs.lstat(file);
      if (info.isSymbolicLink()) throw Error('QA output contains a link; no cleanup or traversal attempted');
      if (info.isDirectory()) {
        if (path.relative(root, file).split(path.sep).length > 32) throw Error('QA output exceeds its depth limit');
        pending.push(file);
      } else if (info.isFile()) { bytes += info.size; files++; }
      else throw Error('QA output contains a non-regular file');
      if (bytes > maxBytes || files > 200000) throw Error('QA output exceeds its hard byte/file budget; preserved for review');
    }
  }
  return { bytes, files };
}
/** The shared compiler cache is retained, never automatically purged. Refuse
 * another compilation before its reserve can consume the remaining budget. */
export async function admitCargoOutput(output, {budget = policy.cargoCacheBytes, reserve = policy.cargoAdmissionBytes, minimumFree = policy.cargoMinimumFreeBytes} = {}) {
  const absolute=path.resolve(output);
  if(absolute.split(path.sep).some(part=>part.toLowerCase()==='.local'))throw Error('Obsolete .local Cargo output is disabled');
  if(contains(absolute,projectRoot)||(contains(projectRoot,absolute)&&!contains(path.join(projectRoot,policy.cargoOutputDirectory),absolute)&&!contains(path.join(projectRoot,policy.artifactsDirectory),absolute)))
    throw Error('Cargo output cannot overlap canonical source, dependencies or protected data');
  if(![budget,reserve,minimumFree].every(value=>Number.isSafeInteger(value)&&value>=0)||!budget||reserve>budget)throw Error('Invalid compiler storage reservation');
  await noLinks(absolute);
  const exists=await fs.stat(absolute).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const used=exists?await measure(absolute,budget):{bytes:0,files:0};
  if(used.bytes+reserve>budget)throw Error('Shared Cargo cache budget exhausted; cache and accepted applications retained for review');
  let volumeRoot=absolute;
  while(!await fs.stat(volumeRoot).catch(error=>{if(error.code==='ENOENT')return null;throw error;}))volumeRoot=path.dirname(volumeRoot);
  const volume=await fs.statfs(volumeRoot);
  if(Number(volume.bavail)*Number(volume.bsize)<reserve+minimumFree)throw Error('Insufficient compiler reserve and minimum free-disk space');
  return {path:absolute,...used,budget,reserve};
}
async function atomicJson(file, value) {
  const temporary = file + '.tmp-' + crypto.randomUUID();
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx' });
  await fs.rename(temporary, file);
}
/** Refuses active, changed, linked and unrelated files before deleting anything.
 * Recovery never guesses that an abandoned or unsealed job is disposable. */
export async function disposeQaScratch(runRoot, seal, { ownerFinished = false } = {}) {
  const absolute = await assertQaOutputPath(runRoot), target = path.resolve(seal.path);
  if (seal.schemaVersion !== 1 || key(seal.root) !== key(absolute) || target === absolute || !contains(absolute, target) || !Array.isArray(seal.inventory?.rows))
    throw Error('Disposable ownership does not match this QA run');
  if (seal.ownerPid !== process.pid || !ownerFinished) {
    if (isLive(seal.ownerPid)) throw Error('Active QA owner protects its disposable files');
  }
  const current = await snapshot(target, seal.inventory.bytes + 1);
  if (JSON.stringify(current) !== JSON.stringify(seal.inventory))
    throw Error('QA disposable files changed after sealing; no files removed');
  // No recursive delete: recheck file identity/hash immediately before each
  // unlink, then remove only the inventoried empty directories.
  for (const row of [...current.rows].sort((a,b) => b.path.length - a.path.length)) {
    const file = path.join(target, row.path);
    await noLinks(file);
    const info = await fs.lstat(file, { bigint: true });
    if (String(info.dev) !== row.dev || String(info.ino) !== row.ino || info.isDirectory() !== row.directory)
      throw Error('QA disposable filesystem identity changed; cleanup stopped');
    if (row.directory) await fs.rmdir(file);
    else {
      if (Number(info.size) !== row.bytes || String(info.mtimeNs) !== row.modified || await fileHash(file) !== row.sha256)
        throw Error('QA disposable content changed; cleanup stopped');
      await fs.unlink(file);
    }
  }
  return { bytes: current.bytes, files: current.files };
}
export async function sealQaScratch(runRoot, file, maximumBytes = policy.qaRunBytes) {
  const absolute = await assertQaOutputPath(runRoot), target = path.resolve(file);
  if (target === absolute || !contains(absolute, target) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > policy.qaRunBytes)
    throw Error('Disposable ownership requires a bounded descendant of its run');
  return { schemaVersion: 1, root: absolute, path: target, ownerPid: process.pid, inventory: await snapshot(target, maximumBytes) };
}
export async function waitForQaExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const finish = () => { clearTimeout(timer); child.off('exit', finish); resolve(); };
    const timer = setTimeout(() => {
      child.off('exit', finish);
      reject(Error('Owned QA process did not exit; its executable and checkpoint remain protected'));
    }, 30000);
    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) finish();
  });
}
export async function beginQaStorage(root, { workflow, appSha256, reservationBytes = policy.qaRunBytes, storageRoot = path.join(projectRoot, policy.qaDirectory), minimumFreeBytes = policy.qaMinimumFreeBytes, totalBytes = policy.qaTotalBytes }) {
  const absolute = await assertQaOutputPath(root), real = await fs.realpath(absolute);
  if (key(real) !== key(absolute)) throw Error('QA evidence must use an independent non-aliased directory');
  if (!/^[\w.-]{1,80}$/.test(workflow) || !/^[a-f0-9]{64}$/.test(appSha256)) throw Error('QA workflow/application identity is invalid');
  if (![reservationBytes, minimumFreeBytes, totalBytes].every(Number.isSafeInteger) || reservationBytes < 1 || reservationBytes > policy.qaRunBytes || totalBytes < reservationBytes || totalBytes > policy.qaTotalBytes || minimumFreeBytes < 0)
    throw Error('QA reservation exceeds the canonical storage limits');
  storageRoot = await assertQaOutputPath(storageRoot);
  await fs.mkdir(storageRoot, { recursive: true });
  const leases = path.join(storageRoot, '.leases');
  await fs.mkdir(leases, { recursive: true });
  const lock = path.join(leases, 'admission.lock');
  const guard = await fs.open(lock, 'wx').catch(() => { throw Error('QA admission is already active or interrupted; inspect the owned lock before retrying'); });
  const lockText = JSON.stringify({ schemaVersion: 1, ownerPid: process.pid, nonce: crypto.randomUUID(), root: absolute, startedAt: new Date().toISOString() });
  await guard.writeFile(lockText); await guard.sync();
  const lockIdentity = await guard.stat({ bigint: true });
  const id = crypto.createHash('sha256').update(key(absolute)).digest('hex');
  const leaseFile = path.join(leases, id + '.json'), output = path.join(absolute, 'storage-run.json');
  let record;
  try {
    const entries = await fs.readdir(leases);
    if (entries.length > 2048) throw Error('QA reservation ledger is full; preserve/archive reviewed evidence before another run');
    let reserved = 0;
    for (const entry of entries.filter((name) => name.endsWith('.json'))) {
      const file = path.join(leases, entry); await noLinks(file);
      if ((await fs.stat(file)).size > 65536) throw Error('QA reservation metadata exceeds its bound');
      const row = JSON.parse(await fs.readFile(file, 'utf8'));
      if (row.schemaVersion !== 2 || !Number.isSafeInteger(row.reservedBytes) || !Number.isSafeInteger(row.logicalBytes ?? 0)) throw Error('Unknown QA reservation is protected');
      reserved += row.active || row.status === 'incomplete' ? Math.max(row.reservedBytes, row.logicalBytes ?? 0) : row.logicalBytes;
    }
    const existing = await measure(storageRoot, totalBytes), own = await measure(absolute, reservationBytes);
    const free = await fs.statfs(storageRoot), freeBytes = Number(free.bavail) * Number(free.bsize);
    if (Math.max(existing.bytes, reserved) + reservationBytes > totalBytes) throw Error('QA aggregate storage budget is exhausted; no new run admitted');
    if (freeBytes < reservationBytes + minimumFreeBytes) throw Error('QA reservation would violate the minimum free-disk budget');
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim();
    const sourceDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: projectRoot, encoding: 'utf8', windowsHide: true }).trim();
    const harness = path.resolve(process.argv[1]);
    record = { schemaVersion: 2, workflow, root: absolute, sourceCommit, sourceDirty, harness, harnessSha256: await fileHash(harness), appSha256, ownerPid: process.pid, startedAt: new Date().toISOString(), status: 'incomplete', active: true, reservedBytes: reservationBytes, logicalBytes: own.bytes, files: own.files, automaticDeletion: 'sealed-disposable-only' };
    await fs.writeFile(output, JSON.stringify(record, null, 2), { flag: 'wx' });
    await fs.writeFile(leaseFile, JSON.stringify(record), { flag: 'wx' });
  } finally {
    await guard.close(); await noLinks(lock);
    const current = await fs.lstat(lock, { bigint: true });
    if (current.dev !== lockIdentity.dev || current.ino !== lockIdentity.ino || await fs.readFile(lock, 'utf8') !== lockText)
      throw Error('QA admission lock changed; unrelated replacement retained');
    await fs.unlink(lock);
  }
  const disposables = [];
  let finished = false;
  const finish = async (status) => {
    if (finished || !['passed', 'failed'].includes(status)) throw Error('One explicit native QA outcome required');
    let disposedBytes = 0;
    for (const seal of disposables) disposedBytes += (await disposeQaScratch(absolute, seal, { ownerFinished: true })).bytes;
    const measured = await measure(absolute, reservationBytes);
    const result = { ...record, status, active: false, finishedAt: new Date().toISOString(), logicalBytes: measured.bytes, files: measured.files, disposedBytes };
    await atomicJson(output, result); await atomicJson(leaseFile, result); finished = true;
  };
  finish.registerDisposable = async (file) => {
    const target = path.resolve(file);
    if (finished || target === absolute || !contains(absolute, target) || target === output || disposables.some((seal) => contains(seal.path, target) || contains(target, seal.path)))
      throw Error('Only distinct owned QA scratch descendants may be registered');
    const seal = await sealQaScratch(absolute, target, reservationBytes);
    disposables.push(seal);
    await atomicJson(path.join(absolute, 'disposable-seals.json'), disposables);
    return seal;
  };
  return finish;
}
