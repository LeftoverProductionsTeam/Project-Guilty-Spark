import type { MapInspection, Project, SceneObject, Vec3 } from './types';

import { HMV_NAME, readHmv } from './forgeHmv';

type LayoutIdentity = { name: string; baseSha256: string };
export type ForgeSidecar = LayoutIdentity & (
  { text: string; bytes?: never } | { bytes: number[]; text?: never }
);

export const FORGE_SIDECAR_LIMIT = 1024 * 1024;
const prefix = 'forge-sidecar:';
const header = '[OpenCE Forge Map]';
const stateHeader = '[ForgeState]';
const classes = ['scen', 'vehi', 'weap', 'eqip'] as const;

type PlacementClass = typeof classes[number];
const fourcc = (s: string) => Array.from(s).reduce((id, c) => id * 256 + c.charCodeAt(0), 0);
const pathKey = (s: string) => s.replaceAll('\\', '/').toLowerCase();
const validPath = (s: string) => s.length > 0 && s.length <= 255
  && pathKey(s).split('/').every(part => part.length > 0 && part !== '.' && part !== '..' && !/[:\u0000-\u001f\u007f]/.test(part));
const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const isCoordinate = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e6;
const isAngle = (n: number) => Number.isFinite(n) && Math.abs(n) <= Math.PI * 2 + 1e-6;
const close = (a: number, b: number) => Math.fround(a) === Math.fround(b);

function parseText(sidecar: LayoutIdentity & { text: string }, map: MapInspection) {
  const { text } = sidecar;
  if (new TextEncoder().encode(text).length > FORGE_SIDECAR_LIMIT || text.includes('\0')) {
    throw Error('Choose a Forge sidecar under 1 MiB with valid UTF-8 text.');
  }
  // Retain each line ending, including mixed endings and an absent final newline.
  const lines = text.split(/(\r\n|\n|\r)/);
  if (lines[0]?.replace(/^\ufeff/, '') !== header) throw Error('Choose an OpenCE Forge map text file.');
  const states = lines.map((line, index) => line === stateHeader ? index : -1).filter(index => index >= 0);
  if (states.length !== 1) throw Error('The Forge file needs one unambiguous ForgeState section.');
  const state = states[0];
  const maps = lines.slice(0, state).filter(line => line.startsWith('Base Map: '));
  const base = pathKey(maps[0]?.slice(10) ?? '');
  const name = map.header.name.toLowerCase();
  const sameMap = map.header.version === 609 ? base === 'custom_maps/' + name
    : map.header.version === 5 && (base === name || base.startsWith('levels/') && base.split('/').at(-1) === name);
  if (maps.length !== 1 || !validPath(base) || !sameMap || map.header.scenarioType !== 1
      || sidecar.baseSha256 !== map.sha256) {
    throw Error('Open the matching Xbox or Halo Custom Edition multiplayer base map first.');
  }
  const tags = placementTags(map);
  const rows: LayoutPlacement[] = [];

  let retained = 0;
  for (let i = state + 2; i < lines.length; i += 2) {
    const line = lines[i];
    if (!line.trim()) continue;
    const fields = line.split('|');
    const kind = classes.find(value => String(fourcc(value)) === fields[1]);
    const matches = tags.get(kind + '|' + pathKey(fields[11] ?? ''));
    const transforms = fields.slice(4, 10);
    const position = transforms.slice(0, 3).map(Number) as Vec3;
    const [yaw, pitch, roll] = transforms.slice(3).map(Number);
    const scaleLine = lines[i + 2]?.startsWith('OBJECT_SCALE|') ? lines[i + 2].slice(13) : undefined;
    const scale = scaleLine === undefined ? 1 : Number(scaleLine);
    if (fields.length !== 12 || fields[0] !== 'OBJECT' || fields[2] !== '0' || fields[3] !== '0'
        || !matches || matches.length !== 1 || !validPath(fields[11]) || !transforms.every(v => numberToken.test(v))
        || !position.every(isCoordinate) || ![yaw, pitch, roll].every(isAngle)
        || !/^-?\d{1,3}$/.test(fields[10]) || scaleLine !== undefined && !numberToken.test(scaleLine)
        || !(scale > 0 && scale < 100)) {
      retained++;
      continue;
    }
    if (rows.length >= 1024) throw Error('This Forge file exceeds Spark’s 1024 editable placement limit.');
    rows.push({
      index: i, tag: matches[0], position, rotation: [yaw, -pitch, roll], scale,
      write(position, rotation) {
        if (!position.every(isCoordinate) || !rotation.every(isAngle)) throw Error('A Forge placement has a transform outside supported bounds.');
        const values = [...position, rotation[0], -rotation[1], rotation[2]];
        // Preserve the untouched spellings and the surrounding line endings.
        lines[i] = fields.map((field, cell) => cell >= 4 && cell < 10
          && !close(Number(field), values[cell - 4]) ? String(Math.fround(values[cell - 4])) : field).join('|');
      },
    });
  }
  return { rows, retained, finish: () => lines.join(''), forerunner: undefined };
}

