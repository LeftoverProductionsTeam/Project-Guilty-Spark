import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeAdpcmWave } from './prepare-native-adpcm-waves.mjs';
import { pcmWave } from './verify-native-sound-chains.mjs';

function input(frames) {
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(176400, 28);
  bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 44; i < bytes.length; i++) bytes[i] = (i * 17) & 255;
  return bytes;
}
test('native ADPCM preparation preserves every original PCM byte and records only silent end padding', () => {
  for (const frames of [1, 63, 64, 65, 115]) {
    const original = input(frames), preserved = Buffer.from(original), result = prepareNativeAdpcmWave(original);
    const decoded = pcmWave(result.bytes);
    assert.deepEqual(original, preserved);
    assert.deepEqual(decoded.data.subarray(0, frames * 4), original.subarray(44));
    assert.ok(decoded.data.subarray(frames * 4).every((byte) => byte === 0));
    assert.equal(result.paddingFrames, (64 - frames % 64) % 64);
    assert.equal(decoded.frames, frames + result.paddingFrames);
    assert.equal(decoded.rate, 44100); assert.equal(decoded.channels, 2);
  }
});
test('incomplete or corrupt PCM is rejected before ADPCM preparation', () => {
  assert.throws(() => prepareNativeAdpcmWave(input(3).subarray(0, 50)));
  const bytes = input(4); bytes.writeUInt16LE(8, 34);
  assert.throws(() => prepareNativeAdpcmWave(bytes));
});
