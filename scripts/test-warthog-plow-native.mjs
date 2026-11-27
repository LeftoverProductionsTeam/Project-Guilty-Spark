// Bounded native render proof against an explicitly selected local Warthog cache.
import {withDevelopmentWorkspace} from './native-qa-storage.mjs';
import {buildNativeRigidPartCollision} from './native-rigid-part-collision.mjs';
import {compileNativePartPaint} from './native-rigid-part-material.mjs';
import {plowMesh} from '../src/plowMesh.ts';
import {appendRecoveredJmsMaterial,attachRigidPartToRecoveredJms,normalizeRecoveredJmsChecksum,readRecoveredJms} from '../src/haloRiggedJms.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';

const [mapArg, kitArg, invaderArg, vehicleArg]=process.argv.slice(2);
if(!mapArg||!kitArg||!invaderArg)throw Error('Use: test-warthog-plow-native <owned cache> <HCEEK tool.exe> <Invader directory> [vehicle tag]');
const map=path.resolve(mapArg),kit=path.resolve(kitArg),invader=path.resolve(invaderArg);
for(const file of [map,kit,...['extract','recover','edit'].map(tool=>path.join(invader,'invader-'+tool+'.exe'))])
  if(!(await fs.stat(file)).isFile())throw Error('Missing native input: '+file);
const hash=async file=>{
  const digest=createHash('sha256');
  for await(const bytes of createReadStream(file))digest.update(bytes);
  return digest.digest('hex');
};
const originalMapHash=await hash(map);
const blender=process.env.SPARK_WARTHOG_BLENDER;
const paintSource=process.env.SPARK_WARTHOG_PAINT_PNG;
const buildPrivate=process.env.SPARK_WARTHOG_PRIVATE_MAP==='1';
const bladeProfile=process.env.SPARK_WARTHOG_ROAD_BLADE==='1'?'moldboard':'v';
const [curl,sweep]=bladeProfile==='moldboard'?[80,0]:[62,30];
const runtimePath=process.env.SPARK_WARTHOG_PLAYTEST_RUNTIME;
if(runtimePath&&!buildPrivate)throw Error('The normal-menu playtest requires a verified private cache');
if(buildPrivate&&(!blender||!paintSource))throw Error('Private cache proof requires both paint and collision');
if(blender&&!(await fs.stat(blender)).isFile())throw Error('Expected the installed Blender executable');

