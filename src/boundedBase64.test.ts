import { expect, it } from 'vitest';
import { decodeBoundedBase64 } from './boundedBase64';
it('decodes canonical full and padded groups and bounds bytes before allocation', () => {
  for (const value of ['', 'TQ==', 'TWE=', 'TWFu', 'AAECA/7/'])
    expect([...decodeBoundedBase64(value, 100)]).toEqual([...Buffer.from(value, 'base64')]);
  expect(() => decodeBoundedBase64('TWFu', 2)).toThrow(/size limits/);
  expect(() => decodeBoundedBase64('TQ==', 3, 2)).toThrow(/size limits/);
  for (const [max, min] of [
    [NaN, 0],
    [Infinity, 0],
    [3, -1],
    [2, 3],
  ])
    expect(() => decodeBoundedBase64('TQ==', max, min)).toThrow(/size limits/);
});
it('refuses whitespace, partial groups, mixed alphabets, misplaced padding and nonzero discarded bits', () => {
  for (const value of [
    'TQ',
    'TQ=',
    'TQ==\n',
    'T Q==',
    'TQ==AAAA',
    'A===',
    '====',
    'TW-F',
    'TW_F',
    'TR==',
    'TWF=',
  ])
    expect(() => decodeBoundedBase64(value, 100)).toThrow();
});
it('the older-WebView byte loop preserves every byte for large canonical input', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Uint8Array, 'fromBase64');
  Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, value: undefined });
  try {
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 1);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(decodeBoundedBase64(bytes.toString('base64'), bytes.length)).toEqual(new Uint8Array(bytes));
  } finally {
    if (descriptor) Object.defineProperty(Uint8Array, 'fromBase64', descriptor);
    else Reflect.deleteProperty(Uint8Array, 'fromBase64');
  }
});
