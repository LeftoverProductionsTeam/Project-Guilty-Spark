// Audit owned native QA exports. No audio is played, resampled or rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const hash = (b) => createHash('sha256').update(b).digest('hex');

export function pcmWave(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.length > 64 * 1024 * 1024 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' ||
      bytes.readUInt32LE(4) !== bytes.length - 8) throw Error('Invalid bounded PCM WAVE');
  let format, data;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw Error('Truncated WAVE chunk');
    const size = bytes.readUInt32LE(at + 4), end = at + 8 + size;
    if (end > bytes.length) throw Error('Truncated WAVE data');
    const kind = bytes.toString('ascii', at, at + 4);
    if (kind === 'fmt ') {
      if (format || size !== 16 || bytes.readUInt16LE(at + 8) !== 1) throw Error('Expected unambiguous 16-bit PCM');
      const channels = bytes.readUInt16LE(at + 10), rate = bytes.readUInt32LE(at + 12);
      if (![1, 2].includes(channels) || ![22050, 44100].includes(rate) ||
          bytes.readUInt16LE(at + 22) !== 16 || bytes.readUInt16LE(at + 20) !== channels * 2 ||
          bytes.readUInt32LE(at + 16) !== rate * channels * 2) throw Error('Invalid PCM frame clock');
      format = { channels, rate };
    } else if (kind === 'data') {
      if (data) throw Error('Ambiguous WAVE data');
      data = bytes.subarray(at + 8, end);
    }
    at = end + (size & 1);
    if (at > bytes.length) throw Error('Truncated WAVE padding');
  }
  if (!format || !data?.length || data.length % (format.channels * 2)) throw Error('Incomplete PCM frames');
  return { ...format, frames: data.length / (format.channels * 2), data };
}

export function auditChain(parts, expected) {
  if (!Array.isArray(parts) || !parts.length || parts.length > 256) throw Error('Invalid chain size');
  const paddingFrames = expected.paddingFrames ?? 0;
  if (!Number.isSafeInteger(expected.frames) || expected.frames <= 0 || !Number.isInteger(paddingFrames) ||
      paddingFrames < 0 || paddingFrames > 63 || paddingFrames > 0 &&
      paddingFrames !== (64 - expected.frames % 64) % 64) throw Error('Invalid declared native end padding');
  const byIndex = new Map(), roots = [];
  for (const p of parts) {
    if (!Number.isInteger(p.permutation) || p.permutation < 0 || p.permutation >= parts.length ||
        p.pitchRange !== 0 || byIndex.has(p.permutation) || typeof p.chainStart !== 'boolean' ||
        !(p.nextPermutation === null || Number.isInteger(p.nextPermutation) && p.nextPermutation >= 0 && p.nextPermutation < parts.length))
      throw Error('Invalid or duplicate chain identity');
    byIndex.set(p.permutation, p);
    if (p.chainStart) roots.push(p.permutation);
  }
  if (roots.length !== 1) throw Error('Expected one complete authored permutation chain');
  const visited = new Set(), pcm = createHash('sha256');
  let at = roots[0], frames = 0;
  while (at !== null) {
    if (visited.has(at)) throw Error('Cyclic sound chain');
    visited.add(at);
    const p = byIndex.get(at), wave = pcmWave(p.bytes);
    if (wave.rate !== expected.sampleRate || wave.channels !== expected.channels) throw Error('Native chain rate/channels differ');
    frames += wave.frames;
    pcm.update(wave.data);
    at = p.nextPermutation;
  }
  if (visited.size !== parts.length || frames !== expected.frames + paddingFrames) throw Error('Native chain is missing chunks or frames');
  return { chunks: visited.size, frames, originalFrames: expected.frames, paddingFrames,
    channels: expected.channels, sampleRate: expected.sampleRate,
    decodedPcmSha256: pcm.digest('hex'), framesPreserved: true, rateAndChannelsPreserved: true,
    losslessEncodingClaimed: false, playbackAccepted: false };
}

function regular(file, limit) {
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit) throw Error('Expected bounded regular sound evidence');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  if (bytes.length !== s.size || after.size !== s.size || after.mtimeMs !== s.mtimeMs) throw Error('Sound evidence changed');
  return bytes;
}

export function auditExport(directory, expectedFile) {
  const root = path.resolve(directory);
  if (fs.realpathSync(root) !== root) throw Error('Redirected sound evidence root');
  const receiptBytes = regular(path.join(root, 'sound-export.json'), 4 * 1024 * 1024);
  const receipt = JSON.parse(receiptBytes), expectedBytes = regular(expectedFile, 1024 * 1024);
  const expected = JSON.parse(expectedBytes);
  if (receipt.sourceUnchanged !== true || expected.sourceUnchanged !== true ||
      !/^[a-f0-9]{64}$/.test(receipt.sourceSha256) || !Array.isArray(receipt.results) ||
      !Array.isArray(expected.results) || expected.results.length !== 3 || receipt.results.length !== 3)
    throw Error('Expected complete three-sound native evidence');
  const normalize = (s) => s.replaceAll('\\', '/').toLowerCase();
  const results = [];
  for (const source of expected.results) {
    const matches = receipt.results.filter((s) => normalize(s.path) === normalize(source.tag));
    if (matches.length !== 1) throw Error('Missing or duplicated native sound identity');
    const sound = matches[0], parts = sound.exports.map((part) => {
      if (!/^sound-\d+-pitch-\d+-permutation-\d+\.wav$/.test(part.file)) throw Error('Unexpected audio evidence path');
      const bytes = regular(path.join(root, part.file), 16 * 1024 * 1024);
      if (bytes.length !== part.bytes || hash(bytes) !== part.sha256) throw Error('Changed exported native sample');
      return { ...part, bytes };
    });
    results.push({ tag: source.tag, originalOggSha256: source.sourceOggSha256,
      originalDecodedPcmSha256: source.decodedPcmSha256, ...auditChain(parts, source) });
  }
  return { schemaVersion: 1, compiledCacheSha256: receipt.sourceSha256,
    exportReceiptSha256: hash(receiptBytes), expectedDecodeReceiptSha256: hash(expectedBytes), results,
    boundary: 'Frame/rate/channel and chain coverage only. Native ADPCM is lossy; game listening and remaining map faults are separate gates.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error('verify-native-sound-chains <export-directory> <original-decode-receipt>');
  console.log(JSON.stringify(auditExport(process.argv[2], process.argv[3]), null, 2));
}
