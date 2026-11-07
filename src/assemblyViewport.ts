import type {OpenProject,MeshData,SceneObject,Vec3} from './types';
import type {BspAssembly} from './bspAssembly';
import type {OwnedSourceMesh} from './useOwnedForgeModels';
import {resolveBspMesh} from './renderView';

export interface AssemblyViewportSource {open:OpenProject;terrain:MeshData;surfaces:OwnedSourceMesh[];scenery:SceneObject[];warning:string|null;}
/** Read the exact saved donor. Region motion changes its matrix, never source
 * vertices, UVs, shader IDs or the identity used by native bitmap readers. */
export function assemblyViewportSource(open:OpenProject,plan:BspAssembly):AssemblyViewportSource {
 const inspection=open.inspection,source=open.project.source;
 if(!inspection||!source||inspection.sha256!==plan.donorSource.sha256||source.sha256!==inspection.sha256||source.cacheVersion!==plan.donorSource.cacheVersion)throw Error('The donor preview belongs to another native source revision');
 const mesh=inspection.renderMesh?.indices.length?inspection.renderMesh:inspection.mesh;
 if(!Number.isInteger(plan.donorBspIndex)||plan.donorBspIndex<0||plan.donorBspIndex>=(mesh.parts?.length??0))throw Error('The selected donor BSP is unavailable');
 const terrain=resolveBspMesh(inspection,'render',plan.donorBspIndex);
 if(!terrain?.indices.length)throw Error('The donor BSP has no verified source geometry');
 // Render streams use generic BSP numbers; collision parts retain scenario
 // reference names in the same native BSP order. Never bind by render labels.
 const part=inspection.mesh.parts?.[plan.donorBspIndex];if(!part)throw Error('The selected donor scenario BSP is unavailable');
 const normalize=(path:string)=>path.replaceAll('\\','/').toLowerCase();const name=normalize(part.name),candidates=inspection.tags.filter(tag=>tag.class==='sbsp');
 let tags=candidates.filter(tag=>normalize(tag.path)===name);
 if(!tags.length&&!name.includes('/'))tags=candidates.filter(tag=>normalize(tag.path).split('/').at(-1)===name);
 if(tags.length!==1)throw Error(tags.length?'The donor BSP tag identity is ambiguous':'The donor scenario BSP tag identity is unavailable');
 const surfaces:OwnedSourceMesh[]=[{project:open.project,inspection,mesh:terrain,tagId:tags[0].id,bsp:true}];
 const scenery=plan.includeDonorScenery&&inspection.mesh.parts?.length===1?inspection.objects.filter(object=>object.visible&&object.tagId!==null&&inspection.tags.some(tag=>tag.id===object.tagId&&tag.class==='scen')):[];
 const seen=new Set<number>();for(const object of scenery){const id=object.tagId!,model=inspection.modelMeshes?.[id];if(model&&!seen.has(id)){seen.add(id);surfaces.push({project:open.project,inspection,mesh:model,tagId:id});}}
 const warning=!inspection.renderMesh?.indices.length?'Donor render surfaces unavailable; showing native collision geometry.':plan.includeDonorScenery&&inspection.mesh.parts?.length!==1?'Scenery preview is unavailable for this multi-BSP donor; native placement validation remains separate.':null;
 return {open,terrain,surfaces,scenery,warning};
}
export function assemblyBounds(mesh:MeshData,translation:Vec3,yawDegrees:number):{min:Vec3;max:Vec3}{
 if(![...translation,yawDegrees].every(Number.isFinite))throw Error('Invalid donor transform');
 const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity],angle=yawDegrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 for(const index of mesh.indices){const i=index*3;if(!Number.isSafeInteger(index)||index<0||i+2>=mesh.positions.length)throw Error('Invalid donor geometry index');const [x,y,z]=mesh.positions.slice(i,i+3),point=[c*x-s*y+translation[0],s*x+c*y+translation[1],z+translation[2]];if(!point.every(Number.isFinite))throw Error('Invalid donor geometry');for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point[axis]);max[axis]=Math.max(max[axis],point[axis]);}}
 return {min,max};
}
