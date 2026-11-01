import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNativeTagValues } from './native-tag-readback.mjs';

test('native readback preserves empty fields, order and CRLF across bounded batches', async () => {
  const requests = Array.from({ length: 130 }, (_, i) => ({ op: 'get', key: `nodes[${i}].name` }));
  const expected = requests.map((_, i) => (i === 64 ? '' : `node ${i}`));
  let at = 0;
  const sizes = [];
  const actual = await readNativeTagValues(requests, {
    read: async () => Buffer.from('unchanged native tag'),
    run: async (args) => {
      sizes.push(args.length / 2);
      const values = expected.slice(at, at + args.length / 2);
      at += values.length;
      return values.join('\r\n') + '\r\n';
    },
  });
  assert.deepEqual(actual, expected);
  assert.deepEqual(sizes, [64, 64, 2]);
});

test('native readback refuses changing bytes, incomplete output and invalid counts', async () => {
  const request = [{ op: 'count', key: 'nodes' }];
  let bytes = Buffer.from('original');
  await assert.rejects(
    readNativeTagValues(request, {
      read: async () => bytes,
      run: async () => {
        bytes = Buffer.from('external save');
        return '4\n';
      },
    }),
    /changed/,
  );
  for (const output of ['4\nextra\n', '', '-1\n', 'NaN\n', '4\0\n', '4\rjunk\n']) {
    await assert.rejects(
      readNativeTagValues(request, {
        read: async () => Buffer.from('original'),
        run: async () => output,
      }),
      /readback|count/,
    );
  }
});

test('invalid native keys and excessive requests never start a native tool', async () => {
  let calls = 0;
  const native = {
    read: async () => {
      calls++;
      return Buffer.from('tag');
    },
    run: async () => {
      calls++;
    },
  };
  for (const requests of [
    [],
    new Array(4097).fill({ op: 'get', key: 'name' }),
    [{ op: 'set', key: 'name' }],
    [{ op: 'get', key: 'name\n-S flags 0' }],
    [
      { op: 'get', key: 'nodes[0].name' },
      { op: 'get', key: 'nodes[0].name' },
    ],
  ])
    await assert.rejects(readNativeTagValues(requests, native), /request/);
  assert.equal(calls, 0);
});
