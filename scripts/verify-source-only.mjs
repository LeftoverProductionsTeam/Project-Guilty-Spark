// One owned operation: compile, test the actual app, then dispose all build,
// browser and native staging output. Optional receipt is an explicit caller
// destination for compact engineering evidence, never a retained build cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withDevelopmentWorkspace, runDevelopmentCommand, exportDevelopmentBuild } from './native-qa-storage.mjs';
import { checkSourceEntrypoints } from './check-source-entrypoints.mjs';
const [receiptFile, sourceMap, kit, tags, invader, acceptedProject] = process.argv.slice(2);
const stages = (process.env.SPARK_VERIFY_STAGES ?? 'rust,frontend,browser,native').split(',');
if (stages.some((s) => !['rust', 'frontend', 'browser', 'native', 'compiler', 'geometry', 'logic', 'workspace', 'runtime', 'baseline', 'sparklink'].includes(s)))
  throw Error('Unknown source-only verification stage');
if (stages.includes('native') && ![sourceMap, kit, tags, invader].every(Boolean))
  throw Error('Native verification requires the selected owned map, kit, small tag source and Invader paths');
if (stages.some(s=>s==='compiler'||s==='geometry'||s==='logic') && ![acceptedProject, kit, tags, invader].every(Boolean))
  throw Error(
    'Compiler verification requires the accepted Workshop project, small tag source, kit and Invader',
  );
if(stages.includes('sparklink')&&![kit,tags,invader].every(Boolean))throw Error('Shared-source acceptance requires the selected owned kit, bounded tags and Invader');
if(stages.includes('geometry')&&!(await fs.stat(process.env.SPARK_GEOMETRY_BLENDER??'').catch(()=>null))?.isFile())
  throw Error('Geometry round-trip verification requires the selected installed Blender executable');
