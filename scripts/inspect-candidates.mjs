import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const candidates = JSON.parse(await readFile('.local/qa/candidates.json', 'utf8'));
const reports = [];
for (const candidate of candidates.filter((c) => c.kind !== 'resource/other')) {
  const result = spawnSync(path.resolve('target/debug/examples/inspect.exe'), [candidate.path], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
  let inspection;
  try {
    inspection = JSON.parse(result.stdout);
  } catch {
    inspection = { error: result.stderr.trim() };
  }
  reports.push({ ...candidate, inspection });
  console.log(
    JSON.stringify({
      file: path.relative(process.cwd(), candidate.path),
      version: candidate.version,
      status: result.status,
      tags: inspection.tags,
      objects: inspection.objects,
      triangles: inspection.geometryTriangles,
      error: inspection.error,
    }),
  );
}
await writeFile('.local/qa/restoration-inspection.json', JSON.stringify(reports, null, 2));
