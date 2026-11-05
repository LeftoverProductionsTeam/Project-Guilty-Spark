// A real native compile followed by unchanged-build requests. Uses the existing
// production builder; keeps process measurements separate from native receipts.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {assertQaOutputPath,beginQaStorage} from './native-qa-storage.mjs';
import crypto from 'node:crypto';
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
  'target/release/examples',
  `${helperName}${process.platform === 'win32' ? '.exe' : ''}`,
);
if (!fs.existsSync(helper))
  throw Error(`Build spark-core example ${helperName} in the shared release cache first.`);
if (fs.existsSync(output)) throw Error('Choose a fresh evidence directory; previous results are preserved.');
await fs.promises.mkdir(await assertQaOutputPath(output,{reservationBytes:2*1024**3}));
const finishStorage=await beginQaStorage(output,{workflow:importedAsset?'native-import-storage':'native-build-storage',appSha256:crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex'),reservationBytes:2*1024**3});
const workspace=await finishStorage.createScratch('workspace');
args[args.length-1]=path.join(workspace,'native');
const before = fs.statfsSync(root);
const samples = [];
const physicalSamples=[];
async function physical(phase){
  const meter=process.env.SPARK_NATIVE_STORAGE_PHYSICAL_METER,directory=process.env.SPARK_NATIVE_STORAGE_PHYSICAL_OUTPUT;
  if(!meter)return;
  if(!directory)throw Error('Physical sampling requires a bounded separate evidence directory');
  await fs.promises.mkdir(await assertQaOutputPath(directory,{reservationBytes:0}),{recursive:true});
  const file=path.join(directory,`${String(physicalSamples.length).padStart(3,'0')}-${phase}.jsonl`);
  await new Promise((resolve,reject)=>execFile(meter,[output,file],{windowsHide:true,timeout:30000},error=>error?reject(error):resolve()));
  const measured=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line)).find(row=>row.type==='root-summary');
  if(measured.errors)throw Error('Physical compiler measurement had filesystem errors');
  physicalSamples.push({phase,allocatedBytes:measured.uniqueAllocatedFileBytes,files:measured.files,evidence:file});
}
await physical('before-native-compile');
const out = fs.openSync(path.join(output,'native.stdout.log'), 'wx'),
  err = fs.openSync(path.join(output,'native.stderr.log'), 'wx');
const child = spawn(helper, args, { cwd: root, windowsHide: true, stdio: ['ignore', out, err] });
await finishStorage.trackProcess(child);
const interrupt=async()=>{try{await finishStorage.interrupt();}finally{process.exit(130);}};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
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
    async (error, text) => {
      try {
        const p = text.trim() ? JSON.parse(text) : [];
        samples.push({ elapsedMs: Date.now() - started, processes: Array.isArray(p) ? p : [p] });
        await physical('native-compile-sample');
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
await physical('after-native-compile');
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
  samples,physicalSamples,
  note: 'Sampled RAM includes this helper and native compiler processes; it is not all Spark RAM or GPU memory. Volume free delta includes concurrent disk activity. Native file allocation is measured independently by the helper.',
};
// Retain small diagnostics/authoring recipes and the final verified native map,
// never the full generated libraries, compiler tags or first-run intermediates.
let storageError=null;
try {
for(const name of ['acceptance.json','project.gsproject','first-receipt.json','edited-receipt.json','native-events.jsonl','extraction.json']){
  const file=path.join(args.at(-1),name);
  if(fs.existsSync(file)){
    if(fs.statSync(file).size>4*1024**2)throw Error('Native diagnostic exceeds its evidence budget');
    fs.copyFileSync(file,path.join(output,name),fs.constants.COPYFILE_EXCL);
  }
}
if(result.code===0){
  const native=JSON.parse(fs.readFileSync(path.join(output,'acceptance.json'),'utf8'));
  if(!native.complete)throw Error('Native helper did not acknowledge completion');
  const final=native.externalEdit?.editedBuild??native.build;
  if(final?.output)await finishStorage.retain(final.output,'Accepted final native compiler output with independent readback');
}
} catch(error) {storageError=String(error);process.exitCode=1;}
try{await finishStorage(result.code===0&&!storageError?'passed':'failed');}catch(error){storageError=[storageError,String(error)].filter(Boolean).join('; ');process.exitCode=1;}
await physical('after-cleanup');
fs.writeFileSync(path.join(output,'process.json'), JSON.stringify({...report,storageError}, null, 2), { flag: 'wx' });
process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
console.log(JSON.stringify({ ...report, samples: report.samples.length, args: undefined }));
if (result.code !== 0) process.exitCode = 1;
