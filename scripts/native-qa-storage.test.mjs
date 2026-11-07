import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  assertQaOutputPath,
  beginQaStorage,
  disposeQaScratch,
  admitCargoOutput,
  recoverQaScratch,
  stopQaProcess,
  watchOutputBudget,
  embeddedFrontendConfig,
  exportDevelopmentBuild,
  retainGeneratedSchemaState,
  readDevelopmentStorage,
  withDevelopmentWorkspace,
} from './native-qa-storage.mjs';
import { prepareDesktopArguments } from './desktop.mjs';
import { safeQaCopy } from './qa-safe-copy.mjs';

test('inline owned operations record their actual origin and clean their disposable output', () => {
  const env={...process.env};
  for(const name of ['CARGO_TARGET_DIR','SPARK_BUILD_WORKSPACE','SPARK_BUILD_NONCE','SPARK_GENERATED_ROOT','SPARK_QA_STORAGE_ROOT'])delete env[name];
  const source=new URL('./native-qa-storage.mjs',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {withDevelopmentWorkspace,readDevelopmentStorage} from ${JSON.stringify(source)};await withDevelopmentWorkspace('inline-regression',async c=>{await fs.writeFile(c.directory+'/probe.txt','bounded inline operation');const report=await readDevelopmentStorage();assert.ok(report.runs.some(row=>row.ownerPid===process.pid&&row.active));},{reservationBytes:8*1024**2});`],{env,encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/"temporaryOutputDisposed":true/);
});

test('a second process preserves another startup namespace before its receipt is published', async () => {
  const env={...process.env};
  for(const name of ['CARGO_TARGET_DIR','SPARK_BUILD_WORKSPACE','SPARK_BUILD_NONCE','SPARK_GENERATED_ROOT','SPARK_QA_STORAGE_ROOT'])delete env[name];
  const {root}=await readDevelopmentStorage();await fs.mkdir(root,{recursive:true});
  const pending=await fs.mkdtemp(path.join(root,'run-'));
  try {
    const source=new URL('./native-qa-storage.mjs',import.meta.url).href;
    const run=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {withDevelopmentWorkspace} from ${JSON.stringify(source)};await withDevelopmentWorkspace('pending-admission-regression',async()=>{assert.ok((await fs.stat(${JSON.stringify(pending)})).isDirectory(),'Another process owns the unpublished namespace');},{reservationBytes:8*1024**2});`],{env,encoding:'utf8',windowsHide:true});
    assert.equal(run.status,0,run.stderr);assert.ok((await fs.stat(pending)).isDirectory());
    assert.deepEqual(await fs.readdir(pending),[]);
  } finally {await fs.rmdir(pending).catch(error=>{if(error.code!=='ENOENT')throw error;});}
});

test('stdin operations use the real storage API identity and leave no generated tree', () => {
  const env={...process.env};
  for(const name of ['CARGO_TARGET_DIR','SPARK_BUILD_WORKSPACE','SPARK_BUILD_NONCE','SPARK_GENERATED_ROOT','SPARK_QA_STORAGE_ROOT'])delete env[name];
  const source=new URL('./native-qa-storage.mjs',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-'],{env,encoding:'utf8',windowsHide:true,
    input:`import fs from 'node:fs/promises';import {withDevelopmentWorkspace} from ${JSON.stringify(source)};await withDevelopmentWorkspace('stdin-regression',async c=>{await fs.writeFile(c.directory+'/tiny.txt','stdin output');},{reservationBytes:8*1024**2});`});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/"temporaryOutputDisposed":true/);
});

