// One owned operation: compile, test the actual app, then dispose all build,
// browser and native staging output. Optional receipt is an explicit caller
// destination for compact engineering evidence, never a retained build cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { withDevelopmentWorkspace, runDevelopmentCommand } from './native-qa-storage.mjs';
import { checkSourceEntrypoints } from './check-source-entrypoints.mjs';
const [receiptFile, sourceMap, kit, tags, invader, acceptedProject] = process.argv.slice(2);
const stages = (process.env.SPARK_VERIFY_STAGES ?? 'rust,frontend,browser,native').split(',');
if (stages.some((s) => !['rust', 'frontend', 'browser', 'native', 'compiler', 'geometry', 'logic', 'workspace'].includes(s)))
  throw Error('Unknown source-only verification stage');
if (stages.includes('native') && ![sourceMap, kit, tags, invader].every(Boolean))
  throw Error('Native verification requires the selected owned map, kit, small tag source and Invader paths');
if (stages.some(s=>s==='compiler'||s==='geometry'||s==='logic') && ![acceptedProject, kit, tags, invader].every(Boolean))
  throw Error(
    'Compiler verification requires the accepted Workshop project, small tag source, kit and Invader',
  );
if(stages.includes('geometry')&&!(await fs.stat(process.env.SPARK_GEOMETRY_BLENDER??'').catch(()=>null))?.isFile())
  throw Error('Geometry round-trip verification requires the selected installed Blender executable');
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  complete: false,
  stages: [],
  nativeGameplayAccepted: false,
};
try {
  await checkSourceEntrypoints();
  await withDevelopmentWorkspace(
    'source-only-verification',
    async (context) => {
      const run = async (name, args, env = {}) => {
        const started = performance.now();
        await runDevelopmentCommand(process.execPath, args, { ...context, env: { ...context.env, ...env } });
        report.stages.push({ name, milliseconds: Math.round(performance.now() - started) });
      };
      if (stages.includes('rust'))
        await run('Rust workspace', ['scripts/cargo.mjs', 'test', '--workspace', '--locked']);
      if (stages.includes('frontend')) {
        await run('TypeScript', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false']);
        await run('Frontend tests', ['node_modules/vitest/vitest.mjs', 'run']);
        await run('Source module contracts', ['--test', 'scripts/check-source-entrypoints.test.mjs']);
        await run('Offline regressions', ['scripts/frontend-tests.mjs', 'offline']);
        await run('Storage ownership', ['--test', 'scripts/native-qa-storage.test.mjs', 'scripts/repository-health.test.mjs']);
      }
      if (stages.includes('browser'))
        await run('Browser regressions', ['node_modules/@playwright/test/cli.js', 'test', '--reporter=line']);
      let tagSource=tags;
      if (stages.includes('compiler')||stages.includes('geometry')||stages.includes('logic')) {
        if(tags.toLowerCase().endsWith('.7z')){
          const spec=JSON.parse(await fs.readFile(new URL('../docs/fixtures/source-only-h1a-inputs.json',import.meta.url),'utf8'));
          const hash=async file=>{const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');};
          if(spec.tagFiles.length>2048||spec.logicalTagBytes>128*1024**2||(await fs.stat(tags)).size!==spec.sourceArchive.bytes||await hash(tags)!==spec.sourceArchive.sha256)
            throw Error('The selected native SDK archive does not match the verified dependency manifest');
          for(const row of spec.tagFiles)if(!row.path||row.path.startsWith('/')||/[\\:\r\n\0]/.test(row.path)||row.path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('Unsafe SDK dependency path');
          const sdk=path.join(context.directory,'sdk-input');await fs.mkdir(sdk);
          const list=path.join(context.directory,'sdk-files.txt');await fs.writeFile(list,spec.tagFiles.map(row=>'tags/'+row.path).join('\n')+'\n');
          await runDevelopmentCommand('tar.exe',['-xf',path.resolve(tags),'-C',sdk,'-T',list],context);
          tagSource=path.join(sdk,'tags');
          for(const row of spec.tagFiles){const file=path.join(tagSource,row.path),info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.size!==row.bytes||await hash(file)!==row.sha256)throw Error('Source SDK tag differs from verified native input: '+row.path);}
          report.disposableSdk={files:spec.tagFiles.length,logicalBytes:spec.logicalTagBytes,sourceArchiveSha256:spec.sourceArchive.sha256,originalArchiveUnchanged:await hash(tags)===spec.sourceArchive.sha256,retainedSdkTree:false};
          if(!report.disposableSdk.originalArchiveUnchanged)throw Error('Original SDK archive changed');
        }
      }
      if (stages.includes('compiler')) {
        await run('Native storage helper build', [
          'scripts/cargo.mjs',
          'build',
          '-p',
          'spark-core',
          '--example',
          'qa_native_storage',
          '--release',
          '--locked',
        ]);
        const output = path.join(context.directory, 'qa', 'compiler');
        await fs.mkdir(path.dirname(output), { recursive: true });
        try {
          await run('Real H1A compile, unchanged reuse, external corruption recovery and native readback', [
            'scripts/test-native-storage.mjs',
            acceptedProject,
            tagSource,
            kit,
            invader,
            output,
          ]);
        } finally {
          for (const name of ['acceptance.json', 'process.json']) {
            const text = await fs.readFile(path.join(output, name), 'utf8').catch(() => null);
            if (text) report[name] = JSON.parse(text);
          }
        }
      }
      if(stages.includes('compiler')){
        const requested=Number(process.env.SPARK_VERIFY_FINISHED_JOBS??'2');
        if(!Number.isInteger(requested)||requested<2||requested>10)throw Error('Independent native completion acceptance requires 2..10 jobs');
        report.independentNativeJobs=[report['acceptance.json']?.build,report['acceptance.json']?.externalEdit?.editedBuild];
        if(report.independentNativeJobs.some(build=>build?.status!=='validated'))throw Error('Initial independent native jobs are incomplete');
        while(report.independentNativeJobs.length<requested){
          const index=report.independentNativeJobs.length+1,output=path.join(context.directory,'qa','fresh-native-'+index);
          await run('Independent completed native compile '+index,[
            'scripts/test-native-storage.mjs',acceptedProject,tagSource,kit,invader,output,
          ],{SPARK_QA_BUILD_ONLY:'1'});
          const receipt=JSON.parse(await fs.readFile(path.join(output,'fresh-build.json'),'utf8'));
          if(!receipt.nativeCompilation||receipt.build?.status!=='validated')throw Error('Fresh native job failed validation');
          report.independentNativeJobs.push(receipt.build);
        }
        if(new Set(report.independentNativeJobs.map(build=>build.id)).size!==requested)throw Error('Native jobs were reused instead of completed independently');
        report.independentNativeJobsCompleted=requested;
      }
      if (stages.includes('native')||stages.includes('geometry')||stages.includes('logic')||stages.includes('workspace'))
        await run('Embedded desktop build', ['scripts/desktop.mjs', 'build', '--no-bundle']);
      if (stages.includes('native')) {
        const hash = async (file) =>
          crypto
            .createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex');
        report.sourceMapSha256 = await hash(sourceMap);
        const output = path.join(context.directory, 'qa', 'logic');
        await fs.mkdir(path.dirname(output), { recursive: true });
        // Storage acceptance reuses the previously accepted bounded map edit/export
        // route. The unfinished C71 object/behavior initiative is a separate gate.
        try {
          await run(
            'Native map edit, Undo, Save, export and readback',
            [
              'scripts/test-workspace-lifecycle-native.mjs',
              path.join(context.env.CARGO_TARGET_DIR, 'release', 'GuiltySpark.exe'),
              output,
              path.resolve(sourceMap),
              path.resolve(invader),
            ],
            {
              SPARK_LIFECYCLE_LOGIC: '0',
              SPARK_LIFECYCLE_NATIVE_ONLY: '1',
            },
          );
        } finally {
          const receipt = await fs.readFile(path.join(output, 'acceptance.json'), 'utf8').catch(() => null);
          if (receipt) report.native = JSON.parse(receipt);
          report.originalSourceUnchanged = (await hash(sourceMap)) === report.sourceMapSha256;
        }
        if (!report.native.complete) throw Error('Actual native acceptance did not pass');
        if ((await hash(sourceMap)) !== report.sourceMapSha256) throw Error('Original source changed');
      }
      if(stages.includes('workspace')){
        const output=path.join(context.directory,'qa','native-workspaces');await fs.mkdir(path.dirname(output),{recursive:true});
        try{
          await run('Actual retained multiwindow workspace lifecycle and route regressions',[
            'scripts/test-workspace-lifecycle-native.mjs',path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,
          ],{SPARK_LIFECYCLE_NATIVE_ONLY:'0',SPARK_LIFECYCLE_GEOMETRY:'0',SPARK_LIFECYCLE_LOGIC:'0',SPARK_LIFECYCLE_LAUNCH_ONLY:'0',SPARK_LIFECYCLE_MEMORY:'0',SPARK_LIFECYCLE_REPEAT_EDITS:'',SPARK_LIFECYCLE_PROFILE:'0'});
        }finally{const receipt=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(receipt)report.workspace=JSON.parse(receipt);}
        if(!report.workspace?.complete)throw Error('Actual native workspace lifecycle did not pass');
      }
      if(stages.includes('geometry')){
        const output=path.join(context.directory,'qa','geometry');await fs.mkdir(path.dirname(output),{recursive:true});
        try{
          await run('Actual Blender handoff, reconciliation, native model/collision build and independent readback',[
            'scripts/test-workspace-lifecycle-native.mjs',path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,'-',path.resolve(invader),
          ],{
            SPARK_LIFECYCLE_GEOMETRY:'1',SPARK_LIFECYCLE_NATIVE_ONLY:'0',SPARK_LIFECYCLE_LOGIC:'0',SPARK_LIFECYCLE_MEMORY:'0',
            SPARK_LIFECYCLE_REPEAT_EDITS:'',SPARK_LIFECYCLE_PROFILE:'0',SPARK_GEOMETRY_TAGS:path.resolve(tagSource),SPARK_GEOMETRY_KIT:path.resolve(kit),
          });
        }finally{const receipt=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(receipt)report.geometry=JSON.parse(receipt);}
        if(!report.geometry?.complete)throw Error('Actual DCC/native round trip did not pass');
      }
      if(stages.includes('logic')){
        const cache=report['acceptance.json']?.externalEdit?.editedBuild?.output??sourceMap;
        if(!cache)throw Error('Native object/logic acceptance requires a compiled donor cache with the standard door');
        const output=path.join(context.directory,'qa','native-logic');await fs.mkdir(path.dirname(output),{recursive:true});
        try{
          await run('Actual native tag edit, asset drop, door/trigger logic, Undo/Save/reopen, compile and independent readback',[
            'scripts/test-workspace-lifecycle-native.mjs',path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,path.resolve(cache),path.resolve(invader),
          ],{SPARK_LIFECYCLE_LOGIC:'1',SPARK_LIFECYCLE_NATIVE_ONLY:'0',SPARK_LIFECYCLE_GEOMETRY:'0',SPARK_LIFECYCLE_MEMORY:'0',
             SPARK_LIFECYCLE_REPEAT_EDITS:'',SPARK_LIFECYCLE_PROFILE:'0',SPARK_LOGIC_TAGS:path.resolve(tagSource),SPARK_LOGIC_KIT:path.resolve(kit)});
        }finally{
          const receipt=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(receipt)report.logic=JSON.parse(receipt);
          if(receiptFile)for(const name of ['logic-inspector.png','failure-window-0.png']){
            const source=path.join(output,name),stat=await fs.stat(source).catch(()=>null);
            if(stat?.isFile()&&stat.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),'c71-'+name);await fs.copyFile(source,target);(report.logicScreenshots??=[]).push({file:target,bytes:stat.size});}
          }
        }
        if(!report.logic?.complete)throw Error('Actual native object/logic acceptance did not pass');
      }
    },
    {
      reservationBytes: stages.some((s) => s === 'rust' || s === 'native' || s === 'compiler' || s === 'geometry' || s === 'logic' || s === 'workspace')
        ? 12 * 1024 ** 3
        : 1024 ** 3,
    },
  );
  report.complete = true;
} catch (error) {
  report.error = String(error);
  console.error(String(error));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  if (receiptFile) {
    const file = path.resolve(receiptFile);
    if ((await fs.stat(file).catch(() => null))?.size > 2 * 1024 ** 2)
      throw Error('Refusing to replace a large unrelated receipt');
    await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify({ complete: report.complete, stages: report.stages, error: report.error }));
}
