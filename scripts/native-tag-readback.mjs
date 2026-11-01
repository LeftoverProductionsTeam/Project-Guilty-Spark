// Read-only native Invader queries, bounded to keep Windows command lines small.
// Every batch must read the same exact tag bytes; a changing tag is never a snapshot.
import { createHash } from 'node:crypto';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const keyPattern = /^[a-zA-Z_][a-zA-Z_0-9]*(?:\[\d+\])?(?:\.[a-zA-Z_][a-zA-Z_0-9]*(?:\[\d+\])?)*$/;

export async function readNativeTagValues(requests, { read, run }) {
  if (!Array.isArray(requests) || !requests.length || requests.length > 4096)
    throw Error('Expected 1..4096 native readback requests');
  const seen = new Set();
  for (const request of requests) {
    if (
      !request ||
      !['get', 'count'].includes(request.op) ||
      typeof request.key !== 'string' ||
      request.key.length > 160 ||
      !keyPattern.test(request.key) ||
      seen.has(request.op + ':' + request.key)
    )
      throw Error('Invalid or duplicate native readback request');
    seen.add(request.op + ':' + request.key);
  }
  const before = digest(await read());
  const values = [];
  for (let start = 0; start < requests.length; start += 64) {
    if (digest(await read()) !== before) throw Error('Native source changed during readback');
    const batch = requests.slice(start, start + 64);
    const output = await run(batch.flatMap(({ op, key }) => [op === 'get' ? '-G' : '-C', key]));
    if (digest(await read()) !== before) throw Error('Native source changed during readback');
    if (typeof output !== 'string' || output.length > 1024 * 1024 || /\0/.test(output))
      throw Error('Invalid bounded native readback output');
    // Remove one line terminator only: an empty string field is still a value.
    const lines = output.replaceAll('\r\n', '\n').replace(/\n$/, '').split('\n');
    if (lines.length !== batch.length || lines.some((line) => /\r/.test(line)))
      throw Error('Native readback response count differs');
    for (let i = 0; i < batch.length; i++) {
      if (batch[i].op === 'count' && !/^(0|[1-9]\d{0,7})$/.test(lines[i]))
        throw Error('Invalid native array count');
      values.push(lines[i]);
    }
  }
  return values;
}