test('live allocation sampling shares child deletion while pinning the root and validating its identity', {
  skip:process.platform!=='win32',
},()=>withDevelopmentWorkspace('live-directory-sharing',async context=>{
  await fixture(async parent=>{
    const root=await mkdir(path.join(parent,'live-root'));
    const child=await mkdir(path.join(root,'compiler-temp'));
    const script=String.raw`
      $ErrorActionPreference='Stop'
      Add-Type -Path $env:SPARK_METER_SOURCE
      $flags=[System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static
      [SparkPhysicalAudit].GetField('summaryMode',$flags).SetValue($null,$true)
      $visit=[SparkPhysicalAudit].GetMethod('OpenVisitDirectory',$flags)
      $open=[SparkPhysicalAudit].GetMethod('Open',$flags)
      if($visit){$handle=$visit.Invoke($null,@($env:SPARK_LIVE_CHILD,1))}else{$handle=$open.Invoke($null,@($env:SPARK_LIVE_CHILD,$true))}
      try {[System.IO.Directory]::Delete($env:SPARK_LIVE_CHILD);[Console]::WriteLine('child-delete-shared')} finally {$handle.Dispose()}
      [System.IO.Directory]::CreateDirectory($env:SPARK_LIVE_CHILD)|Out-Null
      $moving=$visit.Invoke($null,@($env:SPARK_LIVE_CHILD,1))
      try {
        $infoArgs=[object[]]@($moving,$null)
        $readOk=[SparkPhysicalAudit].GetMethod('GetFileInformationByHandle',$flags).Invoke($null,$infoArgs)
        if(-not $readOk){throw 'Cannot read owned directory identity'}
        [System.IO.Directory]::Move($env:SPARK_LIVE_CHILD,$env:SPARK_LIVE_CHILD+'-original')
        [System.IO.Directory]::CreateDirectory($env:SPARK_LIVE_CHILD)|Out-Null
        try {[SparkPhysicalAudit].GetMethod('RecheckLiveDirectory',$flags).Invoke($null,@($env:SPARK_LIVE_CHILD,$infoArgs[1]));throw 'Replacement identity unexpectedly accepted'}
        catch {if($_.Exception.GetBaseException().GetType().Name -ne 'MovingDirectoryException'){throw};[Console]::WriteLine('replacement-identity-refused')}
      } finally {$moving.Dispose()}
      $rootHandle=$visit.Invoke($null,@($env:SPARK_LIVE_ROOT,0))
      try {
        try {[System.IO.Directory]::Move($env:SPARK_LIVE_ROOT,$env:SPARK_LIVE_ROOT+'-moved');throw 'Root unexpectedly moved'}
        catch {if(($_.Exception.GetBaseException().HResult -band 65535) -ne 32){throw};[Console]::WriteLine('root-still-pinned')}
      } finally {$rootHandle.Dispose()}
      $regular=$open.Invoke($null,@($env:SPARK_LIVE_ROOT,$true))
      try { [Console]::WriteLine('original-open-contract-preserved') } finally {$regular.Dispose()}
    `;
    const run=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,encoding:'utf8',env:{...process.env,SPARK_METER_SOURCE:path.resolve('scripts/maintenance/physical-audit.cs'),SPARK_LIVE_ROOT:root,SPARK_LIVE_CHILD:child}});
    assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
    assert.match(run.stdout,/child-delete-shared/);assert.match(run.stdout,/root-still-pinned/);assert.match(run.stdout,/original-open-contract-preserved/);assert.match(run.stdout,/replacement-identity-refused/);
    assert.ok((await fs.stat(child)).isDirectory());assert.ok((await fs.stat(root)).isDirectory());
  });
},{reservationBytes:8*1024**2}));

test('real Windows allocation summaries retain resident bytes, deduplicate file IDs and refuse junctions', {
  skip: process.platform !== 'win32',
}, () => withDevelopmentWorkspace('native-allocation-contract', async context => {
  const record = JSON.parse(await fs.readFile(path.join(context.env.SPARK_BUILD_WORKSPACE, 'storage-run.json'), 'utf8'));
  assert.ok(record.allocationMeter?.executable, 'Windows native allocation helper must be compiled from current source');
  await fixture(async parent => {
    const root = await mkdir(path.join(parent, 'measured'));
    await fs.writeFile(path.join(root, 'resident.bin'), Buffer.alloc(256, 7));
    await fs.writeFile(path.join(root, 'regular.bin'), Buffer.alloc(4096, 11));
    await fs.link(path.join(root, 'regular.bin'), path.join(root, 'hardlink.bin'));
    const read = (...exclude) => JSON.parse(execFileSync(record.allocationMeter.executable, ['--summary', root, ...exclude], { windowsHide: true, encoding: 'utf8' }));
    const before = read();
    assert.equal(before.errors, 0); assert.equal(before.files, 3);
    assert.equal(before.logicalBytes, 256 + 8192); assert.equal(before.uniqueFileObjects, 2);
    assert.equal(before.multiLinkEntries, 2);
    // Reproduce the Win32 state used by short-lived compiler object files.
    // A classic DeleteFile keeps the name pending while this owned handle is
    // open; metadata CreateFile reports access denied, not file-not-found.
    const heldScript=String.raw`
      Add-Type -Path $env:SPARK_METER_SOURCE
      Add-Type @'
using System; using System.Runtime.InteropServices; using System.ComponentModel; using Microsoft.Win32.SafeHandles;
public static class NativeHeldDelete {
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle file,int kind,ref int value,uint bytes);
  public static void Mark(SafeFileHandle file){int value=1;if(!SetFileInformationByHandle(file,4,ref value,4))throw new Win32Exception();}
}
'@
      $f=[System.IO.FileStream]::new($env:SPARK_PENDING_FILE,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::ReadWrite,([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete),4096,[System.IO.FileOptions]::DeleteOnClose)
      try {
        [NativeHeldDelete]::Mark($f.SafeFileHandle)
        try {$method=[SparkPhysicalAudit].GetMethod("Open",([System.Reflection.BindingFlags]::NonPublic -bor [System.Reflection.BindingFlags]::Static));$probe=$method.Invoke($null,@($env:SPARK_PENDING_FILE,$false));$probe.Dispose();[Console]::WriteLine("unexpected-open")}
        catch {$errorValue=$_.Exception;while($errorValue.InnerException){$errorValue=$errorValue.InnerException};[Console]::WriteLine("pending:"+$errorValue.NativeErrorCode)}
        [Console]::ReadLine()|Out-Null
      } finally {$f.Dispose()}
    `;
    const holder=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',heldScript],
      {env:{...process.env,SPARK_PENDING_FILE:path.join(root,'pending.bin'),SPARK_METER_SOURCE:path.resolve('scripts/maintenance/physical-audit.cs')},windowsHide:true,stdio:['pipe','pipe','pipe']});
    await context.trackProcess(holder);
    try{
      const message=await new Promise((resolve,reject)=>{holder.stdout.once('data',value=>resolve(value.toString()));holder.once('exit',code=>reject(Error('Pending-file fixture exited '+code)));});
      assert.match(message,/pending:5/);
      const pending=read();assert.equal(pending.errors,1);assert.equal(pending.busyErrors,1);
      assert.match(pending.firstIssue,/Win32=5 /);assert.equal(pending.files,before.files);
    }finally{await stopQaProcess(holder);}
    assert.equal(read().errors,0);
    const outside = await mkdir(path.join(parent, 'originals'));
    await fs.writeFile(path.join(outside, 'source.tag'), 'protected original');
    const alias = path.join(root, 'alias'); await fs.symlink(outside, alias, 'junction');
    try {
      const linked = read(); assert.equal(linked.reparseEntries, 1); assert.equal(linked.files, before.files);
      const excluded = read('alias'); assert.equal(excluded.reparseEntries, 0); assert.equal(excluded.uniqueAllocatedFileBytes, before.uniqueAllocatedFileBytes);
      assert.equal(await fs.readFile(path.join(outside, 'source.tag'), 'utf8'), 'protected original');
    } finally { await fs.unlink(alias); }
    assert.equal(read().uniqueAllocatedFileBytes, before.uniqueAllocatedFileBytes);
  });
}, { reservationBytes: 8 * 1024 ** 2 }));

