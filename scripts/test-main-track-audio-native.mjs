// Opt-in native main-track import/save/undo plus production audio rendering over owned source bytes.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { build } from 'vite';
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 45000 }),
  args = new Map();
for (let at = 2; at < process.argv.length; at += 2) {
  if (
    !['--app', '--output', '--map'].includes(process.argv[at]) ||
    !process.argv[at + 1] ||
    args.has(process.argv[at])
  )
    throw Error('Use unique named paths');
  args.set(process.argv[at], process.argv[at + 1]);
}
if (args.size !== 3)
  throw Error('Required: --app built.exe --output fresh-directory --map owned-bloodgulch.map');
const output = path.resolve(args.get('--output')),
  source = path.resolve(args.get('--map')),
  hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
await fs.mkdir(output);
const executable = path.join(output, 'GuiltySpark-main-tracks-qa.exe');
await fs.copyFile(path.resolve(args.get('--app')), executable, fs.constants.COPYFILE_EXCL);
const before = hash(await fs.readFile(source));
await build({
  configFile: false,
  logLevel: 'error',
  build: {
    outDir: path.join(output, 'probe'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve('scripts/native-main-track-audio-probe.mjs'),
      name: 'SparkMainTracksProbe',
      formats: ['iife'],
      fileName: () => 'probe.js',
    },
  },
});
const server = net.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
const child = spawn(executable, [], {
  windowsHide: true,
  stdio: 'ignore',
  env: {
    ...process.env,
    GUILTY_SPARK_DATA_DIR: path.join(output, 'library'),
    WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview'),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
await fs.writeFile(path.join(output, 'process.json'), JSON.stringify({ pid: child.pid, port }));
let browser, page;
const receipt = {
  schemaVersion: 1,
  appSha256: hash(await fs.readFile(executable)),
  sourceSha256: before,
  errors: [],
  checks: {},
};
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
  page.on('pageerror', (error) => receipt.errors.push(String(error)));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const boot = await call('bootstrap');
  await call('save_settings', {
    settings: { ...boot.settings, onboardingCompleted: true, autoBuild: false, preferredHalo: 'mccSteam' },
  });
  const opened = (await call('import_paths', { paths: [source] }))[0];
  expect(opened.inspection.sha256).toBe(before);
  await call('claim_project_document', { id: opened.project.id });
  const tag = opened.inspection.tags.find(
    (tag) => tag.class === 'lsnd' && /warthog_7_engine$/i.test(tag.path),
  );
  if (!tag) throw Error('Use an owned map containing its actual two-track Warthog engine sound.');
  const loop = await call('inspect_looping_sound', { projectId: opened.project.id, tagId: tag.id });
  const tracks = loop.tracks.filter((track) => track.loopTagId !== null);
  expect(tracks.length).toBeGreaterThan(1);
  await call('save_project', { project: { ...opened.project, title: 'Main-track audio QA' } });
  await page.evaluate(
    ({ id, tag }) =>
      localStorage.setItem(
        'guilty-spark-map-session-v1:' + id,
        JSON.stringify({
          'editor-sound.muted': true,
          'map-sounds.query': 'warthog_7_engine',
          'map-sounds.tag': String(tag),
          'layout.level': {
            version: 1,
            focus: false,
            panels: {
              'map-sounds': {
                open: true,
                dock: 'right',
                width: 460,
                height: 600,
                x: 40,
                y: 40,
                pinned: false,
              },
            },
          },
        }),
      ),
    { id: opened.project.id, tag: tag.id },
  );
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: 'Main-track audio QA', exact: true }) })
    .click();
  const navigation = page.locator('.gs-navigation-drawer');
  await page.getByRole('button', { name: 'Toggle workspace navigation', exact: true }).click();
  await navigation.getByRole('button', { name: 'Level editor', exact: true }).click();
  let audioResources;
  await expect
    .poll(async () => {
      audioResources = (await call('open_project', { id: opened.project.id })).project.source.audioResources;
      return audioResources?.kind;
    })
    .toBe('mccClassicAdpcm');
  receipt.checks.automaticResources = {
    kind: audioResources.kind,
    sha256: audioResources.sha256,
    noFolderPicker: true,
  };
  await expect(page.getByRole('button', { name: 'Add all source tracks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add all source tracks', exact: true }).click();
  const choices = page.getByRole('combobox', { name: 'Map sound emitter', exact: true });
  await expect(choices.locator('option')).toHaveCount(tracks.length);
  await page.keyboard.press('Control+z');
  await expect(choices).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(choices.locator('option')).toHaveCount(tracks.length);
  await page.keyboard.press('Control+s');
  let saved;
  await expect
    .poll(async () => {
      saved = (await call('open_project', { id: opened.project.id })).project;
      return saved.audioPreview?.emitters.length;
    })
    .toBe(tracks.length);
  expect(saved.audioPreview.emitters.map((e) => [e.tagId, e.loopingSource.track, e.gain])).toEqual(
    tracks.map((t) => [t.loopTagId, t.index, t.gain]),
  );
  expect(saved.tagEdits).toEqual(opened.project.tagEdits);
  expect(JSON.parse(JSON.stringify(saved.scene))).toEqual(JSON.parse(JSON.stringify(opened.project.scene)));
  receipt.checks.group = {
    loopTagId: tag.id,
    sourceTracks: tracks.map((t) => ({ index: t.index, tagId: t.loopTagId, gain: t.gain })),
    savedTracks: saved.audioPreview.emitters.length,
    undoRedoAtomic: true,
    sourceSceneAndTagsUnchanged: true,
  };
  const panel = page.locator('[data-panel-id="map-sounds"]');
  await panel.getByLabel('Map sounds drawer options', { exact: true }).click();
  for (const width of [280, 360, 520]) {
    await panel.getByRole('slider', { name: 'Map sounds size', exact: true }).fill(String(width));
    for (const bus of ['ambience', 'music', 'effects', 'dialogue']) {
      const group = panel.getByRole('group', { name: bus, exact: true });
      const a = await group.getByRole('checkbox', { name: 'Mute', exact: true }).locator('..').boundingBox();
      const b = await group.getByRole('checkbox', { name: 'Solo', exact: true }).locator('..').boundingBox();
      expect(a.x + a.width + 6 <= b.x || a.y + a.height <= b.y).toBe(true);
      const bounds = await group.boundingBox();
      const input = await group.getByRole('spinbutton', { name: `${bus} bus volume`, exact: true }).boundingBox();
      expect(input.x).toBeGreaterThanOrEqual(bounds.x);
      expect(input.x + input.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    await expect(panel.getByText('Master volume', { exact: true })).toBeVisible();
    await expect(panel.getByText('Voice limit', { exact: true })).toBeVisible();
  }
  await panel.getByLabel('Map sounds drawer options', { exact: true }).click();
  receipt.checks.soundLayout = { widths: [280, 360, 520], muteSoloSeparated: true, labelsVisible: true };
  await page.screenshot({ path: path.join(output, 'main-track-import.png') });
  await panel.getByLabel('Map sounds drawer options', { exact: true }).click();
  await panel.getByRole('slider', { name: 'Map sounds size', exact: true }).fill('360');
  await panel.getByLabel('Map sounds drawer options', { exact: true }).click();
  await panel.locator('.sound-buses').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, 'sound-controls-360.png') });
  const probe = await fs.readFile(path.join(output, 'probe/probe.js'), 'utf8');
  await page.evaluate((script) => (0, eval)(script), probe);
  receipt.checks.productionAudio = await page.evaluate(
    (source) => window.SparkMainTracksProbe.verify({ source }),
    {
      projectId: opened.project.id,
      sha256: before,
      tagId: tag.id,
      name: 'Warthog engine',
    },
  );
  expect(hash(await fs.readFile(source))).toBe(before);
  expect(receipt.errors).toEqual([]);
  receipt.inputsUnchanged = true;
  receipt.limitations = [
    'No Halo process, game-memory writes, physical listening or native vehicle sound-function modulation acceptance.',
    'Production audio is independently rendered in WebView2 OfflineAudioContext; saved track import is exercised through the native UI.',
    'Automatic BSP multitrack selection and stale-zone handling have separate source-bound unit coverage; this map UI trial imports the real Warthog loop.',
  ];
  await fs.writeFile(path.join(output, 'native-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(
    path.join(output, 'failure.json'),
    JSON.stringify({ error: String(error), receipt }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  child.kill();
}
