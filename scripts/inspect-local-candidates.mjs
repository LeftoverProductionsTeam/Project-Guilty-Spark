// Read-only inventory of explicitly supplied candidate archives. Never launches their executables.
import { readdir, open, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv[2] ?? 'Pyros Zombie Apocolypse Mod Versions');
const found = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const p = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (/\.map$/i.test(entry.name)) {
      const f = await open(p, 'r');
      const data = Buffer.alloc(2048);
      await f.read(data, 0, 2048, 0);
      const size = (await f.stat()).size;
      await f.close();
      const demo = data.readUInt32LE(0x2c0) === 0x45686564;
      const standard = data.readUInt32LE(0) === 0x68656164;
      const str = (at) =>
        data
          .subarray(at, at + 32)
          .toString('utf8')
          .split('\0')[0];
      found.push({
        path: p,
        size,
        kind: demo ? 'demo' : standard ? 'scenario' : 'resource/other',
        version: demo ? data.readUInt32LE(0x588) : standard ? data.readUInt32LE(4) : null,
        name: demo ? str(0x58c) : standard ? str(32) : '',
        build: demo ? str(0x2c8) : standard ? str(64) : '',
        scenarioType: demo ? data.readUInt16LE(2) : standard ? data.readUInt16LE(0x60) : null,
      });
    } else if (/read.*\.rtf$/i.test(entry.name)) {
      const text = await readFile(p, 'utf8');
      console.log(
        'README (untrusted source text)',
        path.relative(root, p),
        text
          .replace(/\\[a-z]+\d*\s?/gi, ' ')
          .replace(/[{}]/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 7000),
      );
    }
  }
}
await walk(root);
await mkdir('.local/qa', { recursive: true });
await writeFile('.local/qa/candidates.json', JSON.stringify(found, null, 2));
console.log(JSON.stringify(found, null, 2));
