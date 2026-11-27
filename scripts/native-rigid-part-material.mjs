import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Compile a user-owned Spark paint export into an independent shader_model. */
export async function compileNativePartPaint({ source, tags, data, run }) {
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw Error('Choose a regular paint PNG within 8 MiB');
  const png = await fs.readFile(source);
  if (png.length !== stat.size || png.length < 33 ||
      png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      png.toString('ascii', 12, 16) !== 'IHDR' ||
      png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512) {
    throw Error('Choose the 512 × 512 PNG exported by Shape & Paint');
  }
  const sha256 = createHash('sha256').update(png).digest('hex');
  const name = 'spark_plow_painted_steel';
  const stem = 'spark_workshop\\part_paint\\' + name;
  const bitmap = stem + '.bitmap';
  const shader = stem + '.shader_model';
  await fs.mkdir(path.dirname(path.join(data, stem)), { recursive: true });
  await fs.mkdir(path.dirname(path.join(tags, stem)), { recursive: true });
  await fs.writeFile(path.join(data, stem + '.png'), png, { flag: 'wx' });

  await run('bitmap', ['-d', data, '-t', tags, '-F', '32-bit', '-T', '2d_textures', stem]);
  await run('edit', [
    '-t', tags, '-N', '-S', 'base_map', bitmap,
    '-S', 'map_u_scale', '1', '-S', 'map_v_scale', '1',
    '-S', 'material_type', 'metal_thick',
    '-S', 'tint_color', '1,1,1', shader,
  ]);
  const read = async (tag, args) => (await run('edit', ['-t', tags, ...args, tag]))
    .trimEnd().split(/\r?\n/);
  const [bitmapCount, width, height, format] = await read(bitmap, [
    '-C', 'bitmap_data', '-G', 'bitmap_data[0].width', '-G', 'bitmap_data[0].height', '-G', 'bitmap_data[0].format',
  ]);
  const [reference, scaleU, scaleV, material, translucency] = await read(shader, [
    '-G', 'base_map', '-G', 'map_u_scale', '-G', 'map_v_scale',
    '-G', 'material_type', '-G', 'translucency',
  ]);
  if (bitmapCount !== '1' || Number(width) !== 512 || Number(height) !== 512 ||
      !['x8r8g8b8', 'a8r8g8b8'].includes(format) ||
      reference !== bitmap || Number(scaleU) !== 1 || Number(scaleV) !== 1 ||
      material !== 'metal_thick' || Number(translucency) !== 0) {
    throw Error('Native paint bitmap or opaque metal shader readback differs');
  }
  if (createHash('sha256').update(await fs.readFile(source)).digest('hex') !== sha256) {
    throw Error('Paint source changed during native compilation');
  }
  return { name, bitmap, shader, sha256, width: Number(width), height: Number(height), format };
}
