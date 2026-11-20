import { describe, expect, it } from 'vitest';
import { addHmvObjective, addHmvPlacement, addHmvTeleporterPair, changeHmvObjectiveSlot, changeHmvTeleporterChannel, exportForgeSidecar, importForgeSidecar, inspectForgeSidecar, removeForgeSidecar, removeHmvPlacement, showHmvDevices, showHmvMarkers, updateHmvLayoutDetails, updateHmvPlacementProperties, updateHmvSpawnProperties } from './forgeSidecar';
import { crc32 } from './sourceZip';
import { readHmv } from './forgeHmv';
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

  it('creates a native HMV from a base-map object and keeps scene IDs stable when placements are removed', () => {
    const native = {
      id: 'native-placement', name: 'Test', tagId: 10, kind: 'Weapon',
      position: [5, 6, 7], rotation: [0, 0.25, 0], scale: [1, 1, 1], visible: true,
      sourceOffset: 0, rotationOffset: 0, assetId: null,
    } as Project['scene'][number];
    const withNative = { ...project, scene: [native] };
    const created = addHmvPlacement(withNative, map, native);
    const first = created.project.scene[1];
    const second = addHmvPlacement(created.project, map, first);
    second.project.scene[2].position[2] = 9;
    const reopened = JSON.parse(JSON.stringify(removeHmvPlacement(second.project, map, first))) as Project;
    expect(reopened.scene.map(row => row.id)).toEqual([native.id, second.selectedId]);
    expect(reopened.forgeSidecar?.recordKeys).toEqual([second.selectedId.slice('forge-sidecar:'.length)]);
    const bytes = exportForgeSidecar(reopened, map, 'forerunner') as Uint8Array;
    const decoded = readHmv(Array.from(bytes), map);
    expect(decoded.objectRecords).toMatchObject([{ path: 'weapons\\test', position: [7, 6, 9], rotation: [0, 0.25, 0] }]);
    expect(withNative.scene).toEqual([native]);
    expect(withNative.forgeSidecar).toBeUndefined();
    const longName = { ...map, scenarioPath: 'levels/test/' + 'x'.repeat(31) };
    const longLayout = addHmvPlacement(withNative, longName, native);
    expect(exportForgeSidecar(longLayout.project, longName, 'forerunner')).toBeInstanceOf(Uint8Array);
    expect(() => addHmvPlacement(withNative, map, { ...native, scale: [2, 2, 2] })).toThrow('unscaled');
  });

  it('retains opaque HMV records and preserves current poses across structural changes', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    const first = loaded.scene[0];
    first.position[0] = 8;
    const added = addHmvPlacement(loaded, map, first);
    const removed = removeHmvPlacement(added.project, map, first);
    const output = exportForgeSidecar(removed, map) as Uint8Array;
    expect(output.subarray(81, 129)).toEqual(source.subarray(129, 177));
    expect(output.subarray(177)).toEqual(source.subarray(177));
    expect(exportForgeSidecar(loaded, map)).not.toEqual(output);
    expect(readHmv(Array.from(output), map).objectRecords[0].position).toEqual([9, 2, 3]);
    expect(removed.scene[0].id).toBe(added.selectedId);
  });

  it('preserves native properties on duplicate and retains the lowest required version after a deletion', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    const first = loaded.scene[0];
    const advanced = { team: 1, respawnSeconds: 20, placeAtStart: false, physics: 'phased' } as const;
    const edited = updateHmvPlacementProperties(loaded, map, first, advanced);
    const bytes = exportForgeSidecar(edited, map) as Uint8Array;
    expect(new DataView(bytes.buffer).getUint16(4, true)).toBe(7);
    expect(bytes.subarray(129)).toEqual(source.subarray(129));
    expect(readHmv(Array.from(bytes), map).objectRecords[0].properties).toEqual(advanced);
    expect(() => exportForgeSidecar(edited, map, 'forerunner')).toThrow('standard physics');
    expect(() => updateHmvPlacementProperties(edited, map, first, { ...advanced, respawnSeconds: 601 })).toThrow('out of range');

    const duplicated = addHmvPlacement(edited, map, first).project;
    expect(inspectForgeSidecar(duplicated.forgeSidecar!, map).properties.get(duplicated.scene[1].id)).toEqual(advanced);
    const reset = updateHmvPlacementProperties(duplicated, map, first, { ...advanced, physics: 'normal' });
    expect(new DataView((exportForgeSidecar(reset, map) as Uint8Array).buffer).getUint16(4, true)).toBe(7);
    const trimmed = removeHmvPlacement(reset, map, duplicated.scene[1]);
    const output = exportForgeSidecar(trimmed, map) as Uint8Array;
    expect(new DataView(output.buffer).getUint16(4, true)).toBe(4);
    expect(output.subarray(129)).toEqual(source.subarray(129));
    expect(inspectForgeSidecar(trimmed.forgeSidecar!, map).properties.get(first.id)).toEqual({ ...advanced, physics: 'normal' });
    expect(exportForgeSidecar(loaded, map)).toEqual(source);
  });

  it('exposes retained player spawns on demand, keeps the untouched bytes, and saves marker edits', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    expect(loaded.scene).toHaveLength(1);
    const shown = showHmvMarkers(loaded, map, 'spawns');
    const marker = shown.scene[1];
    expect(marker).toMatchObject({ kind: 'Player spawn', position: [4, 0, 0], sourceOffset: null });
    expect(exportForgeSidecar(shown, map)).toEqual(source);
    const properties = { team: 1, initial: false, modes: 0x22 };
    const revised = updateHmvSpawnProperties(shown, map, marker, properties);
    revised.scene[1] = { ...marker, position: [5, 6, 7], rotation: [0.4, 0, 0] };
    const exported = exportForgeSidecar(JSON.parse(JSON.stringify(revised)) as Project, map) as Uint8Array;
    expect(exported.subarray(64, 129)).toEqual(source.subarray(64, 129));
    const native = readHmv(Array.from(exported), map).spawnRecords[0];
    expect(native).toMatchObject({ position: [5, 6, 7], properties });
    expect(native.rotation[0]).toBeCloseTo(0.4);
    expect(() => exportForgeSidecar(revised, map, 'forerunner')).toThrow('base-map object');

    const duplicated = addHmvPlacement(revised, map, revised.scene[1]).project;
    expect(inspectForgeSidecar(duplicated.forgeSidecar!, map).spawns.map(row => row.properties)).toEqual([properties, properties]);
    const firstRemoved = removeHmvPlacement(duplicated, map, duplicated.scene[1]);
    const lastRemoved = removeHmvPlacement(firstRemoved, map, firstRemoved.scene[1]);
    const finalBytes = exportForgeSidecar(lastRemoved, map) as Uint8Array;
    const header = new DataView(finalBytes.buffer);
    expect(header.getUint32(8, true)).toBe(0);
    expect(header.getUint16(4, true)).toBe(1);
    expect(lastRemoved.scene.map(row => row.id)).toEqual([loaded.scene[0].id]);
  });

  it('authors a layout from a native spawn without changing the native scene object', () => {
    const native = { id: 'native-spawn', name: 'Spawn', kind: 'Player spawn', tagId: null,
      position: [0, 1, 2], rotation: [1, 0, 0], scale: [1, 1, 1], visible: true,
      sourceOffset: 10, rotationOffset: 22, assetId: null } as Project['scene'][number];
    const created = addHmvPlacement({ ...project, scene: [native] }, map, native);
    expect(created.project.scene[0]).toBe(native);
    const output = exportForgeSidecar(created.project, map) as Uint8Array;
    expect(readHmv(Array.from(output), map).spawnRecords[0]).toMatchObject({
      position: [1, 1, 2], rotation: [1, 0, 0], properties: { team: -1, initial: false, modes: 0 },
    });
  });

  it('authors paired teleporters and protects links through channel changes and deletion', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    const added = addHmvTeleporterPair(loaded, map, loaded.scene[0]).project;
    const [sender, receiver] = added.scene.slice(1);
    expect(() => removeHmvPlacement(added, map, receiver)).toThrow('last receiver');
    const changed = changeHmvTeleporterChannel(added, map, sender, 7);
    expect(() => changeHmvTeleporterChannel(addHmvTeleporterPair(changed, map, sender).project, map, sender, 0))
      .toThrow('already uses that channel');
    changed.scene[2] = { ...receiver, position: [9, 12, 3], rotation: [0.5, 0, 0] };
    const bytes = exportForgeSidecar(changed, map) as Uint8Array;
    const decoded = readHmv(Array.from(bytes), map);
    expect(decoded.teleporterRecords).toMatchObject([
      { role: 'sender', channel: 7 }, { role: 'receiver', channel: 7, position: [9, 12, 3], rotation: [0.5, 0, 0] },
    ]);
    expect(bytes.subarray(64, 177)).toEqual(source.subarray(64, 177));
    const reopened = importForgeSidecar(project, map, 'teleporters.hmv', bytes).project;
    expect(exportForgeSidecar(showHmvMarkers(reopened, map, 'teleporters'), map)).toEqual(bytes);
    const noSender = removeHmvPlacement(changed, map, sender);
    const noPair = removeHmvPlacement(noSender, map, changed.scene[2]);
    expect(exportForgeSidecar(noPair, map)).toEqual(source);
  });

  it('edits only native layout metadata and preserves the original date and records', () => {
    const date = '2026-11-20 13:45';
    const dated = Buffer.concat([Buffer.from(source.subarray(0, -1)), Buffer.from(date + '\0')]);
    dated.writeUInt16LE(dated.length - 177, 54);
    dated.writeUInt32LE(dated.length - 64, 56);
    dated.writeUInt32LE(crc32(dated.subarray(64)), 60);
    const { project: loaded } = importForgeSidecar(project, map, 'test.hmv', dated);
    expect(inspectForgeSidecar(loaded.forgeSidecar!, map).metadata).toEqual({
      details: { title: 'Test Forge', author: 'Spark', description: '' }, date,
    });
    const details = { title: 'Écho Hill', author: 'Créateur', description: 'Three marked paths' };
    const updated = updateHmvLayoutDetails(loaded, map, details);
    expect(updateHmvLayoutDetails(updated, map, details)).toBe(updated);
    const bytes = exportForgeSidecar(updated, map) as Uint8Array;
    expect(bytes.subarray(0, 54)).toEqual(new Uint8Array(dated.subarray(0, 54)));
    expect(bytes.subarray(64, 177)).toEqual(new Uint8Array(dated.subarray(64, 177)));
    expect(readHmv(Array.from(bytes), map)).toMatchObject({ details, date });
    expect(updated.scene).toBe(loaded.scene);
    expect(() => updateHmvLayoutDetails(loaded, map, { ...details, title: 'é'.repeat(16) })).toThrow('31 UTF-8 bytes');
    expect(() => updateHmvLayoutDetails(loaded, map, { ...details, author: 'First\nSecond' })).toThrow('control characters');
    expect(() => updateHmvLayoutDetails(loaded, map, { ...details, title: '' })).toThrow('enter a layout title');
    expect(exportForgeSidecar(loaded, map)).toEqual(new Uint8Array(dated));
  });

  it('round-trips all four game type objective kinds without changing existing records', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    let withObjectives = loaded;
    for (const type of [0, 8, 2, 3] as const) {
      withObjectives = addHmvObjective(withObjectives, map, loaded.scene[0], type).project;
    }
    const last = withObjectives.scene.at(-1)!;
    const changed = changeHmvObjectiveSlot(withObjectives, map, last, 31);
    changed.scene[4] = { ...last, position: [9, 12, 3], rotation: [0.5, 0, 0] };
    const bytes = exportForgeSidecar(changed, map) as Uint8Array;
    expect(new DataView(bytes.buffer).getUint16(4, true)).toBe(6);
    expect(bytes.subarray(64, 177)).toEqual(source.subarray(64, 177));
    expect(readHmv(Array.from(bytes), map).objectiveRecords).toMatchObject([
      { properties: { type: 0, slot: 0 } },
      { properties: { type: 8, slot: 0 } },
      { properties: { type: 2, slot: 0 } },
      { properties: { type: 3, slot: 31 }, position: [9, 12, 3], rotation: [0.5, 0, 0] },
    ]);
    const reopened = importForgeSidecar(project, map, 'objectives.hmv', bytes).project;
    const revealed = showHmvMarkers(reopened, map, 'objectives');
    expect(exportForgeSidecar(revealed, map)).toEqual(bytes);
    expect(revealed.scene.map(row => row.name)).toEqual(['test', 'CTF flag', 'Hill point', 'Oddball spawn', 'Race checkpoint']);
    expect(() => exportForgeSidecar(revealed, map, 'forerunner')).toThrow('Forerunner cannot import');
    const duplicated = addHmvPlacement(revealed, map, revealed.scene[4]).project;
    expect(inspectForgeSidecar(duplicated.forgeSidecar!, map).objectives.at(-1)).toMatchObject({
      properties: { type: 3, slot: 31 }, position: [10, 12, 3],
    });
    const removed = duplicated.scene.slice(1).reduce((state, marker) => removeHmvPlacement(state, map, marker), duplicated);
    expect(exportForgeSidecar(removed, map)).toEqual(source);
  });

  it('enforces per-hill and total objective limits during edit and duplication', () => {
    const loaded = importForgeSidecar(project, map, 'test.hmv', source).project;
    let full = loaded;
    for (let index = 0; index < 13; index++) full = addHmvObjective(full, map, loaded.scene[0], 8).project;
    expect(inspectForgeSidecar(full.forgeSidecar!, map).objectives.map(record => record.properties.slot))
      .toEqual([...Array(12).fill(0), 1]);
    expect(() => changeHmvObjectiveSlot(full, map, full.scene[13], 0)).toThrow('already has 12 points');
    expect(() => addHmvPlacement(full, map, full.scene[1])).toThrow('already has 12 points');
    expect(() => changeHmvObjectiveSlot(full, map, full.scene[13], 16)).toThrow('valid objective index');
    while (full.scene.length < 65) full = addHmvObjective(full, map, loaded.scene[0], 2).project;
    expect(() => addHmvObjective(full, map, loaded.scene[0], 0)).toThrow('64-objective limit');
    expect(() => addHmvPlacement(full, map, full.scene.at(-1)!)).toThrow('64-objective limit');
  });

  it('round-trips native device tags, transforms and properties without promoting them to Forerunner', () => {
    const deviceMap = {
      ...map,
      tags: [...map.tags,
        { id: 21, class: 'mach', path: 'devices/door', external: false },
        { id: 22, class: 'ctrl', path: 'devices/door', external: false }],
    } as MapInspection;
    const makeDevice = (tagId: number) => ({
      ...importForgeSidecar(project, map, 'test.hmv', source).project.scene[0],
      id: 'native-' + tagId, sourceModel: null, tagId,
    });
    const door = makeDevice(21);
    const control = makeDevice(22);
    const starting = { ...project, scene: [door, control] };
    const { project: withDoor } = addHmvPlacement(starting, deviceMap, door);
    const { project: withControl } = addHmvPlacement(withDoor, deviceMap, control, 2);
    const placed = withControl.scene[3];
    const edited = updateHmvPlacementProperties(withControl, deviceMap, placed,
      { team: 1, respawnSeconds: 0, placeAtStart: true, physics: 'fixed' });
    const moved = { ...edited, scene: edited.scene.map(row =>
      row.id === placed.id ? { ...row, position: [10, 2, 3] as [number, number, number] } : row) };
    expect(() => exportForgeSidecar(moved, deviceMap, 'forerunner')).toThrow('does not place devices');
    const output = exportForgeSidecar(moved, deviceMap) as Uint8Array;
    expect(new DataView(output.buffer).getUint16(4, true)).toBe(7);
    const reopened = importForgeSidecar(starting, deviceMap, 'devices.hmv', output).project;
    expect(reopened.scene.slice(-2).map(row => row.sourceModel?.class)).toEqual(['mach', 'ctrl']);
    expect(reopened.scene.at(-1)?.position).toEqual([10, 2, 3]);
    expect(exportForgeSidecar(reopened, deviceMap)).toEqual(output);
    const olderSaved = { ...reopened, scene: starting.scene };
    expect(exportForgeSidecar(olderSaved, deviceMap)).toEqual(output);
    const revealed = showHmvDevices(olderSaved, deviceMap);
    expect(revealed.scene).toEqual(reopened.scene);
    expect(exportForgeSidecar(revealed, deviceMap)).toEqual(output);
    expect(showHmvDevices(revealed, deviceMap)).toBe(revealed);
    const { project: duplicate } = addHmvPlacement(reopened, deviceMap, reopened.scene.at(-1)!);
    const copied = inspectForgeSidecar(duplicate.forgeSidecar!, deviceMap);
    expect(copied.properties.get(duplicate.scene.at(-1)!.id)).toMatchObject({ team: 1, physics: 'fixed' });
    const withoutCopy = removeHmvPlacement(duplicate, deviceMap, duplicate.scene.at(-1)!);
    expect(exportForgeSidecar(withoutCopy, deviceMap)).toEqual(output);

    const ambiguous = { ...deviceMap, tags: [...deviceMap.tags, { ...deviceMap.tags[1], id: 23 }] };
    expect(() => addHmvPlacement(starting, ambiguous, door)).toThrow('ambiguous');
    const unresolved = importForgeSidecar(starting, ambiguous, 'devices.hmv', output);
    expect([unresolved.editable, unresolved.retained]).toEqual([1, 1]);
    expect(exportForgeSidecar(unresolved.project, ambiguous)).toEqual(output);
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