test('a monitor failure retires its completed receipt without turning failure into success', () => {
  const env={...process.env};
  for(const name of ['CARGO_TARGET_DIR','SPARK_BUILD_WORKSPACE','SPARK_BUILD_NONCE','SPARK_GENERATED_ROOT','SPARK_QA_STORAGE_ROOT'])delete env[name];
  const source=new URL('./native-qa-storage.mjs',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {withDevelopmentWorkspace} from ${JSON.stringify(source)};let root;await assert.rejects(withDevelopmentWorkspace('monitor-failure-retirement',async c=>{root=c.env.SPARK_BUILD_WORKSPACE;await fs.writeFile(c.directory+'/generated.bin',Buffer.alloc(131072,7));},{reservationBytes:65536}),/storage budget/);await assert.rejects(fs.stat(root),{code:'ENOENT'});`],{env,encoding:'utf8',windowsHide:true});
  assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/"temporaryOutputDisposed":true/);
});

async function fixture(run) {
  const temporaryParent = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporaryParent, 'spark-qa-storage-'));
  try {
    await run(root);
  } finally {
    assert.equal(await fs.realpath(root), root);
    assert.ok(root.startsWith(path.join(temporaryParent, 'spark-qa-storage-')));
    // Only this test's independent, explicitly resolved small temporary root.
    await fs.rm(root, { recursive: true });
  }
}

test('uncreated output resolves through its trusted ancestor without allocating a directory', () =>
  fixture(async (parent) => {
    const output = path.join(parent, 'not-created', 'nested');
    assert.equal(await assertQaOutputPath(output), output);
    await assert.rejects(fs.stat(path.dirname(output)), { code: 'ENOENT' });
    const alias = path.join(parent, 'alias');
    await fs.symlink(parent, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(assertQaOutputPath(path.join(alias, 'not-created', 'nested')), /links|junctions/);
    await fs.writeFile(path.join(parent, 'file'), 'original');
    await assert.rejects(assertQaOutputPath(path.join(parent, 'file', 'child')), /directory|ENOTDIR/);
    assert.equal(await fs.readFile(path.join(parent, 'file'), 'utf8'), 'original');
  }));

test('Windows short, verbatim and case spellings share the same real disposable owner', {
  skip: process.platform !== 'win32',
}, () => fixture(async (parent) => {
  const short = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:SPARK_TEST_ALIAS).ShortPath'], {
    env: { ...process.env, SPARK_TEST_ALIAS: parent }, encoding: 'utf8', windowsHide: true,
  }).trim();
  const spellings = [path.toNamespacedPath(parent), parent[0].toLowerCase() + parent.slice(1), short];
  for (const [i, spelling] of spellings.entries()) {
    const supplied = path.join(spelling, `run-${i}`), canonical = path.join(parent, `run-${i}`);
    assert.equal(await assertQaOutputPath(supplied), canonical);
    await assert.rejects(fs.stat(canonical), { code: 'ENOENT' });
    await fs.mkdir(supplied);
    const finish = await beginQaStorage(supplied, options(parent));
    const scratch = await finish.createScratch('library');
    await fs.writeFile(path.join(scratch, 'tiny.tag'), 'test-only bytes');
    const result = await finish('passed');
    assert.equal(result.root, canonical);
    assert.equal(result.disposedBytes, 15);
    await assert.rejects(fs.stat(scratch), { code: 'ENOENT' });
  }
  for (const spelling of [path.toNamespacedPath(path.resolve('src')), path.resolve('src').toLowerCase(), path.resolve('Runtimes')])
    await assert.rejects(assertQaOutputPath(path.join(spelling, 'must-not-create')), /canonical source/);
  await assert.rejects(exportDevelopmentBuild(parent, path.toNamespacedPath(path.resolve('src', 'must-not-export'))), /outside the source/);

  // Reproduce the hosted runner's short TEMP username in the actual inline
  // wrapper, not just by comparing normalized strings.
  const env = { ...process.env, TEMP: short, TMP: short };
  for (const name of ['CARGO_TARGET_DIR', 'SPARK_BUILD_WORKSPACE', 'SPARK_BUILD_NONCE',
    'SPARK_GENERATED_ROOT', 'SPARK_QA_STORAGE_ROOT']) delete env[name];
  const source = new URL('./native-qa-storage.mjs', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {withDevelopmentWorkspace} from ${JSON.stringify(source)};await withDevelopmentWorkspace('short-temp-regression',async()=>{}, {reservationBytes:8*1024**2});`],
    { env, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /"temporaryOutputDisposed":true/);
}));
test('external frontend configuration uses the unambiguous embedded file-list type', () => {
  const directory = path.resolve(os.tmpdir(), 'Spark build with spaces', 'web');
  const config = JSON.parse(JSON.stringify(embeddedFrontendConfig(directory)));
  assert.deepEqual(config.build.frontendDist, [directory]);
});

