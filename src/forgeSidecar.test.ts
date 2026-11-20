import { describe, expect, it } from 'vitest';
import { exportForgeSidecar, importForgeSidecar, removeForgeSidecar } from './forgeSidecar';
import type { MapInspection, Project } from './types';

describe('OpenCE Forge base-map placements', () => {
  const hash='a'.repeat(64);
  const map={
    sha256:hash,
    header:{version:609,name:'bloodgulch',scenarioType:1},
    tags:[{id:10,class:'weap',path:'weapons/pistol/pistol',external:false}],
  } as MapInspection;
  const project={id:'owned-source',source:{sha256:hash},scene:[]} as unknown as Project;
  const first='OBJECT|2003132784|0|0|1.000|2|3|0|0.25|-0|0|weapons\\pistol\\pistol';
  const text=['\ufeff[OpenCE Forge Map]','\r\nBase Map: custom_maps\\bloodgulch',
    '\n[ForgeState]\r\n',first,'\r\nOBJECT_PROPS|0|1|8|3|0|0|0',
    '\nOBJECT|2003132784|1|0|0|0|0|0|0|0|0|donor\\missing',
    '\r\nSPAWN|1|2|3|0|0|0'].join('');

  it('changes only the edited numeric tokens and keeps the exact surrounding bytes', () => {
    const imported=importForgeSidecar(project,map,'layout.txt',text);
    expect([imported.editable,imported.retained]).toEqual([1,3]);
    expect(exportForgeSidecar(imported.project,map)).toBe(text);
    const placed=imported.project.scene[0];
    expect(placed.rotation).toEqual([0,-0.25,-0]);
    placed.position[1]=7;
    placed.rotation[1]=-0.5;
    expect(exportForgeSidecar(imported.project,map)).toBe(text.replace(first,first.replace('|2|3|0|0.25|','|7|3|0|0.5|')));
    expect(removeForgeSidecar(imported.project).scene).toEqual([]);
  });

  it('refuses mismatched maps, missing objects, changed scale and replacement assets', () => {
    expect(()=>importForgeSidecar(project,{...map,header:{...map.header,name:'sidewinder'}},'layout.txt',text)).toThrow('matching');
    const {project:loaded}=importForgeSidecar(project,map,'layout.txt',text);
    expect(()=>exportForgeSidecar({...loaded,scene:[]},map)).toThrow('removed');
    const edited=loaded.scene[0];
    edited.scale=[2,2,2];
    expect(()=>exportForgeSidecar(loaded,map)).toThrow('scale');
    edited.sourceModel=null;
    expect(()=>exportForgeSidecar(loaded,map)).toThrow('replaced');
  });
});
