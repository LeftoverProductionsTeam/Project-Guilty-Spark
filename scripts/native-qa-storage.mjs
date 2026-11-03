// Metadata and warnings only. Retention never deletes or shares writable files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const policy = JSON.parse(
  await fs.readFile(new URL('./maintenance/retention-policy.json', import.meta.url), 'utf8'),
);
export async function beginQaStorage(root, { workflow, appSha256 }) {
  const absolute = path.resolve(root),
    real = await fs.realpath(absolute);
  if (real.toLowerCase() !== absolute.toLowerCase() || !absolute.split(path.sep).includes('.local'))
    throw Error('QA evidence must be an independent private .local directory');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const sourceDirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  const harness = path.resolve(process.argv[1]),
    harnessSha256 = crypto
      .createHash('sha256')
      .update(await fs.readFile(harness))
      .digest('hex');
  const record = {
    schemaVersion: 1,
    workflow,
    root: absolute,
    sourceCommit,
    sourceDirty,
    harness,
    harnessSha256,
    appSha256,
    ownerPid: process.pid,
    startedAt: new Date().toISOString(),
    status: 'incomplete',
    active: true,
    automaticDeletion: false,
  };
  const output = path.join(absolute, 'storage-run.json');
  await fs.writeFile(output, JSON.stringify(record, null, 2), { flag: 'wx' });
  const stat = await fs.statfs(absolute),
    freeBytes = Number(stat.bavail) * Number(stat.bsize);
  if (freeBytes < policy.warnFreeBytes)
    console.warn(
      `QA storage warning: only ${(freeBytes / 2 ** 30).toFixed(1)} GiB free. Archive verified cold copies before another native run.`,
    );
  return async (status) => {
    if (!['passed', 'failed'].includes(status)) throw Error('Explicit native QA outcome required');
    let bytes = 0,
      files = 0;
    const stack = [absolute];
    while (stack.length) {
      const dir = stack.pop();
      for (const item of await fs.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isSymbolicLink()) continue;
        if (item.isDirectory()) {
          if ((await fs.realpath(file)).toLowerCase() !== file.toLowerCase()) continue;
          stack.push(file);
        } else if (item.isFile()) {
          bytes += (await fs.stat(file)).size;
          files++;
        }
      }
    }
    await fs.writeFile(
      output,
      JSON.stringify(
        {
          ...record,
          status,
          active: false,
          finishedAt: new Date().toISOString(),
          logicalBytes: bytes,
          files,
        },
        null,
        2,
      ),
    );
    if (bytes > policy.warnRunLogicalBytes)
      console.warn(
        `QA storage warning: ${workflow} retained ${(bytes / 2 ** 30).toFixed(2)} GiB. Use the verified cold-QA archive workflow; failed runs have longer retention.`,
      );
  };
}
