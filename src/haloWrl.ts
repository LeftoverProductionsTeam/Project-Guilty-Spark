/** Halo 1 Tool WRL 1.0 error-geometry reader.
 * Read-only diagnostic overlay: NOT a geometry repair tool or proof of a valid BSP.
 * Parser intentionally supports only the VRML 1.0 subset emitted by Halo 1 Tool.
 * The original WRL, game maps and tags are never written or changed.
 * Reference: https://reclaimers.net/general/source-data/wrl/
 */
import type { Vec3 } from './types';

export interface WrlSegment { start: Vec3; end: Vec3; color: Vec3; region: number }
export interface WrlFace { a: Vec3; b: Vec3; c: Vec3; color: Vec3; region: number }
export interface WrlDiagnostics {
  format: 'Halo Tool VRML 1.0';
  segments: WrlSegment[];
  faces: WrlFace[];
  regions: number;
  bounds: { min: Vec3; max: Vec3 };
  /** 0.01 converts Halo Tool's source centimetres into Guilty Spark world units. */
  coordinateScale: number;
  notes: string[];
}
const MAX_FILE = 2 * 1024 * 1024;
const MAX_REGIONS = 256;
const MAX_VERTICES = 60000;
const MAX_PRIMITIVES = 75000;
const MAX_FAN = 256;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function block(source: string, name: string, startAt = 0): { text: string; end: number } | null {
  const token = new RegExp(`\\b${name}\\s*\\{`, 'g');
  token.lastIndex = startAt;
  const match = token.exec(source);
  if (!match) return null;
  const left = source.indexOf('{', match.index);
  let depth = 1;
  for (let i = left + 1; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return { text: source.slice(left + 1, i), end: i + 1 };
  }
  throw new Error(`Malformed WRL: unclosed ${name} block`);
}
function arrayIn(source: string, name: string): string {
  const found = new RegExp(`\\b${name}\\s*\\[([^\\]]*)\\]`).exec(source);
  if (!found) throw new Error(`Malformed WRL: missing ${name} array`);
  return found[1];
}
function numericArray(source: string, max: number): number[] {
  const tokens = source.trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length || tokens.length > max) throw new Error('WRL numeric array is empty or exceeds safety limits');
  return tokens.map(token => {
    if (!NUMBER.test(token)) throw new Error('WRL contains invalid numeric text');
    const value = Number(token);
    if (!Number.isFinite(value) || Math.abs(value) > 10_000_000) throw new Error('WRL coordinate or number exceeds safety bounds');
    return value;
  });
}
function tuples(values: number[], label: string): Vec3[] {
  if (values.length % 3) throw new Error(`WRL ${label} must contain complete coordinate triplets`);
  return Array.from({length: values.length / 3}, (_, i) => values.slice(3*i, 3*i+3) as Vec3);
}
function indexSpans(values: number[], vertexCount: number): number[][] {
  const spans: number[][] = [];
  let current: number[] = [];
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error('WRL coordinates must be addressed with integer indices');
    if (v === -1) {
      if (!current.length) throw new Error('WRL has an empty indexed span');
      if (current.length > MAX_FAN) throw new Error('WRL polygon/line span exceeds limit');
      spans.push(current);
      current = [];
    } else {
      if (v < 0 || v >= vertexCount) throw new Error('WRL index refers to nonexistent coordinate');
      current.push(v);
    }
    if (spans.length > MAX_PRIMITIVES) throw new Error('WRL contains too many error elements');
  }
  if (current.length) throw new Error('WRL indexed span lacks -1 terminator');
  return spans;
}
function materialColors(section: string, count: number): Vec3[] {
  const material = block(section, 'Material');
  if (!material) return [[1, 0, 0]];
  const source = /\bdiffuseColor\s*\[/.test(material.text)
    ? arrayIn(material.text,'diffuseColor') : '';
  if (!source) return [[1,0,0]];
  // PER_FACE binds one color per indexed polygon; faces can outnumber vertices.
  // Enforce the file-size and primitive budgets rather than guessing a vertex count.
  const out = tuples(numericArray(source, MAX_PRIMITIVES * 3), 'color');
  if (out.some(rgb => rgb.some(v => v < 0 || v > 1))) throw new Error('WRL color values must be in 0..1');
  return out;
}
function coordinateList(section: string): Vec3[] {
  const coords = block(section, 'Coordinate3');
  if (!coords) throw new Error('WRL Separator is missing Coordinate3');
  return tuples(numericArray(arrayIn(coords.text,'point'), MAX_VERTICES*3), 'point');
}
/** Only loads one user-selected, bounded local WRL file; never evaluates VRML scripts. */
export function parseHaloWrl(text: string, sourceCentimetres = true): WrlDiagnostics {
  if (typeof text !== 'string' || !text.length || text.length > MAX_FILE)
    throw new Error('Halo WRL must be a nonempty text file smaller than 2 MiB');
  if (!/^\s*#VRML 1\.0 ascii(?:\s|$)/i.test(text))
    throw new Error('Only Halo 1 Tool #VRML 1.0 ascii diagnostic files are supported. VRML 2.0 is different.');
  const source = text.split(/\r?\n/).map(line => line.replace(/#.*/, '')).join('\n');
  const scale = sourceCentimetres ? .01 : 1;
  let searchAt = 0;
  let regions = 0, totalVertices = 0;
  const segments: WrlSegment[] = [], faces: WrlFace[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity,-Infinity,-Infinity];
  while (true) {
    const region = block(source, 'Separator', searchAt);
    if (!region) break;
    searchAt = region.end;
    if (++regions > MAX_REGIONS) throw new Error('WRL contains too many error regions');
    const vertices = coordinateList(region.text).map(coords => coords.map(n => n*scale) as Vec3);
    totalVertices += vertices.length;
    if (totalVertices > MAX_VERTICES) throw new Error('WRL exceeds vertex safety budget');
    const binding = block(region.text, 'MaterialBinding');
    const perVertex = !!binding && /\bPER_VERTEX\b/.test(binding.text);
    const palette = materialColors(region.text, vertices.length);
    const colorFor = (element: number, vertex: number): Vec3 => palette[perVertex ? vertex : element] ?? palette[0] ?? [1,0,0];
    const touch = (p: Vec3) => {
      for (let i=0;i<3;i++) { min[i] = Math.min(min[i],p[i]); max[i] = Math.max(max[i],p[i]); }
    };
    const lines = block(region.text, 'IndexedLineSet');
    if (lines) {
      const spans = indexSpans(numericArray(arrayIn(lines.text, 'coordIndex'), MAX_PRIMITIVES * 4), vertices.length);
      spans.forEach((span, index) => {
        if (span.length < 2) throw new Error('WRL IndexedLineSet requires at least two vertices');
        for (let i=1;i<span.length;i++) {
          const start=vertices[span[i-1]], end=vertices[span[i]];
          segments.push({start,end,color:colorFor(index,span[i-1]),region:regions-1});
          touch(start);touch(end);
          if(segments.length+faces.length > MAX_PRIMITIVES) throw new Error('WRL error geometry exceeds preview budget');
        }
      });
    }
    const polygons = block(region.text, 'IndexedFaceSet');
    if (polygons) {
      const spans = indexSpans(numericArray(arrayIn(polygons.text, 'coordIndex'), MAX_PRIMITIVES * 4),vertices.length);
      spans.forEach((span,index) => {
        if(span.length<3) throw new Error('WRL IndexedFaceSet requires at least three vertices');
        for(let i=1;i<span.length-1;i++) {
          const a=vertices[span[0]],b=vertices[span[i]],c=vertices[span[i+1]];
          faces.push({a,b,c,color:colorFor(index,span[0]),region:regions-1});
          touch(a);touch(b);touch(c);
          if(segments.length+faces.length>MAX_PRIMITIVES) throw new Error('WRL error geometry exceeds preview budget');
        }
      });
    }
  }
  if (!regions || (!segments.length && !faces.length))
    throw new Error('WRL has no supported Halo 1 error geometry (IndexedLineSet/IndexedFaceSet)');
  return {
    format:'Halo Tool VRML 1.0',segments,faces,regions,bounds:{min,max},coordinateScale:scale,
    notes:[
      'WRL is diagnostic geometry generated by Halo Tool; it is not a replacement BSP, collision tag or map.',
      sourceCentimetres ? 'Halo Tool source coordinates displayed at 1/100 scale to match Guilty Spark.' : 'Coordinates displayed 1:1 as provided.',
      'Resolve indicated edges/faces in editable source and recompile with a matching Halo 1 toolchain. The overlay is not proof of game compatibility.',
    ],
  };
}
