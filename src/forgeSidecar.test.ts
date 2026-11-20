import { describe, expect, it } from 'vitest';
import { exportForgeSidecar, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar } from './forgeSidecar';
import { crc32 } from './sourceZip';
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

describe('Chupathingy Forge binary layouts', () => {
  const hash = 'c'.repeat(64);
  const map = {
    sha256: hash, header: { version: 5, name: 'test', scenarioType: 1, crc32: 0 },
    tags: [{ id: 10, class: 'weap', path: 'weapons/test', external: false }],
  } as MapInspection;
  const project = { id: 'owned-xbox-source', source: { sha256: hash }, scene: [] } as unknown as Project;
  const source = Uint8Array.from(Buffer.from('SEZSRwQAQAABAAAAdGVzdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIAEwCEAAAAsn6lSXBhZXcMd2VhcG9uc1x0ZXN0AAAA/wAAgD8AAABAAABAQAAAAAAAAIA+AAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAA//8C/wAAgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAVGVzdCBGb3JnZQBTcGFyawAAAA==', 'base64'));

  it('round-trips unchanged, then patches the reviewed transform and payload checksum only', () => {
    const imported = importForgeSidecar(project, map, 'test.hmv', source);
    expect([imported.editable, imported.retained]).toEqual([1, 1]);
    expect(exportForgeSidecar(imported.project, map)).toEqual(source);
    const reopened = JSON.parse(JSON.stringify(imported.project)) as Project;
    expect(reopened.scene[0].rotation).toEqual([0, -0.25, 0]);
    reopened.scene[0].position[0] = -7.5;
    reopened.scene[0].rotation[1] = 0.75;
    const output = exportForgeSidecar(reopened, map) as Uint8Array;
    const expected = new Uint8Array(source);
    const view = new DataView(expected.buffer);
    view.setFloat32(85, -7.5, true);
    view.setFloat32(101, -0.75, true);
    view.setUint32(60, crc32(expected.subarray(64)), true);
    expect(output).toEqual(expected);
    expect(importForgeSidecar(project, map, 'copy.hmv', output).project.scene[0].position).toEqual([-7.5, 2, 3]);
  });

  it('exports Forerunner base placements for the matching CE scenario without discarding unsupported records', () => {
    const ce = { ...map, scenarioPath: 'levels/test/test', header: { ...map.header, version: 609, scenarioType: 0, name: 'another_header_name' } };
    const markerLayout = importForgeSidecar(project, ce, 'test.hmv', source).project;
    expect(() => exportForgeSidecar(markerLayout, ce, 'forerunner')).toThrow('record 1');
    expect(exportForgeSidecar(markerLayout, ce)).toEqual(source);

    const base = new Uint8Array(source.length - 48);
    base.set(source.subarray(0, 129));
    base.set(source.subarray(177), 129);
    const view = new DataView(base.buffer);
    view.setUint8(111, 1);
    view.setUint16(4, 1, true);
    view.setUint32(8, 0, true);
    view.setUint16(52, 1, true);
    view.setUint32(56, base.length - 64, true);
    view.setUint32(60, crc32(base.subarray(64)), true);
    const imported = importForgeSidecar(project, ce, 'forerunner.hmv', base).project;
    expect(inspectForgeSidecar(imported.forgeSidecar!, ce).forerunner).toEqual({
      mapName: 'test', issue: null, hasScenery: false,
    });
    const exported = exportForgeSidecar(imported, ce, 'forerunner');
    expect(exported).toEqual(base);
    expect(exportForgeSidecar(imported, map, 'forerunner')).toEqual(base);
  });

  it('rejects wrong map identity and malformed or unpaired records even with a fresh CRC', () => {
    expect(() => importForgeSidecar(project, { ...map, header: { ...map.header, crc32: 1 } }, 'test.hmv', source)).toThrow('checksum must match');
    expect(() => importForgeSidecar(project, { ...map, header: { ...map.header, version: 7 } }, 'test.hmv', source)).toThrow('Xbox');
    expect(() => importForgeSidecar(project, map, 'nul.hmv', source)).toThrow('filename');
    const damaged = new Uint8Array(source);
    const view = new DataView(damaged.buffer);
    damaged[81+36] = 1;
    expect(() => importForgeSidecar(project, map, 'test.hmv', damaged)).toThrow('payload checksum');
    view.setUint32(60, crc32(damaged.subarray(64)), true);
    expect(() => importForgeSidecar(project, map, 'test.hmv', damaged)).toThrow('placement record');
    damaged[81+36] = 0;
    damaged[4] = 5;
    damaged[129+2] = 7;
    damaged[129+3] = 0;
    damaged[129+34] = 0;
    view.setUint32(60, crc32(damaged.subarray(64)), true);
    expect(() => importForgeSidecar(project, map, 'test.hmv', damaged)).toThrow('teleporter pairs');
    const { project: loaded } = importForgeSidecar(project, map, 'test.hmv', source);
    loaded.scene[0].position[0] = 5000;
    expect(() => exportForgeSidecar(loaded, map)).toThrow('coordinate');
  });
});