interface LayoutPlacement {
  index: number;
  tag: MapInspection['tags'][number];
  position: Vec3;
  rotation: Vec3;
  scale: number;
  write(position: Vec3, rotation: Vec3): void;
}

function placementTags(map: MapInspection) {
  const tags = new Map<string, MapInspection['tags']>();
  for (const tag of map.tags) {
    if (!classes.includes(tag.class as PlacementClass) || tag.external) continue;
    const key = tag.class + '|' + pathKey(tag.path);
    const same = tags.get(key) ?? [];
    same.push(tag);
    tags.set(key, same);
  }
  return tags;
}

function parse(sidecar: ForgeSidecar, map: MapInspection) {
  if (sidecar.baseSha256 !== map.sha256) throw Error('Open the preserved base map for this Forge layout.');
  if (typeof sidecar.text === 'string' && sidecar.bytes === undefined) return parseText({ ...sidecar, text: sidecar.text }, map);
  if (!Array.isArray(sidecar.bytes) || sidecar.text !== undefined || !HMV_NAME.test(sidecar.name)) {
    throw Error('Choose a valid Chupathingy .hmv layout filename.');
  }
  const layout = readHmv(sidecar.bytes, map);
  const tags = placementTags(map);
  const rows: LayoutPlacement[] = [];
  for (const record of layout.objectRecords) {
    const matches = tags.get(record.group + '|' + pathKey(record.path));
    if (matches?.length !== 1) continue;
    rows.push({
      index: record.index, tag: matches[0], position: record.position, rotation: record.rotation, scale: 1,
      write: (position, rotation) => layout.write(record.index, position, rotation),
    });
  }
  return {
    rows,
    retained: layout.recordsCount - rows.length,
    finish: layout.finish,
    forerunner: {
      mapName: layout.mapName,
      issue: layout.forerunnerIssue ?? (rows.length === layout.recordsCount
        ? null : 'Forerunner needs every placement to use a uniquely identified object from this base map.'),
      hasScenery: rows.some(row => row.tag.class === 'scen'),
    },
  };
}

export function inspectForgeSidecar(sidecar: ForgeSidecar,map: MapInspection) {
  const { rows, retained, forerunner } = parse(sidecar, map);
  return { editable: rows.length, retained, forerunner };
}

export function importForgeSidecar(project: Project, map: MapInspection, name: string, input: string | Uint8Array) {
  if (project.source?.sha256 !== map.sha256) throw Error('Use the preserved base map for this Forge layout.');
  if (project.forgeSidecar) throw Error('Export or remove the current Forge layout before importing another.');
  if (typeof input === 'string' && (!/^[^\x00-\x1f\x7f/:\\]+\.txt$/i.test(name)
    || new TextEncoder().encode(name).length > 240)) throw Error('Choose a valid Forge layout filename.');
  const forgeSidecar: ForgeSidecar = typeof input === 'string'
    ? { name, text: input, baseSha256: map.sha256 }
    : { name, bytes: Array.from(input), baseSha256: map.sha256 };
  const { rows, retained } = parse(forgeSidecar, map);
  if (project.scene.length + rows.length > 20000) throw Error('This layout exceeds the scene object limit.');
  const objects: SceneObject[] = rows.map(row => ({
    id:prefix + row.index, name:row.tag.path.split(/[\\/]/).at(-1) || row.tag.path, kind:'Source model',
    tagId:null, position:row.position, rotation:row.rotation, scale:[row.scale,row.scale,row.scale],
    visible:true, sourceOffset:null, rotationOffset:null, assetId:null,
    sourceModel:{projectId:project.id,sourceSha256:map.sha256,tagId:row.tag.id,path:row.tag.path,class:row.tag.class as PlacementClass},
  }));
  return { project:{...project, forgeSidecar, scene:[...project.scene,...objects]}, editable:objects.length, retained };
}

export function exportForgeSidecar(project: Project, map: MapInspection, target?: 'forerunner') {
  const sidecar = project.forgeSidecar;
  if (!sidecar || project.source?.sha256 !== map.sha256) throw Error('Open the preserved Forge base map to export this layout.');
  const { rows, finish, forerunner } = parse(sidecar, map);
  if (target === 'forerunner' && (!forerunner || forerunner.issue)) {
    throw Error(forerunner?.issue ?? 'Forerunner’s HMV import needs a compatible binary layout.');
  }
  for (const row of rows) {
    const object = project.scene.find(candidate => candidate.id === prefix + row.index);
    if (!object || object.sourceModel?.tagId !== row.tag.id || object.sourceModel.sourceSha256 !== map.sha256
        || object.sourceModel.projectId !== project.id || object.sourceModel.class !== row.tag.class
        || pathKey(object.sourceModel.path) !== pathKey(row.tag.path)) {
      throw Error('A Forge placement was removed or replaced. Restore it with Undo before exporting.');
    }
    if (object.scale.some(value => !close(value,row.scale))) {
      throw Error('This layout preserves its original scale. Restore the scale before exporting.');
    }
    row.write(object.position, object.rotation);
  }
  return finish();
}

export function removeForgeSidecar(project: Project): Project {
  return {...project,forgeSidecar:null,scene:project.scene.filter(object=>!object.id.startsWith(prefix))};
}
