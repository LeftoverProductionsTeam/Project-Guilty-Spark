import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditChain, pcmWave } from './verify-native-sound-chains.mjs';
// Synthetic parser fixtures; genuine owned/native audio is tested separately.
function wave(frames = 2) {
  const b = Buffer.alloc(44 + frames * 4);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(176400, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 4, 40);
  return b;
}
const expected = { frames: 4, channels: 2, sampleRate: 44100 };
const parts = () => [
  { permutation: 0, pitchRange: 0, chainStart: true, nextPermutation: 1, bytes: wave() },
  { permutation: 1, pitchRange: 0, chainStart: false, nextPermutation: null, bytes: wave() },
];
test('a complete native chain preserves the full frame clock without a playback or quality claim', () => {
  const r = auditChain(parts().reverse(), expected);
  assert.equal(r.frames, 4); assert.equal(r.chunks, 2);
  assert.equal(r.playbackAccepted, false); assert.equal(r.losslessEncodingClaimed, false);
});
test('cycles, missing segments, duplicate identities and multiple roots refuse the chain', () => {
  for (const change of [
    (p) => { p[1].nextPermutation = 0; },
    (p) => { p[0].nextPermutation = null; },
    (p) => { p[1].permutation = 0; },
    (p) => { p[1].chainStart = true; },
  ]) { const p = parts(); change(p); assert.throws(() => auditChain(p, expected)); }
});
test('changed native frame count, rate, channels and truncated bytes cannot pass', () => {
  for (const e of [{ ...expected, frames: 5 }, { ...expected, channels: 1 }, { ...expected, sampleRate: 22050 }])
    assert.throws(() => auditChain(parts(), e));
  const b = wave(); b.writeUInt32LE(9999, 40);
  assert.throws(() => pcmWave(b), /Truncated/);
  assert.throws(() => pcmWave(wave().subarray(0, 43)), /Invalid/);
});
test('only explicitly declared block padding can extend a complete native chain', () => {
  const p = [{ permutation: 0, pitchRange: 0, chainStart: true, nextPermutation: null, bytes: wave(64) }];
  const r = auditChain(p, { ...expected, frames: 51, paddingFrames: 13 });
  assert.equal(r.originalFrames, 51); assert.equal(r.frames, 64); assert.equal(r.paddingFrames, 13);
  for (const paddingFrames of [-1, 12, 14, 64, 1.5])
    assert.throws(() => auditChain(p, { ...expected, frames: 51, paddingFrames }));
  assert.throws(() => auditChain(p, { ...expected, frames: 51 }));
});