test('desktop embeds the frontend and keeps Tauri flags before Cargo arguments', () => {
  const config = JSON.stringify(embeddedFrontendConfig(os.tmpdir()));
  const result = prepareDesktopArguments(
    ['build', '--bundles', 'nsis', '--export-to', os.tmpdir(), '--', '--locked'],
    config,
  );
  assert.deepEqual(result.args, [
    'build',
    '--bundles',
    'nsis',
    '--features',
    'tauri/custom-protocol',
    '--config',
    config,
    '--',
    '--locked',
  ]);
  assert.equal(result.exportTo, os.tmpdir());
  assert.throws(() => prepareDesktopArguments(['build'], config), /export-to/);
  assert.throws(() => prepareDesktopArguments(['build', '--export-to', '--locked'], config), /folder/);
  assert.equal(
    prepareDesktopArguments(['build', '--no-bundle', '--features', 'a,tauri/custom-protocol'], config)
      .args[3],
    'a,tauri/custom-protocol',
  );
});

test('Tauri incidental schemas are disposed while pre-existing input and unrelated files survive', () =>
  fixture(async (parent) => {
    const schemas = path.join(parent, 'src-tauri', 'gen', 'schemas');
    await fs.mkdir(schemas, { recursive: true });
    const original = Buffer.from('{"owner":"existing configuration"}\n');
    await fs.writeFile(path.join(schemas, 'capabilities.json'), original);
    const restore = await retainGeneratedSchemaState(parent);
    await fs.writeFile(path.join(schemas, 'capabilities.json'), '{"generated":true}');
    await fs.writeFile(path.join(schemas, 'desktop-schema.json'), '{"generated":true}');
    await fs.writeFile(path.join(schemas, 'unrelated.txt'), 'user input');
    await restore();
    assert.deepEqual(await fs.readFile(path.join(schemas, 'capabilities.json')), original);
    await assert.rejects(fs.stat(path.join(schemas, 'desktop-schema.json')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(schemas, 'unrelated.txt'), 'utf8'), 'user input');
  }));

test('explicit build export copies only admitted artifacts and protects different existing output', () =>
  fixture(async (parent) => {
    const release = path.join(parent, 'release'),
      destination = path.join(parent, 'export');
    await fs.mkdir(path.join(release, 'bundle', 'nsis'), { recursive: true });
    await fs.writeFile(path.join(release, 'GuiltySpark.exe'), 'owned application');
    await fs.writeFile(path.join(release, 'bundle', 'nsis', 'Spark.exe'), 'owned installer');
    await fs.writeFile(path.join(release, 'debug.pdb'), 'disposable symbols');
    const result = await exportDevelopmentBuild(release, destination);
    assert.equal(result.files.length, 2);
    assert.match(result.sourceCommit, /^[a-f0-9]{40}$/);
    assert.equal(typeof result.workingTreeDirty, 'boolean');
    assert.equal(await fs.readFile(path.join(destination, 'GuiltySpark.exe'), 'utf8'), 'owned application');
    await assert.rejects(fs.stat(path.join(destination, 'debug.pdb')), { code: 'ENOENT' });
    assert.deepEqual(await exportDevelopmentBuild(release, destination), result);
    await fs.writeFile(path.join(destination, 'GuiltySpark.exe'), 'user-owned changed file');
    await assert.rejects(exportDevelopmentBuild(release, destination), /protected/);
    assert.equal(
      await fs.readFile(path.join(destination, 'GuiltySpark.exe'), 'utf8'),
      'user-owned changed file',
    );
    await assert.rejects(exportDevelopmentBuild(release, path.join(release, 'export')), /separate/);
    await assert.rejects(exportDevelopmentBuild(release, path.resolve('target', 'export')), /outside/);
  }));
const options = (root) => ({
  workflow: 'contract',
  appSha256: 'a'.repeat(64),
  reservationBytes: 512 * 1024,
  totalBytes: 4 * 1024 * 1024,
  minimumFreeBytes: 0,
  storageRoot: path.join(root, 'catalog'),
});
const mkdir = async (directory) => {
  await fs.mkdir(directory);
  return directory;
};

