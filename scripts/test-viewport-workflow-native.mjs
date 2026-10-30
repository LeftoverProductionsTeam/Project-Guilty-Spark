// Opt-in checks of the compiled desktop, real owned map imports and browser-rendered audio.
// Uses a fresh library/profile. Does not launch Halo or write to an installed map/SDK.
import { chromium, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
const expect = baseExpect.configure({ timeout: 45000 });
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (
    !['--app', '--output', '--map', '--donor', '--ambience', '--audio-mode'].includes(key) ||
    !process.argv[i + 1] ||
    options.has(key)
  )
    throw Error('Use unique named arguments');
  options.set(key, key === '--audio-mode' ? process.argv[i + 1] : path.resolve(process.argv[i + 1]));
}
if (
  ![5, 6].includes(options.size) ||
  ['--app', '--output', '--map', '--donor', '--ambience'].some((key) => !options.has(key)) ||
  (options.has('--audio-mode') && !['focused', 'offline'].includes(options.get('--audio-mode')))
)
  throw Error(
    'Required: --app built.exe --output fresh-directory --map owned.map --donor owned.map --ambience owned-compiled-audio.map',
  );
const focusedAudio = options.get('--audio-mode') !== 'offline';
const output = options.get('--output'),
  data = path.join(output, 'library'),
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(output);
const exe = path.join(output, 'GuiltySpark-viewport-qa.exe');
await fs.copyFile(options.get('--app'), exe, fs.constants.COPYFILE_EXCL);
const inputs = await Promise.all(
  ['--map', '--donor', '--ambience'].map(async (key) => ({
    path: options.get(key),
    sha256: hash(await fs.readFile(options.get(key))),
  })),
);
const wave = Buffer.alloc(44 + 48000 * 2);
wave.write('RIFF');
wave.writeUInt32LE(wave.length - 8, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(48000, 24);
wave.writeUInt32LE(96000, 28);
wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(96000, 40);
for (let i = 0; i < 48000; i++)
  wave.writeInt16LE(Math.round(Math.sin((i / 48000) * Math.PI * 2 * 440) * 6553), 44 + i * 2);
const wav = path.join(output, 'owned-440hz.wav'),
  obj = path.join(output, 'owned-tetrahedron.obj');
await fs.writeFile(wav, wave, { flag: 'wx' });
await fs.writeFile(obj, 'v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n', {
  flag: 'wx',
});
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(exe, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: data,
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
await fs.writeFile(
  path.join(output, 'owned-process.json'),
  JSON.stringify({ pid: child.pid, port }, null, 2),
);
let browser, page, call;
const errors = [],
  receipt = {
    schemaVersion: 1,
    kind: 'native-desktop-viewport-and-editor-audio',
    appSha256: hash(await fs.readFile(exe)),
    inputs,
    checks: {},
    limitations: [
      'No Halo process, game memory, retail game loading, physical file chooser or audio-device listening acceptance.',
      'Imported-cache model additions and custom meshes remain previews until native model/scenario compilation supports them.',
    ],
  };
try {
  await expect
    .poll(() =>
      fetch(`http://127.0.0.1:${port}/json/version`).then(
        (response) => response.ok,
        () => false,
      ),
    )
    .toBe(true);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await expect
    .poll(() =>
      browser
        .contexts()
        .flatMap((context) => context.pages())
        .some((tab) => tab.url().includes('tauri.localhost')),
    )
    .toBe(true);
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((tab) => tab.url().includes('tauri.localhost'));
  page.setDefaultTimeout(45000);
  page.on('pageerror', (error) => errors.push(String(error)));
  call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false, preferredHalo: 'mccSteam' },
  });
  const opened = await call('import_paths', { paths: inputs.map((input) => input.path) });
  if (opened.length !== 3) throw Error('Three actual map inputs must import');
  const [base, donor, ambient] = opened;
  for (const [entry, title] of [
    [base, 'Native viewport base'],
    [donor, 'Native viewport donor'],
    [ambient, 'Native ambience route'],
  ]) {
    await call('claim_project_document', { id: entry.project.id });
    entry.project.title = title;
    await call('save_project', { project: entry.project });
  }
  const imported = await call('import_custom_sound', { projectId: base.project.id, path: wav });
  expect(imported.asset.kind).toBe('custom-sound');
  const importedModel = await call('import_asset', { id: base.project.id, path: obj });
  expect(importedModel.asset.kind).toBe('obj');
  const p = importedModel.project,
    asset = imported.asset;
  const emitter = {
    id: crypto.randomUUID(),
    name: 'Owned 440 Hz acceptance loop',
    tagId: 0,
    sourceProjectId: p.id,
    sourceSha256: asset.sha256,
    pitchRange: 0,
    permutation: 0,
    followChain: true,
    event: 'ambient',
    bus: 'ambience',
    position: [0, 0, 0],
    gain: 1,
    pitch: 0,
    loop: true,
    enabled: true,
    minDistance: 1,
    maxDistance: 40,
    rolloff: 1,
    priority: 50,
    cooldownMs: 100,
    spatial: false,
    customSound: { assetId: asset.id, sha256: asset.sha256 },
  };
  const bus = { gain: 1, muted: false, solo: false };
  p.audioPreview = {
    schemaVersion: 1,
    master: 0.5,
    muted: false,
    maxVoices: 24,
    buses: { ambience: bus, music: bus, effects: bus, dialogue: bus },
    emitters: [emitter],
  };
  await call('save_project', { project: p });
  const preview = await call('preview_custom_sound', {
    projectId: p.id,
    assetId: asset.id,
    sha256: asset.sha256,
  });
  expect(hash(Buffer.from(preview.base64, 'base64'))).toBe(hash(wave));
  receipt.checks.customImport = {
    soundSha256: asset.sha256,
    modelSha256: importedModel.asset.sha256,
    channels: preview.info.channels,
    sampleRate: preview.info.sampleRate,
    durationSeconds: preview.info.durationSeconds,
  };
  await page.reload();
  async function chooseTool(name) {
    const drawer = page.locator('.gs-navigation-drawer');
    if (!(await drawer.isVisible()))
      await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
    await drawer.getByRole('button', { name, exact: true }).click();
  }
  async function openCard(title) {
    await chooseTool('Map library');
    await page
      .locator('.map-card')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .click();
    await expect(page.getByTestId('viewport').locator('canvas')).toBeVisible();
    await call('plugin:window|set_focus', { label: 'main' });
  }
  const meter = page.getByLabel('Map sound activity', { exact: true }),
    volume = page.getByLabel('Map sound volume', { exact: true });
  await openCard('Native ambience route');
  await expect(page.getByRole('button', { name: 'Window', exact: true })).toHaveCount(0);
  const topBar = page.locator('#gs-window-header');
  await expect(topBar).toBeVisible();
  const topHeight = (await topBar.boundingBox()).height;
  expect(topHeight).toBeLessThanOrEqual(40);
  await expect(topBar.getByRole('tablist',{name:'Open maps',exact:true})).toBeVisible();
  receipt.checks.topBar = { height: topHeight, noWindowLauncher: true, combinedMapTabs: true };
  const ambience = await call('inspect_map_ambience', { projectId: ambient.project.id });
  await fs.writeFile(path.join(output, 'native-ambience-tree.json'), JSON.stringify(ambience));
  const bsp = ambience.bsps[0];
  expect(bsp.listenerTree?.nodes.length).toBeGreaterThan(0);
  expect(bsp.listenerTree?.leafClusters.length).toBeGreaterThan(0);
  receipt.checks.nativeFocus = await call('plugin:window|is_focused', { label: 'main' });
  async function renderAudio(bytes, gain) {
    return page.evaluate(
      async ({ bytes, gain }) => {
        const context = new OfflineAudioContext(1, 48000, 48000),
          buffer = await context.decodeAudioData(Uint8Array.from(bytes).buffer),
          source = context.createBufferSource(),
          level = context.createGain();
        source.buffer = buffer;
        source.loop = true;
        level.gain.value = gain;
        source.connect(level);
        level.connect(context.destination);
        source.start();
        const rendered = await context.startRendering(),
          samples = rendered.getChannelData(0);
        return {
          channels: buffer.numberOfChannels,
          duration: buffer.duration,
          rms: Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length),
        };
      },
      { bytes, gain },
    );
  }
  if (focusedAudio) {
    console.log(
      'Ready for the focused audio test. Click the Spark map window and leave it focused for one minute.',
    );
    await expect
      .poll(() => call('plugin:window|is_focused', { label: 'main' }), {
        timeout: 120000,
        intervals: [250, 500],
      })
      .toBe(true);
    receipt.checks.nativeFocus = true;
    await expect.poll(async () => Number(await meter.getAttribute('data-voices'))).toBeGreaterThan(0);
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeGreaterThan(0.0001);
  } else {
    receipt.limitations.push(
      'Native foreground activation was unavailable. Focused automatic playback and physical listening remain unaccepted; source decoding/gains are independently rendered in WebView2 OfflineAudioContext.',
    );
    const background = bsp.backgroundPalette.find((value) => value.tagPath),
      tag = ambient.inspection.tags.find(
        (value) =>
          value.class === 'lsnd' &&
          value.path.replaceAll('\\', '/').toLowerCase() ===
            background.tagPath.replaceAll('\\', '/').toLowerCase(),
      );
    const loop = await call('inspect_looping_sound', { projectId: ambient.project.id, tagId: tag.id }),
      track = loop.tracks.find((value) => value.loopTagId !== null),
      report = await call('inspect_sound', { projectId: ambient.project.id, tagId: track.loopTagId }),
      sample = report.permutations.find((value) => value.available && value.chainStart !== false);
    if (!sample) throw Error('The assigned loop needs an available real sample');
    const payload = await call('preview_sound', {
      projectId: ambient.project.id,
      tagId: track.loopTagId,
      pitchRange: sample.pitchRange,
      permutation: sample.permutation,
    });
    expect(payload.sourceSha256).toBe(ambience.sourceSha256);
    expect(hash(Buffer.from(payload.bytes))).toBe(payload.sha256);
    const rendered = await renderAudio(payload.bytes, 0.5 * 0.35 * track.gain);
    expect(rendered.rms).toBeGreaterThan(0);
    receipt.checks.independentAuthoredAudio = {
      kind: 'native-preview-bytes-WebView2-OfflineAudioContext',
      tagId: tag.id,
      loopTagId: track.loopTagId,
      sampleSha256: payload.sha256,
      ...rendered,
    };
  }
  receipt.checks.authoredAmbience = {
    mapSha256: ambience.sourceSha256,
    bsp: bsp.tagPath,
    clusters: bsp.clusters.length,
    partitionNodes: bsp.listenerTree.nodes.length,
    partitionLeaves: bsp.listenerTree.leafClusters.length,
    assignedBackgrounds: bsp.clusters.filter((cluster) => cluster.background !== null).length,
    voices: Number(await meter.getAttribute('data-voices')),
    rms: Number(await meter.getAttribute('data-rms')),
  };
  console.log(
    focusedAudio
      ? 'Real BSP ambience is playing through the native editor.'
      : 'Assigned native sound bytes decode and render; focused automatic playback remains unaccepted.',
  );
  await page.screenshot({ path: path.join(output, 'native-authored-ambience.png') });
  await openCard('Native viewport donor');
  await openCard('Native viewport base');
  if (focusedAudio) {
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeGreaterThan(0.005);
    await volume.fill('0.8');
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeGreaterThan(0.05);
    const loud = Number(await meter.getAttribute('data-rms'));
    await volume.fill('0.2');
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeLessThan(loud * 0.4);
    const quiet = Number(await meter.getAttribute('data-rms'));
    expect(quiet).toBeGreaterThan(0.003);
    await page.getByRole('button', { name: 'Mute map sounds', exact: true }).click();
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBe(0);
    await page.getByRole('button', { name: 'Unmute map sounds', exact: true }).click();
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeGreaterThan(0.003);
    receipt.checks.actualAudioMix = {
      loudRms: loud,
      quietRms: quiet,
      ratio: quiet / loud,
      muteRms: 0,
      voices: Number(await meter.getAttribute('data-voices')),
    };
  } else {
    const bytes = [...Buffer.from(preview.base64, 'base64')],
      loud = await renderAudio(bytes, 0.5 * 0.8),
      quiet = await renderAudio(bytes, 0.5 * 0.2),
      muted = await renderAudio(bytes, 0);
    expect(quiet.rms / loud.rms).toBeCloseTo(0.25, 5);
    expect(muted.rms).toBe(0);
    await volume.fill('0.8');
    await expect(volume).toHaveValue('0.8');
    await volume.fill('0.2');
    await page.getByRole('button', { name: 'Mute map sounds', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unmute map sounds', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Unmute map sounds', exact: true }).click();
    receipt.checks.independentCustomAudio = {
      kind: 'imported-native-bytes-WebView2-OfflineAudioContext',
      loudRms: loud.rms,
      quietRms: quiet.rms,
      ratio: quiet.rms / loud.rms,
      muteRms: muted.rms,
    };
    receipt.checks.compactMuteVolumeUi = true;
  }
  const viewport = page.getByTestId('viewport'),
    before = await viewport.boundingBox();
  await page.getByRole('button', { name: 'Toggle Asset library', exact: true }).click();
  const library = page.getByRole('region', { name: 'Asset library panel', exact: true });
  await library.getByLabel('Asset library map', { exact: true }).selectOption(donor.project.id);
  await library.getByLabel('Search loaded assets', { exact: true }).fill('pistol');
  const nativeModel = donor.inspection.tags.find(
    (tag) => tag.class === 'weap' && /weapons[\\/]pistol[\\/]pistol$/i.test(tag.path),
  );
  if (!nativeModel) throw Error('Owned donor pistol tag is required');
  const source = library
      .getByRole('button', { name: 'Add pistol at view', exact: true })
      .filter({ has: page.getByText(nativeModel.path, { exact: true }) }),
    rect = await source.boundingBox(),
    view = await viewport.boundingBox();
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(view.x + view.width * 0.7, view.y + view.height * 0.55, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator('.viewport-object-actions strong')).toHaveText('pistol');
  const sourceGeometry = await call('preview_owned_object_model', {
    projectId: donor.project.id,
    tagId: nativeModel.id,
    sourceSha256: donor.inspection.sha256,
  });
  expect(sourceGeometry.sourceSha256).toBe(donor.inspection.sha256);
  expect(sourceGeometry.objectTagId).toBe(nativeModel.id);
  expect(sourceGeometry.mesh.indices.length).toBeGreaterThan(0);
  receipt.checks.sourceModelGeometry = {
    objectTagId: sourceGeometry.objectTagId,
    modelTagId: sourceGeometry.modelTagId,
    triangles: sourceGeometry.mesh.indices.length / 3,
  };
  await page.getByRole('button', { name: 'Close Asset library', exact: true }).click();
  await page
    .locator('.viewport-object-actions')
    .getByRole('button', { name: 'Object tags', exact: true })
    .click();
  const tags = page.getByRole('region', { name: 'Object tags panel', exact: true });
  await expect(tags).toContainText('Native viewport donor');
  expect(await viewport.boundingBox()).toEqual(before);
  const field = tags.locator('input[type="number"]').first();
  const initial = Number(await field.inputValue());
  const changed = initial === 0.25 ? 0.3 : 0.25;
  await field.fill(String(changed));
  await field.press('Enter');
  await page.getByRole('button', { name: 'Save tag changes', exact: true }).click();
  const editedDonor = (await call('open_project', { id: donor.project.id })).project;
  expect(editedDonor.tagEdits.length).toBeGreaterThan(0);
  await field.focus();
  await page.keyboard.press('Control+z');
  await expect(field).toHaveValue(String(initial));
  await field.focus();
  await page.keyboard.press('Control+y');
  await expect(field).toHaveValue(String(changed));
  await page.getByRole('button', { name: 'Close Object tags', exact: true }).click();
  if (focusedAudio)
    await expect.poll(async () => Number(await meter.getAttribute('data-rms'))).toBeGreaterThan(0.003);
  await page.getByRole('button', { name: 'Toggle Object tags', exact: true }).click();
  await expect(field).toHaveValue(String(changed));
  expect(await viewport.boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Close Object tags', exact: true }).click();
  await page.keyboard.press('Control+s');
  await expect
    .poll(async () => {
      const value = (await call('open_project', { id: base.project.id })).project;
      return value.scene.some((object) => object.sourceModel?.projectId === donor.project.id);
    })
    .toBe(true);
  const saved = (await call('open_project', { id: base.project.id })).project;
  const added = saved.scene.find((object) => object.sourceModel?.projectId === donor.project.id);
  expect(added.sourceModel.sourceSha256).toBe(donor.inspection.sha256);
  expect(added.sourceModel.tagId).toBe(nativeModel.id);
  receipt.checks.viewportEditing = {
    crossMapPointerDrop: true,
    sourceTagId: nativeModel.id,
    sourceSha256: donor.inspection.sha256,
    modelPreviewSaved: true,
    tagSourceUndoRedo: true,
    tagDrawerHideReopen: true,
    viewportUnchanged: true,
    audioContinuesThroughDrawers: focusedAudio ? true : null,
  };
  await page.screenshot({ path: path.join(output, 'native-viewport-drawer.png') });
  await call('plugin:window|maximize', { label: 'main' });
  await expect.poll(() => call('plugin:window|is_maximized', { label: 'main' })).toBe(true);
  await page.keyboard.press('F11');
  await expect.poll(() => call('plugin:window|is_fullscreen', { label: 'main' })).toBe(true);
  const compactHeight = (
    await page.getByRole('navigation', { name: 'Workspace panels', exact: true }).boundingBox()
  ).height;
  expect(compactHeight).toBeLessThanOrEqual(32);
  receipt.checks.fullscreenStrip = { height: compactHeight };
  await expect(volume).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Close window', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Toggle Object tags', exact: true }).click();
  await expect(tags).toBeVisible();
  await page.screenshot({ path: path.join(output, 'native-fullscreen-tags-audio.png') });
  await page.keyboard.press('Escape');
  await expect(tags).toBeHidden();
  await page.keyboard.press('Escape');
  await expect.poll(() => call('plugin:window|is_fullscreen', { label: 'main' })).toBe(false);
  await expect.poll(() => call('plugin:window|is_maximized', { label: 'main' })).toBe(true);
  receipt.checks.window = {
    maximizeFullscreenRestore: true,
    oneCloseControl: true,
    audioControlsReachable: true,
  };
  expect(hash(await fs.readFile(wav))).toBe(hash(wave));
  for (const input of inputs) expect(hash(await fs.readFile(input.path))).toBe(input.sha256);
  receipt.inputsUnchanged = true;
  receipt.pageErrors = errors;
  expect(errors).toEqual([]);
  await fs.writeFile(path.join(output, 'native-verification.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt.checks, null, 2));
} catch (error) {
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    await fs.writeFile(
      path.join(output, 'failure-state.txt'),
      await page
        .locator('body')
        .innerText()
        .catch(() => ''),
    );
  }
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), pageErrors: errors, partial: receipt }, null, 2),
  );
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
