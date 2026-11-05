// Real native tag edits through installed Invader, using the existing QA owner
// and the exact Windows physical scanner used for the repository baseline.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {assertQaOutputPath,beginQaStorage,recoverQaScratch,stopQaProcess} from './native-qa-storage.mjs';
const self=fileURLToPath(import.meta.url),worker=process.argv[2]==='--worker';
const [sourceArg,invaderArg,meterArg,outputArg,indexArg]=process.argv.slice(worker?3:2);
if(!outputArg)throw Error('test-native-qa-retention <owned pistol.weapon> <Invader> <physical meter.exe> <fresh-output>');
const source=path.resolve(sourceArg),invader=path.resolve(invaderArg),meter=path.resolve(meterArg),root=path.resolve(outputArg);
const run=promisify(execFile),hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const tool=path.join(invader,'invader-edit.exe'),appSha256=await hash(tool);
if(worker){
  await fs.mkdir(root);
  const finish=await beginQaStorage(root,{workflow:'native-qa-retention',appSha256,reservationBytes:8*1024**2});
  try {
  const scratch=await finish.createScratch('tags');
  const native='weapons/pistol/pistol.weapon',file=path.join(scratch,native);
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(source,file,fs.constants.COPYFILE_EXCL);
  await fs.chmod(file,0o600); // Only this independent copy; original stays sealed.
  const value=Number((.3+Number(indexArg)*.001).toFixed(3));
  for(const args of [['-t',scratch,'-S','bounding_radius',String(value),native],['-t',scratch,'-G','bounding_radius',native]]){
    const pending=run(tool,args,{windowsHide:true,timeout:30000});await finish.trackProcess(pending.child);
    const result=await pending;if(args.includes('-G'))assert.equal(Number(result.stdout.trim()),value);
  }
  await fs.writeFile(path.join(root,'native-readback.json'),JSON.stringify({value,editedSha256:await hash(file),sourceSha256:await hash(source),nativeTool:tool}));
  console.log('READY');
  // The supervisor either requests completion or deliberately kills this real
  // owner after the native tool exits, exercising durable interrupted recovery.
  const outcome=await new Promise(resolve=>process.stdin.once('data',data=>resolve(String(data).trim())));
  await finish(outcome);process.exit(0);
  } catch(error) {
    await fs.writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error).slice(0,16384),nativeGameplayAccepted:false}));
    try {await finish('failed');} catch(cleanup) {console.error('Cleanup retained unresolved evidence:',String(cleanup));}
    throw error;
  }
}
await fs.mkdir(await assertQaOutputPath(root,{reservationBytes:64*1024**2}));
await fs.mkdir(path.join(root,'physical'),{recursive:true});
const samples=[];
async function physical(phase){
  const file=path.join(root,'physical',`${String(samples.length).padStart(3,'0')}-${phase}.jsonl`);
  await run(meter,[root,file],{windowsHide:true,timeout:30000});
  const row=(await fs.readFile(file,'utf8')).trim().split('\n').map(line=>JSON.parse(line)).find(row=>row.type==='root-summary');
  assert.equal(row.errors,0);const result={phase,allocatedBytes:row.uniqueAllocatedFileBytes,files:row.files};samples.push(result);return result;
}
const sourceSha256=await hash(source),cycles=[];await physical('start');
for(let index=1;index<=20;index++){
  const directory=path.join(root,`cycle-${String(index).padStart(2,'0')}`);
  const child=spawn(process.execPath,[self,'--worker',source,invader,meter,directory,String(index)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr+=data);
  await new Promise((resolve,reject)=>{child.stdout.once('data',data=>String(data).includes('READY')?resolve():reject(Error('Unexpected worker output')));child.once('exit',code=>reject(Error('Native cycle failed '+code+' '+stderr)));});
  const peak=await physical(`cycle-${index}-generated`);
  let outcome;
  if(index%5===0){await stopQaProcess(child);await recoverQaScratch(directory);outcome='interrupted';}
  else{outcome=index%7===0?'failed':'passed';const exited=new Promise(resolve=>child.once('exit',code=>resolve(code)));child.stdin.end(outcome);assert.equal(await exited,0,stderr);}
  const record=JSON.parse(await fs.readFile(path.join(directory,'storage-run.json'),'utf8'));
  assert.equal(record.status,outcome);assert.ok(record.disposedBytes>=2978);
  await assert.rejects(fs.stat(path.join(directory,'tags')),{code:'ENOENT'});
  assert.ok(record.logicalBytes<32*1024,'Only compact diagnostic metadata may remain');
  const final=await physical(`cycle-${index}-reclaimed`);
  cycles.push({index,outcome,generatedAllocated:peak.allocatedBytes,finalAllocated:final.allocatedBytes,disposedLogicalBytes:record.disposedBytes,remainingLogicalBytes:record.logicalBytes});
}
assert.equal(await hash(source),sourceSha256);
const final=await physical('final');
assert.ok(final.allocatedBytes-samples[0].allocatedBytes<2*1024**2,'Twenty native QA runs must not accumulate map/tag payloads');
const report={schemaVersion:1,complete:true,sourceSha256,nativeToolSha256:appSha256,cycles,samples,startAllocatedBytes:samples[0].allocatedBytes,peakSampledAllocatedBytes:Math.max(...samples.map(row=>row.allocatedBytes)),finalAllocatedBytes:final.allocatedBytes,retainedReason:'Bounded native readback, source/tool hashes and ownership/recovery receipts only',humanGameplayAccepted:false};
await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({complete:true,cycles:cycles.length,start:report.startAllocatedBytes,peak:report.peakSampledAllocatedBytes,final:report.finalAllocatedBytes}));