test('source checkout refuses new generated output while allowing read-only legacy recovery', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'isolated-policy'));
    await fs.mkdir(path.join(root, 'scripts/maintenance'), { recursive: true });
    await fs.mkdir(path.join(root, 'artifacts'));
    // Only this module and a tiny policy fixture; never a repository/SDK copy.
    const moduleFile = path.join(root, 'scripts/native-qa-storage.mjs');
    await fs.copyFile(new URL('./native-qa-storage.mjs', import.meta.url), moduleFile);
    const policy = JSON.parse(
      await fs.readFile(new URL('./maintenance/retention-policy.json', import.meta.url), 'utf8'),
    );
    await fs.writeFile(
      path.join(root, 'scripts/maintenance/retention-policy.json'),
      JSON.stringify({ ...policy, qaRunBytes: 100, qaTotalBytes: 200, qaMinimumFreeBytes: 0 }),
    );
    await fs.writeFile(path.join(root, 'artifacts/evidence.bin'), Buffer.alloc(120));
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import assert from 'node:assert/strict';import path from 'node:path';
    const {assertQaOutputPath}=await import(process.argv[1]);const root=process.argv[2];
    await assert.rejects(assertQaOutputPath(path.join(root,'artifacts/small'),{reservationBytes:40}),/Source-only checkout/);
    await assert.rejects(assertQaOutputPath(path.join(root,'artifacts/large')),/Source-only checkout/);
    await assertQaOutputPath(path.join(root,'artifacts/metadata'),{reservationBytes:0});
    for(const reservationBytes of [-1,101,NaN])await assert.rejects(assertQaOutputPath(path.join(root,'artifacts/invalid'),{reservationBytes}),/per-run reservation/);
    console.log('source-only admission enforced; historical content unchanged');
  `,
        pathToFileURL(moduleFile).href,
        root,
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 30000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /historical content unchanged/);
    assert.equal((await fs.stat(path.join(root, 'artifacts/evidence.bin'))).size, 120);
    assert.deepEqual(await fs.readdir(path.join(root, 'artifacts')), ['evidence.bin']);
  }));

test('shared Cargo admission reuses one cache and refuses growth without deleting accepted output', () =>
  fixture(async (parent) => {
    const cache = await mkdir(path.join(parent, 'target'));
    await fs.writeFile(path.join(cache, 'accepted.exe'), 'valid');
    for (let i = 0; i < 3; i++)
      assert.equal((await admitCargoOutput(cache, { budget: 20, reserve: 10, minimumFree: 0 })).bytes, 5);
    await assert.rejects(
      admitCargoOutput(cache, { budget: 10, reserve: 10, minimumFree: 0 }),
      /budget exhausted/,
    );
    assert.equal(await fs.readFile(path.join(cache, 'accepted.exe'), 'utf8'), 'valid');
    assert.deepEqual(await fs.readdir(cache), ['accepted.exe']);
    const alias = path.join(parent, 'target-alias');
    await fs.symlink(cache, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(
      admitCargoOutput(alias, { budget: 20, reserve: 10, minimumFree: 0 }),
      /links|junctions/,
    );
    await assert.rejects(
      admitCargoOutput(path.resolve('src'), { budget: 20, reserve: 10, minimumFree: 0 }),
      /overlap/,
    );
  }));

test('first-build monitor admits an initially absent output directory without a false budget failure', () =>
  fixture(async (parent) => {
    const output = path.join(parent, 'fresh-target'),
      monitor = watchOutputBudget(output, { budget: 65536, intervalMs: 20 });
    await monitor.sample();
    assert.equal(monitor.state.error, null);
    await fs.mkdir(output);
    await fs.writeFile(path.join(output, 'new.rlib'), 'new compiler output');
    await monitor.sample();
    const result = await monitor.stop();
    assert.equal(result.error, null);
    assert.equal(result.peakLogicalBytes, 19);
  }));

test('filesystem notifications update real counts before periodic reconciliation and stop cleanly', () =>
  fixture(async parent => {
    const output = await mkdir(path.join(parent, 'watched'));
    const monitor = watchOutputBudget(output, { budget: 65536, intervalMs: 2000 });
    try {
      await monitor.sample();
      assert.equal(monitor.state.current.files, 0);
      await fs.mkdir(path.join(output, 'nested'));
      await fs.writeFile(path.join(output, 'nested', 'actual.bin'), Buffer.alloc(4096, 7));
      const until = performance.now() + 1800;
      while (performance.now() < until && monitor.state.current.files !== 1)
        await new Promise(resolve => setTimeout(resolve, 25));
      assert.equal(monitor.state.current.logicalBytes, 4096);
      assert.equal(monitor.state.current.files, 1);
      assert.equal(monitor.state.current.directories, 2);
      assert.equal(monitor.state.current.reason, 'filesystem');
      assert.ok(monitor.state.filesystemEvents > 0);
      assert.ok(monitor.state.current.availableBytes > 0);
      assert.ok(monitor.state.current.allocatedBytes === null || monitor.state.current.allocatedBytes >= 4096);
    } finally { await monitor.stop(); }
    const count = monitor.state.samples;
    await fs.writeFile(path.join(output, 'after.bin'), 'watcher closed');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(monitor.state.samples, count);
  }));

test('source monitoring skips protected containers without following their junctions', () =>
  fixture(async parent => {
    const root = await mkdir(path.join(parent, 'source'));
    const original = await mkdir(path.join(parent, 'originals'));
    await fs.writeFile(path.join(original, 'original.map'), 'unchanged game input');
    await fs.symlink(original, path.join(root, 'protected-runtime'), process.platform === 'win32' ? 'junction' : 'dir');
    await fs.writeFile(path.join(root, 'source.ts'), 'source code');
    const monitor = watchOutputBudget(root, { budget: 65536, excludeNames: ['protected-runtime'], intervalMs: 10000 });
    await monitor.sample();
    assert.equal(monitor.state.error, null);
    assert.equal(monitor.state.current.files, 1);
    assert.equal(monitor.state.current.logicalBytes, 11);
    await monitor.stop();
    assert.equal(await fs.readFile(path.join(original, 'original.map'), 'utf8'), 'unchanged game input');
  }));

test('live progress stays bound to its lease and a changed owner prevents cleanup', () =>
  fixture(async parent => {
    const root = await mkdir(path.join(parent, 'run')), finish = await beginQaStorage(root, options(parent));
    const scratch = await finish.createScratch('scratch');
    await fs.writeFile(path.join(scratch, 'keep.bin'), 'unknown changed ownership');
    await finish.sample();
    const file = path.join(root, 'storage-run.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(record.monitoring.current.files >= 1, true);
    assert.ok(['startup', 'explicit'].includes(record.monitoring.current.reason));
    await fs.writeFile(file, JSON.stringify({ ...record, nonce: 'unrecognized-owner' }));
    await finish.sample();
    await assert.rejects(finish('failed'), /owner changed/);
    assert.equal(await fs.readFile(path.join(scratch, 'keep.bin'), 'utf8'), 'unknown changed ownership');
  }));

test('the review-blocked preservation index cannot become a disposable output', () =>
  fixture(async parent => {
    const protectedFile = path.resolve('preserved/recovery-metadata/preservation-index.json');
    const before = await fs.stat(protectedFile).catch(error => { if(error.code==='ENOENT')return null;throw error; });
    const root = await mkdir(path.join(parent, 'run')), finish = await beginQaStorage(root, options(parent));
    await assert.rejects(assertQaOutputPath(protectedFile), /canonical source/);
    await assert.rejects(finish.registerDisposable(protectedFile), /owned QA scratch/);
    await finish('passed');
    const after = await fs.stat(protectedFile).catch(error => { if(error.code==='ENOENT')return null;throw error; });
    assert.equal(after?.size, before?.size);
    assert.equal(after?.mtimeMs, before?.mtimeMs);
  }));

test('QA run records native source identity and outcome; removes only sealed scratch', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run')),
      finish = await beginQaStorage(root, options(parent));
    let record = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
    assert.equal(record.active, true);
    assert.match(record.sourceCommit, /^[a-f0-9]{40}$/);
    const scratch = path.join(root, 'temporary.exe'),
      source = path.join(root, 'unique.map');
    await fs.writeFile(scratch, 'regenerable application copy');
    await fs.writeFile(source, 'irreplaceable source evidence');
    const seal = await finish.registerDisposable(scratch);
    await assert.rejects(disposeQaScratch(root, seal), /Active QA/);
    await assert.rejects(finish('unknown'), /explicit/);
    await finish('failed');
    record = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
    assert.equal(record.status, 'failed');
    assert.equal(record.active, false);
    assert.equal(record.disposedBytes, 28);
    assert.equal(await fs.readFile(source, 'utf8'), 'irreplaceable source evidence');
    await assert.rejects(fs.stat(scratch), { code: 'ENOENT' });
  }));

test('changed, unrelated, replaced and linked scratch cannot be disposed', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run')),
      finish = await beginQaStorage(root, options(parent));
    const file = path.join(root, 'changed.bin');
    await fs.writeFile(file, 'before');
    const seal = await finish.registerDisposable(file);
    await fs.writeFile(file, 'after!');
    await assert.rejects(finish('passed'), /changed/);
    assert.equal(await fs.readFile(file, 'utf8'), 'after!');
    await assert.rejects(
      disposeQaScratch(path.join(parent, 'other'), seal, { ownerFinished: true }),
      /ownership/,
    );
    await fs.unlink(file);
    await fs.writeFile(file, 'before');
    await assert.rejects(disposeQaScratch(root, seal, { ownerFinished: true }), /changed|identity/);
    const folder = await mkdir(path.join(root, 'folder')),
      link = path.join(root, 'alias');
    await fs.symlink(folder, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(finish.registerDisposable(link), /link|junction/);
    assert.equal(await fs.readFile(file, 'utf8'), 'before');
  }));

test('interrupted runs keep reservations and block growth instead of silently evicting evidence', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'interrupted'));
    await beginQaStorage(root, { ...options(parent), totalBytes: 640 * 1024 });
    const next = await mkdir(path.join(parent, 'next'));
    await assert.rejects(beginQaStorage(next, { ...options(parent), totalBytes: 640 * 1024 }), /budget/);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8')).active, true);
    await assert.rejects(fs.stat(path.join(next, 'storage-run.json')), { code: 'ENOENT' });
  }));

test('an unknown or interrupted admission lock is preserved rather than deleted by another run', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run')),
      storageRoot = await mkdir(path.join(parent, 'catalog'));
    const leases = await mkdir(path.join(storageRoot, '.leases')),
      lock = path.join(leases, 'admission.lock');
    await fs.writeFile(lock, 'unresolved owner checkpoint');
    await assert.rejects(beginQaStorage(root, options(parent)), /active or interrupted/);
    assert.equal(await fs.readFile(lock, 'utf8'), 'unresolved owner checkpoint');
    await assert.rejects(fs.stat(path.join(root, 'storage-run.json')), { code: 'ENOENT' });
  }));

test('repeated equivalent QA fixtures dispose copied inputs; only bounded receipts accumulate', () =>
  fixture(async (parent) => {
    const counts = [];
    for (let n = 0; n < 4; n++) {
      const root = await mkdir(path.join(parent, 'repeat-' + n)),
        finish = await beginQaStorage(root, options(parent));
      const scratch = await mkdir(path.join(root, 'scratch'));
      await fs.writeFile(path.join(scratch, 'small.weapon'), Buffer.alloc(64 * 1024, 7));
      await finish.registerDisposable(scratch);
      await fs.writeFile(path.join(root, 'readback.json'), JSON.stringify({ sameNativeInput: true }));
      await finish('passed');
      const report = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
      assert.equal(report.disposedBytes, 64 * 1024);
      assert.ok(report.logicalBytes < 8192);
      counts.push(report.files);
      await assert.rejects(fs.stat(scratch), { code: 'ENOENT' });
    }
    assert.equal(new Set(counts).size, 1);
  }));

test('fresh declared namespaces are reclaimed on pass and failure while exact native fixtures survive', () =>
  fixture(async (parent) => {
    for (const status of ['passed', 'failed']) {
      const root = await mkdir(path.join(parent, status)),
        finish = await beginQaStorage(root, options(parent));
      const scratch = await finish.createScratch('library');
      await fs.writeFile(path.join(scratch, 'source.map'), 'native accepted output');
      await fs.writeFile(path.join(scratch, 'temporary.map'), Buffer.alloc(64 * 1024, 9));
      await finish.retain(path.join(scratch, 'source.map'), 'Accepted independent native compile fixture');
      const result = await finish(status);
      assert.equal(result.status, status);
      assert.equal(result.disposedBytes, 64 * 1024);
      assert.equal(await fs.readFile(path.join(scratch, 'source.map'), 'utf8'), 'native accepted output');
      assert.deepEqual(await fs.readdir(scratch), ['source.map']);
    }
  }));

test('scratch cannot adopt an existing source tree or remove a replaced directory', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run')),
      finish = await beginQaStorage(root, options(parent));
    const existing = await mkdir(path.join(root, 'existing'));
    await fs.writeFile(path.join(existing, 'source'), 'original');
    await assert.rejects(finish.createScratch('existing'), { code: 'EEXIST' });
    const scratch = await finish.createScratch('scratch');
    await fs.rename(scratch, path.join(root, 'moved'));
    await fs.mkdir(scratch);
    await fs.writeFile(path.join(scratch, 'new'), 'replacement must survive');
    await assert.rejects(finish('failed'), /identity changed/);
    assert.equal(await fs.readFile(path.join(scratch, 'new'), 'utf8'), 'replacement must survive');
    assert.equal(await fs.readFile(path.join(existing, 'source'), 'utf8'), 'original');
  }));

test('cleanup handles read-only independent copies without changing a shared original', () =>
  fixture(async (parent) => {
    const original = path.join(parent, 'original.weapon');
    await fs.writeFile(original, 'sealed original');
    await fs.chmod(original, 0o444);
    try {
      const root = await mkdir(path.join(parent, 'run')),
        finish = await beginQaStorage(root, options(parent));
      const scratch = await finish.createScratch('tags'),
        copy = path.join(scratch, 'copy.weapon');
      await fs.copyFile(original, copy);
      await fs.chmod(copy, 0o444);
      await finish('failed');
      await assert.rejects(fs.stat(scratch), { code: 'ENOENT' });
      const next = await mkdir(path.join(parent, 'shared')),
        other = await beginQaStorage(next, options(parent));
      const shared = await other.createScratch('tags');
      await fs.link(original, path.join(shared, 'shared.weapon'));
      try {
        await other('failed');
      } catch (error) {
        assert.match(String(error), /shared|changed|EPERM/);
      }
      assert.equal(await fs.readFile(original, 'utf8'), 'sealed original');
      assert.equal((await fs.stat(original)).mode & 0o200, 0);
    } finally {
      await fs.chmod(original, 0o600);
    }
  }));

test('a killed real harness recovers only its declared scratch and refuses a changed lease first', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run'));
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
    const {beginQaStorage}=await import(pathToFileURL(process.argv[1]).href);const root=process.argv[2],options=JSON.parse(process.argv[3]);
    const finish=await beginQaStorage(root,options);const scratch=await finish.createScratch('library');
    await fs.writeFile(path.join(scratch,'generated.map'),Buffer.alloc(65536,5));
    const app=path.join(root,'temporary.exe');await fs.writeFile(app,'copy-app');await finish.registerDisposable(app);
    await fs.writeFile(path.join(root,'readback.json'),'unique readback');console.log('ready');setInterval(()=>{},1000);
  `,
        path.resolve('scripts/native-qa-storage.mjs'),
        root,
        JSON.stringify(options(parent)),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (b) => (stderr += b));
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('exit', (code) => reject(Error('Harness exited ' + code + ' ' + stderr)));
    });
    await assert.rejects(recoverQaScratch(root, { storageRoot: options(parent).storageRoot }), /active/);
    await stopQaProcess(child);
    const leaseDir = path.join(options(parent).storageRoot, '.leases');
    const leaseFile = path.join(
      leaseDir,
      (await fs.readdir(leaseDir)).find((name) => name.endsWith('.json')),
    );
    const original = await fs.readFile(leaseFile, 'utf8');
    await fs.writeFile(leaseFile, JSON.stringify({ ...JSON.parse(original), nonce: 'changed' }));
    await assert.rejects(
      recoverQaScratch(root, { storageRoot: options(parent).storageRoot }),
      /lease differs/,
    );
    assert.equal((await fs.stat(path.join(root, 'library/generated.map'))).size, 65536);
    await fs.writeFile(leaseFile, original);
    const recovered = await recoverQaScratch(root, { storageRoot: options(parent).storageRoot });
    assert.equal(recovered.status, 'interrupted');
    assert.equal(recovered.disposedBytes, 65544);
    await assert.rejects(fs.stat(path.join(root, 'temporary.exe')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(root, 'library')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(root, 'readback.json'), 'utf8'), 'unique readback');
  }));

