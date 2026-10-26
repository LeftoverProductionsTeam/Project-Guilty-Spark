#!/usr/bin/env node
/**
 * Read-only check for Halo PC/Mac Demo/CE cached GBX models.
 * Requires a map supplied by its owner; does not extract, modify, or upload it.
 * This checks structure/bounds, not real-time renderer correctness or gameplay.
 * Usage: node scripts/verify-halo-models.mjs path/to/bloodgulch.map
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/verify-halo-models.mjs <owned-halo-map.map>');
  process.exit(2);
}
const input = resolve(path);
const fileStat = await stat(input);
if (fileStat.size < 2048 || fileStat.size > 512 * 1024 * 1024) {
  throw new Error('Expected a 2 KiB to 512 MiB Halo cache file');
}
const data = await readFile(input);
function checked(at, len = 4) {
  if (!Number.isSafeInteger(at) || at < 0 || at + len > data.length) {
    throw new Error(`Read outside map at 0x${at.toString(16)}`);
  }
  return at;
}
const u32 = (at) => data.readUInt32LE(checked(at));
const u16 = (at) => data.readUInt16LE(checked(at, 2));
const f32 = (at) => data.readFloatLE(checked(at));
const demo = u32(0x2c0) === 0x45686564 && u32(0x5f0) === 0x47666f74;
const version = u32(demo ? 0x588 : 4);
if (![6, 7, 609].includes(version)) throw new Error(`Only Demo, PC and Custom Edition model layouts are checked; got ${version}`);
const tagStart = u32(demo ? 0x5ec : 0x10);
const tagSize = u32(demo ? 0x2c4 : 0x14);
const tagEnd = tagStart + tagSize;
checked(tagStart, tagSize);
const base = version === 6 ? 0x4bf10000 : 0x40440000;
function ptr(p, len = 1) {
  const offset = tagStart + p - base;
  if (offset < tagStart || offset + len > tagEnd) throw new Error(`Tag pointer 0x${p.toString(16)} outside tag region`);
  return checked(offset, len);
}
function block(at, stride, max) {
  const count = u32(at);
  if (count > max) throw new Error(`Reflexive count ${count} exceeds ${max}`);
  return [count ? ptr(u32(at + 4), count * stride) : 0, count];
}
const count = u32(tagStart + 12);
if (count < 1 || count > 65535) throw new Error('Invalid tag count');
const table = ptr(u32(tagStart), count * 32);
const tags = new Map();
const scenery = [];
for (let i = 0; i < count; i++) {
  const at = table + i * 32;
  const klass = [...data.subarray(at, at + 4)].reverse().map((v) => String.fromCharCode(v)).join('');
  const id = u32(at + 12);
  const tag = { id, klass, at: klass === 'sbsp' || u32(at + 24) ? null : ptr(u32(at + 20)) };
  tags.set(id, tag);
  if (klass === 'scen') scenery.push(tag);
}
const rawStart = u32(tagStart + 20);
const rawVertexSize = u32(tagStart + 28);
checked(rawStart, rawVertexSize);
const counts = { recognizedScenery: scenery.length, staticModelTypes: 0, skippedMultiNode: 0, unsupportedOrCorrupt: 0, decodedVertices: 0, decodedTriangles: 0 };
const details = [];
for (const t of scenery) {
  try {
    if (t.at === null) throw new Error('External or missing scenery tag');
    const model = tags.get(u32(t.at + 52));
    if (!model || model.klass !== 'mod2' || model.at === null) throw new Error('No local GBX model');
    const nodeCount = u32(model.at + 184);
    if (nodeCount > 1) {
      counts.skippedMultiNode++;
      continue;
    }
    const [regions, regionCount] = block(model.at + 196, 76, 32);
    const [geometries, geometryCount] = block(model.at + 208, 48, 256);
    const geometryIds = new Set();
    for (let i = 0; i < regionCount; i++) {
      const [permutations, permutationCount] = block(regions + i * 76 + 64, 88, 32);
      if (!permutationCount) continue;
      for (const d of [72, 70, 68, 66, 64]) {
        const index = u16(permutations + d);
        if (index < geometryCount) { geometryIds.add(index); break; }
      }
    }
    if (!geometryIds.size && geometryCount) geometryIds.add(0);
    let vertices = 0, triangles = 0;
    for (const g of geometryIds) {
      const [parts, partCount] = block(geometries + g * 48 + 36, 132, 32);
      for (let i = 0; i < partCount; i++) {
        const part = parts + i * 132;
        const triangleCount = u32(part + 72);
        const triangleOffset = u32(part + 76);
        const vertexCount = u32(part + 88);
        // +96 is a transient runtime pointer, NOT an offset. +100 is file-relative.
        const vertexOffset = u32(part + 100);
        if (!vertexCount || !triangleCount) continue;
        if (vertexCount > 65535 || triangleCount > 131072 || vertexOffset + vertexCount * 68 > rawVertexSize) {
          throw new Error('Vertex geometry outside model data');
        }
        const vertexStart = rawStart + vertexOffset;
        checked(vertexStart, vertexCount * 68);
        for (let v = 0; v < vertexCount; v++) {
          const at = vertexStart + v * 68;
          for (const d of [0, 4, 8, 12, 16, 20]) {
            const n = f32(at + d);
            if (!Number.isFinite(n) || Math.abs(n) > 100000) throw new Error('Invalid vertex or normal');
          }
        }
        const indexStart = rawStart + rawVertexSize + triangleOffset;
        checked(indexStart, (triangleCount + 2) * 2);
        for (let k = 0; k < triangleCount + 2; k++) {
          const index = u16(indexStart + k * 2);
          if (index !== 0xffff && index >= vertexCount) throw new Error('Out-of-range triangle index');
        }
        vertices += vertexCount;
        triangles += triangleCount;
      }
    }
    if (!triangles) throw new Error('No usable triangle data');
    counts.staticModelTypes++;
    counts.decodedVertices += vertices;
    counts.decodedTriangles += triangles;
  } catch (error) {
    counts.unsupportedOrCorrupt++;
    details.push({ tagId: `0x${t.id.toString(16)}`, reason: String(error?.message ?? error) });
  }
}
console.log(JSON.stringify({ map: input, cacheVersion: version, ...counts, notes: details.slice(0, 12), verifiedScope: 'bounded static geometry only; no texture/render/gameplay claim' }, null, 2));
if (!counts.staticModelTypes) process.exitCode = 1;