await withDevelopmentWorkspace('warthog-plow-readback',async context=>{
  const tags=path.join(context.directory,'tags'),data=path.join(context.directory,'data');
  const stem='vehicles\\warthog\\warthog',model=stem+'.gbxmodel';
  await fs.mkdir(tags);await fs.mkdir(data);
  const launch=async (command,args,options={})=>{
    const pending=promisify(execFile)(command,args,{cwd:context.directory,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,env:context.env,timeout:35000,...options});
    if(pending.child)await context.trackProcess(pending.child);
    return (await pending).stdout;
  };
  const run=(tool,args)=>launch(path.join(invader,'invader-'+tool+'.exe'),args);
  await run('extract',['-G','-r','-t',tags,'-s',model,map]);await run('recover',['-t',tags,'-d',data,model]);
  const base=path.join(data,'vehicles/warthog/models'),target=path.join(data,'vehicles/warthog/warthog/models');
  await fs.mkdir(target,{recursive:true});
  const numbers=row=>row.split(/\s+/).map(Number);
  const point=(source,index)=>numbers(source.rows[source.vertexStart+2+index*6]);
  const triangles=source=>{
    const faces=[];
    for(let at=source.triangleStart+1;at<source.rows.length;at+=3){
      const corners=numbers(source.rows[at+2]);
      faces.push({
        region:source.regions[Number(source.rows[at])],
        material:source.materials[Number(source.rows[at+1])],
        points:corners.map(vertex=>point(source,vertex)),
        uv:corners.map(vertex=>numbers(source.rows[source.vertexStart+6+vertex*6]).slice(0,2)),
      });
    }
    return faces;
  };
  const stock=readRecoveredJms(await fs.readFile(path.join(base,'__base superhigh.jms'),'utf8'));
  const hullPoints=triangles(stock).filter(face=>face.region==='hull').flatMap(face=>face.points);
  const points=hullPoints;
  const front=Math.max(...points.map(p=>p[0])),width=Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])),bottom=Math.min(...points.map(p=>p[2]));
  const bladeWidth=Math.min(width*1.1/100,2.5);
  const dimensions=[.22,bladeWidth,.65];
  const mesh=plowMesh(dimensions,curl,sweep,bladeProfile);
  const origin=[front+15,0,bottom+5],proof=[];
  const paint=paintSource?await compileNativePartPaint({source:path.resolve(paintSource),tags,data,run}):null;
  const mount={node:'frame hull',region:'hull',material:paint?.name??'warthog hull',position:origin.map(x=>x/100)};
  for(const name of await fs.readdir(base)){
    const original=await fs.readFile(path.join(base,name),'utf8');
    let text;
    if(name.startsWith('__base')){
      const part=attachRigidPartToRecoveredJms(paint?appendRecoveredJmsMaterial(original,paint.name):original,mesh,mount);
      text=part.text;
      proof.push({name,original:part.originalTriangles,expected:part.originalTriangles+part.addedTriangles});
    }else text=normalizeRecoveredJmsChecksum(original);
    await fs.writeFile(path.join(target,name),text,{flag:'wx'});
  }
  const raw=await launch(kit,['model','vehicles\\warthog\\warthog']);
  const back=path.join(context.directory,'readback');await fs.mkdir(back);const candidate='vehicles\\warthog\\warthog\\warthog.gbxmodel';await run('recover',['-t',tags,'-d',back,candidate]);
  if(paint){
    const shaderCount=Number(await run('edit',['-t',tags,'-C','shaders',candidate]));
    const fields=Array.from({length:shaderCount},(_,index)=>['-G','shaders['+index+'].shader']).flat();
    const shaders=(await run('edit',['-t',tags,...fields,candidate])).trim().split(/\r?\n/);
    if(shaders.filter(shader=>shader===paint.shader).length!==1)throw Error('Compiled model did not retain the dedicated blade shader');
  }
  function markersEqual(before,after) {
    const decode=rows=>Array.from({length:Number(rows[0])},(_,index)=>rows.slice(1+index*6,7+index*6));
    const remaining=decode(after);
    for(const marker of decode(before)){
      const index=remaining.findIndex(candidate=>marker.slice(0,3).every((v,i)=>v===candidate[i])&&
        marker.slice(3).every((row,i)=>numbers(row).every((v,axis)=>Math.abs(v-numbers(candidate[3+i])[axis])<=.0001)));
      if(index<0)return false;
      remaining.splice(index,1);
    }
    return remaining.length===0;
  }
  const matchesTriangle=(expected,actual)=>expected.region===actual.region&&expected.material===actual.material&&
    [0,1,2].some(offset=>expected.points.every((vertex,i)=>vertex.every((value,axis)=>
      Math.abs(value-actual.points[(i+offset)%3][axis])<.005))&&
      (!expected.uv||expected.uv.every((corner,i)=>corner.every((value,axis)=>
        Math.abs(value-actual.uv[(i+offset)%3][axis])<.00005))));
  const bladeFaces=[];
  for(let at=0;at<mesh.indices.length;at+=3){
    const points=mesh.indices.slice(at,at+3).map(index=>
      mesh.positions.slice(index*3,index*3+3).map((value,axis)=>value*100+origin[axis]));
    const uv=mesh.indices.slice(at,at+3).map(index=>mesh.uvs.slice(index*2,index*2+2));
    bladeFaces.push({region:mount.region,material:mount.material,points,uv});
  }
  for(const detail of proof){
    const original=readRecoveredJms(await fs.readFile(path.join(base,detail.name),'utf8'));
    const compiled=readRecoveredJms(await fs.readFile(path.join(back,path.dirname(candidate),'models',detail.name),'utf8'));
    const compiledFaces=triangles(compiled);
    const consume=faces=>{
      let matched=0;
      for(const face of faces){
        const index=compiledFaces.findIndex(candidate=>matchesTriangle(face,candidate));
        if(index<0)continue;
        compiledFaces.splice(index,1);
        matched++;
      }
      return matched;
    };
    const matchedStock=consume(triangles(original));
    const matchedBlade=consume(bladeFaces);
    Object.assign(detail,{
      after:compiled.triangles,matchedStock,matchedBlade,checksum:compiled.checksum,
      rigIdentical:compiled.rig.join('\n')===original.rig.join('\n'),
      markersIdentical:markersEqual(original.markers,compiled.markers),
    });
  }
  const fields=(await run('edit',['-t',tags,'-l',model])).split(/\r?\n/).filter(row=>/^\S.*cutoff/.test(row)).map(row=>row.trim().split(/\s+/)[0]);
  const get=async tag=>(await run('edit',['-t',tags,...fields.flatMap(field=>['-G',field]),tag])).trim();
  if(fields.length!==5)throw Error('Could not locate all five original model cutoffs');
  const originalCutoffs=await get(model);
  const tune=originalCutoffs.split(/\r?\n/);
  await run('edit',['-t',tags,...fields.flatMap((field,i)=>['-S',field,tune[i]]),candidate]);
  if(await get(candidate)!==originalCutoffs)throw Error('Native cutoff restore failed');
  const vehicle=vehicleArg??'mgm\\rerout\\tags\\vehicles\\the undead demolisher.vehicle';
  if(!/^[a-z0-9_ -]+(?:\\[a-z0-9_ -]+)+\.vehicle$/i.test(vehicle))throw Error('Expected a cache-relative vehicle tag');
  const variant='spark_workshop\\warthog_plow_probe.vehicle';
  await run('extract',['-G','-t',tags,'-s',vehicle,map]);
  const readVehicle=async tag=>(await run('edit',['-t',tags,'-L',tag])).trim();
  const originalVehicle=await readVehicle(vehicle);
  const originalModel=(await run('edit',['-t',tags,'-G','model',vehicle])).trim();
  if(originalModel!==model)throw Error('This vehicle does not use the expected Warthog render model');
  let collision=null;
  if(blender){
    const sourceCollision=(await run('edit',['-t',tags,'-G','collision_model',vehicle])).trim();
    if(!/^[a-z0-9_ -]+(?:\\[a-z0-9_ -]+)+\.model_collision_geometry$/i.test(sourceCollision))
      throw Error('The selected vehicle has no supported collision tag');
    await run('extract',['-G','-t',tags,'-s',sourceCollision,map]);
    const contactWidth=bladeWidth*.42;
    collision=await buildNativeRigidPartCollision({
      context,tags,data,run,launch,compiler:kit,blender,originalTag:sourceCollision,source:stock,
      blade:plowMesh(dimensions,curl,sweep,bladeProfile,'collision'),mount:{...mount,material:'metal'},
      contactSamples:[[0,0],[contactWidth,0],[-contactWidth,0]],
    });
  }
  const references=[['model',candidate]];
  if(collision)references.push(['collision_model',collision.tag]);
  await run('edit',['-t',tags,...references.flatMap(([field,tag])=>['-S',field,tag]),'-O',variant,vehicle]);
  let revisedVehicle=await readVehicle(variant);
  for(const [field,tag] of references){
    const verified=(await run('edit',['-t',tags,'-G',field,variant])).trim();
    const dependency=new RegExp('^'+field+' \\([^\\r\\n]+$','m');
    const before=originalVehicle.match(dependency);
    if(verified!==tag||!before||!dependency.test(revisedVehicle))throw Error('Missing compiled vehicle reference: '+field);
    revisedVehicle=revisedVehicle.replace(dependency,before[0]);
  }
  if(revisedVehicle!==originalVehicle)throw Error('Vehicle variant changed fields beyond reviewed model references');
  if(await readVehicle(vehicle)!==originalVehicle)throw Error('Original extracted vehicle changed');
  let privateMap=null,privateOutput=null;
  if(buildPrivate){
    const scenario=(await run('info',['-T','scenario_path',map])).trim();
    if(!/^[-a-z0-9_ '\\]+$/i.test(scenario))throw Error('Cache has an unsupported scenario path');
    await run('extract',['-G','-t',tags,map]);
    const vehicleSource=path.join(tags,vehicle);
    const variantSource=path.join(tags,variant);
    if(await readVehicle(vehicle)!==originalVehicle)throw Error('Full extraction changed the verified vehicle baseline');
    // Update only the vehicle in the disposable tag tree. The original scenario
    // still uses the same palette index and placement data.
    await fs.copyFile(variantSource,vehicleSource);
    const maps=path.join(context.directory,'maps');
    await fs.mkdir(maps);
    // The official H1A compiler preserves the authored 3.0 melee flash;
    // Invader's stricter guard refuses the original unchanged source.
    const compilerSha256=await hash(kit);
    if(compilerSha256!=='c492789e96dbe845891e0c0973bfb526a21230f570559e6f9fb695b8d2ca0afa')
      throw Error('Use the verified H1A Tool for the private Zombie Survival build');
    const compileLog=await launch(kit,['-data_dir','data','-tags_dir','tags','-game_root_dir','.',
      'build-cache-file',scenario,'classic','none']);
    if(!/successfully built cache file\./i.test(compileLog)||/### failed|exception halt/i.test(compileLog))
      throw Error('H1A cache compile failed: '+compileLog.split(/\r?\n/).slice(-18).join('\n'));
    const scenarioFile=path.win32.basename(scenario)+'.map';
    const output=path.join(maps,scenarioFile);
    if(!(await fs.lstat(output)).isFile()||await hash(kit)!==compilerSha256)throw Error('Invalid private H1A output');
    const mismatch=(await run('info',['-T','crc32_mismatched',output])).trim();
    const engine=(await run('info',['-T','engine',output])).trim();
    if(mismatch!=='0'||engine!=='Halo: Combat Evolved Anniversary (MCC)')throw Error('Private cache engine or CRC differs');
    const readback=path.join(context.directory,'private-map-tags');
    await fs.mkdir(readback);
    await run('extract',['-G','-r','-t',readback,'-s',vehicle,output]);
    for(const [field,tag] of references){
      if((await run('edit',['-t',readback,'-G',field,vehicle])).trim()!==tag)
        throw Error('Compiled cache omitted the reviewed vehicle '+field);
    }
    if((await run('edit',['-t',readback,'-G','base_map',paint.shader])).trim()!==paint.bitmap)
      throw Error('Compiled cache omitted the authored paint bitmap binding');
    privateOutput=output;
    privateMap={sha256:await hash(output),scenario,engine,compilerSha256,crcMismatch:0,vehicleReferencesVerified:true,gameplayVerified:false};
  }
  if(await hash(map)!==originalMapHash)throw Error('Original map changed during the native proof');
  console.log(JSON.stringify({mapSha256:originalMapHash,cutoffs:tune.map(Number),vehicle,renderReferenceVerified:true,collision,paint,privateMap,proof,bladeTriangles:mesh.indices.length/3,bladeProfile,curl,sweep,bladeDimensions:dimensions,mountCentimeters:origin,
    compilerOutput:raw.slice(-250),scope:'Compiled vehicle tag readback; gameplay requires separate validation.'}));
  if(!proof.every(p=>p.after===p.expected&&p.matchedBlade===mesh.indices.length/3&&p.matchedStock===p.original&&p.checksum===stock.checksum&&p.rigIdentical&&p.markersIdentical))throw Error('H1A stock rig or blade failed exact readback');
  if(runtimePath){
    const runtime=path.resolve(runtimePath);
    const ui=path.join(runtime,'maps','ui.map');
    const executable=path.join(runtime,'halo.exe');
    for(const file of [executable,ui])
      if(!(await fs.lstat(file)).isFile())throw Error('Choose a physical Forerunner runtime containing halo.exe and maps/ui.map');
    const root=path.join(context.directory,'normal-menu-playtest');
    const directories=['maps','mcc_maps','saves','logs','cache'];
    await Promise.all(directories.map(folder=>fs.mkdir(path.join(root,folder),{recursive:true})));
    const name='zombie_road_plow.map';
    await fs.copyFile(ui,path.join(root,'maps','ui.map'));
    const localMap=path.join(root,'mcc_maps',name);
    await fs.rename(privateOutput,localMap);
    if(await hash(localMap)!==privateMap.sha256)throw Error('The playtest map differs from the verified native build');
    await fs.writeFile(localMap.replace(/\.map$/,'.txt'),'Zombie Apocalypse | Road plow\n',{flag:'wx'});
    await fs.writeFile(localMap.replace(/\.map$/,'.spark-mode.json'),JSON.stringify({
      cacheSha256:privateMap.sha256,cacheVersion:13,fileName:name,mode:'zombieSurvival',
      requiredNativeFeatures:[],requiredResourceBanks:[],runtimeSettings:{'network.firefight_encounter':false},
      scenarioPath:privateMap.scenario,scenarioType:1,schemaVersion:1,
    }),{flag:'wx'});
    const env=Object.fromEntries(Object.entries(context.env).filter(([key])=>!key.startsWith('HALO_')));
    Object.assign(env,{HALO_DATA_ROOT:root,HALO_SAVE_ROOT:path.join(root,'saves'),
      HALO_LOG_ROOT:path.join(root,'logs'),HALO_CACHE_ROOT:path.join(root,'cache'),
      HALO_DISPLAY_MODE:'windowed',HALO_WINDOW_SIZE:'960x720',HALO_MAX_FPS:'60',
      HALO_NET_ONLINE:'0',HALO_NET_PUBLIC_LOBBY:'0',HALO_NET_ALLOW_UPNP:'0',HALO_NET_JOIN_FROM_CLIPBOARD:'0',
      HALO_NET_ADDRESS:'127.0.0.236',HALO_NET_BROADCAST:'127.0.0.237',
      HALO_UPDATE_ANSWER:'never',HALO_CRASH_REPORTS:'no',HALO_STATS_LOG:'1',HALO_EXIT_AFTER:'480'});
    const runtimeSha256=await hash(executable);
    console.log(JSON.stringify({playtest:{mapSha256:privateMap.sha256,runtimeSha256,root,mode:'normal menus'}}));
    await launch(executable,[],{cwd:root,env,windowsHide:false,timeout:500000});
    const debug=await fs.readFile(path.join(root,'logs','debug.txt'),'utf8').catch(error=>{
      if(error.code==='ENOENT')return '';
      throw error;
    });
    if(await hash(localMap)!==privateMap.sha256||await hash(executable)!==runtimeSha256)
      throw Error('Private playtest map or runtime changed while running');
    console.log(JSON.stringify({playtest:{mapSha256:privateMap.sha256,runtimeSha256,
      matchObserved:/STATS .*mode=Slayer map=zombie_road_plow\b/i.test(debug),
      mapLoadObserved:/mcc: loaded mcc_maps[\/]zombie_road_plow\b/i.test(debug)}}));
  }
},{reservationBytes:buildPrivate?1024**3:512*1024**2});
