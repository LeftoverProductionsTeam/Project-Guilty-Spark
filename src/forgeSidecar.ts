import type { ForgePlacement } from './forge';
import type { MapInspection, Project, SceneObject, Vec3 } from './types';

import { emptyHmv, HMV_NAME, HMV_PLACEMENT_GROUPS, hmvObjectiveDefinition, isHmvDeviceGroup, isHmvPlacementGroup, readHmv, supportsHmvMap, type ForgeLayoutTarget, type HmvBaseIdentity, type HmvLayoutDetails, type HmvObjectiveProperties, type HmvObjectiveType, type HmvPlacementProperties, type HmvSpawnProperties, type HmvTeleporterRole } from './forgeHmv';

type LayoutIdentity = { name: string; baseSha256: string };
export type ForgeSidecar = LayoutIdentity & (
  { text: string; bytes?: never; recordKeys?: never } | { bytes: number[]; text?: never; recordKeys?: string[] }
);

export const FORGE_SIDECAR_LIMIT = 1024 * 1024;
const prefix = 'forge-sidecar:';
const header = '[OpenCE Forge Map]';
const stateHeader = '[ForgeState]';
const classes = ['scen', 'vehi', 'weap', 'eqip'] as const;

type PlacementClass = typeof HMV_PLACEMENT_GROUPS[number];
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
  const tags = placementTags(map, classes);
  const rows: TextPlacement[] = [];
  const headerRows = lines.slice(2, state).filter((line, i) => i % 2 === 0 && line.trim());
  const forerunnerHeader = headerRows.length === 4
    && headerRows.includes('Author: Forerunner') && headerRows.includes('ForgeSource=UserCreated')
    && headerRows.includes(maps[0])
    && headerRows.includes('Map Name: ' + (map.header.version === 609 ? name + '@ce' : name));

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
      index: i, tag: matches[0], position, rotation: [yaw, -pitch, roll], scale, team: Number(fields[10]),
      write(position, rotation) {
        if (!position.every(isCoordinate) || !rotation.every(isAngle)) throw Error('A Forge placement has a transform outside supported bounds.');
        const values = [...position, rotation[0], -rotation[1], rotation[2]];
        // Preserve the untouched spellings and the surrounding line endings.
        lines[i] = fields.map((field, cell) => cell >= 4 && cell < 10
          && !close(Number(field), values[cell - 4]) ? String(Math.fround(values[cell - 4])) : field).join('|');
      },
    });
  }
  const hmvConversionIssue = !forerunnerHeader ? 'HMV conversion requires a text layout saved by Forerunner.'
    : !supportsHmvMap(map) || !Number.isInteger(map.header.crc32) || map.header.crc32 < 0 || map.header.crc32 > 0xffffffff
      ? 'HMV conversion needs the matching base map’s native checksum.'
    : retained ? 'This layout contains scale, unresolved tags or other text records that need the original format.'
    : rows.length < 1 || rows.length > 128 ? 'Convert 1–128 base-map placements at a time.'
    : rows.some(row => row.team < -1 || row.team > 7) ? 'An object team is outside the HMV range.'
    : null;
  return { rows, retained, hmvConversionIssue, finish: () => lines.join(''), forerunner: undefined,
    spawns: [] as LayoutSpawn[], teleporters: [] as LayoutTeleporter[], objectives: [] as LayoutObjective[] };
}

interface LayoutPlacement {
  index: number;
  key?: string;
  properties?: HmvPlacementProperties;
  tag: MapInspection['tags'][number];
  position: Vec3;
  rotation: Vec3;
  scale: number;
  write(position: Vec3, rotation: Vec3): void;
}

type TextPlacement = LayoutPlacement & { team: number };

type LayoutMarker = { id: string; index: number; position: Vec3; rotation: Vec3 };
type LayoutSpawn = LayoutMarker & { properties: HmvSpawnProperties };
type LayoutTeleporter = LayoutMarker & { channel: number; role: HmvTeleporterRole };
type LayoutObjective = LayoutMarker & { properties: HmvObjectiveProperties };

