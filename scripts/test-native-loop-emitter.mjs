// Opt-in desktop + real Invader/H1A acceptance. No game audio or multiplayer claim.
import { chromium, expect as assertion } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
const expect = assertion.configure({ timeout: 60000 }),
  args = process.argv.slice(2);
if (args.length !== 6)
  throw Error(
    'test-native-loop-emitter <built Spark exe> <fresh root> <H1A kit> <owned native tags> <Invader> <owned MCC source map>',
  );
const [app, root, kit, tags, invader, sourceMap] = args.map((p) => path.resolve(p));
await fs.mkdir(root, { recursive: false });
const data = path.join(root, 'library');
await fs.mkdir(data);
const hash = async (p) =>
  crypto
    .createHash('sha256')
    .update(await fs.readFile(p))
    .digest('hex');
const receipt = {
  schemaVersion: 1,
  appSha256: await hash(app),
  mockedIpc: false,
  gameplayAudioVerified: false,
  gameReplicationVerified: false,
  complete: false,
};
const errors = [],
  server = net.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const exe = path.join(root, 'GuiltySpark-native-audio-qa.exe');
await fs.copyFile(app, exe, fs.constants.COPYFILE_EXCL);
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: data,
    WEBVIEW2_USER_DATA_FOLDER: path.join(root, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
let browser, page, call;
const report = async () => fs.writeFile(path.join(root, 'acceptance.json'), JSON.stringify(receipt, null, 2));
try {
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (r) => r.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .some((p) => p.url().includes('tauri.localhost')),
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  page.on('pageerror', (e) => errors.push(String(e)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: {
      ...boot.settings,
      onboardingCompleted: true,
      autoBuild: false,
      hekDirectory: kit,
      hekTagsDirectory: tags,
      invaderDirectory: invader,
      hekFlavor: 'h1aEk',
    },
  });
  let source = (await call('import_paths', { paths: [sourceMap] }))[0];
  source = (await call('auto_connect_sound_resources', { projectId: source.project.id })) ?? source;
  receipt.source = { sha256: source.inspection.sha256, cacheVersion: source.inspection.header.version };
  expect(await hash(sourceMap)).toBe(source.inspection.sha256);
  const candidates = source.inspection.tags
    .filter((t) => t.class === 'lsnd' && /ambien|wind/i.test(t.path))
    .slice(0, 24);
  receipt.candidates = candidates.map((t) => t.path);
  await report();
  let selected, loop, sound, sample;
  for (const tag of candidates) {
    const inspected = await call('inspect_looping_sound', { projectId: source.project.id, tagId: tag.id });
    const track = inspected.tracks.find((t) => t.loopTagId !== null);
    if (!track) continue;
    const audio = await call('inspect_sound', { projectId: source.project.id, tagId: track.loopTagId });
    const playable = audio.permutations.find((p) => p.available && p.chainStart !== false);
    if (!playable) continue;
    selected = tag;
    loop = inspected;
    sound = audio;
    sample = playable;
    break;
  }
  expect(
    selected,
    'An actual available ambient looping sound is required; no synthetic fallback',
  ).toBeTruthy();
  receipt.originalLoop = { path: selected.path, ...loop };
  const opened = await call('create_quickforge_project', {
    title: 'Native ambient loop acceptance',
    template: 'emptyArena',
    target: 'mccSteam',
  });
  const project = opened.project,
    defaults = await call('prepare_default_halo_materials', { projectId: project.id });
  project.nativeAssetImports = defaults.bindings;
  project.quickForge.materials = defaults.materials;
  project.quickForge.skyPath = 'levels/test/bloodgulch/bloodgulch';
  const emitter = {
    id: crypto.randomUUID(),
    name: 'Native ambient acceptance',
    tagId: sound.tagId,
    sourceProjectId: source.project.id,
    sourceSha256: source.inspection.sha256,
    pitchRange: sample.pitchRange,
    permutation: sample.permutation,
    followChain: true,
    event: 'ambient',
    bus: 'ambience',
    position: [2, 3, 1],
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
    loopingSource: { tagId: loop.tagId, track: loop.tracks.find((t) => t.loopTagId === sound.tagId).index },
  };
  project.audioPreview = {
    schemaVersion: 1,
    master: 0.5,
    muted: true,
    maxVoices: 24,
    buses: Object.fromEntries(
      ['ambience', 'music', 'effects', 'dialogue'].map((b) => [b, { gain: 1, muted: false, solo: false }]),
    ),
    emitters: [emitter],
  };
  await call('save_project', { project });
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: project.title, exact: true }) })
    .click();
  await expect(page.locator('.forge-viewport canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Toggle Map sounds', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Include original loop in native map', exact: true });
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeEnabled();
  const started = performance.now();
  await checkbox.click();
  await expect
    .poll(
      async () =>
        (await checkbox.isChecked())
          ? 'included'
          : ((await page.locator('.sound-mixer .notice.error').allTextContents())[0] ?? 'pending'),
      { timeout: 120000, intervals: [250, 500, 1000] },
    )
    .not.toBe('pending');
  await expect(checkbox).toBeChecked();
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        (await call('open_project', { id: project.id })).project.audioPreview.emitters[0].nativePlacement,
    )
    .toBe(true);
  let included = (await call('open_project', { id: project.id })).project;
  const binding = included.nativeAssetImports.find((b) => b.tagClass === 'lsnd' && b.tagId === loop.tagId);
  expect(binding).toBeTruthy();
  expect(included.audioPreview.muted).toBe(true);
  receipt.control = {
    elapsedMs: performance.now() - started,
    nativeLoopExplicitlyIncluded: true,
    editorMutePreserved: true,
    importedFileCount: binding.fileCount,
  };
  await page.screenshot({ path: path.join(root, 'native-loop-control.png') });
  await report();
  // One authoring action is reversible, without removing the original audition source.
  await page.getByRole('button', { name: 'Toggle Changes', exact: true }).click();
  await page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true }).focus();
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        !!(await call('open_project', { id: project.id })).project.audioPreview.emitters[0].nativePlacement,
    )
    .toBe(false);
  const undone = (await call('open_project', { id: project.id })).project;
  expect(undone.nativeAssetImports.some((b) => b.id === binding.id)).toBe(false);
  expect(undone.audioPreview.emitters[0].sourceSha256).toBe(source.inspection.sha256);
  await page.getByRole('button', { name: 'Redo (Ctrl+Y / Ctrl+Shift+Z)', exact: true }).focus();
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        !!(await call('open_project', { id: project.id })).project.audioPreview.emitters[0].nativePlacement,
    )
    .toBe(true);
  included = (await call('open_project', { id: project.id })).project;
  receipt.control.singleUndoRedo = true;
  const awaitBuild = async (job) => {
    await expect
      .poll(
        async () => {
          const r = await call('quickforge_build_report', { projectId: project.id });
          return r?.jobId === job ? r.status : 'pending';
        },
        { timeout: 240000, intervals: [1000, 1500, 2000] },
      )
      .not.toBe('pending');
    return call('quickforge_build_report', { projectId: project.id });
  };
  const buildStarted = performance.now();
  const build = await awaitBuild(await call('quickforge_build', { projectId: project.id }));
  receipt.build = { ...build, elapsedMs: performance.now() - buildStarted };
  await report();
  expect(build.status).toBe('validated');
  const rebuilt = (await call('import_paths', { paths: [build.build.output] }))[0];
  const ssce = rebuilt.inspection.tags.find(
    (t) =>
      t.class === 'ssce' &&
      t.path.replaceAll('\\', '/').startsWith(`spark/audio/${project.id.replaceAll('-', '')}/`),
  );
  expect(ssce).toBeTruthy();
  const nativeLoop = rebuilt.inspection.tags.find(
    (t) => t.class === 'lsnd' && t.path.replaceAll('\\', '/') === binding.nativePath,
  );
  expect(nativeLoop).toBeTruthy();
  expect(ssce.references.some((r) => r.targetId === nativeLoop.id && r.class === 'lsnd')).toBe(true);
  const placed = rebuilt.inspection.objects.filter((o) => o.kind === 'Sound scenery' && o.tagId === ssce.id);
  expect(placed).toHaveLength(1);
  expect(placed[0].position).toEqual(emitter.position);
  const compiledLoop = await call('inspect_looping_sound', {
    projectId: rebuilt.project.id,
    tagId: nativeLoop.id,
  });
  expect(compiledLoop.loops).toBe(loop.loops);
  expect(compiledLoop.tracks.length).toBe(loop.tracks.length);
  for (let i = 0; i < loop.tracks.length; i++)
    for (const key of ['gain', 'fadeInSeconds', 'fadeOutSeconds'])
      expect(compiledLoop.tracks[i][key]).toBeCloseTo(loop.tracks[i][key], 5);
  const dependencySamples = [];
  for (const ref of selected.references.filter((r) => r.class === 'snd!')) {
    if (dependencySamples.some((row) => row.sourceTagId === ref.targetId)) continue;
    const original = await call('inspect_sound', { projectId: source.project.id, tagId: ref.targetId });
    const originalTag = source.inspection.tags.find((t) => t.id === ref.targetId);
    const expected = `${binding.nativePath.split('/')[0]}/${originalTag.path.replaceAll('\\', '/')}`;
    const compiledTag = rebuilt.inspection.tags.find(
      (t) => t.class === 'snd!' && t.path.replaceAll('\\', '/') === expected,
    );
    expect(compiledTag).toBeTruthy();
    const actual = await call('inspect_sound', { projectId: rebuilt.project.id, tagId: compiledTag.id });
    expect(actual.permutations.length).toBe(original.permutations.length);
    for (let i = 0; i < original.permutations.length; i++) {
      const before = original.permutations[i],
        after = actual.permutations[i];
      expect(before.available && after.available).toBe(true);
      for (const key of [
        'pitchRange',
        'permutation',
        'name',
        'nextPermutation',
        'format',
        'channels',
        'sampleRate',
        'byteLength',
        'sha256',
      ])
        expect(after[key]).toEqual(before[key]);
    }
    dependencySamples.push({
      sourceTagId: ref.targetId,
      sourcePath: originalTag.path,
      compiledPath: compiledTag.path,
      permutations: actual.permutations.map((p) => ({
        pitchRange: p.pitchRange,
        permutation: p.permutation,
        sha256: p.sha256,
        bytes: p.byteLength,
      })),
    });
  }
  receipt.sourceExactCompiledSamples = dependencySamples;
  const actualTrack = compiledLoop.tracks.find((t) => t.loopTagId !== null);
  const compiledSound = await call('inspect_sound', {
    projectId: rebuilt.project.id,
    tagId: actualTrack.loopTagId,
  });
  const compiledSample = compiledSound.permutations.find((p) => p.available && p.chainStart !== false);
  expect(compiledSample).toBeTruthy();
  const preview = await call('preview_sound', {
    projectId: rebuilt.project.id,
    tagId: actualTrack.loopTagId,
    pitchRange: compiledSample.pitchRange,
    permutation: compiledSample.permutation,
  });
  const decoded = await page.evaluate(async (preview) => {
    const c = new AudioContext();
    try {
      const data = new Uint8Array(preview.bytes);
      const buffer = await c.decodeAudioData(data.buffer);
      let energy = 0;
      const values = buffer.getChannelData(0);
      for (const v of values) energy += v * v;
      return {
        frames: buffer.length,
        channels: buffer.numberOfChannels,
        sampleRate: buffer.sampleRate,
        durationSeconds: buffer.duration,
        rms: Math.sqrt(energy / values.length),
      };
    } finally {
      await c.close();
    }
  }, preview);
  expect(decoded.frames).toBeGreaterThan(0);
  expect(decoded.rms).toBeGreaterThan(0);
  receipt.compiled = {
    sha256: rebuilt.inspection.sha256,
    sceneryPath: ssce.path,
    loopPath: nativeLoop.path,
    position: placed[0].position,
    wholeLoopPreserved: true,
    decoded,
  };
  const generated = JSON.parse(
    await fs.readFile(path.join(build.sources.directory, 'native-audio.json'), 'utf8'),
  );
  expect(generated).toHaveLength(1);
  const inputHashes = JSON.parse(
    await fs.readFile(path.join(data, 'jobs', build.jobId, 'input-tags.json'), 'utf8'),
  );
  for (const [relative, expected] of Object.entries(inputHashes))
    expect(await hash(path.join(tags, relative))).toBe(expected);
  receipt.ownerNativeFilesPreserved = Object.keys(inputHashes).length;
  // A deliberate local corruption must be refused, never blamed on an external tool.
  const importRoot = path.join(data, 'asset-imports', project.id, binding.id),
    importReceipt = JSON.parse(await fs.readFile(path.join(importRoot, 'import.json'), 'utf8'));
  receipt.bankRecovery = JSON.parse(
    await fs.readFile(
      path.join(data, 'tag-exchanges', importReceipt.extractionJobId, 'mcc-audio-extraction.json'),
      'utf8',
    ),
  );
  const file = importReceipt.files.find((f) => f.path === `${binding.nativePath}.sound_looping`);
  expect(file).toBeTruthy();
  const filePath = path.join(importRoot, 'tags', file.path),
    original = await fs.readFile(filePath),
    damaged = Buffer.from(original);
  damaged[63] ^= 1;
  await fs.writeFile(filePath, damaged);
  try {
    const refused = await awaitBuild(await call('quickforge_build', { projectId: project.id }));
    expect(refused.status).toBe('failed');
    expect(refused.blockers.join(' ')).toMatch(/changed|incomplete/i);
    receipt.deliberateManagedImportCorruption = {
      rejected: true,
      blockers: refused.blockers,
      attributedTool: null,
    };
  } finally {
    await fs.writeFile(filePath, original);
  }
  expect(await hash(filePath)).toBe(file.sha256);
  expect(await hash(build.build.output)).toBe(rebuilt.inspection.sha256);
  expect(await hash(sourceMap)).toBe(source.inspection.sha256);
  receipt.sourcePreserved = true;
  receipt.previousAcceptedBuildPreserved = true;
  expect(errors).toEqual([]);
  receipt.complete = true;
} catch (error) {
  receipt.error = String(error);
  if (page) {
    receipt.visibleNotices = await page
      .locator('.notice')
      .allTextContents()
      .catch(() => []);
    await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  }
  throw error;
} finally {
  receipt.pageErrors = errors;
  await report();
  if (browser) await browser.close();
  if (child.exitCode === null) child.kill();
}
