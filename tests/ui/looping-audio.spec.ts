import { test, expect } from '@playwright/test';

// Real browser audio rendering of synthetic samples. These contracts do not certify game audio parity.
test('native Web Audio repeats only the authored middle and plays a one-shot without phase gaps', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/soundPlayback.ts';
    const { joinSoundPhases } = await import(/* @vite-ignore */ modulePath);
    const render = async (loop: boolean) => {
      const ctx = new OfflineAudioContext(1, 5000, 8000);
      const phase = (length: number, value: number) => {
        const b = ctx.createBuffer(1, length, 8000);
        b.getChannelData(0).fill(value);
        return b;
      };
      const clip = joinSoundPhases(ctx, phase(800, 0.2), phase(1200, 0.4), phase(600, -0.3));
      const source = ctx.createBufferSource();
      source.buffer = clip.buffer;
      source.loop = loop;
      source.loopStart = clip.loopStart;
      source.loopEnd = clip.loopEnd;
      source.connect(ctx.destination);
      source.start();
      return Array.from((await ctx.startRendering()).getChannelData(0));
    };
    return { loop: await render(true), once: await render(false) };
  });
  for (let i = 0; i < 5000; i++) {
    expect(result.loop[i]).toBeCloseTo(i < 800 ? 0.2 : 0.4, 6);
    expect(result.once[i]).toBeCloseTo(i < 800 ? 0.2 : i < 2000 ? 0.4 : i < 2600 ? -0.3 : 0, 6);
  }
});

test('native audio rendering fades the repeat and starts the source ending before finish resolves', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const playbackPath = '/src/soundPlayback.ts',
      mixerPath = '/src/spatialAudio.ts';
    const { joinSoundPhases } = await import(/* @vite-ignore */ playbackPath);
    const { SpatialSoundMixer, createEmitter, emptySoundScene } = await import(/* @vite-ignore */ mixerPath);
    const ctx = new OfflineAudioContext(1, 8000, 8000),
      phase = (length: number, value: number) => {
        const b = ctx.createBuffer(1, length, 8000);
        b.getChannelData(0).fill(value);
        return b;
      };
    const clip = {
      ...joinSoundPhases(ctx, phase(800, 0.2), phase(1200, 0.4), phase(600, -0.3)),
      fadeInSeconds: 0.04,
      fadeOutSeconds: 0.1,
    };
    const e = createEmitter(1, 'Offline contract', [0, 0, 0]);
    e.spatial = false;
    e.gain = 1;
    const scene = emptySoundScene();
    scene.master = 1;
    scene.emitters = [e];
    const mixer = new SpatialSoundMixer(ctx, async () => clip);
    mixer.configure(scene);
    await mixer.play(e);
    const suspended = ctx.suspend(0.3),
      rendering = ctx.startRendering();
    await suspended;
    const at = ctx.currentTime;
    let resolved = false;
    const finished = mixer.finish().then(() => {
      resolved = true;
    });
    const pendingBeforeRender = !resolved;
    await ctx.resume();
    const audio = await rendering;
    await finished;
    const points = [at - 0.02, at + 0.025, at + 0.075, at + 0.12, at + 0.19].map(
      (time) => audio.getChannelData(0)[Math.round(time * 8000)],
    );
    const voices = mixer.stats.voices;
    mixer.dispose();
    return { points, pendingBeforeRender, resolved, voices };
  });
  expect(result.pendingBeforeRender).toBe(true);
  expect(result.resolved).toBe(true);
  expect(result.voices).toBe(0);
  [0.4, 0.3, 0.1, -0.3, 0].forEach((value, index) => expect(result.points[index]).toBeCloseTo(value, 3));
});
