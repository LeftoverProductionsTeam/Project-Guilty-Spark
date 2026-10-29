// Source-bound native sound fixture and independent decode. No synthetic audio or game hooks.
import { expect } from '@playwright/test';
import crypto from 'node:crypto';
export async function prepareNativeDirectorAudio(call, request, fixture) {
  const opened = await call('open_project', { id: fixture.projectId });
  const score = (tag) => (/wind/i.test(tag.path) ? 3 : /ambient|ambience|water/i.test(tag.path) ? 2 : 0);
  const candidates = opened.inspection.tags
    .filter((tag) => tag.class === 'snd!')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 16);
  let selected;
  for (const tag of candidates) {
    const report = await call('inspect_sound', { projectId: fixture.projectId, tagId: tag.id });
    const sample = report.permutations.find(
      (p) => p.available && p.chainStart !== false && p.durationSeconds >= 0.25 && p.durationSeconds <= 120,
    );
    if (sample) {
      selected = { tag, report, sample };
      break;
    }
  }
  if (!selected) throw Error('The owned map has no supported real sound in the bounded candidate set.');
  const { tag, report, sample } = selected;
  expect(report.sourceSha256).toBe(fixture.sourceSha256);
  const preview = await call('preview_sound', {
    projectId: fixture.projectId,
    tagId: tag.id,
    pitchRange: sample.pitchRange,
    permutation: sample.permutation,
  });
  expect(preview.sourceSha256).toBe(fixture.sourceSha256);
  expect(preview.sourceSampleSha256).toBe(sample.sha256);
  expect(crypto.createHash('sha256').update(Buffer.from(preview.bytes)).digest('hex')).toBe(preview.sha256);
  const session = await call('director_session', { projectId: fixture.projectId });
  // Fix this acceptance camera at its already prepared position, then move it through the normal API.
  await request('director_update', {
    projectId: fixture.projectId,
    revision: session.revision,
    composition: { ...session.composition, tracking: 'fixed', playing: false },
    save: true,
  });
  const scene = {
    schemaVersion: 1,
    master: 0.8,
    muted: false,
    maxVoices: 24,
    buses: Object.fromEntries(
      ['ambience', 'music', 'effects', 'dialogue'].map((bus) => [
        bus,
        { gain: 1, muted: false, solo: false },
      ]),
    ),
    emitters: [
      {
        id: crypto.randomUUID(),
        name: 'Native map sound recording',
        tagId: tag.id,
        sourceProjectId: fixture.projectId,
        sourceSha256: fixture.sourceSha256,
        pitchRange: sample.pitchRange,
        permutation: sample.permutation,
        followChain: false,
        event: 'ambient',
        bus: 'ambience',
        position: session.composition.pose.position,
        gain: 1,
        pitch: 0,
        loop: true,
        enabled: true,
        minDistance: 1,
        maxDistance: 40,
        rolloff: 1,
        priority: 50,
        cooldownMs: 100,
        spatial: true,
      },
    ],
  };
  await call('save_project', { project: { ...opened.project, audioPreview: scene } });
  return {
    scene,
    composition: { ...session.composition, tracking: 'fixed', playing: false },
    metadata: {
      tagId: tag.id,
      tagPath: tag.path,
      sampleSha256: sample.sha256,
      previewSha256: preview.sha256,
      format: sample.format,
      sourceChannels: sample.channels,
      sourceSampleRate: sample.sampleRate,
      sourceDurationSeconds: sample.durationSeconds,
      sourceSha256: fixture.sourceSha256,
      synthetic: false,
    },
  };
}

export async function decodeRecordedAudio(run, decoder, movie, audible) {
  const decoded = await run(
    decoder,
    [
      '-nostdin',
      '-hide_banner',
      '-i',
      movie,
      '-map',
      '0:a:0',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' },
  );
  const pcm = decoded.stdout;
  expect(pcm.length % 8).toBe(0);
  expect(pcm.length).toBeGreaterThan(48000 * 8);
  let squared = 0,
    peak = 0;
  for (let at = 0; at < pcm.length; at += 4) {
    const value = pcm.readFloatLE(at);
    if (!Number.isFinite(value)) throw Error('Decoded audio contains a non-finite sample.');
    squared += value * value;
    peak = Math.max(peak, Math.abs(value));
  }
  const rms = Math.sqrt(squared / (pcm.length / 4));
  if (audible) expect(rms).toBeGreaterThan(0.00001);
  else expect(rms).toBeLessThan(0.00001);
  expect(decoded.stderr.toString()).toMatch(/Audio: opus/);
  return {
    codec: 'opus',
    decodedChannels: 2,
    decodedSampleRate: 48000,
    decodedFrames: pcm.length / 8,
    decodedSeconds: pcm.length / (8 * 48000),
    rms,
    peak,
  };
}
