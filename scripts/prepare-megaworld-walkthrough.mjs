// Test-only native scenario overlay: accepted BSP and original source tags stay
// intact. Real Invader compilation and compiled-tag readback are mandatory.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [toolFolder, input, outputFolder, ...fallbackTags] = process.argv.slice(2).map(p => path.resolve(p));
if (!toolFolder || !input || !outputFolder) throw Error('prepare-megaworld-walkthrough <Invader> <accepted-pair-cache-or-tags> <fresh-output> [native-dependency-tag-roots...]');
await fs.mkdir(outputFolder);
const overlay = path.join(outputFolder, 'tags'), extracted = path.join(outputFolder, 'readback');
const scenario = 'levels/test/timberland/timberland.scenario';
const structure = 'levels/spark/assembly_c693a32c/connected.scenario_structure_bsp';
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
let sourceTags = input;
const preserved = {};
const report = { schemaVersion:1, testOnly:true, complete:false, nativeCompiled:false, playerConfirmed:false,
  sourceTags, fallbackTags, originalHashes:preserved, nativeTools:{}, steps:[], error:null };
let drive;
const workspace = path.resolve('.');
const short = value => drive && (value === workspace || value.startsWith(workspace + path.sep)) ? drive + '\\' + path.relative(workspace,value) : value;
const run = async (tool, args, label) => {
  const binary = path.join(toolFolder, `${tool}.exe`);
  report.nativeTools[tool] ??= await hash(binary);
  const began = performance.now();
  const result = spawnSync(binary, args.map(short), {cwd:short(outputFolder),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  await fs.writeFile(path.join(outputFolder, `${label}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  report.steps.push({label,tool,args,exitCode:result.status,elapsedMs:performance.now()-began});
  if (result.error || result.status !== 0) throw Error(`${label}: ${result.error ?? result.stderr}`);
  if (tool === 'invader-extract' && /\b(?:ERROR:|Failed to extract|[1-9]\d* errors?)\b/i.test((result.stdout ?? '')+(result.stderr ?? ''))) throw Error(`${label}: native extraction reported a per-tag failure despite exit zero. See its log.`);
  return result.stdout.trim();
};
try {
  if (process.platform === 'win32') {
    for (const letter of 'ZYXWVUTSRQPONMLKJIHGFED') {
      try { await fs.stat(`${letter}:/`); continue; } catch(error) { if (error.code !== 'ENOENT') continue; }
      const mapped = spawnSync('subst.exe',[`${letter}:`,workspace],{encoding:'utf8',windowsHide:true});
      if (mapped.status === 0) { drive=`${letter}:`; break; }
    }
    if (!drive) throw Error('No free, owned native workspace alias is available. Existing mappings were not changed.');
    const [original,alias] = await Promise.all([fs.stat(workspace),fs.stat(drive+'\\')]);
    if (original.ino !== alias.ino || original.dev !== alias.dev) throw Error('Native workspace alias identity differs.');
    report.nativeWorkspaceAlias = { drive, target:workspace, verified:true };
  }
  if (input.endsWith('.map')) {
    const sourceHash = await hash(input);
    if (sourceHash !== 'ed2bb8920d07310c77f54a0a551ffcf17cde0ea0950b466895600d676e49e7fe') throw Error('Select the reviewed C43 Timberland–Sidewinder cache for this walkthrough.');
    sourceTags = path.join(outputFolder,'recovered-source');
    await fs.mkdir(sourceTags);
    await run('invader-extract',['-t',sourceTags,'-m',path.dirname(input),'-s','*.scenario','-r',input],'recover-complete-native-source');
    report.sourceCache = {path:input,sha256:sourceHash}; report.sourceTags = sourceTags;
  }
  Object.assign(preserved,Object.fromEntries(await Promise.all([scenario, structure].map(async name => [name, await hash(path.join(sourceTags,name))]))));
  const count = Number(await run('invader-edit',['-t',sourceTags,'-C','player_starting_locations',scenario],'source-count'));
  if (count !== 68) throw Error('This walkthrough overlay requires the reviewed 68-start Timberland–Sidewinder source.');
  if ((await run('invader-edit',['-t',sourceTags,'-G','structure_bsps[0].structure_bsp',scenario],'source-bsp')).replaceAll('\\','/') !== structure) throw Error('Accepted connected BSP binding differs.');
  await fs.mkdir(path.dirname(path.join(overlay,scenario)),{recursive:true});
  await fs.copyFile(path.join(sourceTags,scenario),path.join(overlay,scenario),fs.constants.COPYFILE_EXCL);
  const args = ['-t',overlay], positions = [];
  for (let index=0;index<count;index++) {
    // Inside the previously capsule-checked metal corridor, facing Sidewinder.
    // A small centerline spread avoids forcing every respawn onto one point.
    const position = [40.811767578125 + (index % 16)*0.8,34.44912338256836 + Math.floor(index/16)*0.2-0.4,-20.875042829581236];
    positions.push(position);
    args.push('-S',`player_starting_locations[${index}].position`,position.join(','),'-S',`player_starting_locations[${index}].facing`,'0');
  }
  args.push(scenario);
  await run('invader-edit',args,'place-test-starts');
  const cache = path.join(outputFolder,'c50tunnel.map');
  await run('invader-build',['-t',overlay,'-t',sourceTags,...fallbackTags.flatMap(root=>['-t',root]),'-g','gbx-custom','-r','none','-N','c50tunnel','-o',cache,scenario.replace(/\.scenario$/,'')],'native-build');
  const header = await fs.open(cache,'r');
  try {
    const bytes = Buffer.alloc(2048); await header.read(bytes,0,bytes.length,0);
    const stat = await header.stat();
    if (bytes.toString('ascii',0,4) !== 'daeh' || bytes.readUInt32LE(4)!==609 || bytes.readUInt32LE(8)!==stat.size || bytes.toString('ascii',32,64).split('\0')[0]!=='c50tunnel') throw Error('Native cache header/size/name readback failed.');
    report.cache = {path:cache,bytes:stat.size,sha256:await hash(cache),version:609};
  } finally { await header.close(); }
  await fs.mkdir(extracted);
  await run('invader-extract',['-t',extracted,'-m',outputFolder,'-s','*.scenario',cache],'extract-compiled-scenario');
  const find = async directory => { const result=[]; for(const entry of await fs.readdir(directory,{withFileTypes:true})){ const file=path.join(directory,entry.name); if(entry.isDirectory())result.push(...await find(file));else if(file.endsWith('.scenario'))result.push(file); }return result; };
  const scenarios = await find(extracted);
  if (scenarios.length !== 1) throw Error('Compiled cache must contain exactly one scenario for this test.');
  const relative = path.relative(extracted,scenarios[0]);
  const readArgs = ['-t',extracted,'-C','player_starting_locations','-G','structure_bsps[0].structure_bsp'];
  for(let index=0;index<count;index++)readArgs.push('-G',`player_starting_locations[${index}].position`,'-G',`player_starting_locations[${index}].facing`);
  const values = (await run('invader-edit',[...readArgs,relative],'compiled-placement-readback')).split(/\r?\n/);
  if (Number(values[0])!==count || values[1].replaceAll('\\','/')!==structure) throw Error('Compiled starts or connected BSP reference differ.');
  for(let index=0;index<count;index++) {
    const actual=values[2+index*2].split(',').map(Number);
    if (actual.length!==3 || actual.some((n,axis)=>!Number.isFinite(n)||Math.abs(n-positions[index][axis])>0.0001) || Math.abs(Number(values[3+index*2]))>0.0001) throw Error(`Compiled start ${index} differs.`);
  }
  for (const [name,original] of Object.entries(preserved)) if(await hash(path.join(sourceTags,name))!==original) throw Error(`Original source changed: ${name}`);
  if (report.sourceCache && await hash(input) !== report.sourceCache.sha256) throw Error('Accepted cache changed during walkthrough preparation.');
  report.nativeCompiled = true; report.complete = true; report.startsVerified = count;
  report.guidance = 'You start inside the metal tunnel facing snowy Sidewinder. Walk forward until you enter Sidewinder, turn around and walk the entire tunnel into Timberland, then return. Check both mouths, floor and head clearance.';
} catch(error) {report.error=String(error);process.exitCode=1;}
finally {
  if (drive) { const removed=spawnSync('subst.exe',[drive,'/d'],{windowsHide:true}); report.nativeWorkspaceAliasRemoved=removed.status===0; if(removed.status!==0){report.error ??= 'Owned native workspace alias cleanup failed.';process.exitCode=1;} }
}
await fs.writeFile(path.join(outputFolder,'walkthrough.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({complete:report.complete,nativeCompiled:report.nativeCompiled,cache:report.cache,error:report.error}));
