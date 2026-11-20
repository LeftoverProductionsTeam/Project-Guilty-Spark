import { crc32 } from './sourceZip';
import type { MapInspection, Vec3 } from './types';

// Chupathingy Forge layout format, versions 1–7. See the pinned upstream
// format reference in docs/RUNTIME_INTEGRATION_20261107.md.
export const HMV_LIMIT = 65536;
export const HMV_NAME = /^(?!(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\.hmv$)[a-z0-9_-]{1,28}\.hmv$/;
const headerSize = 64;
const recordSize = 48;
const metadataSizes = [32, 32, 128, 17] as const;
const metadataControl = /[\u0000-\u001f\u007f-\u009f]/;
export type HmvLayoutDetails = { title: string; author: string; description: string };
export const HMV_TELEPORTER_CHANNELS = 16;
const teleporterLimit = 32;
const objectiveLimit = 64;
const hillPointLimit = 12;

export const HMV_OBJECTIVES = [
  { type: 0, name: 'CTF flag', slotLabel: 'Flag team', slots: 2 },
  { type: 8, name: 'Hill point', slotLabel: 'Hill number', slots: 16 },
  { type: 2, name: 'Oddball spawn', slotLabel: 'Ball number', slots: 16 },
  { type: 3, name: 'Race checkpoint', slotLabel: 'Checkpoint order', slots: 32 },
] as const;

export type HmvObjectiveType = typeof HMV_OBJECTIVES[number]['type'];
export type HmvObjectiveProperties = { type: HmvObjectiveType; slot: number };

export function hmvObjectiveDefinition(type: number) {
  return HMV_OBJECTIVES.find(definition => definition.type === type);
}
const physicsBits = { normal: 0, fixed: 0x10, phased: 0x20 } as const;
const physicsMask = physicsBits.fixed | physicsBits.phased;

export interface HmvSpawnProperties {
  team: number;
  initial: boolean;
  modes: number;
}

export const HMV_SPAWN_MODES = ['Capture the Flag', 'Slayer', 'Oddball', 'King of the Hill', 'Race', 'Infection'];

export type HmvTeleporterRole = 'sender' | 'receiver';

export interface HmvPlacementProperties {
  team: number;
  respawnSeconds: number;
  placeAtStart: boolean;
  physics: keyof typeof physicsBits;
}
const forerunnerGroups = ['scen', 'vehi', 'weap', 'eqip'];
const groups = [...forerunnerGroups, 'bipd', 'mach', 'ctrl', 'lifi', 'actv'];
const groupCode = (name: string) => Array.from(name).reduce((code, c) => code * 256 + c.charCodeAt(0), 0);
const groupNames = new Map(groups.map(group => [groupCode(group), group]));
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const transformsValid = (values: number[]) => values.length === 6 && values.every((value, index) =>
  Number.isFinite(value) && (index < 3 ? Math.abs(Math.fround(value)) < 5000 : Math.abs(Math.fround(value)) <= Math.fround(Math.fround(Math.PI) + 0.0001)));

function requireLayout(condition: unknown, reason: string): asserts condition {
  if (!condition) throw Error('Chupathingy Forge layout: ' + reason);
}

function hmvPathValid(path: string) {
  return path.length >= 1 && path.length <= 127 && /^[a-z0-9_ .\\-]+$/.test(path)
    && !path.includes('..') && path.split('\\').every(part => part.length);
}

export function supportsHmvMap(map: MapInspection) {
  return (map.header.version === 5 && map.header.scenarioType === 1
      || map.header.version === 609 && [0, 1].includes(map.header.scenarioType))
    && /^[a-z0-9_]{1,31}$/.test(scenarioShortName(map));
}

function scenarioShortName(map: MapInspection) {
  return (map.scenarioPath?.split(/[\\/]/).at(-1) || map.header.name).toLowerCase();
}

function writeChecksum(bytes: Uint8Array, view: DataView) {
  view.setUint32(56, bytes.length - headerSize, true);
  view.setUint32(60, crc32(bytes.subarray(headerSize)), true);
}

function writePose(view: DataView, offset: number, position: Vec3, rotation: Vec3, yawOnly = false) {
  const values = [...position, rotation[0], -rotation[1], rotation[2]];
  requireLayout(transformsValid(values), 'an edited placement is outside the supported coordinate or angle range.');
  requireLayout(!yawOnly || rotation[1] === 0 && rotation[2] === 0, 'layout markers only support yaw.');
  const count = yawOnly ? 4 : 6;
  for (let index = 0; index < count; index++) view.setFloat32(offset + index * 4, values[index], true);
}

export function emptyHmv(map: MapInspection) {
  requireLayout(supportsHmvMap(map), 'choose a supported base map with a valid scenario name.');
  const meta = encoder.encode('Spark Forge layout\0\0\0\0');
  const bytes = new Uint8Array(headerSize + meta.length);
  const view = new DataView(bytes.buffer);
  bytes.set(encoder.encode('HFRG'));
  view.setUint16(4, 1, true);
  view.setUint16(6, headerSize, true);
  bytes.set(encoder.encode(scenarioShortName(map)), 12);
  view.setUint32(44, map.header.crc32, true);
  view.setUint16(54, meta.length, true);
  bytes.set(meta, headerSize);
  writeChecksum(bytes, view);
  return bytes;
}

function paddedName(bytes: Uint8Array, pattern: RegExp, requiresZero = false) {
  const zero = bytes.indexOf(0);
  requireLayout((!requiresZero || zero >= 0) && (zero < 0 || bytes.subarray(zero).every(value => value === 0)), 'invalid name padding.');
  const name = ascii(zero < 0 ? bytes : bytes.subarray(0, zero));
  requireLayout(pattern.test(name), 'invalid map or pack name.');
  return name;
}

export function readHmv(input: number[], map: MapInspection) {
  requireLayout(input.length >= headerSize && input.length <= HMV_LIMIT
    && input.every(value => Number.isInteger(value) && value >= 0 && value <= 255), 'invalid file length or bytes.');
  const bytes = Uint8Array.from(input);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  requireLayout(ascii(bytes.subarray(0, 4)) === 'HFRG' && u16(6) === headerSize, 'invalid file header.');
  const version = u16(4);
  requireLayout(version >= 1 && version <= 7, 'choose a supported version 1–7 .hmv file.');
  const mapName = paddedName(bytes.subarray(12, 44), /^[a-z0-9_]{1,31}$/, true);
  requireLayout(supportsHmvMap(map) && mapName === scenarioShortName(map) && u32(44) === (map.header.crc32 >>> 0),
    'open the matching Xbox multiplayer or Halo Custom Edition base map. The scenario name and original cache checksum must match.');
  const packs = u16(48), pathsCount = u16(50), recordsCount = u16(52), metaSize = u16(54);
  requireLayout(packs <= 8 && pathsCount <= 256 && recordsCount <= 256 && metaSize >= 4 && metaSize <= 2048
    && u32(56) === bytes.length - headerSize, 'invalid section sizes or counts.');
  requireLayout(crc32(bytes.subarray(headerSize)) === u32(60), 'payload checksum failed.');
  const recordsEnd = bytes.length - metaSize;
  const recordsStart = recordsEnd - recordsCount * recordSize;
  let offset = headerSize + packs * 32;
  requireLayout(offset <= recordsStart, 'overlapping sections.');
  for (let at = headerSize; at < offset; at += 32) {
    paddedName(bytes.subarray(at + 8, at + 32), /^[a-z0-9_ -]{1,24}$/);
  }
  const paths = new Map<string, { group: string; path: string }>();
  for (let i = 0; i < pathsCount; i++) {
    requireLayout(offset + 5 <= recordsStart, 'truncated tag paths.');
    const group = groupNames.get(u32(offset));
    const size = bytes[offset + 4];
    offset += 5;
    requireLayout(group && size >= 1 && size <= 127 && offset + size <= recordsStart, 'invalid tag path group or length.');
    const path = ascii(bytes.subarray(offset, offset + size));
    offset += size;
    const key = group + '|' + path;
    requireLayout(hmvPathValid(path) && !paths.has(key), 'invalid or repeated tag path.');
    paths.set(key, { group, path });
  }
  requireLayout(offset === recordsStart, 'unexpected bytes before placement records.');

  const pathList = [...paths.values()];
  const objectRecords: { index: number; group: string; path: string; position: Vec3; rotation: Vec3; properties: HmvPlacementProperties }[] = [];
  const spawnRecords: { index: number; position: Vec3; rotation: Vec3; properties: HmvSpawnProperties }[] = [];
  const teleporterRecords: { index: number; position: Vec3; rotation: Vec3; channel: number; role: HmvTeleporterRole }[] = [];
  const recordVersions = new Uint8Array(recordsCount).fill(1);
  let forerunnerIssue = packs ? 'Forerunner’s base layout cannot use object packs.'
    : recordsCount < 1 || recordsCount > 128 ? 'Forerunner needs 1–128 placements.' : null;
  const objectiveRecords: { index: number; position: Vec3; rotation: Vec3; properties: HmvObjectiveProperties }[] = [];
  let markers = false, senders = 0, receivers = 0;
  const hills = new Uint8Array(16);
  for (let index = 0; index < recordsCount; index++, offset += recordSize) {
    const kind = bytes[offset + 2], team = view.getInt8(offset + 3);
    const transform = Array.from({ length: 6 }, (_, field) => view.getFloat32(offset + 4 + field * 4, true));
    const respawn = u16(offset + 28), count = bytes[offset + 30], modes = u16(offset + 31);
    const variant = bytes[offset + 33], flags = bytes[offset + 34], aiTeam = bytes[offset + 35];
    const pathIndex = u16(offset), ref = pathList[pathIndex];
    const physics = flags & physicsMask, actor = ref?.group === 'actv';
    const invalid = 'invalid placement record ' + (index + 1) + '.';
    requireLayout(transformsValid(transform) && bytes.subarray(offset + 36, offset + recordSize).every(value => value === 0), invalid);
    markers ||= kind !== 0;
    const ordinary = kind === 0 && !!ref && forerunnerGroups.includes(ref.group)
      && !respawn && !modes && !variant && flags <= 1 && !aiTeam;
    if (!forerunnerIssue && (!ordinary || count !== 1 || flags !== 1)) {
      forerunnerIssue = `Forerunner cannot import record ${index + 1}. It must be one base-map object placed at start with standard physics and no respawn timer, AI or game-mode settings.`;
    }

    if (kind === 5 || kind === 7 || kind === 8) {
      requireLayout(pathIndex === 0xffff && team >= 0 && !respawn && !count && !modes && !flags
        && !aiTeam && transform[4] === 0 && transform[5] === 0, invalid);
      if (kind === 5) {
        const definition = hmvObjectiveDefinition(variant);
        requireLayout(version >= 6 && definition && team < definition.slots, invalid);
        requireLayout(objectiveRecords.length < objectiveLimit
          && (variant !== 8 || ++hills[team] <= hillPointLimit), 'too many game type objects.');
        const [x, y, z, yaw] = transform;
        objectiveRecords.push({
          index, position: [x, y, z], rotation: [yaw, 0, 0], properties: { type: definition.type, slot: team },
        });
        recordVersions[index] = 6;
      } else {
        requireLayout(version >= 5 && team < HMV_TELEPORTER_CHANNELS && !variant, invalid);
        requireLayout(teleporterRecords.length < teleporterLimit, 'too many teleporters.');
        const [x, y, z, yaw] = transform;
        teleporterRecords.push({ index, position: [x, y, z], rotation: [yaw, 0, 0], channel: team, role: kind === 7 ? 'sender' : 'receiver' });
        if (kind === 7) senders |= 1 << team;
        else receivers |= 1 << team;
        recordVersions[index] = 5;
      }
      continue;
    }

    const spawn = kind === 2 && version >= 4;
    requireLayout(kind === 0 ? ref : kind === 1 ? actor : kind === 2 ? pathIndex === 0xffff
      : kind === 3 ? ref?.group === 'weap' || ref?.group === 'eqip' : kind === 4 && ref?.group === 'vehi', invalid);
    const allowedFlags = version >= 7 ? 0x3f : version >= 4 ? 0x0f : (1 << version) - 1;
    requireLayout(team >= -1 && team <= 7 && respawn <= 600 && count <= (kind === 0 ? 1 : 16) && variant <= 15
      && !(flags & ~allowedFlags) && !(modes & ~(spawn ? 0x3f : 0x1f))
      && (spawn ? team <= 1 && !respawn && !count && !variant && !aiTeam && !(flags & ~8) : !(flags & 8))
      && aiTeam < 6 && (version >= 2 && actor || (!aiTeam && !(flags & 2)))
      && (!(flags & 4) || actor && respawn > 0)
      && (!physics || kind === 0 && !actor && physics !== physicsMask), invalid);
    if (physics) recordVersions[index] = 7;
    else if (spawn) recordVersions[index] = 4;
    else if (flags & 4) recordVersions[index] = 3;
    else if (aiTeam || (flags & 2)) recordVersions[index] = 2;
    if (spawn && transform[4] === 0 && transform[5] === 0) {
      const [x, y, z, yaw] = transform;
      spawnRecords.push({ index, position: [x, y, z], rotation: [yaw, 0, 0], properties: { team, initial: !!(flags & 8), modes } });
    }
    if (kind === 0 && ref) {
      const [x, y, z, yaw, pitch, roll] = transform;
      objectRecords.push({
        index, ...ref, position: [x, y, z], rotation: [yaw, -pitch, roll],
        properties: {
          team, respawnSeconds: respawn, placeAtStart: (flags & 1) !== 0,
          physics: physics === physicsBits.fixed ? 'fixed' : physics === physicsBits.phased ? 'phased' : 'normal',
        },
      });
    }
  }
  requireLayout(u32(8) === Number(markers) && !(senders & ~receivers), 'marker flags or teleporter pairs are invalid.');
  requireLayout(version < 3 || recordVersions.includes(version), 'the declared version is missing its required record type.');

  const meta = bytes.subarray(recordsEnd);
  const fields = [];
  let start = 0;
  for (const limit of metadataSizes) {
    const end = meta.indexOf(0, start);
    requireLayout(end >= start && end - start < limit, 'invalid layout metadata size.');
    let field: string;
    try { field = decoder.decode(meta.subarray(start, end)); }
    catch { throw Error('Chupathingy Forge layout: metadata must be UTF-8.'); }
    requireLayout(!metadataControl.test(field), 'invalid metadata characters.');
    fields.push(field);
    start = end + 1;
  }
  requireLayout(start === meta.length && fields[0] && (!fields[3] || /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(fields[3])),
    'invalid layout title, date or metadata length.');

  const [title, author, description, date] = fields;
  const details: HmvLayoutDetails = { title, author, description };

  function rebuild(records: Uint8Array[], newPath?: Uint8Array, nextVersion = version, nextMeta = meta) {
    const recordsLength = records.reduce((sum, record) => sum + record.length, 0);
    const length = recordsStart + (newPath?.length ?? 0) + recordsLength + nextMeta.length;
    requireLayout(length <= HMV_LIMIT, 'the layout would exceed 64 KiB.');
    const output = new Uint8Array(length);
    const next = new DataView(output.buffer);
    let cursor = 0;
    const sections = [bytes.subarray(0, recordsStart), ...(newPath ? [newPath] : []), ...records, nextMeta];
    for (const section of sections) {
      output.set(section, cursor);
      cursor += section.length;
    }
    next.setUint16(4, nextVersion, true);
    const hasMarkers = records.some(section => section.some((value, byte) => byte % recordSize === 2 && value !== 0));
    next.setUint32(8, Number(hasMarkers), true);
    next.setUint16(50, pathsCount + (newPath ? 1 : 0), true);
    next.setUint16(52, recordsLength / recordSize, true);
    next.setUint16(54, nextMeta.length, true);
    writeChecksum(output, next);
    return output;
  }

  function editableRecord(index: number) {
    const record = objectRecords.find(record => record.index === index);
    requireLayout(record && forerunnerGroups.includes(record.group), 'select a base-map scenery, vehicle, weapon or equipment placement.');
    return record;
  }

  function versionWithoutFeatureAt(index: number) {
    if (recordVersions[index] !== version) return version;
    return Math.max(1, ...recordVersions.filter((_, record) => record !== index));
  }

  function writeSpawn(view: DataView, offset: number, properties: HmvSpawnProperties) {
    const { team, initial, modes } = properties;
    requireLayout(Number.isInteger(team) && team >= -1 && team <= 1 && typeof initial === 'boolean'
      && Number.isInteger(modes) && modes >= 0 && modes <= 0x3f, 'the player spawn properties are out of range.');
    view.setInt8(offset + 3, team);
    view.setUint16(offset + 31, modes, true);
    view.setUint8(offset + 34, initial ? 8 : 0);
  }

  function isMarker(index: number) {
    return [spawnRecords, teleporterRecords, objectiveRecords].some(records => records.some(record => record.index === index));
  }

  function requireObjectiveSlot(type: HmvObjectiveType, slot: number, index?: number) {
    const definition = hmvObjectiveDefinition(type);
    requireLayout(definition && Number.isInteger(slot) && slot >= 0 && slot < definition.slots,
      'choose a valid objective index.');
    requireLayout(type !== 8 || objectiveRecords.filter(record => record.index !== index
      && record.properties.type === 8 && record.properties.slot === slot).length < hillPointLimit,
      'that hill already has 12 points.');
  }

  function requireEditablePlacement(index: number) {
    if (isMarker(index)) return;
    editableRecord(index);
  }

  function appendRecord(record: Uint8Array, entry?: Uint8Array, nextVersion = version) {
    requireLayout(recordsCount < 256, 'this layout has reached its 256-record limit.');
    return rebuild([bytes.subarray(recordsStart, recordsEnd), record], entry, nextVersion);
  }

  return {
    objectRecords,
    spawnRecords,
    teleporterRecords,
    objectiveRecords,
    details,
    date,
    recordsCount,
    mapName,
    forerunnerIssue,
    write(index: number, position: Vec3, rotation: Vec3) {
      writePose(view, recordsStart + index * recordSize + 4, position, rotation, isMarker(index));
    },
    writeDetails(updated: HmvLayoutDetails) {
      requireLayout(updated.title.length > 0, 'enter a layout title.');
      const values = [updated.title, updated.author, updated.description, date];
      for (const [index, value] of values.entries()) {
        const encoded = encoder.encode(value);
        requireLayout(encoded.length < metadataSizes[index] && !metadataControl.test(value)
          && decoder.decode(encoded) === value,
          `${['Title', 'Author', 'Description', 'Date'][index]} must fit ${metadataSizes[index] - 1} UTF-8 bytes without control characters.`);
      }
      const replacement = encoder.encode(values.join('\0') + '\0');
      return rebuild([bytes.subarray(recordsStart, recordsEnd)], undefined, version, replacement);
    },
    append(group: string, path: string, position: Vec3, rotation: Vec3) {
      requireLayout(forerunnerGroups.includes(group) && hmvPathValid(path), 'the selected tag cannot be placed.');
      let pathIndex = pathList.findIndex(item => item.group === group && item.path === path);
      let entry: Uint8Array | undefined;
      if (pathIndex < 0) {
        requireLayout(pathsCount < 256, 'this layout has reached its 256-tag limit.');
        pathIndex = pathsCount;
        entry = new Uint8Array(5 + path.length);
        new DataView(entry.buffer).setUint32(0, groupCode(group), true);
        entry[4] = path.length;
        entry.set(encoder.encode(path), 5);
      }
      const record = new Uint8Array(recordSize);
      const recordView = new DataView(record.buffer);
      recordView.setUint16(0, pathIndex, true);
      recordView.setInt8(3, -1);
      writePose(recordView, 4, position, rotation);
      record[30] = 1;
      record[34] = 1;
      return appendRecord(record, entry);
    },
    appendSpawn(position: Vec3, yaw: number) {
      const record = new Uint8Array(recordSize);
      const recordView = new DataView(record.buffer);
      recordView.setUint16(0, 0xffff, true);
      record[2] = 2;
      writeSpawn(recordView, 0, { team: -1, initial: false, modes: 0 });
      writePose(recordView, 4, position, [yaw, 0, 0], true);
      return appendRecord(record, undefined, Math.max(version, 4));
    },
    appendTeleporterPair(sender: Vec3, receiver: Vec3, yaw: number) {
      requireLayout(recordsCount <= 254 && teleporterRecords.length <= teleporterLimit - 2,
        'the layout has no room for another two teleporter endpoints.');
      const used = senders | receivers;
      const channel = Array.from({ length: HMV_TELEPORTER_CHANNELS }, (_, index) => index)
        .find(index => !(used & (1 << index)));
      requireLayout(channel !== undefined, 'all teleporter channels are in use.');
      const endpoints = [sender, receiver].map((position, index) => {
        const record = new Uint8Array(recordSize);
        const view = new DataView(record.buffer);
        view.setUint16(0, 0xffff, true);
        record[2] = 7 + index;
        record[3] = channel;
        writePose(view, 4, position, [yaw, 0, 0], true);
        return record;
      });
      return rebuild([bytes.subarray(recordsStart, recordsEnd), ...endpoints], undefined, Math.max(version, 5));
    },
    appendObjective(position: Vec3, yaw: number, type: HmvObjectiveType) {
      requireLayout(objectiveRecords.length < objectiveLimit, 'this layout has reached its 64-objective limit.');
      const sameType = objectiveRecords.filter(record => record.properties.type === type);
      const usedSlots = new Set(sameType.map(record => record.properties.slot));
      let slot = 0;
      if (type === 0 && usedSlots.has(0) && !usedSlots.has(1)) slot = 1;
      if (type === 3) slot = Math.min(sameType.length, 31);
      if (type === 8) {
        slot = sameType.at(-1)?.properties.slot ?? 0;
        if (hills[slot] >= hillPointLimit) slot = hills.findIndex(count => count < hillPointLimit);
      }
      requireObjectiveSlot(type, slot);
      const record = new Uint8Array(recordSize);
      const recordView = new DataView(record.buffer);
      recordView.setUint16(0, 0xffff, true);
      record[2] = 5;
      record[3] = slot;
      record[33] = type;
      writePose(recordView, 4, position, [yaw, 0, 0], true);
      return appendRecord(record, undefined, Math.max(version, 6));
    },
    writeObjectiveSlot(index: number, slot: number) {
      const objective = objectiveRecords.find(record => record.index === index);
      requireLayout(objective, 'select a Forge objective.');
      requireObjectiveSlot(objective.properties.type, slot, index);
      bytes[recordsStart + index * recordSize + 3] = slot;
      writeChecksum(bytes, view);
      return bytes;
    },
    duplicate(index: number, position: Vec3, rotation: Vec3) {
      requireEditablePlacement(index);
      const start = recordsStart + index * recordSize;
      const record = bytes.slice(start, start + recordSize);
      const teleporter = record[2] === 7 || record[2] === 8;
      requireLayout(!teleporter || teleporterRecords.length < teleporterLimit, 'too many teleporters.');
      const objective = objectiveRecords.find(record => record.index === index);
      if (objective) {
        requireLayout(objectiveRecords.length < objectiveLimit, 'this layout has reached its 64-objective limit.');
        requireObjectiveSlot(objective.properties.type, objective.properties.slot);
      }
      writePose(new DataView(record.buffer), 4, position, rotation, isMarker(index));
      return appendRecord(record);
    },
    writeProperties(index: number, properties: HmvPlacementProperties) {
      editableRecord(index);
      const { team, respawnSeconds, placeAtStart, physics } = properties;
      requireLayout(Number.isInteger(team) && team >= -1 && team <= 7
        && Number.isInteger(respawnSeconds) && respawnSeconds >= 0 && respawnSeconds <= 600
        && typeof placeAtStart === 'boolean' && Object.hasOwn(physicsBits, physics), 'the placement properties are out of range.');
      const at = recordsStart + index * recordSize;
      view.setUint16(4, physics !== 'normal' ? 7 : version === 7 ? versionWithoutFeatureAt(index) : version, true);
      view.setInt8(at + 3, team);
      view.setUint16(at + 28, respawnSeconds, true);
      bytes[at + 34] = (bytes[at + 34] & ~(1 | physicsMask)) | physicsBits[physics] | Number(placeAtStart);
      writeChecksum(bytes, view);
      return bytes;
    },
    writeSpawnProperties(index: number, properties: HmvSpawnProperties) {
      requireLayout(spawnRecords.some(record => record.index === index), 'select an HMV player spawn.');
      writeSpawn(view, recordsStart + index * recordSize, properties);
      writeChecksum(bytes, view);
      return bytes;
    },
    moveTeleporterChannel(index: number, channel: number) {
      const endpoint = teleporterRecords.find(record => record.index === index);
      requireLayout(endpoint, 'select a Forge teleporter endpoint.');
      requireLayout(Number.isInteger(channel) && channel >= 0 && channel < HMV_TELEPORTER_CHANNELS, 'choose a valid teleporter channel.');
      requireLayout(channel === endpoint.channel || !( (senders | receivers) & (1 << channel)),
        'another group of teleporters already uses that channel.');
      for (const record of teleporterRecords) {
        if (record.channel === endpoint.channel) bytes[recordsStart + record.index * recordSize + 3] = channel;
      }
      writeChecksum(bytes, view);
      return bytes;
    },
    remove(index: number) {
      requireEditablePlacement(index);
      const endpoint = teleporterRecords.find(record => record.index === index);
      if (endpoint?.role === 'receiver') {
        const others = teleporterRecords.filter(record => record.index !== index && record.channel === endpoint.channel);
        requireLayout(!others.some(record => record.role === 'sender') || others.some(record => record.role === 'receiver'),
          'remove the linked senders before removing their last receiver.');
      }
      const start = recordsStart + index * recordSize;
      const records = [bytes.subarray(recordsStart, start), bytes.subarray(start + recordSize, recordsEnd)];
      return rebuild(records, undefined, versionWithoutFeatureAt(index));
    },
    finish() {
      writeChecksum(bytes, view);
      return bytes;
    },
  };
}
