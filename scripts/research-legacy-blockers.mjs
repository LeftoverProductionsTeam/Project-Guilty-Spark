import { readFile, writeFile, open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const candidates = JSON.parse(await readFile('.local/qa/candidates.json', 'utf8')).filter(
  (c) => c.scenarioType === 1,
);
for (const c of candidates) {
  const f = await open(c.path, 'r');
  const header = Buffer.alloc(2048);
  await f.read(header, 0, 2048, 0);
  const off = header.readUInt32LE(c.version === 6 ? 0x5ec : 16);
  const data = Buffer.alloc(40);
  await f.read(data, 0, 40, off);
  await f.close();
  console.log(path.relative(process.cwd(), c.path), {
    arrayPointer: data.readUInt32LE(0).toString(16),
    tagCount: data.readUInt32LE(12),
  });
  if (path.basename(c.path) === 'apocolypse_1.map') {
    for (const check of ['external_bitmaps_count', 'external_sounds_count']) {
      const r = spawnSync(path.resolve('.local/tools/invader/invader-info.exe'), ['-T', check, c.path], {
        encoding: 'utf8',
        windowsHide: true,
      });
      console.log(check, r.stdout.trim(), r.stderr.trim());
    }
  }
}
const tree = await (
  await fetch('https://api.github.com/repos/SnowyMouse/invader/git/trees/master?recursive=1')
).json();
const paths =
  tree.tree?.filter((x) => /scenario/.test(x.path) && x.path.endsWith('.cpp')).map((x) => x.path) ?? [];
console.log('SCENARIO SOURCES', paths);
for (const p of paths) {
  const s = await (await fetch(`https://raw.githubusercontent.com/SnowyMouse/invader/master/${p}`)).text();
  if (s.includes('invalid scenario script node table')) {
    await writeFile('.research/scenario-blocker.cpp', s);
    const lines = s.split('\n');
    const i = lines.findIndex((l) => l.includes('invalid scenario script node table'));
    console.log(p, lines.slice(Math.max(0, i - 45), i + 25).join('\n'));
  }
}
const bitmap = await (
  await fetch(
    'https://raw.githubusercontent.com/SnowyMouse/invader/master/src/tag/hek/definition/bitmap.json',
  )
).text();
await writeFile('.research/bitmap.json', bitmap);
const defs = JSON.parse(bitmap);
for (const d of defs.filter((d) => ['Bitmap', 'BitmapData', 'BitmapDataFlags'].includes(d.name)))
  console.log('BITMAP', JSON.stringify(d));
