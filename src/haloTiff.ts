/**
 * Deterministic baseline TIFF RGBA source export from authorized local image pixels.
 * Compatible with standard TIFF readers; actual H1 Tool/Invader import has NOT
 * been tested. No source maps or Halo installations are accessed or modified.
 *
 * TIFF 6.0: little-endian, RGB photometric, 8-bit chunky samples, one strip,
 * uncompressed pixels, top-left origin, unassociated (straight) alpha.
 */
export interface RgbaSource { width: number; height: number; pixels: Uint8Array }
const PIXELS_LIMIT = 16_777_216;
const MAX_BYTES = 68 * 1024 * 1024;
const entries = [
  0x0100, // ImageWidth
  0x0101, // ImageLength
  0x0102, // BitsPerSample
  0x0103, // Compression
  0x0106, // PhotometricInterpretation
  0x0111, // StripOffsets
  0x0112, // Orientation
  0x0115, // SamplesPerPixel
  0x0116, // RowsPerStrip
  0x0117, // StripByteCounts
  0x011a, // XResolution
  0x011b, // YResolution
  0x011c, // PlanarConfiguration
  0x0128, // ResolutionUnit
  0x0152, // ExtraSamples
];
const SHORT=3, LONG=4, RATIONAL=5;
export function encodeHaloSourceTiff(image:RgbaSource):Uint8Array {
  const {width,height,pixels}=image;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||width*height>PIXELS_LIMIT)
    throw new Error('TIFF dimensions exceed source export limits');
  const rawLength=width*height*4;
  if(!(pixels instanceof Uint8Array)||pixels.byteLength!==rawLength || rawLength>MAX_BYTES)
    throw new Error('TIFF requires exactly one bounded RGBA8 image');
  const count=entries.length;
  const ifdBytes=2+12*count+4;
  const bitsAt=8+ifdBytes;
  const xresAt=bitsAt+8;
  const yresAt=xresAt+8;
  const imageAt=yresAt+8;
  const total=imageAt+rawLength;
  if(total>MAX_BYTES)throw new Error('TIFF output exceeds memory limit');
  const bytes=new Uint8Array(total);
  const view=new DataView(bytes.buffer);
  const u16=(at:number,v:number)=>view.setUint16(at,v,true);
  const u32=(at:number,v:number)=>view.setUint32(at,v,true);
  u16(0,0x4949);u16(2,42);u32(4,8);
  u16(8,count);
  const fields:[number,number,number,number][]=[
    [0x0100,LONG,1,width],
    [0x0101,LONG,1,height],
    [0x0102,SHORT,4,bitsAt],
    [0x0103,SHORT,1,1],
    [0x0106,SHORT,1,2],
    [0x0111,LONG,1,imageAt],
    [0x0112,SHORT,1,1],
    [0x0115,SHORT,1,4],
    [0x0116,LONG,1,height],
    [0x0117,LONG,1,rawLength],
    [0x011a,RATIONAL,1,xresAt],
    [0x011b,RATIONAL,1,yresAt],
    [0x011c,SHORT,1,1],
    [0x0128,SHORT,1,2],
    [0x0152,SHORT,1,2],
  ];
  for(let i=0;i<count;i++) {
    if(entries[i]!==fields[i][0])throw new Error('TIFF tags not ordered');
    const [tag,type,n,value]=fields[i];
    const at=10+i*12;
    u16(at,tag);u16(at+2,type);u32(at+4,n);
    type===SHORT && n===1 ? u16(at+8,value) : u32(at+8,value);
  }
  u32(10+12*count,0); // no next IFD
  for(let j=0;j<4;j++)u16(bitsAt+j*2,8);
  u32(xresAt,72);u32(xresAt+4,1);
  u32(yresAt,72);u32(yresAt+4,1);
  bytes.set(pixels,imageAt);
  return bytes;
}
