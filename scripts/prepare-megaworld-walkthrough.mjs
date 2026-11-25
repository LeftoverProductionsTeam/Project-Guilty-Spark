// Test-only native scenario overlay: accepted BSP and original source tags stay
// intact. Real Invader compilation and compiled-tag readback are mandatory.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertQaOutputPath } from './native-qa-storage.mjs';
const [toolPath, inputPath, outputPath, ...options] = process.argv.slice(2);
if (!toolPath || !inputPath || !outputPath) throw Error('prepare-megaworld-walkthrough <Invader> <accepted-pair-cache-or-tags> <fresh-output> [native-dependency-tag-roots...] OR <Invader> <validated-job-or-handoff> <fresh-output> --drive <compiled.gsproject> [--banks <CE-maps-directory>]');
const driving = options[0] === '--drive';
if (driving && !(options.length === 2 || (options.length === 4 && options[2] === '--banks'))) throw Error('--drive requires one compiled connection project.');
const bankRoot = driving && options.length === 4 ? path.resolve(options[3]) : null;
const toolFolder = path.resolve(toolPath);
const input = (await fs.realpath(inputPath)).replace(/^\\\\\?\\(?=[a-z]:\\)/i,'');
const outputFolder = await assertQaOutputPath(outputPath);
const fallbackTags = driving ? [] : options.map(root => path.resolve(root));
await fs.mkdir(outputFolder);
const overlay = path.join(outputFolder, 'tags'), extracted = path.join(outputFolder, 'readback');
const scenario = 'levels/test/timberland/timberland.scenario';
let structure = 'levels/spark/assembly_c693a32c/connected.scenario_structure_bsp';
const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
let sourceTags = input;
const preserved = {};
const report = { schemaVersion:1, testOnly:true, complete:false, nativeCompiled:false, playerConfirmed:false,
  sourceTags, fallbackTags, originalHashes:preserved, nativeTools:{}, steps:[], error:null };
let drive;
const workspace = driving ? path.dirname(outputFolder) : path.resolve('.');
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
const query = async (root, tag, args, label) => (await run('invader-edit', ['-t', root, ...args, tag], label)).split(/\r?\n/);
const get = field => ['-G', field];
const vector = value => value?.split(',').map(Number) ?? [];
const close = (actual, expected) => actual.length === expected.length &&
  actual.every((value, index) => Number.isFinite(value) && Math.abs(value - expected[index]) <= 0.0001);
// Invader setters take radians and print readback in degrees.
const sameAngle = (degrees, radians) => {
  const delta = degrees*Math.PI/180-radians;
  return Math.abs(Math.atan2(Math.sin(delta),Math.cos(delta))) <= 0.0001;
};
const warthogTag = 'vehicles/warthog/mp_warthog.vehicle';
const vehicleProperties = ['type','position','rotation','multiplayer_team_index',
  ...['default','allowed'].flatMap(flag => ['slayer','ctf','king','oddball'].map(mode => `multiplayer_spawn_flags.${mode}_${flag}`))];
const vehicleFields = index => vehicleProperties.flatMap(key => get(`vehicles[${index}].${key}`));

