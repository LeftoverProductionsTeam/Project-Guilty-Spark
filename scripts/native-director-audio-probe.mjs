// Source-bound native sound fixture and independent decode. No synthetic audio or game hooks.
import { expect } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function prepareNativeDirectorAudio(call, request, fixture, mode = 'saved') {
  const opened = await call('open_project', { id: fixture.projectId });
  const score = (tag) => (/wind/i.test(tag.path) ? 3 : /ambient|ambience|water/i.test(tag.path) ? 2 : 0);
  const candidates = opened.inspection.tags
    .filter((tag) => tag.class === 'snd!')
    .sort((a, b) => score(b) - score(a))
    .slice(0, 16);
  let selected, looping, phases;
  if (mode === 'phases') {
    const tag = opened.inspection.tags.find(
      (tag) => tag.class === 'lsnd' && /vehicles[\\/]ghost$/i.test(tag.path),
    );
    if (!tag) throw Error('The owned acceptance map needs its real Ghost looping sound.');
    looping = await call('inspect_looping_sound', { projectId: fixture.projectId, tagId: tag.id });
    expect(looping.sourceSha256).toBe(fixture.sourceSha256);
    const track = looping.tracks.find(
      (track) => track.startTagId !== null && track.loopTagId !== null && track.endTagId !== null,
    );
    if (!track || !looping.loops)
      throw Error('The acceptance track needs an intro, repeating loop and ending.');
    phases = {};
    for (const [phase, tagId] of [
      ['intro', track.startTagId],
      ['loop', track.loopTagId],
      ['end', track.endTagId],
    ]) {
      const report = await call('inspect_sound', { projectId: fixture.projectId, tagId });
      const sample = report.permutations.find(
        (p) => p.available && p.chainStart !== false && p.nextPermutation == null,
      );
      if (!sample) throw Error(`The acceptance ${phase} must be a complete available real permutation.`);
      const preview = await call('preview_sound', {
        projectId: fixture.projectId,
        tagId,
        pitchRange: sample.pitchRange,
        permutation: sample.permutation,
      });
      expect(report.sourceSha256).toBe(fixture.sourceSha256);
      expect(preview.sourceSha256).toBe(fixture.sourceSha256);
      expect(preview.sourceSampleSha256).toBe(sample.sha256);
      expect(crypto.createHash('sha256').update(Buffer.from(preview.bytes)).digest('hex')).toBe(
        preview.sha256,
      );
      phases[phase] = { tagId, report, sample, preview };
    }
    selected = { tag: opened.inspection.tags.find((tag) => tag.id === track.loopTagId), ...phases.loop };
    looping = { ...looping, selectedTrack: track };
  }
  for (const tag of mode === 'phases' ? [] : candidates) {
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
        ...(looping ? { loopingSource: { tagId: looping.tagId, track: looping.selectedTrack.index } } : {}),
      },
    ],
  };
  await call('save_project', { project: { ...opened.project, audioPreview: scene } });
  return {
    scene,
    composition: { ...session.composition, tracking: 'fixed', playing: false },
    phases,
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
      ...(looping
        ? {
            loopingTagId: looping.tagId,
            loopingTagPath: looping.tagPath,
            track: looping.selectedTrack.index,
            fadeInSeconds: looping.selectedTrack.fadeInSeconds,
            fadeOutSeconds: looping.selectedTrack.fadeOutSeconds,
            phases: Object.fromEntries(
              Object.entries(phases).map(([name, phase]) => [
                name,
                {
                  tagId: phase.tagId,
                  sourceSampleSha256: phase.sample.sha256,
                  previewSha256: phase.preview.sha256,
                  durationSeconds: phase.sample.durationSeconds,
                },
              ]),
            ),
          }
        : {}),
    },
  };
}

// Compare a source waveform to the independently decoded Opus take. Source bytes stay in private QA.
export async function verifyRecordedPhases(run, decoder, movie, source, directory) {
  const decode = async (input) => {
    const { stdout } = await run(
      decoder,
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '4000',
        '-f',
        'f32le',
        'pipe:1',
      ],
      { windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024, encoding: 'buffer' },
    );
    const samples = new Float32Array(stdout.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = stdout.readFloatLE(i * 4);
    return samples;
  };
  const recorded = await decode(movie),
    rate = 4000,
    matches = {};
  for (const [name, phase] of Object.entries(source.phases)) {
    const reference = path.join(directory, `source-${name}.audio`);
    await fs.writeFile(reference, Buffer.from(phase.preview.bytes), { flag: 'wx' });
    const samples = await decode(reference);
    const offset = 240,
      length = Math.min(1000, samples.length - offset);
    expect(length).toBeGreaterThan(500);
    const template = samples.slice(offset, offset + length);
    let mean = template.reduce((sum, n) => sum + n, 0) / length,
      energy = 0;
    for (let i = 0; i < length; i++) {
      template[i] -= mean;
      energy += template[i] ** 2;
    }
    expect(energy).toBeGreaterThan(0.000001);
    const correlation = (at) => {
      let sum = 0,
        squared = 0,
        dot = 0;
      for (let i = 0; i < length; i++) {
        const value = recorded[at + i];
        sum += value;
        squared += value * value;
        dot += template[i] * value;
      }
      return dot / Math.sqrt(energy * Math.max(1e-20, squared - (sum * sum) / length));
    };
    const introSeconds = source.phases.intro.sample.durationSeconds;
    const low = Math.floor(
      (name === 'intro'
        ? 0
        : name === 'loop'
          ? introSeconds
          : Math.max(0, recorded.length / rate - phase.sample.durationSeconds - 0.7)) * rate,
    );
    const high = Math.min(
      recorded.length - length,
      Math.ceil(
        (name === 'intro'
          ? 0.7
          : name === 'loop'
            ? recorded.length / rate - source.phases.end.sample.durationSeconds - 0.6
            : recorded.length / rate) * rate,
      ),
    );
    let best = { correlation: -1, at: low };
    for (let at = low; at <= high; at++) {
      const value = correlation(at);
      if (value > best.correlation) best = { correlation: value, at };
    }
    const centre = best.at;
    for (let at = Math.max(low, centre - 4); at <= Math.min(high, centre + 4); at++) {
      const value = correlation(at);
      if (value > best.correlation) best = { correlation: value, at };
    }
    expect(best.correlation, `${name} source waveform in independently decoded take`).toBeGreaterThan(0.85);
    matches[name] = {
      correlation: best.correlation,
      sourceOffsetSeconds: offset / rate,
      recordedOffsetSeconds: best.at / rate,
    };
  }
  expect(matches.intro.recordedOffsetSeconds).toBeLessThan(matches.loop.recordedOffsetSeconds);
  expect(matches.loop.recordedOffsetSeconds).toBeLessThan(matches.end.recordedOffsetSeconds);
  return {
    method: 'zero-mean normalized waveform correlation',
    decodedMonoSampleRate: rate,
    templateSamples: 1000,
    threshold: 0.85,
    matches,
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
