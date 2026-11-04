// A real native compile followed by unchanged-build requests. Uses the existing
// production builder; keeps process measurements separate from native receipts.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importedAsset = process.argv[2] === '--imported-asset';
const args = process.argv.slice(importedAsset ? 3 : 2).map((p) => path.resolve(p));
if (args.length !== (importedAsset ? 6 : 5))
  throw Error(
    importedAsset
      ? 'test-native-storage --imported-asset <accepted project> <native cache> <small accepted tags> <kit> <Invader> <fresh evidence directory>'
      : 'test-native-storage <accepted project> <SDK tags> <kit> <Invader> <fresh evidence directory>',
  );
const output = args.at(-1);
const helperName = importedAsset ? 'qa_native_asset_storage' : 'qa_native_storage';
const helper = path.join(
  root,
  '.local/build/cargo/release/examples',
  `${helperName}${process.platform === 'win32' ? '.exe' : ''}`,
);
if (!fs.existsSync(helper))
  throw Error(`Build spark-core example ${helperName} in the shared release cache first.`);
if (fs.existsSync(output)) throw Error('Choose a fresh evidence directory; previous results are preserved.');
const before = fs.statfsSync(root);
const samples = [];
const out = fs.openSync(`${output}.stdout.log`, 'wx'),
  err = fs.openSync(`${output}.stderr.log`, 'wx');
const child = spawn(helper, args, { cwd: root, windowsHide: true, stdio: ['ignore', out, err] });
let pending = false;
const started = Date.now();
const sample = () => {
  if (pending || process.platform !== 'win32') return;
  pending = true;
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq '${helperName}' -or $_.ProcessName -eq 'tool' -or $_.ProcessName -like 'invader-*' } | Select-Object Id,ProcessName,WorkingSet64,PeakWorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress`,
    ],
    { windowsHide: true, timeout: 15000 },
    (error, text) => {
      try {
        const p = text.trim() ? JSON.parse(text) : [];
        samples.push({ elapsedMs: Date.now() - started, processes: Array.isArray(p) ? p : [p] });
      } catch {
      } finally {
        pending = false;
      }
    },
  );
};
sample();
const interval = setInterval(sample, 2000);
const result = await new Promise((resolve) => {
  child.on('error', (e) => resolve({ error: String(e) }));
  child.on('exit', (code, signal) => resolve({ code, signal }));
});
clearInterval(interval);
fs.closeSync(out);
fs.closeSync(err);
// Finish the last non-blocking process sample before sealing its evidence.
while (pending) await new Promise((r) => setTimeout(r, 25));
const after = fs.statfsSync(root);
const summed = samples.map((s) => s.processes.reduce((n, p) => n + Number(p.WorkingSet64 ?? 0), 0));
const report = {
  schemaVersion: 1,
  helper,
  args,
  pid: child.pid,
  result,
  durationMs: Date.now() - started,
  peakSampledCombinedWorkingSet: Math.max(0, ...summed),
  processPeakWorkingSet: Math.max(
    0,
    ...samples.flatMap((s) => s.processes.map((p) => Number(p.PeakWorkingSet64 ?? 0))),
  ),
  freeBefore: before.bavail * before.bsize,
  freeAfter: after.bavail * after.bsize,
  volumeFreeDeltaBytes: after.bavail * after.bsize - before.bavail * before.bsize,
  samples,
  note: 'Sampled RAM includes this helper and native compiler processes; it is not all Spark RAM or GPU memory. Volume free delta includes concurrent disk activity. Native file allocation is measured independently by the helper.',
};
fs.writeFileSync(`${output}.process.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ ...report, samples: report.samples.length, args: undefined }));
if (result.code !== 0) process.exitCode = 1;
