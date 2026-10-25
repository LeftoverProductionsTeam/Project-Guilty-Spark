// Owner-authorized local import of supplied restoration candidates into the running desktop app.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes('tauri.localhost'));
if (!page) throw new Error('Guilty Spark release WebView is not running');
const call = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
const initial = await call('bootstrap');
if (initial.apiVersion !== 1) throw new Error('Unsupported desktop API');
console.log('Actual application data:', initial.dataDirectory);
const settings = {
  ...initial.settings,
  invaderDirectory: path.resolve('.local/tools/invader'),
  resourceDirectory: path.resolve('Pyros Zombie Apocolypse Mod Versions/Zombie Apocalypse/maps'),
};
await call('save_settings', { settings });
const candidates = JSON.parse(await readFile('.local/qa/candidates.json', 'utf8')).filter(
  (c) => c.kind !== 'resource/other',
);
const imported = [];
const seen = new Set();
for (const candidate of candidates) {
  try {
    const [open] = await call('import_paths', { paths: [candidate.path] });
    if (seen.has(open.project.id)) continue;
    seen.add(open.project.id);
    const p = open.project;
    const main = candidate.scenarioType === 1;
    const variant = candidate.path.includes('apocolypse_1')
      ? 'apocolypse_1'
      : candidate.version === 6
        ? 'Demo'
        : candidate.path.includes('ZAMD')
          ? 'HaloMD'
          : 'PC';
    p.title = `Zombie Apocalypse · ${variant}${main ? '' : ' menu'}`;
    p.provenance = {
      ...p.provenance,
      creator: 'Fonzie / Fonzeh',
      community: 'MacGamingMods',
      description: `Owner-supplied ${variant} restoration candidate. Actual cache version ${candidate.version}. Source title/scenario is preserved. Successful MCC conversion and gameplay have not been established.`,
      permissions:
        'Provided by the owner for local preservation and restoration testing. No redistribution or publishing was performed.',
    };
    await call('save_project', { project: p });
    imported.push({
      id: p.id,
      title: p.title,
      version: candidate.version,
      type: candidate.scenarioType,
      sha256: open.inspection.sha256,
      tags: open.inspection.tags.length,
      objects: p.scene.length,
      triangles: open.inspection.mesh.indices.length / 3,
      source: candidate.path,
    });
    console.log('Imported', p.title, 'cache', candidate.version, 'tags', open.inspection.tags.length);
  } catch (e) {
    console.log('Import blocker', candidate.path, String(e));
    imported.push({ source: candidate.path, error: String(e) });
  }
}
await writeFile('.local/qa/application-restoration-library.json', JSON.stringify(imported, null, 2));
await page.reload();
await page.getByRole('heading', { name: 'Your worlds, reimagined.' }).waitFor();
console.log('Prepared', imported.length, 'candidate projects in the actual application library.');
await browser.close();
