/** Canonical standard Base64 only; bound allocations before native decoding.
 * Older WebViews use a plain byte loop rather than per-character callbacks. */
type NativeBase64 = typeof Uint8Array & {
  fromBase64?: (value: string, options: { lastChunkHandling: 'strict' }) => Uint8Array<ArrayBuffer>;
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeBoundedBase64(value: string, maxBytes: number, minBytes = 0): Uint8Array<ArrayBuffer> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    !Number.isSafeInteger(minBytes) ||
    minBytes < 0 ||
    maxBytes < minBytes
  )
    throw Error('Invalid Base64 size limits');
  if (typeof value === 'string' && value.length > Math.ceil(maxBytes / 3) * 4)
    throw Error('Decoded bitmap exceeds size limits');
  if (typeof value !== 'string' || value.length % 4 || /[^A-Za-z0-9+/=]/.test(value))
    throw Error('Malformed Base64 payload');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const firstPadding = value.indexOf('=');
  if ((firstPadding >= 0 && firstPadding !== value.length - padding) || (padding && value.length < 4))
    throw Error('Malformed Base64 padding');
  const size = (value.length / 4) * 3 - padding;
  if (!Number.isSafeInteger(size) || size < minBytes || size > maxBytes)
    throw Error('Decoded bitmap exceeds size limits');
  if (padding && alphabet.indexOf(value[value.length - padding - 1]) & (padding === 2 ? 15 : 3))
    throw Error('Noncanonical Base64 padding bits');
  const native = (Uint8Array as NativeBase64).fromBase64;
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof native === 'function') bytes = native.call(Uint8Array, value, { lastChunkHandling: 'strict' });
  else {
    const packed = atob(value);
    bytes = new Uint8Array(packed.length);
    for (let i = 0; i < packed.length; i++) bytes[i] = packed.charCodeAt(i);
  }
  if (bytes.length !== size) throw Error('Decoded Base64 length mismatch');
  return bytes;
}
