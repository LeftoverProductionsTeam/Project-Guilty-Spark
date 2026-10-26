/** Deterministic, dependency-free ZIP writer for small generated source files.
 * Only STORED entries and safe flat filenames; no filesystem access and no
 * user-controlled archive paths. This is for authoring exports, not compiled maps.
 */
export interface SourceFile { name: string; contents: string }
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let i=0;i<256;i++) {
  let value = i;
  for (let bit=0;bit<8;bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  table[i] = value >>> 0;
}
function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const u16 = (v: DataView, at: number, x: number) => v.setUint16(at,x,true);
const u32 = (v: DataView, at: number, x: number) => v.setUint32(at,x,true);
export function sourceZip(files: SourceFile[]): Uint8Array {
  return encodeSourceZip(files,false);
}
/** Safe virtual paths for an HCEEK data staging tree; never extracts anything. */
export function sourceTreeZip(files: SourceFile[]): Uint8Array {
  return encodeSourceZip(files,true);
}
function encodeSourceZip(files: SourceFile[], allowPaths:boolean): Uint8Array {
  if (!Array.isArray(files) || !files.length || files.length > 32) throw new Error('Source bundle requires 1-32 files');
  const items = files.map((file) => {
    if (typeof file.name !== 'string' || typeof file.contents !== 'string' ||
        file.name.length > 240 || !(allowPaths ?
          file.name.split('/').length<=8 && file.name.split('/').every(part=>part.length<=63 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(part) && part !== '..') :
          /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(file.name) && file.name !== '..'))
      throw new Error('Unsafe source filename or contents');
    const name = encoder.encode(file.name), bytes = encoder.encode(file.contents);
    if (bytes.byteLength > 2*1024*1024) throw new Error('Generated source file exceeds 2 MiB');
    return {name, bytes, crc:crc32(bytes), str:file.name};
  });
  if (new Set(items.map(item => item.str.toLowerCase())).size !== items.length) throw new Error('Duplicate source filename');
  const required = 22 + items.reduce((sum,item) => sum + 30+item.name.length+item.bytes.length+46+item.name.length,0);
  if (required > 16*1024*1024) throw new Error('Source ZIP exceeds 16 MiB');
  const out = new Uint8Array(required), view = new DataView(out.buffer);
  const central: number[] = [];
  let pos = 0;
  for(const item of items){
    const offset = pos, size=item.bytes.length, n=item.name.length;
    u32(view,pos,0x04034b50); u16(view,pos+4,20); u16(view,pos+6,0x0800); // UTF-8 names
    u16(view,pos+8,0); u16(view,pos+10,0); u16(view,pos+12,0x0021); // 1980-01-01
    u32(view,pos+14,item.crc); u32(view,pos+18,size); u32(view,pos+22,size);
    u16(view,pos+26,n); u16(view,pos+28,0); pos+=30;
    out.set(item.name,pos); pos+=n; out.set(item.bytes,pos); pos+=size;
    central.push(offset);
  }
  const centralAt=pos;
  for(let i=0;i<items.length;i++){
    const item=items[i], n=item.name.length, size=item.bytes.length;
    u32(view,pos,0x02014b50); u16(view,pos+4,20); u16(view,pos+6,20); u16(view,pos+8,0x0800);
    u16(view,pos+10,0); u16(view,pos+12,0); u16(view,pos+14,0x0021);
    u32(view,pos+16,item.crc); u32(view,pos+20,size); u32(view,pos+24,size);
    u16(view,pos+28,n); u16(view,pos+30,0); u16(view,pos+32,0); u16(view,pos+34,0);
    u16(view,pos+36,0); u32(view,pos+38,0); u32(view,pos+42,central[i]); pos+=46;
    out.set(item.name,pos); pos+=n;
  }
  const centralSize=pos-centralAt;
  u32(view,pos,0x06054b50);u16(view,pos+4,0);u16(view,pos+6,0);
  u16(view,pos+8,items.length);u16(view,pos+10,items.length);
  u32(view,pos+12,centralSize);u32(view,pos+16,centralAt);u16(view,pos+20,0);pos+=22;
  if (pos!==out.byteLength) throw new Error('ZIP size calculation mismatch');
  return out;
}
