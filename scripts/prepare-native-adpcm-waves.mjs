// Explicit end padding for owned native audio research. Never trims or resamples.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pcmWave } from './verify-native-sound-chains.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function prepareNativeAdpcmWave(bytes) {
  const wave = pcmWave(bytes);
  const paddingFrames = (64 - wave.frames % 64) % 64;
  const data = Buffer.concat([wave.data, Buffer.alloc(paddingFrames * wave.channels * 2)]);
  const output = Buffer.alloc(44 + data.length);
  output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(wave.channels, 22);
  output.writeUInt32LE(wave.rate, 24); output.writeUInt32LE(wave.rate * wave.channels * 2, 28);
  output.writeUInt16LE(wave.channels * 2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(data.length, 40); data.copy(output, 44);
  return { bytes: output, frames: wave.frames, compiledFrames: data.length / (wave.channels * 2), paddingFrames,
    channels: wave.channels, sampleRate: wave.rate, decodedPcmSha256: hash(wave.data),
    paddedPcmSha256: hash(data), waveSha256: hash(output) };
}

export function prepareNativeAdpcmInputs(receiptFile, outputDirectory) {
  const originalReceipt = fs.readFileSync(receiptFile), receipt = JSON.parse(originalReceipt);
  if (receipt.sourceUnchanged !== true || !Array.isArray(receipt.results) || receipt.results.length !== 3)
    throw Error('Expected the complete owned three-sound decode receipt');
  // Validate every source before creating output; originals remain read-only inputs.
  const prepared = receipt.results.map((source) => {
    const stat = fs.lstatSync(source.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw Error('Invalid source WAVE');
    const bytes = fs.readFileSync(source.file);
    if (hash(bytes) !== source.waveSha256) throw Error('Decoded source WAVE identity changed');
    const result = prepareNativeAdpcmWave(bytes);
    if (result.frames !== source.frames || result.channels !== source.channels || result.sampleRate !== source.sampleRate ||
        result.decodedPcmSha256 !== source.decodedPcmSha256) throw Error('Decoded source frame identity changed');
    return { source, result };
  });
  const root = path.resolve(outputDirectory), parent = path.dirname(root);
  if (fs.realpathSync(parent) !== parent) throw Error('Redirected audio output parent');
  fs.mkdirSync(root);
  const results = prepared.map(({ source, result }, index) => {
    const file = path.join(root, `sound-${index}.wav`);
    fs.writeFileSync(file, result.bytes, { flag: 'wx' });
    const { bytes: _bytes, ...metadata } = result;
    return { ...source, originalWaveFile: source.file, originalWaveSha256: source.waveSha256, file, ...metadata };
  });
  for (const { source } of prepared) {
    if (hash(fs.readFileSync(source.file)) !== source.waveSha256) throw Error('Source changed during preparation');
  }
  const report = { ...receipt, schemaVersion: 1, originalDecodeReceiptSha256: hash(originalReceipt), results,
    preparation: 'Append 0..63 explicit silent frames to complete a 64-frame native ADPCM block; original PCM prefix is byte-identical. Native encoding remains lossy.',
    resampled: false, trimmed: false, playbackAccepted: false };
  fs.writeFileSync(path.join(root, 'prepare-receipt.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw Error('prepare-native-adpcm-waves <owned-decode-receipt> <fresh-output>');
  console.log(JSON.stringify(prepareNativeAdpcmInputs(process.argv[2], process.argv[3]), null, 2));
}