async function readTrial() {
  const receiptFile = path.join(input,'megaworld-receipt.json');
  const receipt = JSON.parse(await fs.readFile(receiptFile,'utf8'));
  const project = JSON.parse(await fs.readFile(path.resolve(options[1]),'utf8'));
  const {build,routes} = receipt;
  const projectBuild = project.builds?.find(row => row.id === build?.id);
  const retained = bankRoot !== null;
  const cache = retained ? path.join(input,'timberland.map') : path.join(input,'output','timberland.map');
  const plan = project.bspAssembly;
  const reviewedRoutes = ['Primary connection', ...(plan?.infantryTunnel ? ['Infantry tunnel'] : []), 'High-ground route'];
  if (receipt.schemaVersion !== 1 || !receipt.originalHashesVerified || receipt.residentBsps !== 1 ||
      build?.target !== 'gbx-custom' || build.status !== 'validated' || !/^[0-9a-f]{64}$/.test(build.sha256) ||
      projectBuild?.sha256 !== build.sha256 || projectBuild.projectFingerprint !== build.projectFingerprint ||
      routes?.cacheSha256 !== build.sha256 ||
      JSON.stringify(routes.routeClearance?.[0]?.map(route => route.label)) !== JSON.stringify(reviewedRoutes)) {
    throw Error('Select a validated CE connection with a reviewed road and ridge and its compiled project.');
  }
  if (await hash(cache) !== build.sha256) throw Error('The validated CE cache changed.');
  if (retained) {
    report.resourceBanks = {};
    for (const name of ['bitmaps.map','sounds.map','loc.map']) {
      const expected = project.source?.resourceSha256?.[name];
      if (!/^[0-9a-f]{64}$/.test(expected ?? '') || plan?.donorSource?.resourceSha256?.[name] !== expected ||
          await hash(path.join(bankRoot, name)) !== expected) {
        throw Error('The retained CE cache needs its exact source resource bank '+name+'.');
      }
      report.resourceBanks[name] = {path:path.join(bankRoot,name),sha256:expected};
    }
    sourceTags = path.join(outputFolder,'recovered-source');
    await fs.mkdir(sourceTags);
    await run('invader-extract',['-t',sourceTags,'-m',bankRoot,cache],'recover-reviewed-native-source');
  } else {
    const [recorded,actual] = await Promise.all([fs.stat(build.output),fs.stat(cache)]);
    if (recorded.dev !== actual.dev || recorded.ino !== actual.ino) throw Error('The validated native job path changed.');
    sourceTags = path.join(input,'tags');
  }
  const points = plan?.tunnelPoints;
  if (!plan?.terrainSeam || !plan.openRoad || !plan.highGround || plan.tunnelWidth < 6 ||
      plan.tunnelWidth !== routes.routeClearance[0][0].width || !Array.isArray(points) || points.length !== 2 ||
      points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(value => !Number.isFinite(value)))) {
    throw Error('The Warthog trial requires a reviewed straight primary road at least six units wide and an authored ridge.');
  }
  const [start,end] = points;
  const length = Math.hypot(end[0]-start[0],end[1]-start[1]);
  if (length < 28 || length > 128 || Math.abs(start[2]-end[2]) > 0.1) {
    throw Error('The Warthog trial needs a level road with room for opposing start areas.');
  }
  const direction = [(end[0]-start[0])/length,(end[1]-start[1])/length];
  const yaw = Math.atan2(direction[1],direction[0]);
  const pose = (distance,lateral) => [start[0]+distance*direction[0]-lateral*direction[1],
    start[1]+distance*direction[1]+lateral*direction[0],start[2]+(end[2]-start[2])*distance/length];
  const [reference] = await query(sourceTags,scenario,get('structure_bsps[0].structure_bsp'),'source-bsp');
  structure = reference?.replaceAll('\\','/');
  if (!/^levels\/spark\/assembly_[0-9a-f]+\/connected\.scenario_structure_bsp$/.test(structure)) throw Error('Validated source has no safe connected BSP path.');
  report.sourceCache = {path:cache,sha256:build.sha256};
  report.sourceTags = sourceTags;
  report.mode = 'warthog';
  report.routes = reviewedRoutes;
  return {pose,yaw,length};
}

