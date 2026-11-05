import { describe, expect, it } from 'vitest';
import { hasRenderGeometry, resolveBspMesh, resolveObjectMesh, sceneModelMeshes } from './renderView';
import type { MapInspection, MeshData, SceneObject, Tag } from './types';

const collision: MeshData = {
  label: 'Actual collision geometry', source: 'halo-collision',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
  parts: [{ name: 'BSP 1', indexStart: 0, indexCount: 3 }],
};
const render: MeshData = {
  label: 'Untextured render surfaces', source: 'halo-render-untextured',
  positions: [0, 0, 0, 2, 0, 0, 0, 2, 0, 3, 0, 0], indices: [0, 1, 2, 1, 3, 2],
  parts: [{ name: 'BSP 1', indexStart: 0, indexCount: 3 },
          { name: 'BSP 2', indexStart: 3, indexCount: 3 }],
  materialRanges: [{ shaderTagId: 1234, bspIndex: 0, lightmapIndex: 0, indexStart: 0, indexCount: 3 },
                   { shaderTagId: 5678, bspIndex: 1, lightmapIndex: 1, indexStart: 3, indexCount: 3 }],
};
const inspection: MapInspection = {
  header: {version:6,engine:'Synthetic viewport fixture',name:'fixture',build:'synthetic parser fixture',scenarioType:1,fileSize:0,declaredSize:0,tagOffset:0,tagSize:0,crc32:0,flags:0,demoLayout:true,compressed:false,extended:false,legacyTagSizeRepair:false},
  sha256:'a'.repeat(64),tags:[],objects:[],encounters:[],scripts:[],resources:[],diagnostics:[],scenarioPath:'test/fixture',
  mesh: collision, renderMesh: render, modelMeshes: { '123': render },
};

describe('Guilty Spark real-world viewport resolution', () => {
  it('prioritizes actual render triangles, not collision, for game-like mode', () => {
    expect(resolveBspMesh(inspection, 'render', -1)).toBe(render);
    expect(resolveBspMesh(inspection, 'collision', -1)).toBe(collision);
  });
  it('selects the correct BSP part without changing the original geometry', () => {
    expect(resolveBspMesh(inspection, 'smooth', 1)?.indices).toEqual([1, 3, 2]);
    expect(render.indices).toEqual([0, 1, 2, 1, 3, 2]);
    expect(resolveBspMesh(inspection, 'render', 1)?.materialRanges).toEqual([
      { shaderTagId: 5678, bspIndex: 1, lightmapIndex: 1, indexStart: 0, indexCount: 3 },
    ]);
  });
  it('safely falls back to real collision geometry if render decoding fails', () => {
    const partial = { ...inspection, renderMesh: null };
    expect(hasRenderGeometry(partial)).toBe(false);
    expect(resolveBspMesh(partial, 'smooth', 0)?.source).toBe('halo-collision');
  });
  it('resolves only real decoded object meshes or imported workshop meshes', () => {
    expect(resolveObjectMesh(inspection, 123, null, {})).toBe(render);
    expect(resolveObjectMesh(inspection, 999, null, {})).toBeUndefined();
    expect(resolveObjectMesh(inspection, null, 'asset-1', {'asset-1': collision})).toBe(collision);
  });
  it('never invents a missing BSP', () => {
    const empty = { ...inspection, mesh: { ...collision, indices: [] }, renderMesh: null };
    expect(resolveBspMesh(empty, 'render', 0)).toBeNull();
    expect(resolveBspMesh(null, 'render', 0)).toBeNull();
  });
  it('schedules only placed native models, including the owning Spartan for player starts',()=>{
    const object:SceneObject={id:'placed',name:'Placed',kind:'Scenery',tagId:123,visible:true,assetId:null,sourceOffset:null,rotationOffset:null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
    const tags:Tag[]=[{id:50,index:0,class:'mod2',path:'characters/cyborg_mp/cyborg_mp',dataOffset:0,external:false,fields:[],references:[]},{id:51,index:1,class:'bipd',path:'Renamed Spartan',dataOffset:0,external:false,fields:[],references:[{label:'Model',targetId:50,class:'mod2',offset:0}]}];
    const source={...inspection,tags,modelMeshes:{123:render,51:collision,999:{...render,label:'Unplaced global asset'}}};
    const objects=[object,{...object,id:'same'},{...object,id:'start',kind:'Player spawn',tagId:null},{...object,id:'hidden',visible:false,tagId:999}];
    expect(sceneModelMeshes(source,objects)).toEqual([render,collision]);
    expect(sceneModelMeshes(source,objects.map(o=>({...o,position:[100,50,1]})))).toEqual([render,collision]);
    expect(sceneModelMeshes(source,[...objects,{...object,id:'new',tagId:999}])).toEqual([render,collision,source.modelMeshes[999]]);
    expect(source.modelMeshes[999].label).toBe('Unplaced global asset');
  });
  it('never borrows local IDs for donor assets or custom meshes, and resumes newly shown objects',()=>{
    const object:SceneObject={id:'placed',name:'Placed',kind:'Scenery',tagId:123,visible:true,assetId:null,sourceOffset:null,rotationOffset:null,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};
    expect(sceneModelMeshes(inspection,[{...object,sourceModel:{projectId:'donor',sourceSha256:'b'.repeat(64),tagId:123,path:'donor/object',class:'scen'}},{...object,id:'obj',assetId:'custom-obj'}])).toEqual([]);
    expect(sceneModelMeshes(inspection,[{...object,visible:false}])).toEqual([]);
    expect(sceneModelMeshes(inspection,[object])).toEqual([render]);
    expect(sceneModelMeshes(null,[object])).toEqual([]);
    expect(sceneModelMeshes(inspection,[{...object,tagId:999}])).toEqual([]);
  });
});

describe('BSP material lens (actual shader identities, not textures)', () => {
  it('maps actual rendered triangles to their shader tag identity', async () => {
    const { shaderForTriangle, shaderDebugColor } = await import('./renderView');
    expect(shaderForTriangle(render, 0)).toBe(1234);
    expect(shaderForTriangle(render, 1)).toBe(5678);
    expect(shaderForTriangle(render, 2)).toBeNull();
    expect(shaderForTriangle(render, -1)).toBeNull();
    expect(shaderDebugColor(1234)).toBe(shaderDebugColor(1234));
  });
  it('correctly rebases shader ranges for the selected BSP', async () => {
    const { shaderLegend, shaderForTriangle } = await import('./renderView');
    const second = resolveBspMesh(inspection, 'materials', 1);
    expect(shaderLegend(second)).toEqual([{ tagId: 5678, color: expect.any(String), triangles: 1 }]);
    expect(shaderForTriangle(second!, 0)).toBe(5678);
    expect(shaderForTriangle(second!, 1)).toBeNull();
    expect(shaderLegend(collision)).toEqual([]);
  });
});
