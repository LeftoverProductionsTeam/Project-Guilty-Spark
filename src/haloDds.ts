/** Strict, offline DXT and RGBA8/BGRA8 decoder for user-supplied DDS files.
 *  Does not scan, decrypt, or modify game caches. Only the top mip is decoded.
 *  DXT1/3/5 correspond to BC1/2/3. Original resource attribution remains local.
 */
export type DdsFormat = 'DXT1' | 'DXT3' | 'DXT5' | 'BGRA8' | 'RGBA8';
export interface DdsImage { width: number; height: number; format: DdsFormat; pixels: Uint8Array }
const LIMIT = 4096;
const MAX_BYTES = 96 * 1024 * 1024;
const fourcc = (v: DataView, p: number) => String.fromCharCode(v.getUint8(p), v.getUint8(p+1), v.getUint8(p+2), v.getUint8(p+3));
function rgb565(c: number): [number, number, number] {
  return [Math.round(((c >> 11) & 31) * 255 / 31), Math.round(((c >> 5) & 63) * 255 / 63), Math.round((c & 31) * 255 / 31)];
}
function colors(view: DataView, at: number, alphaMode: boolean): number[][] {
  const a = view.getUint16(at, true), b = view.getUint16(at+2, true);
  const c0 = rgb565(a), c1 = rgb565(b);
  const out = [[...c0, 255], [...c1, 255]];
  if (a > b || alphaMode) {
    out.push([0,1,2].map(i => Math.round((2*c0[i] + c1[i])/3)).concat(255));
    out.push([0,1,2].map(i => Math.round((c0[i] + 2*c1[i])/3)).concat(255));
  } else {
    out.push([0,1,2].map(i => Math.round((c0[i] + c1[i])/2)).concat(255));
    out.push([0,0,0,0]);
  }
  return out;
}
function alphaDxt5(view: DataView, at: number): number[] {
  const a0 = view.getUint8(at), a1 = view.getUint8(at+1), table = [a0, a1];
  if (a0 > a1) {
    for (let i=1;i<=6;i++) table.push(Math.round(((7-i)*a0 + i*a1)/7));
  } else {
    for (let i=1;i<=4;i++) table.push(Math.round(((5-i)*a0 + i*a1)/5));
    table.push(0,255);
  }
  let bits = 0n;
  for (let i=0;i<6;i++) bits |= BigInt(view.getUint8(at+2+i)) << BigInt(i*8);
  return Array.from({length:16},(_,i)=>table[Number((bits >> BigInt(3*i)) & 7n)]);
}
/** Bounded header parsing; unknown DX10/BC7 formats fail closed. */
export function decodeHaloDds(data: ArrayBuffer): DdsImage {
  if (data.byteLength < 128 || data.byteLength > MAX_BYTES) throw new Error('DDS size outside supported bounds');
  const v = new DataView(data);
  if (fourcc(v,0) !== 'DDS ' || v.getUint32(4,true) !== 124 || v.getUint32(76,true) !== 32)
    throw new Error('Not a supported DDS header');
  const height = v.getUint32(12,true), width = v.getUint32(16,true);
  // Halo's resource exports can include uncompressed 32-bit pixels, but a 2D
  // preview must never silently interpret a volume/cubemap as a flat image.
  if (v.getUint32(112,true) !== 0 || v.getUint32(24,true)>1)
    throw new Error('Volume and cubemap DDS resources are not supported as flat textures');
  if (!width || !height || width>LIMIT || height>LIMIT || width*height>16_777_216)
    throw new Error('DDS dimensions exceed preview safety limits');
  const format = fourcc(v,84);
  const flags=v.getUint32(80,true);
  if ((flags & 0x40) && v.getUint32(88,true)===32 && !(flags & 0x4)) {
    const red=v.getUint32(92,true),green=v.getUint32(96,true),blue=v.getUint32(100,true),alpha=v.getUint32(104,true);
    const bgra=red===0x00ff0000 && green===0x0000ff00 && blue===0x000000ff;
    const rgba=red===0x000000ff && green===0x0000ff00 && blue===0x00ff0000;
    if ((!bgra && !rgba) || ![0,0xff000000].includes(alpha))
      throw new Error('Unsupported DDS RGB masks; only standard 32-bit RGBA/BGRA layouts are decoded');
    const minimumPitch=width*4,pitch=v.getUint32(20,true)||minimumPitch;
    if(pitch<minimumPitch || pitch>minimumPitch+65536 || 128+pitch*height>data.byteLength)
      throw new Error('DDS uncompressed top mip truncated or has invalid row pitch');
    const pixels=new Uint8Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const src=128+y*pitch+x*4,dest=(y*width+x)*4;
      pixels[dest]=v.getUint8(src+(rgba?0:2));
      pixels[dest+1]=v.getUint8(src+1);
      pixels[dest+2]=v.getUint8(src+(rgba?2:0));
      pixels[dest+3]=alpha===0?255:v.getUint8(src+3);
    }
    return {width,height,format:bgra?'BGRA8':'RGBA8',pixels};
  }
  if (format !== 'DXT1' && format !== 'DXT3' && format !== 'DXT5')
    throw new Error(`Unsupported DDS format ${JSON.stringify(format)}. Only DXT1/3/5 or 32-bit RGBA/BGRA DDS is decoded.`);
  const blocksX = Math.ceil(width/4), blocksY = Math.ceil(height/4), stride = format==='DXT1'?8:16;
  const topBytes = blocksX * blocksY * stride;
  if (128 + topBytes > data.byteLength) throw new Error('DDS mip 0 truncated');
  const pixels = new Uint8Array(width*height*4);
  for (let by=0;by<blocksY;by++) for (let bx=0;bx<blocksX;bx++) {
    const at = 128+(by*blocksX+bx)*stride;
    const colorAt = at + (format==='DXT1'?0:8);
    const palette = colors(v,colorAt,format!=='DXT1');
    const indexBits = v.getUint32(colorAt+4,true);
    const alphas = format === 'DXT5' ? alphaDxt5(v,at) : undefined;
    let dxt3 = 0n;
    if(format === 'DXT3') { for(let i=0;i<8;i++) dxt3 |= BigInt(v.getUint8(at+i)) << BigInt(8*i); }
    for(let py=0;py<4;py++) for(let px=0;px<4;px++) {
      const x=bx*4+px, y=by*4+py; if(x>=width || y>=height) continue;
      const p=py*4+px, color=palette[(indexBits >>> (p*2)) & 3], out=(y*width+x)*4;
      pixels.set(color,out);
      if (format === 'DXT3') pixels[out+3] = Number((dxt3 >> BigInt(p*4)) & 15n) * 17;
      if (alphas) pixels[out+3] = alphas[p];
    }
  }
  return { width,height,format,pixels };
}