test('runtime budget stops a real owned writer and failed cleanup reclaims its generated bytes', () =>
  fixture(async (parent) => {
    const root = await mkdir(path.join(parent, 'run')),
      finish = await beginQaStorage(root, { ...options(parent), reservationBytes: 128 * 1024 });
    const scratch = await finish.createScratch('library');
    const child = spawn(
      process.execPath,
      [
        '-e',
        `const fs=require('fs');const file=process.argv[1];setInterval(()=>fs.appendFileSync(file,Buffer.alloc(4096,4)),15);`,
        path.join(scratch, 'growth.bin'),
      ],
      { stdio: 'ignore', windowsHide: true },
    );
    await finish.trackProcess(child);
    try {
      for (let i = 0; i < 50 && child.exitCode === null && child.signalCode === null; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await finish.sample();
      }
      assert.ok(child.exitCode !== null || child.signalCode !== null, 'Over-budget child must be stopped');
      await assert.rejects(finish('failed'), /storage budget/);
      const result = JSON.parse(await fs.readFile(path.join(root, 'storage-run.json'), 'utf8'));
      assert.equal(result.status, 'failed');
      assert.ok(result.monitoring.peakLogicalBytes > 128 * 1024);
      assert.ok(result.disposedBytes > 0);
      await assert.rejects(fs.stat(scratch), { code: 'ENOENT' });
    } finally {
      await stopQaProcess(child);
    }
  }));

