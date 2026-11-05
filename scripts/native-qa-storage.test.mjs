import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
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
} from './native-qa-storage.mjs';
import { prepareDesktopArguments } from './desktop.mjs';
import { safeQaCopy } from './qa-safe-copy.mjs';

test('inline owned operations record their actual origin and clean their disposable output', () => {
  const env={...process.env};
  for(const name of ['CARGO_TARGET_DIR','SPARK_BUILD_WORKSPACE','SPARK_BUILD_NONCE','SPARK_GENERATED_ROOT','SPARK_QA_STORAGE_ROOT'])delete env[name];
  const source=new URL('./native-qa-storage.mjs',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs/promises';import {withDevelopmentWorkspace} from ${JSON.stringify(source)};await withDevelopmentWorkspace('inline-regression',async c=>{await fs.writeFile(c.directory+'/probe.txt','bounded inline operation');},{reservationBytes:8*1024**2});`],{env,encoding:'utf8',windowsHide:true});
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