function layoutSpawns(layout: ReturnType<typeof readHmv>, keys: string[]): LayoutSpawn[] {
  return layout.spawnRecords.map(record => ({ ...record, id: prefix + keys[record.index] }));
}

type PlacementTagIdentity = Pick<MapInspection['tags'][number], 'id' | 'class' | 'path' | 'external'>;
export type ForgeLayoutBase = HmvBaseIdentity & { sha256: string; tags: PlacementTagIdentity[] };

function placementTags<T extends PlacementTagIdentity>(map: { tags: readonly T[] }, admitted: readonly string[]) {
  const tags = new Map<string, T[]>();
  for (const tag of map.tags) {
    if (!admitted.includes(tag.class) || tag.external) continue;
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
  const recordKeys = keysForHmv(sidecar, layout.recordsCount);
  const tags = placementTags(map, HMV_PLACEMENT_GROUPS);
  const rows: LayoutPlacement[] = [];
  for (const record of layout.objectRecords) {
    const matches = tags.get(record.group + '|' + pathKey(record.path));
    if (matches?.length !== 1) continue;
    rows.push({
      index: record.index, key: recordKeys[record.index], properties: record.properties,
      tag: matches[0], position: record.position, rotation: record.rotation, scale: 1,
      write: (position, rotation) => layout.write(record.index, position, rotation),
    });
  }
  const unresolved = rows.length === layout.recordsCount ? null
    : 'Forerunner needs every placement to use a uniquely identified object from this base map.';
  return {
    rows,
    retained: layout.recordsCount - rows.length,
    finish: layout.finish,
    spawns: layoutSpawns(layout, recordKeys),
    teleporters: layout.teleporterRecords.map(record => ({ ...record, id: prefix + recordKeys[record.index] })),
    objectives: layout.objectiveRecords.map(record => ({ ...record, id: prefix + recordKeys[record.index] })),
    writeMarker: layout.write,
    metadata: { details: layout.details, date: layout.date },
    forerunnerLocalIssue: layout.forerunnerLocalIssue ?? unresolved,
    forerunnerLocalNeedsPhysics: layout.forerunnerLocalNeedsPhysics,
    forerunner: {
      mapName: layout.mapName,
      issue: layout.forerunnerIssue ?? unresolved,
      hasScenery: rows.some(row => row.tag.class === 'scen'),
    },
  };
}

export function inspectForgeSidecar(sidecar: ForgeSidecar,map: MapInspection) {
  const parsed = parse(sidecar, map);
  const { rows, retained, forerunner, spawns, teleporters, objectives } = parsed;
  const properties = new Map(rows.flatMap(row => row.properties ? [[prefix + row.key, row.properties] as const] : []));
  const devices = rows.filter(row => isHmvDeviceGroup(row.tag.class)).map(row => prefix + row.key);
  return { editable: rows.length, retained, forerunner, properties, spawns, teleporters, objectives, devices,
    metadata: 'metadata' in parsed ? parsed.metadata : undefined,
    hmvConversionIssue: 'hmvConversionIssue' in parsed ? parsed.hmvConversionIssue : undefined,
    forerunnerLocalIssue: 'forerunnerLocalIssue' in parsed ? parsed.forerunnerLocalIssue : undefined,
    forerunnerLocalNeedsPhysics: 'forerunnerLocalNeedsPhysics' in parsed && parsed.forerunnerLocalNeedsPhysics };
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
  const objects = rows.map(row => placementObject(project, map, row));
  return { project:{...project, forgeSidecar, scene:[...project.scene,...objects]}, editable:objects.length, retained };
}

function placementObject(project: Project, map: MapInspection, row: Omit<LayoutPlacement, 'write'>): SceneObject {
  return {
    id:prefix + (row.key ?? row.index), name:row.tag.path.split(/[\\/]/).at(-1) || row.tag.path, kind:'Source model',
    tagId:null, position:row.position, rotation:row.rotation, scale:[row.scale,row.scale,row.scale],
    visible:true, sourceOffset:null, rotationOffset:null, assetId:null,
    sourceModel:{projectId:project.id,sourceSha256:map.sha256,tagId:row.tag.id,path:row.tag.path,class:row.tag.class as PlacementClass},
  };
}

export function showHmvDevices(project: Project, map: MapInspection) {
  if (!project.forgeSidecar?.bytes || project.source?.sha256 !== map.sha256) {
    throw Error('Open the preserved base map for this Forge layout.');
  }
  const present = new Set(project.scene.map(object => object.id));
  const { rows } = parse(project.forgeSidecar, map);
  const added = rows.filter(row => isHmvDeviceGroup(row.tag.class) && !present.has(prefix + row.key))
    .map(row => placementObject(project, map, row));
  if (project.scene.length + added.length > 20000) throw Error('This layout exceeds the scene object limit.');
  return added.length ? { ...project, scene: [...project.scene, ...added] } : project;
}

function keysForHmv(layout: ForgeSidecar, count: number) {
  const keys = layout.recordKeys ?? Array.from({ length: count }, (_, index) => String(index));
  if (keys.length !== count || new Set(keys).size !== count || keys.some(key => !/^[a-z0-9-]{1,36}$/.test(key))) {
    throw Error('The saved Forge placement identities are invalid.');
  }
  return keys;
}

export function isHmvPlacement(project: Project, object: SceneObject) {
  return !!project.forgeSidecar?.bytes && object.id.startsWith(prefix);
}

export function hmvPlacementTag(project: Project, map: MapInspection, object: SceneObject | undefined, requireUnitScale = true) {
  if (!object || project.source?.sha256 !== map.sha256 || requireUnitScale && object.scale.some(value => !close(value, 1))) return;
  const source = object.sourceModel;
  if (source && (source.projectId !== project.id || source.sourceSha256 !== map.sha256)) return;
  const tag = map.tags.find(tag => tag.id === (source?.tagId ?? object.tagId));
  if (!tag || tag.external || !isHmvPlacementGroup(tag.class)
      || source && (source.class !== tag.class || pathKey(source.path) !== pathKey(tag.path))) return;
  return tag;
}

function isSpawn(object: SceneObject | undefined): object is SceneObject & { kind: 'Player spawn'; tagId: null } {
  return !!object && object.kind === 'Player spawn' && object.tagId === null && !object.sourceModel && !object.assetId;
}

export function canPlaceHmvSpawn(project: Project, map: MapInspection, object: SceneObject | undefined) {
  return isSpawn(object) && project.source?.sha256 === map.sha256 && map.header.scenarioType === 1
    && object.scale.every(value => close(value, 1));
}

function isTeleporter(object: SceneObject): object is SceneObject & { kind: 'Forge teleporter'; tagId: null } {
  return object.kind === 'Forge teleporter' && object.tagId === null && !object.sourceModel && !object.assetId;
}

function isObjective(object: SceneObject): object is SceneObject & { kind: 'Forge objective'; tagId: null } {
  return object.kind === 'Forge objective' && object.tagId === null && !object.sourceModel && !object.assetId;
}

function markerObject(id: string, position: Vec3, rotation: Vec3, role?: HmvTeleporterRole, type?: HmvObjectiveType): SceneObject {
  const objective = type === undefined ? null : hmvObjectiveDefinition(type);
  const kind = objective ? 'Forge objective' : role ? 'Forge teleporter' : 'Player spawn';
  const name = objective?.name ?? (role ? 'Forge teleporter ' + role : 'Forge player spawn');
  return { id, kind, name,
    tagId: null, position, rotation,
    scale: [1, 1, 1], visible: true, sourceOffset: null, rotationOffset: null, assetId: null };
}

export function showHmvMarkers(project: Project, map: MapInspection, kind: 'spawns' | 'teleporters' | 'objectives') {
  if (!project.forgeSidecar?.bytes || project.source?.sha256 !== map.sha256) {
    throw Error('Open the preserved base map for this Forge layout.');
  }
  const present = new Set(project.scene.map(object => object.id));
  const added = parse(project.forgeSidecar, map)[kind].filter(record => !present.has(record.id));
  if (project.scene.length + added.length > 20000) throw Error('This layout exceeds the scene object limit.');
  if (!added.length) return project;
  return { ...project, scene: [...project.scene, ...added.map(record => markerObject(record.id, record.position, record.rotation, 'role' in record ? record.role : undefined, 'properties' in record && 'type' in record.properties ? record.properties.type : undefined))] };
}

export function addHmvPlacement(project: Project, map: MapInspection, object: SceneObject, offsetX = 1) {
  const tag = hmvPlacementTag(project, map, object);
  const spawn = canPlaceHmvSpawn(project, map, object);
  const teleporter = isTeleporter(object) && isHmvPlacement(project, object);
  const objective = isObjective(object) && isHmvPlacement(project, object);
  if (!tag && !spawn && !teleporter && !objective) throw Error('Select an HMV marker or an unscaled object from the current base map.');
  if (project.forgeSidecar?.text !== undefined) throw Error('Export or remove the OpenCE text layout before creating an HMV.');
  if (project.scene.length >= 20000) throw Error('This layout exceeds the scene object limit.');
  if (tag && placementTags(map, HMV_PLACEMENT_GROUPS).get(tag.class + '|' + pathKey(tag.path))?.length !== 1) throw Error('This base-map tag path is ambiguous.');
  const previous = project.forgeSidecar;
  if (previous && previous.baseSha256 !== map.sha256) throw Error('Open the preserved base map for this Forge layout.');
  const layout = readHmv(previous?.bytes ?? Array.from(emptyHmv(map)), map);
  const position: Vec3 = [object.position[0] + offsetX, object.position[1], object.position[2]];
  const recordKeys = previous ? keysForHmv(previous, layout.recordsCount) : [];
  const key = crypto.randomUUID();
  const original = isHmvPlacement(project, object) ? selectedHmvRecord(project, map, object) : null;
  const rotation: Vec3 = spawn || teleporter || objective ? [object.rotation[0], 0, 0] : [...object.rotation];
  const placement = tag
    ? placementObject(project, map, { index: layout.recordsCount, key, tag, position, rotation, scale: 1 })
    : markerObject(prefix + key, position, rotation, original?.teleporter?.role, original?.objective?.properties.type);
  const bytes = original
    ? layout.duplicate(original.index, position, rotation)
    : tag ? layout.append(tag.class, pathKey(tag.path).replaceAll('/', '\\'), position, rotation)
    : layout.appendSpawn(position, rotation[0]);
  const savedBytes = Array.from(bytes);
  readHmv(savedBytes, map);
  return {
    selectedId: placement.id,
    project: {
      ...project,
      forgeSidecar: {
        name: previous?.name ?? layout.mapName.slice(0, 21) + '-layout.hmv',
        baseSha256: map.sha256,
        bytes: savedBytes,
        recordKeys: [...recordKeys, key],
      },
      scene: [...project.scene, placement],
    } satisfies Project,
  };
}

export function addHmvTeleporterPair(project: Project, map: MapInspection, anchor: SceneObject) {
  return appendHmvMarkers(project, map, 2, layout => {
    const [x, y, z] = anchor.position;
    const positions: Vec3[] = [[x + 1, y, z], [x + 3, y, z]];
    const yaw = anchor.rotation[0];
    return {
      bytes: layout.appendTeleporterPair(positions[0], positions[1], yaw),
      markers: positions.map((position, index) => markerObject(prefix + crypto.randomUUID(), position, [yaw, 0, 0], index === 0 ? 'sender' : 'receiver')),
    };
  });
}

export function addHmvObjective(project: Project, map: MapInspection, anchor: SceneObject, type: HmvObjectiveType) {
  return appendHmvMarkers(project, map, 1, layout => {
    const [x, y, z] = anchor.position;
    const position: Vec3 = [x + 1, y, z];
    const yaw = anchor.rotation[0];
    return {
      bytes: layout.appendObjective(position, yaw, type),
      markers: [markerObject(prefix + crypto.randomUUID(), position, [yaw, 0, 0], undefined, type)],
    };
  });
}

function appendHmvMarkers(project: Project, map: MapInspection, count: number,
  append: (layout: ReturnType<typeof readHmv>) => { bytes: Uint8Array; markers: SceneObject[] }) {
  const previous = project.forgeSidecar;
  if (project.source?.sha256 !== map.sha256 || map.header.scenarioType !== 1 || previous && previous.baseSha256 !== map.sha256) {
    throw Error('Open the matching multiplayer base map before placing Forge markers.');
  }
  if (previous?.text !== undefined) throw Error('Export or remove the OpenCE text layout before creating an HMV.');
  if (project.scene.length + count > 20000) throw Error('This layout exceeds the scene object limit.');
  const layout = readHmv(previous?.bytes ?? Array.from(emptyHmv(map)), map);
  const result = append(layout);
  const bytes = Array.from(result.bytes);
  readHmv(bytes, map);
  const markers = result.markers;
  const newKeys = markers.map(marker => marker.id.slice(prefix.length));
  const recordKeys = previous ? keysForHmv(previous, layout.recordsCount) : [];
  return {
    selectedId: markers[0].id,
    project: {
      ...project,
      forgeSidecar: {
        name: previous?.name ?? layout.mapName.slice(0, 21) + '-layout.hmv',
        baseSha256: map.sha256, bytes, recordKeys: [...recordKeys, ...newKeys],
      },
      scene: [...project.scene, ...markers],
    } satisfies Project,
  };
}

function selectedHmvRecord(project: Project, map: MapInspection, object: SceneObject) {
  const previous = project.forgeSidecar;
  if (!previous?.bytes || project.source?.sha256 !== map.sha256 || previous.baseSha256 !== map.sha256) {
    throw Error('Open the preserved base map for this Forge layout.');
  }
  const layout = readHmv(previous.bytes, map);
  const keys = keysForHmv(previous, layout.recordsCount);
  const index = keys.findIndex(key => prefix + key === object.id);
  if (isSpawn(object)) {
    const spawn = layout.spawnRecords.find(record => record.index === index);
    if (spawn) return { previous, layout, keys, index, spawn };
  } else if (isTeleporter(object)) {
    const teleporter = layout.teleporterRecords.find(record => record.index === index);
    if (teleporter) return { previous, layout, keys, index, teleporter };
  } else if (isObjective(object)) {
    const objective = layout.objectiveRecords.find(record => record.index === index);
    if (objective) return { previous, layout, keys, index, objective };
  } else {
    const record = layout.objectRecords.find(record => record.index === index);
    const tag = hmvPlacementTag(project, map, object, false);
    if (record && tag && tag.class === record.group && pathKey(tag.path) === pathKey(record.path)) {
      return { previous, layout, keys, index, record };
    }
  }
  throw Error('The selected object no longer matches its Forge record.');
}

export function updateHmvPlacementProperties(project: Project, map: MapInspection, object: SceneObject, properties: HmvPlacementProperties) {
  const { previous, layout, index, record } = selectedHmvRecord(project, map, object);
  if (!record) throw Error('Select an HMV object placement.');
  if (record.properties.team === properties.team && record.properties.physics === properties.physics
      && record.properties.respawnSeconds === properties.respawnSeconds
      && record.properties.placeAtStart === properties.placeAtStart) return project;
  const bytes = Array.from(layout.writeProperties(index, properties));
  readHmv(bytes, map);
  return { ...project, forgeSidecar: { ...previous, bytes } } satisfies Project;
}

export function updateHmvSpawnProperties(project: Project, map: MapInspection, object: SceneObject, properties: HmvSpawnProperties) {
  const { previous, layout, index, spawn } = selectedHmvRecord(project, map, object);
  if (!spawn) throw Error('Select an HMV player spawn.');
  if (spawn.properties.team === properties.team && spawn.properties.initial === properties.initial
      && spawn.properties.modes === properties.modes) return project;
  const bytes = Array.from(layout.writeSpawnProperties(index, properties));
  return { ...project, forgeSidecar: { ...previous, bytes } } satisfies Project;
}

export function changeHmvTeleporterChannel(project: Project, map: MapInspection, object: SceneObject, channel: number) {
  const { previous, layout, index, teleporter } = selectedHmvRecord(project, map, object);
  if (!teleporter) throw Error('Select an HMV teleporter endpoint.');
  if (teleporter.channel === channel) return project;
  const bytes = Array.from(layout.moveTeleporterChannel(index, channel));
  return { ...project, forgeSidecar: { ...previous, bytes } } satisfies Project;
}

export function changeHmvObjectiveSlot(project: Project, map: MapInspection, object: SceneObject, slot: number) {
  const { previous, layout, index, objective } = selectedHmvRecord(project, map, object);
  if (!objective) throw Error('Select a Forge objective.');
  if (objective.properties.slot === slot) return project;
  const bytes = Array.from(layout.writeObjectiveSlot(index, slot));
  return { ...project, forgeSidecar: { ...previous, bytes } } satisfies Project;
}

export function removeHmvPlacement(project: Project, map: MapInspection, object: SceneObject) {
  const { previous, layout, keys, index } = selectedHmvRecord(project, map, object);
  const bytes = layout.remove(index);
  return {
    ...project,
    forgeSidecar: { ...previous, bytes: Array.from(bytes), recordKeys: keys.filter((_, record) => record !== index) },
    scene: project.scene.filter(row => row.id !== object.id),
  } satisfies Project;
}

export function updateHmvLayoutDetails(project: Project, map: MapInspection, details: HmvLayoutDetails) {
  const previous = project.forgeSidecar;
  if (!previous?.bytes || previous.baseSha256 !== map.sha256 || project.source?.sha256 !== map.sha256) {
    throw Error('Open the preserved base map for this HMV layout.');
  }
  const layout = readHmv(previous.bytes, map);
  if (layout.details.title === details.title && layout.details.author === details.author
    && layout.details.description === details.description) return project;
  return { ...project, forgeSidecar: { ...previous, bytes: Array.from(layout.writeDetails(details)) } } satisfies Project;
}

export function exportForgeSidecar(project: Project, map: MapInspection, target?: ForgeLayoutTarget) {
  const sidecar = project.forgeSidecar;
  if (!sidecar || project.source?.sha256 !== map.sha256) throw Error('Open the preserved Forge base map to export this layout.');
  const layout = parse(sidecar, map);
  const { rows, finish, forerunner } = layout;
  if (target) {
    const issue = target === 'forerunner-local' && 'forerunnerLocalIssue' in layout
      ? layout.forerunnerLocalIssue : forerunner?.issue;
    if (!forerunner || issue) throw Error(issue ?? 'Forerunner’s HMV import needs a compatible binary layout.');
  }
  for (const row of rows) {
    const object = exportableLayoutObject(project, map, row);
    if (object) row.write(object.position, object.rotation);
  }
  if ('writeMarker' in layout && layout.writeMarker) for (const marker of [...layout.spawns, ...layout.teleporters, ...layout.objectives]) {
    const object = project.scene.find(candidate => candidate.id === marker.id);
    if (!object) continue;
    const matches = 'role' in marker ? isTeleporter(object)
      : 'type' in marker.properties ? isObjective(object) : isSpawn(object);
    if (!matches || object.scale.some(value => !close(value, 1))) {
      throw Error('A Forge marker was replaced or scaled. Restore it with Undo before exporting.');
    }
    layout.writeMarker(marker.index, object.position, object.rotation);
  }
  return finish();
}

function exportableLayoutObject(project: Project, map: MapInspection, row: LayoutPlacement) {
  const object = project.scene.find(candidate => candidate.id === prefix + (row.key ?? row.index));
  // Earlier Spark versions kept device records in the file without putting them in the scene.
  if (!object && isHmvDeviceGroup(row.tag.class)) return undefined;
  if (!object || object.sourceModel?.tagId !== row.tag.id || object.sourceModel.sourceSha256 !== map.sha256
      || object.sourceModel.projectId !== project.id || object.sourceModel.class !== row.tag.class
      || pathKey(object.sourceModel.path) !== pathKey(row.tag.path)) {
    throw Error('A Forge placement was removed or replaced. Restore it with Undo before exporting.');
  }
  if (object.scale.some(value => !close(value, row.scale))) {
    throw Error('This layout preserves its original scale. Restore the scale before exporting.');
  }
  return object;
}

function appendBaseHmvPlacement(layout: ReturnType<typeof readHmv>, map: HmvBaseIdentity, placement: {
  tagClass: string; tagPath: string; position: Vec3; rotation: Vec3; team: number; respawnSeconds: number;
}) {
  const next = readHmv(Array.from(layout.append(placement.tagClass, pathKey(placement.tagPath).replaceAll('/', '\\'),
    placement.position, placement.rotation)), map);
  if (placement.team === -1 && !placement.respawnSeconds) return next;
  return readHmv(Array.from(next.writeProperties(next.recordsCount - 1, {
    team: placement.team, respawnSeconds: placement.respawnSeconds, placeAtStart: true, physics: 'normal',
  })), map);
}

export function exportForerunnerTextHmv(project: Project, map: MapInspection) {
  const sidecar = project.forgeSidecar;
  if (!sidecar || typeof sidecar.text !== 'string' || sidecar.baseSha256 !== map.sha256 || project.source?.sha256 !== map.sha256) {
    throw Error('Open the preserved base map and its Forerunner text layout.');
  }
  const textLayout = parseText({ ...sidecar, text: sidecar.text }, map);
  if (textLayout.hmvConversionIssue) throw Error(textLayout.hmvConversionIssue);
  let layout = readHmv(Array.from(emptyHmv(map)), map);
  for (const row of textLayout.rows) {
    const object = exportableLayoutObject(project, map, row);
    if (!object) throw Error('A text layout placement is missing. Restore it before converting.');
    layout = appendBaseHmvPlacement(layout, map, {
      tagClass: row.tag.class, tagPath: row.tag.path, position: object.position, rotation: object.rotation,
      team: row.team, respawnSeconds: 0,
    });
  }
  return { bytes: layout.writeDetails({ title: 'Converted Forge layout', author: '', description: '' }),
    name: layout.mapName.slice(0, 18) + '-converted.hmv' };
}

export function exportForgePlacementSnapshot(
  placements: readonly ForgePlacement[], map: ForgeLayoutBase, revision: number,
  target?: ForgeLayoutTarget, author = '',
) {
  if (!placements.length || placements.length > 256) {
    throw Error('A Forge layout needs 1–256 shared placements.');
  }
  const tags = placementTags(map, HMV_PLACEMENT_GROUPS);
  let layout = readHmv(Array.from(emptyHmv(map)), map);
  for (const placement of placements) {
    const label = placement.name || placement.id;
    if (placement.sourceSha256 !== map.sha256 || placement.publishedAssetId || placement.nativeName || placement.transportSignals) {
      throw Error(`“${label}” needs the matching base map and an ordinary placement without published assets or scripted names.`);
    }
    const key = pathKey(placement.tagPath);
    const matches = tags.get(placement.tagClass + '|' + key);
    if (matches?.length !== 1 || matches[0].id !== placement.tagId) {
      throw Error(`“${label}” does not resolve to one exact base-map tag.`);
    }
    layout = appendBaseHmvPlacement(layout, map, placement);
  }
  const issue = target === 'forerunner-local' ? layout.forerunnerLocalIssue : target ? layout.forerunnerIssue : null;
  if (issue) throw Error(issue);
  const bytes = layout.writeDetails({ title: 'SparkLink revision ' + revision, author, description: '' });
  return {
    bytes,
    name: target ? 'import.hmv' : layout.mapName.slice(0, 16) + '-sparklink.hmv',
  };
}

export function removeForgeSidecar(project: Project): Project {
  return {...project,forgeSidecar:null,scene:project.scene.filter(object=>!object.id.startsWith(prefix))};
}
