// Owner-supplied maps only. Connect to an explicitly started local QA desktop.
import { chromium, expect } from '@playwright/test';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
try {
  const page = browser
    .contexts()
    .flatMap((c) => c.pages())
    .find((p) => p.url().includes('tauri.localhost'));
  if (!page) throw new Error('Start the local QA desktop first');
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const call = (command, args = {}) =>
    page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), { command, args });
  const imported = JSON.parse(await readFile('.local/qa/application-restoration-library.json', 'utf8'));
  const demo = imported.find((p) => p.title === 'Zombie Apocalypse · Demo');
  if (!demo) throw new Error('Import the owner-supplied candidates first');
  const initial = await call('bootstrap');
  expect(initial.apiVersion).toBe(1);
  expect(initial.installation.halo1Installed).toBe(true);
  if (!initial.managed || !initial.installation.mccPath) throw new Error('No managed MCC Inbox');
  const inbox = path.resolve(initial.managed.inbox);
  const expectedInbox = path.resolve(initial.installation.mccPath, 'halo1/GuiltySpark/Inbox');
  expect(inbox.toLowerCase()).toBe(expectedInbox.toLowerCase());
  await call('save_settings', { settings: { ...initial.settings, autoBuild: true } });
  const hash = async (file) =>
    createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
  const inboxCopy = path.join(inbox, 'Zombie Apocalypse - restoration candidate.map');
  const resume = process.argv.includes('--resume');
  const since = resume ? '' : new Date().toISOString();
  if (!resume) await copyFile(demo.source, inboxCopy, constants.COPYFILE_EXCL);
  expect(await hash(inboxCopy)).toBe(demo.sha256);

  async function terminal(projectId, jobId, after = '') {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const state = await call('bootstrap');
      const event = state.logs.findLast(
        (e) =>
          e.projectId === projectId &&
          e.progress === 100 &&
          (!jobId || e.jobId === jobId) &&
          e.timestamp >= after,
      );
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error(`No terminal build event for ${projectId}`);
  }
  async function storedEvent(projectId) {
    const open = await call('open_project', { id: projectId });
    const record = open.project.builds.at(-1);
    if (!record) throw new Error('No saved build result for resume');
    return {
      jobId: record.id,
      projectId,
      phase: record.status,
      severity: 'error',
      message: record.message,
      progress: 100,
      timestamp: record.timestamp,
    };
  }
  const watcher = resume ? await storedEvent(demo.id) : await terminal(demo.id, null, since);
  expect(watcher.phase).toBe('failed');
  expect(watcher.message).toContain('(2 errors)');
  expect(watcher.message).toContain('scorpion.sound');
  expect(watcher.message).toContain('hill_occupied.sound');
  console.log(
    'Inbox watcher: real cache 6 deduplicated, automatic conversion correctly blocked by 2 sound errors.',
  );
  const jobs = [{ title: demo.title, ...watcher }];
  for (const candidate of imported.filter((p) => p.type === 1 && p.id !== demo.id)) {
    const id = resume ? null : await call('start_build', { id: candidate.id });
    const result = resume ? await storedEvent(candidate.id) : await terminal(candidate.id, id);
    expect(result.phase).toBe('failed');
    expect(result.message).toContain(
      candidate.title.endsWith('apocolypse_1') ? '(196 errors)' : '(237 errors)',
    );
    expect(await hash(candidate.source)).toBe(candidate.sha256);
    jobs.push({ title: candidate.title, ...result });
    console.log(`${candidate.title}: incomplete extraction rejected, source unchanged.`);
  }
  expect(await hash(demo.source)).toBe(demo.sha256);
  const readiness = await call('launch_readiness', { id: demo.id });
  expect(readiness.launchReady).toBe(false);
  expect(readiness.packageValid).toBe(false);

  await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: demo.title, exact: true }) })
    .click();
  await expect(page.locator('.viewport-label')).toContainText('Imported BSP', { timeout: 30000 });
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.viewport-status')).toContainText('5,940');
  await expect(page.getByRole('button', { name: 'Wireframe', exact: true })).toHaveClass(/active/);
  await page.locator('.object-name').first().click();
  const position = page.getByRole('spinbutton', { name: 'position 0', exact: true });
  const original = Number(await position.inputValue());
  async function near(input, value) {
    await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(value, 4);
  }
  await position.fill(String(original + 0.25));
  await position.press('Tab');
  await near(position, original + 0.25);
  await page.keyboard.press('Control+z');
  await near(position, original);
  await page.getByRole('button', { name: 'Redo (Ctrl+Shift+Z)', exact: true }).click();
  await near(position, original + 0.25);
  await page.keyboard.press('Control+z');
  await near(position, original);
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/world-editor.png' });

  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  const opened = await call('open_project', { id: demo.id });
  const weapon = opened.inspection.tags.find(
    (t) => t.class === 'weap' && t.fields.some((f) => f.kind === 'reference' && f.targetClass === 'proj'),
  );
  if (!weapon) throw new Error('No projectile-bearing weapon in the source');
  await page.getByRole('combobox', { name: 'Filter tag class', exact: true }).selectOption('weap');
  await page.getByRole('textbox', { name: 'Search tags', exact: true }).fill(weapon.path);
  await expect(page.locator('.tag-row')).toHaveCount(1);
  await page.locator('.tag-row').first().click();
  await expect(page.locator('.tag-detail-heading')).toContainText(weapon.id.toString(16).toUpperCase());
  const ready = page.getByRole('spinbutton', { name: 'Ready time', exact: true });
  await expect(ready).toBeVisible();
  const readyField = weapon.fields.find((f) => f.label === 'Ready time');
  const originalReady = readyField.value;
  await near(ready, originalReady);
  await ready.fill(String(originalReady + 0.05));
  await ready.press('Tab');
  await near(ready, originalReady + 0.05);
  await page.keyboard.press('Control+z');
  await near(ready, originalReady);
  const reference = page.locator('.property-value select').first();
  const originalReference = await reference.inputValue();
  const options = await reference.locator('option').evaluateAll((options) => options.map((o) => o.value));
  const alternate = options.find((v) => v !== originalReference);
  if (!alternate) throw new Error('No alternate projectile in the actual source');
  await reference.selectOption(alternate);
  await expect(reference).toHaveValue(alternate);
  await page.keyboard.press('Control+z');
  await expect(reference).toHaveValue(originalReference);
  await page.screenshot({ path: 'docs/screenshots/tag-editor.png' });
  await ready.fill(String(originalReady + 0.05));
  await ready.press('Tab');
  await near(ready, originalReady + 0.05);
  await page.keyboard.press('Control+s');
  await expect
    .poll(
      async () =>
        (await call('open_project', { id: demo.id })).project.tagEdits.find(
          (e) => e.tagId === weapon.id && e.fieldKey === readyField.key,
        )?.value,
    )
    .toBeCloseTo(originalReady + 0.05, 4);
  await page.reload();
  await page
    .locator('.map-card')
    .filter({ has: page.getByRole('heading', { name: demo.title, exact: true }) })
    .click();
  await expect(page.locator('.viewport-label')).toContainText('Imported BSP');
  await page.getByRole('button', { name: 'Tag editor', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter tag class', exact: true }).selectOption('weap');
  await page.getByRole('textbox', { name: 'Search tags', exact: true }).fill(weapon.path);
  await expect(page.locator('.tag-row')).toHaveCount(1);
  await page.locator('.tag-row').first().click();
  await expect(page.locator('.tag-detail-heading')).toContainText(weapon.id.toString(16).toUpperCase());
  await near(page.getByRole('spinbutton', { name: 'Ready time', exact: true }), originalReady + 0.05);
  await page.getByRole('button', { name: 'Reset Ready time', exact: true }).click();
  await page.keyboard.press('Control+s');
  await expect
    .poll(async () => (await call('open_project', { id: demo.id })).project.tagEdits.length)
    .toBe(0);
  const reopened = await call('open_project', { id: demo.id });
  expect(reopened.project.tagEdits).toHaveLength(0);
  // JSON project roundtrips normalize IEEE negative zero; transforms remain numerically identical.
  expect(JSON.stringify(reopened.project.scene)).toBe(JSON.stringify(reopened.inspection.objects));
  expect(reopened.project.builds.at(-1).status).toBe('failed');
  expect(reopened.inspection.header.version).toBe(6);
  expect(reopened.inspection.tags).toHaveLength(2825);
  await page.getByRole('button', { name: 'Build & playtest', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Launch in Steam', exact: false })).toBeDisabled();
  await expect(page.locator('.build-page')).toContainText('2 errors');
  await page.screenshot({ path: 'docs/screenshots/build-playtest.png' });
  await page.getByRole('button', { name: 'Map library', exact: false }).first().click();
  await expect(page.locator('.map-card img').first()).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/library.png' });
  expect(errors).toEqual([]);
  const checks = [
    'Real Inbox watcher and automatic extraction',
    'All distinct main candidates attempted in desktop',
    'Original hashes unchanged',
    'Unvalidated launch blocked',
    'Actual Demo collision BSP rendered',
    'Placement edit/undo/redo',
    'Weapon field edit/undo',
    'Projectile reference swap/undo',
    'Save/reload persistence',
    'Native build history and library thumbnails',
  ];
  await writeFile(
    '.local/qa/restoration-desktop.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        dataDirectory: initial.dataDirectory,
        inboxCopy,
        checks,
        jobs,
        readiness,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks: checks.length, errors }));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
