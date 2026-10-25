import { readFile, writeFile, open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const input = JSON.parse(await readFile('.local/qa/candidates.json', 'utf8'));
const reports = [];
for (const candidate of input.filter((c) => c.scenarioType === 1)) {
  const report = { path: candidate.path };
  for (const check of ['is_protected', 'protection_issues', 'tags_count']) {
    const r = spawnSync(
      path.resolve('.local/tools/invader/invader-info.exe'),
      ['-T', check, candidate.path],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    report[check] = { status: r.status, text: r.stdout.trim(), error: r.stderr.trim() };
  }
  const f = await open(candidate.path, 'r');
  const b = Buffer.alloc(2048);
  await f.read(b, 0, 2048, 0);
  await f.close();
  report.header = {
    declared: candidate.version === 6 ? b.readUInt32LE(0x5e8) : b.readUInt32LE(8),
    tagOffset: candidate.version === 6 ? b.readUInt32LE(0x5ec) : b.readUInt32LE(0x10),
    tagSize: candidate.version === 6 ? b.readUInt32LE(0x2c4) : b.readUInt32LE(0x14),
  };
  reports.push(report);
  console.log(JSON.stringify(report));
}
await writeFile('.local/qa/candidate-tool-probes.json', JSON.stringify(reports, null, 2));
