import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPeInterface } from './probe-mcc-h1-interface.mjs';
// Synthetic format fixture only; no Microsoft bytes or engine invocation.
function fixture() {
  const b = Buffer.alloc(4096);
  b.write('MZ');
  b.writeUInt32LE(0x80, 0x3c);
  b.write('PE\0\0', 0x80);
  b.writeUInt16LE(0x8664, 0x84);
  b.writeUInt16LE(1, 0x86);
  b.writeUInt16LE(0xf0, 0x94);
  const o = 0x98;
  b.writeUInt16LE(0x20b, o);
  b.writeUInt32LE(0x200, o + 60);
  b.writeUInt32LE(16, o + 108);
  b.writeUInt32LE(0x1000, o + 112);
  b.writeUInt32LE(128, o + 116);
  b.writeUInt32LE(0x1200, o + 120);
  b.writeUInt32LE(40, o + 124);
  const s = o + 0xf0;
  b.writeUInt32LE(0x1000, s + 12);
  b.writeUInt32LE(0xe00, s + 16);
  b.writeUInt32LE(0x200, s + 20);
  b.writeUInt32LE(1, 0x200 + 20);
  b.writeUInt32LE(1, 0x200 + 24);
  b.writeUInt32LE(0x1080, 0x200 + 28);
  b.writeUInt32LE(0x1090, 0x200 + 32);
  b.writeUInt32LE(0x10a0, 0x200 + 36);
  b.writeUInt32LE(0x1400, 0x280);
  b.writeUInt32LE(0x1100, 0x290);
  b.write('CreateGameEngine\0', 0x300);
  b.writeUInt32LE(0x1340, 0x400);
  b.writeUInt32LE(0x1300, 0x40c);
  b.write('WS2_32.dll\0', 0x500);
  b.writeBigUInt64LE(0x1380n, 0x540);
  b.write('sendto\0', 0x582);
  return b;
}
test('static synthetic PE resolves factory and import symbols without modifying bytes', () => {
  const b = fixture(),
    before = Buffer.from(b),
    r = inspectPeInterface(b);
  assert.equal(r.factoryExportPresent, true);
  assert.equal(r.directWinsockImport, true);
  assert.deepEqual(r.imports, [{ dll: 'WS2_32.dll', symbols: ['sendto'] }]);
  assert.deepEqual(b, before);
});
test('malformed native ranges, counts and terminated tables fail closed', () => {
  const base = fixture();
  for (const length of [0, 60, 128, 255, 1024])
    assert.throws(() => inspectPeInterface(base.subarray(0, length)));
  for (const mutate of [
    (b) => b.writeUInt32LE(0xfffffff0, 0x3c),
    (b) => b.writeUInt16LE(65535, 0x86),
    (b) => b.writeUInt32LE(8193, 0x214),
    (b) => b.writeUInt32LE(0xffffff00, 0x21c),
    (b) => b.fill(65, 0x300, 0x401),
    (b) => b.writeBigUInt64LE(0x100000000n, 0x540),
  ]) {
    const b = Buffer.from(base);
    mutate(b);
    assert.throws(() => inspectPeInterface(b));
  }
});