// Explicitly selected QA executables may be reused only against the same full
// runtime-source fingerprint. Test-script repairs do not need a second compiler
// tree; production code changes invalidate reuse instead of testing stale UI.
async function runtimeFingerprint(){
 const names=[...new Set(execFileSync('git',['ls-files','-coz','--exclude-standard','--','src','src-tauri','crates','public','Cargo.toml','Cargo.lock','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','index.html','scripts/build-web.mjs','scripts/desktop.mjs','scripts/cargo.mjs'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean))].sort();
 const hash=crypto.createHash('sha256');for(const name of names){const info=await fs.lstat(name);if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe runtime source fingerprint input');hash.update(name+'\0');hash.update(await fs.readFile(name));}return hash.digest('hex');
}
const selectedApp=process.env.SPARK_VERIFY_REUSE_APP?path.resolve(process.env.SPARK_VERIFY_REUSE_APP):null;
if(selectedApp){
 const manifest=JSON.parse(await fs.readFile(path.join(path.dirname(selectedApp),'manifest.json'),'utf8'));
 const file=manifest.files.find(file=>file.file===path.basename(selectedApp));
 if(!file||file.bytes!==(await fs.stat(selectedApp)).size||file.sha256!==crypto.createHash('sha256').update(await fs.readFile(selectedApp)).digest('hex')||manifest.runtimeSourceFingerprint!==await runtimeFingerprint())throw Error('Selected QA executable does not match its binary and current runtime-source identities');
}
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
      if (stages.includes('compiler')||stages.includes('geometry')||stages.includes('logic')||stages.includes('sparklink')) {
        // The CE collaboration path recovers its own native source closure;
        // it never consumes the MCC SDK tag argument. Other native stages do.
        const ceOnlyShared=stages.includes('sparklink')&&process.env.SPARK_QA_SHARED_CHUPATHINGY==='1'&&!stages.some(stage=>['compiler','geometry','logic'].includes(stage));
        if(ceOnlyShared)report.disposableSdk={staged:false,reason:'CE shared-source fixture uses its independently recovered native source, not MCC SDK tags'};
        if(tags.toLowerCase().endsWith('.7z')&&!ceOnlyShared){
          const spec=JSON.parse(await fs.readFile(new URL('../docs/fixtures/source-only-h1a-inputs.json',import.meta.url),'utf8'));
          if(stages.includes('logic')&&process.env.SPARK_LOGIC_GAME_REVIEW==='1'){
            const shell=JSON.parse(await fs.readFile(new URL('../docs/fixtures/h1a-standalone-shell-inputs.json',import.meta.url),'utf8'));
            if(JSON.stringify(shell.sourceArchive)!==JSON.stringify(spec.sourceArchive))throw Error('Standalone shell uses a different SDK archive');
            const rows=new Map(spec.tagFiles.map(row=>[row.path,row]));
            for(const row of shell.tagFiles){const old=rows.get(row.path);if(old&&JSON.stringify(old)!==JSON.stringify(row))throw Error('Conflicting native source manifests');rows.set(row.path,row);}
            spec.tagFiles=[...rows.values()];spec.logicalTagBytes=spec.tagFiles.reduce((n,row)=>n+row.bytes,0);
          }
          const hash=async file=>{const digest=crypto.createHash('sha256');for await(const chunk of createReadStream(file))digest.update(chunk);return digest.digest('hex');};
          if(spec.tagFiles.length>4096||spec.logicalTagBytes>128*1024**2||(await fs.stat(tags)).size!==spec.sourceArchive.bytes||await hash(tags)!==spec.sourceArchive.sha256)
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
      if(stages.includes('baseline')){
        if(![kit,tags,invader].every(Boolean))throw Error('Baseline requires the owner-installed SDK archive, kit and Invader');
        const {nativeStandaloneBaseline}=await import('./native-standalone-baseline.mjs');report.standaloneBaseline={};
        await nativeStandaloneBaseline({context,archive:tags,kit,invader,report:report.standaloneBaseline});
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
      if(stages.includes('logic'))for(const file of ['scripts/native-logic-roundtrip.mjs','scripts/test-workspace-lifecycle-native.mjs'])
        await run('Native acceptance syntax '+file,['--check',file]);
      if (stages.includes('native')||stages.includes('geometry')||stages.includes('logic')||stages.includes('workspace')||stages.includes('runtime')||stages.includes('sparklink')){
        if(!selectedApp){
          const beforeBuild=await runtimeFingerprint();
          await run('Embedded desktop build', ['scripts/desktop.mjs', 'build', '--no-bundle']);
          if(beforeBuild!==await runtimeFingerprint())throw Error('Runtime source changed during the embedded build; do not export or accept a mixed-revision application');
        }
        else report.reusedQaApplication={file:selectedApp,sha256:crypto.createHash('sha256').update(await fs.readFile(selectedApp)).digest('hex'),runtimeSourceFingerprint:await runtimeFingerprint()};
        if(process.env.SPARK_VERIFY_EXPORT_QA_APP){
          const target=path.resolve(process.env.SPARK_VERIFY_EXPORT_QA_APP);
          const manifest=await exportDevelopmentBuild(path.join(context.env.CARGO_TARGET_DIR,'release'),target);
          manifest.runtimeSourceFingerprint=await runtimeFingerprint();manifest.purpose='One temporary source-pinned QA executable; not a release';
          await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});report.exportedQaApplication={directory:target,...manifest};
        }
      }
      if(stages.includes('sparklink')){
        // Rebuild only the small frontend in this owned workspace so native
        // WebView served-source hashes can be compared with the exact source.
        if(selectedApp)await run('Shared-source frontend identity', ['scripts/build-web.mjs']);
        const output=path.join(context.directory,'qa','sparklink');await fs.mkdir(path.dirname(output),{recursive:true});
        try{await run('Three independent Spark processes: shared BSP, conflict, Undo, recovery and frozen native compile',[
          'scripts/test-sparklink-workshop-native.mjs',selectedApp??path.join(context.env.CARGO_TARGET_DIR,'release/GuiltySpark.exe'),output,path.resolve(kit),path.resolve(tagSource),path.resolve(invader),
        ]);}finally{
          const file=['acceptance.json','failure.json','progress.json'].map(name=>path.join(output,name));
          for(const candidate of file){const text=await fs.readFile(candidate,'utf8').catch(()=>null);if(text){report.sparklink=JSON.parse(text);break;}}
          const guard=await fs.readFile(path.join(output,'storage-run.json'),'utf8').then(JSON.parse).catch(()=>null);
          if(guard)report.sparklinkStorage={active:guard.active,status:guard.status,reservedBytes:guard.reservedBytes,peakLogicalBytes:guard.monitoring?.peakLogicalBytes,postCleanup:guard.postCleanup,evidenceOverBudget:guard.evidenceOverBudget,error:guard.monitoring?.error??null};
          if(receiptFile)for(const imageName of [...['owner','editor-b','editor-c'].map(actor=>`native-sparklink-${actor}.png`),...['owner','editor-b','editor-c'].map(actor=>`native-shared-content-${actor}.png`),...['owner','editor-b','editor-c'].map(actor=>`native-shared-recovered-${actor}.png`),'native-dedicated-ready.png','native-dedicated-two-clients.png','native-dedicated-live-rebuild.png','native-dedicated-live-rebuild-rejected.png','native-dedicated-native-compiler-rejected.png','native-dedicated-native-prerequisite-rejected.png','native-dedicated-primary-failure.png','native-dedicated-source-race.png','native-dedicated-rollback.png','native-interrupted-number-field.png','native-workshop-axis-floor.png','native-workspace-scroll.png',...[[800,600],[1500,950],[3440,1440],[5120,1440]].map(([w,h])=>`native-dedicated-active-${w}x${h}.png`)]){
            const image=path.join(output,imageName),info=await fs.stat(image).catch(()=>null);
            if(info?.isFile()&&info.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+path.basename(image));await fs.copyFile(image,target,fs.constants.COPYFILE_EXCL);(report.sparklinkScreenshots??=[]).push({file:target,bytes:info.size});}
          }
        }
        if(!report.sparklink?.complete)throw Error('Real shared-source native acceptance did not pass');
      }
      if(stages.includes('runtime')){
        if(!process.env.SPARK_TEST_RUNTIME_ROOT)throw Error('Runtime acceptance needs the explicitly selected owned runtime folder');
        const output=path.join(context.directory,'qa','runtime');await fs.mkdir(path.dirname(output),{recursive:true});
        try{await run('Actual runtime profiles, shared native folders and CE requirements',[
          'scripts/test-runtime-content-native.mjs',selectedApp??path.join(context.env.CARGO_TARGET_DIR,'release/GuiltySpark.exe'),output,process.env.SPARK_TEST_RUNTIME_ROOT]);}
        finally{
          const text=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(text)report.runtimeContent=JSON.parse(text);
          if(receiptFile)for(const name of ['runtime-failure.png','native-dedicated-empty.png','native-dedicated-primary-failure.png']){
            const file=path.join(output,name),info=await fs.stat(file).catch(()=>null);if(info?.isFile()&&info.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+name);await fs.copyFile(file,target,fs.constants.COPYFILE_EXCL);(report.runtimeScreenshots??=[]).push({file:target,bytes:info.size});}
          }
        }
      }
      if (stages.includes('native')) {
        const hash = async (file) =>
          crypto
            .createHash('sha256')
            .update(await fs.readFile(file))
            .digest('hex');
        report.sourceMapSha256 = await hash(sourceMap);
        const output = path.join(context.directory, 'qa', 'logic');
        await fs.mkdir(path.dirname(output), { recursive: true });
        let audioMeter=process.env.SPARK_LIFECYCLE_AUDIO_METER;
        if(audioMeter==='auto'){
          if(process.platform!=='win32')throw Error('The owned Windows audio meter needs Windows');
          audioMeter=path.join(context.directory,'owned-audio-meter.exe');
          const csc=path.join(process.env.SystemRoot??'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
          await runDevelopmentCommand(csc,['/nologo','/r:System.Management.dll','/r:System.Web.Extensions.dll','/out:'+audioMeter,path.resolve('scripts/measure-owned-audio-output.cs')],context);
          report.audioMeter={kind:'Owned-process Windows output peaks only',microphoneOrSampleCapture:false};
        }
        // Storage acceptance reuses the previously accepted bounded map edit/export
        // route. The unfinished C71 object/behavior initiative is a separate gate.
        try {
          await run(
            process.env.SPARK_LIFECYCLE_VEHICLES==='1'?'Native vehicle preview and source UV readback':'Native map edit, Undo, Save, export and readback',
            [
              'scripts/test-workspace-lifecycle-native.mjs',
              selectedApp??path.join(context.env.CARGO_TARGET_DIR, 'release', 'GuiltySpark.exe'),
              output,
              path.resolve(sourceMap),
              path.resolve(invader),
            ],
            {
              SPARK_LIFECYCLE_LOGIC: '0',
              SPARK_LIFECYCLE_NATIVE_ONLY: '1',
              SPARK_LOGIC_CROSS_RUNTIME: '0', SPARK_QA_MEGAWORLD_ONLY: '0',
              ...(audioMeter?{SPARK_LIFECYCLE_AUDIO_METER:audioMeter}:{}),
            },
          );
        } finally {
          const receipt = await fs.readFile(path.join(output, 'acceptance.json'), 'utf8').catch(() => null);
          if (receipt) report.native = JSON.parse(receipt);
          report.originalSourceUnchanged = (await hash(sourceMap)) === report.sourceMapSha256;
          if(receiptFile)for(const name of ['owned-native-bsp.png','native-context-materials.png','native-context-reflection.png','native-context-collision.png','native-context-sound.png','native-vehicle-warthog.png','native-vehicle-original-mip.png','native-mcc-unaligned-bitmap.png','native-vehicle-world-warthog.png','native-vehicle-world-closeup.png','native-vehicle-world-restored.jpg','native-vehicle-scorpion.png','native-vehicle-rwarthog.png','native-tag-animation.png','native-machinima-greenscreen.png','failure-window-0.png']){
            const file=path.join(output,name),stat=await fs.stat(file).catch(()=>null);if(stat?.isFile()&&stat.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+name);await fs.copyFile(file,target,fs.constants.COPYFILE_EXCL);(report.nativeScreenshots??=[]).push({file:target,bytes:stat.size});}
          }
        }
        if (!report.native.complete) throw Error('Actual native acceptance did not pass');
        if ((await hash(sourceMap)) !== report.sourceMapSha256) throw Error('Original source changed');
      }
      if(stages.includes('workspace')){
        const output=path.join(context.directory,'qa','native-workspaces');await fs.mkdir(path.dirname(output),{recursive:true});
        try{
          await run(process.env.SPARK_LIFECYCLE_WALKTHROUGH==='1'?'Actual native17-step guided walkthrough, Settings toggle and full restart':process.env.SPARK_LIFECYCLE_PROJECT_SWITCH==='1'?'Actual native saved-project, history, ownership, restart and menu regressions':process.env.SPARK_LIFECYCLE_RESPONSIVE==='1'?'Actual native responsive layouts and saved OpenCE setup':'Actual retained multiwindow workspace lifecycle and route regressions',[
            'scripts/test-workspace-lifecycle-native.mjs',selectedApp??path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,
          ],{SPARK_LIFECYCLE_NATIVE_ONLY:'0',SPARK_LIFECYCLE_GEOMETRY:'0',SPARK_LIFECYCLE_LOGIC:'0',SPARK_LIFECYCLE_LIVE_REBUILD:'0',SPARK_LIFECYCLE_LAUNCH_ONLY:process.env.SPARK_LIFECYCLE_RESPONSIVE==='1'||process.env.SPARK_LIFECYCLE_PROJECT_SWITCH==='1'?'1':'0',SPARK_LIFECYCLE_MEMORY:'0',SPARK_LIFECYCLE_REPEAT_EDITS:'',SPARK_LIFECYCLE_PROFILE:'0',SPARK_LOGIC_CROSS_RUNTIME:'0',SPARK_QA_MEGAWORLD_ONLY:'0',SPARK_QA_MEGAWORLD_COMPILE:'0'});
        }finally{const receipt=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(receipt)report.workspace=JSON.parse(receipt);
        if(receiptFile){
          for(const name of ['native-walkthrough-enabled.png','native-walkthrough-start.png','native-walkthrough-finish.png','native-project-picker-800x600.png','native-project-picker-1280x720.png','native-project-picker-1366x768.png','native-project-picker-1500x950.png','native-project-picker-1920x1080.png','native-project-picker-2560x1080.png','native-project-picker-3440x1440.png','native-project-picker-5120x1440.png','project-picker-after.png','project-draft-after.png','project-restart-after.png','native-workspace-scroll-before-restart.png','native-workspace-scroll-after-restart.png','physical-input-after.png','application-icon.png','native-studio-theme.png','native-setup-flavors-800x600.png','native-setup-flavors-1500x950.png','native-setup-flavors-2560x1080.png','native-setup-flavors-5120x1440.png','native-games-tools-800x600.png','native-games-tools-1500x950.png','native-games-tools-2560x1080.png','native-games-tools-5120x1440.png','native-layout-failure.png','compact-header.png','tab-lift.png','monitor-pink.png','monitor-glow.png','monitor-source.png','monitor-source.json','failure-window-0.png','failure-window-1.png','failure-window-2.png']){
            const image=path.join(output,name),stat=await fs.stat(image).catch(()=>null);
            if(stat?.isFile()&&stat.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+path.basename(name));await fs.copyFile(image,target);(report.workspaceScreenshots??=[]).push({file:target,bytes:stat.size});if(name==='compact-header.png')report.workspaceScreenshot={file:target,bytes:stat.size};}
          }
        }}
        if(!report.workspace?.complete)throw Error('Actual native workspace lifecycle did not pass');
      }
      if(stages.includes('geometry')){
        const output=path.join(context.directory,'qa','geometry');await fs.mkdir(path.dirname(output),{recursive:true});
        try{
          await run('Actual Blender handoff, reconciliation, native model/collision build and independent readback',[
            'scripts/test-workspace-lifecycle-native.mjs',selectedApp??path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,'-',path.resolve(invader),
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
          await run(process.env.SPARK_QA_MEGAWORLD_ONLY==='1'?'Actual MegaWorld File/New, source-bound donor controls, restart, Undo/Save and source clearance':process.env.SPARK_LOGIC_CROSS_RUNTIME==='1'?'Actual CE-to-MCC native asset catalog, drag, edit, Undo/Save/restart, compile and independent readback':'Actual native tag edit, asset drop, door/trigger logic, Undo/Save/reopen, compile and independent readback',[
            'scripts/test-workspace-lifecycle-native.mjs',selectedApp??path.join(context.env.CARGO_TARGET_DIR,'release','GuiltySpark.exe'),output,path.resolve(cache),path.resolve(invader),
          ],{SPARK_LIFECYCLE_LOGIC:'1',SPARK_LIFECYCLE_NATIVE_ONLY:'0',SPARK_LIFECYCLE_GEOMETRY:'0',SPARK_LIFECYCLE_MEMORY:'0',SPARK_LIFECYCLE_RESPONSIVE:'0',SPARK_LIFECYCLE_SETUP_FLAVORS:'0',SPARK_LIFECYCLE_LAUNCH_ONLY:'0',
             SPARK_LIFECYCLE_REPEAT_EDITS:'',SPARK_LIFECYCLE_PROFILE:'0',SPARK_LOGIC_TAGS:path.resolve(tagSource),SPARK_LOGIC_KIT:path.resolve(kit)});
        }finally{
          const receipt=await fs.readFile(path.join(output,'acceptance.json'),'utf8').catch(()=>null);if(receipt)report.logic=JSON.parse(receipt);
          if(receiptFile&&report.logic?.complete&&report.logic?.liveRebuild?.nativeChangedSpawnObserved){
            const trial=report.logic.liveRebuild,build=trial.builds.find(build=>build.id===trial.rebuiltSession.gameBuildId);
            if(!build?.output||build.sha256!==trial.rebuiltSession.gameSha256)throw Error('Accepted Live Rebuild output identity is missing');
            const info=await fs.stat(build.output);if(!info.isFile()||info.size>256*1024**2)throw Error('Accepted native cache exceeds bounded evidence export');
            const sha=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
            if(await sha(build.output)!==build.sha256)throw Error('Accepted Live Rebuild cache changed before export');
            const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-validated.map');
            await fs.copyFile(build.output,target,fs.constants.COPYFILE_EXCL);if(await sha(target)!==build.sha256)throw Error('Accepted Live Rebuild cache export differs');
            report.liveRebuildNativeCache={file:target,bytes:info.size,sha256:build.sha256,purpose:'One accepted native cache for independent review and pending human playtest'};
          }
          if(receiptFile&&(report.logic?.crossRuntime||report.logic?.megaWorldCreation)){
            for(const name of ['cross-runtime-1-preview.png','cross-runtime-1-drag.png','cross-runtime-1-placed.png','cross-runtime-2-preview.png','cross-runtime-2-drag.png','cross-runtime-2-placed.png','megaworld-source-check.png','megaworld-imported-scenery.png','megaworld-source-tags-before.png','megaworld-source-tags-after.png','megaworld-source-tags-restarted.png','megaworld-source-tags-updated-import.png','megaworld-seam-closeup.png','megaworld-chupathingy-target.png','megaworld-shared-viewport.png','megaworld-compiled-routes.png','megaworld-chupathingy-loaded.png','megaworld-atlas-layout.png','runtime-catalog-tools.png','runtime-catalog-file.png','runtime-catalog-build.png','native-output/cross-runtime-1.map','native-output/timberland.map']){
              const source=path.join(output,name),info=await fs.stat(source).catch(()=>null);if(!info)continue;
              if(!info.isFile()||info.size>(name.endsWith('.map')?256:4)*1024**2)throw Error('Selected native acceptance evidence exceeds its bounded export');
              const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+path.basename(name));
              await fs.copyFile(source,target,fs.constants.COPYFILE_EXCL);const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
              const sha256=await hash(source);if(await hash(target)!==sha256)throw Error('Native evidence export readback differs');(report.crossRuntimeEvidence??=[]).push({file:target,bytes:info.size,sha256});
            }
          }
          if(receiptFile)for(const [index,source]of (report.logic?.megaWorldCreation?.failedSourceFiles??[]).entries()){
            if(index>=1||source.bytes>16*1024**2)throw Error('Failed native source diagnostic exceeded its one-file bound');
            const bytes=await fs.readFile(source.file);if(bytes.length!==source.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('Failed native source changed before diagnostic export');
            const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-native-source.jms');await fs.writeFile(target,bytes,{flag:'wx'});(report.nativeSourceDiagnostics??=[]).push({file:target,bytes:bytes.length,sha256:source.sha256});
          }
          if(receiptFile)for(const name of ['native-dedicated-800x600.png','native-dedicated-1500x950.png','native-dedicated-3440x1440.png','native-dedicated-5120x1440.png','native-dedicated-ready.png','native-dedicated-two-clients.png','logic-inspector.png','native-lighting-baked.png','live-rebuild-first.png','live-rebuild-updated.png','failure-window-0.png']){
            const source=path.join(output,name),stat=await fs.stat(source).catch(()=>null);
            if(stat?.isFile()&&stat.size<=4*1024**2){const target=path.join(path.dirname(path.resolve(receiptFile)),path.basename(receiptFile,'.json')+'-'+path.basename(name));await fs.copyFile(source,target);(report.logicScreenshots??=[]).push({file:target,bytes:stat.size});}
          }
        }
        if(!report.logic?.complete)throw Error('Actual native object/logic acceptance did not pass');
      }
    },
    {
      reservationBytes: stages.some((s) => s === 'rust' || s === 'native' || s === 'compiler' || s === 'geometry' || s === 'logic' || s === 'workspace' || s === 'runtime' || s === 'sparklink')
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
