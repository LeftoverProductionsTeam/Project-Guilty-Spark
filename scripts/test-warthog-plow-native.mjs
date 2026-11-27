// Bounded native render proof against an explicitly selected local Warthog cache.
import {withDevelopmentWorkspace} from './native-qa-storage.mjs';
import {buildNativeRigidPartCollision} from './native-rigid-part-collision.mjs';
import {plowMesh} from '../src/plowMesh.ts';
import {attachRigidPartToRecoveredJms,normalizeRecoveredJmsChecksum,readRecoveredJms} from '../src/haloRiggedJms.ts';
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
if(blender&&!(await fs.stat(blender)).isFile())throw Error('Expected the installed Blender executable');

await withDevelopmentWorkspace('warthog-plow-readback',async context=>{
  const tags=path.join(context.directory,'tags'),data=path.join(context.directory,'data');
  const stem='vehicles\\warthog\\warthog',model=stem+'.gbxmodel';
  await fs.mkdir(tags);await fs.mkdir(data);
  const launch=async (command,args)=>{
    const pending=promisify(execFile)(command,args,{cwd:context.directory,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,env:context.env,timeout:35000});
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
      faces.push({
        region:source.regions[Number(source.rows[at])],
        material:source.materials[Number(source.rows[at+1])],
        points:numbers(source.rows[at+2]).map(vertex=>point(source,vertex)),
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
  const mesh=plowMesh(dimensions,62,30,'v');
  const origin=[front+15,0,bottom+5],proof=[];
  const mount={node:'frame hull',region:'hull',material:'warthog hull',position:origin.map(x=>x/100)};
  for(const name of await fs.readdir(base)){
    const original=await fs.readFile(path.join(base,name),'utf8');
    let text;
    if(name.startsWith('__base')){
      const part=attachRigidPartToRecoveredJms(original,mesh,mount);
      text=part.text;
      proof.push({name,original:part.originalTriangles,expected:part.originalTriangles+part.addedTriangles});
    }else text=normalizeRecoveredJmsChecksum(original);
    await fs.writeFile(path.join(target,name),text,{flag:'wx'});
  }
  const raw=await launch(kit,['model','vehicles\\warthog\\warthog']);
  const back=path.join(context.directory,'readback');await fs.mkdir(back);const candidate='vehicles\\warthog\\warthog\\warthog.gbxmodel';await run('recover',['-t',tags,'-d',back,candidate]);
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
      Math.abs(value-actual.points[(i+offset)%3][axis])<.005)));
  const bladeFaces=[];
  for(let at=0;at<mesh.indices.length;at+=3){
    const points=mesh.indices.slice(at,at+3).map(index=>
      mesh.positions.slice(index*3,index*3+3).map((value,axis)=>value*100+origin[axis]));
    bladeFaces.push({region:mount.region,material:mount.material,points});
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
      blade:plowMesh(dimensions,62,30,'v','collision'),mount:{...mount,material:'metal'},
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
  if(await hash(map)!==originalMapHash)throw Error('Original map changed during the native proof');
  console.log(JSON.stringify({mapSha256:originalMapHash,cutoffs:tune.map(Number),vehicle,renderReferenceVerified:true,collision,proof,bladeTriangles:mesh.indices.length/3,bladeDimensions:dimensions,mountCentimeters:origin,
    compilerOutput:raw.slice(-250),scope:'Compiled vehicle tag readback; gameplay requires separate validation.'}));
  if(!proof.every(p=>p.after===p.expected&&p.matchedBlade===mesh.indices.length/3&&p.matchedStock===p.original&&p.checksum===stock.checksum&&p.rigIdentical&&p.markersIdentical))throw Error('H1A stock rig or blade failed exact readback');
},{reservationBytes:512*1024**2});