async function planVehicles(trial) {
  const [paletteCount,vehicleCount] = (await query(sourceTags,scenario,['-C','vehicle_palette','-C','vehicles'],'source-vehicles-count')).map(Number);
  if (![paletteCount,vehicleCount].every(count => Number.isInteger(count) && count >= 2 && count <= 256)) {
    throw Error('Expected a bounded native vehicle palette and placement table.');
  }
  const palette = await query(sourceTags,scenario,Array.from({length:paletteCount},(_,index) => get(`vehicle_palette[${index}].name`)).flat(),'source-vehicle-palette');
  const warthog = palette.findIndex(value => value.toLowerCase().replaceAll('\\','/') === warthogTag);
  if (warthog < 0) throw Error('The reviewed scenario does not reference the stock Warthog.');
  const rows = [];
  for (let offset=0;offset<vehicleCount;offset+=16) {
    const fields = Array.from({length:Math.min(16,vehicleCount-offset)},(_,index) => vehicleFields(offset+index)).flat();
    rows.push(...await query(sourceTags,scenario,fields,`source-vehicle-placements-${offset}`));
  }
  const size = vehicleProperties.length;
  if (rows.length !== vehicleCount*size) throw Error('Native vehicle placement readback is incomplete.');
  let placements = Array.from({length:vehicleCount},(_,index) => {
    const [type,position,,...metadata] = rows.slice(index*size,(index+1)*size);
    return {index,type:Number(type),position:vector(position),metadata};
  }).filter(row => row.type === warthog && row.position.length === 3 && row.position.every(Number.isFinite) &&
    ['0','1'].includes(row.metadata[0]) &&
    row.metadata[1] === '1' && row.metadata[2] === '1');
  const targets = [{side:'Timberland',position:trial.pose(3.5,-1.6),yaw:trial.yaw},
    {side:'Sidewinder',position:trial.pose(trial.length-3.5,1.6),yaw:trial.yaw+Math.PI}];
  if (!['0','1'].every(team => placements.some(row => row.metadata[0] === team))) {
    throw Error('Both teams need original Warthogs enabled in native Slayer and CTF defaults.');
  }
  for (const target of targets) {
    // Reuse the nearest original row for each end. Its native game-mode and team flags stay intact.
    const distance = row => Math.hypot(...row.position.map((value,axis) => value-target.position[axis]));
    placements.sort((a,b) => distance(a)-distance(b));
    const source = placements[0];
    Object.assign(target,{index:source.index,type:source.type,metadata:source.metadata});
    placements = placements.filter(row => row.metadata[0] !== source.metadata[0]);
  }
  return targets;
}
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
  const trial = driving ? await readTrial() : null;
  if (!driving && input.endsWith('.map')) {
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
  if (!driving && (await run('invader-edit',['-t',sourceTags,'-G','structure_bsps[0].structure_bsp',scenario],'source-bsp')).replaceAll('\\','/') !== structure) throw Error('Accepted connected BSP binding differs.');
  await fs.mkdir(path.dirname(path.join(overlay,scenario)),{recursive:true});
  await fs.copyFile(path.join(sourceTags,scenario),path.join(overlay,scenario),fs.constants.COPYFILE_EXCL);
  const args = ['-t',overlay], starts = [];
  for (let index=0;index<count;index++) {
    // Inside the previously capsule-checked metal corridor, facing Sidewinder.
    // A small centerline spread avoids forcing every respawn onto one point.
    const row = Math.floor(index/2);
    const side = index % 2;
    const depth = 5.5+(row % 9)*0.7;
    // Opposing starts use separate lanes so two players can test the crossing simultaneously.
    const lane = (side ? 0.95 : -0.95) + (Math.floor(row/9)-1.5)*0.35;
    const position = trial ? trial.pose(side ? trial.length-depth : depth, lane)
      : [40.811767578125 + (index % 16)*0.8,34.44912338256836 + Math.floor(index/16)*0.2-0.4,-20.875042829581236];
    const facing = trial ? trial.yaw+(side ? 0 : Math.PI) : 0;
    starts.push({position,facing});
    args.push('-S',`player_starting_locations[${index}].position`,position.join(','),'-S',`player_starting_locations[${index}].facing`,String(facing));
  }
  const vehicles = trial ? await planVehicles(trial) : [];
  for (const {index,position,yaw} of vehicles) {
    args.push('-S',`vehicles[${index}].position`,position.join(','),'-S',`vehicles[${index}].rotation`,[yaw,0,0].join(','));
  }
  args.push(scenario);
  await run('invader-edit',args,'place-test-starts');
  const cacheName = driving ? 'gsmegaroad' : 'c50tunnel';
  const cache = path.join(outputFolder,cacheName+'.map');
  await run('invader-build',['-t',overlay,'-t',sourceTags,...fallbackTags.flatMap(root=>['-t',root]),'-g','gbx-custom','-r','none','-N',cacheName,'-o',cache,scenario.replace(/\.scenario$/,'')],'native-build');
  const header = await fs.open(cache,'r');
  try {
    const bytes = Buffer.alloc(2048); await header.read(bytes,0,bytes.length,0);
    const stat = await header.stat();
    if (bytes.toString('ascii',0,4) !== 'daeh' || bytes.readUInt32LE(4)!==609 || bytes.readUInt32LE(8)!==stat.size || bytes.toString('ascii',32,64).split('\0')[0]!==cacheName) throw Error('Native cache header/size/name readback failed.');
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
    if (!close(vector(values[2+index*2]),starts[index].position) || !sameAngle(Number(values[3+index*2]),starts[index].facing)) throw Error(`Compiled start ${index} differs.`);
  }
  if (trial) {
    for (const {index,type,metadata,position,yaw,side} of vehicles) {
      const [actualType,actualPosition,actualRotation,...readback] = await query(extracted,relative,
        [...vehicleFields(index),...get(`vehicle_palette[${type}].name`)],`compiled-vehicle-${index}`);
      const palette = readback.pop();
      const rotation = vector(actualRotation);
      if (Number(actualType) !== type || JSON.stringify(readback) !== JSON.stringify(metadata) || !close(vector(actualPosition),position) ||
          rotation.length !== 3 || !sameAngle(rotation[0],yaw) || !close(rotation.slice(1),[0,0]) ||
          palette?.toLowerCase().replaceAll('\\','/') !== warthogTag) {
        throw Error(`Compiled ${side} Warthog placement or native metadata differ.`);
      }
    }
    if (!['0','false'].includes(await run('invader-info',['-T','crc32_mismatched',cache],'validated-cache-crc'))) {
      throw Error('Walkthrough cache CRC does not match.');
    }
    const sourceBsp = path.join(outputFolder,'source-bsp');
    const trialBsp = path.join(outputFolder,'trial-bsp');
    await fs.mkdir(sourceBsp);
    await fs.mkdir(trialBsp);
    await run('invader-extract',['-t',sourceBsp,'-s',structure,report.sourceCache.path],'extract-source-bsp');
    await run('invader-extract',['-t',trialBsp,'-s',structure,cache],'extract-trial-bsp');
    if (await hash(path.join(sourceBsp,structure)) !== await hash(path.join(trialBsp,structure))) {
      throw Error('The walkthrough overlay changed the native BSP.');
    }
    report.bspByteIdentical = true;
    if (bankRoot) {
      const [lightmap] = await query(sourceBsp,structure,get('lightmaps_bitmap'),'source-lightmap-reference');
      if (!/^levels[\\/]spark[\\/]assembly_[0-9a-f]+[\\/]connected\.bitmap$/.test(lightmap)) {
        throw Error('The retained connection has no reviewed baked lightmap bitmap.');
      }
      const original = await hash(path.join(sourceTags,lightmap));
      await run('invader-extract',['-t',trialBsp,'-s',lightmap,cache],'extract-trial-lightmap');
      if (await hash(path.join(trialBsp,lightmap)) !== original) throw Error('The walkthrough overlay changed the baked lightmap bitmap.');
      report.lightmapByteIdentical = true;
    }
    report.vehicleMetadataFields = vehicleProperties.slice(3);
    report.vehiclesVerified = vehicles;
  }
  for (const [name,original] of Object.entries(preserved)) if(await hash(path.join(sourceTags,name))!==original) throw Error(`Original source changed: ${name}`);
  if (report.sourceCache && await hash(report.sourceCache.path) !== report.sourceCache.sha256) throw Error('Accepted cache changed during walkthrough preparation.');
  for (const {path:bank,sha256} of Object.values(report.resourceBanks ?? {})) {
    if (await hash(bank) !== sha256) throw Error('A source resource bank changed during walkthrough preparation.');
  }
  report.nativeCompiled = true; report.complete = true; report.startsVerified = count;
  report.guidance = trial
    ? 'Start beside a Warthog at one end of the road. Drive across, turn around and drive back. Check road approaches, vehicle clearance and collision in both directions.'
    : 'You start inside the metal tunnel facing snowy Sidewinder. Walk forward until you enter Sidewinder, turn around and walk the entire tunnel into Timberland, then return. Check both mouths, floor and head clearance.';
} catch(error) {report.error=String(error);process.exitCode=1;}
finally {
  if (drive) { const removed=spawnSync('subst.exe',[drive,'/d'],{windowsHide:true}); report.nativeWorkspaceAliasRemoved=removed.status===0; if(removed.status!==0){report.error ??= 'Owned native workspace alias cleanup failed.';process.exitCode=1;} }
}
await fs.writeFile(path.join(outputFolder,'walkthrough.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({complete:report.complete,nativeCompiled:report.nativeCompiled,cache:report.cache,error:report.error}));
