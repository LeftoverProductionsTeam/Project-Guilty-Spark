import {buildWarthogAttachment} from './native-warthog-build.mjs';
const [map,kit,invader,blender,projectFile]=process.argv.slice(2);
if(!map||!kit||!invader||!blender||!projectFile)throw Error('Spark did not supply the reviewed native build inputs');
try {
  const receipt=await buildWarthogAttachment({directory:process.cwd(),trackProcess:async()=>{},env:process.env},
    {map,kit,invader,blender,projectFile,buildPrivate:true,retainOutput:true});
  console.log('SPARK_ATTACHMENT '+JSON.stringify({receipt}));
}catch(error){
  // Every child is joined before this terminal record is emitted.
  console.log('SPARK_ATTACHMENT '+JSON.stringify({error:String(error).slice(0,1800)}));
}