test('obsolete .local outputs and linked output ancestors are rejected before creation', () =>
  fixture(async (parent) => {
    const obsolete = path.join(parent, '.local', 'next');
    await assert.rejects(assertQaOutputPath(obsolete), /Obsolete/);
    await assert.rejects(fs.stat(path.join(parent, '.local')), { code: 'ENOENT' });
    const real = await mkdir(path.join(parent, 'real')),
      alias = path.join(parent, 'alias');
    await fs.symlink(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(assertQaOutputPath(path.join(alias, 'run')), /links|junctions/);
    const result = spawnSync(process.execPath, ['scripts/cargo.mjs', '--version'], {
      cwd: path.resolve('.'),
      env: { ...process.env, CARGO_TARGET_DIR: obsolete },
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /obsolete .local/i);
    const desktop = spawnSync(process.execPath, ['scripts/desktop.mjs', 'info'], {
      cwd: path.resolve('.'),
      env: { ...process.env, CARGO_TARGET_DIR: obsolete },
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.notEqual(desktop.status, 0);
    assert.match(desktop.stderr, /obsolete .local/i);
    await assert.rejects(fs.stat(path.join(parent, '.local')), { code: 'ENOENT' });
  }));

test('copy admission rejects self copy, generated descendants, links and quota before invoking native helper', () =>
  fixture(async (parent) => {
    const source = await mkdir(path.join(parent, 'source'));
    await fs.writeFile(path.join(source, 'small.weapon'), 'tiny fixture');
    await assert.rejects(safeQaCopy(source, path.join(source, 'nested')), /contain/);
    const alias = path.join(parent, 'alias');
    await fs.symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(safeQaCopy(alias, path.join(parent, 'copied')), /linked/);
    await fs.mkdir(path.join(source, 'artifacts'));
    await fs.writeFile(path.join(source, 'artifacts', 'copy'), 'no');
    await assert.rejects(safeQaCopy(source, path.join(parent, 'copied')), /generated/);
    await fs.rm(path.join(source, 'artifacts'), { recursive: true });
    const prior = process.env.SPARK_QA_COPY_BUDGET_BYTES;
    process.env.SPARK_QA_COPY_BUDGET_BYTES = '4';
    try {
      await assert.rejects(safeQaCopy(source, path.join(parent, 'copied')), /above its/);
    } finally {
      if (prior === undefined) delete process.env.SPARK_QA_COPY_BUDGET_BYTES;
      else process.env.SPARK_QA_COPY_BUDGET_BYTES = prior;
    }
    await assert.rejects(fs.stat(path.join(parent, 'copied')), { code: 'ENOENT' });
  }));
