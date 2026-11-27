// Bounded developer acceptance using the same worker as Spark Build.
import {withDevelopmentWorkspace} from './native-qa-storage.mjs';
import {buildWarthogAttachment} from './native-warthog-build.mjs';
import path from 'node:path';

const [map,kit,invader,vehicleArg]=process.argv.slice(2);
if(!map||!kit||!invader)throw Error('Use: test-warthog-plow-native <owned cache> <HCEEK tool.exe> <Invader directory> [vehicle tag]');
const buildPrivate=process.env.SPARK_WARTHOG_PRIVATE_MAP==='1';
await withDevelopmentWorkspace('warthog-plow-readback',async context=>{
  console.log(JSON.stringify(await buildWarthogAttachment(context,{
    map:path.resolve(map),kit:path.resolve(kit),invader:path.resolve(invader),vehicleArg,
    blender:process.env.SPARK_WARTHOG_BLENDER,paintSource:process.env.SPARK_WARTHOG_PAINT_PNG,
    projectFile:process.env.SPARK_WARTHOG_SHAPE_PROJECT,roadBlade:process.env.SPARK_WARTHOG_ROAD_BLADE==='1',
    runtimePath:process.env.SPARK_WARTHOG_PLAYTEST_RUNTIME,buildPrivate,
  })));
},{reservationBytes:buildPrivate?1024**3:512*1024**2});
