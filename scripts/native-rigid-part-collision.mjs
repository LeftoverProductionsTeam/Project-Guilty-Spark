import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Rebuild a seed copy through Halo Tool after welding a rigid part into an
// existing hull. Other collision nodes and damage metadata must match the seed.
export async function buildNativeRigidPartCollision({
  context, tags, data, run, launch, compiler, blender, originalTag, source, blade, mount, contactSamples,
}) {
 const call = run;
 const dump=tag=>call('edit',['-t',tags,'-L',tag]);
 const numbers=row=>row.trim().split(/[\s,]+/).map(Number);
 function read(text){
   const nodes=[],regions=[],materials=[];
   let node=null,bsp=null,row=null,region=null,material=null,mode='';
   for(const line of text.split(/\r?\n/)){
     const field=line.replace(/^[\s│├└─]+/,'').trimEnd();
     const struct=field.match(/^(nodes|bsps|vertices|surfaces|edges|materials|regions|permutations)\[(\d+)\]\s+struct$/);
     if(struct){
       const index=Number(struct[2]);row=null;mode=struct[1];
       if(mode==='materials'){material={};materials[index]=material;}
       if(mode==='regions'){region={permutations:[]};regions[index]=region;}
       if(mode==='permutations'){row={};region.permutations[index]=row;}
       if(mode==='nodes'){node={bsps:[]};nodes[index]=node;}
       if(mode==='bsps'){bsp={vertices:[],surfaces:[],edges:[]};node.bsps[index]=bsp;}
       if(['vertices','surfaces','edges'].includes(mode)){row={};bsp[mode][index]=row;}
       continue;
     }
     if(/\]\s+struct$/.test(field)){row=null;mode='';continue;}
     const cell=field.match(/^([\w_]+) \((.*?)\)(?:\s|$)/);
     if(!cell)continue;
     const [,key,value]=cell;
     if(mode==='materials'&&key==='name')material.name=value;
     if(mode==='regions'&&key==='name')region.name=value;
     if(mode==='nodes'&&['name','region'].includes(key))node[key]=key==='region'?Number(value):value;
     if(mode==='permutations'&&key==='name')row.name=value;
     if(mode==='vertices'&&key==='point')row.point=numbers(value);
     if(row&&['edges','surfaces'].includes(mode))row[key]=Number(value);
   }
   if(nodes.length!==source.nodes.length||!regions.length||!materials.length)throw Error('Collision schema inventory differs');
   return {nodes,regions,materials};
 }
 const originalText=await dump(originalTag),baseline=read(originalText);
 const hull=baseline.nodes.findIndex(node=>node.name===mount.node);
 if(hull<0||baseline.nodes[hull].bsps.length!==1||baseline.regions[baseline.nodes[hull].region]?.permutations[0]?.name!=='__base')
   throw Error('Expected one base collision BSP on the mounted node');
 if(baseline.nodes[hull].bsps[0].surfaces.some(face=>[face.two_sided,face.invisible,face.climbable,face.breakable].some(value=>value!==0)))
   throw Error('Mounted hull contains collision flags that the source round-trip does not preserve');
 const polygon=(bsp,surfaceIndex)=>{
   const face=bsp.surfaces[surfaceIndex],first=face.first_edge,corners=[];let index=first;
   do{const edge=bsp.edges[index];const left=edge.left_surface===surfaceIndex;
      if(!left&&edge.right_surface!==surfaceIndex)throw Error('Collision surface lost its edge');
      corners.push(left?edge.start_vertex:edge.end_vertex);
      index=left?edge.forward_edge:edge.reverse_edge;
   }while(index!==first&&corners.length<64);
   if(index!==first||corners.length<3)throw Error('Collision edge loop is open');
   return {corners,points:corners.map(vertex=>bsp.vertices[vertex].point),material:face.material,flags:[face.two_sided,face.invisible,face.climbable,face.breakable]};
 };
 const rig=source.nodes.map((name,index)=>{const at=index*5;return{name,child:Number(source.rig[at+1]),sibling:Number(source.rig[at+2]),rotation:numbers(source.rig[at+3]),translation:numbers(source.rig[at+4])};});
 const parents=Array(rig.length).fill(-1);
 for(const [index,entry] of rig.entries())for(let child=entry.child;child>=0;child=rig[child].sibling)parents[child]=index;
 function rotate(v,q){
   const cross=[2*(q[1]*v[2]-q[2]*v[1]),2*(q[2]*v[0]-q[0]*v[2]),2*(q[0]*v[1]-q[1]*v[0])];
   return [v[0]+q[3]*cross[0]+q[1]*cross[2]-q[2]*cross[1],v[1]+q[3]*cross[1]+q[2]*cross[0]-q[0]*cross[2],v[2]+q[3]*cross[2]+q[0]*cross[1]-q[1]*cross[0]];
 }
 function toModel(v,index){
   for(let i=index;i>=0;i=parents[i]){
     const {rotation,translation}=rig[i];
     v=rotate(v,[-rotation[0],-rotation[1],-rotation[2],rotation[3]]).map((value,axis)=>value+translation[axis]);
   }
   return v;
 }
 const stem='spark_workshop/vehicle_blade_collision';
 const output=stem+'/vehicle_blade_collision.model_collision_geometry';
 const folder=path.join(data,stem,'physics');
 await fs.mkdir(folder,{recursive:true});await fs.mkdir(path.join(tags,stem),{recursive:true});
 await fs.copyFile(path.join(tags,originalTag),path.join(tags,output));

 const allPermutations=[...new Set(baseline.regions.flatMap(region=>region.permutations.map(perm=>perm.name)))];
 const script=fileURLToPath(new URL('./vehicle-collision-union.py',import.meta.url));
 async function unionHull(stock){
   const position=mount.position.map(value=>value*100);
   const metal=baseline.materials.findIndex(m=>m.name===mount.material),points=[],faces=[];
   if(metal<0)throw Error('Collision material is absent from the original tag');
   for(let offset=0;offset<blade.positions.length;offset+=3)points.push(blade.positions.slice(offset,offset+3).map((value,axis)=>value*100+position[axis]));
   for(let offset=0;offset<blade.indices.length;offset+=3)faces.push({corners:blade.indices.slice(offset,offset+3),material:metal});
   const source=path.join(context.directory,'union-input.json'),destination=path.join(context.directory,'union-output.json');
   await fs.writeFile(source,JSON.stringify({stock,blade:{points,faces},materials:baseline.materials.map(m=>m.name)}),{flag:'wx'});
   const log=await launch(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','5','--python',script,'--',source,destination]);
   const output=JSON.parse(await fs.readFile(destination,'utf8'));
   console.log(JSON.stringify({stockFaces:stock.faces.length,bladeFaces:faces.length,bakedFaces:output.faces.length,blender:log.trim().split(/\r?\n/).slice(-2)}));
   return output;
 }
 for(const permutation of allPermutations){
   const vertices=[],triangles=[];
   for(const [index,node] of baseline.nodes.entries()){
     if(node.name!==rig[index].name)throw Error('Collision node order differs from renderer');
     const region=baseline.regions[node.region];
     const permutationIndex=region?.permutations.findIndex(perm=>perm.name===permutation);
     const bsp=node.bsps[permutationIndex];
     if(!bsp)continue;
     const base=vertices.length/6;
     let geometry={points:bsp.vertices.map(vertex=>toModel(vertex.point.map(value=>value*100),index)),faces:[]};
     for(const [surfaceIndex,surface] of bsp.surfaces.entries()){
       if(!Number.isInteger(surface.material)||surface.material>=baseline.materials.length||surface.material<0)throw Error('Invalid material from collision readback');
       const {corners}=polygon(bsp,surfaceIndex);
       for(let corner=1;corner+1<corners.length;corner++){
         geometry.faces.push({corners:[corners[0],corners[corner],corners[corner+1]],material:surface.material});
       }
     }
     if(index===hull&&permutation==='__base')geometry=await unionHull(geometry);
     for(const vertex of geometry.points)vertices.push(String(index),vertex.map(value=>value.toFixed(6)).join('\t'),'0\t0\t1','-1','0','0\t0\t0');
     for(const face of geometry.faces)triangles.push(String(node.region),String(face.material),face.corners.map(vertex=>vertex+base).join('\t'));
   }
   const materials=baseline.materials.flatMap(m=>[m.name,'<none>']);
   const text=['8200',String(source.checksum|0),String(source.nodes.length),...source.rig,String(baseline.materials.length),...materials,'0',String(baseline.regions.length),...baseline.regions.map(region=>region.name),String(vertices.length/6),...vertices,String(triangles.length/3),...triangles].join('\n')+'\n';
   await fs.writeFile(path.join(folder,permutation+' superhigh.jms'),text,{flag:'wx'});
 }
 const logging=await launch(compiler,['collision-geometry',stem.replaceAll('/','\\')]);
 const warnings=logging.split(/\r?\n/).filter(line=>line.includes('### WARNING'));
 if(/### ERROR|exception/i.test(logging)||!/(created|updated) collision model/.test(logging))throw Error('Native collision compiler refused the seeded geometry');

 const rebuiltText=await dump(output),candidate=read(rebuiltText);
 const metadata=text=>text.split(/\r?\n(?=nodes\[\d+\]\s+array)/,1)[0].trim();
 if(metadata(originalText)!==metadata(rebuiltText))throw Error('Native damage, material definitions, regions or other collision metadata changed');
 const polygons=bsp=>bsp.surfaces.map((_,index)=>polygon(bsp,index));
 const pointMatches=(a,b)=>a.every((value,axis)=>Math.abs(value-b[axis])<=.000025);
 const sameFace=(a,b)=>a.points.length===b.points.length&&a.material===b.material&&a.flags.join()===b.flags.join()&&
   b.points.some((_,offset)=>a.points.every((point,i)=>pointMatches(point,b.points[(i+offset)%b.points.length])));
 for(const [index,node] of baseline.nodes.entries()){
    const result=candidate.nodes[index];
    if(node.name!==result.name||node.region!==result.region||node.bsps.length!==result.bsps.length)throw Error('Stock collision hierarchy or permutations changed');
    if(index===hull)continue;
    for(const [slot,bsp] of node.bsps.entries()){
      const original=polygons(bsp),updated=polygons(result.bsps[slot]);
      for(const face of original){const at=updated.findIndex(row=>sameFace(face,row));if(at<0)throw Error('Stock collision surface changed in '+node.name+' permutation '+slot);updated.splice(at,1);}
      if(updated.length)throw Error('Unexpected stock collision surface addition');
    }
 }
 function frontHit(bsp,y,z) {
   let hit=null;
   for(const face of polygons(bsp)){
     for(let i=1;i+1<face.points.length;i++){
       const [a,b,c]=[face.points[0],face.points[i],face.points[i+1]];
       const d=(b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2]);
       if(Math.abs(d)<1e-9)continue;
       const u=((y-a[1])*(c[2]-a[2])-(z-a[2])*(c[1]-a[1]))/d;
       const v=((b[1]-a[1])*(z-a[2])-(b[2]-a[2])*(y-a[1]))/d;
       if(u>=0&&v>=0&&u+v<=1){
         const x=a[0]+(b[0]-a[0])*u+(c[0]-a[0])*v;
         hit=hit===null?x:Math.max(hit,x);
       }
     }
   }
   return hit;
 }
 const stockHull=baseline.nodes[hull].bsps[0],newHull=candidate.nodes[hull].bsps[0];
 const contact=contactSamples.map(([y,z])=>({y,z,before:frontHit(stockHull,y,z),after:frontHit(newHull,y,z)}));
 if(!contact.every(row=>row.after!==null&&(row.before===null||row.after>row.before+.04)))throw Error('Blade contact is missing from the native collision readback');
 return { tag: output.replaceAll('/','\\'), permutations:allPermutations,nodes:baseline.nodes.length,
   preservedNonHullNodes:baseline.nodes.length-1,
   originalHullSurfaces:stockHull.surfaces.length,hullSurfaces:newHull.surfaces.length,contact,warnings };

}
